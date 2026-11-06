// src/pages/users/UserForm.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useTheme } from "@/context/ThemeContext";
import {
  UserCircleIcon,
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

export default function UserForm({ onSubmit, initial, submitting }) {
  const { theme } = useTheme();
  const primaryColor = theme?.primary_color || '#3b82f6';
  const primaryTextColor = getContrastText(primaryColor);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    status: "active",
    roles: [],
    permissions: [],
  });

  const [roleOptions, setRoleOptions] = useState([]);
  const [permissionOptions, setPermissionOptions] = useState([]);
  const formRef = useRef(null);

  // helpers
  const norm = (s) => (s == null ? "" : String(s).trim());
  const asArray = (x) =>
    Array.isArray(x) ? x : x && typeof x === "object" ? Object.values(x) : [];

  // ---- Load roles + permissions
  useEffect(() => {
    (async () => {
      const [rRes, pRes] = await Promise.allSettled([
        axios.get("/api/roles", { params: { per_page: 1000 } }),
        axios.get("/api/permissions"),
      ]);

      const r = rRes.status === "fulfilled" ? rRes.value : null;
      const p = pRes.status === "fulfilled" ? pRes.value : null;

      const roleNames = (Array.isArray(r?.data?.data) ? r.data.data : asArray(r?.data))
        .map((x) => (typeof x === "string" ? x : x?.name))
        .filter(Boolean);

      const permNames = (Array.isArray(p?.data?.data) ? p.data.data : asArray(p?.data))
        .map((x) => (typeof x === "string" ? x : x?.name))
        .filter(Boolean);

      setRoleOptions([...new Set(roleNames)].sort());
      setPermissionOptions([...new Set(permNames)]);
    })();
  }, []);

  // ---- Apply initial (edit mode)
  useEffect(() => {
    if (initial) {
      setForm({
        name: norm(initial.name),
        email: norm(initial.email),
        password: "",
        status: norm(initial.status || "active"),
        roles: asArray(initial.roles)
          .map((r) => (typeof r === "string" ? r : r?.name))
          .filter(Boolean),
        permissions: asArray(initial.permissions)
          .map((p) => (typeof p === "string" ? p : p?.name))
          .filter(Boolean),
      });
    }
  }, [initial]);

  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    onSubmit({
      ...form,
      name: norm(form.name),
      email: norm(form.email),
      status: norm(form.status || "active"),
      roles: Array.from(new Set(form.roles)),
      permissions: Array.from(new Set(form.permissions)),
    });
  };

  // Ctrl+S
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key || "").toLowerCase() === "s") {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const toggleStrInArray = (key, value) => {
    setForm((s) => {
      const setVals = new Set(s[key]);
      setVals.has(value) ? setVals.delete(value) : setVals.add(value);
      return { ...s, [key]: Array.from(setVals) };
    });
  };

  // ===== Permission grouping & ordering =====
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
    // friendly headings
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
    // Fallback: Title Case + hyphen to space
    return m
      .split("-")
      .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
      .join(" ");
  };

  // Build: { moduleKey: { label, actions: [{action, perm}] } }
  const groupedPerms = useMemo(() => {
    const groups = {};
    for (const full of permissionOptions) {
      // expected "module.action" format, but keep custom singles too
      if (typeof full !== "string" || !full) continue;
      const parts = full.split(".");
      const isReportSubmodule = parts[0] === "report" && parts.length >= 3;
      const module = isReportSubmodule
        ? `report.${parts[1]}`
        : parts.length > 1
        ? parts[0]
        : full; // "user.manage" => module "user"
      const action = isReportSubmodule
        ? parts.slice(2).join(".")
        : parts.length > 1
        ? parts.slice(1).join(".")
        : ""; // manage / assign.roles etc.

      const key = module;
      if (!groups[key]) {
        groups[key] = { label: titleizeModule(key), map: new Map() };
      }
      groups[key].map.set(action || full, full); // action->perm
    }

    // Convert map to ordered arrays
    const out = [];
    Object.keys(groups)
      .sort((a, b) => groups[a].label.localeCompare(groups[b].label))
      .forEach((k) => {
        const availableActions = Array.from(groups[k].map.keys());
        const ordered = [
          // first those in ACTION_ORDER
          ...ACTION_ORDER.filter((a) => availableActions.includes(a)),
          // then any extra/custom actions
          ...availableActions.filter((a) => !ACTION_ORDER.includes(a)),
        ];
        out.push({
          module: k,
          label: groups[k].label,
          actions: ordered.map((a) => ({ action: a, perm: groups[k].map.get(a) })),
        });
      });
    return out;
  }, [permissionOptions]);

  const moduleAllSelected = (moduleKey) => {
    const gp = groupedPerms.find((g) => g.module === moduleKey);
    if (!gp) return false;
    return gp.actions.every((a) => form.permissions.includes(a.perm));
  };

  const toggleModuleAll = (moduleKey, checked) => {
    setForm((s) => {
      const gp = groupedPerms.find((g) => g.module === moduleKey);
      if (!gp) return s;
      const current = new Set(s.permissions);
      if (checked) {
        gp.actions.forEach((a) => current.add(a.perm));
      } else {
        gp.actions.forEach((a) => current.delete(a.perm));
      }
      return { ...s, permissions: Array.from(current) };
    });
  };

  const selectAllPermissions = () =>
    setForm((s) => ({ ...s, permissions: Array.from(new Set(permissionOptions)) }));
  const clearAllPermissions = () => setForm((s) => ({ ...s, permissions: [] }));

  return (
    <div className="people-form-page">
      <div className="products-panel">
        {/* Header */}
        <div className="people-form-heading">
          <div className="flex items-center gap-3 min-w-0">
            <div className="products-identity-icon">
              <UserCircleIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="products-title">{initial ? "Edit User" : "Create User"}</h1>
              <p className="products-subtitle">
                <ShieldCheckIcon className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {form.roles.length} roles · {form.permissions.length} direct permissions
                </span>
              </p>
            </div>
          </div>

          <span className="people-shortcut">Ctrl+S to save</span>
        </div>

        <form ref={formRef} onSubmit={submit} className="people-form">
          {/* Identity */}
          <div className="people-fields people-fields-3">
            <div className="people-field">
              <label className="people-label" htmlFor="user-name">Name</label>
              <input
                id="user-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                required
                placeholder="Full name"
              />
            </div>

            <div className="people-field">
              <label className="people-label" htmlFor="user-email">Email</label>
              <input
                id="user-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                required
                placeholder="user@example.com"
              />
            </div>

            <div className="people-field">
              <label className="people-label" htmlFor="user-password">
                Password
              </label>
              <input
                id="user-password"
                type="password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                placeholder={initial ? "••••••" : "Set a password"}
              />
              {initial && (
                <span className="people-hint">Leave blank to keep the current password.</span>
              )}
            </div>
          </div>

          {/* Status */}
          <div className="people-field">
            <span className="people-label">Status</span>
            <div className="people-check-group">
              {["active", "inactive"].map((s) => (
                <label key={s} className="people-check">
                  <input
                    type="radio"
                    name="status"
                    value={s}
                    checked={form.status === s}
                    onChange={() => set("status", s)}
                  />
                  <span className="capitalize">{s}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Roles */}
          <div className="people-field">
            <span className="people-label">Roles</span>
            {roleOptions.length === 0 ? (
              <p className="people-hint">No roles available.</p>
            ) : (
              <div className="people-check-group">
                {roleOptions.map((r) => (
                  <label key={r} className="people-check">
                    <input
                      type="checkbox"
                      checked={form.roles.includes(r)}
                      onChange={() => toggleStrInArray("roles", r)}
                    />
                    <span>{r}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Direct Permissions (Grouped) */}
          <div className="people-permissions">
            <div className="people-permissions-head">
              <span className="people-label">Direct Permissions</span>
              <div className="people-permissions-tools">
                <button
                  type="button"
                  onClick={selectAllPermissions}
                  className="products-action theme-btn-secondary"
                  title="Select all permissions"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={clearAllPermissions}
                  className="products-action theme-btn-tertiary"
                  title="Clear all permissions"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="people-permission-scroll">
              {groupedPerms.map((group) => (
                <div key={group.module} className="people-permission-group">
                  <div className="people-permission-head">
                    <span className="people-permission-title">{group.label} Permissions</span>
                    <label className="people-check">
                      <input
                        type="checkbox"
                        checked={moduleAllSelected(group.module)}
                        onChange={(e) => toggleModuleAll(group.module, e.target.checked)}
                      />
                      <span>{moduleAllSelected(group.module) ? "Clear All" : "Select All"}</span>
                    </label>
                  </div>

                  {/* Actions row, consistently ordered */}
                  <div className="people-permission-grid">
                    {group.actions.map(({ action, perm }) => (
                      <label
                        key={perm}
                        className="people-permission-option"
                        title={perm}
                      >
                        <input
                          type="checkbox"
                          checked={form.permissions.includes(perm)}
                          onChange={() => toggleStrInArray("permissions", perm)}
                        />
                        <span>{action ? action.replace(/\./g, " ") : perm}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              {/* Fallback when there are no permissions (still loading or empty) */}
              {groupedPerms.length === 0 && (
                <p className="people-hint">No permissions found.</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="people-actions">
            <span className="people-hint">
              Shortcut: <span className="people-shortcut">Ctrl+S</span> to save
            </span>
            <button
              type="submit"
              aria-keyshortcuts="Control+S"
              title="Save (Ctrl+S)"
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
