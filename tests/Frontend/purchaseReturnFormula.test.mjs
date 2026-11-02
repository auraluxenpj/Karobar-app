import test from "node:test";
import assert from "node:assert/strict";
import { recalcItem as recalcPurchaseReturnItem, recalcFooter as recalcPurchaseReturnFooter } from "../../resources/js/Formula/PurchaseReturn.js";
import { recalcItem as recalcPurchaseInvoiceItem } from "../../resources/js/Formula/PurchaseInvoice.js";

test("PurchaseReturn.recalcItem computes sub_total from unit_return_quantity when hydrated with changedField null or open_edit_inline_hydrate", () => {
  const row = {
    pack_size: 10,
    return_pack_quantity: 0,
    return_unit_quantity: 5,
    pack_purchase_price: 200,
    unit_purchase_price: 20,
    item_discount_percentage: 10,
  };

  const hydrated = recalcPurchaseReturnItem(row, "open_edit_inline_hydrate");
  assert.equal(hydrated.return_unit_quantity, 5);
  assert.equal(hydrated.return_pack_quantity, 0.5);
  assert.equal(hydrated.sub_total, 90); // 5 * 20 = 100, minus 10% = 90

  const footer = recalcPurchaseReturnFooter({
    items: [hydrated],
    discount_percentage: 0,
    discount_amount: 0,
    tax_percentage: 0,
    tax_amount: 0,
  });
  assert.equal(footer.gross_total, 90);
  assert.equal(footer.total, 90);
});

test("PurchaseReturn.recalcItem rounds fractional pack quantities to integer return_unit_quantity", () => {
  const row = {
    pack_size: 3,
    return_pack_quantity: "0.33",
    return_unit_quantity: 0,
    pack_purchase_price: 30,
    unit_purchase_price: 10,
    item_discount_percentage: 0,
  };

  const updated = recalcPurchaseReturnItem(row, "return_pack_quantity");
  assert.equal(Number.isInteger(updated.return_unit_quantity), true);
  assert.equal(updated.return_unit_quantity, 1);
});

test("PurchaseInvoice.recalcItem rounds fractional pack_quantity and pack_bonus to integer unit_quantity and unit_bonus", () => {
  const row = {
    pack_size: 3,
    pack_quantity: "0.67",
    unit_quantity: 0,
    pack_bonus: "0.33",
    unit_bonus: 0,
    pack_purchase_price: 30,
    unit_purchase_price: 10,
    pack_sale_price: 45,
    unit_sale_price: 15,
    item_discount_percentage: 0,
  };

  const afterQty = recalcPurchaseInvoiceItem(row, "pack_quantity");
  assert.equal(Number.isInteger(afterQty.unit_quantity), true);
  assert.equal(afterQty.unit_quantity, 2);

  const afterBonus = recalcPurchaseInvoiceItem(afterQty, "pack_bonus");
  assert.equal(Number.isInteger(afterBonus.unit_bonus), true);
  assert.equal(afterBonus.unit_bonus, 1);
  assert.equal(afterBonus.quantity, 3);
});

