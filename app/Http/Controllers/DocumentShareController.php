<?php

namespace App\Http\Controllers;

use App\Mail\DocumentShareMail;
use App\Models\Customer;
use App\Models\CustomerLedger;
use App\Models\Payment;
use App\Models\PurchaseOrder;
use App\Models\SaleInvoice;
use App\Models\Setting;
use App\Models\Supplier;
use App\Models\SupplierLedger;
use App\Services\DocumentShareService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\Rule;

class DocumentShareController extends Controller
{
    public function __construct(private DocumentShareService $shareService) {}

    /**
     * Authorize the current authenticated user for the requested document type & ID.
     */
    private function authorizeDocumentAccess(string $type, array $params): void
    {
        switch ($type) {
            case 'sale_invoice':
            case 'delivery_challan':
                $invoice = SaleInvoice::findOrFail((int) ($params['id'] ?? 0));
                $this->authorize('view', $invoice);
                break;

            case 'quotation':
                $draft = \App\Models\InvoiceDraft::findOrFail((int) ($params['id'] ?? 0));
                $this->authorize('view', $draft);
                break;

            case 'customer_ledger':
                $this->authorize('viewAny', CustomerLedger::class);
                break;

            case 'supplier_ledger':
                $this->authorize('viewAny', SupplierLedger::class);
                break;

            case 'payment':
                $payment = Payment::findOrFail((int) ($params['id'] ?? 0));
                $this->authorize('view', $payment);
                break;

            case 'purchase_order':
                $po = PurchaseOrder::findOrFail((int) ($params['id'] ?? 0));
                $this->authorize('view', $po);
                break;

            case 'purchase_invoice':
                $pi = \App\Models\PurchaseInvoice::findOrFail((int) ($params['id'] ?? 0));
                $this->authorize('view', $pi);
                break;

            case 'sale_return':
                $sr = \App\Models\SaleReturn::findOrFail((int) ($params['id'] ?? 0));
                $this->authorize('view', $sr);
                break;

            case 'purchase_return':
                $pr = \App\Models\PurchaseReturn::findOrFail((int) ($params['id'] ?? 0));
                $this->authorize('view', $pr);
                break;

            case 'stock_disposal':
                $user = request()->user();
                if (!$user) {
                    abort(401);
                }
                \App\Models\StockDisposal::findOrFail((int) ($params['id'] ?? 0));
                if (!$user->hasRole(['Admin', 'admin', 'super-admin']) && !$user->can('stock-disposal.view')) {
                    abort(403, 'This action is unauthorized.');
                }
                break;

            case 'cash_drawer_session':
                $user = request()->user();
                if (!$user) {
                    abort(401);
                }
                \App\Models\CashDrawerSession::findOrFail((int) ($params['id'] ?? 0));
                if (!$user->hasRole(['Admin', 'admin', 'super-admin']) && !$user->can('cash-drawer.view')) {
                    abort(403, 'This action is unauthorized.');
                }
                break;

            case 'stocktake_session':
                $user = request()->user();
                if (!$user) {
                    abort(401);
                }
                $session = \App\Models\StocktakeSession::findOrFail((int) ($params['id'] ?? 0));
                $this->authorize('view', $session);
                break;

            case 'regular_refill_reminder':
                $customerId = (int) ($params['customer_id'] ?? $params['id'] ?? 0);
                $customer = Customer::findOrFail($customerId);
                $this->authorize('view', $customer);
                break;
        }
    }

