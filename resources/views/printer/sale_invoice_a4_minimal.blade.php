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
<title>Sale Invoice (Minimal A4) - {{ $posted }}</title>
<style>
  :root { --text:#111; --muted:#666; --border:#ccc; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; font-family: Arial, Helvetica, sans-serif; color:var(--text); }

  .page { width:210mm; min-height:297mm; padding:15mm; margin:0 auto; }
  .print-actions { margin:12px auto; width:210mm; text-align:right; }
  .print-actions button { padding:8px 12px; cursor:pointer; }
  @media print { .print-actions { display:none; } .page { padding:10mm; } }

  .header { text-align:center; border-bottom:2px solid var(--border); padding-bottom:10px; margin-bottom:15px; }
  .header h1 { margin:0 0 5px 0; font-size:22px; }
  .header .meta { font-size:11px; color:var(--muted); }

  .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:15px; font-size:11px; }
  .info-box { border:1px solid var(--border); padding:8px; border-radius:4px; }
  .info-box .label { color:var(--muted); font-size:10px; text-transform:uppercase; }
  .info-box .value { font-weight:bold; font-size:13px; }

  table { width:100%; border-collapse:collapse; font-size:11px; }
  thead th { background:#f5f5f5; text-align:left; padding:8px 6px; border-bottom:1px solid var(--border); font-size:10px; }
  tbody td { padding:6px; border-bottom:1px dashed #e0e0e0; }
  .right { text-align:right; }
  .center { text-align:center; }

  .totals { margin-top:15px; float:right; width:40%; }
  .totals .row { display:flex; justify-content:space-between; padding:8px 10px; border-bottom:1px solid var(--border); }
  .totals .row.total { font-weight:bold; font-size:14px; background:#f9f9f9; }
  .totals .row.grand { font-weight:bold; font-size:16px; background:#333; color:#fff; }

  .clear { clear:both; }

  .footer { margin-top:20px; padding-top:10px; border-top:1px solid var(--border); font-size:10px; color:var(--muted); }
  .thankyou { text-align:center; margin-top:15px; font-size:12px; font-style:italic; }
</style>
</head>
<body onload="window.print()">
<div class="print-actions">
  <button onclick="window.print()">Print</button>
</div>

<div class="page">
  <div class="header">
    @if($logo)
      <div style="margin-bottom:6px;"><img src="{{ $logo }}" alt="Logo" style="max-height:48px; max-width:150px; object-fit:contain;" /></div>
    @endif
    <h1>{{ $store }}</h1>
    <div class="meta">
      @if($lic) License: {{ $lic }} | @endif
      @if($phone) Ph: {{ $phone }} | @endif
      @if($addr) {{ $addr }} @endif
    </div>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <div class="label">Invoice #</div>
      <div class="value">{{ $posted }}</div>
      <div class="label" style="margin-top:5px;">Date</div>
      <div class="value">{{ $date }}</div>
    </div>
    <div class="info-box">
      <div class="label">Customer</div>
      <div class="value">{{ $cust ?? 'N/A' }}</div>
      <div class="label" style="margin-top:5px;">User</div>
      <div class="value">{{ $user }}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th class="center">Qty</th>
        <th class="right">Price</th>
        <th class="right">Disc</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>
      @foreach($invoice->items as $it)
        <tr>
          <td>{{ optional($it->product)->name ?? '-' }}</td>
          <td class="center">{{ number_format((float)$it->quantity, 2) }}</td>
          <td class="right">{{ number_format((float)$it->price, 2) }}</td>
          <td class="right">{{ number_format((float)$it->item_discount_percentage, 1) }}%</td>
          <td class="right">{{ number_format((float)$it->sub_total, 2) }}</td>
        </tr>
      @endforeach
    </tbody>
  </table>

  <div class="clear"></div>

  <div class="totals">
    <div class="row"><span>Gross</span><span>{{ number_format($gross, 2) }}</span></div>
    <div class="row"><span>Discount</span><span>{{ number_format($disc, 2) }}</span></div>
    <div class="row"><span>Tax</span><span>{{ number_format($tax, 2) }}</span></div>
    <div class="row total"><span>Total</span><span>{{ number_format($total, 2) }}</span></div>
    
    @if($remainThis > 0)
      <div class="row"><span>Paid</span><span>{{ number_format($totalReceive, 2) }}</span></div>
      <div class="row total"><span>Due</span><span>{{ number_format($remainThis, 2) }}</span></div>
    @endif
    
    @if($showTotalDue)
      <div class="row grand"><span>Total Due</span><span>{{ number_format($customerTotalDue, 2) }}</span></div>
    @endif
  </div>

  <div class="footer">
    @if($footerNote !== '')
      <div style="margin-bottom:10px;">{{ $footerNote }}</div>
    @endif
    <div class="thankyou">Thank you for your business!</div>
  </div>
</div>
</body>
</html>

