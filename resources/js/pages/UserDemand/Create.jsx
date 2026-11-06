import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  HandRaisedIcon,
  PlusIcon,
  TrashIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { usePermissions } from "@/api/usePermissions.js";
import ProductSearchInput from "@/components/ProductSearchInput.jsx";
import CustomerSearch from "@/components/CustomerSearch.jsx";

const entryFields = ["requested_quantity", "notes"];
const newItem = () => ({
  product_id: "",
  product: null,
  requested_quantity: 1,
  notes: "",
});

export default function CreateUserDemand() {
  const navigate = useNavigate();
  const { loading: permissionsLoading, has } = usePermissions();
  const canCreate = has("user-demands.create");

  const [items, setItems] = useState(() => [newItem()]);
  const [products, setProducts] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingFocus, setPendingFocus] = useState(null);

  const inFlight = useRef(false);
  const focusedOnce = useRef(false);
  const productRefs = useRef({});
  const fieldRefs = useRef({});
  const itemRowRefs = useRef({});
  const itemsContainerRef = useRef(null);

  const scrollToItem = (index) => {
    const row = itemRowRefs.current[index];
    const container = itemsContainerRef.current;
    if (!row || !container) return;
    if (container.scrollHeight <= container.clientHeight) {
      row.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }
    const bounds = container.getBoundingClientRect();
    const rowBounds = row.getBoundingClientRect();
    const headerHeight = container.querySelector("thead")?.getBoundingClientRect().height || 0;
    const top = bounds.top + headerHeight + 4;
    const bottom = bounds.bottom - 4;
    if (rowBounds.top < top) container.scrollTop += rowBounds.top - top;
    else if (rowBounds.bottom > bottom) container.scrollTop += rowBounds.bottom - bottom;
  };

  const refreshProducts = useCallback(async (q = "") => {
    try {
      const { data } = await axios.get("/api/products/search", { params: { q, limit: 30 } });
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      setProducts((prev) => [...new Map([...prev, ...list].map((p) => [p.id, p])).values()]);
    } catch {
      /* ignore background search error */
    }
  }, []);

  // Load initial products and automatically open first row's ProductSearchInput like SaleInvoiceRetailForm
  useEffect(() => {
    if (permissionsLoading || !canCreate) return;
    let alive = true;
    (async () => {
      await refreshProducts("");
      if (!alive || focusedOnce.current) return;
      setTimeout(() => {
        if (alive && !focusedOnce.current && productRefs.current[0]) {
          productRefs.current[0].focus();
          focusedOnce.current = true;
        }
      }, 60);
    })();
    return () => {
      alive = false;
    };
  }, [permissionsLoading, canCreate, refreshProducts]);

  useEffect(() => {
    if (!pendingFocus || permissionsLoading || !canCreate) return;
    const { index, field } = pendingFocus;
    const timer = setTimeout(() => {
      if (field === "product") {
        productRefs.current[index]?.focus();
      } else {
        const input = fieldRefs.current[`${index}:${field}`];
        input?.focus({ preventScroll: true });
        input?.select?.();
      }
      scrollToItem(index);
      setPendingFocus(null);
    }, 30);
    return () => clearTimeout(timer);
  }, [pendingFocus, items.length, permissionsLoading, canCreate]);

  const addItem = useCallback(() => {
    if (inFlight.current) return;
    setItems((prev) => {
      setPendingFocus({ index: prev.length, field: "product" });
      return [...prev, newItem()];
    });
  }, []);

  const removeItem = (index) => {
    setItems((prev) => (prev.length <= 1 ? [newItem()] : prev.filter((_, i) => i !== index)));
  };

  const changeItem = (index, field, value) => {
    setItems((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  const navigateItem = (event, index, field) => {
    if (!["Enter", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    if (event.repeat) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Enter") {
      const nextField =
        field === "product"
          ? entryFields[0]
          : entryFields[entryFields.indexOf(field) + 1];
      if (nextField) {
        setPendingFocus({ index, field: nextField });
      } else if (index < items.length - 1) {
        setPendingFocus({ index: index + 1, field: "product" });
      } else {
        addItem();
      }
    } else if (event.key === "ArrowUp" && index > 0) {
      setPendingFocus({ index: index - 1, field });
    } else if (event.key === "ArrowDown") {
      if (index < items.length - 1) {
        setPendingFocus({ index: index + 1, field });
      } else {
        addItem();
      }
    }
  };

  const save = useCallback(async () => {
    if (inFlight.current || saving) return;

    const filledRows = items.filter((r) => r.product_id || (r.notes && r.notes.trim()));
    if (filledRows.length === 0) {
      toast.error("Please select at least one product.");
      setPendingFocus({ index: 0, field: "product" });
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      const isBlankRow = !row.product_id && !(row.notes && row.notes.trim());
      if (isBlankRow && filledRows.length > 0) continue;

      if (!row.product_id) {
        toast.error(`Row ${i + 1}: Please select a product.`);
        setPendingFocus({ index: i, field: "product" });
        return;
      }
      const qty = Number(row.requested_quantity);
      if (!Number.isInteger(qty) || qty < 1) {
        toast.error(`Row ${i + 1}: Enter a whole requested quantity of at least 1.`);
        setPendingFocus({ index: i, field: "requested_quantity" });
        return;
      }
    }

    const validRows = items.filter((r) => r.product_id);
    inFlight.current = true;
    setSaving(true);
    try {
      const payloadItems = validRows.map((row) => ({
        product_id: row.product_id,
        requested_quantity: Number(row.requested_quantity) || 1,
        notes: row.notes?.trim() || null,
        ...(customer?.id ? { customer_id: customer.id } : {}),
      }));

      await axios.post("/api/user-demands", {
        customer_id: customer?.id || null,
        items: payloadItems,
      });

      toast.success(
        payloadItems.length === 1
          ? "User demand created!"
          : `${payloadItems.length} user demands created!`
      );
      window.dispatchEvent(new CustomEvent("notifications-changed"));
      navigate("/user-demands");
    } catch (err) {
      const d = err?.response?.data;
      const msg =
        d?.message ||
        (d?.errors ? Object.values(d.errors).flat().join(" ") : "Unable to save user demands.");
      toast.error(msg);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }, [items, customer, saving, navigate]);

  useEffect(() => {
    if (!canCreate) return;
    const onShortcut = (event) => {
      const hasCtrl = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
      const key = (event.key || "").toLowerCase();
      if (hasCtrl && (key === "s" || event.key === "Enter")) {
        event.preventDefault();
        if (!customerSearchOpen && !inFlight.current) save();
      } else if (hasCtrl && key === "b") {
        event.preventDefault();
        navigate("/user-demands");
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [canCreate, customerSearchOpen, save, navigate]);

  if (permissionsLoading) {
    return <div className="p-6">Loading permissions…</div>;
  }
  if (!canCreate) {
    return <div className="p-6 text-sm text-gray-700">You don't have permission to create user demands.</div>;
  }

  const selectedCount = items.filter((r) => r.product_id).length;
  const totalUnits = items.reduce(
    (sum, r) => sum + (r.product_id ? Number(r.requested_quantity || 0) : 0),
    0
  );

  return (
    <div className="purchase-entry-page space-y-4 purchase-order-documents">
      <div className="purchase-entry g-card overflow-hidden space-y-4 purchase-order-entry">
        {/* Header */}
        <div className="purchase-entry-header purchase-entry-banner flex flex-wrap justify-between gap-3 items-center px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="purchase-entry-icon p-2.5 rounded-xl">
              <HandRaisedIcon className="h-6 w-6" />
            </div>
            <h1 className="purchase-entry-title text-xl font-semibold">Request Products</h1>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Link
              to="/user-demands"
              title="Back to User Demands (Ctrl+B)"
              className="g-btn-ghost theme-btn-tertiary inline-flex items-center justify-center gap-2"
            >
              All Demands
            </Link>
          </div>
        </div>

        {/* Top Details Bar */}
        <div className="purchase-entry-details grid grid-cols-1 sm:grid-cols-3 gap-3 px-3 py-2.5 items-end">
          <label className="sm:col-span-1">
            Customer (optional)
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5">
              <button
                type="button"
                disabled={saving}
                onClick={() => setCustomerSearchOpen(true)}
                aria-label={customer ? `Customer: ${customer.name}` : "Select customer"}
                className="w-full h-8 border rounded-md px-2 text-xs text-left flex items-center gap-2 disabled:opacity-70"
              >
                <UserIcon aria-hidden="true" className="w-4 h-4 shrink-0" />
                <span className="truncate">{customer?.name || "Click to search customer…"}</span>
              </button>
              {customer && (
                <button
                  type="button"
                  onClick={() => setCustomer(null)}
                  className="h-8 px-2 text-xs font-semibold text-red-500 hover:underline shrink-0"
                >
                  Clear
                </button>
              )}
            </div>
          </label>
          <div className="sm:col-span-2 flex items-center">
            <p className="text-xs text-[var(--workspace-muted)]">
              Enter: next field / new row · ↑↓: move between rows (↓ on last row adds a new row) · Ctrl+S: save.
            </p>
          </div>
        </div>

        {/* Single-line sleek items table */}
        <div
          ref={itemsContainerRef}
          className="purchase-entry-items purchase-order-form-items px-1 py-2"
        >
          <table className="purchase-order-form-table w-full border-collapse text-[11px]">
            <colgroup>
              {[4, 4, 28, 14, 14, 7, 7, 8, 10, 4].map((width, index) => (
                <col key={index} style={{ width: `${width}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th aria-label="Remove item" />
                <th>#</th>
                <th className="text-left">Product</th>
                <th className="text-left">Brand</th>
                <th className="text-left">Supplier</th>
                <th>Pack Size</th>
                <th>Stock Qty</th>
                <th>Demand Qty *</th>
                <th className="text-left">Notes</th>
                <th className="text-center">+</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => (
                <tr
                  key={i}
                  ref={(ref) => {
                    itemRowRefs.current[i] = ref;
                  }}
                  onFocusCapture={(event) => {
                    if (event.currentTarget.contains(event.target)) scrollToItem(i);
                  }}
                >
                  <td data-label="Remove" className="text-center">
                    <button
                      type="button"
                      className="products-row-action products-row-delete"
                      title="Remove row"
                      aria-label={`Remove row ${i + 1}`}
                      onClick={() => removeItem(i)}
                    >
                      <TrashIcon className="h-4 w-4 text-red-500" />
                    </button>
                  </td>
                  <td data-label="#" className="text-center tabular-nums opacity-70">
                    {i + 1}
                  </td>
                  <td
                    data-label="Product"
                    className="text-left min-w-0"
                    onKeyDownCapture={(event) => {
                      if (
                        event.target.matches(".product-search-trigger input") &&
                        (event.key === "ArrowUp" ||
                          event.key === "ArrowDown" ||
                          (event.key === "Enter" && row.product_id))
                      ) {
                        navigateItem(event, i, "product");
                      }
                    }}
                  >
                    <ProductSearchInput
                      ref={(ref) => {
                        productRefs.current[i] = ref;
                      }}
                      value={row.product || row.product_id}
                      products={products}
                      onRefreshProducts={refreshProducts}
                      onChange={(product) => {
                        setItems((prev) =>
                          prev.map((r, idx) =>
                            idx === i
                              ? {
                                  ...r,
                                  product_id: product.id,
                                  product,
                                }
                              : r
                          )
                        );
                        setPendingFocus({ index: i, field: "requested_quantity" });
                      }}
                    />
                  </td>
                  <td data-label="Brand" className="text-left break-words">
                    {row.product?.brand?.name || row.product?.brand_name || "—"}
                  </td>
                  <td data-label="Supplier" className="text-left break-words">
                    {row.product?.supplier?.name || row.product?.supplier_name || "—"}
                  </td>
                  <td data-label="Pack Size" className="text-right tabular-nums">
                    {row.product?.pack_size ?? "—"}
                  </td>
                  <td data-label="Stock Qty" className="text-right tabular-nums">
                    {row.product?.quantity ?? "—"}
                  </td>
                  <td data-label="Demand Qty">
                    <input
                      ref={(ref) => {
                        fieldRefs.current[`${i}:requested_quantity`] = ref;
                      }}
                      aria-label={`Requested quantity row ${i + 1}`}
                      type="number"
                      min={1}
                      step={1}
                      value={row.requested_quantity}
                      onChange={(e) => changeItem(i, "requested_quantity", e.target.value)}
                      onKeyDown={(event) => navigateItem(event, i, "requested_quantity")}
                      className="w-full min-w-0 h-7 rounded-md border px-1 text-right text-xs tabular-nums"
                    />
                  </td>
                  <td data-label="Notes">
                    <input
                      ref={(ref) => {
                        fieldRefs.current[`${i}:notes`] = ref;
                      }}
                      aria-label={`Notes row ${i + 1}`}
                      type="text"
                      placeholder="Optional note…"
                      value={row.notes}
                      onChange={(e) => changeItem(i, "notes", e.target.value)}
                      onKeyDown={(event) => navigateItem(event, i, "notes")}
                      className="w-full min-w-0 h-7 rounded-md border px-1.5 text-left text-xs"
                    />
                  </td>
                  <td data-label="Add item" className="text-center">
                    <button
                      type="button"
                      onClick={addItem}
                      className="products-row-action stock-adjustment-add"
                      aria-label={`Add item after row ${i + 1}`}
                      title="Add row"
                    >
                      <PlusIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="purchase-entry-footer flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="text-xs">
            <p className="font-semibold text-sm">
              {selectedCount} products · {totalUnits} total units
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="g-btn-primary theme-btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? "Saving Demands…" : "Save User Demands (Ctrl+S)"}
          </button>
        </div>

        <CustomerSearch
          isOpen={customerSearchOpen}
          onClose={() => setCustomerSearchOpen(false)}
          onSelect={(cust) => {
            setCustomer(cust || null);
            setCustomerSearchOpen(false);
          }}
          onCreate={(cust) => {
            setCustomer(cust || null);
            setCustomerSearchOpen(false);
          }}
        />
      </div>
    </div>
  );
}
