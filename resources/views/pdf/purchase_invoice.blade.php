<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Purchase Invoice (GRN) - {{ $invoice->posted_number }}</title>
  <style>
    @page { margin: 14mm 12mm; }
    body { font-family: DejaVu Sans, sans-serif; font-size: 10.5px; color: #1e293b; line-height: 1.4; }
    table { width: 100%; border-collapse: collapse; }
    .header-table { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
    .store-name { font-size: 18px; font-weight: bold; color: #0f172a; }
    .store-meta { font-size: 10px; color: #475569; }
    .doc-badge { display: inline-block; background: #0f172a; color: #fff; font-size: 12px; font-weight: bold; padding: 4px 10px; border-radius: 3px; text-transform: uppercase; }
    .info-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px 10px; margin-bottom: 12px; }
    .items-table th { background: #0f172a; color: #fff; font-size: 9px; font-weight: bold; text-transform: uppercase; padding: 6px; border: 1px solid #0f172a; text-align: left; }
    .items-table td { padding: 5px 6px; border: 1px solid #cbd5e1; font-size: 9.5px; }
    .text-right { text-align: right !important; }
    .totals-table { width: 280px; margin-left: auto; margin-top: 12px; }
    .totals-table td { padding: 4px 6px; border: 1px solid #cbd5e1; font-size: 10px; }
  </style>
  @include('pdf.partials.design_theme', ['pdfDesign' => $pdfDesign ?? ($setting->a4_template ?? 'standard')])
</head>
<body>
  @php
    $storeName = $setting->store_name ?? 'Business Store';
    $phone = $setting->phone_number ?? '';
    $address = $setting->address ?? '';
  @endphp

  <table class="header-table">
    <tr>
      <td style="width: 60%; vertical-align: top;">
        @include('pdf.partials.store_logo')
        <div class="store-name">{{ $storeName }}</div>
        @if($address)<div class="store-meta">{{ $address }}</div>@endif
        @if($phone)<div class="store-meta">Phone: {{ $phone }}</div>@endif
      </td>
      <td style="width: 40%; vertical-align: top; text-align: right;">
        <div class="doc-badge">Purchase Invoice (GRN)</div>
        <div class="store-meta" style="margin-top: 6px;">
          Posted #: <strong>{{ $invoice->posted_number }}</strong><br>
          Date: <strong>{{ $invoice->posted_date ? \Carbon\Carbon::parse($invoice->posted_date)->format('d M Y') : '-' }}</strong>
        </div>
      </td>
    </tr>
  </table>

  <div class="info-box">
    <table>
      <tr>
        <td style="width: 55%;">
          <strong>Supplier:</strong> {{ $invoice->supplier->name ?? 'N/A' }}<br>
          @if($invoice->supplier?->phone)<span class="store-meta">Phone: {{ $invoice->supplier->phone }}</span><br>@endif
          @if($invoice->supplier?->address)<span class="store-meta">Address: {{ $invoice->supplier->address }}</span>@endif
        </td>
        <td style="width: 45%; text-align: right;">
          <strong>Supplier Inv #:</strong> {{ $invoice->invoice_number ?: '—' }}<br>
          <strong>Invoice Type:</strong> {{ strtoupper($invoice->invoice_type ?? 'DEBIT') }}<br>
          @if($invoice->due_date)<strong>Due Date:</strong> {{ \Carbon\Carbon::parse($invoice->due_date)->format('d M Y') }}@endif
        </td>
      </tr>
    </table>
  </div>

  <table class="items-table">
    <thead>
      <tr>
        <th>#</th>
        <th>Product</th>
        <th>Batch</th>
        <th>Expiry</th>
        <th class="text-right">Pack Qty</th>
        <th class="text-right">Total Units</th>
        <th class="text-right">Bonus</th>
        <th class="text-right">Unit Cost</th>
        <th class="text-right">Disc %</th>
        <th class="text-right">Sub Total</th>
      </tr>
    </thead>
    <tbody>
      @forelse($invoice->items as $i => $it)
        @php
          $ps = max(1, (int)($it->pack_size ?? $it->product?->pack_size ?? 1));
          $totUnits = (float)($it->quantity ?? 0);
          if ($totUnits <= 0) {
              $totUnits = ((float)($it->pack_quantity ?? 0) * $ps) + (float)($it->unit_quantity ?? 0);
          }
          $packQty = (float)($it->pack_quantity ?? 0);
          if ($packQty <= 0 && $totUnits > 0) {
              $packQty = $totUnits / $ps;
          }
          $bonusUnits = (int)($it->unit_bonus ?? $it->bonus ?? 0) + ((int)($it->pack_bonus ?? 0) * $ps);
        @endphp
        <tr>
          <td>{{ $i + 1 }}</td>
          <td>{{ $it->product->name ?? ('#' . $it->product_id) }}</td>
          <td>{{ $it->batch ?: '—' }}</td>
          <td>{{ $it->expiry ?: '—' }}</td>
          <td class="text-right">{{ rtrim(rtrim(number_format($packQty, 2), '0'), '.') ?: '0' }}</td>
          <td class="text-right">{{ number_format((int) round($totUnits)) }}</td>
          <td class="text-right">{{ number_format($bonusUnits) }}</td>
          <td class="text-right">{{ number_format((float)($it->unit_purchase_price ?? 0), 2) }}</td>
          <td class="text-right">{{ number_format((float)($it->item_discount_percentage ?? 0), 2) }}%</td>
          <td class="text-right"><strong>{{ number_format((float)($it->sub_total ?? 0), 2) }}</strong></td>
        </tr>
      @empty
        <tr><td colspan="10" style="text-align:center;">No items recorded.</td></tr>
      @endforelse
    </tbody>
  </table>

  <table class="totals-table">
    <tr>
      <td>Tax Amount</td>
      <td class="text-right">Rs. {{ number_format((float)($invoice->tax_amount ?? 0), 2) }}</td>
    </tr>
    <tr>
      <td>Discount Amount</td>
      <td class="text-right">Rs. {{ number_format((float)($invoice->discount_amount ?? 0), 2) }}</td>
    </tr>
    <tr style="background:#f1f5f9; font-weight:bold;">
      <td>Net Invoice Total</td>
      <td class="text-right">Rs. {{ number_format((float)($invoice->total_amount ?? 0), 2) }}</td>
    </tr>
    <tr>
      <td>Amount Paid</td>
      <td class="text-right">Rs. {{ number_format((float)($invoice->total_paid ?? 0), 2) }}</td>
    </tr>
    <tr style="font-weight:bold;">
      <td>Balance Payable</td>
      <td class="text-right">Rs. {{ number_format(max(0, (float)($invoice->total_amount ?? 0) - (float)($invoice->total_paid ?? 0)), 2) }}</td>
    </tr>
  </table>
</body>
</html>

