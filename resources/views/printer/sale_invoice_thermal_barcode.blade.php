@php
    use Illuminate\Support\Facades\DB;

    $logo   = $setting->logo_url ?? null;
    $store  = $setting->store_name ?? 'Store Name';
    $phone  = $setting->phone_number ?? '';
    $addr   = $setting->address ?? '';
    $user   = optional($invoice->user)->name ?? '';
    $posted = $invoice->posted_number ?? '';
    $date   = $invoice->date ? \Carbon\Carbon::parse($invoice->date)->format('d M Y') : '';
    $time   = $invoice->date ? \Carbon\Carbon::parse($invoice->date)->format('h:i A') : '';
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
    
    // Generate QR code data
    $qrData = json_encode([
        'inv' => $posted,
        'date' => $date,
        'total' => $total,
        'store' => $store
    ]);
@endphp
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Sale Invoice (Barcode Thermal) - {{ $posted }}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; color:#000; background:#fff; }
  body {
    font-family: 'Verdana', sans-serif;
    font-weight: 500;
    font-size: 10px;
    line-height: 1.3;
    -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
  }
  .print-actions { margin:8px; text-align:right; }
  .print-actions button { padding:6px 10px; cursor:pointer; }
  @media print { .print-actions { display:none; } }
  .receipt { width:80mm; max-width:100%; margin:0 auto; padding:0 6px 8px; }
  .center { text-align:center; }
  .right  { text-align:right; }
  .logo { max-width:55mm; max-height:28mm; object-fit:contain; display:block; margin:0 auto 4px; }
  .hr { border-top:1px dashed #333; margin:5px 0; }
  .double-hr { border-top:2px double #333; margin:5px 0; }
  .section { margin-bottom:6px; }
  .pair { display:flex; justify-content:space-between; }
  .pair + .pair { margin-top:2px; }
  .type-tag { display:inline-block; border:1px solid #333; padding:2px 6px; font-weight:bold; letter-spacing:.5px; }
  .meta { padding:5px; border:1px solid #333; background:#f6f6f6; }
  .meta-label { font-weight:bold; }
  .remarks { margin-top:5px; padding:5px; border-left:3px solid #333; background:#f6f6f6; white-space:pre-wrap; overflow-wrap:anywhere; }
  .barcode-text { font-family: 'Courier New', monospace; letter-spacing:1px; font-size:14px; font-weight:bold; }
  table { width:100%; border-collapse:collapse; }
  thead th { text-align:left; padding:3px 2px; border-bottom:2px solid #333; font-size:8px; text-transform:uppercase; background:#f0f0f0; }
  tbody td { padding:3px 0; border-bottom:1px dotted #999; vertical-align:top; }
  th.right, td.right { text-align:right; white-space:nowrap; }
  td.center { text-align:center; }
  .item-barcode { font-family: 'Courier New', monospace; font-size:8px; color:#666; }
  .totals { margin-top:8px; }
  .totals .pair { margin-top:3px; }
  .totals .total { font-size:16px; font-weight:bold; border-top:2px solid #333; padding-top:6px; margin-top:8px; }
  .payment-info { background:#e8f4fd; padding:6px; margin-top:8px; border-radius:4px; border:1px solid #b8d4e8; }
  .note { margin-top:8px; white-space:pre-wrap; font-size:9px; padding:6px; background:#fffde7; border-radius:4px; border-left:4px solid #ffc107; }
  .qr-section { margin:8px 0; text-align:center; }
  .qr-section img, .qr-section svg { width:50mm; height:50mm; }
  .foot { margin-top:10px; text-align:center; font-size:8px; color:#666; border-top:1px dotted #999; padding-top:6px; }
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
  <div class="center" style="font-size:20px; font-weight:bold;">{{ $store }}</div>
  @if($addr)<div class="center" style="font-size:9px;">{{ $addr }}</div>@endif
  @if($phone)<div class="center" style="font-size:9px;">Ph: {{ $phone }}</div>@endif
  <div class="hr"></div>
  
  <div class="center barcode-text">{{ $posted }}</div>
  <div class="center"><span class="type-tag">{{ $invoiceType }} SALE</span></div>
  
  <div class="section meta">
    <div class="pair"><span class="meta-label">Date:</span><span>{{ $date }} {{ $time }}</span></div>
    <div class="pair"><span class="meta-label">Customer:</span><span>{{ $cust ?: 'Walk-in' }}</span></div>
    @if($doctor)<div class="pair"><span class="meta-label">Doctor:</span><span>{{ $doctor }}</span></div>@endif
    @if($patient)<div class="pair"><span class="meta-label">Patient:</span><span>{{ $patient }}</span></div>@endif
    @if($user)<div class="pair"><span class="meta-label">Cashier:</span><span>{{ $user }}</span></div>@endif
    <div class="pair"><span class="meta-label">Items:</span><span>{{ $itemCount }}</span></div>
  </div>
  @if($remarks)<div class="remarks"><strong>Remarks:</strong> {{ $remarks }}</div>@endif
  
  <div class="double-hr"></div>
  
  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th class="center">Qty</th>
        <th class="right">Rate</th>
        <th class="right">Amount</th>
      </tr>
    </thead>
    <tbody>
      @foreach($invoice->items as $it)
        <tr>
          <td>
            <div>{{ optional($it->product)->name ?? '-' }}</div>
            @if(optional($it->product)->barcode)
              <div class="item-barcode">{{ optional($it->product)->barcode }}</div>
            @endif
          </td>
          <td class="center">{{ number_format((float)$it->quantity) }}</td>
          <td class="right">{{ number_format((float)$it->price, 2) }}</td>
          <td class="right">{{ number_format((float)$it->sub_total, 2) }}</td>
        </tr>
      @endforeach
    </tbody>
  </table>
  
  <div class="totals">
    <div class="hr"></div>
    <div class="pair"><span>Subtotal:</span><span>{{ number_format((float)$gross, 2) }}</span></div>
    <div class="pair"><span>Discount:</span><span>-{{ number_format((float)$disc, 2) }}</span></div>
    <div class="pair"><span>Tax:</span><span>{{ number_format((float)$tax, 2) }}</span></div>
    <div class="pair total"><span>TOTAL</span><span>{{ number_format((float)$total, 2) }}</span></div>
  </div>
  
  @if($remainThis > 0)
    <div class="payment-info">
      <div class="pair"><span>Paid:</span><span>{{ number_format($totalReceive, 2) }}</span></div>
      <div class="pair total"><span>Balance Due:</span><span>{{ number_format($remainThis, 2) }}</span></div>
    </div>
  @else
    <div class="payment-info center" style="font-weight:bold; color:green;">
      PAID IN FULL
    </div>
  @endif
  
  @if($showTotalDue)
    <div class="payment-info" style="background:#ffe0b2; border-color:#ff9800;">
      <div class="pair total"><span>TOTAL DUE:</span><span>{{ number_format($customerTotalDue, 2) }}</span></div>
    </div>
  @endif
  
  {{-- QR Code for invoice verification --}}
  <div class="qr-section">
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data={{ urlencode($qrData) }}" alt="QR Code" />
    <div style="font-size:7px; margin-top:2px;">Scan to verify</div>
  </div>
  
  @if($footerNote !== '')
    <div class="note">{{ $footerNote }}</div>
  @endif
  
 <div class="foot">Software by Asim Shahzad<br/>PH:0304-7674787</div>
</div>
</body>
</html>
