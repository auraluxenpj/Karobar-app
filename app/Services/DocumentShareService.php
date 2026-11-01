<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\CustomerLedger;
use App\Models\Payment;
use App\Models\PurchaseOrder;
use App\Models\SaleInvoice;
use App\Models\Setting;
use App\Models\Supplier;
use App\Models\SupplierLedger;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use InvalidArgumentException;
use RuntimeException;

class DocumentShareService
{
    public const SUPPORTED_TYPES = [
        'sale_invoice',
        'delivery_challan',
        'quotation',
        'customer_ledger',
        'supplier_ledger',
        'payment',
        'purchase_order',
        'purchase_invoice',
        'sale_return',
        'purchase_return',
        'stock_disposal',
        'cash_drawer_session',
        'stocktake_session',
        'regular_refill_reminder',
    ];

    public const SUPPORTED_PDF_DESIGNS = [
        'standard',
        'minimal',
        'detailed',
        'compact',
        'bold',
        'barcode',
    ];

    /**
     * Resolve the active PDF design template ('standard', 'minimal', 'detailed', 'compact', 'bold', 'barcode').
     */
    public function resolvePdfDesign(?string $requested = null, ?Setting $setting = null): string
    {
        $candidate = strtolower(trim((string) $requested));
        if (in_array($candidate, self::SUPPORTED_PDF_DESIGNS, true)) {
            return $candidate;
        }

        if ($setting === null) {
            try {
                if (Schema::hasTable('settings')) {
                    $setting = Setting::first();
                }
            } catch (\Throwable) {
                $setting = null;
            }
        }

        $saved = strtolower(trim((string) ($setting?->a4_template ?? 'standard')));
        return in_array($saved, self::SUPPORTED_PDF_DESIGNS, true) ? $saved : 'standard';
    }

    /**
     * Normalize a local or international phone number into E.164 digits (without '+' or '00')
     * suitable for https://wa.me/{phone}.
     * Examples:
     *   "0300-1234567"   -> "923001234567"
     *   "+92 321 9876543"-> "923219876543"
     *   "00923331112233" -> "923331112233"
     *   "3001234567"     -> "923001234567"
     */
    public function normalizePhone(?string $phone, ?string $defaultCountryCode = null): string
    {
        if (!$phone) {
            return '';
        }

        if ($defaultCountryCode === null || trim($defaultCountryCode) === '') {
            $defaultCountryCode = (string) config('services.whatsapp.default_country_code', '92');
        }
        $defaultCountryCode = preg_replace('/\D+/', '', $defaultCountryCode) ?: '92';

        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        if ($digits === '') {
            return '';
        }

        if (str_starts_with($digits, '00')) {
            $digits = substr($digits, 2);
        }

        // Pakistani 11-digit mobile starting with 03 (e.g. 03001234567)
        if (strlen($digits) === 11 && str_starts_with($digits, '03')) {
            return $defaultCountryCode . substr($digits, 1);
        }

        // Pakistani 10-digit mobile starting with 3 (e.g. 3001234567)
        if (strlen($digits) === 10 && str_starts_with($digits, '3')) {
            return $defaultCountryCode . $digits;
        }

        // Generic leading 0 for local numbers (10-11 digits)
        if (str_starts_with($digits, '0') && strlen($digits) >= 10 && strlen($digits) <= 11) {
            return $defaultCountryCode . substr($digits, 1);
        }

        return $digits;
    }

    /**
     * Build a 30-minute cryptographically signed public PDF URL for WhatsApp / external sharing.
     */
    public function buildSignedPdfUrl(string $type, array $params): string
    {
        $query = array_filter([
            'type'        => $type,
            'id'          => $params['id'] ?? null,
            'customer_id' => $params['customer_id'] ?? null,
            'supplier_id' => $params['supplier_id'] ?? null,
            'from'        => $params['from'] ?? null,
            'to'          => $params['to'] ?? null,
            'template'    => $params['template'] ?? null,
        ], fn ($v) => $v !== null && $v !== '');

        return URL::temporarySignedRoute(
            'public.documents.pdf',
            now()->addMinutes(30),
            $query
        );
    }

    /**
     * Resolve the active WhatsApp API provider identifier.
     */
    public function resolveWhatsAppProvider(): string
    {
        $provider = strtolower(trim((string) config('services.whatsapp.provider', 'meta_cloud')));
        $allowed = [
            'local_agent',
            'waha',
            'evolution_api',
            'whapi_cloud',
            'wasender',
            'ultramsg',
            'green_api',
            'meta_cloud',
            'custom_http',
        ];
        if (!in_array($provider, $allowed, true)) {
            return 'meta_cloud';
        }

        return $provider;
    }

    /**
     * Check whether server-side WhatsApp API / Agent credentials are configured and enabled.
     */
    public function isWhatsAppApiConfigured(): bool
    {
        try {
            if (Schema::hasTable('settings')) {
                $setting = Setting::first();
                $setting?->applyWhatsAppConfig();
            }
        } catch (\Throwable) {
            // Ignore when database/table is unavailable
        }

        if (config('services.whatsapp.enabled') === false) {
            return false;
        }

        $provider = $this->resolveWhatsAppProvider();
        $token = trim((string) config('services.whatsapp.access_token', ''));
        $phoneOrInstanceId = trim((string) config('services.whatsapp.phone_number_id', ''));
        $apiUrl = trim((string) config('services.whatsapp.api_url', ''));

        return match ($provider) {
            'local_agent'                         => (bool) config('services.whatsapp.enabled', false) || $apiUrl !== '' || $token !== '',
            'waha'                                => $apiUrl !== '' || $token !== '',
            'evolution_api'                       => $apiUrl !== '' && $token !== '',
            'whapi_cloud', 'wasender'             => $token !== '',
            'custom_http'                         => $apiUrl !== '',
            'ultramsg', 'green_api', 'meta_cloud' => $token !== '' && $phoneOrInstanceId !== '',
            default                               => $token !== '' && $phoneOrInstanceId !== '',
        };
    }

    /**
     * Prepare share metadata (recipient details, pre-formatted WhatsApp caption, Email subject & body, and PDF endpoints).
     */
    public function buildMetadata(string $type, array $params): array
    {
        $apiConfigured = $this->isWhatsAppApiConfigured();
        $context = $this->resolveDocumentContext($type, $params);
        $selectedDesign = $this->resolvePdfDesign($params['template'] ?? null, $context['view_data']['setting'] ?? null);
        $params['template'] = $selectedDesign;
        $signedPdfUrl = $this->buildSignedPdfUrl($type, $params);
        $normalizedPhone = $this->normalizePhone($context['recipient_phone']);

        $whatsappTextEn = trim((string) ($context['whatsapp_text_en'] ?? $context['whatsapp_text'] ?? ''));
        $whatsappTextUr = trim((string) ($context['whatsapp_text_ur'] ?? $this->translateDocumentMessageToUrdu($whatsappTextEn)));
        $emailSubjectEn = trim((string) ($context['email_subject_en'] ?? $context['email_subject'] ?? ''));
        $emailSubjectUr = trim((string) ($context['email_subject_ur'] ?? $this->translateDocumentMessageToUrdu($emailSubjectEn)));
        $emailBodyEn    = trim((string) ($context['email_body_en'] ?? $context['email_body'] ?? ''));
        $emailBodyUr    = trim((string) ($context['email_body_ur'] ?? $this->translateDocumentMessageToUrdu($emailBodyEn)));

        $whatsappCaption = $whatsappTextEn;
        $whatsappUrl = $normalizedPhone !== ''
            ? 'https://wa.me/' . $normalizedPhone . '?text=' . rawurlencode($whatsappCaption)
            : 'https://wa.me/?text=' . rawurlencode($whatsappCaption);
        $whatsappUrlUr = $normalizedPhone !== ''
            ? 'https://wa.me/' . $normalizedPhone . '?text=' . rawurlencode($whatsappTextUr)
            : 'https://wa.me/?text=' . rawurlencode($whatsappTextUr);

        $apiQuery = http_build_query(array_filter([
            'type'        => $type,
            'id'          => $params['id'] ?? null,
            'customer_id' => $params['customer_id'] ?? null,
            'supplier_id' => $params['supplier_id'] ?? null,
            'from'        => $params['from'] ?? null,
            'to'          => $params['to'] ?? null,
            'template'    => $selectedDesign,
        ], fn ($v) => $v !== null && $v !== ''));

        return [
            'type'                          => $type,
            'document_title'                => $context['title'],
            'filename'                      => $context['filename'],
            'pdf_template'                  => $selectedDesign,
            'available_pdf_templates'       => [
                ['id' => 'standard', 'name' => 'Standard Corporate', 'desc' => 'Classic navy header with structured borders'],
                ['id' => 'minimal',  'name' => 'Minimal Clean',      'desc' => 'Light borders and airy ink-saving layout'],
                ['id' => 'detailed', 'name' => 'Executive Detailed', 'desc' => 'Royal blue theme with product codes & full breakdown'],
                ['id' => 'compact',  'name' => 'Compact High-Density', 'desc' => 'Condensed spacing to fit maximum items per page'],
                ['id' => 'bold',     'name' => 'Bold Modern',        'desc' => 'High-contrast emerald header banner'],
                ['id' => 'barcode',  'name' => 'Barcode & SKU',      'desc' => 'Includes SKU/barcode column and reference strip'],
            ],
            'party_type'                    => $context['party_type'],
            'party_id'                      => $context['party_id'],
            'recipient_name'                => $context['recipient_name'],
            'recipient_phone'               => $context['recipient_phone'] ?? '',
            'normalized_phone'              => $normalizedPhone,
            'recipient_email'               => $context['recipient_email'] ?? '',
            'whatsapp_text'                 => $whatsappCaption,
            'whatsapp_text_en'              => $whatsappTextEn,
            'whatsapp_text_ur'              => $whatsappTextUr,
            'whatsapp_url'                  => $whatsappUrl,
            'whatsapp_url_ur'               => $whatsappUrlUr,
            'whatsapp_api_configured'       => $apiConfigured,
            'whatsapp_provider'             => $this->resolveWhatsAppProvider(),
            'whatsapp_default_country_code' => (string) config('services.whatsapp.default_country_code', '92'),
            'email_subject'                 => $emailSubjectEn,
            'email_subject_en'              => $emailSubjectEn,
            'email_subject_ur'              => $emailSubjectUr,
            'email_body'                    => $emailBodyEn,
            'email_body_en'                 => $emailBodyEn,
            'email_body_ur'                 => $emailBodyUr,
            'signed_pdf_url'                => $signedPdfUrl,
            'pdf_preview_url'               => url('/api/share/pdf?' . $apiQuery),
            'pdf_download_url'              => url('/api/share/pdf?' . $apiQuery . '&download=1'),
        ];
    }

    /**
     * Convert standard English document labels to Urdu for non-invoice document types.
     */
    protected function translateDocumentMessageToUrdu(string $text): string
    {
        $replacements = [
            'Customer Account Statement' => '*کسٹمر کھاتہ اسٹیٹمنٹ (Account Statement)*',
            'Supplier Account Statement' => '*سپلائر کھاتہ اسٹیٹمنٹ (Supplier Statement)*',
            'Official Payment Receipt:'  => 'کیش وصولی رسید:',
            'Payment Voucher:'           => 'پیمنٹ واؤچر:',
            'Purchase Order:'            => 'پرچیز آرڈر:',
            'Purchase Invoice (GRN):'    => 'پرچیز انوائس (GRN):',
            'Sale Return / Credit Note:' => 'سیل ریٹرن / کریڈٹ نوٹ:',
            'Purchase Return / Debit Note:' => 'پرچیز ریٹرن / ڈیبٹ نوٹ:',
            'Delivery Challan / Gate Pass:' => 'ڈیلیوری چالان / گیٹ پاس:',
            'Price Quotation:'           => 'پرائس کوٹیشن:',
            'Customer:'                  => 'محترم کسٹمر:',
            'Supplier:'                  => 'محترم سپلائر:',
            'Consignee:'                 => 'وصول کنندہ:',
            'Prepared For:'              => 'کسٹمر کا نام:',
            'Statement Period:'          => 'مدت:',
            'Order Date:'                => 'آرڈر کی تاریخ:',
            'Expected Delivery:'         => 'متوقع ڈیلیوری:',
            'Date:'                      => 'تاریخ:',
            'Total Invoiced:'            => 'کل بل رقم:',
            'Total Received:'            => 'کل وصول شدہ رقم:',
            'Total Paid:'                => 'کل ادا شدہ رقم:',
            'Net Balance Due:'           => 'موجودہ واجب الادا بقایا:',
            'Net Payable Balance:'       => 'موجودہ قابلِ ادا بقایا:',
            'Amount Received:'           => 'وصول شدہ رقم:',
            'Amount Paid:'               => 'ادا شدہ رقم:',
            'Payment Method:'            => 'طریقہ کار:',
            'Reference:'                 => 'حوالہ نمبر:',
            'Total Line Items:'          => 'آئٹمز کی تعداد:',
            'Order Total:'               => 'کل آرڈر رقم:',
            'Invoice Total:'             => 'کل بل:',
            'Balance Payable:'           => 'بقایا واجب الادا:',
            'Return Credit Total:'       => 'واپسی بل کی کل رقم:',
            'Return Debit Total:'        => 'واپسی بل کی کل رقم:',
            'Estimated Total:'           => 'متوقع کل رقم:',
            'Please find your detailed account statement attached.' => 'آپ کے کھاتے کی مکمل تفصیل پی ڈی ایف (PDF) فائل کی صورت میں منسلک ہے۔\nآپ کے تعاون کا شکریہ۔',
            'Please find the supplier ledger statement attached.'   => 'سپلائر کھاتے کی مکمل تفصیل پی ڈی ایف (PDF) فائل کی صورت میں منسلک ہے۔\nآپ کے تعاون کا شکریہ۔',
            'Please find the official voucher attached.'            => 'پیمنٹ واؤچر پی ڈی ایف (PDF) فائل کی صورت میں منسلک ہے۔\nآپ کے تعاون کا شکریہ۔',
            'Please find our official Purchase Order attached and confirm receipt.' => 'ہمارا آفیشل پرچیز آرڈر پی ڈی ایف (PDF) فائل کی صورت میں منسلک ہے۔ براہِ کرم تصدیق فرمائیں۔',
            'Please find the Purchase Invoice (GRN) PDF attached.'  => 'پرچیز انوائس پی ڈی ایف (PDF) فائل کی صورت میں منسلک ہے۔',
            'Please find the Credit Note PDF attached.'             => 'سیل ریٹرن کریڈٹ نوٹ پی ڈی ایف (PDF) فائل کی صورت میں منسلک ہے۔',
            'Please find the Debit Note PDF attached.'              => 'پرچیز ریٹرن ڈیبٹ نوٹ پی ڈی ایف (PDF) فائل کی صورت میں منسلک ہے۔',
            'Please find our official price quotation attached.'    => 'ہماری آفیشل پرائس کوٹیشن پی ڈی ایف (PDF) فائل کی صورت میں منسلک ہے۔',
            'Please verify quantities and batch numbers upon receipt.' => 'براہِ کرم مال وصول کرتے وقت تعداد اور بیچ نمبر چیک کر لیں۔',
        ];

        return strtr($text, $replacements);
    }

