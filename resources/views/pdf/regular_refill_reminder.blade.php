<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Medicine / Product Readiness Slip — {{ $customer->name ?? 'Customer' }}</title>
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
        $storeName = $setting->store_name ?? 'Karobar Pharmacy';
        $phone = $setting->phone_number ?? '';
        $address = $setting->address ?? '';
        $license = $setting->license_number ?? '';
        $refNo = 'REF-' . str_pad((string) ($customer->id ?? 1), 4, '0', STR_PAD_LEFT);
        $cycle = strtoupper($customer->refill_cycle ?: 'MONTHLY');
        $dueDate = $customer->next_refill_date
            ? \Carbon\Carbon::parse($customer->next_refill_date)->format('d M Y')
            : now()->format('d M Y');
        $totalUnits = 0;
        $estimatedTotal = 0.0;
    @endphp

    <table class="header-table">
        <tr>
            <td style="width: 60%; vertical-align: top;">
                <div class="store-name">{{ $storeName }}</div>
                @if($address)<div class="store-meta">{{ $address }}</div>@endif
                @if($phone)<div class="store-meta">Phone: {{ $phone }}</div>@endif
                @if($license)<div class="store-meta">License #: {{ $license }}</div>@endif
            </td>
            <td style="width: 40%; vertical-align: top; text-align: right;">
                <div class="doc-badge">Medicine / Product Readiness Slip</div>
                <div style="margin-top: 6px; font-size: 12px; font-weight: bold;">
                    {{ $refNo }}
                </div>
                <div class="store-meta">
                    Cycle: {{ $cycle }}
                </div>
                <div class="store-meta">
                    Collection Due: {{ $dueDate }}
                </div>
            </td>
        </tr>
    </table>

    <table class="meta-box">
        <tr>
            <td style="width: 55%; vertical-align: top;">
                <div class="meta-label">Regular Customer Details</div>
                <div class="meta-value">{{ $customer->name ?? 'Valued Customer' }}</div>
                @if(!empty($customer->phone))
                    <div class="store-meta">Phone: {{ $customer->phone }}</div>
                @endif
                @if(!empty($customer->address))
                    <div class="store-meta">Address: {{ $customer->address }}</div>
                @endif
            </td>
            <td style="width: 45%; vertical-align: top; text-align: right;">
                <div class="meta-label">Refill Schedule</div>
                <div class="store-meta">Refill Cycle: <strong>{{ $cycle }}</strong></div>
                <div class="store-meta">Scheduled Collection Date: <strong>{{ $dueDate }}</strong></div>
                <div class="store-meta">Prepared On: <strong>{{ now()->format('d M Y') }}</strong></div>
            </td>
        </tr>
    </table>

    <table class="items-table">
        <thead>
            <tr>
                <th style="width: 6%;" class="text-center">#</th>
                <th style="width: 14%;">Code</th>
                <th style="width: 36%;">Medicine / Product Name</th>
                <th style="width: 10%;" class="text-center">Pack Size</th>
                <th style="width: 18%;" class="text-right">Prepared Quantity</th>
                <th style="width: 16%;">Dosage / Notes</th>
            </tr>
        </thead>
        <tbody>
            @forelse($customer->regularItems as $idx => $item)
                @php
                    $prod = $item->product;
                    $packSize = max(1, (int) ($prod?->pack_size ?? 1));
                    $rawUnitQty = (int) ($item->unit_quantity ?? 0);
                    $rawPackQty = (float) ($item->pack_quantity ?? 0);
                    $units = $rawUnitQty > 0 ? $rawUnitQty : max(1, (int) round($rawPackQty * $packSize));
                    $packs = $packSize > 1 ? round($units / $packSize, 2) : $units;
                    $unitPrice = (float) ($prod?->unit_sale_price ?? 0);
                    $packPrice = (float) ($prod?->pack_sale_price ?? 0);
                    $effectiveUnitPrice = $unitPrice > 0 ? $unitPrice : ($packSize > 0 ? $packPrice / $packSize : 0);
                    $lineTotal = $units * $effectiveUnitPrice;
                    $totalUnits += $units;
                    $estimatedTotal += $lineTotal;
                @endphp
                <tr>
                    <td class="text-center">{{ $idx + 1 }}</td>
                    <td>{{ $prod?->product_code ?? '—' }}</td>
                    <td><strong>{{ $prod?->name ?? ('Product #' . $item->product_id) }}</strong></td>
                    <td class="text-center">{{ $packSize }}</td>
                    <td class="text-right">
                        <strong>{{ number_format($units) }} {{ $units === 1 ? 'Unit' : 'Units' }}</strong>
                        @if($packSize > 1)
                            <div style="font-size: 9px; color: #64748b;">({{ $packs }} {{ $packs == 1 ? 'Pack' : 'Packs' }})</div>
                        @endif
                    </td>
                    <td>{{ $item->dosage_notes ?: '—' }}</td>
                </tr>
            @empty
                <tr>
                    <td colspan="6" class="text-center" style="padding: 14px; color: #64748b;">
                        General scheduled refill reminder ({{ $cycle }}).
                    </td>
                </tr>
            @endforelse
        </tbody>
        @if($customer->regularItems->count() > 0)
            <tfoot>
                <tr>
                    <td colspan="4" class="text-right" style="font-weight: bold; background: #f1f5f9;">
                        Total Prepared Items ({{ $customer->regularItems->count() }} Lines):
                    </td>
                    <td class="text-right" style="font-weight: bold; background: #f1f5f9;">
                        {{ number_format($totalUnits) }} Units
                    </td>
                    <td style="font-weight: bold; background: #f1f5f9;">
                        @if($estimatedTotal > 0)
                            Est. Rs. {{ number_format($estimatedTotal, 2) }}
                        @endif
                    </td>
                </tr>
            </tfoot>
        @endif
    </table>

    @if(!empty($customer->regular_notes))
        <div style="margin-top: 12px; font-size: 10px; color: #334155;">
            <strong>Customer Note:</strong> {{ $customer->regular_notes }}
        </div>
    @endif

    <div class="footer-note">
        Your {{ strtolower($cycle) }} medicines / products are prepared and ready at {{ $storeName }}. Please do not forget to collect them.
    </div>
</body>
</html>

