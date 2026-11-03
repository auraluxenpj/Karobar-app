<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Price Quotation {{ $quotationNo }}</title>
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
            background: #1d4ed8;
            color: #ffffff;
            font-size: 13px;
            font-weight: bold;
            padding: 4px 12px;
            border-radius: 3px;
            letter-spacing: 0.5px;
            text-transform: uppercase;
        }
        .meta-box {
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            padding: 8px 10px;
            margin-bottom: 14px;
        }
        .meta-label { font-size: 9px; font-weight: bold; color: #64748b; text-transform: uppercase; }
        .meta-value { font-size: 11px; font-weight: bold; color: #0f172a; }
        .items-table th {
            background: #0f172a;
            color: #ffffff;
            font-size: 9.5px;
            font-weight: bold;
            text-transform: uppercase;
            padding: 6px 7px;
            border: 1px solid #0f172a;
            text-align: left;
        }
        .items-table td {
            padding: 6px 7px;
            border: 1px solid #cbd5e1;
            font-size: 10.5px;
        }
        .items-table tr:nth-child(even) td { background: #f8fafc; }
        .text-right { text-align: right !important; }
        .text-center { text-align: center !important; }
        .totals-table { width: 270px; margin-left: auto; margin-top: 12px; }
        .totals-table td { padding: 4px 8px; font-size: 11px; border-bottom: 1px solid #e2e8f0; }
        .totals-table .grand-row td {
            background: #1d4ed8;
            color: #ffffff;
            font-weight: bold;
            font-size: 12px;
            border: none;
            padding: 6px 8px;
        }
        .footer-note {
            margin-top: 24px;
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
        $license = $setting->license_number ?? '';
        $payload = $draft->payload ?? [];
        $validUntil = $payload['valid_until'] ?? optional($draft->created_at ?? now())->addDays(15)->format('d M Y');
    @endphp

    <table class="header-table">
        <tr>
            <td style="width: 60%; vertical-align: top;">
                @include('pdf.partials.store_logo')
                <div class="store-name">{{ $storeName }}</div>
                @if($address)<div class="store-meta">{{ $address }}</div>@endif
                @if($phone)<div class="store-meta">Phone: {{ $phone }}</div>@endif
                @if($license)<div class="store-meta">License #: {{ $license }}</div>@endif
            </td>
            <td style="width: 40%; vertical-align: top; text-align: right;">
                <div class="doc-badge">Price Quotation / Estimate</div>
                <div style="margin-top: 6px; font-size: 12px; font-weight: bold;">
                    {{ $quotationNo }}
                </div>
                <div class="store-meta">
                    Date: {{ optional($draft->created_at ?? now())->format('d M Y') }}
                </div>
                <div class="store-meta">
                    Valid Until: <strong>{{ $validUntil }}</strong>
                </div>
            </td>
        </tr>
    </table>

    <table class="meta-box">
        <tr>
            <td style="width: 55%; vertical-align: top;">
                <div class="meta-label">Prepared For Customer</div>
                <div class="meta-value">{{ $customer->name ?? $draft->party_name ?? 'Valued Customer' }}</div>
                @if(!empty($customer?->phone))
                    <div class="store-meta">Phone: {{ $customer->phone }}</div>
                @endif
                @if(!empty($customer?->address))
                    <div class="store-meta">Address: {{ $customer->address }}</div>
                @endif
            </td>
            <td style="width: 45%; vertical-align: top; text-align: right;">
                <div class="meta-label">Quotation Reference</div>
                <div class="store-meta">Title: <strong>{{ $draft->title ?? $quotationNo }}</strong></div>
                <div class="store-meta">Prepared By: <strong>{{ $draft->user->name ?? 'Sales Representative' }}</strong></div>
                <div class="store-meta">Status: <strong>Non-Binding Estimate (Stock Not Deducted)</strong></div>
            </td>
        </tr>
    </table>

    <table class="items-table">
        <thead>
            <tr>
                <th style="width: 6%;" class="text-center">#</th>
                <th style="width: 44%;">Product Description</th>
                <th style="width: 12%;" class="text-center">Qty</th>
                <th style="width: 14%;" class="text-right">Unit Rate (Rs.)</th>
                <th style="width: 10%;" class="text-right">Disc %</th>
                <th style="width: 14%;" class="text-right">Subtotal (Rs.)</th>
            </tr>
        </thead>
        <tbody>
            @php $grossSum = 0; $itemDiscSum = 0; @endphp
            @foreach($items as $idx => $item)
                @php
                    $qty = (float) ($item['quantity'] ?? 1);
                    $price = (float) ($item['price'] ?? 0);
                    $discPct = (float) ($item['item_discount_percentage'] ?? 0);
                    $lineGross = $qty * $price;
                    $lineDisc = ($lineGross * $discPct) / 100;
                    $lineSub = (float) ($item['sub_total'] ?? ($lineGross - $lineDisc));
                    $grossSum += $lineGross;
                    $itemDiscSum += $lineDisc;
                @endphp
                <tr>
                    <td class="text-center">{{ $idx + 1 }}</td>
                    <td>
                        <strong>{{ $item['product_name'] ?? 'Product' }}</strong>
                        @if(!empty($item['batch_number']))
                            <span style="font-size: 9px; color: #64748b;">(Batch: {{ $item['batch_number'] }})</span>
                        @endif
                    </td>
                    <td class="text-center">{{ number_format($qty) }}</td>
                    <td class="text-right">{{ number_format($price, 2) }}</td>
                    <td class="text-right">{{ number_format($discPct, 2) }}%</td>
                    <td class="text-right"><strong>{{ number_format($lineSub, 2) }}</strong></td>
                </tr>
            @endforeach
        </tbody>
    </table>

    @php
        $extraDisc = (float) ($payload['discount_amount'] ?? 0);
        $taxAmt = (float) ($payload['tax_amount'] ?? 0);
        $grandTotal = (float) ($draft->total_amount ?? $payload['total'] ?? max(0, $grossSum - $itemDiscSum - $extraDisc + $taxAmt));
    @endphp

    <table class="totals-table">
        <tr>
            <td>Gross Amount:</td>
            <td class="text-right">Rs. {{ number_format($grossSum, 2) }}</td>
        </tr>
        @if($itemDiscSum > 0)
        <tr>
            <td>Line Discounts:</td>
            <td class="text-right">- Rs. {{ number_format($itemDiscSum, 2) }}</td>
        </tr>
        @endif
        @if($extraDisc > 0)
        <tr>
            <td>Extra Discount:</td>
            <td class="text-right">- Rs. {{ number_format($extraDisc, 2) }}</td>
        </tr>
        @endif
        @if($taxAmt > 0)
        <tr>
            <td>Tax:</td>
            <td class="text-right">+ Rs. {{ number_format($taxAmt, 2) }}</td>
        </tr>
        @endif
        <tr class="grand-row">
            <td>Estimated Total:</td>
            <td class="text-right">Rs. {{ number_format($grandTotal, 2) }}</td>
        </tr>
    </table>

    <div class="footer-note">
        This is a price quotation / estimate only and not a tax invoice. Prices and batch availability are subject to change until invoiced.
    </div>
</body>
</html>

