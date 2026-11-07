@php
    use Illuminate\Support\Facades\DB;

    $logo   = $setting->logo_url ?? null;
    $store  = $setting->store_name ?? 'Store Name';
    $phone  = $setting->phone_number ?? '';
    $addr   = $setting->address ?? '';
    $user   = optional($invoice->user)->name ?? '';
    $posted = $invoice->posted_number ?? '';
    $date   = $invoice->date ? \Carbon\Carbon::parse($invoice->date)->format('d-M-y') : '';
    $cust   = optional($invoice->customer)->name ?? '';
    $doctor = $invoice->doctor_name ?? '';
    $patient = $invoice->patient_name ?? '';
    $invoiceType = strtoupper($invoice->invoice_type ?? 'debit');
    $remarks = trim((string)($invoice->remarks ?? ''));
    $itemCount = $invoice->items->count();

    $gross  = $invoice->items->sum('sub_total');
    $disc   = (float)($invoice->discount_amount ?? 0);
    $tax    = (float)($invoice->tax_amount ?? 0);
    $total  = isset($printTotal) ? (float)$printTotal : (float)($invoice->total ?? ($gross - $disc + $tax));
    $totalReceive = isset($printReceive) ? (float)$printReceive : (float)($invoice->total_receive ?? 0);
    $remainThis = isset($printRemainThis) ? (float)$printRemainThis : max($total - $totalReceive, 0);
    
    // Get customer's total due from ledger
    $customerTotalDue = isset($printCustomerTotalDue) ? (float)$printCustomerTotalDue : null;
    
    // Show Total Due if customer has balance
    $showTotalDue = $customerTotalDue !== null && $customerTotalDue > 0;
    
    $footerNote = trim(($invoice->footer_note ?? '') !== '' ? $invoice->footer_note : ($setting->note ?? ''));
@endphp
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Sale Invoice (Compact Thermal) - {{ $posted }}</title>
<style>
  @page { size: 58mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; color:#000; background:#fff; }
  body {
    font-family: 'Courier New', monospace;
    font-weight: 400;
    font-size: 8px;
    line-height: 1.1;
    -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
  }
  .print-actions { margin:4px; text-align:right; }
  .print-actions button { padding:3px 6px; cursor:pointer; font-size:9px; }
  @media print { .print-actions { display:none; } }
  .receipt { width:58mm; max-width:100%; margin:0 auto; padding:0 3px 3px; }
  .center { text-align:center; }
  .right  { text-align:right; }
  .logo { max-width:50mm; max-height:20mm; object-fit:contain; display:block; margin:0 auto 2px; }
  .hr { border-top:1px solid #000; margin:3px 0; }
  .dotted-hr { border-top:1px dotted #000; margin:3px 0; }
  .pair { display:flex; justify-content:space-between; }
  .pair + .pair { margin-top:1px; }
  .type-line { display:flex; justify-content:space-between; font-weight:bold; }
  .type-tag { border:1px solid #000; padding:0 3px; }
  .meta { display:grid; grid-template-columns:1fr 1fr; gap:1px 4px; padding:2px; border:1px solid #000; }
  .meta-wide { grid-column:1 / -1; overflow-wrap:anywhere; }
  .remarks { margin-top:2px; padding:2px; border:1px dotted #000; white-space:pre-wrap; overflow-wrap:anywhere; }
  table { width:100%; border-collapse:collapse; font-size:7px; }
  tbody td { padding:0; border-bottom:1px dotted #000; vertical-align:top; }
  th.right, td.right { text-align:right; white-space:nowrap; }
  td.center { text-align:center; }
  .col-name { width:48%; }
  .col-qty { width:12%; text-align:center; }
  .col-price { width:40%; text-align:right; }
  .totals { margin-top:4px; }
  .totals .pair { margin-top:1px; }
  .totals .total { font-weight:bold; font-size:10px; border-top:1px solid #000; padding-top:2px; margin-top:3px; }
  .note { margin-top:4px; white-space:pre-wrap; font-size:7px; }
  .foot { margin-top:6px; text-align:center; font-size:7px; }
</style>
</head>
<body onload="if (!window.karobarDesktop && !window.__karobarSilentPrintWorker && !/Electron/i.test(navigator.userAgent) && window.self === window.top && !new URLSearchParams(window.location.search).has('silent_print')) window.print()">
<div class="print-actions">
  <button onclick="window.print()">Print</button>
</div>
<div class="receipt">
  @if($logo)
    <img src="{{ $logo }}" alt="Logo" class="logo">
  @endif
  <div class="center" style="font-size:14px; font-weight:bold;">{{ $store }}</div>
  @if($addr)<div class="center" style="font-size:7px">{{ $addr }}</div>@endif
  @if($phone)<div class="center" style="font-size:7px">{{ $phone }}</div>@endif
  <div class="hr"></div>
  <div class="type-line"><span>SALE #{{ $posted }}</span><span class="type-tag">{{ $invoiceType }}</span></div>
  <div class="meta">
    <span>Date</span><span class="right">{{ $date }}</span>
    <span>Customer</span><span class="right">{{ $cust ?: 'Walk-in' }}</span>
    @if($doctor)<span>Doctor</span><span class="right">{{ $doctor }}</span>@endif
    @if($patient)<span>Patient</span><span class="right">{{ $patient }}</span>@endif
    <span>Items</span><span class="right">{{ $itemCount }}</span>
  </div>
  @if($remarks)<div class="remarks"><strong>Note:</strong> {{ $remarks }}</div>@endif
  <div class="dotted-hr"></div>
  <table>
    <tbody>
      @foreach($invoice->items as $it)
        <tr>
          <td class="col-name">{{ optional($it->product)->name ?? '-' }}</td>
          <td class="col-qty">{{ number_format((float)$it->quantity) }}</td>
          <td class="col-price">{{ number_format((float)$it->sub_total, 2) }}</td>
        </tr>
      @endforeach
    </tbody>
  </table>
  <div class="totals">
    <div class="hr"></div>
    <div class="pair"><span>Gross:{{ number_format((float)$gross, 2) }}</span></div>
    <div class="pair"><span>Disc:{{ number_format((float)$disc, 2) }}</span></div>
    <div class="pair total"><span>TOTAL:{{ number_format((float)$total, 2) }}</span></div>
    @if($remainThis > 0)
      <div class="pair"><span>Paid:{{ number_format($totalReceive, 2) }}</span></div>
      <div class="pair"><span>Due:{{ number_format($remainThis, 2) }}</span></div>
    @endif
    @if($showTotalDue)
      <div class="pair total"><span>TOTAL DUE:{{ number_format($customerTotalDue, 2) }}</span></div>
    @endif
  </div>
  @if($footerNote !== '')
    <div class="hr"></div>
    <div class="note">{{ $footerNote }}</div>
  @endif
  <div class="foot">Software by Asim Shahzad<br/>PH:0304-7674787</div>
</div>
</body>
</html>
