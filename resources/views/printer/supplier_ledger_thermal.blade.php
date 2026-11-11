<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Supplier Ledger (Thermal)</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; width: 72mm; margin: 0 auto; padding: 6px 8px; font-size: 11px; }
    h2 { margin: 0; font-size: 14px; text-align: center; }
    .center { text-align: center; }
    .muted { color: #333; }
    .line { border-top: 1px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 4px 0; border-bottom: 1px dotted #000; vertical-align: top; }
    th { text-align: left; }
    .right { text-align: right; }
    .logo { text-align:center; margin-bottom: 4px; }
    .logo img { max-width: 48mm; max-height: 18mm; object-fit: contain; }
    @page { margin: 0; }
    @media print {
      .no-print { display:none }
      body { margin: 0; }
    }
  </style>
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

  @if($setting?->logo_url)
    <div class="logo"><img src="{{ $setting->logo_url }}" alt="Logo"></div>
  @endif
  <h2>{{ $setting->store_name ?: 'Store' }}</h2>
  @if($setting?->phone_number)<div class="center muted">{{ $setting->phone_number }}</div>@endif
  @if($setting?->license_number)<div class="center muted">License # {{ $setting->license_number }}</div>@endif
  @if($setting?->address)<div class="center">{{ $setting->address }}</div>@endif
  <div class="line"></div>

  <div><strong>Supplier:</strong> {{ $supplier->name }}</div>
  @if($range)<div><strong>Range:</strong> {{ $range }}</div>@endif
  <div class="line"></div>

  <table>
    <thead>
      <tr>
        <th style="width:16mm">Date</th>
        <th style="width:12mm">Type</th>
        <th>Ref</th>
        <th class="right" style="width:18mm">Bal</th>
      </tr>
    </thead>
    <tbody>
      @forelse($rows as $r)
        @php
          $ref = $r->posted_number ?: ($r->invoice_number ?: ($r->payment_ref ?: '—'));
          $desc = trim($r->description ?? '');
        @endphp
        <tr>
          <td>{{ \Illuminate\Support\Str::of($r->entry_date)->substr(2,8) }}</td>
          <td>{{ strtoupper(substr($r->entry_type,0,3)) }}</td>
          <td>
            {{ \Illuminate\Support\Str::limit($ref, 18) }}
            @if($desc)<div class="muted">{{ \Illuminate\Support\Str::limit($desc, 24) }}</div>@endif
          </td>
          <td class="right">{{ nf($r->running_balance) }}</td>
        </tr>
      @empty
        <tr><td colspan="4" class="right">No entries.</td></tr>
      @endforelse
    </tbody>
  </table>

  <div class="line"></div>
  <table>
    <tr><th>Total Inv.</th><td class="right">{{ nf($summary['total_invoiced']) }}</td></tr>
    <tr><th>Paid on Inv.</th><td class="right">{{ nf($summary['paid_on_invoice']) }}</td></tr>
    <tr><th>Payments</th><td class="right">{{ nf($summary['payments_debited']) }}</td></tr>
    <tr><th>Net Balance</th><td class="right">{{ nf($summary['net_balance']) }}</td></tr>
  </table>
  <div class="center muted">Printed {{ now()->format('Y-m-d H:i') }}</div>
</body>
</html>
