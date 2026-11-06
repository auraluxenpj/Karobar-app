// src/pages/roles/RoleForm.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { listAllPermissions } from "@/api/roles";
import { useTheme } from "@/context/ThemeContext";
import { GlassInput } from "@/components/Glass.jsx";
import {
  UserGroupIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/solid";

// Helper to determine text color based on background brightness
const getContrastText = (hexColor) => {
  hexColor = hexColor.replace('#', '');
  const r = parseInt(hexColor.substring(0, 2), 16);
  const g = parseInt(hexColor.substring(2, 4), 16);
  const b = parseInt(hexColor.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
};

export default function RoleForm({ onSubmit, initial, submitting }) {
  const { theme } = useTheme();
  const primaryColor = theme?.primary_color || '#3b82f6';
  const primaryTextColor = getContrastText(primaryColor);

  const [name, setName] = useState("");
  const [allPerms, setAllPerms] = useState([]);          // ["user.view", ...]
  const [loadingPerms, setLoadingPerms] = useState(true);
  const [selected, setSelected] = useState(new Set());   // Set<string>
  const [filter, setFilter] = useState("");
  const formRef = useRef(null);

  // -- helpers ---------------------------------------------------------------
  const asStringArray = (x) => {
    if (Array.isArray(x)) return x;
    if (x && typeof x === "object") return Object.values(x);
    return [];
  };
  const norm = (s) => (s == null ? "" : String(s)).trim();
  const normalizeList = (xs) =>
    asStringArray(xs)
      .map((v) => (typeof v === "string" ? norm(v) : norm(v?.name)))
      .filter(Boolean);

  // Consistent action ordering
  const ACTION_ORDER = [
    "view",
    "print",
    "create",
    "update",
    "edit",
    "delete",
    "import",
    "export",
    "generate",
    "cancel",
    "finalize",
    "dispose",
    "restore",
    "upload",
    "open",
    "transaction",
    "close",
    "transfer",
    "adjust",
    "credit-override",
    "discount-override",
    "expired-override",
    "sync.permissions",
    "assign.roles",
    "assign.permissions",
    "manage",
  ];

  const titleizeModule = (m) => {
    const map = {
      barcode: "Barcode Studio & Generator",
      "barcode-pos": "Barcode POS",
      "batch-expiry": "Batch Expiry & Tracking",
      "sale-invoice": "Sale Invoice",
      "purchase-invoice": "Purchase Invoice",
      "sale-return": "Sale Return Invoices",
      "purchase-return": "Purchase Return Invoices",
      "stock-adjustment": "Stock Adjustment",
      "stock-disposal": "Stock Disposal & Quarantine",
      stocktake: "Physical Stocktake",
      payment: "Payment Vouchers",
      account: "Financial Accounts",
      "cash-drawer": "Cash Drawer",
      expense: "Operating Expenses",
      backup: "Backups & Storage",
      "user-demands": "User Demands",
      report: "Reports",
      "report.cost-of-sale": "Report: Cost of Sale",
      "report.cost-of-sale-detail": "Report: Cost of Sale Detail",
      "report.net-profit": "Report: Net Profit (P&L)",
      "report.current-stock": "Report: Current Stock",
      "report.reorder": "Report: Low Stock & Reorder",
      "report.purchase-detail": "Report: Purchase Detail",
      "report.purchase-summary": "Report: Purchase Summary",
      "report.purchase-returns": "Report: Purchase Returns",
      "report.sale-detail": "Report: Sale Detail",
      "report.sale-returns": "Report: Sale Returns",
      "report.stock-adjustment": "Report: Stock Adjustment",
      "report.product-comprehensive": "Report: Product Comprehensive",
      "report.near-expiry-product": "Report: Near Expiry Product",
      "report.outstanding-aging": "Report: Outstanding & Aging",
      settings: "Settings",
      category: "Category",
      brand: "Brand",
      supplier: "Supplier",
      product: "Product",
      customer: "Customer",
      user: "Users",
      role: "Roles",
      permission: "Permissions Registry",
      "customer-ledger": "Customer Ledger",
      "supplier-ledger": "Supplier Ledger",
      "purchase-order": "Purchase Order Forecast",
      invoice: "Invoice (Legacy)",
    };
    if (map[m]) return map[m];
    if (m.startsWith("report.")) {
      const sub = m
        .slice("report.".length)
        .split("-")
        .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
        .join(" ");
      return `Report: ${sub}`;
    }
    return m
      .split("-")
      .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
      .join(" ");
  };

  // load available permissions (once)
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingPerms(true);
      try {
        const { data } = await listAllPermissions();
        if (!alive) return;
        const payload = Array.isArray(data?.data) ? data.data : data;
        setAllPerms(normalizeList(payload));
      } catch (e) {
        console.error(e);
        if (alive) setAllPerms([]);
      } finally {
        if (alive) setLoadingPerms(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // apply initial when editing
  useEffect(() => {
    if (!initial) return;
    setName(norm(initial.name));
    const perms = normalizeList(initial.permissions);
    setSelected(new Set(perms));
  }, [initial]);

  const toggle = (perm, checked) => {
    const p = norm(perm);
    setSelected((prev) => {
      const copy = new Set(prev);
      checked ? copy.add(p) : copy.delete(p);
      return copy;
    });
  };

  const submit = (e) => {
    e.preventDefault();
    onSubmit({
      name: norm(name),
      permissions: Array.from(selected),
    });
  };

  // Alt+S => submit
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.altKey && (e.key || "").toLowerCase() === "s") {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ===== Group permissions by module with ordered actions =====
  const rawGroups = useMemo(() => {
    const groups = {};
    for (const full of allPerms) {
      if (typeof full !== "string" || !full) continue;
      const parts = full.split(".");
      const isReportSubmodule = parts[0] === "report" && parts.length >= 3;
      const module = isReportSubmodule
        ? `report.${parts[1]}`
        : parts.length > 1
        ? parts[0]
        : full;
      const action = isReportSubmodule
        ? parts.slice(2).join(".")
        : parts.length > 1
        ? parts.slice(1).join(".")
        : ""; // for custom singles / manage
      if (!groups[module]) groups[module] = new Map(); // action -> perm
      groups[module].set(action || full, full);
    }
    // Convert to array with display label and ordered actions
    const out = [];
    Object.keys(groups)
      .sort((a, b) => titleizeModule(a).localeCompare(titleizeModule(b)))
      .forEach((module) => {
        const availableActions = Array.from(groups[module].keys());
        const ordered = [
          ...ACTION_ORDER.filter((a) => availableActions.includes(a)),
          ...availableActions.filter((a) => !ACTION_ORDER.includes(a)),
        ];
        out.push({
          module,
          label: titleizeModule(module),
          actions: ordered.map((a) => ({ action: a, perm: groups[module].get(a) })),
        });
      });
    return out;
  }, [allPerms]);

  // Text filter applies to action label or full perm string
  const groupedFiltered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return rawGroups;
    return rawGroups
      .map((g) => {
        const actions = g.actions.filter(({ action, perm }) => {
          const label = (action || perm).toLowerCase().replace(/\./g, " ");
          return (
            label.includes(f) ||
            perm.toLowerCase().includes(f) ||
            g.label.toLowerCase().includes(f)
          );
        });
        return { ...g, actions };
      })
      .filter((g) => g.actions.length > 0);
  }, [rawGroups, filter]);

  // Global select/clear for CURRENT filtered modules/actions
  const allFilteredPerms = useMemo(
    () => groupedFiltered.flatMap((g) => g.actions.map((a) => a.perm)),
    [groupedFiltered]
  );

  const allChecked =
    allFilteredPerms.length > 0 &&
    allFilteredPerms.every((p) => selected.has(p));
  const someChecked =
    allFilteredPerms.some((p) => selected.has(p)) && !allChecked;

  const toggleFiltered = (checked) => {
    setSelected((prev) => {
      const copy = new Set(prev);
      allFilteredPerms.forEach((p) => (checked ? copy.add(p) : copy.delete(p)));
      return copy;
    });
  };

  // Per-module helpers
  const moduleAllSelected = (group) =>
    group.actions.length > 0 &&
    group.actions.every(({ perm }) => selected.has(perm));

  const moduleSomeSelected = (group) =>
    group.actions.some(({ perm }) => selected.has(perm)) &&
    !moduleAllSelected(group);

  const toggleModuleAll = (group, checked) => {
    setSelected((prev) => {
      const copy = new Set(prev);
      group.actions.forEach(({ perm }) =>
        checked ? copy.add(perm) : copy.delete(perm)
      );
      return copy;
    });
  };

  const selectAllPermissions = () =>
    setSelected(new Set(allPerms));
  const clearAllPermissions = () => setSelected(new Set());

  return (
    <div className="people-form-page">
      <div className="products-panel">
        {/* Header */}
        <div className="people-form-heading">
          <div className="flex items-center gap-3 min-w-0">
            <div className="products-identity-icon">
              <UserGroupIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="products-title">{initial ? "Edit Role" : "Create Role"}</h1>
              <p className="products-subtitle">
                <ShieldCheckIcon className="w-3.5 h-3.5 shrink-0" />
                <span>{selected.size} permissions selected</span>
              </p>
            </div>
          </div>

          <span className="people-shortcut">Alt+S to save</span>
        </div>

        <form ref={formRef} onSubmit={submit} className="people-form">
          {/* Role name */}
          <div className="people-fields">
            <div className="people-field">
              <label className="people-label" htmlFor="role-name">Role Name</label>
              <input
                id="role-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. Manager"
              />
            </div>
          </div>

          {/* Permissions */}
          <div className="people-permissions">
            <div className="people-permissions-head">
              <span className="people-label">Permissions</span>
              <div className="people-permissions-tools">
                <GlassInput
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter permissions…"
                  aria-label="Filter permissions"
                />
                <button
                  type="button"
                  onClick={selectAllPermissions}
                  className="products-action theme-btn-secondary"
                  title="Select all (every permission)"
                >
                  Select all (all)
                </button>
                <button
                  type="button"
                  onClick={clearAllPermissions}
                  className="products-action theme-btn-tertiary"
                  title="Clear all"
                >
                  Clear all
                </button>
              </div>
            </div>

            {/* Global select for the filtered list */}
            <div>
              <label className="people-check">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked;
                  }}
                  onChange={(e) => toggleFiltered(e.target.checked)}
                />
                <span>Select all (filtered)</span>
              </label>
            </div>

            {/* Grouped modules */}
            <div className="people-permission-scroll">
              {groupedFiltered.map((group) => (
                <div key={group.module} className="people-permission-group">
                  <div className="people-permission-head">
                    <span className="people-permission-title">{group.label} Permissions</span>
                    <label className="people-check">
                      <input
                        type="checkbox"
                        checked={moduleAllSelected(group)}
                        ref={(el) => {
                          if (el) el.indeterminate = moduleSomeSelected(group);
                        }}
                        onChange={(e) => toggleModuleAll(group, e.target.checked)}
                      />
                      <span>
                        {moduleAllSelected(group) ? "Clear All" : "Select All"}
                      </span>
                    </label>
                  </div>

                  <div className="people-permission-grid">
                    {group.actions.map(({ action, perm }) => (
                      <label
                        key={perm}
                        className="people-permission-option"
                        title={perm}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(perm)}
                          onChange={(e) => toggle(perm, e.target.checked)}
                        />
                        <span>{(action || perm).replace(/\./g, " ")}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              {loadingPerms && (
                <p className="people-hint">Loading permissions…</p>
              )}

              {!loadingPerms && groupedFiltered.length === 0 && (
                <p className="people-hint">No permissions match the filter.</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="people-actions">
            <span className="people-hint">
              Shortcut: <span className="people-shortcut">Alt+S</span> to save
            </span>
            <button
              type="submit"
              aria-keyshortcuts="Alt+S"
              title="Save (Alt+S)"
              className="products-action products-action-primary theme-btn-primary"
              disabled={submitting}
            >
              <CheckCircleIcon className="w-4 h-4" />
              <span>{submitting ? "Saving…" : "Save"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
