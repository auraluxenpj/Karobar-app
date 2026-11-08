@php
    $logo   = $setting->logo_url ?? null;
    $store  = $setting->store_name ?? 'Store Name';
    $phone  = $setting->phone_number ?? '';
    $addr   = $setting->address ?? '';
    $lic    = $setting->license_number ?? '';

    $posted = $invoice->posted_number ?? '';
    $date   = $invoice->date ? \Carbon\Carbon::parse($invoice->date)->format('d M Y') : '';
    $time   = $invoice->date ? \Carbon\Carbon::parse($invoice->date)->format('h:i A') : '';
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
    
    // Generate QR code data
    $qrData = json_encode([
        'inv' => $posted,
        'date' => $date,
        'total' => $total,
        'store' => $store,
        'customer' => $cust
    ]);
@endphp
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Sale Invoice (Barcode A4) - {{ $posted }}</title>
<style>
  :root { --text:#111; --muted:#666; --border:#ccc; --primary:#0d6efd; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; font-family: 'Segoe UI', Arial, sans-serif; color:var(--text); }

  .page { width:210mm; min-height:297mm; padding:18mm 14mm; margin:0 auto; }
  .print-actions { margin:12px auto; width:210mm; text-align:right; }
  .print-actions button { padding:8px 16px; cursor:pointer; background:var(--primary); color:#fff; border:none; border-radius:4px; font-size:12px; }
  @media print { .print-actions { display:none; } .page { padding:12mm; } }

  .header { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid var(--primary); padding-bottom:12px; margin-bottom:15px; }
  .store-info h1 { margin:0; font-size:20px; color:var(--primary); }
  .store-info .details { font-size:10px; color:var(--muted); margin-top:4px; }
  
  .barcode-section { text-align:right; }
  .barcode-text { font-family: 'Courier New', monospace; font-size:18px; font-weight:bold; letter-spacing:2px; }
  .barcode-img { height:40px; }

  .meta-boxes { display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; margin-bottom:15px; }
  .meta-box { background:#f8f9fa; padding:10px; border-radius:4px; border-left:3px solid var(--primary); }
  .meta-box .label { font-size:9px; text-transform:uppercase; color:var(--muted); }
  .meta-box .value { font-weight:600; font-size:12px; margin-top:2px; }

  table { width:100%; border-collapse:collapse; margin-top:10px; font-size:11px; }
  thead th { background:var(--primary); color:#fff; text-align:left; padding:10px 8px; font-size:10px; text-transform:uppercase; }
  tbody td { padding:8px; border-bottom:1px solid #e9ecef; }
  tbody tr:nth-child(even) { background:#f8f9fa; }
  .right { text-align:right; }
  .center { text-align:center; }
  .product-barcode { font-family: 'Courier New', monospace; font-size:9px; color:var(--muted); }

  .summary-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:20px; }
  .summary-box { border:1px solid var(--border); border-radius:6px; overflow:hidden; }
  .summary-box .title { background:#343a40; color:#fff; padding:8px 12px; font-weight:bold; font-size:11px; }
  .summary-box .row { display:flex; justify-content:space-between; padding:8px 12px; border-bottom:1px solid #e9ecef; }
  .summary-box .row:last-child { border-bottom:none; }
  .summary-box .row.total { background:#f8f9fa; font-weight:bold; font-size:14px; }
  .summary-box .row.due { background:#fff3cd; font-weight:bold; }
  .summary-box .row.grand { background:#dc3545; color:#fff; font-weight:bold; font-size:16px; }

  .qr-section { margin-top:15px; text-align:center; padding:15px; background:#f8f9fa; border-radius:6px; }
  .qr-section img { width:80px; height:80px; }
  .qr-text { font-size:9px; color:var(--muted); margin-top:4px; }

  .footer { margin-top:20px; padding-top:12px; border-top:1px solid var(--border); text-align:center; }
  .footer-note { background:#fff3cd; padding:8px; border-radius:4px; border-left:3px solid #ffc107; font-size:10px; margin-bottom:10px; }
  .thankyou { font-style:italic; color:var(--muted); }
  .powered { font-size:9px; color:#adb5bd; margin-top:5px; }
</style>
</head>
<body @if(empty($isPreview)) onload="window.print()" @endif>
@if(empty($isPreview))
<div class="print-actions">
  <button onclick="window.print()">Print Invoice</button>
</div>
@endif

<div class="page">
  <div class="header">
    <div class="store-info">
      @if($logo)
        <div style="margin-bottom:6px;"><img src="{{ $logo }}" alt="Logo" style="max-height:48px; max-width:150px; object-fit:contain;" /></div>
      @endif
      <h1>{{ $store }}</h1>
      <div class="details">
        @if($lic) License: {{ $lic }} | @endif
        @if($addr) {{ $addr }} | @endif
        @if($phone) Ph: {{ $phone }} @endif
      </div>
    </div>
    <div class="barcode-section">
      <div class="barcode-text">{{ $posted }}</div>
      <div style="font-size:10px; color:var(--muted);">{{ $date }} {{ $time }}</div>
    </div>
  </div>

  <div class="meta-boxes">
    <div class="meta-box">
      <div class="label">Customer</div>
      <div class="value">{{ $cust ?? 'N/A' }}</div>
    </div>
    <div class="meta-box">
      <div class="label">Cashier</div>
      <div class="value">{{ $user }}</div>
    </div>
    <div class="meta-box">
      <div class="label">Doctor</div>
      <div class="value">{{ $doc ?? 'N/A' }}</div>
    </div>
    <div class="meta-box">
      <div class="label">Patient</div>
      <div class="value">{{ $pat ?? 'N/A' }}</div>
    </div>
  </div>

  @if($remarks)
  <div style="background:#e7f1ff; padding:8px; border-radius:4px; margin-bottom:15px; font-size:11px;">
    <strong>Remarks:</strong> {{ $remarks }}
  </div>
  @endif

  <table>
    <thead>
      <tr>
        <th style="width:28%">Product</th>
        <th style="width:8%">Pack</th>
        <th style="width:10%">Batch</th>
        <th style="width:8%">Expiry</th>
        <th class="right" style="width:8%">Qty</th>
        <th class="right" style="width:10%">Price</th>
        <th class="right" style="width:8%">Disc</th>
        <th class="right" style="width:13%">Amount</th>
      </tr>
    </thead>
    <tbody>
      @foreach($invoice->items as $it)
        <tr>
          <td>
            <div>{{ optional($it->product)->name ?? '-' }}</div>
            @if(optional($it->product)->barcode)
              <div class="product-barcode">{{ optional($it->product)->barcode }}</div>
            @endif
          </td>
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

  <div class="summary-grid">
    <div class="summary-box">
      <div class="title">INVOICE SUMMARY</div>
      <div class="row"><span>Gross Amount</span><span>{{ number_format($gross, 2) }}</span></div>
      <div class="row"><span>Discount</span><span>-{{ number_format($disc, 2) }}</span></div>
      <div class="row"><span>Tax</span><span>{{ number_format($tax, 2) }}</span></div>
      <div class="row total"><span>TOTAL</span><span>{{ number_format($total, 2) }}</span></div>
    </div>
    
    <div class="summary-box">
      <div class="title">PAYMENT DETAILS</div>
      @if($remainThis > 0)
        <div class="row"><span>Amount Paid</span><span>{{ number_format($totalReceive, 2) }}</span></div>
        <div class="row due"><span>Balance Due</span><span>{{ number_format($remainThis, 2) }}</span></div>
      @else
        <div class="row" style="background:#d4edda; color:#155724;"><span>PAID IN FULL</span><span></span></div>
      @endif
      
      @if($showTotalDue)
        <div class="row grand"><span>TOTAL DUE</span><span>{{ number_format($customerTotalDue, 2) }}</span></div>
      @endif
    </div>
  </div>

  <div class="qr-section">
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data={{ urlencode($qrData) }}" alt="QR Code" />
    <div class="qr-text">Scan to verify invoice</div>
  </div>

  <div class="footer">
    @if($footerNote !== '')
      <div class="footer-note">{{ $footerNote }}</div>
    @endif
    <div class="thankyou">Thank you for your business!</div>
    <div class="powered">Software by Asim Shahzad | PH:0304-7674787</div>
  </div>
</div>
</body>
</html>

