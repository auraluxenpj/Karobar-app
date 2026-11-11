@php
    $logo   = $setting->logo_url ?? null;
    $store  = $setting->store_name ?? 'Store Name';
    $phone  = $setting->phone_number ?? '';
    $addr   = $setting->address ?? '';
    $lic    = $setting->license_number ?? '';

    $posted = $invoice->posted_number ?? '';
    $date   = $invoice->date ? \Carbon\Carbon::parse($invoice->date)->format('d M Y') : '';
    $user   = optional($invoice->user)->name ?? '';
    $cust   = optional($invoice->customer)->name ?? '';
    $doc    = $invoice->doctor_name ?? '';
    $pat    = $invoice->patient_name ?? '';
    $remarks= $invoice->remarks ?? '';

    $gross  = (float)$invoice->items->sum('sub_total');
    $disc   = (float)($invoice->discount_amount ?? 0);
    $tax    = (float)($invoice->tax_amount ?? 0);

    $total  = isset($printTotal)
                ? (float)$printTotal
                : (float)($invoice->total ?? ($gross - $disc + $tax));

    $totalReceive = isset($printReceive)
        ? (float)$printReceive
        : (float)($invoice->total_receive ?? 0);

    $remainThis = max($total - $totalReceive, 0);

    // Get customer's total due from ledger
    $customerTotalDue = isset($printCustomerTotalDue) ? (float)$printCustomerTotalDue : null;
    $showTotalDue = $customerTotalDue !== null && $customerTotalDue > 0;

    $footerNote = trim(($invoice->footer_note ?? '') !== '' ? $invoice->footer_note : ($setting->note ?? ''));