    /**
     * Build the actual PDF document and send/prepare it for WhatsApp (with no URL link in caption).
     */
    public function sendOrBuildWhatsAppPdf(
        string $type,
        array $params,
        ?string $phone,
        string $caption,
        bool $savePhone = false
    ): array {
        $apiConfigured = $this->isWhatsAppApiConfigured();
        $result = $this->generatePdf($type, $params);
        $context = $result['context'];
        $pdfBytes = $result['pdf']->output();
        $filename = $result['filename'];
        $rawPhone = trim((string) ($phone ?: ($context['recipient_phone'] ?? '')));
        $normalizedPhone = $this->normalizePhone($rawPhone);

        // Optionally persist the phone number back to the Customer or Supplier profile
        if ($savePhone && $rawPhone !== '' && !empty($context['party_type']) && !empty($context['party_id'])) {
            if ($context['party_type'] === 'customer') {
                Customer::where('id', $context['party_id'])->update(['phone' => $rawPhone]);
            } elseif ($context['party_type'] === 'supplier') {
                Supplier::where('id', $context['party_id'])->update(['phone' => $rawPhone]);
            }
        }

        // Clean up any expired temporary shared PDFs (and any legacy public shared-pdfs)
        $this->cleanupExpiredSharedPdfs();

        // Save built PDF file in private local storage with an unguessable UUID prefix
        $uniqueName = \Illuminate\Support\Str::uuid()->toString() . '_' . $filename;
        $storedPath = 'shared-pdfs/' . $uniqueName;
        Storage::disk('local')->put($storedPath, $pdfBytes);
        $signedPdfUrl = $this->buildSignedPdfUrl($type, $params);

        // If WhatsApp API / Agent credentials are configured and a phone number is provided, dispatch the PDF document directly
        if ($apiConfigured && $normalizedPhone !== '') {
            $provider = $this->resolveWhatsAppProvider();
            $autoFallback = (bool) config('services.whatsapp.auto_fallback', true);

            try {
                $dispatchResult = $this->dispatchPdfViaWhatsAppApi(
                    provider: $provider,
                    normalizedPhone: $normalizedPhone,
                    pdfBytes: $pdfBytes,
                    filename: $filename,
                    caption: $caption,
                    signedPdfUrl: $signedPdfUrl
                );

                return [
                    'status'           => 'sent_via_api',
                    'mode'             => 'cloud_api',
                    'provider'         => $provider,
                    'message'          => "PDF document ({$filename}) sent directly to WhatsApp (+{$normalizedPhone})",
                    'filename'         => $filename,
                    'stored_path'      => $storedPath,
                    'signed_pdf_url'   => $signedPdfUrl,
                    'normalized_phone' => $normalizedPhone,
                    'whatsapp_msg_id'  => $dispatchResult['message_id'] ?? null,
                ];
            } catch (\Throwable $e) {
                // For the Built-in Free Local WhatsApp Agent, if it isn't running or isn't linked via QR yet,
                // auto-start it and return qr_required so ShareDocumentModal can show the live QR code inline!
                if ($provider === 'local_agent') {
                    try {
                        $agentSvc = app(LocalWhatsAppAgentService::class);
                        $agentStatus = $agentSvc->start();
                    } catch (\Throwable) {
                        $agentStatus = [];
                    }

                    return [
                        'status'           => 'qr_required',
                        'mode'             => 'qr_required',
                        'provider'         => 'local_agent',
                        'qr_data_url'      => $agentStatus['qr_data_url'] ?? null,
                        'agent_status'     => $agentStatus['status'] ?? 'qr_ready',
                        'message'          => 'Scan the WhatsApp QR code below once to send the PDF attachment directly on WhatsApp.',
                        'filename'         => $filename,
                        'stored_path'      => $storedPath,
                        'signed_pdf_url'   => $signedPdfUrl,
                        'mime_type'        => 'application/pdf',
                        'size_bytes'       => strlen($pdfBytes),
                        'pdf_base64'       => base64_encode($pdfBytes),
                        'normalized_phone' => $normalizedPhone,
                        'caption'          => $caption,
                    ];
                }

                if (!$autoFallback) {
                    throw $e;
                }

                $cleanError = $this->sanitizeWhatsAppErrorMessage($e->getMessage());

                return [
                    'status'           => 'api_fallback',
                    'mode'             => 'client_file',
                    'provider'         => $provider,
                    'api_error'        => $cleanError,
                    'message'          => "WhatsApp API could not deliver directly ({$cleanError}); PDF downloaded locally & opening WhatsApp chat",
                    'filename'         => $filename,
                    'stored_path'      => $storedPath,
                    'signed_pdf_url'   => $signedPdfUrl,
                    'mime_type'        => 'application/pdf',
                    'size_bytes'       => strlen($pdfBytes),
                    'pdf_base64'       => base64_encode($pdfBytes),
                    'normalized_phone' => $normalizedPhone,
                    'caption'          => $caption,
                ];
            }
        }

        return [
            'status'           => 'pdf_built',
            'mode'             => 'client_file',
            'message'          => "PDF document ({$filename}) built and ready to send on WhatsApp",
            'filename'         => $filename,
            'stored_path'      => $storedPath,
            'signed_pdf_url'   => $signedPdfUrl,
            'mime_type'        => 'application/pdf',
            'size_bytes'       => strlen($pdfBytes),
            'pdf_base64'       => base64_encode($pdfBytes),
            'normalized_phone' => $normalizedPhone,
            'caption'          => $caption,
        ];
    }

