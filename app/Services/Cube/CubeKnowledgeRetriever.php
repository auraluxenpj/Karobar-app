<?php

namespace App\Services\Cube;

class CubeKnowledgeRetriever
{
    protected ?array $knowledgeCache = null;

    protected ?array $learnedCache = null;

    protected const STOP_WORDS = [
        'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'to', 'of', 'in', 'on', 'at', 'by', 'for',
        'with', 'from', 'into', 'onto', 'upon', 'out', 'over', 'under', 'can', 'could', 'would', 'should',
        'will', 'shall', 'may', 'might', 'must', 'do', 'does', 'did', 'done', 'have', 'has', 'had', 'i', 'me',
        'my', 'we', 'our', 'you', 'your', 'it', 'its', 'they', 'them', 'their', 'this', 'that', 'these', 'those',
        'what', 'which', 'who', 'whom', 'where', 'when', 'why', 'how', 'please', 'plz', 'pls', 'tell', 'show',
        'give', 'want', 'need', 'know', 'about', 'in', 'and', 'or', 'vs', 'versus', 'compare', 'comparison',
        'difference', 'between', 'detail', 'details', 'explain', 'clarify', 'more',
        // Roman Urdu stop words
        'ka', 'ki', 'ke', 'ko', 'se', 'mein', 'me', 'main', 'par', 'pe', 'hai', 'hain', 'tha', 'thi', 'the',
        'ho', 'hota', 'hoti', 'hote', 'kar', 'karein', 'karen', 'karna', 'karne', 'karni', 'kaise', 'kesay',
        'kese', 'kya', 'kia', 'kyun', 'kis', 'tarah', 'tareeqa', 'tarika', 'batao', 'batayein', 'bata', 'dein',
        'den', 'aur', 'ya', 'bhi', 'toh', 'to', 'agar', 'ye', 'yeh', 'wo', 'woh', 'is', 'us', 'ek', 'apna', 'apni',
        // Urdu stop words
        'کا', 'کی', 'کے', 'کو', 'سے', 'میں', 'پر', 'ہے', 'ہیں', 'تھا', 'تھی', 'تھے', 'ہو', 'ہوتا', 'ہوتی',
        'ہوتے', 'کر', 'کریں', 'کرنا', 'کرنے', 'کیسے', 'کیا', 'کیوں', 'کس', 'طرح', 'طریقہ', 'بتائیں', 'بتاؤ',
        'دیں', 'اور', 'یا', 'بھی', 'تو', 'اگر', 'یہ', 'وہ', 'اس', 'ایک', 'اپنا', 'اپنی',
    ];

    protected const ROMAN_URDU_SYNONYMS = [
        'kesay' => 'kaise',
        'kese' => 'kaise',
        'tarika' => 'tareeqa',
        'tareeka' => 'tareeqa',
        'udhaar' => 'udhar',
        'khata' => 'ledger',
        'khate' => 'ledger',
        'goli' => 'tablet',
        'goliyan' => 'tablet',
        'khuli' => 'loose',
        'dabba' => 'pack',
        'dabbay' => 'pack',
        'wapsi' => 'return',
        'wapas' => 'return',
        'kharcha' => 'expense',
        'kharche' => 'expense',
        'tankhwah' => 'salary',
        'hazri' => 'attendance',
        'galla' => 'drawer',
        'munafa' => 'profit',
        'nafa' => 'profit',
        'nuqsan' => 'loss',
        'kharidari' => 'purchase',
        'farokht' => 'sale',
    ];

    public function loadKnowledge(): array
    {
        if ($this->knowledgeCache !== null) {
            return $this->knowledgeCache;
        }

        $path = (string) config('cube.knowledge_path', resource_path('assistant/cube-knowledge.json'));
        if (! is_file($path)) {
            $this->knowledgeCache = [
                'product_version' => '2026.10',
                'screens' => [],
                'intents' => [],
                'workflows' => [],
                'controls' => [],
                'modals' => [],
            ];

            return $this->knowledgeCache;
        }

        $decoded = json_decode((string) file_get_contents($path), true);
        $this->knowledgeCache = is_array($decoded) ? $decoded : [
            'product_version' => '2026.10',
            'screens' => [],
            'intents' => [],
            'workflows' => [],
            'controls' => [],
            'modals' => [],
        ];

        return $this->knowledgeCache;
    }

    public function getProductVersion(): string
    {
        $kb = $this->loadKnowledge();

        return (string) ($kb['product_version'] ?? '2026.10');
    }

    public function getLearnedKnowledgePath(): string
    {
        return (string) config(
            'cube.learned_knowledge_path',
            storage_path('app/cube-learned-knowledge.json')
        );
    }

    /**
     * Loads the self-improving AI knowledge overlay persisted from verified Generative AI explanations.
     *
     * @return array{
     *   updated_at: ?string,
     *   improved_sources: array<string, array<string, mixed>>,
     *   learned_controls: array<string, array<string, mixed>>,
     *   learned_qa: array<string, array<string, mixed>>
     * }
     */
    public function loadLearnedKnowledge(): array
    {
        if ($this->learnedCache !== null) {
            return $this->learnedCache;
        }

        $default = [
            'updated_at' => null,
            'improved_sources' => [],
            'learned_controls' => [],
            'learned_qa' => [],
        ];

        $path = $this->getLearnedKnowledgePath();
        if (! is_file($path)) {
            $this->learnedCache = $default;

            return $this->learnedCache;
        }

        $decoded = json_decode((string) @file_get_contents($path), true);
        if (! is_array($decoded)) {
            $this->learnedCache = $default;

            return $this->learnedCache;
        }

        $this->learnedCache = [
            'updated_at' => $decoded['updated_at'] ?? null,
            'improved_sources' => is_array($decoded['improved_sources'] ?? null) ? $decoded['improved_sources'] : [],
            'learned_controls' => is_array($decoded['learned_controls'] ?? null) ? $decoded['learned_controls'] : [],
            'learned_qa' => is_array($decoded['learned_qa'] ?? null) ? $decoded['learned_qa'] : [],
        ];

        return $this->learnedCache;
    }

    public function clearLearnedKnowledge(): void
    {
        $this->learnedCache = [
            'updated_at' => null,
            'improved_sources' => [],
            'learned_controls' => [],
            'learned_qa' => [],
        ];
        $path = $this->getLearnedKnowledgePath();
        if (is_file($path)) {
            @unlink($path);
        }
    }

    public function buildControlKnowledgeKey(string $currentRoute, ?array $elementContext): string
    {
        if (empty($elementContext)) {
            return '';
        }

        $explicitKey = trim((string) ($elementContext['control_key'] ?? ''));
        if ($explicitKey !== '') {
            return mb_strtolower($explicitKey, 'UTF-8');
        }

        $cleanRoute = '/'.ltrim(trim($currentRoute ?: '/dashboard'), '/');
        $comp = mb_strtolower(trim((string) ($elementContext['component_type'] ?? 'control')), 'UTF-8');
        $label = mb_strtolower(trim((string) ($elementContext['label'] ?? ($elementContext['table_column'] ?? ''))), 'UTF-8');
        $label = preg_replace('/\s+/u', ' ', $label) ?? $label;

        if ($label === '') {
            return '';
        }

        return "{$cleanRoute}::{$comp}::{$label}";
    }

