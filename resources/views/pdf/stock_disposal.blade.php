<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Official Stock Disposal &amp; Destruction Certificate - {{ $disposal->reference_number }}</title>
  <style>
    @page { margin: 14mm 12mm; }
    body { font-family: DejaVu Sans, sans-serif; font-size: 10.5px; color: #1e293b; line-height: 1.4; }
    table { width: 100%; border-collapse: collapse; }
    .header-table { border-bottom: 2px solid #991b1b; padding-bottom: 10px; margin-bottom: 12px; }
    .store-name { font-size: 18px; font-weight: bold; color: #0f172a; }
    .store-meta { font-size: 10px; color: #475569; }
    .doc-badge { display: inline-block; background: #991b1b; color: #fff; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 3px; text-transform: uppercase; }
    .info-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; padding: 8px 10px; margin-bottom: 12px; }
    .items-table th { background: #0f172a; color: #fff; font-size: 9px; font-weight: bold; text-transform: uppercase; padding: 6px; border: 1px solid #0f172a; text-align: left; }
    .items-table td { padding: 5px 6px; border: 1px solid #cbd5e1; font-size: 9.5px; }
    .text-right { text-align: right !important; }
    .sig-grid { margin-top: 40px; width: 100%; }
    .sig-cell { width: 33%; text-align: center; padding: 0 12px; vertical-align: bottom; }
    .sig-line { border-top: 1px solid #334155; padding-top: 6px; font-size: 10px; font-weight: bold; }
  </style>
  @include('pdf.partials.design_theme', ['pdfDesign' => $pdfDesign ?? ($setting->a4_template ?? 'standard')])
</head>
<body>
  @php
    $storeName = $setting->store_name ?? 'Pharmacy ERP';
    $phone = $setting->phone_number ?? '';
    $address = $setting->address ?? '';
    $licenseNo = $setting->license_no ?? '';
  @endphp

  <table class="header-table">
    <tr>
      <td style="width: 58%; vertical-align: top;">
        @include('pdf.partials.store_logo')
        <div class="store-name">{{ $storeName }}</div>
        @if($address)<div class="store-meta">{{ $address }}</div>@endif
        @if($phone)<div class="store-meta">Phone: {{ $phone }}</div>@endif
        @if($licenseNo)<div class="store-meta">Drug License #: {{ $licenseNo }}</div>@endif
      </td>
      <td style="width: 42%; vertical-align: top; text-align: right;">
        <div class="doc-badge">Official Destruction Certificate</div>
        <div class="store-meta" style="margin-top: 6px;">
          Certificate #: <strong>{{ $disposal->reference_number }}</strong><br>
          Date: <strong>{{ $disposal->disposal_date ? \Carbon\Carbon::parse($disposal->disposal_date)->format('d M Y') : '-' }}</strong><br>
          Status: <strong>{{ strtoupper($disposal->status ?? 'QUARANTINED') }}</strong>
        </div>
      </td>
    </tr>
  </table>

  <div class="info-box">
    <table>
      <tr>
        <td style="width: 50%;">
          <strong>Reason for Quarantine / Disposal:</strong> {{ strtoupper(str_replace('_', ' ', $disposal->reason ?? 'EXPIRED')) }}<br>
          <strong>Destruction Method:</strong> {{ strtoupper(str_replace('_', ' ', $disposal->disposal_method ?: 'Pending Execution')) }}
        </td>
        <td style="width: 50%; text-align: right;">
          <strong>Initiated By:</strong> {{ $disposal->user->name ?? 'System' }}<br>
          <strong>Executed / Witnessed By:</strong> {{ $disposal->disposedBy->name ?? ($disposal->witness_name ?: '—') }}
        </td>
      </tr>
    </table>
    @if($disposal->notes)
      <div style="margin-top:6px; font-size:10px;"><strong>Audit Notes:</strong> {{ $disposal->notes }}</div>
    @endif
  </div>

  <table class="items-table">
    <thead>
      <tr>
        <th>#</th>
        <th>Product Name</th>
        <th>Batch #</th>
        <th>Expiry Date</th>
        <th class="text-right">Disposed Qty</th>
        <th class="text-right">Unit Cost</th>
        <th class="text-right">Total Write-Off Cost</th>
      </tr>
    </thead>
    <tbody>
      @forelse($disposal->items as $i => $it)
        <tr>
          <td>{{ $i + 1 }}</td>
          <td>{{ $it->product->name ?? ('#' . $it->product_id) }}</td>
          <td>{{ $it->batch_number ?: ($it->batch?->batch_number ?? '—') }}</td>
          <td>{{ $it->expiry_date ? \Carbon\Carbon::parse($it->expiry_date)->format('d M Y') : '—' }}</td>
          <td class="text-right">{{ number_format((int)($it->quantity ?? 0)) }}</td>
          <td class="text-right">Rs. {{ number_format((float)($it->unit_cost ?? 0), 2) }}</td>
          <td class="text-right"><strong>Rs. {{ number_format((float)($it->total_cost ?? 0), 2) }}</strong></td>
        </tr>
      @empty
        <tr><td colspan="7" style="text-align:center;">No items listed.</td></tr>
      @endforelse
      <tr style="background:#f8fafc; font-weight:bold;">
        <td colspan="4">Total Certified Destruction Value</td>
        <td class="text-right">{{ number_format((int)($disposal->total_quantity ?? 0)) }}</td>
        <td></td>
        <td class="text-right">Rs. {{ number_format((float)($disposal->total_cost ?? 0), 2) }}</td>
      </tr>
    </tbody>
  </table>

  <p style="margin-top:16px; font-size:10px; color:#334155;">
    This certificate attests that the pharmaceutical/inventory items listed above were quarantined and permanently destroyed/disposed of in accordance with regulatory and tax compliance guidelines.
  </p>

  <table class="sig-grid">
    <tr>
      <td class="sig-cell">
        <div class="sig-line">Prepared By ({{ $disposal->user->name ?? 'Pharmacist' }})</div>
      </td>
      <td class="sig-cell">
        <div class="sig-line">Witness / Inspector ({{ $disposal->witness_name ?: 'Authorized Witness' }})</div>
      </td>
      <td class="sig-cell">
        <div class="sig-line">Approved By ({{ $disposal->disposedBy->name ?? 'Proprietor / Manager' }})</div>
      </td>
    </tr>
  </table>
</body>
</html>

