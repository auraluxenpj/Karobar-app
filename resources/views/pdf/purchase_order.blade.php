<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Purchase Order {{ $order->number }}</title>
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
        .totals-box { width: 260px; margin-left: auto; margin-top: 12px; }
        .totals-box .grand-row td {
            background: #0f172a;
            color: #ffffff;
            font-weight: bold;
            font-size: 12px;
            padding: 7px 8px;
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
        $computedTotal = $totalAmount ?? 0;
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
                <div class="doc-badge">Purchase Order</div>
                <div style="margin-top: 6px; font-size: 12px; font-weight: bold;">
                    #{{ $order->number }}
                </div>
                <div class="store-meta">
                    Order Date: {{ $order->date ? \Carbon\Carbon::parse($order->date)->format('d M Y') : '-' }}
                </div>
            </td>
        </tr>
    </table>

    <div class="meta-box">
        <table>
            <tr>
                <td style="width: 55%; vertical-align: top;">
                    <div class="meta-label">To Supplier / Vendor</div>
                    <div class="meta-value">{{ $order->supplier->name ?? 'N/A' }}</div>
                    @if(!empty($order->supplier?->phone))<div class="store-meta">Phone: {{ $order->supplier->phone }}</div>@endif
                    @if(!empty($order->supplier?->email))<div class="store-meta">Email: {{ $order->supplier->email }}</div>@endif
                    @if(!empty($order->supplier?->address))<div class="store-meta">Address: {{ $order->supplier->address }}</div>@endif
                </td>
                <td style="width: 45%; vertical-align: top; text-align: right;">
                    <div class="meta-label">Order Information</div>
                    <div class="store-meta">Status: <strong>{{ strtoupper($order->status ?? 'ORDERED') }}</strong></div>
                    @if($order->expected_received_date)
                        <div class="store-meta">Expected Delivery: <strong>{{ \Carbon\Carbon::parse($order->expected_received_date)->format('d M Y') }}</strong></div>
                    @endif
                    @if($order->reference)
                        <div class="store-meta">Reference #: {{ $order->reference }}</div>
                    @endif
                </td>
            </tr>
        </table>
    </div>

    <table class="items-table">
        <thead>
            <tr>
                <th style="width: 35px;" class="text-center">#</th>
                <th>Product Name</th>
                <th style="width: 65px;" class="text-right">Pack Size</th>
                <th style="width: 75px;" class="text-right">Order Packs</th>
                <th style="width: 75px;" class="text-right">Total Units</th>
                <th style="width: 85px;" class="text-right">Pack Price</th>
                <th style="width: 60px;" class="text-right">Disc %</th>
                <th style="width: 95px;" class="text-right">Line Total</th>
            </tr>
        </thead>
        <tbody>
            @forelse($order->items as $idx => $item)
                @php
                    $packSize = max(1, (int)($item->pack_size ?? 1));
                    $unitsOrdered = (int)($item->ordered_quantity ?? 0);
                    $packsOrdered = $unitsOrdered / $packSize;
                    $unitPrice = (float)($item->unit_purchase_price ?? 0);
                    $packPrice = $unitPrice * $packSize;
                    $discPct = (float)($item->item_discount_percentage ?? 0);
                    $lineTotal = ($unitsOrdered * $unitPrice) * (1 - ($discPct / 100.0));
                @endphp
                <tr>
                    <td class="text-center">{{ $idx + 1 }}</td>
                    <td><strong>{{ $item->product->name ?? 'Product' }}</strong></td>
                    <td class="text-right">{{ number_format($packSize) }}</td>
                    <td class="text-right">{{ number_format($packsOrdered, 2) }}</td>
                    <td class="text-right">{{ number_format($unitsOrdered) }}</td>
                    <td class="text-right">Rs. {{ number_format($packPrice, 2) }}</td>
                    <td class="text-right">{{ number_format($discPct, 1) }}%</td>
                    <td class="text-right"><strong>Rs. {{ number_format($lineTotal, 2) }}</strong></td>
                </tr>
            @empty
                <tr>
                    <td colspan="8" class="text-center">No items in this purchase order.</td>
                </tr>
            @endforelse
        </tbody>
    </table>

    <table class="totals-box">
        <tr class="grand-row">
            <td>Total Order Value</td>
            <td class="text-right">Rs. {{ number_format((float)$computedTotal, 2) }}</td>
        </tr>
    </table>

    @if(!empty($order->notes))
        <div style="margin-top: 12px; font-size: 10px; color: #334155;">
            <strong>Notes / Instructions:</strong> {{ $order->notes }}
        </div>
    @endif

    <div class="footer-note">
        Purchase Order issued by {{ $storeName }} on {{ now()->format('d M Y, h:i A') }}
    </div>
</body>
</html>

