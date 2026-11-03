<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Payment Voucher {{ $payment->payment_number }}</title>
    <style>
        @page { margin: 14mm 12mm; }
        body {
            font-family: DejaVu Sans, sans-serif;
            font-size: 11px;
            color: #1e293b;
            line-height: 1.45;
            margin: 0;
            padding: 0;
        }
        table { width: 100%; border-collapse: collapse; }
        .header-table { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; }
        .store-name { font-size: 18px; font-weight: bold; color: #0f172a; margin: 0 0 3px 0; }
        .store-meta { font-size: 10px; color: #475569; margin: 1px 0; }
        .doc-badge {
            display: inline-block;
            background: #0f172a;
            color: #ffffff;
            font-size: 12px;
            font-weight: bold;
            padding: 4px 12px;
            border-radius: 3px;
            text-transform: uppercase;
        }
        .meta-box {
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            padding: 10px 12px;
            margin-bottom: 14px;
        }
        .meta-label { font-size: 9px; font-weight: bold; color: #64748b; text-transform: uppercase; }
        .meta-value { font-size: 12px; font-weight: bold; color: #0f172a; }
        .alloc-table th {
            background: #0f172a;
            color: #ffffff;
            font-size: 9.5px;
            font-weight: bold;
            text-transform: uppercase;
            padding: 6px 8px;
            border: 1px solid #0f172a;
            text-align: left;
        }
        .alloc-table td {
            padding: 6px 8px;
            border: 1px solid #cbd5e1;
            font-size: 10.5px;
        }
        .text-right { text-align: right !important; }
        .text-center { text-align: center !important; }
        .totals-box {
            width: 280px;
            margin-left: auto;
            margin-top: 14px;
        }
        .totals-box td { padding: 5px 8px; font-size: 11px; border-bottom: 1px solid #e2e8f0; }
        .totals-box .grand-row td {
            background: #0f172a;
            color: #ffffff;
            font-weight: bold;
            font-size: 12px;
            border: none;
            padding: 7px 8px;
        }
        .footer-note {
            margin-top: 28px;
            padding-top: 8px;
            border-top: 1px solid #cbd5e1;
            font-size: 9.5px;
            color: #64748b;
            text-align: center;
        }
    </style>
    @include('pdf.partials.design_theme', ['pdfDesign' => $pdfDesign ?? ($setting->a4_template ?? 'standard')])
</head>
<body>
    @php
        $storeName = $setting->store_name ?? 'Business Store';
        $phone = $setting->phone_number ?? '';
        $address = $setting->address ?? '';
        $isCustomer = $payment->party_type === 'customer';
        $party = $isCustomer ? $payment->customer : $payment->supplier;
    @endphp

    <table class="header-table">
        <tr>
            <td style="width: 60%; vertical-align: top;">
                @include('pdf.partials.store_logo')
                <div class="store-name">{{ $storeName }}</div>
                @if($address)<div class="store-meta">{{ $address }}</div>@endif
                @if($phone)<div class="store-meta">Phone: {{ $phone }}</div>@endif
            </td>
            <td style="width: 40%; vertical-align: top; text-align: right;">
                <div class="doc-badge">{{ $isCustomer ? 'Official Receipt' : 'Payment Voucher' }}</div>
                <div style="margin-top: 6px; font-size: 12px; font-weight: bold;">
                    #{{ $payment->payment_number }}
                </div>
                <div class="store-meta">
                    Date: {{ $payment->payment_date ? \Carbon\Carbon::parse($payment->payment_date)->format('d M Y') : '-' }}
                </div>
            </td>
        </tr>
    </table>

    <div class="meta-box">
        <table>
            <tr>
                <td style="width: 55%; vertical-align: top;">
                    <div class="meta-label">{{ $isCustomer ? 'Received From (Customer)' : 'Paid To (Supplier)' }}</div>
                    <div class="meta-value">{{ $party->name ?? 'N/A' }}</div>
                    @if(!empty($party?->phone))<div class="store-meta">Phone: {{ $party->phone }}</div>@endif
                    @if(!empty($party?->address))<div class="store-meta">Address: {{ $party->address }}</div>@endif
                </td>
                <td style="width: 45%; vertical-align: top; text-align: right;">
                    <div class="meta-label">Payment Details</div>
                    <div class="store-meta">Method: <strong>{{ strtoupper(str_replace('_', ' ', $payment->payment_method ?? 'CASH')) }}</strong></div>
                    @if($payment->account)
                        <div class="store-meta">Account: {{ $payment->account->name }}</div>
                    @endif
                    @if($payment->reference)
                        <div class="store-meta">Ref / Cheque #: {{ $payment->reference }}</div>
                    @endif
                    <div class="store-meta">Status: <strong>{{ strtoupper($payment->status ?? 'POSTED') }}</strong></div>
                </td>
            </tr>
        </table>
    </div>

    <table class="alloc-table">
        <thead>
            <tr>
                <th style="width: 40px;" class="text-center">#</th>
                <th>Settled Invoice #</th>
                <th style="width: 110px;">Invoice Date</th>
                <th style="width: 120px;" class="text-right">Invoice Total</th>
                <th style="width: 130px;" class="text-right">Allocated Amount</th>
            </tr>
        </thead>
        <tbody>
            @forelse($payment->allocations as $idx => $alloc)
                @php
                    $invNumber = $alloc->saleInvoice?->posted_number
                        ?? $alloc->purchaseInvoice?->posted_number
                        ?? $alloc->purchaseInvoice?->invoice_number
                        ?? ('#' . $alloc->invoice_id);
                    $invDate = $alloc->saleInvoice?->date ?? $alloc->purchaseInvoice?->posted_date ?? null;
                    $invTotal = $alloc->saleInvoice?->total ?? $alloc->purchaseInvoice?->total_amount ?? null;
                @endphp
                <tr>
                    <td class="text-center">{{ $idx + 1 }}</td>
                    <td><strong>{{ $invNumber }}</strong></td>
                    <td>{{ $invDate ? \Carbon\Carbon::parse($invDate)->format('d M Y') : '-' }}</td>
                    <td class="text-right">{{ $invTotal !== null ? 'Rs. ' . number_format((float)$invTotal, 2) : '-' }}</td>
                    <td class="text-right"><strong>Rs. {{ number_format((float)$alloc->amount, 2) }}</strong></td>
                </tr>
            @empty
                <tr>
                    <td colspan="5" class="text-center">On-Account / Advance Payment (No specific invoice allocations)</td>
                </tr>
            @endforelse
        </tbody>
    </table>

    <table class="totals-box">
        <tr class="grand-row">
            <td>Total Amount {{ $isCustomer ? 'Received' : 'Paid' }}</td>
            <td class="text-right">Rs. {{ number_format((float)$payment->amount, 2) }}</td>
        </tr>
        <tr>
            <td>Allocated to Invoices</td>
            <td class="text-right">Rs. {{ number_format((float)$payment->allocated_amount, 2) }}</td>
        </tr>
        @if((float)$payment->unapplied_amount > 0)
            <tr>
                <td><strong>Unapplied (On-Account Credit)</strong></td>
                <td class="text-right"><strong>Rs. {{ number_format((float)$payment->unapplied_amount, 2) }}</strong></td>
            </tr>
        @endif
    </table>

    @if(!empty($payment->notes))
        <div style="margin-top: 12px; font-size: 10px; color: #334155;">
            <strong>Notes:</strong> {{ $payment->notes }}
        </div>
    @endif

    <div class="footer-note">
        Official computer-generated voucher by {{ $storeName }} on {{ now()->format('d M Y, h:i A') }}
    </div>
</body>
</html>