    /**
     * Dispatch a PDF document and caption through the configured WhatsApp API / Agent provider.
     *
     * @return array{message_id: ?string, provider: string}
     */
    public function dispatchPdfViaWhatsAppApi(
        string $provider,
        string $normalizedPhone,
        string $pdfBytes,
        string $filename,
        string $caption,
        ?string $signedPdfUrl = null
    ): array {
        $token = trim((string) config('services.whatsapp.access_token', ''));
        $phoneOrInstanceId = trim((string) config('services.whatsapp.phone_number_id', ''));
        $version = trim((string) config('services.whatsapp.api_version', 'v20.0')) ?: 'v20.0';
        $customUrl = trim((string) config('services.whatsapp.api_url', ''));

        // 1. Built-in Karobar Free WhatsApp Agent (Node.js + @whiskeysockets/baileys)
        if ($provider === 'local_agent') {
            $baseUrl = rtrim($customUrl !== '' ? $customUrl : 'http://127.0.0.1:3001', '/');
            $endpoint = str_ends_with($baseUrl, '/send-document') ? $baseUrl : "{$baseUrl}/send-document";

            $response = $this->executeWhatsAppHttp(function ($http) use ($token, $endpoint, $normalizedPhone, $filename, $pdfBytes, $caption) {
                if ($token !== '') {
                    $http = $http->withHeaders(['X-Api-Key' => $token]);
                }

                return $http->post($endpoint, [
                    'phone'           => $normalizedPhone,
                    'filename'        => $filename,
                    'document_base64' => base64_encode($pdfBytes),
                    'caption'         => $caption,
                ]);
            });

            if (!$response->successful() || $response->json('ok') === false) {
                $err = $response->json('message') ?? $response->body();
                throw new RuntimeException('Built-in Free WhatsApp Agent error: ' . $err);
            }

            return [
                'provider'   => 'local_agent',
                'message_id' => (string) ($response->json('message_id') ?? 'local_agent_sent'),
            ];
        }

        // 2. WAHA (WhatsApp HTTP API — 100% Free Open-Source Docker)
        if ($provider === 'waha') {
            $baseUrl = rtrim($customUrl !== '' ? $customUrl : 'http://localhost:3000', '/');
            $endpoint = str_ends_with($baseUrl, '/api/sendFile') ? $baseUrl : "{$baseUrl}/api/sendFile";
            $sessionName = $phoneOrInstanceId !== '' ? $phoneOrInstanceId : 'default';

            $response = $this->executeWhatsAppHttp(function ($http) use ($token, $endpoint, $sessionName, $normalizedPhone, $filename, $pdfBytes, $caption) {
                if ($token !== '') {
                    $http = $http->withHeaders(['X-Api-Key' => $token]);
                }

                return $http->post($endpoint, [
                    'session' => $sessionName,
                    'chatId'  => $normalizedPhone . '@c.us',
                    'file'    => [
                        'mimetype' => 'application/pdf',
                        'filename' => $filename,
                        'data'     => base64_encode($pdfBytes),
                    ],
                    'caption' => $caption,
                ]);
            });

            if (!$response->successful()) {
                $err = $response->json('message') ?? $response->json('error') ?? $response->body();
                throw new RuntimeException('WAHA Open-Source WhatsApp API error: ' . $err);
            }

            return [
                'provider'   => 'waha',
                'message_id' => (string) ($response->json('id') ?? $response->json('key.id') ?? 'waha_sent'),
            ];
        }

        // 3. Evolution API (100% Free Open-Source WhatsApp Gateway)
        if ($provider === 'evolution_api') {
            $baseUrl = rtrim($customUrl !== '' ? $customUrl : 'http://localhost:8080', '/');
            $instance = $phoneOrInstanceId !== '' ? $phoneOrInstanceId : 'default';
            $endpoint = str_contains($baseUrl, '/message/sendMedia')
                ? $baseUrl
                : "{$baseUrl}/message/sendMedia/{$instance}";

            $response = $this->executeWhatsAppHttp(function ($http) use ($token, $endpoint, $normalizedPhone, $filename, $pdfBytes, $caption) {
                if ($token !== '') {
                    $http = $http->withHeaders(['apikey' => $token]);
                }

                return $http->post($endpoint, [
                    'number'    => $normalizedPhone,
                    'mediatype' => 'document',
                    'mimetype'  => 'application/pdf',
                    'media'     => base64_encode($pdfBytes),
                    'fileName'  => $filename,
                    'caption'   => $caption,
                ]);
            });

            if (!$response->successful()) {
                $err = $response->json('response.message') ?? $response->json('message') ?? $response->body();
                if (is_array($err)) {
                    $err = json_encode($err);
                }
                throw new RuntimeException('Evolution API error: ' . $err);
            }

            return [
                'provider'   => 'evolution_api',
                'message_id' => (string) ($response->json('key.id') ?? $response->json('id') ?? 'evolution_sent'),
            ];
        }

        if ($provider === 'whapi_cloud') {
            $endpoint = rtrim($customUrl !== '' ? $customUrl : 'https://gate.whapi.cloud', '/') . '/messages/document';
            $dataUri = 'data:application/pdf;name=' . rawurlencode($filename) . ';base64,' . base64_encode($pdfBytes);

            $response = $this->executeWhatsAppHttp(fn ($http) => $http
                ->withToken($token)
                ->post($endpoint, [
                    'to'       => $normalizedPhone,
                    'media'    => $dataUri,
                    'filename' => $filename,
                    'caption'  => $caption,
                ])
            );

            if (!$response->successful() || $response->json('error')) {
                $err = $response->json('error.message') ?? $response->json('message') ?? $response->body();
                throw new RuntimeException('Whapi.Cloud Agent API error: ' . $err);
            }

            return [
                'provider'   => 'whapi_cloud',
                'message_id' => (string) ($response->json('message.id') ?? $response->json('id') ?? 'whapi_sent'),
            ];
        }

        if ($provider === 'wasender') {
            $endpoint = rtrim($customUrl !== '' ? $customUrl : 'https://www.wasenderapi.com', '/') . '/api/send-message';
            $payload = [
                'phone'    => '+' . $normalizedPhone,
                'text'     => $caption,
                'filename' => $filename,
                'document' => 'data:application/pdf;base64,' . base64_encode($pdfBytes),
            ];
            if ($signedPdfUrl) {
                $payload['documentUrl'] = $signedPdfUrl;
            }

            $response = $this->executeWhatsAppHttp(fn ($http) => $http
                ->withToken($token)
                ->post($endpoint, $payload)
            );

            if (!$response->successful() || $response->json('success') === false) {
                $err = $response->json('message') ?? $response->json('error') ?? $response->body();
                throw new RuntimeException('WasenderAPI Agent error: ' . $err);
            }

            return [
                'provider'   => 'wasender',
                'message_id' => (string) ($response->json('data.msgId') ?? $response->json('id') ?? 'wasender_sent'),
            ];
        }

        if ($provider === 'ultramsg') {
            $cleanInstance = preg_replace('/^instance/i', '', $phoneOrInstanceId) ?: $phoneOrInstanceId;
            $instancePath = 'instance' . $cleanInstance;
            $endpoint = rtrim($customUrl !== '' ? $customUrl : 'https://api.ultramsg.com', '/') . "/{$instancePath}/messages/document";

            $response = $this->executeWhatsAppHttp(fn ($http) => $http
                ->asForm()
                ->post($endpoint, [
                    'token'    => $token,
                    'to'       => '+' . $normalizedPhone,
                    'filename' => $filename,
                    'document' => base64_encode($pdfBytes),
                    'caption'  => $caption,
                ])
            );

            if (!$response->successful() || !empty($response->json('error'))) {
                $err = is_string($response->json('error'))
                    ? $response->json('error')
                    : json_encode($response->json('error') ?: $response->body());
                throw new RuntimeException('UltraMsg WhatsApp Gateway error: ' . $err);
            }

            return [
                'provider'   => 'ultramsg',
                'message_id' => (string) ($response->json('id') ?? 'ultramsg_sent'),
            ];
        }

        if ($provider === 'green_api') {
            $cleanInstance = preg_replace('/^waInstance/i', '', $phoneOrInstanceId) ?: $phoneOrInstanceId;
            $baseUrl = rtrim($customUrl !== '' ? $customUrl : 'https://api.green-api.com', '/');
            $endpoint = "{$baseUrl}/waInstance{$cleanInstance}/sendFileByUpload/{$token}";

            $response = $this->executeWhatsAppHttp(fn ($http) => $http
                ->attach('file', $pdfBytes, $filename, ['Content-Type' => 'application/pdf'])
                ->post($endpoint, [
                    'chatId'   => $normalizedPhone . '@c.us',
                    'fileName' => $filename,
                    'caption'  => $caption,
                ])
            );

            if (!$response->successful() || empty($response->json('idMessage'))) {
                throw new RuntimeException('Green-API WhatsApp Gateway error: ' . $response->body());
            }

            return [
                'provider'   => 'green_api',
                'message_id' => (string) $response->json('idMessage'),
            ];
        }

        if ($provider === 'custom_http') {
            if ($customUrl === '') {
                throw new RuntimeException('Custom WhatsApp API endpoint URL is not configured.');
            }

            $response = $this->executeWhatsAppHttp(function ($http) use ($token, $customUrl, $normalizedPhone, $caption, $filename, $pdfBytes, $signedPdfUrl) {
                if ($token !== '') {
                    $http = $http->withToken($token);
                }
                return $http->post($customUrl, [
                    'to'             => $normalizedPhone,
                    'phone'          => '+' . $normalizedPhone,
                    'caption'        => $caption,
                    'message'        => $caption,
                    'filename'       => $filename,
                    'mime_type'      => 'application/pdf',
                    'pdf_base64'     => base64_encode($pdfBytes),
                    'media'          => 'data:application/pdf;base64,' . base64_encode($pdfBytes),
                    'signed_pdf_url' => $signedPdfUrl,
                ]);
            });

            if (!$response->successful()) {
                throw new RuntimeException('Custom WhatsApp API error (HTTP ' . $response->status() . '): ' . $response->body());
            }

            return [
                'provider'   => 'custom_http',
                'message_id' => (string) ($response->json('id') ?? $response->json('message_id') ?? $response->json('messages.0.id') ?? 'custom_sent'),
            ];
        }

        // Default: Official Meta WhatsApp Cloud API ('meta_cloud')
        $mediaResponse = $this->executeWhatsAppHttp(fn ($http) => $http
            ->withToken($token)
            ->attach('file', $pdfBytes, $filename, ['Content-Type' => 'application/pdf'])
            ->post("https://graph.facebook.com/{$version}/{$phoneOrInstanceId}/media", [
                'messaging_product' => 'whatsapp',
                'type'              => 'application/pdf',
            ])
        );

        if (!$mediaResponse->successful() || empty($mediaResponse->json('id'))) {
            throw new RuntimeException('Failed to upload PDF document to WhatsApp Cloud API: ' . $mediaResponse->body());
        }

        $mediaId = $mediaResponse->json('id');

        $msgResponse = $this->executeWhatsAppHttp(fn ($http) => $http
            ->withToken($token)
            ->post("https://graph.facebook.com/{$version}/{$phoneOrInstanceId}/messages", [
                'messaging_product' => 'whatsapp',
                'recipient_type'    => 'individual',
                'to'                => $normalizedPhone,
                'type'              => 'document',
                'document'          => [
                    'id'       => $mediaId,
                    'filename' => $filename,
                    'caption'  => $caption,
                ],
            ])
        );

        // If Meta rejects free-form message due to 24-hour customer service window and a template is configured, fallback to template
        $templateName = trim((string) config('services.whatsapp.template_name', ''));
        if (!$msgResponse->successful() && $templateName !== '') {
            $templateLang = trim((string) config('services.whatsapp.template_language', 'en_US')) ?: 'en_US';
            $msgResponse = $this->executeWhatsAppHttp(fn ($http) => $http
                ->withToken($token)
                ->post("https://graph.facebook.com/{$version}/{$phoneOrInstanceId}/messages", [
                    'messaging_product' => 'whatsapp',
                    'recipient_type'    => 'individual',
                    'to'                => $normalizedPhone,
                    'type'              => 'template',
                    'template'          => [
                        'name'       => $templateName,
                        'language'   => ['code' => $templateLang],
                        'components' => [
                            [
                                'type'       => 'header',
                                'parameters' => [
                                    [
                                        'type'     => 'document',
                                        'document' => [
                                            'id'       => $mediaId,
                                            'filename' => $filename,
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ])
            );
        }

        if (!$msgResponse->successful()) {
            throw new RuntimeException('Failed to send PDF document via WhatsApp Cloud API: ' . $msgResponse->body());
        }

        return [
            'provider'   => 'meta_cloud',
            'message_id' => $msgResponse->json('messages.0.id'),
        ];
    }

    /**
     * Send a live test PDF document via the currently configured WhatsApp API provider.
     */
    public function sendTestWhatsAppMessage(string $rawPhone, string $storeName = 'Karobar App'): array
    {
        $normalizedPhone = $this->normalizePhone($rawPhone);
        if ($normalizedPhone === '') {
            throw new InvalidArgumentException('Please enter a valid recipient WhatsApp phone number.');
        }

        $provider = $this->resolveWhatsAppProvider();
        $caption = "*{$storeName}*\n"
            . "WhatsApp Document Delivery Verification\n\n"
            . "Your WhatsApp integration ({$provider}) is active and ready to dispatch PDF invoices, purchase orders, quotations, and statements.";

        $samplePdf = Pdf::loadHTML(
            '<html><body style="font-family: DejaVu Sans, sans-serif; padding: 32px;">'
            . '<h2 style="color: #0f172a; margin-bottom: 8px;">' . e($storeName) . ' — Document Delivery Verification</h2>'
            . '<p style="color: #334155; font-size: 13px;">This verification document confirms that Karobar App ERP can generate and deliver A4 PDF documents directly to WhatsApp (+' . e($normalizedPhone) . ').</p>'
            . '<hr style="border: none; border-top: 1px solid #cbd5e1; margin: 16px 0;" />'
            . '<p style="font-size: 11px; color: #64748b;">Provider: ' . e($provider) . ' | Timestamp: ' . now()->format('d M Y H:i:s') . '</p>'
            . '</body></html>'
        )->setPaper('a4', 'portrait')->output();

        $result = $this->dispatchPdfViaWhatsAppApi(
            provider: $provider,
            normalizedPhone: $normalizedPhone,
            pdfBytes: $samplePdf,
            filename: 'WhatsApp_Test_Invoice.pdf',
            caption: $caption,
            signedPdfUrl: url('/')
        );

        return [
            'status'           => 'sent',
            'provider'         => $provider,
            'normalized_phone' => $normalizedPhone,
            'whatsapp_msg_id'  => $result['message_id'] ?? null,
            'message'          => "Test WhatsApp PDF sent successfully to +{$normalizedPhone} via {$provider}!",
        ];
    }

    /**
     * Build bilingual (English & Urdu) WhatsApp refill reminder messages for a Regular Customer.
     *
     * @return array{english: string, urdu: string, message: string, language: string}
     */
    public function formatRegularCustomerReminder(Customer $customer, ?string $language = null): array
    {
        $customer->loadMissing('regularItems.product');
        $setting = Setting::first();
        $storeName = trim((string) ($setting?->store_name ?: 'Karobar Pharmacy'));
        $storePhone = trim((string) ($setting?->phone_number ?: ''));
        $customerName = trim((string) ($customer->name ?: 'Valued Customer'));

        $cycle = strtolower((string) ($customer->refill_cycle ?: 'monthly'));
        $customDays = max(1, (int) ($customer->refill_custom_days ?: 30));

        $cycleLabelEn = match ($cycle) {
            'weekly'   => 'Weekly',
            'biweekly' => 'Bi-Weekly (14-Day)',
            'custom'   => "{$customDays}-Day",
            default    => 'Monthly',
        };

        $cycleLabelUr = match ($cycle) {
            'weekly'   => 'ہفتہ وار',
            'biweekly' => 'پندرہ روزہ',
            'custom'   => "{$customDays} روزہ",
            default    => 'ماہانہ',
        };

        $dueDateFormatted = $customer->next_refill_date
            ? \Carbon\Carbon::parse($customer->next_refill_date)->format('d M Y')
            : now()->format('d M Y');

        $itemsEn = [];
        $itemsUr = [];

        foreach ($customer->regularItems as $idx => $item) {
            $num = $idx + 1;
            $prodName = $item->product?->name ?: "Product #{$item->product_id}";
            $packSize = max(1, (int) ($item->product?->pack_size ?? 1));
            $rawPackQty = (float) ($item->pack_quantity ?? 0);
            $rawUnitQty = (int) ($item->unit_quantity ?? 0);

            $totalUnits = $rawUnitQty > 0
                ? $rawUnitQty
                : max(1, (int) round($rawPackQty * $packSize));

            if ($packSize > 1 && $totalUnits % $packSize === 0) {
                $packs = (int) ($totalUnits / $packSize);
                $qtyTextEn = $packs . ($packs === 1 ? ' Pack' : ' Packs') . " ({$totalUnits} Units)";
                $qtyTextUr = "{$packs} پیک ({$totalUnits} عدد)";
            } else {
                $qtyTextEn = $totalUnits . ($totalUnits === 1 ? ' Unit' : ' Units');
                $qtyTextUr = "{$totalUnits} عدد";
            }

            $note = trim((string) ($item->dosage_notes ?? ''));

            $itemsEn[] = "  {$num}. *{$prodName}* — {$qtyTextEn}" . ($note !== '' ? " ({$note})" : '');
            $itemsUr[] = "  {$num}. *{$prodName}* — {$qtyTextUr}" . ($note !== '' ? " ({$note})" : '');
        }

        $itemsBlockEn = !empty($itemsEn)
            ? "\n*Prepared Medicines / Products:*\n" . implode("\n", $itemsEn) . "\n"
            : '';

        $itemsBlockUr = !empty($itemsUr)
            ? "\n*تیار شدہ ادویات / اشیاء:*\n" . implode("\n", $itemsUr) . "\n"
            : '';

        $notesLineEn = trim((string) ($customer->regular_notes ?? '')) !== ''
            ? "\n*Note:* " . trim((string) $customer->regular_notes)
            : '';
        $notesLineUr = trim((string) ($customer->regular_notes ?? '')) !== ''
            ? "\n*نوٹ:* " . trim((string) $customer->regular_notes)
            : '';

        $storePhoneLineEn = $storePhone !== '' ? "\nContact: {$storePhone}" : '';
        $storePhoneLineUr = $storePhone !== '' ? "\nرابطہ نمبر: {$storePhone}" : '';

        $english = "*{$storeName} — {$cycleLabelEn} Medicine / Product Reminder*\n\n"
            . "Dear *{$customerName}*,\n"
            . "We hope you are in good health. This is a friendly prior reminder that your *{$cycleLabelEn}* medicines / products are ready for collection at *{$storeName}*."
            . $itemsBlockEn
            . "\n*Scheduled Collection Date:* {$dueDateFormatted}"
            . $notesLineEn . "\n\n"
            . "Please do not forget to collect them at your convenience, or reply to this message if you need any changes.\n"
            . "Thank you!"
            . $storePhoneLineEn;

        $urdu = "*{$storeName} — {$cycleLabelUr} ادویات / اشیاء کی یاد دہانی*\n\n"
            . "محترم *{$customerName}*،\n"
            . "السلام علیکم! آپ کو مطلع کیا جاتا ہے کہ آپ کی *{$cycleLabelUr}* ادویات / اشیاء *{$storeName}* پر تیار ہیں اور وصولی کے لیے دستیاب ہیں:"
            . $itemsBlockUr
            . "\n*تاریخِ وصولی:* {$dueDateFormatted}"
            . $notesLineUr . "\n\n"
            . "براہِ کرم اپنی ادویات / اشیاء وقت پر وصول کرنا نہ بھولیں۔ کسی بھی تبدیلی کی صورت میں اس پیغام کا جواب دیں۔\n"
            . "شکریہ!"
            . $storePhoneLineUr;

        $resolvedLang = strtolower(trim((string) ($language ?: ($customer->reminder_language ?: 'english'))));
        if (!in_array($resolvedLang, ['english', 'urdu'], true)) {
            $resolvedLang = 'english';
        }

        return [
            'language' => $resolvedLang,
            'english'  => $english,
            'urdu'     => $urdu,
            'message'  => $resolvedLang === 'urdu' ? $urdu : $english,
        ];
    }

    /**
     * Send a direct WhatsApp text message (e.g. Regular Customer Refill Reminder) via the active WhatsApp Agent/Gateway,
     * with automatic wa.me fallback if the gateway is offline or not enabled.
     */
    public function sendWhatsAppTextMessage(string $rawPhone, string $message): array
    {
        $normalizedPhone = $this->normalizePhone($rawPhone);
        if ($normalizedPhone === '') {
            throw new InvalidArgumentException('Customer does not have a valid WhatsApp phone number.');
        }

        $trimmedMessage = trim($message);
        if ($trimmedMessage === '') {
            throw new InvalidArgumentException('Reminder message text cannot be empty.');
        }

        $waMeUrl = 'https://wa.me/' . $normalizedPhone . '?text=' . rawurlencode($trimmedMessage);

        if ($this->isWhatsAppApiConfigured()) {
            $provider = $this->resolveWhatsAppProvider();
            try {
                $apiResult = $this->dispatchTextViaWhatsAppApi(
                    provider: $provider,
                    normalizedPhone: $normalizedPhone,
                    message: $trimmedMessage
                );

                return [
                    'status'           => 'sent_via_api',
                    'mode'             => 'cloud_api',
                    'provider'         => $provider,
                    'whatsapp_msg_id'  => $apiResult['message_id'] ?? null,
                    'normalized_phone' => $normalizedPhone,
                    'wa_me_url'        => $waMeUrl,
                    'message'          => "WhatsApp reminder sent directly to +{$normalizedPhone} via {$provider}!",
                ];
            } catch (\Throwable $apiEx) {
                $autoFallback = (bool) config('services.whatsapp.auto_fallback', true);
                if (!$autoFallback) {
                    throw $apiEx;
                }

                return [
                    'status'           => 'wa_me_fallback',
                    'mode'             => 'wa_me_fallback',
                    'provider'         => $provider,
                    'api_error'        => $apiEx->getMessage(),
                    'normalized_phone' => $normalizedPhone,
                    'wa_me_url'        => $waMeUrl,
                    'message'          => "WhatsApp Agent was not reachable ({$apiEx->getMessage()}). Opening WhatsApp chat directly.",
                ];
            }
        }

        return [
            'status'           => 'wa_me_fallback',
            'mode'             => 'wa_me_fallback',
            'provider'         => 'wa_me',
            'normalized_phone' => $normalizedPhone,
            'wa_me_url'        => $waMeUrl,
            'message'          => "WhatsApp reminder prepared for +{$normalizedPhone}.",
        ];
    }

    /**
     * Dispatch a text message through the configured WhatsApp API / Agent provider.
     *
     * @return array{message_id: ?string, provider: string}
     */
    public function dispatchTextViaWhatsAppApi(string $provider, string $normalizedPhone, string $message): array
    {
        $token = trim((string) config('services.whatsapp.access_token', ''));
        $phoneOrInstanceId = trim((string) config('services.whatsapp.phone_number_id', ''));
        $version = trim((string) config('services.whatsapp.api_version', 'v20.0')) ?: 'v20.0';
        $customUrl = trim((string) config('services.whatsapp.api_url', ''));

        // 1. Built-in Karobar Free WhatsApp Agent (Node.js + @whiskeysockets/baileys)
        if ($provider === 'local_agent') {
            $baseUrl = rtrim($customUrl !== '' ? $customUrl : 'http://127.0.0.1:3001', '/');
            $baseUrl = preg_replace('#/(send-document|send-text)$#', '', $baseUrl);
            $endpoint = "{$baseUrl}/send-text";

            $response = $this->executeWhatsAppHttp(function ($http) use ($token, $endpoint, $normalizedPhone, $message) {
                if ($token !== '') {
                    $http = $http->withHeaders(['X-Api-Key' => $token]);
                }

                return $http->post($endpoint, [
                    'phone'   => $normalizedPhone,
                    'text'    => $message,
                    'message' => $message,
                ]);
            });

            // If an older whatsapp-agent.mjs daemon is running in memory before /send-text was added,
            // fall back to /send-document with a generated PDF reminder slip.
            if ($response->status() === 404) {
                $fallbackPdf = Pdf::loadHTML(
                    '<html><body style="font-family: DejaVu Sans, sans-serif; padding: 28px; font-size: 12px; color: #0f172a;">'
                    . '<h3 style="margin-bottom: 10px;">Medicine / Product Readiness Reminder</h3>'
                    . '<pre style="white-space: pre-wrap; font-family: DejaVu Sans, sans-serif; line-height: 1.5;">' . e($message) . '</pre>'
                    . '</body></html>'
                )->setPaper('a4', 'portrait')->output();

                return $this->dispatchPdfViaWhatsAppApi(
                    provider: 'local_agent',
                    normalizedPhone: $normalizedPhone,
                    pdfBytes: $fallbackPdf,
                    filename: 'Medicine_Readiness_Reminder.pdf',
                    caption: $message
                );
            }

            if (!$response->successful() || $response->json('ok') === false) {
                $err = $response->json('message') ?? $response->body();
                throw new RuntimeException('Built-in Free WhatsApp Agent error: ' . $err);
            }

            return [
                'provider'   => 'local_agent',
                'message_id' => (string) ($response->json('message_id') ?? 'local_agent_text_sent'),
            ];
        }

        // 2. WAHA (WhatsApp HTTP API)
        if ($provider === 'waha') {
            $baseUrl = rtrim($customUrl !== '' ? $customUrl : 'http://localhost:3000', '/');
            $baseUrl = preg_replace('#/api/(sendFile|sendText)$#', '', $baseUrl);
            $endpoint = "{$baseUrl}/api/sendText";
            $sessionName = $phoneOrInstanceId !== '' ? $phoneOrInstanceId : 'default';

            $response = $this->executeWhatsAppHttp(function ($http) use ($token, $endpoint, $sessionName, $normalizedPhone, $message) {
                if ($token !== '') {
                    $http = $http->withHeaders(['X-Api-Key' => $token]);
                }

                return $http->post($endpoint, [
                    'session' => $sessionName,
                    'chatId'  => $normalizedPhone . '@c.us',
                    'text'    => $message,
                ]);
            });

            if (!$response->successful()) {
                $err = $response->json('message') ?? $response->json('error') ?? $response->body();
                throw new RuntimeException('WAHA WhatsApp API error: ' . $err);
            }

            return [
                'provider'   => 'waha',
                'message_id' => (string) ($response->json('id') ?? $response->json('key.id') ?? 'waha_text_sent'),
            ];
        }

        // 3. Evolution API
        if ($provider === 'evolution_api') {
            $baseUrl = rtrim($customUrl !== '' ? $customUrl : 'http://localhost:8080', '/');
            $instance = $phoneOrInstanceId !== '' ? $phoneOrInstanceId : 'default';
            $baseUrl = preg_replace('#/message/(sendMedia|sendText)/.*$#', '', $baseUrl);
            $endpoint = "{$baseUrl}/message/sendText/{$instance}";

            $response = $this->executeWhatsAppHttp(function ($http) use ($token, $endpoint, $normalizedPhone, $message) {
                if ($token !== '') {
                    $http = $http->withHeaders(['apikey' => $token]);
                }

                return $http->post($endpoint, [
                    'number' => $normalizedPhone,
                    'text'   => $message,
                ]);
            });

            if (!$response->successful()) {
                $err = $response->json('response.message') ?? $response->json('message') ?? $response->body();
                if (is_array($err)) {
                    $err = json_encode($err);
                }
                throw new RuntimeException('Evolution API error: ' . $err);
            }

            return [
                'provider'   => 'evolution_api',
                'message_id' => (string) ($response->json('key.id') ?? $response->json('id') ?? 'evolution_text_sent'),
            ];
        }

        if ($provider === 'whapi_cloud') {
            $endpoint = rtrim($customUrl !== '' ? $customUrl : 'https://gate.whapi.cloud', '/') . '/messages/text';
            $response = $this->executeWhatsAppHttp(fn ($http) => $http
                ->withToken($token)
                ->post($endpoint, [
                    'to'   => $normalizedPhone,
                    'body' => $message,
                ])
            );

            if (!$response->successful() || $response->json('error')) {
                $err = $response->json('error.message') ?? $response->json('message') ?? $response->body();
                throw new RuntimeException('Whapi.Cloud API error: ' . $err);
            }

            return [
                'provider'   => 'whapi_cloud',
                'message_id' => (string) ($response->json('message.id') ?? $response->json('id') ?? 'whapi_text_sent'),
            ];
        }

        if ($provider === 'wasender') {
            $endpoint = rtrim($customUrl !== '' ? $customUrl : 'https://www.wasenderapi.com', '/') . '/api/send-message';
            $response = $this->executeWhatsAppHttp(fn ($http) => $http
                ->withToken($token)
                ->post($endpoint, [
                    'phone' => '+' . $normalizedPhone,
                    'text'  => $message,
                ])
            );

            if (!$response->successful() || $response->json('success') === false) {
                $err = $response->json('message') ?? $response->json('error') ?? $response->body();
                throw new RuntimeException('WasenderAPI error: ' . $err);
            }

            return [
                'provider'   => 'wasender',
                'message_id' => (string) ($response->json('data.msgId') ?? $response->json('id') ?? 'wasender_text_sent'),
            ];
        }

        if ($provider === 'ultramsg') {
            $cleanInstance = preg_replace('/^instance/i', '', $phoneOrInstanceId) ?: $phoneOrInstanceId;
            $instancePath = 'instance' . $cleanInstance;
            $endpoint = rtrim($customUrl !== '' ? $customUrl : 'https://api.ultramsg.com', '/') . "/{$instancePath}/messages/chat";

            $response = $this->executeWhatsAppHttp(fn ($http) => $http
                ->asForm()
                ->post($endpoint, [
                    'token' => $token,
                    'to'    => '+' . $normalizedPhone,
                    'body'  => $message,
                ])
            );

            if (!$response->successful() || !empty($response->json('error'))) {
                throw new RuntimeException('UltraMsg error: ' . $response->body());
            }

            return [
                'provider'   => 'ultramsg',
                'message_id' => (string) ($response->json('id') ?? 'ultramsg_text_sent'),
            ];
        }

        if ($provider === 'green_api') {
            $cleanInstance = preg_replace('/^waInstance/i', '', $phoneOrInstanceId) ?: $phoneOrInstanceId;
            $baseUrl = rtrim($customUrl !== '' ? $customUrl : 'https://api.green-api.com', '/');
            $endpoint = "{$baseUrl}/waInstance{$cleanInstance}/sendMessage/{$token}";

            $response = $this->executeWhatsAppHttp(fn ($http) => $http
                ->post($endpoint, [
                    'chatId'  => $normalizedPhone . '@c.us',
                    'message' => $message,
                ])
            );

            if (!$response->successful() || empty($response->json('idMessage'))) {
                throw new RuntimeException('Green-API error: ' . $response->body());
            }

            return [
                'provider'   => 'green_api',
                'message_id' => (string) $response->json('idMessage'),
            ];
        }

        if ($provider === 'custom_http') {
            if ($customUrl === '') {
                throw new RuntimeException('Custom WhatsApp API endpoint URL is not configured.');
            }

            $response = $this->executeWhatsAppHttp(function ($http) use ($token, $customUrl, $normalizedPhone, $message) {
                if ($token !== '') {
                    $http = $http->withToken($token);
                }
                return $http->post($customUrl, [
                    'to'      => $normalizedPhone,
                    'phone'   => '+' . $normalizedPhone,
                    'message' => $message,
                    'text'    => $message,
                ]);
            });

            if (!$response->successful()) {
                throw new RuntimeException('Custom WhatsApp API error (HTTP ' . $response->status() . '): ' . $response->body());
            }

            return [
                'provider'   => 'custom_http',
                'message_id' => (string) ($response->json('id') ?? $response->json('message_id') ?? 'custom_text_sent'),
            ];
        }

        // Default: Official Meta WhatsApp Cloud API ('meta_cloud')
        $msgResponse = $this->executeWhatsAppHttp(fn ($http) => $http
            ->withToken($token)
            ->post("https://graph.facebook.com/{$version}/{$phoneOrInstanceId}/messages", [
                'messaging_product' => 'whatsapp',
                'recipient_type'    => 'individual',
                'to'                => $normalizedPhone,
                'type'              => 'text',
                'text'              => [
                    'preview_url' => false,
                    'body'        => $message,
                ],
            ])
        );

        if (!$msgResponse->successful()) {
            throw new RuntimeException('Failed to send text via WhatsApp Cloud API: ' . $msgResponse->body());
        }

        return [
            'provider'   => 'meta_cloud',
            'message_id' => $msgResponse->json('messages.0.id'),
        ];
    }

    /**
     * Execute an outbound HTTP call for WhatsApp API with CA-bundle resolution and local SSL fallback.
     */
    protected function executeWhatsAppHttp(callable $callback): \Illuminate\Http\Client\Response
    {
        $options = ['force_ip_resolve' => 'v4'];
        $caBundle = Setting::resolveValidCaBundlePath();
        if ($caBundle !== null) {
            $options['verify'] = $caBundle;
        }

        try {
            $pending = Http::withOptions($options)->connectTimeout(10)->timeout(30);
            return $callback($pending);
        } catch (\Throwable $e) {
            $lower = strtolower($e->getMessage());
            $isSslError = str_contains($lower, 'curl error 60')
                || str_contains($lower, 'curl error 77')
                || str_contains($lower, 'ssl certificate')
                || str_contains($lower, 'unable to get local issuer certificate');

            if ($isSslError) {
                $pending = Http::withoutVerifying()
                    ->withOptions(['force_ip_resolve' => 'v4', 'verify' => false])
                    ->connectTimeout(10)
                    ->timeout(30);
                return $callback($pending);
            }

            throw $e;
        }
    }

    protected function sanitizeWhatsAppErrorMessage(string $message): string
    {
        $token = trim((string) config('services.whatsapp.access_token', ''));
        $clean = trim($message);
        if ($token !== '' && strlen($token) >= 4) {
            $clean = str_replace($token, '[REDACTED]', $clean);
        }

        return mb_substr($clean, 0, 260);
    }

    /**
     * Purge temporary shared PDFs older than $maxAgeSeconds from private storage
     * and remove any legacy files from public/shared-pdfs.
     */
    public function cleanupExpiredSharedPdfs(int $maxAgeSeconds = 86400): int
    {
        $deleted = 0;
        $cutoff = now()->subSeconds($maxAgeSeconds)->getTimestamp();

        try {
            $localDisk = Storage::disk('local');
            foreach ($localDisk->files('shared-pdfs') as $file) {
                if ($localDisk->lastModified($file) <= $cutoff) {
                    $localDisk->delete($file);
                    $deleted++;
                }
            }
        } catch (\Throwable) {
            // Ignore filesystem errors during opportunistic cleanup
        }

        try {
            $publicDisk = Storage::disk('public');
            foreach ($publicDisk->files('shared-pdfs') as $file) {
                $publicDisk->delete($file);
                $deleted++;
            }
        } catch (\Throwable) {
            // Ignore filesystem errors during opportunistic cleanup
        }

        return $deleted;
    }

    /**
     * Render the DomPDF instance and return ['pdf' => \Barryvdh\DomPDF\PDF, 'filename' => string, 'context' => array].
     */
    public function generatePdf(string $type, array $params): array
    {
        $context = $this->resolveDocumentContext($type, $params);
        $selectedDesign = $this->resolvePdfDesign($params['template'] ?? null, $context['view_data']['setting'] ?? null);
        $context['view_data']['pdfDesign'] = $selectedDesign;
        $context['pdf_template'] = $selectedDesign;

        // Ensure storage/fonts exists for DomPDF .ufm metrics caching
        \App\Support\UrduPdfTextShaper::resolveUrduFontUrls();

        $rawHtml = view($context['view'], $context['view_data'])->render();
        $shapedHtml = \App\Support\UrduPdfTextShaper::shapeHtml($rawHtml);

        $pdf = Pdf::loadHTML($shapedHtml)
            ->setPaper('a4', 'portrait')
            ->setOption('isFontSubsettingEnabled', true);

        return [
            'pdf'          => $pdf,
            'filename'     => $context['filename'],
            'pdf_template' => $selectedDesign,
            'context'      => $context,
        ];
    }

    /**
     * Resolve document data, view template, recipient info, and message copy.
     */
    public function resolveDocumentContext(string $type, array $params): array
    {
        $setting = Setting::first();
        $storeName = $setting->store_name ?? 'Karobar App Store';

        return match ($type) {
            'sale_invoice'    => $this->resolveSaleInvoice((int) ($params['id'] ?? 0), $setting, $storeName),
            'delivery_challan'=> $this->resolveDeliveryChallan((int) ($params['id'] ?? 0), $setting, $storeName),
            'quotation'       => $this->resolveQuotation((int) ($params['id'] ?? 0), $setting, $storeName),
            'customer_ledger' => $this->resolveCustomerLedger(
                (int) ($params['customer_id'] ?? $params['id'] ?? 0),
                $params['from'] ?? null,
                $params['to'] ?? null,
                $setting,
                $storeName
            ),
            'supplier_ledger' => $this->resolveSupplierLedger(
                (int) ($params['supplier_id'] ?? $params['id'] ?? 0),
                $params['from'] ?? null,
                $params['to'] ?? null,
                $setting,
                $storeName
            ),
            'payment'         => $this->resolvePayment((int) ($params['id'] ?? 0), $setting, $storeName),
            'purchase_order'  => $this->resolvePurchaseOrder((int) ($params['id'] ?? 0), $setting, $storeName),
            'purchase_invoice'=> $this->resolvePurchaseInvoice((int) ($params['id'] ?? 0), $setting, $storeName),
            'sale_return'     => $this->resolveSaleReturn((int) ($params['id'] ?? 0), $setting, $storeName),
            'purchase_return' => $this->resolvePurchaseReturn((int) ($params['id'] ?? 0), $setting, $storeName),
            'stock_disposal'  => $this->resolveStockDisposal((int) ($params['id'] ?? 0), $setting, $storeName),
            'cash_drawer_session' => $this->resolveCashDrawerSession((int) ($params['id'] ?? 0), $setting, $storeName),
            'stocktake_session'   => $this->resolveStocktakeSession((int) ($params['id'] ?? 0), $setting, $storeName),
            'regular_refill_reminder' => $this->resolveRegularRefillReminder(
                (int) ($params['customer_id'] ?? $params['id'] ?? 0),
                $setting,
                $storeName
            ),
            default           => throw new InvalidArgumentException("Unsupported document type: {$type}"),
        };
    }

    private function resolveSaleInvoice(int $id, ?Setting $setting, string $storeName): array
    {
        $invoice = SaleInvoice::with(['customer', 'user', 'items.product'])->findOrFail($id);
        $customer = $invoice->customer;

        $customerTotalDue = null;
        if ($invoice->customer_id) {
            $customerTotalDue = $this->computeCustomerNetBalance((int) $invoice->customer_id);
        }

        $docNo = $invoice->posted_number ?: ('INV-' . $invoice->id);
        $dateStr = $invoice->date ? Carbon::parse($invoice->date)->format('d M Y') : optional($invoice->created_at)->format('d M Y');
        $total = (float) ($invoice->total ?? 0);
        $received = (float) ($invoice->total_receive ?? 0);
        $remaining = max(0, $total - $received);
        $custName = $customer->name ?? 'Valued Customer';
        $storePhone = trim((string) ($setting?->phone_number ?? ''));
        $storeAddress = trim((string) ($setting?->address ?? ''));
        $itemsCount = $invoice->items->count();
        $totalUnits = (int) round((float) $invoice->items->sum(function ($it) {
            $q = (float) ($it->quantity ?? 0);
            if ($q <= 0) {
                $ps = max(1, (int) ($it->pack_size ?? $it->product?->pack_size ?? 1));
                $q = ((float) ($it->pack_quantity ?? 0) * $ps) + (float) ($it->unit_quantity ?? 0);
            }
            return $q;
        }));

        $rawNote = trim((string) ($setting?->note ?? ''));
        $hasUrduNote = \App\Support\UrduPdfTextShaper::containsUrdu($rawNote);

        // 1. Proper English Invoice Note (never mixes raw Urdu lines into the English format)
        $englishNote = (!$hasUrduNote && $rawNote !== '')
            ? $rawNote
            : "Refrigerated, loose, used, or cut-strip medicines are non-returnable.\nReturn or exchange is accepted within 7 days along with the original bill.\nThank you for your cooperation.";

        // 2. Proper Urdu Invoice Note
        $urduNote = ($hasUrduNote && $rawNote !== '')
            ? $rawNote
            : "فریج میڈیسن، کھلی میڈیسن، استعمال شدہ میڈیسن اور کٹی ہوئی میڈیسن ناقابلِ واپسی ہے۔\nواپسی یا تبدیلی 7 دن کے اندر اصل بل کے ہمراہ ہوگی۔\nآپ کے تعاون کا شکریہ۔";

        // Format A: Proper English Invoice Text
        $waEnLines = array_values(array_filter([
            "*{$storeName}*",
            $storeAddress !== '' ? $storeAddress : null,
            $storePhone !== '' ? "Tel: {$storePhone}" : null,
            "────────────────────",
            "*SALE INVOICE*",
            "Invoice No: *{$docNo}*",
            "Date: {$dateStr}",
            "Customer: {$custName}",
            $itemsCount > 0 ? "Items: {$itemsCount} (" . number_format($totalUnits) . " units)" : null,
            "",
            "*Billing Summary*",
            "Invoice Total: *Rs. " . number_format($total, 2) . "*",
            "Amount Received: Rs. " . number_format($received, 2),
            "Balance Due (This Invoice): Rs. " . number_format($remaining, 2),
            $customerTotalDue !== null ? "Total Account Balance Due: *Rs. " . number_format($customerTotalDue, 2) . "*" : null,
            "",
            "*Terms & Return Policy:*",
            $englishNote,
            "",
            "Please find the official invoice PDF attached for your records.",
        ], fn ($line) => $line !== null));

        // Format B: Proper Urdu Invoice Text (اردو فارمیٹ)
        $waUrLines = array_values(array_filter([
            "*{$storeName}*",
            $storeAddress !== '' ? $storeAddress : null,
            $storePhone !== '' ? "فون نمبر: {$storePhone}" : null,
            "────────────────────",
            "*سیل انوائس / بل کی تفصیل*",
            "بل نمبر: *{$docNo}*",
            "تاریخ: {$dateStr}",
            "محترم کسٹمر: {$custName}",
            $itemsCount > 0 ? "آئٹمز کی تعداد: {$itemsCount} (" . number_format($totalUnits) . " یونٹس)" : null,
            "",
            "*بل کا خلاصہ:*",
            "کل بل: *Rs. " . number_format($total, 2) . "*",
            "وصول شدہ رقم: Rs. " . number_format($received, 2),
            "بقایا رقم (موجودہ بل): Rs. " . number_format($remaining, 2),
            $customerTotalDue !== null ? "کل کھاتہ بقایا: *Rs. " . number_format($customerTotalDue, 2) . "*" : null,
            "",
            "*ضروری ہدایات و شرائط:*",
            $urduNote,
            "",
            "مکمل بل پی ڈی ایف (PDF) فائل کی صورت میں منسلک ہے۔",
        ], fn ($line) => $line !== null));

        $emailSubjectEn = "Sale Invoice {$docNo} — {$storeName}";
        $emailBodyEn = "Dear {$custName},\n\n"
            . "Please find attached the official Sale Invoice ({$docNo}) dated {$dateStr} issued by {$storeName}.\n\n"
            . "BILLING SUMMARY\n"
            . "----------------------------------------\n"
            . "Invoice No: {$docNo}\n"
            . "Invoice Date: {$dateStr}\n"
            . "Invoice Total: Rs. " . number_format($total, 2) . "\n"
            . "Amount Received: Rs. " . number_format($received, 2) . "\n"
            . "Balance Due (This Invoice): Rs. " . number_format($remaining, 2) . "\n"
            . ($customerTotalDue !== null ? "Total Account Balance Due: Rs. " . number_format($customerTotalDue, 2) . "\n" : '')
            . "----------------------------------------\n\n"
            . "TERMS & RETURN POLICY:\n"
            . "{$englishNote}\n\n"
            . "Sincerely,\n"
            . "{$storeName}"
            . ($storePhone !== '' ? "\nTel: {$storePhone}" : '')
            . ($storeAddress !== '' ? "\n{$storeAddress}" : '');

        $emailSubjectUr = "سیل انوائس {$docNo} — {$storeName}";
        $emailBodyUr = "محترم {$custName}،\n"
            . "السلام علیکم!\n\n"
            . "{$storeName} کی جانب سے آپ کا سیل انوائس / بل نمبر ({$docNo}) مورخہ {$dateStr} پی ڈی ایف (PDF) فائل کی صورت میں اس ای میل کے ساتھ منسلک ہے۔\n\n"
            . "بل کا خلاصہ:\n"
            . "----------------------------------------\n"
            . "بل نمبر: {$docNo}\n"
            . "تاریخ: {$dateStr}\n"
            . "کل بل: Rs. " . number_format($total, 2) . "\n"
            . "وصول شدہ رقم: Rs. " . number_format($received, 2) . "\n"
            . "بقایا رقم (موجودہ بل): Rs. " . number_format($remaining, 2) . "\n"
            . ($customerTotalDue !== null ? "کل کھاتہ بقایا: Rs. " . number_format($customerTotalDue, 2) . "\n" : '')
            . "----------------------------------------\n\n"
            . "ضروری ہدایات و شرائط:\n"
            . "{$urduNote}\n\n"
            . "والسلام،\n"
            . "{$storeName}"
            . ($storePhone !== '' ? "\nفون نمبر: {$storePhone}" : '')
            . ($storeAddress !== '' ? "\n{$storeAddress}" : '');

        $whatsappTextEn = implode("\n", $waEnLines);
        $whatsappTextUr = implode("\n", $waUrLines);

        return [
            'title'            => "Sale Invoice {$docNo}",
            'filename'         => 'Sale_Invoice_' . preg_replace('/[^A-Za-z0-9_-]/', '_', $docNo) . '.pdf',
            'view'             => 'pdf.sale_invoice',
            'view_data'        => [
                'invoice'          => $invoice,
                'setting'          => $setting,
                'customerTotalDue' => $customerTotalDue,
            ],
            'party_type'       => $customer ? 'customer' : null,
            'party_id'         => $customer?->id,
            'recipient_name'   => $custName,
            'recipient_phone'  => $customer?->phone ?? '',
            'recipient_email'  => $customer?->email ?? '',
            'whatsapp_text'    => $whatsappTextEn,
            'whatsapp_text_en' => $whatsappTextEn,
            'whatsapp_text_ur' => $whatsappTextUr,
            'email_subject'    => $emailSubjectEn,
            'email_subject_en' => $emailSubjectEn,
            'email_subject_ur' => $emailSubjectUr,
            'email_body'       => $emailBodyEn,
            'email_body_en'    => $emailBodyEn,
            'email_body_ur'    => $emailBodyUr,
        ];
    }

    private function resolveCustomerLedger(int $customerId, ?string $from, ?string $to, ?Setting $setting, string $storeName): array
    {
        $customer = Customer::findOrFail($customerId);

        $hasInvoiceDate = Schema::hasColumn('sale_invoices', 'invoice_date');
        $dateColumn     = $hasInvoiceDate ? 'invoice_date' : 'date';
        $hasInvoiceNo   = Schema::hasColumn('sale_invoices', 'invoice_no');

        $selectCols = [
            'id', 'posted_number', 'date',
            'invoice_total', 'total', 'grand_total', 'net_total', 'gross_amount', 'sub_total',
            'total_receive', 'total_recieve', 'received', 'amount_received',
        ];
        if ($hasInvoiceDate) $selectCols[] = 'invoice_date';
        if ($hasInvoiceNo)   $selectCols[] = 'invoice_no';

        $rawInvoices = SaleInvoice::query()
            ->where('customer_id', $customer->id)
            ->where('invoice_type', 'credit')
            ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'))
            ->when($from, fn ($q) => $q->whereDate($dateColumn, '>=', $from))
            ->when($to, fn ($q) => $q->whereDate($dateColumn, '<=', $to))
            ->orderBy($dateColumn)
            ->orderBy('id')
            ->get($selectCols);

        $allocatedByInvoice = collect();
        $invIds = $rawInvoices->pluck('id')->all();
        if (!empty($invIds) && Schema::hasTable('payment_allocations') && Schema::hasTable('payments')) {
            $allocatedByInvoice = \App\Models\PaymentAllocation::query()
                ->where('invoice_type', 'sale_invoice')
                ->whereIn('invoice_id', $invIds)
                ->whereHas('payment', fn ($q) => $q->where('status', 'posted'))
                ->selectRaw('invoice_id, SUM(amount) as total_allocated')
                ->groupBy('invoice_id')
                ->pluck('total_allocated', 'invoice_id');
        }

        $invoices = $rawInvoices->map(function ($inv) use ($hasInvoiceDate, $hasInvoiceNo, $allocatedByInvoice) {
            $t = (float) ($inv->invoice_total ?? $inv->total ?? $inv->grand_total ?? $inv->net_total ?? $inv->gross_amount ?? $inv->sub_total ?? 0);
            $rawR = (float) ($inv->total_receive ?? $inv->total_recieve ?? $inv->received ?? $inv->amount_received ?? 0);
            $allocated = (float) ($allocatedByInvoice[$inv->id] ?? 0);
            $directR = max(0.0, $rawR - $allocated);
            $r = min($directR, $t);
            $rawDate = $hasInvoiceDate ? ($inv->invoice_date ?? $inv->date) : $inv->date;
            $entryDate = $rawDate ? Carbon::parse($rawDate)->format('Y-m-d') : null;
            $invoiceNumber = $hasInvoiceNo ? ($inv->invoice_no ?? null) : null;

            return (object) [
                'id'              => $inv->id,
                'entry_type'      => 'invoice',
                'is_manual'       => false,
                'entry_date'      => $entryDate,
                'posted_number'   => $inv->posted_number,
                'invoice_number'  => $invoiceNumber,
                'invoice_total'   => $t,
                'total_received'  => $r,
                'credited_amount' => 0.0,
                'payment_amount'  => 0.0,
                'payment_ref'     => null,
                'description'     => 'Sale Invoice ' . ($inv->posted_number ?? ('#' . $inv->id)),
            ];
        });

        $manualAndPayments = CustomerLedger::query()
            ->where('customer_id', $customer->id)
            ->whereIn('entry_type', ['payment', 'manual'])
            ->when($from, fn ($q) => $q->whereDate('entry_date', '>=', $from))
            ->when($to, fn ($q) => $q->whereDate('entry_date', '<=', $to))
            ->orderBy('entry_date')
            ->orderBy('id')
            ->get()
            ->map(function (CustomerLedger $r) {
                $isInvoiceLike = strtolower($r->entry_type) === 'manual';
                $credited = (float) ($r->credited_amount ?? 0);
                return (object) [
                    'id'              => $r->id,
                    'entry_type'      => strtolower($r->entry_type),
                    'is_manual'       => (bool) $r->is_manual,
                    'entry_date'      => optional($r->entry_date)->format('Y-m-d'),
                    'posted_number'   => $r->posted_number,
                    'invoice_number'  => null,
                    'invoice_total'   => $isInvoiceLike ? (float) ($r->invoice_total ?? 0) : 0.0,
                    'total_received'  => $isInvoiceLike ? (float) ($r->total_received ?? 0) : 0.0,
                    'credited_amount' => $credited,
                    'payment_amount'  => $credited,
                    'payment_ref'     => $r->payment_ref,
                    'description'     => $r->description,
                ];
            });

        $all = $invoices->toBase()->concat($manualAndPayments->toBase())
            ->sortBy(fn ($r) => [$r->entry_date, $r->id ?? 0])
            ->values();

        // Compute opening brought-forward balance prior to $from
        $openingBalance = 0.0;
        if (!empty($from)) {
            $priorInvRows = SaleInvoice::query()
                ->where('customer_id', $customer->id)
                ->where('invoice_type', 'credit')
                ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'))
                ->whereDate($dateColumn, '<', $from)
                ->get($selectCols);

            $priorAllocated = collect();
            $priorIds = $priorInvRows->pluck('id')->all();
            if (!empty($priorIds) && Schema::hasTable('payment_allocations') && Schema::hasTable('payments')) {
                $priorAllocated = \App\Models\PaymentAllocation::query()
                    ->where('invoice_type', 'sale_invoice')
                    ->whereIn('invoice_id', $priorIds)
                    ->whereHas('payment', fn ($q) => $q->where('status', 'posted'))
                    ->selectRaw('invoice_id, SUM(amount) as total_allocated')
                    ->groupBy('invoice_id')
                    ->pluck('total_allocated', 'invoice_id');
            }

            $priorInv = $priorInvRows->sum(function ($inv) use ($priorAllocated) {
                $t = (float) ($inv->invoice_total ?? $inv->total ?? $inv->grand_total ?? $inv->net_total ?? $inv->gross_amount ?? $inv->sub_total ?? 0);
                $rawR = (float) ($inv->total_receive ?? $inv->total_recieve ?? $inv->received ?? $inv->amount_received ?? 0);
                $allocated = (float) ($priorAllocated[$inv->id] ?? 0);
                $directR = max(0.0, $rawR - $allocated);
                return max(0.0, $t - min($directR, $t));
            });

            $priorManual = CustomerLedger::query()
                ->where('customer_id', $customer->id)
                ->where('entry_type', 'manual')
                ->whereDate('entry_date', '<', $from)
                ->get(['invoice_total', 'total_received'])
                ->sum(fn ($r) => (float) ($r->invoice_total ?? 0) - (float) ($r->total_received ?? 0));

            $priorPay = (float) CustomerLedger::query()
                ->where('customer_id', $customer->id)
                ->where('entry_type', 'payment')
                ->whereDate('entry_date', '<', $from)
                ->sum('credited_amount');

            $openingBalance = round(($priorInv + $priorManual) - $priorPay, 2);
        }

        $balance = $openingBalance;
        foreach ($all as $r) {
            $t = strtolower($r->entry_type);
            if (in_array($t, ['invoice', 'manual'], true)) {
                $balance += ((float) $r->invoice_total - (float) $r->total_received);
            } elseif ($t === 'payment') {
                $balance -= (float) $r->credited_amount;
            }
            $r->running_balance = round($balance, 2);
        }

        $sumInv  = (float) $all->whereIn('entry_type', ['invoice', 'manual'])->sum('invoice_total');
        $sumRecv = (float) $all->whereIn('entry_type', ['invoice', 'manual'])->sum('total_received');
        $sumPay  = (float) $all->where('entry_type', 'payment')->sum('credited_amount');
        $netBal  = round($openingBalance + ($sumInv - $sumRecv) - $sumPay, 2);

        $summary = [
            'opening_balance'     => $openingBalance,
            'total_invoiced'      => $sumInv,
            'received_on_invoice' => $sumRecv,
            'payments_credited'   => $sumPay,
            'net_balance'         => $netBal,
        ];

        $periodLabel = ($from ?: 'Beginning') . ' to ' . ($to ?: now()->toDateString());

        $waLines = [
            "*{$storeName}*",
            "Customer Account Statement",
            "Customer: {$customer->name}",
            "Statement Period: {$periodLabel}",
            "",
            "Total Invoiced: Rs. " . number_format($sumInv, 2),
            "Total Received: Rs. " . number_format($sumRecv + $sumPay, 2),
            "Net Balance Due: *Rs. " . number_format($netBal, 2) . "*",
            "",
            "Please find your detailed account statement attached.",
        ];

        $emailSubject = "Account Statement ({$customer->name}) — {$storeName}";
        $emailBody = "Dear {$customer->name},\n\n"
            . "Please find attached your Customer Account Statement from {$storeName} for the period {$periodLabel}.\n\n"
            . "Statement Summary:\n"
            . "Total Invoiced: Rs. " . number_format($sumInv, 2) . "\n"
            . "Total Payments Received: Rs. " . number_format($sumRecv + $sumPay, 2) . "\n"
            . "Current Net Balance Due: Rs. " . number_format($netBal, 2) . "\n\n"
            . "Sincerely,\n{$storeName}";

        return [
            'title'           => "Customer Statement - {$customer->name}",
            'filename'        => 'Customer_Statement_' . preg_replace('/[^A-Za-z0-9_-]/', '_', $customer->name) . '.pdf',
            'view'            => 'pdf.customer_ledger',
            'view_data'       => [
                'customer' => $customer,
                'setting'  => $setting,
                'rows'     => $all,
                'summary'  => $summary,
                'from'     => $from,
                'to'       => $to,
            ],
            'party_type'      => 'customer',
            'party_id'        => $customer->id,
            'recipient_name'  => $customer->name,
            'recipient_phone' => $customer->phone ?? '',
            'recipient_email' => $customer->email ?? '',
            'whatsapp_text'   => implode("\n", $waLines),
            'email_subject'   => $emailSubject,
            'email_body'      => $emailBody,
        ];
    }

    private function resolveSupplierLedger(int $supplierId, ?string $from, ?string $to, ?Setting $setting, string $storeName): array
    {
        $supplier = Supplier::findOrFail($supplierId);

        $rows = SupplierLedger::query()
            ->where('supplier_id', $supplier->id)
            ->when($from, fn ($q) => $q->whereDate('entry_date', '>=', $from))
            ->when($to, fn ($q) => $q->whereDate('entry_date', '<=', $to))
            ->orderBy('entry_date')
            ->orderBy('id')
            ->get();

        $openingBalance = 0.0;
        if (!empty($from)) {
            $priorRows = SupplierLedger::query()
                ->where('supplier_id', $supplier->id)
                ->whereDate('entry_date', '<', $from)
                ->get(['entry_type', 'invoice_total', 'total_paid', 'debited_amount']);
            foreach ($priorRows as $pr) {
                if (in_array($pr->entry_type, ['invoice', 'manual'], true)) {
                    $openingBalance += ((float) ($pr->invoice_total ?? 0) - (float) ($pr->total_paid ?? 0));
                } elseif ($pr->entry_type === 'payment') {
                    $openingBalance -= (float) ($pr->debited_amount ?? 0);
                }
            }
            $openingBalance = round($openingBalance, 2);
        }

        $balance = $openingBalance;
        $mapped = $rows->map(function ($r) use (&$balance) {
            $invoiceTotal = (float) ($r->invoice_total ?? 0);
            $paidOnInv    = (float) ($r->total_paid ?? 0);
            $payment      = (float) ($r->debited_amount ?? 0);
            $type         = $r->entry_type;

            if (in_array($type, ['invoice', 'manual'], true)) {
                $balance += ($invoiceTotal - $paidOnInv);
            }
            if ($type === 'payment') {
                $balance -= $payment;
            }

            $r->payment_amount  = $payment;
            $r->running_balance = round($balance, 2);
            return $r;
        });

        $sumInv  = (float) $mapped->sum('invoice_total');
        $sumPaid = (float) $mapped->sum('total_paid');
        $sumDeb  = (float) $mapped->sum('debited_amount');
        $netBal  = round($openingBalance + ($sumInv - $sumPaid) - $sumDeb, 2);

        $summary = [
            'opening_balance'  => $openingBalance,
            'total_invoiced'   => $sumInv,
            'paid_on_invoice'  => $sumPaid,
            'payments_debited' => $sumDeb,
            'net_balance'      => $netBal,
        ];

        $periodLabel = ($from ?: 'Beginning') . ' to ' . ($to ?: now()->toDateString());

        $waLines = [
            "*{$storeName}*",
            "Supplier Account Statement",
            "Supplier: {$supplier->name}",
            "Statement Period: {$periodLabel}",
            "",
            "Total Invoiced: Rs. " . number_format($sumInv, 2),
            "Total Paid: Rs. " . number_format($sumPaid + $sumDeb, 2),
            "Net Payable Balance: *Rs. " . number_format($netBal, 2) . "*",
            "",
            "Please find the supplier ledger statement attached.",
        ];

        $emailSubject = "Supplier Account Statement ({$supplier->name}) — {$storeName}";
        $emailBody = "Dear {$supplier->name},\n\n"
            . "Please find attached the Supplier Account Statement from {$storeName} for the period {$periodLabel}.\n\n"
            . "Statement Summary:\n"
            . "Total Invoiced: Rs. " . number_format($sumInv, 2) . "\n"
            . "Total Paid: Rs. " . number_format($sumPaid + $sumDeb, 2) . "\n"
            . "Net Payable Balance: Rs. " . number_format($netBal, 2) . "\n\n"
            . "Sincerely,\n{$storeName}";

        return [
            'title'           => "Supplier Statement - {$supplier->name}",
            'filename'        => 'Supplier_Statement_' . preg_replace('/[^A-Za-z0-9_-]/', '_', $supplier->name) . '.pdf',
            'view'            => 'pdf.supplier_ledger',
            'view_data'       => [
                'supplier' => $supplier,
                'setting'  => $setting,
                'rows'     => $mapped,
                'summary'  => $summary,
                'from'     => $from,
                'to'       => $to,
            ],
            'party_type'      => 'supplier',
            'party_id'        => $supplier->id,
            'recipient_name'  => $supplier->name,
            'recipient_phone' => $supplier->phone ?? '',
            'recipient_email' => $supplier->email ?? '',
            'whatsapp_text'   => implode("\n", $waLines),
            'email_subject'   => $emailSubject,
            'email_body'      => $emailBody,
        ];
    }

    private function resolvePayment(int $id, ?Setting $setting, string $storeName): array
    {
        $payment = Payment::with([
            'customer',
            'supplier',
            'account',
            'creator',
            'allocations.saleInvoice:id,posted_number,total,date',
            'allocations.purchaseInvoice:id,posted_number,invoice_number,total_amount,posted_date',
        ])->findOrFail($id);

        $isCustomer = $payment->party_type === 'customer';
        $party = $isCustomer ? $payment->customer : $payment->supplier;
        $partyName = $party->name ?? 'Valued Partner';
        $voucherNo = $payment->payment_number ?: ('PAY-' . $payment->id);
        $dateStr = $payment->payment_date ? Carbon::parse($payment->payment_date)->format('d M Y') : '-';
        $totalAmount = (float) ($payment->amount ?? 0);
        $docLabel = $isCustomer ? 'Official Payment Receipt' : 'Payment Voucher';

        $waLines = [
            "*{$storeName}*",
            "{$docLabel}: *{$voucherNo}*",
            "Date: {$dateStr}",
            ($isCustomer ? 'Customer' : 'Supplier') . ": {$partyName}",
            "",
            "Amount " . ($isCustomer ? 'Received' : 'Paid') . ": *Rs. " . number_format($totalAmount, 2) . "*",
            "Payment Method: " . strtoupper(str_replace('_', ' ', $payment->payment_method ?? 'CASH')),
        ];
        if ($payment->reference) {
            $waLines[] = "Reference: {$payment->reference}";
        }
        $waLines[] = "";
        $waLines[] = "Please find the official voucher attached.";

        $emailSubject = "{$docLabel} {$voucherNo} — {$storeName}";
        $emailBody = "Dear {$partyName},\n\n"
            . "Please find attached {$docLabel} ({$voucherNo}) dated {$dateStr} issued by {$storeName}.\n\n"
            . "Amount " . ($isCustomer ? 'Received' : 'Paid') . ": Rs. " . number_format($totalAmount, 2) . "\n"
            . "Payment Method: " . strtoupper(str_replace('_', ' ', $payment->payment_method ?? 'CASH')) . "\n\n"
            . "Sincerely,\n{$storeName}";

        return [
            'title'           => "{$docLabel} {$voucherNo}",
            'filename'        => 'Payment_Voucher_' . preg_replace('/[^A-Za-z0-9_-]/', '_', $voucherNo) . '.pdf',
            'view'            => 'pdf.payment_voucher',
            'view_data'       => [
                'payment' => $payment,
                'setting' => $setting,
            ],
            'party_type'      => $isCustomer ? 'customer' : 'supplier',
            'party_id'        => $party?->id,
            'recipient_name'  => $partyName,
            'recipient_phone' => $party?->phone ?? '',
            'recipient_email' => $party?->email ?? '',
            'whatsapp_text'   => implode("\n", $waLines),
            'email_subject'   => $emailSubject,
            'email_body'      => $emailBody,
        ];
    }

    private function resolvePurchaseOrder(int $id, ?Setting $setting, string $storeName): array
    {
        $order = PurchaseOrder::with(['supplier', 'items.product'])->findOrFail($id);
        $supplier = $order->supplier;
        $supplierName = $supplier->name ?? 'Supplier';
        $poNo = $order->number ?: ('PO-' . str_pad((string) $order->id, 5, '0', STR_PAD_LEFT));
        $dateStr = $order->date ? Carbon::parse($order->date)->format('d M Y') : '-';
        $deliveryStr = $order->expected_received_date ? Carbon::parse($order->expected_received_date)->format('d M Y') : 'As soon as possible';
        $totalAmount = (float) $order->items->sum(function ($item) {
            $gross = (float) ($item->ordered_quantity ?? 0) * (float) ($item->unit_purchase_price ?? 0);
            $disc = (float) ($item->item_discount_percentage ?? 0);
            return $gross * (1 - ($disc / 100.0));
        });
        $itemsCount = $order->items->count();

        $waLines = [
            "*{$storeName}*",
            "Purchase Order: *{$poNo}*",
            "Order Date: {$dateStr}",
            "Supplier: {$supplierName}",
            "Expected Delivery: {$deliveryStr}",
            "",
            "Total Line Items: {$itemsCount}",
            "Order Total: *Rs. " . number_format($totalAmount, 2) . "*",
            "",
            "Please find our official Purchase Order attached and confirm receipt.",
        ];

        $emailSubject = "Purchase Order {$poNo} — {$storeName}";
        $emailBody = "Dear {$supplierName},\n\n"
            . "Please find attached our official Purchase Order ({$poNo}) dated {$dateStr} from {$storeName}.\n\n"
            . "Order Summary:\n"
            . "Total Line Items: {$itemsCount}\n"
            . "Estimated Order Value: Rs. " . number_format($totalAmount, 2) . "\n"
            . "Expected Delivery Date: {$deliveryStr}\n\n"
            . "Kindly confirm receipt and expected dispatch schedule.\n\n"
            . "Sincerely,\n{$storeName}";

        return [
            'title'           => "Purchase Order {$poNo}",
            'filename'        => 'Purchase_Order_' . preg_replace('/[^A-Za-z0-9_-]/', '_', $poNo) . '.pdf',
            'view'            => 'pdf.purchase_order',
            'view_data'       => [
                'order'       => $order,
                'setting'     => $setting,
                'totalAmount' => $totalAmount,
            ],
            'party_type'      => $supplier ? 'supplier' : null,
            'party_id'        => $supplier?->id,
            'recipient_name'  => $supplierName,
            'recipient_phone' => $supplier?->phone ?? '',
            'recipient_email' => $supplier?->email ?? '',
            'whatsapp_text'   => implode("\n", $waLines),
            'email_subject'   => $emailSubject,
            'email_body'      => $emailBody,
        ];
    }

    private function computeCustomerNetBalance(int $customerId): float
    {
        $invoices = SaleInvoice::query()
            ->where('customer_id', $customerId)
            ->where('invoice_type', 'credit')
            ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'))
            ->get(['id', 'total', 'total_receive']);

        $allocatedByInvoice = collect();
        $invIds = $invoices->pluck('id')->all();
        if (!empty($invIds) && Schema::hasTable('payment_allocations') && Schema::hasTable('payments')) {
            $allocatedByInvoice = \App\Models\PaymentAllocation::query()
                ->where('invoice_type', 'sale_invoice')
                ->whereIn('invoice_id', $invIds)
                ->whereHas('payment', fn ($q) => $q->where('status', 'posted'))
                ->selectRaw('invoice_id, SUM(amount) as total_allocated')
                ->groupBy('invoice_id')
                ->pluck('total_allocated', 'invoice_id');
        }

        $invDelta = $invoices->sum(function ($inv) use ($allocatedByInvoice) {
            $t = (float) ($inv->total ?? 0);
            $rawR = (float) ($inv->total_receive ?? 0);
            $allocated = (float) ($allocatedByInvoice[$inv->id] ?? 0);
            $directR = max(0.0, $rawR - $allocated);
            $r = min($directR, $t);
            return max(0.0, $t - $r);
        });

        $manualRows = CustomerLedger::query()
            ->where('customer_id', $customerId)
            ->where('entry_type', 'manual')
            ->get(['invoice_total', 'total_received']);

        $manualDelta = $manualRows->sum(fn ($r) => (float) ($r->invoice_total ?? 0) - (float) ($r->total_received ?? 0));

        $paymentsCredited = (float) CustomerLedger::query()
            ->where('customer_id', $customerId)
            ->where('entry_type', 'payment')
            ->sum('credited_amount');

        return round(($invDelta + $manualDelta) - $paymentsCredited, 2);
    }

    private function resolvePurchaseInvoice(int $id, ?Setting $setting, string $storeName): array
    {
        $invoice = \App\Models\PurchaseInvoice::with(['supplier', 'items.product'])->findOrFail($id);
        $supplier = $invoice->supplier;
        $supplierName = $supplier->name ?? 'Supplier';
        $docNo = $invoice->posted_number ?: ('PI-' . $invoice->id);
        $dateStr = $invoice->posted_date ? Carbon::parse($invoice->posted_date)->format('d M Y') : '-';
        $total = (float) ($invoice->total_amount ?? 0);
        $paid = (float) ($invoice->total_paid ?? 0);
        $remaining = max(0, $total - $paid);

        $waLines = [
            "*{$storeName}*",
            "Purchase Invoice (GRN): *{$docNo}*",
            "Date: {$dateStr}",
            "Supplier: {$supplierName}",
            "",
            "Invoice Total: Rs. " . number_format($total, 2),
            "Amount Paid: Rs. " . number_format($paid, 2),
            "Balance Payable: *Rs. " . number_format($remaining, 2) . "*",
            "",
            "Please find the Purchase Invoice (GRN) PDF attached.",
        ];

        $emailSubject = "Purchase Invoice (GRN) {$docNo} — {$storeName}";
        $emailBody = "Dear {$supplierName},\n\n"
            . "Please find attached Purchase Invoice / GRN ({$docNo}) dated {$dateStr} recorded by {$storeName}.\n\n"
            . "Invoice Total: Rs. " . number_format($total, 2) . "\n"
            . "Amount Paid: Rs. " . number_format($paid, 2) . "\n"
            . "Remaining Payable: Rs. " . number_format($remaining, 2) . "\n\n"
            . "Sincerely,\n{$storeName}";

        return [
            'title'           => "Purchase Invoice {$docNo}",
            'filename'        => 'Purchase_Invoice_' . preg_replace('/[^A-Za-z0-9_-]/', '_', $docNo) . '.pdf',
            'view'            => 'pdf.purchase_invoice',
            'view_data'       => [
                'invoice' => $invoice,
                'setting' => $setting,
            ],
            'party_type'      => $supplier ? 'supplier' : null,
            'party_id'        => $supplier?->id,
            'recipient_name'  => $supplierName,
            'recipient_phone' => $supplier?->phone ?? '',
            'recipient_email' => $supplier?->email ?? '',
            'whatsapp_text'   => implode("\n", $waLines),
            'email_subject'   => $emailSubject,
            'email_body'      => $emailBody,
        ];
    }

    private function resolveSaleReturn(int $id, ?Setting $setting, string $storeName): array
    {
        $ret = \App\Models\SaleReturn::with(['customer', 'saleInvoice', 'items.product'])->findOrFail($id);
        $customer = $ret->customer;
        $custName = $customer->name ?? 'Valued Customer';
        $docNo = $ret->posted_number ?: ('SR-' . $ret->id);
        $dateStr = $ret->date ? Carbon::parse($ret->date)->format('d M Y') : '-';
        $total = (float) ($ret->total ?? 0);

        $waLines = [
            "*{$storeName}*",
            "Sale Return / Credit Note: *{$docNo}*",
            "Date: {$dateStr}",
            "Customer: {$custName}",
            "",
            "Return Credit Total: *Rs. " . number_format($total, 2) . "*",
            "",
            "Please find the Credit Note PDF attached.",
        ];

        $emailSubject = "Sale Return Credit Note {$docNo} — {$storeName}";
        $emailBody = "Dear {$custName},\n\n"
            . "Please find attached Sale Return / Credit Note ({$docNo}) dated {$dateStr} issued by {$storeName}.\n\n"
            . "Total Return Amount: Rs. " . number_format($total, 2) . "\n\n"
            . "Sincerely,\n{$storeName}";

        return [
            'title'           => "Sale Return {$docNo}",
            'filename'        => 'Sale_Return_' . preg_replace('/[^A-Za-z0-9_-]/', '_', $docNo) . '.pdf',
            'view'            => 'pdf.sale_return',
            'view_data'       => [
                'return'  => $ret,
                'setting' => $setting,
            ],
            'party_type'      => $customer ? 'customer' : null,
            'party_id'        => $customer?->id,
            'recipient_name'  => $custName,
            'recipient_phone' => $customer?->phone ?? '',
            'recipient_email' => $customer?->email ?? '',
            'whatsapp_text'   => implode("\n", $waLines),
            'email_subject'   => $emailSubject,
            'email_body'      => $emailBody,
        ];
    }

    private function resolvePurchaseReturn(int $id, ?Setting $setting, string $storeName): array
    {
        $ret = \App\Models\PurchaseReturn::with(['supplier', 'purchaseInvoice', 'items.product'])->findOrFail($id);
        $supplier = $ret->supplier;
        $supplierName = $supplier->name ?? 'Supplier';
        $docNo = $ret->posted_number ?: ('PR-' . $ret->id);
        $dateStr = $ret->date ? Carbon::parse($ret->date)->format('d M Y') : '-';
        $total = (float) ($ret->total ?? 0);

        $waLines = [
            "*{$storeName}*",
            "Purchase Return / Debit Note: *{$docNo}*",
            "Date: {$dateStr}",
            "Supplier: {$supplierName}",
            "",
            "Return Debit Total: *Rs. " . number_format($total, 2) . "*",
            "",
            "Please find the Debit Note PDF attached.",
        ];

        $emailSubject = "Purchase Return Debit Note {$docNo} — {$storeName}";
        $emailBody = "Dear {$supplierName},\n\n"
            . "Please find attached Purchase Return / Debit Note ({$docNo}) dated {$dateStr} from {$storeName}.\n\n"
            . "Total Return Amount: Rs. " . number_format($total, 2) . "\n\n"
            . "Sincerely,\n{$storeName}";

        return [
            'title'           => "Purchase Return {$docNo}",
            'filename'        => 'Purchase_Return_' . preg_replace('/[^A-Za-z0-9_-]/', '_', $docNo) . '.pdf',
            'view'            => 'pdf.purchase_return',
            'view_data'       => [
                'return'  => $ret,
                'setting' => $setting,
            ],
            'party_type'      => $supplier ? 'supplier' : null,
            'party_id'        => $supplier?->id,
            'recipient_name'  => $supplierName,
            'recipient_phone' => $supplier?->phone ?? '',
            'recipient_email' => $supplier?->email ?? '',
            'whatsapp_text'   => implode("\n", $waLines),
            'email_subject'   => $emailSubject,
            'email_body'      => $emailBody,
        ];
    }

    private function resolveStockDisposal(int $id, ?Setting $setting, string $storeName): array
    {
        $disposal = \App\Models\StockDisposal::with(['creator', 'disposer', 'restorer', 'items.product', 'items.batch'])->findOrFail($id);
        $docNo = $disposal->disposal_number ?: ($disposal->reference_no ?: ('DSP-' . $disposal->id));
        $dateStr = $disposal->disposal_date ? Carbon::parse($disposal->disposal_date)->format('d M Y') : '-';
        $totalCost = (float) ($disposal->total_cost_value ?? $disposal->total_cost ?? 0);

        $waLines = [
            "*{$storeName}*",
            "Stock Disposal Certificate: *{$docNo}*",
            "Date: {$dateStr}",
            "Status: " . strtoupper($disposal->status ?? 'QUARANTINED'),
            "Total Write-Off Value: Rs. " . number_format($totalCost, 2),
        ];

        return [
            'title'           => "Stock Disposal Certificate {$docNo}",
            'filename'        => 'Stock_Disposal_Certificate_' . preg_replace('/[^A-Za-z0-9_-]/', '_', $docNo) . '.pdf',
            'view'            => 'pdf.stock_disposal',
            'view_data'       => [
                'disposal' => $disposal,
                'setting'  => $setting,
            ],
            'party_type'      => null,
            'party_id'        => null,
            'recipient_name'  => 'Regulatory / Audit Authority',
            'recipient_phone' => '',
            'recipient_email' => '',
            'whatsapp_text'   => implode("\n", $waLines),
            'email_subject'   => "Stock Disposal Certificate {$docNo} - {$storeName}",
            'email_body'      => "Please find attached the Official Stock Disposal / Destruction Certificate ({$docNo}) dated {$dateStr} from {$storeName}.",
        ];
    }

    private function resolveCashDrawerSession(int $id, ?Setting $setting, string $storeName): array
    {
        $session = \App\Models\CashDrawerSession::with([
            'user',
            'transactions' => fn($q) => $q->reorder('created_at', 'asc')->orderBy('id', 'asc')->with('user'),
        ])->findOrFail($id);
        $docNo = 'SHIFT-' . $session->id;
        $openedStr = $session->opened_at ? Carbon::parse($session->opened_at)->format('d M Y h:i A') : '-';

        return [
            'title'           => "Cash Drawer Z-Report ({$docNo})",
            'filename'        => "Cash_Drawer_Z_Report_{$docNo}.pdf",
            'view'            => 'pdf.cash_drawer_z_report',
            'view_data'       => [
                'session' => $session,
                'setting' => $setting,
            ],
            'party_type'      => null,
            'party_id'        => null,
            'recipient_name'  => $session->user?->name ?? 'Cashier',
            'recipient_phone' => '',
            'recipient_email' => $session->user?->email ?? '',
            'whatsapp_text'   => "*{$storeName}*\nCash Drawer Shift Z-Report ({$docNo})\nOpened: {$openedStr}",
            'email_subject'   => "Cash Drawer Z-Report ({$docNo}) — {$storeName}",
            'email_body'      => "Please find attached the Cash Drawer Shift Z-Report ({$docNo}) from {$storeName}.",
        ];
    }

    private function resolveStocktakeSession(int $id, ?Setting $setting, string $storeName): array
    {
        $session = \App\Models\StocktakeSession::with(['user', 'stockAdjustment', 'items.product', 'items.counter'])->findOrFail($id);
        $docNo = $session->reference_no ?: ('ST-' . $session->id);

        return [
            'title'           => "Stocktake Session {$docNo}",
            'filename'        => 'Stocktake_' . preg_replace('/[^A-Za-z0-9_-]/', '_', $docNo) . '.pdf',
            'view'            => 'pdf.stocktake_session',
            'view_data'       => [
                'session' => $session,
                'setting' => $setting,
            ],
            'party_type'      => null,
            'party_id'        => null,
            'recipient_name'  => $session->user?->name ?? 'Inventory Auditor',
            'recipient_phone' => '',
            'recipient_email' => $session->user?->email ?? '',
            'whatsapp_text'   => "*{$storeName}*\nStocktake Variance Report ({$docNo})",
            'email_subject'   => "Stocktake Session Report ({$docNo}) — {$storeName}",
            'email_body'      => "Please find attached the Stocktake Count & Variance Report ({$docNo}) from {$storeName}.",
        ];
    }

    private function resolveDeliveryChallan(int $id, ?Setting $setting, string $storeName): array
    {
        $invoice = SaleInvoice::with(['customer', 'user', 'items.product'])->findOrFail($id);
        $customer = $invoice->customer;
        $docNo = 'DC-' . ($invoice->posted_number ?: $invoice->id);
        $dateStr = $invoice->date ? Carbon::parse($invoice->date)->format('d M Y') : optional($invoice->created_at)->format('d M Y');
        $custName = $customer->name ?? 'Valued Customer';
        $totalUnits = (int) $invoice->items->sum('quantity');

        $waLines = [
            "*{$storeName}*",
            "Delivery Challan / Gate Pass: *{$docNo}*",
            "Date: {$dateStr}",
            "Consignee: {$custName}",
            "Dispatched Items: {$invoice->items->count()} lines ({$totalUnits} units)",
            "",
            "Please verify quantities and batch numbers upon receipt.",
        ];

        $emailSubject = "Delivery Challan {$docNo} — {$storeName}";
        $emailBody = "Dear {$custName},\n\n"
            . "Please find attached Delivery Challan / Packing Slip ({$docNo}) for Sale Invoice #" . ($invoice->posted_number ?: $invoice->id) . " dated {$dateStr}.\n\n"
            . "Total Dispatched Lines: {$invoice->items->count()} ({$totalUnits} units)\n\n"
            . "Sincerely,\n{$storeName}";

        return [
            'title'           => "Delivery Challan {$docNo}",
            'filename'        => 'Delivery_Challan_' . preg_replace('/[^A-Za-z0-9_-]/', '_', $docNo) . '.pdf',
            'view'            => 'pdf.delivery_challan',
            'view_data'       => [
                'invoice' => $invoice,
                'setting' => $setting,
            ],
            'party_type'      => $customer ? 'customer' : null,
            'party_id'        => $customer?->id,
            'recipient_name'  => $custName,
            'recipient_phone' => $customer?->phone ?? '',
            'recipient_email' => $customer?->email ?? '',
            'whatsapp_text'   => implode("\n", $waLines),
            'email_subject'   => $emailSubject,
            'email_body'      => $emailBody,
        ];
    }

    private function resolveQuotation(int $id, ?Setting $setting, string $storeName): array
    {
        $draft = \App\Models\InvoiceDraft::with('user')->findOrFail($id);
        $payload = $draft->payload ?? [];
        $customer = !empty($payload['customer_id']) ? Customer::find($payload['customer_id']) : null;
        $custName = $customer?->name ?? ($draft->party_name ?: 'Valued Customer');
        $quotationNo = 'QT-' . str_pad((string) $draft->id, 5, '0', STR_PAD_LEFT);
        $dateStr = optional($draft->created_at ?? now())->format('d M Y');
        $total = (float) ($draft->total_amount ?? $payload['total'] ?? 0);

        $rawItems = $payload['items'] ?? [];
        $productIds = collect($rawItems)->pluck('product_id')->filter()->unique()->values()->all();
        $productsMap = empty($productIds)
            ? []
            : \App\Models\Product::whereIn('id', $productIds)->pluck('name', 'id')->all();

        $items = array_map(function ($it) use ($productsMap) {
            $pid = $it['product_id'] ?? null;
            if (empty($it['product_name']) && $pid && isset($productsMap[$pid])) {
                $it['product_name'] = $productsMap[$pid];
            }
            return $it;
        }, $rawItems);

        $waLines = [
            "*{$storeName}*",
            "Price Quotation: *{$quotationNo}*",
            "Date: {$dateStr}",
            "Prepared For: {$custName}",
            "",
            "Estimated Total: *Rs. " . number_format($total, 2) . "*",
            "",
            "Please find our official price quotation attached.",
        ];

        $emailSubject = "Price Quotation {$quotationNo} — {$storeName}";
        $emailBody = "Dear {$custName},\n\n"
            . "Please find attached Price Quotation ({$quotationNo}) dated {$dateStr} prepared by {$storeName}.\n\n"
            . "Estimated Total: Rs. " . number_format($total, 2) . "\n\n"
            . "Sincerely,\n{$storeName}";

        return [
            'title'           => "Price Quotation {$quotationNo}",
            'filename'        => "Quotation_{$quotationNo}.pdf",
            'view'            => 'pdf.quotation',
            'view_data'       => [
                'draft'       => $draft,
                'quotationNo' => $quotationNo,
                'customer'    => $customer,
                'items'       => $items,
                'setting'     => $setting,
            ],
            'party_type'      => $customer ? 'customer' : null,
            'party_id'        => $customer?->id,
            'recipient_name'  => $custName,
            'recipient_phone' => $customer?->phone ?? '',
            'recipient_email' => $customer?->email ?? '',
            'whatsapp_text'   => implode("\n", $waLines),
            'email_subject'   => $emailSubject,
            'email_body'      => $emailBody,
        ];
    }

    private function resolveRegularRefillReminder(int $customerId, ?Setting $setting, string $storeName): array
    {
        $customer = Customer::with(['regularItems.product'])->findOrFail($customerId);
        $custName = $customer->name ?? 'Valued Customer';
        $safeName = preg_replace('/[^A-Za-z0-9_-]/', '_', $custName) ?: ('Customer_' . $customer->id);
        $templates = $this->formatRegularCustomerReminder($customer, $customer->reminder_language ?: 'english');

        return [
            'title'            => "Refill Reminder — {$custName}",
            'filename'         => "Refill_Reminder_{$safeName}.pdf",
            'view'             => 'pdf.regular_refill_reminder',
            'view_data'        => [
                'customer' => $customer,
                'setting'  => $setting,
            ],
            'party_type'       => 'customer',
            'party_id'         => $customer->id,
            'recipient_name'   => $custName,
            'recipient_phone'  => $customer->phone ?? '',
            'recipient_email'  => $customer->email ?? '',
            'whatsapp_text'    => $templates['message'],
            'whatsapp_text_en' => $templates['english'],
            'whatsapp_text_ur' => $templates['urdu'],
            'email_subject'    => "Regular Medicine / Product Readiness Reminder — {$storeName}",
            'email_subject_en' => "Regular Medicine / Product Readiness Reminder — {$storeName}",
            'email_subject_ur' => "{$storeName} — ادویات / اشیاء کی یاد دہانی",
            'email_body'       => $templates['english'],
            'email_body_en'    => $templates['english'],
            'email_body_ur'    => $templates['urdu'],
        ];
    }
}
