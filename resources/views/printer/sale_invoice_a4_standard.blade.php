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

    // --- Total (prefer controller's computed value) ---
    $total  = isset($printTotal)
                ? (float)$printTotal
                : (float)($invoice->total ?? ($gross - $disc + $tax));

    // --- Receive/Remaining for THIS invoice ---
    $totalReceive = isset($printReceive)
        ? (float)$printReceive
        : (float)($invoice->total_receive ?? 0);

    $remainThis = max($total - $totalReceive, 0);

    // Get customer's total due from ledger
    $customerTotalDue = isset($printCustomerTotalDue) ? (float)$printCustomerTotalDue : null;

    // Show section if this invoice has balance OR customer has total due
    $showBalance = $remainThis > 0 || ($customerTotalDue !== null && $customerTotalDue > 0);

    // Footer note: prefer invoice.footer_note, else setting.note
    $footerNote = trim(($invoice->footer_note ?? '') !== '' ? $invoice->footer_note : ($setting->note ?? ''));
    $isWholesale = ($invoice->sale_type ?? '') === 'wholesale';
@endphp
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>{{ $isWholesale ? 'Wholesale Sale Invoice' : 'Sale Invoice' }} (A4) - {{ $posted }}</title>
<style>
  :root { --text:#111; --muted:#666; --border:#ccc; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; font-family: Arial, Helvetica, sans-serif; color:var(--text); }

  .page { width:210mm; min-height:297mm; padding:16mm 14mm; margin:0 auto; display:flex; flex-direction:column; }
  .print-actions { margin:12px auto; width:210mm; text-align:right; }
  .print-actions button { padding:8px 12px; cursor:pointer; }
  @media print { .print-actions { display:none; } .page { padding:10mm 10mm; } }

  .header { display:flex; align-items:center; gap:16px; border-bottom:1px solid var(--border); padding-bottom:12px; }
  .logo { width:100px; height:100px; object-fit:contain; }
  .store h1 { margin:0; font-size:20px; letter-spacing:.4px; }
  .store .meta { margin-top:4px; font-size:12px; color:var(--muted); line-height:1.4; }

  .title-row { display:flex; justify-content:space-between; align-items:baseline; margin:14px 0 6px; }
  .title-row .title { font-size:18px; font-weight:700; }
  .title-row .code { color:var(--muted); }

  .grid { display:grid; grid-template-columns: repeat(3, 1fr); gap:8px 16px; font-size:12px; margin-bottom:10px; }
  .grid .lbl { color:var(--muted); width:110px; display:inline-block; }
  .grid .val { font-weight:600; }

  table { width:100%; border-collapse:collapse; margin-top:8px; font-size:12px; table-layout:fixed; }
  thead th { text-align:left; border-bottom:1px solid var(--border); padding:8px 6px; font-size:12px; }
  tbody td { border-bottom:1px dashed #e0e0e0; padding:7px 6px; vertical-align:top; word-wrap:break-word; }
  tfoot td { padding:8px 6px; font-size:13px; }
  .right { text-align:right; }

  .footer-total { width:55%; margin-left:auto; border:1px solid var(--border); border-radius:6px; overflow:hidden; margin-top:12px; }
  .footer-total .row { display:flex; justify-content:space-between; padding:10px 12px; }
  .footer-total .row + .row { border-top:1px solid var(--border); }
  .footer-total .row.total { font-weight:800; }
  .footer-total .row.grand { font-weight:900; font-size:14px; }

  .bottom { margin-top:auto; }
  .footer-note { margin-top:12px; padding-top:8px; border-top:1px solid var(--border); font-size:11px; color:var(--muted); white-space:pre-wrap; }
  .thankyou { margin-top:10px; font-size:12px; text-align:center; }
</style>
</head>
<body onload="window.print()">
<div class="print-actions">
  <button onclick="window.print()">Print</button>
</div>

<div class="page">
  {{-- Header --}}
  <div class="header">
    @if($logo)
      <img class="logo" src="{{ $logo }}" alt="Logo">
    @endif
    <div class="store">
      <h1>{{ $store }}</h1>
      <div class="meta">
        @if($lic) <div>License: {{ $lic }}</div> @endif
        @if($phone) <div>Phone: {{ $phone }}</div> @endif
        @if($addr) <div>Address: {{ $addr }}</div> @endif
      </div>
    </div>
  </div>

  {{-- Title / Code --}}
  <div class="title-row">
    <div class="title">{{ $isWholesale ? 'Wholesale Sale Invoice' : 'Sale Invoice' }}</div>
    <div class="code"># {{ $posted }}</div>
  </div>

  {{-- Top Detail --}}
  <div class="grid">
    <div><span class="lbl">Date:</span> <span class="val">{{ $date }}</span></div>
    <div><span class="lbl">User:</span> <span class="val">{{ $user }}</span></div>
    <div><span class="lbl">Customer:</span> <span class="val">{{ $cust }}</span></div>

    <div><span class="lbl">Doctor:</span> <span class="val">{{ $doc }}</span></div>
    <div><span class="lbl">Patient:</span> <span class="val">{{ $pat }}</span></div>
    <div><span class="lbl">Remarks:</span> <span class="val">{{ $remarks }}</span></div>
  </div>

  {{-- Items Table --}}
  <table>
    <thead>
      @if($isWholesale)
        <tr>
          <th style="width:18%">Product</th>
          <th style="width:5%">PSize</th>
          <th style="width:9%">Batch</th>
          <th style="width:8%">Expiry</th>
          <th class="right" style="width:6%">Pack.Q</th>
          <th class="right" style="width:6%">Unit.Q</th>
          <th class="right" style="width:5%">Disc%</th>
          <th class="right" style="width:6%">Pack.B</th>
          <th class="right" style="width:6%">Unit.B</th>
          <th class="right" style="width:7%">Tot.U</th>
          <th class="right" style="width:8%">Pack.P</th>
          <th class="right" style="width:7%">Unit.P</th>
          <th class="right" style="width:9%">Sub Total</th>
        </tr>
      @else
        <tr>
          <th style="width:25%">Product</th>
          <th style="width:10%">Pack</th>
          <th style="width:12%">Batch</th>
          <th style="width:10%">Expiry</th>
          <th class="right" style="width:10%">Qty</th>
          <th class="right" style="width:10%">Price</th>
          <th class="right" style="width:8%">Disc %</th>
          <th class="right" style="width:15%">Sub Total</th>
        </tr>
      @endif
    </thead>
    <tbody>
      @foreach($invoice->items as $it)
        @if($isWholesale)
          @php
            $ps = max(1, (int)($it->pack_size ?? optional($it->product)->pack_size ?? 1));
            $totU = (int)($it->quantity ?? 0);
            $packQVal = ((float)($it->pack_quantity ?? 0) > 0) ? (float)$it->pack_quantity : round($totU / $ps, 2);
            $packQ = fmod($packQVal, 1.0) == 0.0 ? number_format($packQVal, 0) : rtrim(rtrim(number_format($packQVal, 2), '0'), '.');
            $unitQ = $totU;
            $bonusQ = (int)($it->bonus ?? 0);
            $packBVal = ((float)($it->pack_bonus ?? 0) > 0) ? (float)$it->pack_bonus : round($bonusQ / $ps, 2);
            $packB = fmod($packBVal, 1.0) == 0.0 ? number_format($packBVal, 0) : rtrim(rtrim(number_format($packBVal, 2), '0'), '.');
            $unitB = $bonusQ;
            $unitP = (float)($it->price ?? 0);
            $packP = ((float)($it->pack_price ?? 0) > 0) ? (float)$it->pack_price : ($unitP * $ps);
          @endphp
          <tr>
            <td>{{ optional($it->product)->name ?? '-' }}</td>
            <td>{{ $ps }}</td>
            <td>{{ $it->batch_number }}</td>
            <td>{{ $it->expiry }}</td>
            <td class="right">{{ $packQ }}</td>
            <td class="right">{{ $unitQ }}</td>
            <td class="right">{{ number_format((float)$it->item_discount_percentage, 2) }}</td>
            <td class="right">{{ $packB }}</td>
            <td class="right">{{ $unitB }}</td>
            <td class="right">{{ $totU }}{{ $bonusQ > 0 ? '+' . $bonusQ : '' }}</td>
            <td class="right">{{ number_format($packP, 2) }}</td>
            <td class="right">{{ number_format($unitP, 2) }}</td>
            <td class="right">{{ number_format((float)$it->sub_total, 2) }}</td>
          </tr>
        @else
          <tr>
            <td>{{ optional($it->product)->name ?? '-' }}</td>
            <td>{{ $it->pack_size }}</td>
            <td>{{ $it->batch_number }}</td>
            <td>{{ $it->expiry }}</td>
            <td class="right">{{ number_format((float)$it->quantity, 2) }}</td>
            <td class="right">{{ number_format((float)$it->price, 2) }}</td>
            <td class="right">{{ number_format((float)$it->item_discount_percentage, 2) }}</td>
            <td class="right">{{ number_format((float)$it->sub_total, 2) }}</td>
          </tr>
        @endif
      @endforeach
    </tbody>
  </table>

  {{-- Totals & Balance --}}
  <div class="footer-total">
    <div class="row"><div>Gross</div><div>{{ number_format($gross, 2) }}</div></div>
    <div class="row"><div>Discount</div><div>{{ number_format($disc, 2) }}</div></div>
    <div class="row"><div>Tax</div><div>{{ number_format($tax, 2) }}</div></div>
    <div class="row total"><div>Total</div><div>{{ number_format($total, 2) }}</div></div>

    {{-- Show Balance section --}}
    @if($showBalance)
      <div class="row"><div>Total Receive</div><div>{{ number_format($totalReceive, 2) }}</div></div>
      @if($remainThis > 0)
        <div class="row"><div>Balance</div><div>{{ number_format($remainThis, 2) }}</div></div>
      @endif
      @if($customerTotalDue !== null && $customerTotalDue > 0)
        <div class="row grand"><div>Total Due</div><div>{{ number_format($customerTotalDue, 2) }}</div></div>
      @endif
    @endif
  </div>

  {{-- Bottom --}}
  <div class="bottom">
    @if($footerNote !== '')
      <div class="footer-note">{{ $footerNote }}</div>
    @endif
    <div class="thankyou">Thank you for your business!</div>
  </div>
</div>
</body>
</html>

