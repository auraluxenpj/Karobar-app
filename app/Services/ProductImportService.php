<?php

namespace App\Services;

use App\Models\Formulation;
use App\Models\Product;
use App\Models\Category;
use App\Models\Brand;
use App\Models\Supplier;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ProductImportService
{
    public const PREVIEW_INVALID_LIMIT = 20;
    public const PREVIEW_VALID_LIMIT   = 10;
    public const CHUNK_SIZE            = 1000;

    private string $disk = 'local';

    /**
     * Header aliases -> canonical names
     */
    private array $aliases = [
        'product_code'         => ['product_code','code','sku','productcode','prod_code'],
        'name'                 => ['name','product','product_name','title'],
        'formulation'          => ['formulation','formula'],
        'description'          => ['description','desc','details'],
        'pack_size'            => ['pack_size','units_per_pack','units','uom_qty','pack'],
        'quantity'             => ['quantity','qty','stock','onhand'],
        'pack_purchase_price'  => ['pack_purchase_price','ppp','purchase_price_pack','pack_cost'],
        'pack_sale_price'      => ['pack_sale_price','psp','sale_price_pack'],
        'unit_purchase_price'  => ['unit_purchase_price','upp','purchase_price_unit','unit_cost','cost'],
        'unit_sale_price'      => ['unit_sale_price','usp','sale_price_unit','unit_price','price'],
        'avg_price'            => ['avg_price','average_price','weighted_avg','wac','wa_cost'],
        'margin'               => ['margin','gross_margin_pct'],
        'narcotic'             => ['narcotic','is_narcotic','controlled'],
        'max_discount'         => ['max_discount','maxdisc','max_discount_pct'],
        'category_id'          => ['category_id','cat_id'],
        'brand_id'             => ['brand_id'],
        'supplier_id'          => ['supplier_id','vendor_id'],
        'category'             => ['category','category_name','cat','cat_name'],
        'brand'                => ['brand','brand_name'],
        'supplier'             => ['supplier','supplier_name','vendor','vendor_name'],
        'rack'                 => ['rack','shelf','bin'],
        'barcode'              => ['barcode','ean','upc'],
    ];

    public function storeUploaded(UploadedFile $file): array
    {
        $ext = strtolower($file->getClientOriginalExtension() ?: 'csv');
        if (!in_array($ext, ['csv','txt'], true)) {
            throw new \RuntimeException('Only CSV files are supported.');
        }

        $token    = (string) Str::uuid();
        $dir      = 'imports/products';
        $filename = "{$token}.csv";

        Storage::disk($this->disk)->makeDirectory($dir);
        Storage::disk($this->disk)->putFileAs($dir, $file, $filename);

        return [
            'token' => $token,
            'path'  => Storage::disk($this->disk)->path("{$dir}/{$filename}"),
        ];
    }

    // ---------- VALIDATE ----------

    /**
     * @return array Validation summary + sample rows
     */
    public function validateCsv(string $absolutePath, string $delimiter = ',', bool $allowCreateRefs = true): array
    {
        $delimiter = $this->normalizeDelimiter($delimiter);
        [$header, $colIdx, $delimiter] = $this->readAndMapHeader($absolutePath, $delimiter);

        if (!$colIdx || !isset($colIdx['product_code']) || !isset($colIdx['name']) || !isset($colIdx['pack_size'])) {
            return [
                'ok' => false,
                'message' => 'CSV must contain a header with columns: product_code, name, pack_size (order/aliases allowed).',
                'detected_header' => $header,
            ];
        }

        // Existing products for uniqueness checks
        $existing = Product::select('id','product_code','barcode')->get();
        $codeToId = $existing->mapWithKeys(fn($p)=>[mb_strtolower(trim((string)$p->product_code)) => (int)$p->id])->all();
        $barcodeToCode = $existing->filter(fn($p)=>$p->barcode)->mapWithKeys(function($p){
            return [mb_strtolower(trim((string)$p->barcode)) => mb_strtolower(trim((string)$p->product_code))];
        })->all();

        // Lookup caches for names -> ids (case-insensitive)
        [$catNameToId, $brandNameToId, $suppNameToId] = $this->preloadLookups();

        $fh = $this->openCsv($absolutePath, $delimiter);
        $this->readNextNonEmpty($fh); // header

        $seenCodes = [];
        $seenBarcodes = [];

        $total=$valid=$invalid=0;
        $invalidSamples=[]; $validSamples=[];
        $rowNo = 1;

        while (!$fh->eof()) {
            $row = $this->readNextNonEmpty($fh);
            if ($row === null) break;
            $rowNo++;

            $data = $this->extractRowData($row, $colIdx);

            [$errors, $warnings] = $this->rowIssues(
                $data, $codeToId, $barcodeToCode, $seenCodes, $seenBarcodes,
                $catNameToId, $brandNameToId, $suppNameToId, $allowCreateRefs, true
            );

            $total++;
            if ($errors) {
                $invalid++;
                if (count($invalidSamples) < self::PREVIEW_INVALID_LIMIT) {
                    $invalidSamples[] = ['row'=>$rowNo, 'data'=>$data, 'errors'=>$errors, 'warnings'=>$warnings];
                }
            } else {
                $valid++;
                $lc = mb_strtolower($data['product_code']);
                $lb = $data['barcode'] !== null ? mb_strtolower($data['barcode']) : null;
                $seenCodes[$lc] = true;
                if ($lb) $seenBarcodes[$lb] = true;

                if (count($validSamples) < self::PREVIEW_VALID_LIMIT) {
                    $validSamples[] = ['row'=>$rowNo, 'data'=>$data, 'warnings'=>$warnings];
                }
            }
        }

        return [
            'ok'=>true,
            'used_delimiter'=>$delimiter,
            'header'=>$header,
            'header_map'=>$colIdx,
            'total'=>$total, 'valid'=>$valid, 'invalid'=>$invalid,
            'invalid_samples'=>$invalidSamples, 'valid_samples'=>$validSamples,
        ];
    }

    // ---------- COMMIT ----------

    /**
     * Upsert by product_code. Will create missing Category/Brand/Supplier if allowed.
     */
    public function commit(string $absolutePath, bool $insertValidOnly = true, string $delimiter = ',', bool $allowCreateRefs = true): array
    {
        $delimiter = $this->normalizeDelimiter($delimiter);
        [$header, $colIdx, $delimiter] = $this->readAndMapHeader($absolutePath, $delimiter);
        if (!$colIdx || !isset($colIdx['product_code']) || !isset($colIdx['name']) || !isset($colIdx['pack_size'])) {
            throw new \RuntimeException('CSV header not recognized (need product_code, name, pack_size).');
        }

        // Existing for constraints
        $existing = Product::select('id','product_code','barcode','quantity')->get();
        $codeToId = $existing->mapWithKeys(fn($p)=>[mb_strtolower(trim((string)$p->product_code)) => (int)$p->id])->all();
        $codeToQty = $existing->mapWithKeys(fn($p)=>[mb_strtolower(trim((string)$p->product_code)) => (int)($p->quantity ?? 0)])->all();
        $barcodeToCode = $existing->filter(fn($p)=>$p->barcode)->mapWithKeys(function($p){
            return [mb_strtolower(trim((string)$p->barcode)) => mb_strtolower(trim((string)$p->product_code))];
        })->all();

        // Lookups (and we may add to them if creating)
        [$catNameToId, $brandNameToId, $suppNameToId] = $this->preloadLookups();

        $stats = ['total'=>0,'valid'=>0,'invalid'=>0,'committed'=>0,'new'=>0,'existing'=>0];
        $toUpsert = [];

        $flush = function () use (&$toUpsert, &$stats) {
            if (empty($toUpsert)) return;
            Product::upsert(
                $toUpsert,
                ['product_code'],
                [
                    'name','image','formulation','description','pack_size','quantity',
                    'pack_purchase_price','pack_sale_price','unit_purchase_price','unit_sale_price',
                    'avg_price','margin','narcotic','max_discount',
                    'category_id','brand_id','supplier_id','rack','barcode',
                ]
            );
            $stats['committed'] += count($toUpsert);
            $toUpsert = [];
        };

        $fh = $this->openCsv($absolutePath, $delimiter);
        $this->readNextNonEmpty($fh); // header

        DB::transaction(function () use ($fh, $colIdx, $codeToId, $codeToQty, $barcodeToCode, &$catNameToId, &$brandNameToId, &$suppNameToId, $allowCreateRefs, $insertValidOnly, &$stats, &$toUpsert, $flush) {
            while (!$fh->eof()) {
                $row = $this->readNextNonEmpty($fh);
                if ($row === null) break;

                $data = $this->extractRowData($row, $colIdx);
                $stats['total']++;

                [$errors, $warnings, $normalized] = $this->rowIssues(
                    $data, $codeToId, $barcodeToCode, [], [], $catNameToId, $brandNameToId, $suppNameToId, $allowCreateRefs, false
                );

                if ($errors) {
                    $stats['invalid']++;
                    if ($insertValidOnly) continue;
                    throw new \RuntimeException('Import aborted due to validation error.');
                }

                $stats['valid']++;

                // Compute derived prices if needed
                $normalized = $this->fillDerivedPrices($normalized);

                // Compute avg_price (fallback to UPP) and margin
                if (!is_numeric($normalized['avg_price'])) {
                    $normalized['avg_price'] = (float) ($normalized['unit_purchase_price'] ?? 0.0);
                }
                $usp = (float) ($normalized['unit_sale_price'] ?? 0.0);
                $avg = (float) ($normalized['avg_price'] ?? 0.0);
                $normalized['margin'] = ($usp > 0) ? round((($usp - $avg) / $usp) * 100, 2) : 0.0;

                $lc = mb_strtolower($normalized['product_code']);
                $hasExplicitQty = $data['quantity'] !== null && $data['quantity'] !== '';
                if (isset($codeToId[$lc])) {
                    $stats['existing']++;
                    if (!$hasExplicitQty && isset($codeToQty[$lc])) {
                        $normalized['quantity'] = $codeToQty[$lc];
                    }
                } else {
                    $stats['new']++;
                    $codeToId[$lc] = -1;
                }

                $toUpsert[] = $normalized;

                if (count($toUpsert) >= self::CHUNK_SIZE) $flush();
            }

            $flush();
        });

        return $stats;
    }

    // ---------- HELPERS ----------

    private function normalizeDelimiter(string $delimiter): string { return $delimiter === '\t' ? "\t" : $delimiter; }

    private function openCsv(string $absolutePath, string $delimiter): \SplFileObject
    {
        $fh = new \SplFileObject($absolutePath, 'r');
        $fh->setFlags(\SplFileObject::READ_CSV | \SplFileObject::SKIP_EMPTY | \SplFileObject::DROP_NEW_LINE);
        $fh->setCsvControl($delimiter);
        return $fh;
    }

    private function readNextNonEmpty(\SplFileObject $fh): ?array
    {
        while (!$fh->eof()) {
            $row = $fh->fgetcsv();
            if ($row === false || $row === null) continue;
            $row = $this->normalizeRow($row);
            if ($row === [] || (count($row)===1 && $row[0]===null)) continue;
            return $row;
        }
        return null;
    }

    private function normalizeRow(array $row): array
    {
        $out=[];
        foreach ($row as $i=>$v) {
            if ($v===null) { $out[$i]=null; continue; }
            $s = is_string($v) ? trim($v) : (string)$v;
            if ($i===0) $s = preg_replace('/^\xEF\xBB\xBF/', '', $s); // strip BOM
            $out[$i] = ($s==='') ? null : $s;
        }
        while (!empty($out) && end($out)===null) array_pop($out);
        return $out;
    }

    private function guessDelimiterFromSample(string $path, array $candidates=[',',';',"\t",'|']): string
    {
        $h = @fopen($path,'r'); if(!$h) return ',';
        $sample = fgets($h,8192) ?: ''; fclose($h);
        $best=$candidates[0]; $bestCount=-1;
        foreach($candidates as $d){ $c=substr_count($sample,$d); if($c>$bestCount){$best=$d;$bestCount=$c;} }
        return $best;
    }

    private function readAndMapHeader(string $absolutePath, string $delimiter): array
    {
        $fh = $this->openCsv($absolutePath, $delimiter);
        $header = $this->readNextNonEmpty($fh);
        $colIdx = $header ? $this->mapHeaderToCanonical($header) : [];

        if ($colIdx) return [$header,$colIdx,$delimiter];

        $auto = $this->guessDelimiterFromSample($absolutePath);
        if ($auto !== $delimiter) {
            $fh = $this->openCsv($absolutePath, $auto);
            $header = $this->readNextNonEmpty($fh);
            $colIdx = $header ? $this->mapHeaderToCanonical($header) : [];
            if ($colIdx) return [$header,$colIdx,$auto];
        }
        return [$header,[],$delimiter];
    }

    private function mapHeaderToCanonical(array $header): array
    {
        $lower = array_map(fn($h)=>mb_strtolower(trim((string)$h)), $header);
        if (!empty($lower)) $lower[0] = preg_replace('/^\xEF\xBB\xBF/', '', $lower[0]);

        $map=[];
        foreach ($this->aliases as $key => $aliasList) {
            foreach ($aliasList as $alias) {
                $i = array_search($alias, $lower, true);
                if ($i!==false) { $map[$key]=$i; break; }
            }
        }
        // Required
        if (!isset($map['product_code']) || !isset($map['name']) || !isset($map['pack_size'])) {
            return [];
        }
        return $map;
    }

    private function sanitizeCsvFormula($value): ?string
    {
        if ($value === null) {
            return null;
        }
        $str = trim((string) $value);
        if ($str === '') {
            return '';
        }
        // Prevent CSV/spreadsheet formula injection when exported or opened in Excel/LibreOffice
        if (preg_match('/^[=+\-@]/', $str) && !is_numeric($str)) {
            return "'" . $str;
        }
        return $str;
    }

    private function extractRowData(array $row, array $colIdx): array
    {
        $g = fn($k)=> array_key_exists($k,$colIdx) ? ($row[$colIdx[$k]] ?? null) : null;

        return [
            'product_code'        => (string)($this->sanitizeCsvFormula($g('product_code')) ?? ''),
            'name'                => (string)($this->sanitizeCsvFormula($g('name')) ?? ''),
            'formulation'         => $this->sanitizeCsvFormula($g('formulation')),
            'description'         => $this->sanitizeCsvFormula($g('description')),
            'pack_size'           => $g('pack_size'),
            'quantity'            => $g('quantity'),
            'pack_purchase_price' => $g('pack_purchase_price'),
            'pack_sale_price'     => $g('pack_sale_price'),
            'unit_purchase_price' => $g('unit_purchase_price'),
            'unit_sale_price'     => $g('unit_sale_price'),
            'avg_price'           => $g('avg_price'),
            'narcotic'            => $g('narcotic'),
            'max_discount'        => $g('max_discount'),
            'category_id'         => $g('category_id'),
            'brand_id'            => $g('brand_id'),
            'supplier_id'         => $g('supplier_id'),
            'category'            => $this->sanitizeCsvFormula($g('category')),
            'brand'               => $this->sanitizeCsvFormula($g('brand')),
            'supplier'            => $this->sanitizeCsvFormula($g('supplier')),
            'rack'                => $this->sanitizeCsvFormula($g('rack')),
            'barcode'             => $this->sanitizeCsvFormula($g('barcode')),
        ];
    }

    /**
     * Validate/normalize a single row.
     * @return array{0: array, 1: array, 2?: array}  errors, warnings, normalizedRow(if ok)
     */
    private function rowIssues(
        array $data,
        array $codeToId, array $barcodeToCode,
        array $seenCodes, array $seenBarcodes,
        array &$catNameToId, array &$brandNameToId, array &$suppNameToId,
        bool $allowCreateRefs, bool $strict
    ): array {
        $errors=[]; $warnings=[];

        // Basic requireds
        $code = trim((string)$data['product_code']);
        $name = trim((string)$data['name']);

        if ($code==='') $errors['product_code']='product_code is required.';
        if ($name==='') $errors['name']='name is required.';
        if ($code!=='' && mb_strlen($code)>64) $warnings['product_code']='Unusually long code.';
        if ($name!=='' && mb_strlen($name)>255) $errors['name_len']='Name too long (max 255).';

        // pack_size required
        $packSize = $this->toInt($data['pack_size']);
        if (!is_int($packSize) || $packSize<=0) $errors['pack_size']='pack_size must be a positive integer.';

        // numeric fields
        $ints = ['quantity','max_discount'];
        foreach($ints as $k){
            if ($data[$k]!==null && $data[$k]!=='') {
                if (!is_numeric($data[$k])) $errors[$k]="$k must be numeric.";
                else if ($k==='quantity' && (int)$data[$k] < 0) $errors[$k]='quantity cannot be negative.';
            }
        }
        $nums = ['pack_purchase_price','pack_sale_price','unit_purchase_price','unit_sale_price','avg_price'];
        foreach($nums as $k){
            if ($data[$k]!==null && $data[$k]!=='' && !is_numeric($data[$k])) $errors[$k]="$k must be a number.";
        }

        // narcotic normalize
        $narc = $this->normalizeYesNo($data['narcotic'] ?? null);

        // barcode uniqueness against DB for different product_code
        $barcode = $data['barcode'] !== null ? trim((string)$data['barcode']) : null;
        if ($barcode !== null && $barcode!=='') {
            $lb = mb_strtolower($barcode);
            $lc = mb_strtolower($code);
            if ($strict && isset($seenBarcodes[$lb])) $errors['barcode_dup_file'] = 'Duplicate barcode within file.';
            if (isset($barcodeToCode[$lb]) && $barcodeToCode[$lb] !== $lc) {
                $errors['barcode_conflict'] = 'Barcode already used by another product.';
            }
        } else {
            $barcode = null;
        }

        // In-file product_code duplicate
        if ($strict && $code!=='') {
            $lc = mb_strtolower($code);
            if (isset($seenCodes[$lc])) $errors['code_dup_file'] = 'Duplicate product_code within file.';
        }

        // Relationships resolution (prefer *_id, else names)
        [$categoryId, $brandId, $supplierId, $relErrors, $relWarnings] = $this->resolveRelations(
            $data, $catNameToId, $brandNameToId, $suppNameToId, $allowCreateRefs
        );
        $errors += $relErrors; $warnings += $relWarnings;

        if ($errors) return [$errors,$warnings];

        // Normalize numeric/strings
        $upp = $this->toFloat($data['unit_purchase_price']);
        $usp = $this->toFloat($data['unit_sale_price']);
        $ppp = $this->toFloat($data['pack_purchase_price']);
        $psp = $this->toFloat($data['pack_sale_price']);
        $avg = $this->toFloat($data['avg_price']);
        $qty = $this->toInt($data['quantity']);
        $maxDisc = $this->toInt($data['max_discount']);

        $rawFormulation = $this->nullIfEmpty($data['formulation']);
        $canonicalFormulation = null;
        if ($rawFormulation !== null) {
            $canonicalFormulation = !$strict
                ? (Formulation::resolveOrCreate($rawFormulation)?->name ?? Formulation::normalizeName($rawFormulation))
                : Formulation::normalizeName($rawFormulation);
        }

        $normalized = [
            'product_code'        => $code,
            'name'                => $name,
            'formulation'         => $canonicalFormulation,
            'description'         => $this->nullIfEmpty($data['description']),
            'pack_size'           => $packSize,
            'quantity'            => $qty ?? 0,
            'pack_purchase_price' => $ppp,
            'pack_sale_price'     => $psp,
            'unit_purchase_price' => $upp,
            'unit_sale_price'     => $usp,
            'avg_price'           => $avg,
            'narcotic'            => $narc ? 'yes' : 'no',
            'max_discount'        => $maxDisc,
            'category_id'         => $categoryId,
            'brand_id'            => $brandId,
            'supplier_id'         => $supplierId,
            'rack'                => $this->nullIfEmpty($data['rack']),
            'barcode'             => $barcode,
        ];
        return [$errors,$warnings,$normalized];
    }

    private function fillDerivedPrices(array $r): array
    {
        $pack = (float)($r['pack_size'] ?? 0) ?: 0;
        $upp = isset($r['unit_purchase_price']) ? (float)$r['unit_purchase_price'] : null;
        $usp = isset($r['unit_sale_price']) ? (float)$r['unit_sale_price'] : null;
        $ppp = isset($r['pack_purchase_price']) ? (float)$r['pack_purchase_price'] : null;
        $psp = isset($r['pack_sale_price']) ? (float)$r['pack_sale_price'] : null;

        if ($pack > 0) {
            if ($upp === null && $ppp !== null) $r['unit_purchase_price'] = round($ppp / $pack, 4);
            if ($usp === null && $psp !== null) $r['unit_sale_price']     = round($psp / $pack, 4);
            if ($ppp === null && $upp !== null) $r['pack_purchase_price'] = round($upp * $pack, 4);
            if ($psp === null && $usp !== null) $r['pack_sale_price']     = round($usp * $pack, 4);
        }
        return $r;
    }

    /**
     * Resolve category/brand/supplier using *_id or names (create if allowed).
     * @return array{int|null,int|null,int|null,array,array}  ids, errors, warnings
     */
    private function resolveRelations(
        array $data, array &$catNameToId, array &$brandNameToId, array &$suppNameToId, bool $allowCreateRefs
    ): array {
        $errors=[]; $warnings=[];

        // Category
        $categoryId = $this->idOrNameToId(
            $data['category_id'] ?? null, $data['category'] ?? null,
            $catNameToId, Category::class, $allowCreateRefs, 'category', $errors, $warnings
        );

        // Brand
        $brandId = $this->idOrNameToId(
            $data['brand_id'] ?? null, $data['brand'] ?? null,
            $brandNameToId, Brand::class, $allowCreateRefs, 'brand', $errors, $warnings
        );

        // Supplier
        $supplierId = $this->idOrNameToId(
            $data['supplier_id'] ?? null, $data['supplier'] ?? null,
            $suppNameToId, Supplier::class, $allowCreateRefs, 'supplier', $errors, $warnings
        );

        return [$categoryId, $brandId, $supplierId, $errors, $warnings];
    }

    private function idOrNameToId($idRaw, $nameRaw, array &$nameToId, string $modelClass, bool $create, string $label, array &$errors, array &$warnings): ?int
    {
        if ($idRaw !== null && $idRaw !== '') {
            if (!is_numeric($idRaw)) { $errors[$label.'_id'] = "$label"."_id must be numeric."; return null; }
            $id = (int)$idRaw;
            if ($id > 0 && $modelClass::whereKey($id)->exists()) return $id;
            $errors[$label.'_id'] = ucfirst($label)." id not found.";
            return null;
        }

        $name = $this->nullIfEmpty($nameRaw);
        if ($name === null) return null;

        $ln = mb_strtolower($name);
        if (isset($nameToId[$ln])) return (int)$nameToId[$ln];

        $foundId = $modelClass::whereRaw('LOWER(name) = ?', [$ln])->value('id');
        if ($foundId) {
            $nameToId[$ln] = (int)$foundId;
            return (int)$foundId;
        }

        if ($create) {
            $created = $modelClass::create(['name'=>$name]);
            $nameToId[$ln] = (int)$created->id;
            $warnings[$label.'_created'] = ucfirst($label)." created: ".$name;
            return (int)$created->id;
        }

        $errors[$label] = ucfirst($label)." not found: ".$name;
        return null;
    }

    private function preloadLookups(): array
    {
        $cat = Category::select('id','name')->get()->mapWithKeys(fn($r)=>[mb_strtolower(trim((string)$r->name))=>(int)$r->id])->all();
        $br  = Brand::select('id','name')->get()->mapWithKeys(fn($r)=>[mb_strtolower(trim((string)$r->name))=>(int)$r->id])->all();
        $sp  = Supplier::select('id','name')->get()->mapWithKeys(fn($r)=>[mb_strtolower(trim((string)$r->name))=>(int)$r->id])->all();
        return [$cat,$br,$sp];
    }

    private function toFloat($v): ?float
    {
        if ($v===null || $v==='') return null;
        if (!is_numeric($v)) return null;
        return (float)$v;
    }

    private function toInt($v): ?int
    {
        if ($v===null || $v==='') return null;
        if (!is_numeric($v)) return null;
        return (int)$v;
    }

    private function nullIfEmpty($v)
    {
        $s = is_string($v) ? trim($v) : $v;
        return ($s === null || $s === '' ) ? null : $s;
    }

    private function normalizeYesNo($v): bool
    {
        $s = mb_strtolower(trim((string)($v ?? '')));
        return in_array($s, ['1','y','yes','true','t'], true);
    }
}
