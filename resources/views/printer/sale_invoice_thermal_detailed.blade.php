@php
    $logo   = $setting->logo_url ?? null;
    $store  = $setting->store_name ?? 'Store Name';
    $phone  = $setting->phone_number ?? '';
    $addr   = $setting->address ?? '';
    $user   = optional($invoice->user)->name ?? '';
    $posted = $invoice->posted_number ?? '';
    $date   = $invoice->date ? \Carbon\Carbon::parse($invoice->date)->format('d M Y h:i A') : '';
    $time   = $invoice->date ? \Carbon\Carbon::parse($invoice->date)->format('h:i A') : '';
    $cust   = optional($invoice->customer)->name ?? '';
    $custPhone = optional($invoice->customer)->phone ?? '';
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
    $remainThis = max($total - $totalReceive, 0);

    // Get customer's total due from ledger
    $customerTotalDue = isset($printCustomerTotalDue) ? (float)$printCustomerTotalDue : null;

    // Show section if this invoice has balance OR customer has total due
    $showBalance = $remainThis > 0 || ($customerTotalDue !== null && $customerTotalDue > 0);

    $footerNote = trim(($invoice->footer_note ?? '') !== '' ? $invoice->footer_note : ($setting->note ?? ''));
@endphp
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Sale Invoice (Detailed Thermal) - {{ $posted }}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; color:#000; background:#fff; }
  body {
    font-family: 'Courier New', monospace;
    font-weight: 600;
    font-size: 11px;
    line-height: 1.4;
    -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
  }
  .print-actions { margin:8px; text-align:right; }
  .print-actions button { padding:6px 10px; cursor:pointer; }
  @media print { .print-actions { display:none; } }
  .receipt { width:80mm; max-width:100%; margin:0 auto; padding:0 6px 8px; }
  .center { text-align:center; }
  .right  { text-align:right; }
  .logo { max-width:60mm; max-height:35mm; object-fit:contain; display:block; margin:0 auto 4px; }
  .hr { border-top:1px dashed #000; margin:6px 0; }
  .double-hr { border-top:2px double #000; margin:6px 0; }
  .section { margin-bottom:8px; }
  .pair { display:flex; justify-content:space-between; }
  .pair + .pair { margin-top:2px; }
  .invoice-title { display:flex; align-items:center; justify-content:space-between; border:2px solid #000; padding:5px; font-size:12px; font-weight:bold; }
  .type-tag { border:1px solid #000; padding:2px 6px; letter-spacing:.5px; }
  .section-label { font-weight:bold; }
  .remarks { padding:5px; border:1px solid #000; margin-top:5px; white-space:pre-wrap; overflow-wrap:anywhere; }
  .small-text { font-size:9px; }
  table { width:100%; border-collapse:collapse; }
  thead th { text-align:left; padding:3px 2px; border-bottom:2px solid #000; font-size:9px; }
  tbody td { padding:2px 0; border-bottom:1px dotted #000; vertical-align:top; }
  th.right, td.right { text-align:right; white-space:nowrap; }
  td.center { text-align:center; }
  .totals { margin-top:8px; }
  .totals .pair { margin-top:3px; }
  .totals .pair.total { font-size:14px; font-weight:bold; border-top:1px solid #000; padding-top:4px; margin-top:6px; }
  .balance-section { background:#f5f5f5; padding:6px; margin-top:8px; border-radius:4px; }
  .note { margin-top:8px; white-space:pre-wrap; font-size:9px; padding:6px; background:#f9f9f9; border-radius:4px; }
  .foot { margin-top:10px; text-align:center; font-size:8px; padding-top:6px; border-top:1px dotted #000; }
</style>
</head>
<body onload="window.print()">
<div class="print-actions">
  <button onclick="window.print()">Print</button>
</div>
<div class="receipt">
  @if($logo)
    <img src="{{ $logo }}" alt="Logo" class="logo">
  @endif
  <div class="center" style="font-size:22px; font-weight:bold;">{{ $store }}</div>
  @if($addr)<div class="center small-text">{{ $addr }}</div>@endif
  @if($phone)<div class="center small-text">Ph: {{ $phone }}</div>@endif
  <div class="hr"></div>
  
  <div class="invoice-title"><span>SALE INVOICE</span><span class="type-tag">{{ $invoiceType }}</span></div>
  <div class="section">
    <div class="pair"><span class="section-label">Invoice #</span><span>{{ $posted }}</span></div>
    <div class="pair"><span class="section-label">Date</span><span>{{ $date }}</span></div>
    <div class="pair"><span class="section-label">Customer</span><span>{{ $cust ?: 'Walk-in' }}</span></div>
    @if($custPhone)<div class="pair"><span>Phone</span><span>{{ $custPhone }}</span></div>@endif
    @if($doctor)<div class="pair"><span>Doctor</span><span>{{ $doctor }}</span></div>@endif
    @if($patient)<div class="pair"><span>Patient</span><span>{{ $patient }}</span></div>@endif
    @if($user)<div class="pair"><span>Cashier</span><span>{{ $user }}</span></div>@endif
    <div class="pair"><span class="section-label">Items</span><span>{{ $itemCount }}</span></div>
  </div>
  @if($remarks)<div class="remarks"><strong>Remarks:</strong> {{ $remarks }}</div>@endif
  
  <div class="double-hr"></div>
  
  <table>
    <thead>
      <tr>
        <th>ITEM</th>
        <th class="center">QTY</th>
        <th class="right">RATE</th>
        <th class="right">AMT</th>
      </tr>
    </thead>
    <tbody>
      @foreach($invoice->items as $it)
        <tr>
          <td>{{ optional($it->product)->name ?? '-' }}</td>
          <td class="center">{{ number_format((float)$it->quantity) }}</td>
          <td class="right">{{ number_format((float)$it->price, 2) }}</td>
          <td class="right">{{ number_format((float)$it->sub_total, 2) }}</td>
        </tr>
      @endforeach
    </tbody>
  </table>
  
  <div class="totals">
    <div class="hr"></div>
    <div class="pair"><span>Sub Total</span><span>{{ number_format((float)$gross, 2) }}</span></div>
    <div class="pair"><span>Discount</span><span>-{{ number_format((float)$disc, 2) }}</span></div>
    <div class="pair"><span>Tax</span><span>{{ number_format((float)$tax, 2) }}</span></div>
    <div class="pair total"><span>TOTAL</span><span>{{ number_format((float)$total, 2) }}</span></div>
  </div>
  
  {{-- Show Balance section --}}
  @if($showBalance)
    <div class="balance-section">
      <div class="pair"><span>Payment</span><span>{{ number_format($totalReceive, 2) }}</span></div>
      @if($remainThis > 0)
        <div class="pair"><span>Balance</span><span>{{ number_format($remainThis, 2) }}</span></div>
      @endif
      @if($customerTotalDue !== null && $customerTotalDue > 0)
        <div class="pair total"><span>Total Due</span><span>{{ number_format($customerTotalDue, 2) }}</span></div>
      @endif
    </div>
  @endif
  
  @if($footerNote !== '')
    <div class="note">{{ $footerNote }}</div>
  @endif
  
  <div class="foot">Software by Asim Shahzad<br/>PH:0304-7674787</div>
</div>
</body>
</html>
