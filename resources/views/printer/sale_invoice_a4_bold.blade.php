@php
    $logo   = $setting->logo_url ?? null;
    $store  = $setting->store_name ?? 'STORE NAME';
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
<title>Sale Invoice (Bold A4) - {{ $posted }}</title>
<style>
  :root { --text:#000; --muted:#444; --border:#000; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; font-family: 'Arial Black', 'Helvetica Neue', sans-serif; color:var(--text); }

  .page { width:210mm; min-height:297mm; padding:20mm 15mm; margin:0 auto; }
  .print-actions { margin:15px auto; width:210mm; text-align:right; }
  .print-actions button { padding:10px 20px; cursor:pointer; font-weight:bold; }
  @media print { .print-actions { display:none; } .page { padding:15mm; } }

  .header { border-bottom:4px solid #000; padding-bottom:15px; margin-bottom:20px; text-align:center; }
  .header h1 { margin:0; font-size:32px; letter-spacing:3px; text-transform:uppercase; }
  .header .meta { margin-top:10px; font-size:12px; font-weight:normal; }

  .info-row { display:flex; justify-content:space-between; margin-bottom:20px; border:2px solid #000; padding:15px; }
  .info-col { text-align:center; flex:1; }
  .info-col .label { font-size:10px; text-transform:uppercase; color:var(--muted); margin-bottom:5px; }
  .info-col .value { font-size:16px; font-weight:900; }

  table { width:100%; border-collapse:collapse; margin-top:15px; font-size:12px; border:2px solid #000; }
  thead th { background:#000; color:#fff; text-align:left; padding:12px 10px; font-size:11px; text-transform:uppercase; border-bottom:2px solid #000; }
  tbody td { padding:10px; border-bottom:1px solid #ccc; font-weight:bold; }
  tbody tr:nth-child(even) { background:#f9f9f9; }
  .right { text-align:right; }
  .center { text-align:center; }

  .totals-section { margin-top:25px; border:3px double #000; padding:20px; }
  .totals-section .row { display:flex; justify-content:space-between; padding:10px 0; font-size:14px; font-weight:bold; }
  .totals-section .row + .row { border-top:1px solid #ccc; }
  .totals-section .row.total { font-size:22px; border-top:2px solid #000; padding-top:15px; margin-top:10px; }
  .totals-section .row.due { font-size:18px; color:#dc2626; }
  .totals-section .row.grand { font-size:24px; background:#000; color:#fff; padding:15px; margin-top:10px; }

  .footer { margin-top:30px; text-align:center; font-size:11px; font-weight:normal; }
  .footer-note { background:#ffff00; padding:10px; border:1px solid #000; margin-bottom:10px; font-weight:bold; }
  .thankyou { font-size:14px; font-style:italic; margin-top:15px; }
</style>
</head>
<body onload="window.print()">
<div class="print-actions">
  <button onclick="window.print()">PRINT</button>
</div>

<div class="page">
  <div class="header">
    @if($logo)
      <div style="margin-bottom:8px;"><img src="{{ $logo }}" alt="Logo" style="max-height:54px; max-width:160px; object-fit:contain;" /></div>
    @endif
    <h1>{{ $store }}</h1>
    <div class="meta">
      @if($lic) LICENSE: {{ $lic }} | @endif
      @if($phone) PH: {{ $phone }} | @endif
      @if($addr) {{ $addr }} @endif
    </div>
  </div>

  <div class="info-row">
    <div class="info-col">
      <div class="label">Invoice No</div>
      <div class="value">{{ $posted }}</div>
    </div>
    <div class="info-col">
      <div class="label">Date</div>
      <div class="value">{{ $date }}</div>
    </div>
    <div class="info-col">
      <div class="label">Customer</div>
      <div class="value">{{ $cust ?? 'N/A' }}</div>
    </div>
    <div class="info-col">
      <div class="label">Cashier</div>
      <div class="value">{{ $user }}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:35%">PRODUCT</th>
        <th class="center" style="width:10%">QTY</th>
        <th class="right" style="width:15%">PRICE</th>
        <th class="right" style="width:10%">DISC</th>
        <th class="right" style="width:15%">AMOUNT</th>
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

  <div class="totals-section">
    <div class="row"><span>SUBTOTAL</span><span>{{ number_format($gross, 2) }}</span></div>
    <div class="row"><span>DISCOUNT</span><span>-{{ number_format($disc, 2) }}</span></div>
    <div class="row"><span>TAX</span><span>{{ number_format($tax, 2) }}</span></div>
    <div class="row total"><span>TOTAL</span><span>{{ number_format($total, 2) }}</span></div>
    
    @if($remainThis > 0)
      <div class="row"><span>PAID</span><span>{{ number_format($totalReceive, 2) }}</span></div>
      <div class="row due"><span>BALANCE DUE</span><span>{{ number_format($remainThis, 2) }}</span></div>
    @endif
    
    @if($showTotalDue)
      <div class="row grand"><span>TOTAL DUE</span><span>{{ number_format($customerTotalDue, 2) }}</span></div>
    @endif
  </div>

  <div class="footer">
    @if($footerNote !== '')
      <div class="footer-note">NOTE: {{ $footerNote }}</div>
    @endif
    <div class="thankyou">THANK YOU FOR YOUR BUSINESS!</div>
    <div style="margin-top:8px;">Software by Asim Shahzad | PH:0304-7674787</div>
  </div>
</div>
</body>
</html>

