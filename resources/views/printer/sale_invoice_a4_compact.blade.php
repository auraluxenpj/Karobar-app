@php
    $logo   = $setting->logo_url ?? null;
    $store  = $setting->store_name ?? 'Store Name';
    $phone  = $setting->phone_number ?? '';
    $addr   = $setting->address ?? '';
    $lic    = $setting->license_number ?? '';

    $posted = $invoice->posted_number ?? '';
    $date   = $invoice->date ? \Carbon\Carbon::parse($invoice->date)->format('d/m/Y') : '';
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
<title>Sale Invoice (Compact A4) - {{ $posted }}</title>
<style>
  :root { --text:#111; --muted:#666; --border:#ccc; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; font-family: Arial, Helvetica, sans-serif; color:var(--text); font-size:11px; }

  .page { width:210mm; min-height:297mm; padding:12mm; margin:0 auto; }
  .print-actions { margin:8px auto; width:210mm; text-align:right; }
  .print-actions button { padding:6px 10px; cursor:pointer; }
  @media print { .print-actions { display:none; } .page { padding:8mm; } }

  .header { display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:8px; margin-bottom:12px; }
  .store h2 { margin:0; font-size:16px; }
  .store .meta { font-size:9px; color:var(--muted); margin-top:2px; }
  .invoice-num { font-size:14px; font-weight:bold; }

  .info-bar { display:flex; justify-content:space-between; background:#f5f5f5; padding:6px 10px; margin-bottom:10px; font-size:10px; }
  .info-bar span { color:var(--muted); }

  table { width:100%; border-collapse:collapse; font-size:10px; }
  thead th { border-bottom:1px solid var(--border); padding:5px 4px; text-align:left; font-size:9px; }
  tbody td { padding:4px; border-bottom:1px dotted #ddd; }
  .right { text-align:right; }

  .totals { margin-top:10px; width:35%; margin-left:auto; }
  .totals .row { display:flex; justify-content:space-between; padding:4px 8px; border-bottom:1px solid #eee; }
  .totals .row.total { font-weight:bold; font-size:12px; background:#333; color:#fff; }
  .totals .row.due { font-weight:bold; }
  .totals .row.grand { font-weight:bold; font-size:14px; background:#dc2626; color:#fff; }

  .footer { margin-top:15px; padding-top:8px; border-top:1px solid var(--border); font-size:9px; color:var(--muted); text-align:center; }
</style>
</head>
<body @if(empty($isPreview)) onload="window.print()" @endif>
@if(empty($isPreview))
<div class="print-actions">
  <button onclick="window.print()">Print</button>
</div>
@endif

<div class="page">
  <div class="header">
    <div class="store">
      @if($logo)
        <div style="margin-bottom:4px;"><img src="{{ $logo }}" alt="Logo" style="max-height:36px; max-width:120px; object-fit:contain;" /></div>
      @endif
      <h2>{{ $store }}</h2>
      <div class="meta">
        @if($lic) {{ $lic }} | @endif
        @if($phone) {{ $phone }} | @endif
        @if($addr) {{ $addr }} @endif
      </div>
    </div>
    <div class="invoice-num">#{{ $posted }}</div>
  </div>

  <div class="info-bar">
    <div><span>Date:</span> {{ $date }}</div>
    <div><span>Customer:</span> {{ $cust ?? 'N/A' }}</div>
    <div><span>User:</span> {{ $user }}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th class="right">Qty</th>
        <th class="right">Price</th>
        <th class="right">Disc</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>
      @foreach($invoice->items as $it)
        <tr>
          <td>{{ optional($it->product)->name ?? '-' }}</td>
          <td class="right">{{ number_format((float)$it->quantity, 2) }}</td>
          <td class="right">{{ number_format((float)$it->price, 2) }}</td>
          <td class="right">{{ number_format((float)$it->item_discount_percentage, 1) }}%</td>
          <td class="right">{{ number_format((float)$it->sub_total, 2) }}</td>
        </tr>
      @endforeach
    </tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Gross:</span><span>{{ number_format($gross, 2) }}</span></div>
    <div class="row"><span>Disc:</span><span>-{{ number_format($disc, 2) }}</span></div>
    <div class="row"><span>Tax:</span><span>{{ number_format($tax, 2) }}</span></div>
    <div class="row total"><span>TOTAL:</span><span>{{ number_format($total, 2) }}</span></div>
    
    @if($remainThis > 0)
      <div class="row"><span>Paid:</span><span>{{ number_format($totalReceive, 2) }}</span></div>
      <div class="row due"><span>Due:</span><span>{{ number_format($remainThis, 2) }}</span></div>
    @endif
    
    @if($showTotalDue)
      <div class="row grand"><span>TOTAL DUE:</span><span>{{ number_format($customerTotalDue, 2) }}</span></div>
    @endif
  </div>

  <div class="footer">
    @if($footerNote){{ $footerNote }}@endif
    <br/>Thank you!
  </div>
</div>
</body>
</html>

