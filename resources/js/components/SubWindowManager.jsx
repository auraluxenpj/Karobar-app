import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";

export const ERP_TOP_MENU_SECTIONS = [
  {
    id: "items-masters",
    label: "Items & Masters",
    items: [
      { label: "Products", path: "/products" },
      { label: "Add Product", path: "/products/create" },
      { label: "Product Batches", path: "/product-batches" },
      { label: "Categories", path: "/categories" },
      { label: "Brands", path: "/brands" },
      { label: "Add Brand", path: "/brands/create" },
      { label: "Suppliers", path: "/suppliers" },
      { label: "Add Supplier", path: "/suppliers/create" },
      { label: "Customers", path: "/customers" },
      { label: "Add Customer", path: "/customers/create" },
      { label: "Barcode Studio", path: "/barcode-labels" },
    ],
  },
  {
    id: "invoices-pos",
    label: "Invoices & POS",
    items: [
      { label: "Barcode POS Terminal", path: "/sale-invoices/pos" },
      { label: "Sale Invoices", path: "/sale-invoices" },
      { label: "Create Retail Sale", path: "/sale-invoices/create/retail" },
      { label: "Wholesale Invoices", path: "/wholesale-invoices" },
      { label: "Create Wholesale Sale", path: "/sale-invoices/create/wholesale" },
      { label: "Purchase Invoices", path: "/purchase-invoices" },
      { label: "Create Purchase Invoice", path: "/purchase-invoices/create" },
      { label: "Purchase Orders", path: "/purchase-orders" },
      { label: "Create Purchase Order", path: "/purchase-orders/create" },
      { label: "Smart Reorder Forecast", path: "/smart-reorder" },
    ],
  },
  {
    id: "returns",
    label: "Returns",
    items: [
      { label: "Sale Returns", path: "/sale-returns" },
      { label: "Create Sale Return", path: "/sale-returns/create" },
      { label: "Purchase Returns", path: "/purchase-returns" },
      { label: "Create Purchase Return", path: "/purchase-returns/create" },
    ],
  },
  {
    id: "stock-inventory",
    label: "Stock & Inventory",
    items: [
      { label: "Batch & Expiry", path: "/batch-expiry" },
      { label: "User Demands", path: "/user-demands" },
      { label: "Request Product", path: "/user-demands/create" },
      { label: "Stock Adjustments", path: "/stock-adjustments" },
      { label: "Add Stock Adjustment", path: "/stock-adjustments/create" },
      { label: "Stocktake Sessions", path: "/stocktake-sessions" },
      { label: "New Stocktake Session", path: "/stocktake-sessions/create" },
      { label: "Quarantine & Disposal", path: "/stock-disposals" },
      { label: "New Disposal", path: "/stock-disposals/create" },
    ],
  },
  {
    id: "finance-ledgers",
    label: "Finance & Ledgers",
    items: [
      { label: "Customer Ledger", path: "/customer-ledger" },
      { label: "Supplier Ledger", path: "/supplier-ledger" },
      { label: "Payment Vouchers", path: "/payments" },
      { label: "Cash Drawer", path: "/cash-drawer" },
      { label: "Financial Accounts", path: "/accounts" },
      { label: "Operating Expenses", path: "/expenses" },
      { label: "Double-Entry & GL", path: "/accounting" },
      { label: "HR, Payroll & Commissions", path: "/hr-payroll" },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    items: [
      { label: "Net Profit (P&L)", path: "/reports/net-profit" },
      { label: "Statutory Tax Return", path: "/reports/tax-return" },
      { label: "Cost of Sale", path: "/reports/cost-of-sale" },
      { label: "Cost of Sale Detail", path: "/reports/cost-of-sale-detail" },
      { label: "Outstanding Aging", path: "/reports/outstanding-aging" },
      { label: "Sale Detail", path: "/reports/sale-detail" },
      { label: "Purchase Detail", path: "/reports/purchase-detail" },
      { label: "Purchase Summary", path: "/reports/purchase-summary" },
      { label: "Sale Returns Report", path: "/reports/sale-returns" },
      { label: "Purchase Returns Report", path: "/reports/purchase-returns" },
      { label: "Current Stock", path: "/reports/current-stock" },
      { label: "Low Stock & Reorder", path: "/reports/reorder" },
      { label: "Product Comprehensive", path: "/reports/product-comprehensive" },
      { label: "Near Expiry Product", path: "/reports/near-expiry-product" },
      { label: "Stock Adjustment Report", path: "/reports/stock-adjustment" },
    ],
  },
  {
    id: "system-settings",
    label: "System & Settings",
    items: [
      { label: "Settings", path: "/settings" },
      { label: "Users", path: "/users" },
      { label: "Add User", path: "/users/create" },
      { label: "Roles", path: "/roles" },
      { label: "Create Role", path: "/roles/create" },
      { label: "Backups & Storage", path: "/backups" },
      { label: "Setup Genie Wizard", path: "/setup" },
      { label: "License Activation", path: "/license-activation" },
    ],
  },
];

const FLAT_ROUTE_ITEMS = [
  { label: "Dashboard", path: "/dashboard" },
  ...ERP_TOP_MENU_SECTIONS.flatMap((s) => s.items),
];

export function resolveTitleForPath(routePath, fallback = "Workspace Window") {
  if (!routePath) return fallback;
  const clean = routePath.split("?")[0];
  const found = FLAT_ROUTE_ITEMS.find((item) => item.path === clean);
  if (found) return found.label;
  return fallback;
}

export function dispatchOpenSubWindow(path, title) {
  window.dispatchEvent(
    new CustomEvent("karobar:open-subwindow", {
      detail: {
        path,
        title: title || resolveTitleForPath(path),
      },
    })
  );
}

export function TopNativeMenuBar({
  currentPath,
  currentTitle,
  subWindowsCount,
  defaultSubWindowMode,
  setDefaultSubWindowMode,
  onOpenSubWindow,
  onTileWindows,
  onGridWindows,
  onCascadeWindows,
  onMinimizeAll,
  onRestoreAll,
  onCloseAll,
  onOpenSalePurchaseSplit,
}) {
  const navigate = useNavigate();
  const [openMenuId, setOpenMenuId] = useState(null);
  const menuBarRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleMenuItemClick = (item, forceSubWindow = false) => {
    setOpenMenuId(null);
    if (forceSubWindow || defaultSubWindowMode) {
      onOpenSubWindow(item.path, item.label);
    } else {
      navigate(item.path);
    }
  };

  return (
    <div
      ref={menuBarRef}
      className="relative z-[90] flex flex-wrap items-center justify-between gap-1 border-b border-slate-300/90 dark:border-slate-700/90 bg-gradient-to-b from-slate-100 to-slate-200/90 dark:from-slate-900 dark:to-slate-800/95 px-2.5 py-1 text-xs select-none shadow-xs"
    >
      {/* Left: Classic Windows Top Menu Categories */}
      <div className="flex flex-wrap items-center gap-0.5">
        <button
          type="button"
          onClick={() => {
            setOpenMenuId(null);
            if (defaultSubWindowMode) {
              onOpenSubWindow("/dashboard", "Dashboard");
            } else {
              navigate("/dashboard");
            }
          }}
          className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-semibold text-slate-700 dark:text-slate-200 hover:bg-blue-600 hover:text-white transition-colors"
          title="Go to Dashboard (Alt+D)"
        >
          <span>🏠</span>
          <span>Dashboard</span>
        </button>

        {ERP_TOP_MENU_SECTIONS.map((section) => {
          const isOpen = openMenuId === section.id;
          return (
            <div key={section.id} className="relative">
              <button
                type="button"
                onClick={() => setOpenMenuId(isOpen ? null : section.id)}
                onMouseEnter={() => {
                  if (openMenuId !== null) setOpenMenuId(section.id);
                }}
                className={`inline-flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors ${
                  isOpen
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-700 dark:text-slate-200 hover:bg-slate-300/70 dark:hover:bg-slate-700/70"
                }`}
              >
                <span>{section.label}</span>
                <span className="text-[9px] opacity-75">▾</span>
              </button>

              {isOpen && (
                <div className="absolute left-0 top-full mt-0.5 w-68 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 py-1.5 shadow-2xl z-[120]">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 mb-1 flex items-center justify-between">
                    <span>{section.label}</span>
                    <span>Click / ⧉ Sub-Window</span>
                  </div>
                  {section.items.map((item) => {
                    const isActive = currentPath === item.path;
                    return (
                      <div
                        key={item.path + item.label}
                        className="group flex items-center justify-between px-1.5 py-0.5 hover:bg-blue-50 dark:hover:bg-slate-800/80"
                      >
                        <button
                          type="button"
                          onClick={() => handleMenuItemClick(item, false)}
                          className={`flex-1 text-left px-2 py-1.5 rounded text-xs font-medium transition-colors flex items-center justify-between ${
                            isActive
                              ? "text-blue-600 dark:text-blue-400 font-semibold"
                              : "text-slate-700 dark:text-slate-200"
                          }`}
                        >
                          <span>{item.label}</span>
                          {defaultSubWindowMode && (
                            <span className="text-[10px] text-blue-600 dark:text-blue-400">
                              ⧉ Sub
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMenuItemClick(item, true)}
                          title={`Open "${item.label}" in a floating Sub-Window inside Main Window`}
                          className="ml-1 inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50/80 dark:bg-blue-950/60 hover:bg-blue-600 hover:text-white transition-colors"
                        >
                          <span>⧉</span>
                          <span>Sub-Win</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Sub-Windows (MDI) Dropdown Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() =>
              setOpenMenuId(openMenuId === "mdi-window-menu" ? null : "mdi-window-menu")
            }
            onMouseEnter={() => {
              if (openMenuId !== null) setOpenMenuId("mdi-window-menu");
            }}
            className={`inline-flex items-center gap-1 rounded px-2.5 py-1 font-semibold transition-colors ${
              openMenuId === "mdi-window-menu"
                ? "bg-indigo-600 text-white"
                : "text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100/80 dark:hover:bg-indigo-950/60"
            }`}
          >
            <span>🪟 Windows ({subWindowsCount})</span>
            <span className="text-[9px] opacity-75">▾</span>
          </button>

          {openMenuId === "mdi-window-menu" && (
            <div className="absolute left-0 top-full mt-0.5 w-72 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 py-1.5 shadow-2xl z-[120]">
              <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800">
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Open Menu Clicks in Sub-Window
                  </span>
                  <input
                    type="checkbox"
                    checked={defaultSubWindowMode}
                    onChange={(e) => setDefaultSubWindowMode(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </label>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  When enabled, clicking any top menu item opens it inside a floating sub-window.
                </p>
              </div>

              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenuId(null);
                    onOpenSubWindow(currentPath || "/dashboard", currentTitle || "Workspace");
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800 flex items-center justify-between"
                >
                  <span>+ Open Current Page in Sub-Window</span>
                  <span className="text-[10px] text-slate-400">Ctrl+Shift+N</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenuId(null);
                    onOpenSalePurchaseSplit();
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-slate-800 flex items-center justify-between"
                >
                  <span>⚡ Open Sale + Purchase Split View</span>
                  <span className="text-[10px] text-indigo-400">Dual Window</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenuId(null);
                    onOpenSubWindow("/sale-invoices/pos", "Barcode POS");
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800"
                >
                  + New Barcode POS Sub-Window
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenuId(null);
                    onOpenSubWindow("/sale-invoices/create/retail", "Create Retail Sale");
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800"
                >
                  + New Retail Sale Sub-Window
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenuId(null);
                    onOpenSubWindow("/purchase-invoices/create", "Create Purchase Invoice");
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800"
                >
                  + New Purchase Invoice Sub-Window
                </button>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenuId(null);
                    onTileWindows();
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800"
                >
                  ◫ Tile Sub-Windows Side-by-Side (2 Columns)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenuId(null);
                    onGridWindows();
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800"
                >
                  ⊞ Grid Sub-Windows (2x2 Quad Layout)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenuId(null);
                    onCascadeWindows();
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800"
                >
                  ❐ Cascade Sub-Windows
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenuId(null);
                    onMinimizeAll();
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800"
                >
                  ─ Minimize All Sub-Windows
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenuId(null);
                    onRestoreAll();
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800"
                >
                  □ Restore All Sub-Windows
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenuId(null);
                    onCloseAll();
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  ✕ Close All Sub-Windows
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: Quick Sub-Window Action Pills */}
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => onOpenSubWindow("/sale-invoices/create/retail", "Retail Sale Invoice")}
          className="inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-0.5 text-[11px] font-semibold shadow-2xs transition-colors"
          title="Open Retail Sale Invoice in a floating Sub-Window"
        >
          <span>+ Sale Win</span>
        </button>
        <button
          type="button"
          onClick={() => onOpenSubWindow("/purchase-invoices/create", "Purchase Invoice")}
          className="inline-flex items-center gap-1 rounded bg-blue-600 hover:bg-blue-700 text-white px-2 py-0.5 text-[11px] font-semibold shadow-2xs transition-colors"
          title="Open Purchase Invoice in a floating Sub-Window"
        >
          <span>+ Purchase Win</span>
        </button>
        <button
          type="button"
          onClick={() => onOpenSubWindow("/sale-invoices/pos", "Barcode POS")}
          className="inline-flex items-center gap-1 rounded bg-violet-600 hover:bg-violet-700 text-white px-2 py-0.5 text-[11px] font-semibold shadow-2xs transition-colors"
          title="Open Barcode POS Terminal in a floating Sub-Window"
        >
          <span>+ POS Win</span>
        </button>
        <button
          type="button"
          onClick={onOpenSalePurchaseSplit}
          className="inline-flex items-center gap-1 rounded border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-600 hover:text-white text-indigo-700 dark:text-indigo-200 px-2 py-0.5 text-[11px] font-semibold transition-colors"
          title="Open Retail Sale and Purchase Invoice side-by-side inside the main window"
        >
          <span>◫ Sale + Purchase Split</span>
        </button>
        {subWindowsCount > 0 && (
          <>
            <button
              type="button"
              onClick={onTileWindows}
              className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-2 py-0.5 text-[11px] font-medium"
              title="Tile open Sub-Windows side-by-side"
            >
              <span>◫ Tile</span>
            </button>
            <button
              type="button"
              onClick={onCascadeWindows}
              className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-2 py-0.5 text-[11px] font-medium"
              title="Cascade open Sub-Windows"
            >
              <span>❐ Cascade</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function SubWindowManager({
  windows,
  activeWindowId,
  onFocusWindow,
  onCloseWindow,
  onMinimizeWindow,
  onToggleMaximizeWindow,
  onSnapWindow,
  onUpdateWindowBounds,
  onUpdateWindowRoute,
  onReloadWindow,
  onTileWindows,
  onGridWindows,
  onCascadeWindows,
  onCloseAll,
  onOpenSubWindow,
}) {
  const navigate = useNavigate();
  const [interaction, setInteraction] = useState(null);
  const workspaceRef = useRef(null);

  const handleMouseDownMove = useCallback(
    (e, win) => {
      if (e.button !== 0) return;
      onFocusWindow(win.id);
      if (win.isMaximized) return;
      e.preventDefault();
      setInteraction({
        type: "move",
        id: win.id,
        startX: e.clientX,
        startY: e.clientY,
        initialX: win.x,
        initialY: win.y,
        initialW: win.width,
        initialH: win.height,
      });
    },
    [onFocusWindow]
  );

  const handleMouseDownResize = useCallback(
    (e, win, direction) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      onFocusWindow(win.id);
      if (win.isMaximized) return;
      e.preventDefault();
      setInteraction({
        type: "resize",
        direction,
        id: win.id,
        startX: e.clientX,
        startY: e.clientY,
        initialX: win.x,
        initialY: win.y,
        initialW: win.width,
        initialH: win.height,
      });
    },
    [onFocusWindow]
  );

  useEffect(() => {
    if (!interaction) return;

    const handleMouseMove = (e) => {
      const dx = e.clientX - interaction.startX;
      const dy = e.clientY - interaction.startY;
      const maxW = window.innerWidth - 40;
      const maxH = window.innerHeight - 80;

      if (interaction.type === "move") {
        const nextX = Math.max(0, Math.min(maxW - 180, interaction.initialX + dx));
        const nextY = Math.max(32, Math.min(maxH - 80, interaction.initialY + dy));
        onUpdateWindowBounds(interaction.id, { x: nextX, y: nextY });
      } else if (interaction.type === "resize") {
        const dir = interaction.direction;
        let nextX = interaction.initialX;
        let nextY = interaction.initialY;
        let nextW = interaction.initialW;
        let nextH = interaction.initialH;

        if (dir.includes("e")) {
          nextW = Math.max(420, interaction.initialW + dx);
        }
        if (dir.includes("s")) {
          nextH = Math.max(300, interaction.initialH + dy);
        }
        if (dir.includes("w")) {
          const possibleW = interaction.initialW - dx;
          if (possibleW >= 420) {
            nextW = possibleW;
            nextX = Math.max(0, interaction.initialX + dx);
          }
        }
        if (dir.includes("n")) {
          const possibleH = interaction.initialH - dy;
          if (possibleH >= 300) {
            nextH = possibleH;
            nextY = Math.max(32, interaction.initialY + dy);
          }
        }
        onUpdateWindowBounds(interaction.id, {
          x: nextX,
          y: nextY,
          width: nextW,
          height: nextH,
        });
      }
    };

    const handleMouseUp = () => {
      setInteraction(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [interaction, onUpdateWindowBounds]);

  if (!windows.length) return null;

  return (
    <>
      {/* Floating / Tiled MDI Sub-Windows Container */}
      <div
        ref={workspaceRef}
        className="pointer-events-none fixed inset-0 z-[75] overflow-hidden"
      >
        {windows.map((win) => {
          const isFocused = activeWindowId === win.id;
          const iframeSrc = `${win.path}${win.path.includes("?") ? "&" : "?"}subwindow=1&winId=${win.id}&reloadKey=${win.reloadKey || 0}`;

          const style = win.isMaximized
            ? {
                left: "8px",
                top: "38px",
                width: "calc(100vw - 16px)",
                height: "calc(100vh - 84px)",
                zIndex: win.zIndex,
              }
            : {
                left: `${win.x}px`,
                top: `${win.y}px`,
                width: `${win.width}px`,
                height: `${win.height}px`,
                zIndex: win.zIndex,
              };

          return (
            <div
              key={win.id}
              style={{
                ...style,
                display: win.isMinimized ? "none" : "flex",
              }}
              onMouseDown={() => onFocusWindow(win.id)}
              className={`pointer-events-auto fixed flex flex-col rounded-xl overflow-hidden bg-white dark:bg-slate-900 transition-shadow ${
                isFocused
                  ? "border-2 border-blue-600 dark:border-blue-500 shadow-[0_24px_60px_rgba(15,23,42,0.45)]"
                  : "border border-slate-300 dark:border-slate-700 shadow-xl opacity-95"
              }`}
            >
              {/* Sub-Window Title Bar */}
              <div
                onMouseDown={(e) => handleMouseDownMove(e, win)}
                onDoubleClick={() => onToggleMaximizeWindow(win.id)}
                className={`flex items-center justify-between gap-2 px-3 py-1.5 cursor-move select-none ${
                  isFocused
                    ? "bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 text-white"
                    : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm">🪟</span>
                  <span className="font-bold text-xs truncate max-w-[200px]">
                    {win.title}
                  </span>

                  {/* Quick Module Switcher Inside Sub-Window */}
                  <select
                    value={win.path}
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const nextPath = e.target.value;
                      const nextTitle = resolveTitleForPath(nextPath, win.title);
                      onUpdateWindowRoute(win.id, nextPath, nextTitle);
                    }}
                    className={`ml-1 rounded px-1.5 py-0.5 text-[11px] font-medium border focus:outline-none ${
                      isFocused
                        ? "bg-blue-800/80 border-blue-400/50 text-white"
                        : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                    }`}
                    title="Switch this sub-window to another ERP module"
                  >
                    {FLAT_ROUTE_ITEMS.map((item) => (
                      <option
                        key={item.path + item.label}
                        value={item.path}
                        className="bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100"
                      >
                        {item.label} ({item.path})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Window Controls (Reload, Snap Left/Right, Open in Main, Minimize, Maximize, Close) */}
                <div
                  className="flex items-center gap-1"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => onReloadWindow(win.id)}
                    title="Reload Sub-Window"
                    className="rounded px-1.5 py-0.5 text-xs hover:bg-white/20 transition-colors"
                  >
                    ↻
                  </button>
                  <button
                    type="button"
                    onClick={() => onSnapWindow(win.id, "left")}
                    title="Snap to Left Half of Main Window"
                    className="rounded px-1.5 py-0.5 text-xs hover:bg-white/20 transition-colors"
                  >
                    ◧
                  </button>
                  <button
                    type="button"
                    onClick={() => onSnapWindow(win.id, "right")}
                    title="Snap to Right Half of Main Window"
                    className="rounded px-1.5 py-0.5 text-xs hover:bg-white/20 transition-colors"
                  >
                    ◨
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigate(win.path);
                      onCloseWindow(win.id);
                    }}
                    title="Promote to Main Window Background & Close Sub-Window"
                    className="rounded px-1.5 py-0.5 text-xs hover:bg-white/20 transition-colors"
                  >
                    ↗
                  </button>
                  <button
                    type="button"
                    onClick={() => onMinimizeWindow(win.id)}
                    title="Minimize Sub-Window to Taskbar"
                    className="rounded px-2 py-0.5 text-xs font-bold hover:bg-white/20 transition-colors"
                  >
                    ─
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleMaximizeWindow(win.id)}
                    title={win.isMaximized ? "Restore Window Size" : "Maximize Sub-Window"}
                    className="rounded px-2 py-0.5 text-xs font-bold hover:bg-white/20 transition-colors"
                  >
                    {win.isMaximized ? "❐" : "□"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onCloseWindow(win.id)}
                    title="Close Sub-Window"
                    className="rounded px-2 py-0.5 text-xs font-bold bg-rose-500/90 hover:bg-rose-600 text-white transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Sub-Window Content Iframe */}
              <div className="relative flex-1 bg-slate-50 dark:bg-slate-950 overflow-hidden">
                {/* Shield overlay while dragging or resizing so iframe doesn't capture pointer */}
                {interaction && (
                  <div className="absolute inset-0 z-20 bg-transparent cursor-move" />
                )}
                <iframe
                  key={`${win.id}-${win.reloadKey || 0}`}
                  src={iframeSrc}
                  title={win.title}
                  className="w-full h-full border-0 bg-white dark:bg-slate-950"
                />
              </div>

              {/* 8-Way Resize Handles (when not maximized) */}
              {!win.isMaximized && (
                <>
                  <div
                    onMouseDown={(e) => handleMouseDownResize(e, win, "e")}
                    className="absolute top-2 bottom-2 right-0 w-1.5 cursor-ew-resize z-30"
                  />
                  <div
                    onMouseDown={(e) => handleMouseDownResize(e, win, "s")}
                    className="absolute bottom-0 left-2 right-2 h-1.5 cursor-ns-resize z-30"
                  />
                  <div
                    onMouseDown={(e) => handleMouseDownResize(e, win, "w")}
                    className="absolute top-2 bottom-2 left-0 w-1.5 cursor-ew-resize z-30"
                  />
                  <div
                    onMouseDown={(e) => handleMouseDownResize(e, win, "se")}
                    className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-40 flex items-end justify-end p-0.5 text-[9px] text-slate-400 select-none"
                    title="Drag to resize sub-window"
                  >
                    ◢
                  </div>
                  <div
                    onMouseDown={(e) => handleMouseDownResize(e, win, "sw")}
                    className="absolute bottom-0 left-0 w-3.5 h-3.5 cursor-nesw-resize z-40"
                  />
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom MDI Sub-Windows Taskbar Strip */}
      <div className="fixed bottom-0 left-0 right-0 z-[85] flex items-center justify-between gap-2 border-t border-slate-300 dark:border-slate-700 bg-slate-900/95 text-white px-3 py-1.5 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 px-1.5">
            🪟 Sub-Windows ({windows.length})
          </span>

          {windows.map((win) => {
            const isFocused = activeWindowId === win.id && !win.isMinimized;
            return (
              <div
                key={win.id}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all cursor-pointer border ${
                  isFocused
                    ? "bg-blue-600 border-blue-400 text-white shadow-sm"
                    : win.isMinimized
                    ? "bg-slate-800/70 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    : "bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700"
                }`}
                onClick={() => {
                  if (win.isMinimized) {
                    onFocusWindow(win.id);
                  } else if (isFocused) {
                    onMinimizeWindow(win.id);
                  } else {
                    onFocusWindow(win.id);
                  }
                }}
              >
                <span className="truncate max-w-[150px]">{win.title}</span>
                {win.isMinimized && (
                  <span className="text-[10px] rounded bg-slate-700 px-1 text-slate-300">
                    Min
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseWindow(win.id);
                  }}
                  className="ml-1 rounded hover:bg-rose-500/80 px-1 text-[10px] text-slate-300 hover:text-white"
                  title="Close Sub-Window"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() =>
              onOpenSubWindow("/sale-invoices/create/retail", "Retail Sale Invoice")
            }
            className="rounded bg-emerald-600 hover:bg-emerald-500 px-2 py-1 text-[11px] font-semibold text-white"
          >
            + Sale
          </button>
          <button
            type="button"
            onClick={() =>
              onOpenSubWindow("/purchase-invoices/create", "Purchase Invoice")
            }
            className="rounded bg-blue-600 hover:bg-blue-500 px-2 py-1 text-[11px] font-semibold text-white"
          >
            + Purchase
          </button>
          <button
            type="button"
            onClick={onTileWindows}
            className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2 py-1 text-[11px] font-medium text-slate-200"
            title="Tile Side-by-Side"
          >
            ◫ Tile
          </button>
          <button
            type="button"
            onClick={onGridWindows}
            className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2 py-1 text-[11px] font-medium text-slate-200"
            title="2x2 Grid"
          >
            ⊞ Grid
          </button>
          <button
            type="button"
            onClick={onCascadeWindows}
            className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2 py-1 text-[11px] font-medium text-slate-200"
            title="Cascade Windows"
          >
            ❐ Cascade
          </button>
          <button
            type="button"
            onClick={onCloseAll}
            className="rounded bg-rose-600/90 hover:bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white"
            title="Close All Sub-Windows"
          >
            Close All
          </button>
        </div>
      </div>
    </>
  );
}
