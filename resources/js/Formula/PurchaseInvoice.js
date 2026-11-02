// resources/js/Formula/PurchaseInvoice.js

/**
 * Safe numeric coercion that treats empty strings, null, undefined as 0.
 */
const n = (v) => (v === "" || v === null || v === undefined ? 0 : Number(v) || 0);

/**
 * Round safely to 2 decimals.
 */
const r2 = (v) => (Number.isFinite(v) ? Number(v.toFixed(2)) : 0);

/**
 * Recalculate a single invoice row.
 *
 * Rules:
 * - Total quantity shown to user = unit_quantity + unit_bonus.
 * - Bonus cost is spread over all units (paid + bonus) when computing avg cost.
 * - Margin % = (sale - cost) / sale * 100 using unit sale price and averaged unit cost.
 * - Two-way sync pack/unit fields using pack_size.
 */
export function recalcItem(item, changedField = null) {
  const packSize = n(item.pack_size);

  // Pull values as numbers
  let packQty = n(item.pack_quantity);
  let unitQty = n(item.unit_quantity);

  let packPurchase = n(item.pack_purchase_price);
  let unitPurchase = n(item.unit_purchase_price);

  let packSale = n(item.pack_sale_price);
  let unitSale = n(item.unit_sale_price);

  // Wholesale prices - default to sale prices if not provided
  let wholeSalePack = n(item.whole_sale_pack_price);
  let wholeSaleUnit = n(item.whole_sale_unit_price);
  
  // If wholesale price is not provided, default to sale price
  if (wholeSalePack === 0 && packSale > 0) {
    wholeSalePack = packSale;
  }
  if (wholeSaleUnit === 0 && unitSale > 0) {
    wholeSaleUnit = unitSale;
  }

  let packBonus = n(item.pack_bonus);
  let unitBonus = n(item.unit_bonus);

  const discountPct = n(item.item_discount_percentage);

  // ------------------------------
  // Two-way sync (respect changedField)
  // ------------------------------
  if (packSize > 0) {
    // Quantity
    if (changedField === "pack_quantity") unitQty = Math.round(packQty * packSize);
    else if (changedField === "unit_quantity") packQty = unitQty / packSize;
    else if (changedField === "pack_size") {
      if (packQty > 0 && unitQty === 0) unitQty = Math.round(packQty * packSize);
      else if (unitQty > 0 && packQty === 0) packQty = unitQty / packSize;
    }

    // Purchase price
    if (changedField === "pack_purchase_price") unitPurchase = packPurchase / packSize;
    else if (changedField === "unit_purchase_price") packPurchase = unitPurchase * packSize;
    else if (changedField === "pack_size") {
      if (packPurchase > 0 && unitPurchase === 0) unitPurchase = packPurchase / packSize;
      else if (unitPurchase > 0 && packPurchase === 0) packPurchase = unitPurchase * packSize;
    }

    // Sale price
    if (changedField === "pack_sale_price") unitSale = packSale / packSize;
    else if (changedField === "unit_sale_price") packSale = unitSale * packSize;
    else if (changedField === "pack_size") {
      if (packSale > 0 && unitSale === 0) unitSale = packSale / packSize;
      else if (unitSale > 0 && packSale === 0) packSale = unitSale * packSize;
    }

    // Wholesale price
    if (changedField === "whole_sale_pack_price") wholeSaleUnit = wholeSalePack / packSize;
    else if (changedField === "whole_sale_unit_price") wholeSalePack = wholeSaleUnit * packSize;
    else if (changedField === "pack_size") {
      if (wholeSalePack > 0 && wholeSaleUnit === 0) wholeSaleUnit = wholeSalePack / packSize;
      else if (wholeSaleUnit > 0 && wholeSalePack === 0) wholeSalePack = wholeSaleUnit * packSize;
    }

    // Bonus
    if (changedField === "pack_bonus") unitBonus = Math.round(packBonus * packSize);
    else if (changedField === "unit_bonus") packBonus = unitBonus / packSize;
    else if (changedField === "pack_size") {
      if (packBonus > 0 && unitBonus === 0) unitBonus = Math.round(packBonus * packSize);
      else if (unitBonus > 0 && packBonus === 0) packBonus = unitBonus / packSize;
    }
  } else {
    unitQty = Math.round(unitQty);
    unitBonus = Math.round(unitBonus);
  }

  // ------------------------------
  // Totals & pricing
  // ------------------------------
  const paidUnits = unitQty; // excludes free units
  const bonusUnits = unitBonus; // already converted from pack_bonus
  const totalUnits = paidUnits + bonusUnits; // UI: qty + bonus

  const subTotal = paidUnits * unitPurchase;
  const discountAmount = (subTotal * discountPct) / 100;
  const netTotal = subTotal - discountAmount;

  const avgPrice = totalUnits > 0 ? netTotal / totalUnits : 0;

  const costForMargin = avgPrice > 0 ? avgPrice : unitPurchase;
  
  // Retail Margin - calculated from unit sale price
  const margin = unitSale > 0 ? ((unitSale - costForMargin) / unitSale) * 100 : "";
  
  // Wholesale Margin - calculated from wholesale unit price
  const wholeSaleMargin = wholeSaleUnit > 0 ? ((wholeSaleUnit - costForMargin) / wholeSaleUnit) * 100 : "";

  // Helper to preserve the raw text for the field currently being edited.
  const preserve = (fieldName, computedValue) =>
    changedField === fieldName ? item[fieldName] : computedValue;

  return {
    ...item,

    // Preserve raw input for the field being edited so users can type "34." etc.
    pack_quantity: preserve("pack_quantity", packQty),
    unit_quantity: preserve("unit_quantity", unitQty),

    pack_purchase_price: preserve("pack_purchase_price", packPurchase),
    unit_purchase_price: preserve("unit_purchase_price", unitPurchase),

    pack_sale_price: preserve("pack_sale_price", packSale),
    unit_sale_price: preserve("unit_sale_price", unitSale),

    whole_sale_pack_price: preserve("whole_sale_pack_price", wholeSalePack),
    whole_sale_unit_price: preserve("whole_sale_unit_price", wholeSaleUnit),

    pack_bonus: preserve("pack_bonus", packBonus),
    unit_bonus: preserve("unit_bonus", unitBonus),

    // Computed/summary fields
    quantity: totalUnits,
    sub_total: r2(netTotal),
    avg_price: r2(avgPrice),
    margin: margin === "" ? "" : Number.isFinite(margin) ? r2(margin) : "",
    whole_sale_margin: wholeSaleMargin === "" ? "" : Number.isFinite(wholeSaleMargin) ? r2(wholeSaleMargin) : "",
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
    rows_total: r2(rowsTotal),
    discount_percentage: r2(discountPct),
    discount_amount: r2(discountAmt),
    tax_percentage: r2(taxPct),
    tax_amount: r2(taxAmt),
    total_amount: r2(total),
  };
}
