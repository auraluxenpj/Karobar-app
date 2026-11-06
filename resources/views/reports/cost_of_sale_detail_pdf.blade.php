<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Cost of Sale Detail Report</title>
  <style>
    @page { margin: 18px; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11px; color: #111; }
    h1 { font-size: 18px; margin: 0 0 8px 0; color: #2c3e50; text-align: center; border-bottom: 3px solid #3498db; padding-bottom: 15px; }
    h2 { font-size: 14px; margin: 15px 0 8px 0; color: #34495e; border-left: 4px solid #3498db; padding-left: 10px; }
    h3 { font-size: 12px; margin: 10px 0 5px 0; color: #34495e; }
    .meta { font-size: 11px; margin-bottom: 12px; }
    .card { border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 15px; page-break-inside: avoid; }
    .card-hd { background: #f3f4f6; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; }
    .row { display: inline-block; margin-right: 14px; }
    table { width: 100%; border-collapse: collapse; table-layout: auto; }
    th, td { border: 1px solid #e5e7eb; padding: 6px 8px; line-height: 1.35; font-size: 10px; }
    th { background: #3498db; color: white; text-align: left; font-weight: 600; text-transform: uppercase; font-size: 9px; }
    td.num, th.num { text-align: right; }
    .nowrap { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .footer td { font-weight: 600; }
    .profit-positive { color: #27ae60; font-weight: bold; }
    .profit-negative { color: #e74c3c; font-weight: bold; }
    
    /* Invoice Summary Box */
    .invoice-summary { 
      display: grid; 
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); 
      gap: 10px; 
      margin: 15px 0; 
      padding: 15px; 
      background: #ecf0f1; 
      border-radius: 8px; 
    }
    .summary-item { padding: 8px; }
    .summary-item strong { display: block; color: #7f8c8d; font-size: 10px; text-transform: uppercase; }
    .summary-item span { display: block; font-size: 14px; font-weight: bold; color: #2c3e50; }
    
    /* Financial Summary Box */
    .financial-summary { 
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
      color: white; 
      padding: 15px; 
      border-radius: 8px; 
      margin: 15px 0; 
    }
    .financial-summary h3 { 
      margin-top: 0; 
      border-bottom: 1px solid rgba(255,255,255,0.3); 
      padding-bottom: 8px; 
      color: white;
    }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-top: 10px; }
    .summary-box { background: rgba(255,255,255,0.1); padding: 10px; border-radius: 6px; text-align: center; }
    .summary-box strong { display: block; font-size: 11px; opacity: 0.9; color: white; }
    .summary-box span { display: block; font-size: 18px; font-weight: bold; margin-top: 3px; }
    .profit-margin { color: #2ecc71; font-weight: bold; }
    
    /* Notes Box */
    .notes { 
      background: #fff3cd; 
      border-left: 4px solid #ffc107; 
      padding: 10px; 
      margin: 15px 0; 
      border-radius: 4px; 
      font-size: 9px;
    }
    .notes h3 { margin-top: 0; color: #856404; }
    .notes ul { margin: 5px 0; padding-left: 15px; }
    .notes li { margin-bottom: 2px; }
    
    /* Total Row */
    .total-row { background-color: #2c3e50 !important; color: white; font-weight: bold; }
    .total-row td { border-bottom: none; }
    
    .page-break { page-break-after: always; }
    
    /* Invoice specific styling */
    .invoice-header { 
      text-align: center; 
      border: none; 
      margin-bottom: 20px;
    }
    .invoice-header h2 { 
      border: none; 
      font-size: 20px; 
      color: #e74c3c;
    }
    .invoice-number { 
      font-size: 24px; 
      font-weight: bold; 
      color: #e74c3c; 
    }
    
    /* Print optimization */
    @media print {
      .card { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  @forelse($rows as $idx => $inv)
    <!-- Invoice {{ $idx + 1 }} -->
    <h1>Sale Invoice Analysis Report</h1>
    
    <h2 class="invoice-header">
      Invoice Number: <span class="invoice-number">{{ $inv['posted_number'] ?? 'N/A' }}</span>
    </h2>

    @if($inv['cost_is_estimated'] ?? false)
      <p style="font-size:10px;">Estimated historical profit: items without saved costs use the existing current-cost calculation.</p>
    @else
      <p style="font-size:10px;">Cost basis: saved sale costs.</p>
    @endif
    <!-- Invoice Summary -->
    <div class="invoice-summary">
      <div class="summary-item">
        <strong>Invoice Number</strong>
        <span>{{ $inv['posted_number'] ?? 'N/A' }}</span>
      </div>
      <div class="summary-item">
        <strong>Date</strong>
        <span>{{ $inv['date'] ?? 'N/A' }}</span>
      </div>
      <div class="summary-item">
        <strong>Customer</strong>
        <span>{{ $inv['customer_name'] ?? 'WALK-IN-CUSTOMER' }}</span>
      </div>
      <div class="summary-item">
        <strong>Invoice Type</strong>
        <span>{{ strtoupper($inv['invoice_type'] ?? 'debit') }}</span>
      </div>
      <div class="summary-item">
        <strong>Sale Type</strong>
        <span>{{ strtoupper($inv['sale_type'] ?? 'retail') }}</span>
      </div>
      <div class="summary-item">
        <strong>Gross Amount</strong>
        <span>Rs. {{ number_format($inv['total'] ?? 0, 2) }}</span>
      </div>
    </div>

    <!-- Product-wise Cost, Sale Price, and Profit Analysis -->
    <h2>Product-wise Cost, Sale Price, and Profit Analysis</h2>
    <table>
      <thead>
        <tr>
          <th class="nowrap">#</th>
          <th class="nowrap">Product Name</th>
          <th class="num nowrap">Code</th>
          <th class="num nowrap">Pack Size</th>
          <th class="num nowrap">Qty Sold</th>
          <th class="num nowrap">Cost Price (Unit)*</th>
          <th class="num nowrap">Sale Price (Unit)</th>
          <th class="num nowrap">Total Cost</th>
          <th class="num nowrap">Total Sale</th>
          <th class="num nowrap">Profit</th>
        </tr>
      </thead>
      <tbody>
        @forelse(($inv['items'] ?? []) as $idxItem => $it)
          <tr>
            <td>{{ $idxItem + 1 }}</td>
            <td class="nowrap">{{ $it['product_name'] ?? '-' }}</td>
            <td class="num">{{ $it['product_code'] ?? '-' }}</td>
            <td class="num">{{ number_format($it['pack_size'] ?? 0) }}</td>
            <td class="num">{{ number_format($it['quantity'] ?? 0) }}</td>
            <td class="num">Rs. {{ number_format($it['cost_price'] ?? 0, 2) }}{{ ($it['cost_is_estimated'] ?? false) ? ' (estimated)' : '' }}</td>
            <td class="num">Rs. {{ number_format($it['sale_price'] ?? 0, 2) }}</td>
            <td class="num">Rs. {{ number_format($it['total_cost'] ?? 0, 2) }}</td>
            <td class="num">Rs. {{ number_format($it['total_sale'] ?? 0, 2) }}</td>
            <td class="num {{ ($it['profit'] ?? 0) >= 0 ? 'profit-positive' : 'profit-negative' }}">
              Rs. {{ number_format($it['profit'] ?? 0, 2) }}
            </td>
          </tr>
        @empty
          <tr>
            <td colspan="10" style="text-align:center;color:#666;">No items.</td>
          </tr>
        @endforelse
      </tbody>
      <tfoot class="footer">
        <tr class="total-row">
          <td colspan="7" class="num"><strong>TOTAL</strong></td>
          <td class="num"><strong>Rs. {{ number_format($inv['total_cost'] ?? 0, 2) }}</strong></td>
          <td class="num"><strong>Rs. {{ number_format($inv['total_sale'] ?? 0, 2) }}</strong></td>
          <td class="num {{ ($inv['profit'] ?? 0) >= 0 ? 'profit-positive' : 'profit-negative' }}">
            <strong>Rs. {{ number_format($inv['profit'] ?? 0, 2) }}</strong>
          </td>
        </tr>
      </tfoot>
    </table>

    <!-- Financial Summary -->
    <div class="financial-summary">
      <h3>Financial Summary</h3>
      <div class="summary-grid">
        <div class="summary-box">
          <strong>Total Cost of Goods</strong>
          <span>Rs. {{ number_format($inv['total_cost'] ?? 0, 2) }}</span>
        </div>
        <div class="summary-box">
          <strong>Total Sales Revenue</strong>
          <span>Rs. {{ number_format($inv['total_sale'] ?? 0, 2) }}</span>
        </div>
        <div class="summary-box">
          <strong>Total Profit</strong>
          <span style="color: #2ecc71;">Rs. {{ number_format($inv['profit'] ?? 0, 2) }}</span>
        </div>
        <div class="summary-box">
          <strong>Profit Margin</strong>
          <span class="profit-margin">{{ number_format($inv['profit_margin'] ?? 0, 2) }}%</span>
        </div>
      </div>
    </div>

    <!-- Notes -->
    <div class="notes">
      <h3>Notes</h3>
      <ul>
        <li><strong>Cost Price (Unit)</strong> = avg_price from products table (includes weighted average with bonus impact)</li>
        <li><strong>Sale Price (Unit)</strong> = Unit sale price from the invoice</li>
        <li><strong>Total Cost</strong> = Cost Price × Quantity Sold</li>
        <li><strong>Total Sale</strong> = Sale Price × Quantity Sold</li>
        <li><strong>Profit</strong> = Total Sale - Total Cost</li>
        <li>Total items in invoice: {{ count($inv['items'] ?? []) }}</li>
        <li>Total quantity sold: {{ array_sum(array_column($inv['items'] ?? [], 'quantity')) }} units</li>
      </ul>
    </div>

    <p style="text-align: center; color: #7f8c8d; margin-top: 20px; font-size: 10px;">
      <em>Report generated on: {{ $meta['generatedAt'] ?? now()->format('Y-m-d H:i:s') }}</em>
    </p>

    @if(($idx + 1) % 2 === 0)
      <div class="page-break"></div>
    @endif

  @empty
    <p style="text-align: center; padding: 40px; color: #666;">No results for selected filters.</p>
  @endforelse

  <!-- Overall Summary (if multiple invoices) -->
  @if(count($rows) > 1)
    <div class="page-break"></div>
    <h1>Cost of Sale Detail Report - Summary</h1>
    
    <div class="financial-summary">
      <h3>Overall Financial Summary</h3>
      <div class="summary-grid">
        <div class="summary-box">
          <strong>Total Invoices</strong>
          <span>{{ $summary['total_invoices'] ?? count($rows) }}</span>
        </div>
        <div class="summary-box">
          <strong>Total Sales Revenue</strong>
          <span>Rs. {{ number_format($summary['total_sales'] ?? 0, 2) }}</span>
        </div>
        <div class="summary-box">
          <strong>Total Cost of Goods</strong>
          <span>Rs. {{ number_format($summary['total_cost'] ?? 0, 2) }}</span>
        </div>
        <div class="summary-box">
          <strong>Total Profit</strong>
          <span style="color: #2ecc71;">Rs. {{ number_format($summary['total_profit'] ?? 0, 2) }}</span>
        </div>
      </div>
    </div>

    @if($meta['from'] || $meta['to'])
      <p style="font-size: 11px; color: #666; margin-top: 10px;">
        <strong>Date Range:</strong> 
        {{ $meta['from'] ?? 'Start' }} to {{ $meta['to'] ?? 'End' }}
      </p>
    @endif
  @endif
</body>
</html>

