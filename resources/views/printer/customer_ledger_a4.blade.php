<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Customer Ledger (A4)</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 20px; color: #000; }
    h1,h2,h3 { margin: 0; }
    .meta { margin-top: 6px; font-size: 12px; color: #333; }
    .row { display: flex; justify-content: space-between; gap: 16px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand img { height: 48px; width: auto; object-fit: contain; }
    .mt-8 { margin-top: 8px; }
    .mt-12 { margin-top: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #333; padding: 6px 8px; vertical-align: top; }
    th { background: #f2f2f2; text-align: left; }
    .text-right { text-align: right; }
    .small { font-size: 11px; color:#555; }
    @media print {
      body { margin: 0; }
      .no-print { display: none !important; }
      th { background: #eee !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
@include('printer.partials.calibration_styles')
</head>
<body onload="if (!window.karobarDesktop && !window.__karobarSilentPrintWorker && !/Electron/i.test(navigator.userAgent) && window.self === window.top && !new URLSearchParams(window.location.search).has('silent_print')) window.print()">
  @php
    if (!function_exists('nf')) {
      function nf($v){
        $n = (float)$v;
        if (floor($n) == $n) return number_format($n, 0, '.', ',');
        return rtrim(rtrim(number_format($n, 2, '.', ','), '0'), '.');
      }
    }
    $range = trim(($from ?? '').' — '.($to ?? ''), ' —');
  @endphp

  <div class="row">
    <div class="brand">
      @if($setting?->logo_url)
        <img src="{{ $setting->logo_url }}" alt="Logo">
      @endif
      <div>
        <h2>{{ $setting->store_name ?: 'Store' }}</h2>
        @if($setting?->address)<div class="small">{{ $setting->address }}</div>@endif
        <div class="small">
          @if($setting?->phone_number) <span>Tel: {{ $setting->phone_number }}</span>@endif
          @if($setting?->license_number) <span style="margin-left:12px;">License #: {{ $setting->license_number }}</span>@endif
        </div>
      </div>
    </div>
    <div class="text-right">
      <h1>Customer Ledger</h1>
      <div class="meta">Printed: {{ now()->format('Y-m-d H:i') }}</div>
    </div>
  </div>

  <div class="mt-12">
    <strong>Customer:</strong> {{ $customer->name }}
    @if($range)
      &nbsp;&nbsp; <strong>Range:</strong> {{ $range }}
    @endif
  </div>

  <div class="mt-8">
    <table>
      <thead>
        <tr>
          <th style="width:90px">Date</th>
          <th style="width:80px">Type</th>
          <th>Posted #</th>
          <th>Invoice #</th>
          <th class="text-right">Invoice Total</th>
          <th class="text-right">Received on Invoice</th>
          <th class="text-right">Received Payment</th>
          <th>Payment Ref</th>
          <th class="text-right">Balance Remaining</th>
          <th class="text-right">Balance</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        @if(!empty($from) || (!empty($summary['opening_balance']) && (float)$summary['opening_balance'] != 0))
          <tr style="background:#f9fafb;font-weight:bold;">
            <td>{{ $from ?: '—' }}</td>
            <td>B/F</td>
            <td colspan="7">Opening Balance Brought Forward</td>
            <td class="text-right">{{ nf($summary['opening_balance'] ?? 0) }}</td>
            <td>Prior to {{ $from ?: 'period' }}</td>
          </tr>
        @endif
        @forelse($rows as $r)
          <tr>
            <td>{{ \Illuminate\Support\Str::of($r->entry_date)->substr(0,10) }}</td>
            <td>{{ strtoupper($r->entry_type) }}</td>
            <td>{{ $r->posted_number }}</td>
            <td>{{ $r->invoice_number }}</td>
            <td class="text-right">{{ nf($r->invoice_total) }}</td>
            <td class="text-right">{{ nf($r->total_received) }}</td>
            <td class="text-right">{{ nf($r->credited_amount) }}</td>
            <td>{{ $r->payment_ref }}</td>
            <td class="text-right">{{ nf($r->credit_remaining_calc) }}</td>
            <td class="text-right">{{ nf($r->running_balance) }}</td>
            <td>{{ $r->description }}</td>
          </tr>
        @empty
          <tr><td colspan="11" class="text-right">No entries.</td></tr>
        @endforelse
      </tbody>
    </table>
  </div>

  <div class="mt-12" style="max-width: 500px;">
    <table>
      <tr><th>Total Invoiced</th><td class="text-right">{{ nf($summary['total_invoiced']) }}</td></tr>
      <tr><th>Received on Invoice</th><td class="text-right">{{ nf($summary['received_on_invoice']) }}</td></tr>
      <tr><th>Payments (Credited)</th><td class="text-right">{{ nf($summary['payments_credited']) }}</td></tr>
      <tr><th>Net Balance</th><td class="text-right">{{ nf($summary['net_balance']) }}</td></tr>
    </table>
  </div>
</body>
</html>