@endphp
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Sale Invoice (Detailed A4) - {{ $posted }}</title>
<style>
  :root { --text:#111; --muted:#666; --border:#ccc; --primary:#2563eb; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; font-family: 'Segoe UI', Arial, sans-serif; color:var(--text); }

  .page { width:210mm; min-height:297mm; padding:18mm 15mm; margin:0 auto; }
  .print-actions { margin:12px auto; width:210mm; text-align:right; }
  .print-actions button { padding:8px 16px; cursor:pointer; background:var(--primary); color:#fff; border:none; border-radius:4px; }
  @media print { .print-actions { display:none; } .page { padding:12mm; } }

  .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid var(--primary); padding-bottom:15px; margin-bottom:20px; }
  .store-info h1 { margin:0; font-size:24px; color:var(--primary); }
  .store-info .details { margin-top:8px; font-size:11px; color:var(--muted); line-height:1.6; }
  
  .invoice-info { text-align:right; }
  .invoice-info .invoice-num { font-size:20px; font-weight:bold; }
  .invoice-info .date { color:var(--muted); margin-top:4px; }

  .meta-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:15px; margin-bottom:20px; }
  .meta-box { background:#f8fafc; padding:12px; border-radius:6px; border-left:3px solid var(--primary); }
  .meta-box .label { font-size:10px; text-transform:uppercase; color:var(--muted); margin-bottom:4px; }
  .meta-box .value { font-weight:600; font-size:13px; }

  table { width:100%; border-collapse:collapse; margin-top:10px; font-size:11px; box-shadow:0 1px 3px rgba(0,0,0,0.1); }
  thead th { background:var(--primary); color:#fff; text-align:left; padding:12px 10px; font-size:10px; text-transform:uppercase; }
  tbody td { padding:10px; border-bottom:1px solid #e2e8f0; }
  tbody tr:hover { background:#f8fafc; }
  .right { text-align:right; }
  .center { text-align:center; }

  .summary-section { margin-top:25px; display:flex; justify-content:flex-end; }
  .summary-box { width:45%; border:1px solid var(--border); border-radius:8px; overflow:hidden; }
  .summary-box .row { display:flex; justify-content:space-between; padding:12px 15px; border-bottom:1px solid #e2e8f0; }
  .summary-box .row:last-child { border-bottom:none; }
  .summary-box .row.subtotal { background:#f8fafc; font-weight:600; }
  .summary-box .row.total { background:var(--primary); color:#fff; font-weight:bold; font-size:16px; }
  .summary-box .row.due { background:#fef3c7; font-weight:bold; font-size:14px; }
  .summary-box .row.grand { background:#1f2937; color:#fff; font-weight:bold; font-size:18px; }

  .footer { margin-top:auto; padding-top:15px; border-top:1px solid var(--border); }
  .footer-note { background:#fffbeb; padding:10px; border-radius:4px; border-left:3px solid #f59e0b; font-size:11px; }
  .thankyou { text-align:center; margin-top:15px; color:var(--muted); font-style:italic; }
  .powered { text-align:center; margin-top:8px; font-size:9px; color:#9ca3af; }
</style>
@include('printer.partials.calibration_styles')
</head>
<body onload="if (!window.karobarDesktop && !window.__karobarSilentPrintWorker && !/Electron/i.test(navigator.userAgent) && window.self === window.top && !new URLSearchParams(window.location.search).has('silent_print')) window.print()">
<div class="print-actions">
  <button onclick="if (window.karobarDesktop && window.karobarDesktop.silentPrint) { window.karobarDesktop.silentPrint(); } else { window.print(); }">Print Invoice</button>
</div>

<div class="page">
  <div class="header">
    <div class="store-info">
      @if($logo)
        <div style="margin-bottom:6px;"><img src="{{ $logo }}" alt="Logo" style="max-height:52px; max-width:160px; object-fit:contain;" /></div>
      @endif
      <h1>{{ $store }}</h1>
      <div class="details">
        @if($lic) <div>License: {{ $lic }}</div> @endif
        @if($addr) <div>{{ $addr }}</div> @endif
        @if($phone) <div>Phone: {{ $phone }}</div> @endif
      </div>
    </div>
    <div class="invoice-info">
      <div class="invoice-num"># {{ $posted }}</div>
      <div class="date">{{ $date }}</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-box">
      <div class="label">Customer</div>
      <div class="value">{{ $cust ?? 'N/A' }}</div>
    </div>
    <div class="meta-box">
      <div class="label">User / Cashier</div>
      <div class="value">{{ $user }}</div>
    </div>
    <div class="meta-box">
      <div class="label">Doctor</div>
      <div class="value">{{ $doc ?? 'N/A' }}</div>
    </div>
  </div>

  @if($pat || $remarks)
  <div class="meta-grid" style="margin-top:10px;">
    @if($pat)
    <div class="meta-box">
      <div class="label">Patient</div>
      <div class="value">{{ $pat }}</div>
    </div>
    @endif
    @if($remarks)
    <div class="meta-box" style="grid-column: span 2;">
      <div class="label">Remarks</div>
      <div class="value">{{ $remarks }}</div>
    </div>
    @endif
  </div>
  @endif

  <table>
    <thead>
      <tr>
        <th style="width:30%">Product Name</th>
        <th style="width:8%">Pack</th>
        <th style="width:12%">Batch</th>
        <th style="width:8%">Expiry</th>
        <th class="right" style="width:10%">Qty</th>
        <th class="right" style="width:10%">Price</th>
        <th class="right" style="width:8%">Disc</th>
        <th class="right" style="width:14%">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      @foreach($invoice->items as $it)
        <tr>
          <td>{{ optional($it->product)->name ?? '-' }}</td>
          <td>{{ $it->pack_size }}</td>
          <td>{{ $it->batch_number ?? '-' }}</td>
          <td>{{ $it->expiry ?? '-' }}</td>
          <td class="right">{{ number_format((float)$it->quantity, 2) }}</td>
          <td class="right">{{ number_format((float)$it->price, 2) }}</td>
          <td class="right">{{ number_format((float)$it->item_discount_percentage, 1) }}%</td>
          <td class="right">{{ number_format((float)$it->sub_total, 2) }}</td>
        </tr>
      @endforeach
    </tbody>
  </table>

  <div class="summary-section">
    <div class="summary-box">
      <div class="row subtotal"><span>Gross Amount</span><span>{{ number_format($gross, 2) }}</span></div>
      <div class="row"><span>Discount</span><span>-{{ number_format($disc, 2) }}</span></div>
      <div class="row"><span>Tax</span><span>{{ number_format($tax, 2) }}</span></div>
      <div class="row total"><span>TOTAL</span><span>{{ number_format($total, 2) }}</span></div>
      
      @if($remainThis > 0)
        <div class="row"><span>Amount Paid</span><span>{{ number_format($totalReceive, 2) }}</span></div>
        <div class="row due"><span>Balance Due</span><span>{{ number_format($remainThis, 2) }}</span></div>
      @endif
      
      @if($showTotalDue)
        <div class="row grand"><span>Total Due</span><span>{{ number_format($customerTotalDue, 2) }}</span></div>
      @endif
    </div>
  </div>

  <div class="footer">
    @if($footerNote !== '')
      <div class="footer-note">{{ $footerNote }}</div>
    @endif
    <div class="thankyou">Thank you for your patronage!</div>
    <div class="powered">Software by Asim Shahzad | PH: 0304-7674787</div>
  </div>
</div>
</body>
</html>