    /**
     * Persists a verified Generative AI explanation back into the learned knowledge store
     * so the assistant continuously improves its old static knowledge over time.
     *
     * @param  array{
     *   question: string,
     *   current_route: string,
     *   explain_mode?: string,
     *   element_context?: ?array<string, mixed>,
     *   title_en: string,
     *   title_ur: string,
     *   answer_en: string,
     *   answer_ur: string,
     *   source_ids: array<int, string>,
     *   links?: array<int, array<string, string>>,
     *   workflow_id?: ?string,
     *   provider?: string
     * }  $entry
     * @return array{learned: bool, knowledge_key: string, updated_source_ids: array<int, string>}
     */
    public function recordLearnedImprovement(array $entry): array
    {
        $titleEn = trim((string) ($entry['title_en'] ?? ''));
        $titleUr = trim((string) ($entry['title_ur'] ?? ''));
        $answerEn = trim((string) ($entry['answer_en'] ?? ''));
        $answerUr = trim((string) ($entry['answer_ur'] ?? ''));

        if ($answerEn === '' && $answerUr === '') {
            return [
                'learned' => false,
                'knowledge_key' => '',
                'updated_source_ids' => [],
            ];
        }

        $learned = $this->loadLearnedKnowledge();
        $nowIso = now()->toIso8601String();
        $cleanRoute = '/'.ltrim(trim((string) ($entry['current_route'] ?? '/dashboard')), '/');
        $question = trim((string) ($entry['question'] ?? ''));
        $analysis = $this->analyzeText($question);
        $sourceIds = array_values(array_filter((array) ($entry['source_ids'] ?? []), 'is_string'));
        $elementContext = is_array($entry['element_context'] ?? null) ? $entry['element_context'] : null;
        $updatedSourceIds = [];
        $knowledgeKey = '';

        // 1. If an inspected DOM element was explained via Explain Cursor, persist improved control knowledge
        $controlKey = $this->buildControlKnowledgeKey($cleanRoute, $elementContext);
        if ($controlKey !== '') {
            $controlSourceId = 'control:cursor_'.substr(md5($controlKey), 0, 10);
            $label = trim((string) ($elementContext['label'] ?? ($elementContext['table_column'] ?? $titleEn)));
            $compType = trim((string) ($elementContext['component_type'] ?? 'UI Control'));
            $kwAnalysis = $this->analyzeText($label.' '.$compType.' '.$question);

            $learned['learned_controls'][$controlKey] = [
                'source_id' => $controlSourceId,
                'control_key' => $controlKey,
                'route' => $cleanRoute,
                'label' => $label,
                'component_type' => $compType,
                'title' => [
                    'en' => $titleEn !== '' ? $titleEn : $label,
                    'ur' => $titleUr !== '' ? $titleUr : $label,
                ],
                'en' => $answerEn,
                'ur' => $answerUr,
                'keywords' => array_slice($kwAnalysis['meaningful_words'], 0, 12),
                'updated_at' => $nowIso,
                'provider' => (string) ($entry['provider'] ?? 'ai'),
            ];

            $updatedSourceIds[] = $controlSourceId;
            $knowledgeKey = $controlKey;
        }

        // 2. Upgrade baseline static source (intent, faq, control, or screen topic) with AI-improved knowledge
        if (! empty($sourceIds)) {
            $primarySid = $sourceIds[0];
            if (
                str_starts_with($primarySid, 'intent:') ||
                str_starts_with($primarySid, 'faq:') ||
                str_starts_with($primarySid, 'control:') ||
                ($entry['explain_mode'] ?? '') === 'screen_topic'
            ) {
                $learned['improved_sources'][$primarySid] = [
                    'source_id' => $primarySid,
                    'title_en' => $titleEn,
                    'title_ur' => $titleUr,
                    'answer_en' => $answerEn,
                    'answer_ur' => $answerUr,
                    'updated_at' => $nowIso,
                    'provider' => (string) ($entry['provider'] ?? 'ai'),
                ];
                $updatedSourceIds[] = $primarySid;
                if ($knowledgeKey === '') {
                    $knowledgeKey = $primarySid;
                }
            }
        }

        // 3. Record learned Q&A entry so future identical or similar questions have improved baseline knowledge
        if ($analysis['cleaned'] !== '') {
            $qaKey = $cleanRoute.'::'.$analysis['cleaned'];
            $qaSourceId = 'learned:'.substr(md5($qaKey), 0, 10);
            $learned['learned_qa'][$qaKey] = [
                'source_id' => $qaSourceId,
                'route' => $cleanRoute,
                'question' => $question,
                'cleaned_question' => $analysis['cleaned'],
                'keywords' => array_slice($analysis['meaningful_words'], 0, 14),
                'title' => [
                    'en' => $titleEn,
                    'ur' => $titleUr,
                ],
                'en' => $answerEn,
                'ur' => $answerUr,
                'links' => is_array($entry['links'] ?? null) ? $entry['links'] : [],
                'workflow_id' => $entry['workflow_id'] ?? null,
                'updated_at' => $nowIso,
                'provider' => (string) ($entry['provider'] ?? 'ai'),
            ];

            // Cap learned_qa at 300 entries
            if (count($learned['learned_qa']) > 300) {
                $learned['learned_qa'] = array_slice($learned['learned_qa'], -300, null, true);
            }

            if ($knowledgeKey === '') {
                $knowledgeKey = $qaKey;
            }
            $updatedSourceIds[] = $qaSourceId;
        }

        $learned['updated_at'] = $nowIso;
        $this->learnedCache = $learned;

        try {
            $path = $this->getLearnedKnowledgePath();
            $dir = dirname($path);
            if (! is_dir($dir)) {
                @mkdir($dir, 0775, true);
            }
            @file_put_contents(
                $path,
                json_encode($learned, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
            );
        } catch (\Throwable) {
            // Ignore filesystem write issues in read-only environments
        }

        return [
            'learned' => true,
            'knowledge_key' => $knowledgeKey,
            'updated_source_ids' => array_values(array_unique($updatedSourceIds)),
        ];
    }

    /**
     * Normalizes and tokenizes English, Urdu, and Roman Urdu queries.
     *
     * @return array{cleaned: string, words: array<int, string>, stems: array<int, string>, meaningful_words: array<int, string>, meaningful_stems: array<int, string>}
     */
    public function analyzeText(string $rawText): array
    {
        $lower = mb_strtolower($rawText, 'UTF-8');
        $cleaned = preg_replace('/[^\p{L}\p{N}\s]+/u', ' ', $lower) ?? '';
        $cleaned = trim(preg_replace('/\s+/u', ' ', $cleaned) ?? '');

        $rawWords = $cleaned === '' ? [] : explode(' ', $cleaned);
        $normalizedWords = [];
        foreach ($rawWords as $word) {
            $normalizedWords[] = self::ROMAN_URDU_SYNONYMS[$word] ?? $word;
        }

        $stems = array_values(array_unique(array_map([$this, 'stemToken'], array_merge($rawWords, $normalizedWords))));
        $words = array_values(array_unique(array_merge($rawWords, $normalizedWords)));

        $stopLookup = array_flip(self::STOP_WORDS);
        $meaningfulWords = [];
        foreach ($words as $w) {
            if (! isset($stopLookup[$w]) && mb_strlen($w, 'UTF-8') > 1) {
                $meaningfulWords[] = $w;
            }
        }
        $meaningfulStems = array_values(array_unique(array_map([$this, 'stemToken'], $meaningfulWords)));

        return [
            'cleaned' => $cleaned,
            'words' => $words,
            'stems' => $stems,
            'meaningful_words' => $meaningfulWords,
            'meaningful_stems' => $meaningfulStems,
        ];
    }

    public function stemToken(string $word): string
    {
        if (mb_strlen($word, 'UTF-8') <= 3) {
            return $word;
        }
        if (str_ends_with($word, 'ies') && strlen($word) > 4) {
            return substr($word, 0, -3).'y';
        }
        if (str_ends_with($word, 'ing') && strlen($word) > 5) {
            return substr($word, 0, -3);
        }
        if (str_ends_with($word, 'ed') && strlen($word) > 4) {
            return substr($word, 0, -2);
        }
        if (str_ends_with($word, 'es') && strlen($word) > 4 && ! str_ends_with($word, 'ses')) {
            return substr($word, 0, -1);
        }
        if (str_ends_with($word, 's') && ! str_ends_with($word, 'ss') && ! str_ends_with($word, 'us') && ! str_ends_with($word, 'pos')) {
            return substr($word, 0, -1);
        }

        return $word;
    }

    protected function hasBoundedPhrase(string $cleanedQuery, array $wordLookup, array $stemLookup, string $phrase): bool
    {
        $norm = trim(mb_strtolower($phrase, 'UTF-8'));
        $norm = preg_replace('/[^\p{L}\p{N}\s]+/u', ' ', $norm) ?? '';
        $norm = trim(preg_replace('/\s+/u', ' ', $norm) ?? '');
        if ($norm === '') {
            return false;
        }

        if (! str_contains($norm, ' ')) {
            $stem = $this->stemToken($norm);

            return isset($wordLookup[$norm]) || isset($stemLookup[$stem]);
        }

        return str_contains(" {$cleanedQuery} ", " {$norm} ");
    }

    /**
     * Detects whether a user question is asking for live ERP figures (stock count, customer balance, live sales/profit).
     */
    public function detectLiveRecordQuery(string $question): ?array
    {
        $analysis = $this->analyzeText($question);
        $cleaned = $analysis['cleaned'];

        $isHowMuchOrMany = (bool) preg_match('/\b(how much|how many)\b/u', $cleaned);
        $isProceduralHow = (! $isHowMuchOrMany && (bool) preg_match('/\b(how|kaise|kesay|kese|tareeqa|tarika|steps|step|way)\b/u', $cleaned))
            || (bool) preg_match('/\b(how to check|how to see|how to view|how do i check)\b/u', $cleaned)
            || str_contains($cleaned, 'کیسے')
            || str_contains($cleaned, 'طریقہ')
            || str_contains($cleaned, 'کس طرح');

        if ($isProceduralHow) {
            return null;
        }

        $asksLiveAmount = (bool) preg_match('/\b(how much|how many|what is my current|what is the current|what is the balance|tell me the balance|exact balance|exact stock|kitna hai|kitne hain|kitna stock|kitna balance|kitna munafa)\b/u', $cleaned)
            || str_contains($cleaned, 'کتنا ہے')
            || str_contains($cleaned, 'کتنے ہیں')
            || str_contains($cleaned, 'کتنا اسٹاک')
            || str_contains($cleaned, 'کتنا بیلنس')
            || str_contains($cleaned, 'کتنا منافع');

        $mentionsRecord = (bool) preg_match('/\b(stock|inventory|balance|udhar|profit|munafa|sale|sales|invoice|payable|receivable|salary|payroll|bank|cash|tablet|pack)\b/u', $cleaned)
            || str_contains($cleaned, 'اسٹاک')
            || str_contains($cleaned, 'بیلنس')
            || str_contains($cleaned, 'ادھار')
            || str_contains($cleaned, 'منافع')
            || str_contains($cleaned, 'سیل')
            || str_contains($cleaned, 'تنخواہ');

        if (! $asksLiveAmount || ! $mentionsRecord) {
            return null;
        }

        $isStock = (bool) preg_match('/\b(stock|inventory|quantity|qty|batch|panadol|medicine|item|tablet|pack)\b/u', $cleaned) || str_contains($cleaned, 'اسٹاک');
        $isCustomer = (bool) preg_match('/\b(customer|receivable|udhar)\b/u', $cleaned) || str_contains($cleaned, 'ادھار') || str_contains($cleaned, 'گاہک');
        $isSupplier = (bool) preg_match('/\b(supplier|payable|vendor)\b/u', $cleaned) || str_contains($cleaned, 'سپلائر');
        $isProfit = (bool) preg_match('/\b(profit|sale|revenue|income|expense|munafa)\b/u', $cleaned) || str_contains($cleaned, 'منافع') || str_contains($cleaned, 'سیل');

        if ($isStock) {
            $links = [
                ['path' => '/reports/current-stock', 'en' => 'Open Current Stock Report', 'ur' => 'موجودہ اسٹاک رپورٹ کھولیں'],
                ['path' => '/products', 'en' => 'Open Products Catalog', 'ur' => 'پروڈکٹس لسٹ کھولیں'],
            ];
        } elseif ($isCustomer) {
            $links = [
                ['path' => '/customer-ledger', 'en' => 'Open Customer Ledger', 'ur' => 'کسٹمر کھاتہ کھولیں'],
                ['path' => '/reports/accounts-receivable-aging', 'en' => 'Receivable Aging Report', 'ur' => 'وصولیوں کی ایجنگ رپورٹ'],
            ];
        } elseif ($isSupplier) {
            $links = [
                ['path' => '/supplier-ledger', 'en' => 'Open Supplier Ledger', 'ur' => 'سپلائر کھاتہ کھولیں'],
                ['path' => '/reports/accounts-payable-aging', 'en' => 'Payable Aging Report', 'ur' => 'واجب الادا رپورٹس'],
            ];
        } elseif ($isProfit) {
            $links = [
                ['path' => '/reports/net-profit', 'en' => 'Open Net Profit & Loss Report', 'ur' => 'نفع و نقصان رپورٹ کھولیں'],
                ['path' => '/dashboard', 'en' => 'Open Executive Dashboard', 'ur' => 'ڈیش بورڈ کھولیں'],
            ];
        } else {
            $links = [
                ['path' => '/reports/current-stock', 'en' => 'Current Stock Report', 'ur' => 'موجودہ اسٹاک رپورٹ'],
                ['path' => '/customer-ledger', 'en' => 'Customer Ledger', 'ur' => 'کسٹمر کھاتہ'],
                ['path' => '/accounts', 'en' => 'Financial Accounts', 'ur' => 'فنانشل اکاؤنٹس'],
            ];
        }

        return [
            'title_en' => 'How to Check Live Figures in Karobar ERP (Privacy & Data Boundary)',
            'title_ur' => 'کاروبار ایپ میں لائیو اعداد و شمار اور ریکارڈ چیک کرنے کا طریقہ',
            'answer_en' => "Cube is your **software training and workflow assistant** — for your business privacy and security, Cube does not read or transmit live ERP records (such as exact stock quantities, customer balances, invoices, or account figures).\n\n"
                ."**How to view your live figures directly:**\n"
                ."1. **Live Stock Quantities & Batches:** Open **Current Stock Report** (`/reports/current-stock`) or **Products** (`/products`) and search the item.\n"
                ."2. **Customer Receivable / Udhar Balance:** Open **Customer Ledger** (`/customer-ledger`) and select the customer.\n"
                ."3. **Supplier Payable Balance:** Open **Supplier Ledger** (`/supplier-ledger`) and select the supplier.\n"
                ."4. **Cash, Bank & Profit Figures:** Open **Financial Accounts** (`/accounts`) or **Net Profit Report** (`/reports/net-profit`).",
            'answer_ur' => "کیوب (Cube) آپ کا **سافٹ ویئر ٹریننگ اسسٹنٹ** ہے — آپ کے کاروباری ڈیٹا کے تحفظ کے لیے کیوب لائیو اسٹاک، گاہکوں کے کھاتے، بل یا اکاؤنٹ بیلنس تک رسائی نہیں رکھتا اور نہ ہی انہیں کسی بیرونی سروس کو بھیجتا ہے۔\n\n"
                ."**لائیو اعداد و شمار خود دیکھنے کا طریقہ:**\n"
                ."1. **موجودہ اسٹاک اور بیچ:** **Current Stock Report** (`/reports/current-stock`) یا **Products** (`/products`) کھول کر آئٹم سرچ کریں۔\n"
                ."2. **گاہک کا ادھار بیلنس:** **Customer Ledger** (`/customer-ledger`) کھول کر گاہک منتخب کریں۔\n"
                ."3. **سپلائر کا بقایا بیلنس:** **Supplier Ledger** (`/supplier-ledger`) کھولیں۔\n"
                ."4. **کیش، بینک اور منافع:** **Financial Accounts** (`/accounts`) یا **Net Profit Report** (`/reports/net-profit`) دیکھیں۔",
            'links' => $links,
            'source_ids' => ['policy:live_data_boundary'],
            'workflow_id' => null,
        ];
    }

    /**
     * Retrieves the top 3–4 relevant documentation sections for a user query.
     *
     * @return array{
     *   sections: array<int, array<string, mixed>>,
     *   has_verified_docs: bool,
     *   source_ids: array<int, string>,
     *   links: array<int, array<string, string>>,
     *   workflow_id: ?string,
     *   current_screen: ?array<string, mixed>,
     *   local_fallback: array<string, mixed>
     * }
     */
    public function retrieve(
        string $question,
        string $currentRoute = '/dashboard',
        ?string $matchedIntentId = null,
        ?string $screenGuideId = null,
        array $history = [],
        ?array $elementContext = null,
        string $explainMode = 'qa'
    ): array {
        $kb = $this->loadKnowledge();
        $learned = $this->loadLearnedKnowledge();
        $maxSections = max(1, min(4, (int) config('cube.max_retrieved_sections', 4)));

        // Combine question with recent user turn context when the question is a short follow-up
        $analysis = $this->analyzeText($question);
        if (count($analysis['meaningful_words']) <= 3 && ! empty($history)) {
            $recentUserText = '';
            foreach (array_reverse($history) as $msg) {
                if (($msg['role'] ?? '') === 'user' && ! empty($msg['content'])) {
                    $recentUserText = (string) $msg['content'];
                    break;
                }
            }
            if ($recentUserText !== '') {
                $combinedAnalysis = $this->analyzeText($question.' '.$recentUserText);
                $analysis['meaningful_words'] = array_values(array_unique(array_merge($analysis['meaningful_words'], $combinedAnalysis['meaningful_words'])));
                $analysis['meaningful_stems'] = array_values(array_unique(array_merge($analysis['meaningful_stems'], $combinedAnalysis['meaningful_stems'])));
                $analysis['words'] = array_values(array_unique(array_merge($analysis['words'], $combinedAnalysis['words'])));
                $analysis['stems'] = array_values(array_unique(array_merge($analysis['stems'], $combinedAnalysis['stems'])));
            }
        }

        $wordLookup = array_flip($analysis['words']);
        $stemLookup = array_flip($analysis['stems']);
        $cleaned = $analysis['cleaned'];

        $cleanRoute = '/'.ltrim(trim($currentRoute ?: '/dashboard'), '/');
        $targetScreenKey = $screenGuideId ?: $cleanRoute;

        $currentScreen = null;
        foreach (($kb['screens'] ?? []) as $scr) {
            if (($scr['route'] ?? '') === $targetScreenKey || ($scr['route'] ?? '') === $cleanRoute) {
                $currentScreen = $scr;
                break;
            }
        }
        if (! $currentScreen && ! empty($kb['screens'])) {
            $currentScreen = $kb['screens'][0];
        }

        $candidates = [];

        // 0. If Explain Cursor inspected a UI element, include its live DOM context + any learned control knowledge
        if (is_array($elementContext) && ! empty($elementContext)) {
            $controlKey = $this->buildControlKnowledgeKey($cleanRoute, $elementContext);
            $learnedControl = ($controlKey !== '' && isset($learned['learned_controls'][$controlKey]))
                ? $learned['learned_controls'][$controlKey]
                : null;

            $elLabel = trim((string) ($elementContext['label'] ?? ($elementContext['table_column'] ?? 'UI Control')));
            $elType = trim((string) ($elementContext['component_type'] ?? 'Interactive Control'));
            $elZone = trim((string) ($elementContext['zone'] ?? 'Active Screen'));
            $elShortcut = trim((string) ($elementContext['shortcut'] ?? ''));
            $baseEn = trim((string) ($elementContext['baseline_en'] ?? ''));
            $baseUr = trim((string) ($elementContext['baseline_ur'] ?? ''));

            $contentEnParts = [
                "Inspected UI Control: {$elLabel} ({$elType} in {$elZone} on `{$cleanRoute}`)",
            ];
            if ($elShortcut !== '') {
                $contentEnParts[] = "Shortcut: {$elShortcut}";
            }
            if ($learnedControl !== null && ! empty($learnedControl['en'])) {
                $contentEnParts[] = "AI-Improved Explanation:\n".$learnedControl['en'];
            }
            if ($baseEn !== '') {
                $contentEnParts[] = "Baseline Description:\n".$baseEn;
            }

            $contentUrParts = [
                "منتخب کردہ کنٹرول: {$elLabel} ({$elType} — `{$cleanRoute}`)",
            ];
            if ($learnedControl !== null && ! empty($learnedControl['ur'])) {
                $contentUrParts[] = "بہتر شدہ اے آئی وضاحت:\n".$learnedControl['ur'];
            }
            if ($baseUr !== '') {
                $contentUrParts[] = "بنیادی وضاحت:\n".$baseUr;
            }

            $controlSid = $learnedControl['source_id'] ?? ('control:cursor_'.substr(md5($controlKey ?: $elLabel), 0, 10));
            $candidates[] = [
                'source_id' => (string) $controlSid,
                'type' => 'control',
                'score' => 240,
                'title' => $learnedControl['title'] ?? [
                    'en' => "{$elLabel} — {$elType}",
                    'ur' => "{$elLabel} — {$elType}",
                ],
                'content_en' => implode("\n\n", $contentEnParts),
                'content_ur' => implode("\n\n", $contentUrParts),
                'links' => $currentScreen ? $this->buildScreenLinks($currentScreen) : [],
                'workflow_id' => $currentScreen['workflowId'] ?? null,
                'risk_level' => 'low',
            ];

            if ($currentScreen !== null) {
                $screenRoute = (string) ($currentScreen['route'] ?? $cleanRoute);
                $candidates[] = [
                    'source_id' => (string) ($currentScreen['id'] ?? ('screen:'.$screenRoute)),
                    'type' => 'screen',
                    'score' => 190,
                    'title' => $currentScreen['title'] ?? ['en' => $screenRoute, 'ur' => $screenRoute],
                    'content_en' => $this->formatScreenContentEn($currentScreen),
                    'content_ur' => $this->formatScreenContentUr($currentScreen),
                    'links' => $this->buildScreenLinks($currentScreen),
                    'workflow_id' => $currentScreen['workflowId'] ?? null,
                    'risk_level' => 'low',
                ];
            }
        }

        // 0B. Score Learned QA and Learned Controls from previous Generative AI improvements
        if ($cleaned !== '') {
            $exactQaKey = $cleanRoute.'::'.$cleaned;
            if (isset($learned['learned_qa'][$exactQaKey])) {
                $lqa = $learned['learned_qa'][$exactQaKey];
                $candidates[] = [
                    'source_id' => (string) ($lqa['source_id'] ?? 'learned:exact'),
                    'type' => 'learned_qa',
                    'score' => 210,
                    'title' => $lqa['title'] ?? ['en' => 'Karobar ERP Guide', 'ur' => 'کاروبار ایپ رہنمائی'],
                    'content_en' => (string) ($lqa['en'] ?? ''),
                    'content_ur' => (string) ($lqa['ur'] ?? ''),
                    'links' => ! empty($lqa['links']) ? $lqa['links'] : ($currentScreen ? $this->buildScreenLinks($currentScreen) : []),
                    'workflow_id' => $lqa['workflow_id'] ?? ($currentScreen['workflowId'] ?? null),
                    'risk_level' => 'low',
                ];
            }

            foreach (($learned['learned_controls'] ?? []) as $lCtrl) {
                $lcScore = 0;
                foreach (($lCtrl['keywords'] ?? []) as $kw) {
                    if ($this->hasBoundedPhrase($cleaned, $wordLookup, $stemLookup, (string) $kw)) {
                        $lcScore += 28;
                    }
                }
                if (($lCtrl['route'] ?? '') === $cleanRoute && $lcScore > 0) {
                    $lcScore += 20;
                }
                if ($lcScore >= 40) {
                    $candidates[] = [
                        'source_id' => (string) ($lCtrl['source_id'] ?? 'control:learned'),
                        'type' => 'control',
                        'score' => $lcScore,
                        'title' => $lCtrl['title'] ?? ['en' => '', 'ur' => ''],
                        'content_en' => (string) ($lCtrl['en'] ?? ''),
                        'content_ur' => (string) ($lCtrl['ur'] ?? ''),
                        'links' => $currentScreen ? $this->buildScreenLinks($currentScreen) : [],
                        'workflow_id' => $currentScreen['workflowId'] ?? null,
                        'risk_level' => 'low',
                    ];
                }
            }
        }

        // 1. Score Intents
        foreach (($kb['intents'] ?? []) as $intent) {
            $score = $this->scoreIntent($intent, $cleaned, $wordLookup, $stemLookup, $analysis);
            if ($matchedIntentId && ($intent['id'] ?? '') === $matchedIntentId && $score >= 0) {
                $score += 60;
            }
            if ($score >= 18) {
                $candidates[] = [
                    'source_id' => (string) ($intent['sourceId'] ?? ('intent:'.$intent['id'])),
                    'type' => 'intent',
                    'score' => $score,
                    'title' => $intent['title'] ?? ['en' => '', 'ur' => ''],
                    'content_en' => (string) ($intent['en'] ?? ''),
                    'content_ur' => (string) ($intent['ur'] ?? ''),
                    'links' => $intent['links'] ?? [],
                    'workflow_id' => $intent['workflowId'] ?? null,
                    'risk_level' => $intent['riskLevel'] ?? 'low',
                ];
            }
        }

        // 2. Score Screens & FAQs
        foreach (($kb['screens'] ?? []) as $screen) {
            $route = (string) ($screen['route'] ?? '');
            $sScore = $this->scoreScreen($screen, $analysis, $route === $cleanRoute || $route === $targetScreenKey);

            if ($sScore >= 18) {
                $candidates[] = [
                    'source_id' => (string) ($screen['id'] ?? ('screen:'.$route)),
                    'type' => 'screen',
                    'score' => $sScore,
                    'title' => $screen['title'] ?? ['en' => $route, 'ur' => $route],
                    'content_en' => $this->formatScreenContentEn($screen),
                    'content_ur' => $this->formatScreenContentUr($screen),
                    'links' => $this->buildScreenLinks($screen),
                    'workflow_id' => $screen['workflowId'] ?? null,
                    'risk_level' => 'low',
                ];
            }

            foreach (($screen['faqs'] ?? []) as $faq) {
                $faqScore = $this->scoreFaq($faq, $cleaned, $analysis, $route === $cleanRoute);
                if ($faqScore >= 36) {
                    $candidates[] = [
                        'source_id' => (string) ($faq['id'] ?? ('faq:'.$route)),
                        'type' => 'faq',
                        'score' => $faqScore,
                        'title' => $faq['q'] ?? ['en' => '', 'ur' => ''],
                        'content_en' => (string) (($faq['a']['en'] ?? '')."\n\nScreen: ".($screen['title']['en'] ?? $route)." (`{$route}`)"),
                        'content_ur' => (string) (($faq['a']['ur'] ?? '')."\n\nمتعلقہ اسکرین: ".($screen['title']['ur'] ?? $route)),
                        'links' => $this->buildScreenLinks($screen),
                        'workflow_id' => $screen['workflowId'] ?? null,
                        'risk_level' => 'low',
                    ];
                }
            }
        }

        // 3. Score Control Dictionary
        foreach (($kb['controls'] ?? []) as $control) {
            $cScore = 0;
            foreach (($control['keywords'] ?? []) as $kw) {
                if ($this->hasBoundedPhrase($cleaned, $wordLookup, $stemLookup, (string) $kw)) {
                    $cScore += 32;
                }
            }
            if ($cScore >= 32) {
                $candidates[] = [
                    'source_id' => (string) ($control['id'] ?? 'control:0'),
                    'type' => 'control',
                    'score' => $cScore,
                    'title' => $control['title'] ?? ['en' => '', 'ur' => ''],
                    'content_en' => (string) ($control['en'] ?? ''),
                    'content_ur' => (string) ($control['ur'] ?? ''),
                    'links' => $currentScreen ? $this->buildScreenLinks($currentScreen) : [],
                    'workflow_id' => null,
                    'risk_level' => 'low',
                ];
            }
        }

        usort($candidates, static fn (array $a, array $b): int => $b['score'] <=> $a['score']);

        // Deduplicate by source_id, apply any AI-learned improvements to static sources, and keep at most 3–4 sections
        $selected = [];
        $seenIds = [];
        $improvedSources = $learned['improved_sources'] ?? [];
        foreach ($candidates as $cand) {
            $sid = $cand['source_id'];
            if (isset($seenIds[$sid])) {
                continue;
            }
            if (isset($improvedSources[$sid]) && is_array($improvedSources[$sid])) {
                $imp = $improvedSources[$sid];
                if (! empty($imp['title_en'])) {
                    $cand['title']['en'] = (string) $imp['title_en'];
                }
                if (! empty($imp['title_ur'])) {
                    $cand['title']['ur'] = (string) $imp['title_ur'];
                }
                if (! empty($imp['answer_en'])) {
                    $cand['content_en'] = (string) $imp['answer_en'];
                }
                if (! empty($imp['answer_ur'])) {
                    $cand['content_ur'] = (string) $imp['answer_ur'];
                }
                $cand['ai_improved'] = true;
            }
            $seenIds[$sid] = true;
            $selected[] = $cand;
            if (count($selected) >= $maxSections) {
                break;
            }
        }

        // If an intent was selected, also enrich with its primary screen blueprint (fields, examples, common mistakes)
        if (! empty($selected) && count($selected) < $maxSections) {
            $primaryPath = (string) ($selected[0]['links'][0]['path'] ?? '');
            if ($primaryPath !== '') {
                $screenSid = 'screen:'.$primaryPath;
                if (! isset($seenIds[$screenSid])) {
                    foreach (($kb['screens'] ?? []) as $scr) {
                        if (($scr['route'] ?? '') === $primaryPath) {
                            $seenIds[$screenSid] = true;
                            $selected[] = [
                                'source_id' => (string) ($scr['id'] ?? $screenSid),
                                'type' => 'screen',
                                'score' => 50,
                                'title' => $scr['title'] ?? ['en' => $primaryPath, 'ur' => $primaryPath],
                                'content_en' => $this->formatScreenContentEn($scr),
                                'content_ur' => $this->formatScreenContentUr($scr),
                                'links' => $this->buildScreenLinks($scr),
                                'workflow_id' => $scr['workflowId'] ?? null,
                                'risk_level' => 'low',
                            ];
                            break;
                        }
                    }
                }
            }
        }

        // Always ground in the user's active screen blueprint + Karobar ERP system overview if no specific intent matched yet
        if (empty($selected) && $currentScreen !== null && $cleaned !== '') {
            $route = (string) ($currentScreen['route'] ?? '/dashboard');
            $screenSid = (string) ($currentScreen['id'] ?? ('screen:'.$route));
            $seenIds[$screenSid] = true;
            $selected[] = [
                'source_id' => $screenSid,
                'type' => 'screen',
                'score' => 25,
                'title' => $currentScreen['title'] ?? ['en' => $route, 'ur' => $route],
                'content_en' => $this->formatScreenContentEn($currentScreen),
                'content_ur' => $this->formatScreenContentUr($currentScreen),
                'links' => $this->buildScreenLinks($currentScreen),
                'workflow_id' => $currentScreen['workflowId'] ?? null,
                'risk_level' => 'low',
            ];

            if (count($selected) < $maxSections && ! isset($seenIds['system:karobar_erp_overview'])) {
                $seenIds['system:karobar_erp_overview'] = true;
                $selected[] = [
                    'source_id' => 'system:karobar_erp_overview',
                    'type' => 'system_overview',
                    'score' => 20,
                    'title' => [
                        'en' => 'Karobar ERP Software Architecture & Core Workflows',
                        'ur' => 'کاروبار ایپ سافٹ ویئر کا مکمل ڈھانچہ اور ورک فلو',
                    ],
                    'content_en' => "Karobar ERP is a complete pharmacy & retail ERP with 4-pillar synchronization (Stock/Batches, Party Ledgers, Cash/Bank Treasury, Double-Entry General Ledger):\n"
                        ."1. Catalog & Inventory (`/products`, `/categories`, `/brands`, `/suppliers`, `/stock-adjustments`, `/stock-transfers`, `/stock-audits`): Products track Pack Size, Unit vs Pack pricing, Formulation (Generic Salt), FEFO batches, and Expiry Warning Days.\n"
                        ."2. Procurement (`/purchase-orders` -> `/goods-receive-notes` -> `/purchase-invoices` & `/purchase-returns`): Purchase Orders plan supplier demand; GRNs verify physical delivery; Purchase Invoices add batch stock, update weighted-average cost, and credit Supplier Payable Ledger.\n"
                        ."3. Sales & POS (`/sale-invoices/pos`, `/sale-invoices`, `/sale-returns`, `/quotations`): Barcode POS supports Pack vs Unit (loose tablet) billing, FEFO batch selection, F8 Hold Bill, Regular Customer prescription auto-fill, and split Cash/Card/Credit checkout.\n"
                        ."4. Ledgers, Finance & HR (`/customer-ledger`, `/supplier-ledger`, `/cash-drawer`, `/expenses`, `/accounts`, `/journal-entries`, `/employees`, `/payroll`, `/reports`): Real-time Customer Udhar recovery, Supplier payments, Z-Report shift reconciliation, and automated Double-Entry financial statements.",
                    'content_ur' => "کاروبار ایپ (Karobar ERP) فارمیسی اور ریٹیل کاروبار کا مکمل سافٹ ویئر ہے جس میں اسٹاک/بیچز، کسٹمر و سپلائر کھاتے، کیش ڈراور/بینک، اور ڈبل انٹری جنرل لیجر خودکار طور پر منسلک ہیں:\n"
                        ."1. انوینٹری اور کیٹلاگ (`/products`, `/categories`, `/brands`, `/suppliers`): پیک سائز، پیک اور کھلی گولی (Unit) کی قیمتیں، فارمولیشن (Generic Salt)، اور ایکسپائری بیچ ٹریکنگ۔\n"
                        ."2. خریداری (`/purchase-orders` -> `/goods-receive-notes` -> `/purchase-invoices`): پرچیز آرڈر سے ڈیمانڈ لسٹ، GRN سے مال کی چیکنگ، اور پرچیز انوائس سے اسٹاک اور سپلائر کھاتہ اپڈیٹ ہوتا ہے۔\n"
                        ."3. سیلز اور POS (`/sale-invoices/pos`, `/sale-returns`): بارکوڈ اسکیننگ، ڈبہ یا کھلی گولی (Unit) فروخت، FEFO بیچ سلیکشن، اور نقد یا ادھار بلنگ۔\n"
                        ."4. کھاتے، فنانس اور رپورٹس (`/customer-ledger`, `/supplier-ledger`, `/cash-drawer`, `/accounts`, `/reports`): گاہکوں کی وصولی، سپلائر ادائیگی، کیش ڈراور شفٹ، اور مکمل منافع و نقصان رپورٹس۔",
                    'links' => [
                        ['path' => '/dashboard', 'en' => 'Dashboard', 'ur' => 'ڈیش بورڈ'],
                        ['path' => '/products', 'en' => 'Products Catalog', 'ur' => 'پروڈکٹس کیٹلاگ'],
                        ['path' => '/sale-invoices/pos', 'en' => 'POS Billing', 'ur' => 'پی او ایس بلنگ'],
                    ],
                    'workflow_id' => null,
                    'risk_level' => 'low',
                ];
            }
        }

        $hasVerifiedDocs = count($selected) > 0;

        // Collect verified links and workflow ID from top retrieved sections
        $links = [];
        $seenPaths = [];
        $workflowId = null;

        foreach ($selected as $sec) {
            if ($workflowId === null && ! empty($sec['workflow_id'])) {
                $workflowId = (string) $sec['workflow_id'];
            }
            foreach (($sec['links'] ?? []) as $lnk) {
                $p = (string) ($lnk['path'] ?? '');
                if ($p !== '' && ! isset($seenPaths[$p])) {
                    $seenPaths[$p] = true;
                    $links[] = [
                        'path' => $p,
                        'en' => (string) ($lnk['en'] ?? $p),
                        'ur' => (string) ($lnk['ur'] ?? ($lnk['en'] ?? $p)),
                    ];
                }
                if (count($links) >= 4) {
                    break 2;
                }
            }
        }

        $sourceIds = array_values(array_map(static fn (array $s): string => $s['source_id'], $selected));

        $localFallback = $this->buildLocalFallbackAnswer(
            $question,
            $selected,
            $currentScreen,
            $links,
            $workflowId,
            $sourceIds
        );

        return [
            'sections' => $selected,
            'has_verified_docs' => $hasVerifiedDocs,
            'source_ids' => $sourceIds,
            'links' => $links,
            'workflow_id' => $workflowId,
            'current_screen' => $currentScreen,
            'local_fallback' => $localFallback,
        ];
    }

    protected function scoreIntent(
        array $intent,
        string $cleaned,
        array $wordLookup,
        array $stemLookup,
        array $analysis
    ): int {
        if ($cleaned === '') {
            return 0;
        }

        if (! empty($intent['onlyWhenShort']) && count($analysis['words']) > 5) {
            return 0;
        }

        foreach (($intent['negativePhrases'] ?? []) as $neg) {
            if ($this->hasBoundedPhrase($cleaned, $wordLookup, $stemLookup, (string) $neg)) {
                return -100;
            }
        }

        $score = 0;

        foreach (($intent['phrases'] ?? []) as $phrase) {
            $p = trim(mb_strtolower((string) $phrase, 'UTF-8'));
            if ($cleaned === $p) {
                $score += 140;
            } elseif ($this->hasBoundedPhrase($cleaned, $wordLookup, $stemLookup, $p)) {
                $wordCount = substr_count($p, ' ') + 1;
                $score += 55 + ($wordCount * 22);
            }
        }

        $requiredGroups = $intent['requiredGroups'] ?? [];
        if (! empty($requiredGroups)) {
            $allMatched = true;
            $matchedTokens = 0;
            foreach ($requiredGroups as $group) {
                $groupHit = false;
                foreach ((array) $group as $candidate) {
                    if ($this->hasBoundedPhrase($cleaned, $wordLookup, $stemLookup, (string) $candidate)) {
                        $groupHit = true;
                        $matchedTokens++;
                    }
                }
                if (! $groupHit) {
                    $allMatched = false;
                    break;
                }
            }
            if ($allMatched) {
                $score += 65 + (count($requiredGroups) * 18) + ($matchedTokens * 6);
            }
        }

        foreach (($intent['keywords'] ?? []) as $kw) {
            if ($this->hasBoundedPhrase($cleaned, $wordLookup, $stemLookup, (string) $kw)) {
                $score += 24;
            }
        }

        return $score;
    }

    protected function scoreScreen(array $screen, array $analysis, bool $isCurrentScreen): int
    {
        if (empty($analysis['meaningful_words'])) {
            return 0;
        }

        $titleText = ($screen['title']['en'] ?? '').' '.($screen['title']['ur'] ?? '').' '.($screen['route'] ?? '');
        $fieldTerms = [];
        foreach (($screen['fields'] ?? []) as $f) {
            $fieldTerms[] = ($f['term']['en'] ?? '').' '.($f['term']['ur'] ?? '').' '.($f['en'] ?? '');
        }
        $bodyText = ($screen['section']['en'] ?? '').' '.($screen['summary']['en'] ?? '').' '.($screen['summary']['ur'] ?? '').' '
            .implode(' ', $screen['steps']['en'] ?? []).' '.implode(' ', $screen['features']['en'] ?? []).' '
            .implode(' ', $fieldTerms).' '.($screen['impacts']['en'] ?? '');

        $titleAnalysis = $this->analyzeText($titleText);
        $bodyAnalysis = $this->analyzeText($bodyText);

        $titleWords = array_flip($titleAnalysis['words']);
        $titleStems = array_flip($titleAnalysis['stems']);
        $bodyWords = array_flip($bodyAnalysis['words']);
        $bodyStems = array_flip($bodyAnalysis['stems']);

        $score = 0;
        $titleHits = 0;

        foreach ($analysis['meaningful_words'] as $idx => $w) {
            $st = $analysis['meaningful_stems'][$idx] ?? $this->stemToken($w);
            if (isset($titleWords[$w]) || isset($titleStems[$st])) {
                $score += 28;
                $titleHits++;
            } elseif (isset($bodyWords[$w]) || isset($bodyStems[$st])) {
                $score += 9;
            }
        }

        if ($titleHits >= 2) {
            $score += 25;
        }

        if ($isCurrentScreen && $score > 0) {
            $score += 14;
        }

        return $score;
    }

    protected function scoreFaq(array $faq, string $cleaned, array $analysis, bool $isCurrentScreen): int
    {
        $qEn = (string) ($faq['q']['en'] ?? '');
        $qUr = (string) ($faq['q']['ur'] ?? '');
        $faqAnalysis = $this->analyzeText($qEn.' '.$qUr);
        if ($faqAnalysis['cleaned'] !== '' && $cleaned === $faqAnalysis['cleaned']) {
            return 130;
        }

        $faqStems = array_flip($faqAnalysis['stems']);
        $hits = 0;
        foreach ($analysis['meaningful_stems'] as $st) {
            if (mb_strlen($st, 'UTF-8') > 2 && isset($faqStems[$st])) {
                $hits++;
            }
        }

        if ($hits < 2) {
            return 0;
        }

        return ($hits * 24) + ($isCurrentScreen ? 8 : 0);
    }

    protected function formatScreenContentEn(array $screen): string
    {
        $parts = [];
        $route = (string) ($screen['route'] ?? '');
        $title = (string) ($screen['title']['en'] ?? $route);
        $parts[] = "Screen: {$title} (`{$route}`)";

        if (! empty($screen['summary']['en'])) {
            $parts[] = 'Summary: '.$screen['summary']['en'];
        }

        if (! empty($screen['steps']['en'])) {
            $steps = [];
            foreach ($screen['steps']['en'] as $idx => $s) {
                $steps[] = ($idx + 1).'. '.$s;
            }
            $parts[] = "Steps:\n".implode("\n", $steps);
        }

        if (! empty($screen['fields'])) {
            $fields = [];
            foreach (array_slice($screen['fields'], 0, 5) as $f) {
                $fields[] = '- '.($f['term']['en'] ?? 'Field').': '.($f['en'] ?? '');
            }
            $parts[] = "Key Fields:\n".implode("\n", $fields);
        }

        if (! empty($screen['example']['en'])) {
            $parts[] = 'Example: '.$screen['example']['en'];
        }

        if (! empty($screen['commonMistake']['en'])) {
            $parts[] = 'Common Mistake to Avoid: '.$screen['commonMistake']['en'];
        }

        if (! empty($screen['impacts']['en'])) {
            $parts[] = 'Accounting & Stock Impact: '.$screen['impacts']['en'];
        }

        return implode("\n\n", $parts);
    }

    protected function formatScreenContentUr(array $screen): string
    {
        $parts = [];
        $route = (string) ($screen['route'] ?? '');
        $title = (string) ($screen['title']['ur'] ?? ($screen['title']['en'] ?? $route));
        $parts[] = "اسکرین: {$title} (`{$route}`)";

        if (! empty($screen['summary']['ur'])) {
            $parts[] = 'خلاصہ: '.$screen['summary']['ur'];
        }

        if (! empty($screen['steps']['ur'])) {
            $steps = [];
            foreach ($screen['steps']['ur'] as $idx => $s) {
                $steps[] = ($idx + 1).'. '.$s;
            }
            $parts[] = "طریقہ کار:\n".implode("\n", $steps);
        }

        if (! empty($screen['fields'])) {
            $fields = [];
            foreach (array_slice($screen['fields'], 0, 5) as $f) {
                $fields[] = '- '.($f['term']['ur'] ?? ($f['term']['en'] ?? 'فیلڈ')).': '.($f['ur'] ?? ($f['en'] ?? ''));
            }
            $parts[] = "اہم خانے اور فیلڈز:\n".implode("\n", $fields);
        }

        if (! empty($screen['example']['ur'])) {
            $parts[] = 'عملی مثال: '.$screen['example']['ur'];
        }

        if (! empty($screen['commonMistake']['ur'])) {
            $parts[] = 'عام غلطی اور احتیاط: '.$screen['commonMistake']['ur'];
        }

        if (! empty($screen['impacts']['ur'])) {
            $parts[] = 'اسٹاک اور کھاتوں پر اثر: '.$screen['impacts']['ur'];
        }

        return implode("\n\n", $parts);
    }

    protected function buildScreenLinks(array $screen): array
    {
        $links = [];
        $route = (string) ($screen['route'] ?? '');
        if ($route !== '' && ! str_contains($route, ':')) {
            $links[] = [
                'path' => $route,
                'en' => 'Open '.($screen['title']['en'] ?? $route),
                'ur' => ($screen['title']['ur'] ?? $route).' کھولیں',
            ];
        }

        foreach (array_slice($screen['relatedRoutes'] ?? [], 0, 2) as $rel) {
            if (! empty($rel['path']) && $rel['path'] !== $route) {
                $links[] = [
                    'path' => (string) $rel['path'],
                    'en' => (string) ($rel['en'] ?? $rel['path']),
                    'ur' => (string) ($rel['ur'] ?? ($rel['en'] ?? $rel['path'])),
                ];
            }
        }

        return $links;
    }

    protected function buildLocalFallbackAnswer(
        string $question,
        array $selectedSections,
        ?array $currentScreen,
        array $links,
        ?string $workflowId,
        array $sourceIds
    ): array {
        if (! empty($selectedSections)) {
            $top = $selectedSections[0];

            return [
                'title_en' => (string) ($top['title']['en'] ?? 'Karobar ERP Feature Guide'),
                'title_ur' => (string) ($top['title']['ur'] ?? 'کاروبار ایپ رہنمائی'),
                'answer_en' => (string) ($top['content_en'] ?? ''),
                'answer_ur' => (string) ($top['content_ur'] ?? ''),
                'links' => $links,
                'workflow_id' => $workflowId,
                'source_ids' => $sourceIds,
            ];
        }

        $screenTitleEn = (string) ($currentScreen['title']['en'] ?? 'Business Dashboard');
        $screenTitleUr = (string) ($currentScreen['title']['ur'] ?? 'بزنس ڈیش بورڈ');
        $screenRoute = (string) ($currentScreen['route'] ?? '/dashboard');
        $summaryEn = (string) ($currentScreen['summary']['en'] ?? '');
        $summaryUr = (string) ($currentScreen['summary']['ur'] ?? '');

        $fallbackLinks = [];
        if ($screenRoute !== '' && ! str_contains($screenRoute, ':')) {
            $fallbackLinks[] = [
                'path' => $screenRoute,
                'en' => "Current: {$screenTitleEn}",
                'ur' => $screenTitleUr,
            ];
        }
        $fallbackLinks[] = ['path' => '/sale-invoices/pos', 'en' => 'Barcode POS', 'ur' => 'بارکوڈ POS'];
        $fallbackLinks[] = ['path' => '/purchase-invoices/create', 'en' => 'Add Stock (Purchase Invoice)', 'ur' => 'نیا اسٹاک ڈالیں'];

        return [
            'title_en' => "Verified Documentation Needed — {$screenTitleEn}",
            'title_ur' => "مستند معلومات درکار ہیں — {$screenTitleUr}",
            'answer_en' => "I do not have enough verified documentation in the Karobar-App knowledge base for **\"{$question}\"**.\n\n"
                ."Please clarify which Karobar-App screen or workflow you are working on.\n\n"
                ."**Your Current Screen ({$screenTitleEn} — `{$screenRoute}`):**\n{$summaryEn}\n\n"
                ."**Examples of questions I can guide you through:**\n"
                ."• *\"How to create a Purchase Order or Purchase Invoice\"*\n"
                ."• *\"How to sell loose tablets or hold a bill on POS\"*\n"
                ."• *\"How to record Customer Udhar or Supplier Payment\"*",
            'answer_ur' => "کاروبار ایپ کی مستند گائیڈ میں آپ کے سوال **\"{$question}\"** کے بارے میں کافی تصدیق شدہ معلومات موجود نہیں ہیں۔\n\n"
                ."براہِ کرم وضاحت کریں کہ آپ کس اسکرین یا فیچر کے بارے میں جاننا چاہتے ہیں۔\n\n"
                ."**آپ کی موجودہ اسکرین ({$screenTitleUr} — `{$screenRoute}`):**\n{$summaryUr}\n\n"
                ."**آپ یہ سوالات پوچھ سکتے ہیں:**\n"
                ."• *\"پرچیز آرڈر یا نیا اسٹاک کیسے ڈالیں\"*\n"
                ."• *\"کھلی گولیاں کیسے بیچیں یا بل ہولڈ کیسے کریں\"*\n"
                ."• *\"گاہک کا ادھار کھاتہ یا سپلائر پیمنٹ کیسے درج کریں\"*",
            'links' => $fallbackLinks,
            'workflow_id' => $currentScreen['workflowId'] ?? null,
            'source_ids' => $screenRoute !== '' ? ["screen:{$screenRoute}"] : [],
        ];
    }
}

