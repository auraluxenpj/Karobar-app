@php
    use Illuminate\Support\Facades\DB;

    $logo   = $setting->logo_url ?? null;
    $store  = $setting->store_name ?? 'Store Name';
    $phone  = $setting->phone_number ?? '';
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
<title>Sale Invoice (Minimal Thermal) - {{ $posted }}</title>
<style>
  @page { size: 58mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; color:#000; background:#fff; }
  body {
    font-family: 'Courier New', monospace;
    font-weight: 400;
    font-size: 10px;
    line-height: 1.2;
    -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
  }
  .print-actions { margin:5px; text-align:right; }
  .print-actions button { padding:4px 8px; cursor:pointer; font-size:10px; }
  @media print { .print-actions { display:none; } }
  .receipt { width:58mm; max-width:100%; margin:0 auto; padding:0 4px 4px; }
  .center { text-align:center; }
  .right  { text-align:right; }
  .hr { border-top:1px solid #000; margin:3px 0; }
  .pair { display:flex; justify-content:space-between; }
  .pair + .pair { margin-top:1px; }
  .type-line { display:flex; justify-content:space-between; align-items:center; font-weight:bold; }
  .type-tag { border:1px solid #000; padding:1px 5px; }
  .meta { margin-top:3px; padding:3px; border:1px solid #000; }
  .meta-label { font-weight:bold; }
  .remarks { margin-top:3px; padding:3px; border:1px dotted #000; white-space:pre-wrap; overflow-wrap:anywhere; }
  table { width:100%; border-collapse:collapse; }
  tbody td { padding:0; border-bottom:1px dotted #000; vertical-align:top; }
  th.right, td.right { text-align:right; white-space:nowrap; }
  td.center { text-align:center; }
  .item-name { width:50%; }
  .item-qty { width:15%; text-align:center; }
  .item-price { width:35%; text-align:right; }
  .totals .pair { margin-top:2px; }
  .totals .total { font-weight:bold; font-size:12px; border-top:1px solid #000; padding-top:2px; }
  .note { margin-top:4px; white-space:pre-wrap; font-size:8px; }
  .foot { margin-top:6px; text-align:center; font-size:8px; }
</style>
</head>
<body>
<div class="print-actions">
  <button onclick="window.print()">Print</button>
</div>
<div class="receipt">
  @if($logo)
    <div class="center" style="margin-bottom:3px;"><img src="{{ $logo }}" alt="Logo" style="max-height:36px; max-width:45mm; object-fit:contain;" /></div>
  @endif
  <div class="center" style="font-size:16px; font-weight:bold;">{{ $store }}</div>
  @if($phone)<div class="center">{{ $phone }}</div>@endif
  <div class="hr"></div>
  <div class="type-line"><span>SALE INVOICE</span><span class="type-tag">{{ $invoiceType }}</span></div>
  <div class="meta">
    <div class="pair"><span class="meta-label">Inv#</span><span>{{ $posted }}</span></div>
    <div class="pair"><span class="meta-label">Date</span><span>{{ $date }}</span></div>
    <div class="pair"><span class="meta-label">Cust</span><span>{{ $cust ?: 'Walk-in' }}</span></div>
    @if($doctor)<div class="pair"><span class="meta-label">Dr</span><span>{{ $doctor }}</span></div>@endif
    @if($patient)<div class="pair"><span class="meta-label">Pt</span><span>{{ $patient }}</span></div>@endif
    <div class="pair"><span class="meta-label">Items</span><span>{{ $itemCount }}</span></div>
  </div>
  @if($remarks)<div class="remarks"><strong>Remarks:</strong> {{ $remarks }}</div>@endif
  <div class="hr"></div>
  <table>
    <tbody>
      @foreach($invoice->items as $it)
        <tr>
          <td class="item-name">{{ optional($it->product)->name ?? '-' }}</td>
          <td class="item-qty">{{ number_format((float)$it->quantity) }}x</td>
          <td class="item-price">{{ number_format((float)$it->sub_total, 2) }}</td>
        </tr>
      @endforeach
    </tbody>
  </table>
  <div class="totals">
    <div class="hr"></div>
    <div class="pair"><span>Total</span><span>{{ number_format((float)$total, 2) }}</span></div>
    @if($remainThis > 0)
      <div class="pair"><span>Paid</span><span>{{ number_format($totalReceive, 2) }}</span></div>
      <div class="pair total"><span>Due</span><span>{{ number_format($remainThis, 2) }}</span></div>
    @endif
    @if($showTotalDue)
      <div class="pair total" style="font-size:11px;"><span>Total Due</span><span>{{ number_format($customerTotalDue, 2) }}</span></div>
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
