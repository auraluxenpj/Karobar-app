<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Stocktake Session Report - {{ $session->reference_no ?? $session->reference_number }}</title>
  <style>
    @page { margin: 14mm 12mm; }
    body { font-family: DejaVu Sans, sans-serif; font-size: 10.5px; color: #1e293b; line-height: 1.4; }
    table { width: 100%; border-collapse: collapse; }
    .header-table { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
    .store-name { font-size: 18px; font-weight: bold; color: #0f172a; }
    .store-meta { font-size: 10px; color: #475569; }
    .doc-badge { display: inline-block; background: #0f172a; color: #fff; font-size: 12px; font-weight: bold; padding: 4px 10px; border-radius: 3px; text-transform: uppercase; }
    .items-table th { background: #0f172a; color: #fff; font-size: 9px; font-weight: bold; text-transform: uppercase; padding: 6px; border: 1px solid #0f172a; text-align: left; }
    .items-table td { padding: 5px 6px; border: 1px solid #cbd5e1; font-size: 9.5px; }
    .text-right { text-align: right !important; }
  </style>
  @include('pdf.partials.design_theme', ['pdfDesign' => $pdfDesign ?? ($setting->a4_template ?? 'standard')])
</head>
<body>
  @php
    $storeName = $setting->store_name ?? 'Pharmacy ERP';
    $hideSystemQty = $session->is_blind && $session->status !== 'finalized';
  @endphp

  <table class="header-table">
    <tr>
      <td style="width: 58%;">
        @include('pdf.partials.store_logo')
        <div class="store-name">{{ $storeName }}</div>
        <div class="store-meta">
          Scope: <strong>{{ strtoupper($session->scope_type ?? 'FULL') }}</strong>
          · Mode: <strong>{{ $session->is_blind ? 'BLIND COUNT' : 'OPEN COUNT' }}</strong>
        </div>
      </td>
      <td style="width: 42%; text-align: right;">
        <div class="doc-badge">
          {{ $hideSystemQty ? 'Blind Physical Count Sheet' : 'Stocktake Variance Report' }}
        </div>
        <div class="store-meta" style="margin-top:4px;">
          Ref #: <strong>{{ $session->reference_no ?? $session->reference_number }}</strong><br>
          Status: <strong>{{ strtoupper(str_replace('_', ' ', $session->status ?? '')) }}</strong>
        </div>
      </td>
    </tr>
  </table>

  <table class="items-table">
    <thead>
      <tr>
        <th>#</th>
        <th>Product</th>
        <th>Batch #</th>
        <th>Expiry</th>
        @if(!$hideSystemQty)
          <th class="text-right">System Qty</th>
        @endif
        <th class="text-right">Physical Count</th>
        @if(!$hideSystemQty)
          <th class="text-right">Variance</th>
          <th class="text-right">Variance Cost</th>
        @endif
      </tr>
    </thead>
    <tbody>
      @forelse($session->items as $i => $it)
        <tr>
          <td>{{ $i + 1 }}</td>
          <td>{{ $it->product->name ?? ('#' . $it->product_id) }}</td>
          <td>{{ $it->batch_number ?: 'UNBATCHED' }}</td>
          <td>{{ $it->expiry_date ? \Carbon\Carbon::parse($it->expiry_date)->format('d M Y') : '—' }}</td>
          @if(!$hideSystemQty)
            <td class="text-right">{{ number_format((int)($it->system_qty ?? 0)) }}</td>
          @endif
          <td class="text-right">
            {{ $it->counted_qty !== null ? number_format((int)$it->counted_qty) : '________' }}
          </td>
          @if(!$hideSystemQty)
            <td class="text-right">{{ $it->variance_qty !== null ? (($it->variance_qty > 0 ? '+' : '') . number_format((int)$it->variance_qty)) : '—' }}</td>
            <td class="text-right">
              {{ $it->variance_qty !== null ? 'Rs. ' . number_format((float)$it->variance_qty * (float)($it->unit_purchase_price ?? $it->unit_cost ?? 0), 2) : '—' }}
            </td>
          @endif
        </tr>
      @empty
        <tr><td colspan="8" style="text-align:center;">No stocktake items.</td></tr>
      @endforelse
    </tbody>
  </table>
</body>
</html>

