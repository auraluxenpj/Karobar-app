// resources/js/Formula/PurchaseReturn.js

/**
 * Safe numeric coercion that treats empty strings, null, undefined as 0.
 */
const n = (v) => (v === "" || v === null || v === undefined ? 0 : Number(v) || 0);

/**
 * Round safely to 2 decimals.
 */
const r2 = (v) => (Number.isFinite(v) ? Number(v.toFixed(2)) : 0);

/**
 * Recalculate a single return row.
 */
export function recalcItem(item, changedField = null) {
  const packSize = n(item.pack_size);

  // Pull values as numbers
  let packQty = n(item.return_pack_quantity);
  let unitQty = n(item.return_unit_quantity);
  let packPurchase = n(item.pack_purchase_price);
  let unitPurchase = n(item.unit_purchase_price);
  const discountPct = n(item.item_discount_percentage);

  // ------------------------------
  // Two-way sync (respect changedField)
  // ------------------------------
  if (packSize > 0) {
    // Quantity
    if (changedField === "return_pack_quantity") unitQty = Math.round(packQty * packSize);
    else if (changedField === "return_unit_quantity") packQty = unitQty / packSize;
    else {
      if (packQty > 0 && unitQty === 0) unitQty = Math.round(packQty * packSize);
      else if (unitQty > 0 && packQty === 0) packQty = unitQty / packSize;
    }

    // Purchase price
    if (changedField === "pack_purchase_price") unitPurchase = packPurchase / packSize;
    else if (changedField === "unit_purchase_price") packPurchase = unitPurchase * packSize;
    else {
      if (packPurchase > 0 && unitPurchase === 0) unitPurchase = packPurchase / packSize;
      else if (unitPurchase > 0 && packPurchase === 0) packPurchase = unitPurchase * packSize;
    }
  } else {
    unitQty = Math.round(unitQty);
  }

  // ------------------------------
  // Totals & pricing
  // ------------------------------
  const subTotal = unitQty > 0 && unitPurchase > 0 ? unitQty * unitPurchase : packQty * packPurchase;
  const discountAmount = (subTotal * discountPct) / 100;
  const netTotal = subTotal - discountAmount;

  // Helper to preserve the raw text for the field currently being edited.
  const preserve = (fieldName, computedValue) =>
    changedField === fieldName ? item[fieldName] : computedValue;

  return {
    ...item,

    // Preserve raw input for the field being edited so users can type "34." etc.
    return_pack_quantity: preserve("return_pack_quantity", packQty),
    return_unit_quantity: preserve("return_unit_quantity", unitQty),

    pack_purchase_price: preserve("pack_purchase_price", packPurchase),
    unit_purchase_price: preserve("unit_purchase_price", unitPurchase),

    // Computed/summary fields
    sub_total: r2(netTotal),
  };
}

/**
 * Sum all row subtotals.
 */
function sumRows(items = []) {
  return items.reduce((sum, it) => sum + n(it.sub_total), 0);
}

/**
 * Recalculate footer totals (discount, tax, total).
 */
export function recalcFooter(form, changedField = null) {
  const rowsTotal = sumRows(form.items);

  let discountPct = n(form.discount_percentage);
  let discountAmt = n(form.discount_amount);
  let taxPct = n(form.tax_percentage);
  let taxAmt = n(form.tax_amount);

  // --- Discount ---
  if (changedField === "discount_percentage") {
    discountAmt = (rowsTotal * discountPct) / 100;
  } else if (changedField === "discount_amount") {
    discountPct = rowsTotal > 0 ? (discountAmt / rowsTotal) * 100 : 0;
  }

  if (discountAmt > rowsTotal) {
    discountAmt = rowsTotal;
    discountPct = 100;
  }

  const afterDiscount = rowsTotal - discountAmt;

  // --- Tax ---
  if (changedField === "tax_percentage") {
    taxAmt = (afterDiscount * taxPct) / 100;
  } else if (changedField === "tax_amount") {
    taxPct = afterDiscount > 0 ? (taxAmt / afterDiscount) * 100 : 0;
  }

  if (taxAmt < 0) taxAmt = 0;

  const total = afterDiscount + taxAmt;

  return {
    ...form,
    gross_total: r2(rowsTotal),
    discount_percentage: r2(discountPct),
    discount_amount: r2(discountAmt),
    tax_percentage: r2(taxPct),
    tax_amount: r2(taxAmt),
    total: r2(total),
  };
}
