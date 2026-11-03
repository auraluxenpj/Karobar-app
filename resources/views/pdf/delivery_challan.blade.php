<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Delivery Challan / Gate Pass {{ $invoice->posted_number ?? $invoice->id }}</title>
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
        .sig-table { margin-top: 40px; width: 100%; }
        .sig-table td { width: 33.3%; text-align: center; vertical-align: bottom; padding: 0 10px; }
        .sig-line { border-top: 1px solid #334155; padding-top: 5px; font-size: 10px; font-weight: bold; color: #334155; }
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
        $challanNo = 'DC-' . ($invoice->posted_number ?? $invoice->id);
        $totalUnits = 0;
        $totalPacks = 0;
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
                <div class="doc-badge">Delivery Challan / Gate Pass</div>
                <div style="margin-top: 6px; font-size: 12px; font-weight: bold;">
                    {{ $challanNo }}
                </div>
                <div class="store-meta">
                    Ref Invoice: #{{ $invoice->posted_number ?? $invoice->id }}
                </div>
                <div class="store-meta">
                    Date: {{ $invoice->date ? \Carbon\Carbon::parse($invoice->date)->format('d M Y') : optional($invoice->created_at)->format('d M Y') }}
                </div>
            </td>
        </tr>
    </table>

    <table class="meta-box">
        <tr>
            <td style="width: 50%; vertical-align: top;">
                <div class="meta-label">Consignee / Deliver To</div>
                <div class="meta-value">{{ $invoice->customer->name ?? 'Walk-in Customer' }}</div>
                @if(!empty($invoice->customer->phone))
                    <div class="store-meta">Phone: {{ $invoice->customer->phone }}</div>
                @endif
                @if(!empty($invoice->customer->address))
                    <div class="store-meta">Address: {{ $invoice->customer->address }}</div>
                @endif
            </td>
            <td style="width: 50%; vertical-align: top; text-align: right;">
                <div class="meta-label">Dispatch Details</div>
                <div class="store-meta">Sale Type: <strong>{{ strtoupper($invoice->sale_type ?? 'RETAIL') }}</strong></div>
                <div class="store-meta">Prepared By: <strong>{{ $invoice->user->name ?? 'Store Dispatch' }}</strong></div>
                @if(!empty($invoice->remarks))
                    <div class="store-meta">Remarks: {{ $invoice->remarks }}</div>
                @endif
            </td>
        </tr>
    </table>

    <table class="items-table">
        <thead>
            <tr>
                <th style="width: 6%;" class="text-center">#</th>
                <th style="width: 14%;">Code</th>
                <th style="width: 36%;">Product Description</th>
                <th style="width: 10%;" class="text-center">Pack Size</th>
                <th style="width: 12%;">Batch #</th>
                <th style="width: 10%;">Expiry</th>
                <th style="width: 12%;" class="text-right">Dispatched Qty</th>
            </tr>
        </thead>
        <tbody>
            @foreach($invoice->items as $idx => $item)
                @php
                    $qty = (int) ($item->quantity ?? 0) + max(0, (int) ($item->bonus ?? 0));
                    $packSize = max(1, (int) ($item->pack_size ?? $item->product?->pack_size ?? 1));
                    $packs = $packSize > 1 ? round($qty / $packSize, 2) : $qty;
                    $totalUnits += $qty;
                    $totalPacks += $packs;
                @endphp
                <tr>
                    <td class="text-center">{{ $idx + 1 }}</td>
                    <td>{{ $item->product?->product_code ?? '—' }}</td>
                    <td><strong>{{ $item->product?->name ?? 'Product' }}</strong></td>
                    <td class="text-center">{{ $packSize }}</td>
                    <td>{{ $item->batch_number ?: '—' }}</td>
                    <td>{{ $item->expiry ? \Carbon\Carbon::parse($item->expiry)->format('M Y') : '—' }}</td>
                    <td class="text-right">
                        <strong>{{ number_format($qty) }} Units</strong>
                        @if($packSize > 1)
                            <div style="font-size: 9px; color: #64748b;">({{ $packs }} Packs)</div>
                        @endif
                    </td>
                </tr>
            @endforeach
        </tbody>
        <tfoot>
            <tr>
                <td colspan="6" class="text-right" style="font-weight: bold; background: #f1f5f9;">
                    Total Dispatched Items ({{ count($invoice->items) }} Lines):
                </td>
                <td class="text-right" style="font-weight: bold; background: #f1f5f9;">
                    {{ number_format($totalUnits) }} Units
                </td>
            </tr>
        </tfoot>
    </table>

    <div style="margin-top: 12px; font-size: 10px; color: #475569;">
        <strong>Note:</strong> Please inspect all goods, batch numbers, and quantities at the time of delivery. No claims for shortage or damage in transit will be entertained after signed receipt.
    </div>

    <table class="sig-table">
        <tr>
            <td>
                <div class="sig-line">Prepared / Dispatched By</div>
            </td>
            <td>
                <div class="sig-line">Driver / Transporter Signature</div>
            </td>
            <td>
                <div class="sig-line">Receiver Signature &amp; Stamp</div>
            </td>
        </tr>
    </table>

    <div class="footer-note">
        Delivery Challan &amp; Gate Pass — Generated by {{ $storeName }} on {{ now()->format('d M Y h:i A') }}
    </div>
</body>
</html>

