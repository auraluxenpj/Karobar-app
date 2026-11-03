<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Supplier Ledger Statement - {{ $supplier->name }}</title>
    <style>
        @page { margin: 14mm 12mm; }
        body {
            font-family: DejaVu Sans, sans-serif;
            font-size: 10.5px;
            color: #1e293b;
            line-height: 1.4;
            margin: 0;
            padding: 0;
        }
        table { width: 100%; border-collapse: collapse; }
        .header-table { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
        .store-name { font-size: 18px; font-weight: bold; color: #0f172a; margin: 0 0 3px 0; }
        .store-meta { font-size: 10px; color: #475569; margin: 1px 0; }
        .doc-badge {
            display: inline-block;
            background: #0f172a;
            color: #ffffff;
            font-size: 12px;
            font-weight: bold;
            padding: 4px 10px;
            border-radius: 3px;
            text-transform: uppercase;
        }
        .summary-grid {
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            padding: 8px 10px;
            margin-bottom: 14px;
        }
        .kpi-label { font-size: 9px; color: #64748b; text-transform: uppercase; font-weight: bold; }
        .kpi-val { font-size: 12px; font-weight: bold; color: #0f172a; }
        .ledger-table th {
            background: #0f172a;
            color: #ffffff;
            font-size: 9px;
            font-weight: bold;
            text-transform: uppercase;
            padding: 6px 6px;
            border: 1px solid #0f172a;
            text-align: left;
        }
        .ledger-table td {
            padding: 5px 6px;
            border: 1px solid #cbd5e1;
            font-size: 9.5px;
        }
        .ledger-table tr:nth-child(even) td { background: #f8fafc; }
        .text-right { text-align: right !important; }
        .text-center { text-align: center !important; }
        .footer-note {
            margin-top: 20px;
            padding-top: 8px;
            border-top: 1px solid #cbd5e1;
            font-size: 9px;
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
                <div class="doc-badge">Supplier Statement</div>
                <div class="store-meta" style="margin-top: 6px;">
                    Period: <strong>{{ $from ?: 'Beginning' }}</strong> to <strong>{{ $to ?: now()->toDateString() }}</strong>
                </div>
            </td>
        </tr>
    </table>

    <div class="summary-grid">
        <table>
            <tr>
                <td style="width: 40%; vertical-align: top;">
                    <div class="kpi-label">Supplier Account</div>
                    <div class="kpi-val">{{ $supplier->name }}</div>
                    @if($supplier->phone)<div class="store-meta">Phone: {{ $supplier->phone }}</div>@endif
                    @if($supplier->email)<div class="store-meta">Email: {{ $supplier->email }}</div>@endif
                    @if($supplier->address)<div class="store-meta">Address: {{ $supplier->address }}</div>@endif
                </td>
                <td style="width: 15%; text-align: right; vertical-align: top;">
                    <div class="kpi-label">Total Invoiced</div>
                    <div class="kpi-val">Rs. {{ number_format((float)($summary['total_invoiced'] ?? 0), 2) }}</div>
                </td>
                <td style="width: 15%; text-align: right; vertical-align: top;">
                    <div class="kpi-label">Paid on Invoice</div>
                    <div class="kpi-val">Rs. {{ number_format((float)($summary['paid_on_invoice'] ?? 0), 2) }}</div>
                </td>
                <td style="width: 15%; text-align: right; vertical-align: top;">
                    <div class="kpi-label">Payments Debited</div>
                    <div class="kpi-val">Rs. {{ number_format((float)($summary['payments_debited'] ?? 0), 2) }}</div>
                </td>
                <td style="width: 15%; text-align: right; vertical-align: top;">
                    <div class="kpi-label">Net Payable Balance</div>
                    <div class="kpi-val" style="color: #b91c1c;">Rs. {{ number_format((float)($summary['net_balance'] ?? 0), 2) }}</div>
                </td>
            </tr>
        </table>
    </div>

    <table class="ledger-table">
        <thead>
            <tr>
                <th style="width: 68px;">Date</th>
                <th style="width: 65px;">Type</th>
                <th style="width: 90px;">Posted / Inv #</th>
                <th>Description</th>
                <th style="width: 75px;" class="text-right">Invoice Total</th>
                <th style="width: 75px;" class="text-right">Paid on Inv</th>
                <th style="width: 75px;" class="text-right">Payment Dr.</th>
                <th style="width: 85px;" class="text-right">Running Bal</th>
            </tr>
        </thead>
        <tbody>
            @if(!empty($from) || (float)($summary['opening_balance'] ?? 0) != 0)
                <tr style="background: #f1f5f9; font-weight: bold;">
                    <td>{{ $from ? \Carbon\Carbon::parse($from)->format('d M Y') : '-' }}</td>
                    <td>OPENING</td>
                    <td>—</td>
                    <td>Opening Balance Brought Forward</td>
                    <td class="text-right">—</td>
                    <td class="text-right">—</td>
                    <td class="text-right">—</td>
                    <td class="text-right"><strong>Rs. {{ number_format((float)($summary['opening_balance'] ?? 0), 2) }}</strong></td>
                </tr>
            @endif
            @forelse($rows as $r)
                <tr>
                    <td>{{ $r->entry_date ? \Carbon\Carbon::parse($r->entry_date)->format('d M Y') : '-' }}</td>
                    <td>{{ strtoupper($r->entry_type ?? '') }}</td>
                    <td><strong>{{ $r->posted_number ?: ($r->invoice_number ?? '-') }}</strong></td>
                    <td>{{ $r->description ?? '-' }}</td>
                    <td class="text-right">{{ (float)($r->invoice_total ?? 0) != 0 ? number_format((float)$r->invoice_total, 2) : '-' }}</td>
                    <td class="text-right">{{ (float)($r->total_paid ?? 0) != 0 ? number_format((float)$r->total_paid, 2) : '-' }}</td>
                    <td class="text-right">{{ (float)($r->payment_amount ?? 0) != 0 ? number_format((float)$r->payment_amount, 2) : '-' }}</td>
                    <td class="text-right"><strong>Rs. {{ number_format((float)($r->running_balance ?? 0), 2) }}</strong></td>
                </tr>
            @empty
                <tr>
                    <td colspan="8" class="text-center">No ledger transactions found in this period.</td>
                </tr>
            @endforelse
        </tbody>
    </table>

    <div class="footer-note">
        Statement generated by {{ $storeName }} on {{ now()->format('d M Y, h:i A') }}
    </div>
</body>
</html>

