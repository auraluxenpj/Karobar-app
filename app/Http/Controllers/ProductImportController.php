<?php

namespace App\Http\Controllers;

use App\Services\ProductImportService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ProductImportController extends Controller
{
    public function __construct(private ProductImportService $service) {}

    // GET /api/products/import/template
    public function template(): StreamedResponse
    {
        // Minimal headers + common optional ones
        return response()->streamDownload(function () {
            echo "product_code,name,pack_size,unit_purchase_price,unit_sale_price,category,brand,supplier,quantity,barcode,narcotic,max_discount,formulation,description,rack\n";
            echo "PRD-0001,Paracetamol 500mg,10,3.5,5,Analgesics,Acme,ABC Pharma,0,1234567890123,no,10,Tablet,Pain reliever,R1\n";
        }, 'products_template.csv', ['Content-Type'=>'text/csv']);
    }

    // POST /api/products/import/validate
    public function validateUpload(Request $request)
    {
        $request->validate([
            'file' => ['required','file','mimes:csv,txt','max:10240'],
            'delimiter' => ['nullable', Rule::in([',',';','\t','|'])],
            'create_missing_refs' => ['sometimes','in:1,0,true,false,on,off'],
        ]);

        $stored    = $this->service->storeUploaded($request->file('file'));
        $delimiter = $request->input('delimiter', ',');
        $create = $request->has('create_missing_refs')
    ? $request->boolean('create_missing_refs')
    : true;

        $res = $this->service->validateCsv($stored['path'], $delimiter, $create);
        if (!$res['ok']) {
            @unlink($stored['path']);
            return response()->json($res, 422);
        }
        $res['token'] = $stored['token'];
        return response()->json($res);
    }

    // POST /api/products/import/commit
    public function commit(Request $request)
    {
        $request->validate([
            'token' => ['required','uuid'],
            'insert_valid_only' => ['sometimes','boolean'],
            'delimiter' => ['nullable', Rule::in([',',';','\t','|'])],
            'create_missing_refs' => ['sometimes','in:1,0,true,false,on,off'],
        ]);

        $token    = (string) $request->string('token');
        $relative = "imports/products/{$token}.csv";

        if (!Storage::disk('local')->exists($relative)) {
            return response()->json(['message' => 'Upload token expired or file missing.'], 404);
        }

        $path  = Storage::disk('local')->path($relative);
        $stats = $this->service->commit(
            $path,
            $request->boolean('insert_valid_only', true),
            $request->input('delimiter', ','),
            $request->has('create_missing_refs')
        ? $request->boolean('create_missing_refs')
        : true
        );

        Storage::disk('local')->delete($relative);

        return response()->json(['message'=>'Import complete.','stats'=>$stats]);
    }
}