    /**
     * GET /api/share/metadata
     */
    public function metadata(Request $request)
    {
        $validated = $request->validate([
            'type'        => ['required', 'string', Rule::in(DocumentShareService::SUPPORTED_TYPES)],
            'id'          => ['nullable', 'integer'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'from'        => ['nullable', 'date'],
            'to'          => ['nullable', 'date'],
            'template'    => ['nullable', 'string', Rule::in(DocumentShareService::SUPPORTED_PDF_DESIGNS)],
        ]);

        $this->authorizeDocumentAccess($validated['type'], $validated);

        $metadata = $this->shareService->buildMetadata($validated['type'], $validated);

        return response()->json($metadata);
    }

    /**
     * GET /api/share/pdf
     */
    public function pdf(Request $request)
    {
        $validated = $request->validate([
            'type'        => ['required', 'string', Rule::in(DocumentShareService::SUPPORTED_TYPES)],
            'id'          => ['nullable', 'integer'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'from'        => ['nullable', 'date'],
            'to'          => ['nullable', 'date'],
            'template'    => ['nullable', 'string', Rule::in(DocumentShareService::SUPPORTED_PDF_DESIGNS)],
            'download'    => ['nullable', 'boolean'],
        ]);

        $this->authorizeDocumentAccess($validated['type'], $validated);

        $result = $this->shareService->generatePdf($validated['type'], $validated);

        if ($request->boolean('download')) {
            return $result['pdf']->download($result['filename']);
        }

        return $result['pdf']->stream($result['filename']);
    }

    /**
     * POST /api/share/email
     */
    public function sendEmail(Request $request)
    {
        $validated = $request->validate([
            'type'        => ['required', 'string', Rule::in(DocumentShareService::SUPPORTED_TYPES)],
            'id'          => ['nullable', 'integer'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'from'        => ['nullable', 'date'],
            'to'          => ['nullable', 'date'],
            'template'    => ['nullable', 'string', Rule::in(DocumentShareService::SUPPORTED_PDF_DESIGNS)],
            'email'       => ['required', 'email', 'max:150'],
            'subject'     => ['required', 'string', 'max:255'],
            'message'     => ['required', 'string', 'max:5000'],
            'save_email'  => ['nullable', 'boolean'],
        ]);

        $this->authorizeDocumentAccess($validated['type'], $validated);

        $result = $this->shareService->generatePdf($validated['type'], $validated);
        $context = $result['context'];
        $pdfBytes = $result['pdf']->output();
        $setting = Setting::first();
        $storeName = $setting?->store_name ?? 'Karobar App Store';
        $customSmtpConfigured = $setting ? $setting->applySmtpConfig() : false;

        // Optionally persist the email back to the Customer or Supplier profile
        if (!empty($validated['save_email']) && !empty($context['party_type']) && !empty($context['party_id'])) {
            $actor = $request->user();
            $isAdmin = $actor && $actor->hasRole(['Admin', 'admin', 'super-admin']);
            if ($context['party_type'] === 'customer') {
                $cust = Customer::find($context['party_id']);
                if ($cust && (trim((string) $cust->email) === '' || $isAdmin || ($actor && $actor->can('customer.update')))) {
                    $cust->update(['email' => $validated['email']]);
                }
            } elseif ($context['party_type'] === 'supplier') {
                $sup = Supplier::find($context['party_id']);
                if ($sup && (trim((string) $sup->email) === '' || $isAdmin || ($actor && $actor->can('supplier.update')))) {
                    $sup->update(['email' => $validated['email']]);
                }
            }
        }

        $mailable = new DocumentShareMail(
            subjectLine: $validated['subject'],
            messageBody: $validated['message'],
            storeName: $storeName,
            pdfBytes: $pdfBytes,
            pdfFilename: $result['filename']
        );

        $deliveryMode = 'smtp';
        $smtpError = null;
        try {
            if ($customSmtpConfigured) {
                Mail::mailer('smtp')->to($validated['email'])->send($mailable);
            } else {
                Mail::to($validated['email'])->send($mailable);
            }
        } catch (\Throwable $e) {
            $smtpError = $e->getMessage();
            // If SMTP fails or local SMTP is not running, fall back to log mailer
            // so the request succeeds and returns the built PDF file to the user.
            Mail::mailer('log')->to($validated['email'])->send($mailable);
            $deliveryMode = 'log_fallback';
        }

        $fallbackHostInfo = $customSmtpConfigured
            ? ($setting->smtp_host . ':' . ($setting->smtp_port ?: 587) . ($smtpError ? ' — ' . $smtpError : ''))
            : '127.0.0.1:1025';

        return response()->json([
            'status'        => 'sent',
            'delivery_mode' => $deliveryMode,
            'message'       => $deliveryMode === 'smtp'
                ? 'Document PDF sent successfully to ' . $validated['email']
                : 'PDF built & logged for ' . $validated['email'] . ' (SMTP server failed on ' . $fallbackHostInfo . '; PDF downloaded locally)',
            'filename'      => $result['filename'],
            'pdf_base64'    => base64_encode($pdfBytes),
        ]);
    }

    /**
     * POST /api/share/whatsapp
     * Builds the actual PDF file (and dispatches it directly via WhatsApp Cloud API if configured,
     * or returns the built PDF binary as base64 so the client can share/attach the actual PDF file).
     */
    public function sendWhatsApp(Request $request)
    {
        $validated = $request->validate([
            'type'          => ['required', 'string', Rule::in(DocumentShareService::SUPPORTED_TYPES)],
            'id'            => ['nullable', 'integer'],
            'customer_id'   => ['nullable', 'integer', 'exists:customers,id'],
            'supplier_id'   => ['nullable', 'integer', 'exists:suppliers,id'],
            'from'          => ['nullable', 'date'],
            'to'            => ['nullable', 'date'],
            'template'      => ['nullable', 'string', Rule::in(DocumentShareService::SUPPORTED_PDF_DESIGNS)],
            'phone'         => ['nullable', 'string', 'max:50'],
            'message'       => ['required', 'string', 'max:5000'],
            'save_phone'    => ['nullable', 'boolean'],
            'language'      => ['nullable', 'string', 'in:english,urdu'],
            'advance_cycle' => ['nullable', 'boolean'],
        ]);

        $this->authorizeDocumentAccess($validated['type'], $validated);

        try {
            $response = $this->shareService->sendOrBuildWhatsAppPdf(
                type: $validated['type'],
                params: $validated,
                phone: $validated['phone'] ?? null,
                caption: $validated['message'],
                savePhone: $request->boolean('save_phone')
            );

            if ($validated['type'] === 'regular_refill_reminder' && ($response['status'] ?? '') !== 'qr_required') {
                CustomerController::ensureRegularCustomerSchema();
                $customerId = (int) ($validated['customer_id'] ?? $validated['id'] ?? 0);
                $customer = Customer::with(['regularItems.product:id,name,product_code,quantity,pack_size,unit_sale_price,pack_sale_price'])
                    ->find($customerId);

                if ($customer) {
                    $actor = $request->user();
                    $canMutateCustomer = $actor && (
                        $actor->hasRole(['Admin', 'admin', 'super-admin'])
                        || $actor->can('customer.update')
                        || $actor->can('customer.create')
                        || $actor->can('sale-invoice.create')
                    );
                    $customerCtrl = app(CustomerController::class);
                    if ($canMutateCustomer) {
                        $customer->last_refill_reminded_at = now();
                        if (!empty($validated['language'])) {
                            $customer->reminder_language = $validated['language'];
                        }
                        if ($request->boolean('advance_cycle')) {
                            $customer->next_refill_date = $customerCtrl->calculateNextRefillDate($customer);
                            $customer->last_refill_collected_at = now();
                        }
                        $customer->save();
                    }
                    $response['customer'] = $customerCtrl->appendRegularMetadata($customer);
                }

                $normPhone = $response['normalized_phone'] ?? '';
                $response['wa_me_url'] = $normPhone !== ''
                    ? 'https://wa.me/' . $normPhone . '?text=' . rawurlencode($validated['message'])
                    : 'https://wa.me/?text=' . rawurlencode($validated['message']);
            }

            return response()->json($response);
        } catch (\Throwable $e) {
            return response()->json([
                'status'  => 'failed',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * GET /print/shared-pdf/{type} (Signed Public Route for WhatsApp recipients)
     */
    public function publicPdf(Request $request, string $type)
    {
        abort_unless(in_array($type, DocumentShareService::SUPPORTED_TYPES, true), 404);

        $params = [
            'id'          => $request->query('id'),
            'customer_id' => $request->query('customer_id'),
            'supplier_id' => $request->query('supplier_id'),
            'from'        => $request->query('from'),
            'to'          => $request->query('to'),
            'template'    => $request->query('template'),
        ];

        $result = $this->shareService->generatePdf($type, $params);

        if ($request->boolean('download')) {
            return $result['pdf']->download($result['filename']);
        }

        return $result['pdf']->stream($result['filename']);
    }
}

