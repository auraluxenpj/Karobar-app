@php
    use Illuminate\Support\Facades\DB;

    $logo   = $setting->logo_url ?? null;
    $store  = $setting->store_name ?? 'STORE NAME';
    $phone  = $setting->phone_number ?? '';
    $addr   = $setting->address ?? '';
    $user   = optional($invoice->user)->name ?? '';
    $posted = $invoice->posted_number ?? '';
    $date   = $invoice->date ? \Carbon\Carbon::parse($invoice->date)->format('d/m/Y') : '';
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
<title>Sale Invoice (Bold Thermal) - {{ $posted }}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; color:#000; background:#fff; }
  body {
    font-family: 'Arial Black', 'Helvetica Neue', sans-serif;
    font-weight: 900;
    font-size: 14px;
    line-height: 1.2;
    -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
  }
  .print-actions { margin:10px; text-align:right; }
  .print-actions button { padding:8px 12px; cursor:pointer; font-weight:bold; }
  @media print { .print-actions { display:none; } }
  .receipt { width:80mm; max-width:100%; margin:0 auto; padding:0 8px 10px; }
  .center { text-align:center; }
  .right  { text-align:right; }
  .logo { max-width:65mm; max-height:40mm; object-fit:contain; display:block; margin:0 auto 6px; }
  .hr { border-top:3px double #000; margin:8px 0; }
  .solid-hr { border-top:3px solid #000; margin:8px 0; }
  .pair { display:flex; justify-content:space-between; font-weight:bold; }
  .pair + .pair { margin-top:4px; }
  .invoice-banner { display:flex; align-items:center; justify-content:space-between; padding:6px; border:3px solid #000; font-size:16px; }
  .type-tag { padding:2px 5px; border:2px solid #000; font-size:11px; }
  .meta { margin-top:6px; padding:6px; border:2px solid #000; }
  .meta-label { text-transform:uppercase; }
  .remarks { margin-top:6px; padding:6px; border:2px solid #000; white-space:pre-wrap; overflow-wrap:anywhere; }
  table { width:100%; border-collapse:collapse; }
  thead th { text-align:left; padding:4px 3px; border-bottom:3px solid #000; font-size:12px; text-transform:uppercase; }
  tbody td { padding:4px 0; border-bottom:2px solid #000; vertical-align:top; font-weight:bold; }
  th.right, td.right { text-align:right; white-space:nowrap; }
  td.center { text-align:center; }
  .totals { margin-top:10px; background:#000; color:#fff; padding:8px; }
  .totals .pair { margin-top:4px; }
  .totals .pair.total { font-size:18px; border-top:3px solid #fff; padding-top:6px; margin-top:8px; }
  .note { margin-top:10px; padding:8px; background:#ffff00; color:#000; font-weight:bold; white-space:pre-wrap; }
  .foot { margin-top:12px; text-align:center; font-size:10px; text-transform:uppercase; }
</style>
</head>
<body onload="window.print()">
<div class="print-actions">
  <button onclick="window.print()">PRINT</button>
</div>
<div class="receipt">
  @if($logo)
    <img src="{{ $logo }}" alt="Logo" class="logo">
  @endif
  <div class="center" style="font-size:28px; letter-spacing:2px;">{{ $store }}</div>
  @if($addr)<div class="center" style="font-size:12px;">{{ $addr }}</div>@endif
  @if($phone)<div class="center" style="font-size:12px;">PH: {{ $phone }}</div>@endif
  <div class="hr"></div>
  <div class="invoice-banner"><span>SALE INVOICE #{{ $posted }}</span><span class="type-tag">{{ $invoiceType }}</span></div>
  <div class="meta">
    <div class="pair"><span class="meta-label">Date</span><span>{{ $date }}</span></div>
    <div class="pair"><span class="meta-label">Customer</span><span>{{ $cust ?: 'Walk-in' }}</span></div>
    @if($doctor)<div class="pair"><span class="meta-label">Doctor</span><span>{{ $doctor }}</span></div>@endif
    @if($patient)<div class="pair"><span class="meta-label">Patient</span><span>{{ $patient }}</span></div>@endif
    @if($user)<div class="pair"><span class="meta-label">Cashier</span><span>{{ $user }}</span></div>@endif
    <div class="pair"><span class="meta-label">Items</span><span>{{ $itemCount }}</span></div>
  </div>
  @if($remarks)<div class="remarks"><strong>REMARKS:</strong> {{ $remarks }}</div>@endif
  <div class="solid-hr"></div>
  <table>
    <thead>
      <tr>
        <th>ITEM</th>
        <th class="center">QTY</th>
        <th class="right">PRICE</th>
        <th class="right">TOTAL</th>
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
    <div class="pair"><span>SUBTOTAL</span><span>{{ number_format((float)$gross, 2) }}</span></div>
    <div class="pair"><span>DISCOUNT</span><span>-{{ number_format((float)$disc, 2) }}</span></div>
    <div class="pair"><span>TAX</span><span>{{ number_format((float)$tax, 2) }}</span></div>
    <div class="pair total"><span>TOTAL</span><span>{{ number_format((float)$total, 2) }}</span></div>
    @if($remainThis > 0)
      <div class="pair" style="margin-top:8px; border-top:2px solid #fff; padding-top:4px;"><span>PAID</span><span>{{ number_format($totalReceive, 2) }}</span></div>
      <div class="pair total"><span>DUE</span><span>{{ number_format($remainThis, 2) }}</span></div>
    @endif
    @if($showTotalDue)
      <div class="pair total" style="border-top:3px solid #fff; padding-top:6px; margin-top:8px;"><span>TOTAL DUE</span><span>{{ number_format($customerTotalDue, 2) }}</span></div>
    @endif
  </div>
  @if($footerNote !== '')
    <div class="note">NOTE: {{ $footerNote }}</div>
  @endif
  <div class="foot">Software by Asim Shahzad<br/>PH:0304-7674787</div>
</div>
</body>
</html>
