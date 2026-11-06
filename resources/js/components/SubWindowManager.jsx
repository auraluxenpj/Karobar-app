import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  MinusIcon,
  Squares2X2Icon,
  ViewColumnsIcon,
  WindowIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

export const ERP_ROUTE_TITLES = [
  { label: "Dashboard", path: "/dashboard" },
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
  { label: "Barcode POS", path: "/sale-invoices/pos" },
  { label: "Sale Invoices", path: "/sale-invoices" },
  { label: "Create Retail Sale", path: "/sale-invoices/create/retail" },
  { label: "Wholesale Invoices", path: "/wholesale-invoices" },
  { label: "Create Wholesale Sale", path: "/sale-invoices/create/wholesale" },
  { label: "Purchase Invoices", path: "/purchase-invoices" },
  { label: "Create Purchase Invoice", path: "/purchase-invoices/create" },
  { label: "Purchase Orders", path: "/purchase-orders" },
  { label: "Create Purchase Order", path: "/purchase-orders/create" },
  { label: "Smart Reorder Forecast", path: "/smart-reorder" },
  { label: "Sale Returns", path: "/sale-returns" },
  { label: "Create Sale Return", path: "/sale-returns/create" },
  { label: "Purchase Returns", path: "/purchase-returns" },
  { label: "Create Purchase Return", path: "/purchase-returns/create" },
  { label: "Batch & Expiry", path: "/batch-expiry" },
  { label: "User Demands", path: "/user-demands" },
  { label: "Request Product", path: "/user-demands/create" },
  { label: "Stock Adjustments", path: "/stock-adjustments" },
  { label: "Add Stock Adjustment", path: "/stock-adjustments/create" },
  { label: "Stocktake Sessions", path: "/stocktake-sessions" },
  { label: "New Stocktake Session", path: "/stocktake-sessions/create" },
  { label: "Quarantine & Disposal", path: "/stock-disposals" },
  { label: "New Disposal", path: "/stock-disposals/create" },
  { label: "Customer Ledger", path: "/customer-ledger" },
  { label: "Supplier Ledger", path: "/supplier-ledger" },
  { label: "Payment Vouchers", path: "/payments" },
  { label: "Cash Drawer", path: "/cash-drawer" },
  { label: "Financial Accounts", path: "/accounts" },
  { label: "Operating Expenses", path: "/expenses" },
  { label: "Double-Entry & GL", path: "/accounting" },
  { label: "HR, Payroll & Commissions", path: "/hr-payroll" },
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
  { label: "Settings", path: "/settings" },
  { label: "Users", path: "/users" },
  { label: "Add User", path: "/users/create" },
  { label: "Roles", path: "/roles" },
  { label: "Create Role", path: "/roles/create" },
  { label: "Backups & Storage", path: "/backups" },
  { label: "Setup Genie Wizard", path: "/setup" },
  { label: "License Activation", path: "/license-activation" },
];

export function resolveTitleForPath(routePath, fallback = "Workspace") {
  if (!routePath) return fallback;
  const clean = routePath.split("?")[0];
  const found = ERP_ROUTE_TITLES.find((item) => item.path === clean);
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

export default function SubWindowManager({
  windows,
  activeWindowId,
  onFocusWindow,
  onCloseWindow,
  onMinimizeWindow,
  onToggleMaximizeWindow,
  onSnapWindow,
  onUpdateWindowBounds,
  onReloadWindow,
  onTileWindows,
  onGridWindows,
  onCloseAll,
}) {
  const navigate = useNavigate();
  const [interaction, setInteraction] = useState(null);

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
      const maxW = window.innerWidth - 24;
      const maxH = window.innerHeight - 64;

      if (interaction.type === "move") {
        const nextX = Math.max(8, Math.min(maxW - 220, interaction.initialX + dx));
        const nextY = Math.max(8, Math.min(maxH - 60, interaction.initialY + dy));
        onUpdateWindowBounds(interaction.id, { x: nextX, y: nextY });
      } else if (interaction.type === "resize") {
        const dir = interaction.direction;
        let nextX = interaction.initialX;
        let nextY = interaction.initialY;
        let nextW = interaction.initialW;
        let nextH = interaction.initialH;

        if (dir.includes("e")) {
          nextW = Math.max(460, interaction.initialW + dx);
        }
        if (dir.includes("s")) {
          nextH = Math.max(320, interaction.initialH + dy);
        }
        if (dir.includes("w")) {
          const possibleW = interaction.initialW - dx;
          if (possibleW >= 460) {
            nextW = possibleW;
            nextX = Math.max(8, interaction.initialX + dx);
          }
        }
        if (dir.includes("n")) {
          const possibleH = interaction.initialH - dy;
          if (possibleH >= 320) {
            nextH = possibleH;
            nextY = Math.max(8, interaction.initialY + dy);
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
      {/* Modern Glassmorphic Sub-Windows Layer */}
      <div className="pointer-events-none fixed inset-0 z-[75] overflow-hidden">
        {windows.map((win) => {
          const isFocused = activeWindowId === win.id;
          const iframeSrc = `${win.path}${win.path.includes("?") ? "&" : "?"}subwindow=1&winId=${win.id}&reloadKey=${win.reloadKey || 0}`;

          const style = win.isMaximized
            ? {
                left: "12px",
                top: "12px",
                width: "calc(100vw - 24px)",
                height: "calc(100vh - 80px)",
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
                background: "var(--workspace-surface, #ffffff)",
                borderColor: isFocused
                  ? "color-mix(in srgb, var(--workspace-accent, #2563eb) 42%, var(--workspace-border, #d8e1ee))"
                  : "var(--workspace-edge, rgba(255,255,255,0.85))",
                boxShadow: isFocused
                  ? "var(--workspace-dock-shadow, 0 24px 60px -12px rgba(15, 23, 42, 0.32))"
                  : "var(--workspace-shadow, 0 12px 32px -18px rgba(30,41,59,0.24))",
                color: "var(--workspace-ink, #172033)",
              }}
              onMouseDown={() => onFocusWindow(win.id)}
              className="pointer-events-auto fixed flex flex-col rounded-[22px] border overflow-hidden transition-shadow duration-200"
            >
              {/* Sleek Modern Workspace Glass Header */}
              <div
                onMouseDown={(e) => handleMouseDownMove(e, win)}
                onDoubleClick={() => onToggleMaximizeWindow(win.id)}
                style={{
                  background: "var(--workspace-navigation-fill, rgba(255,255,255,0.82))",
                  borderBottom: "1px solid var(--workspace-border, rgba(216,225,238,0.7))",
                  backdropFilter: "blur(28px) saturate(150%)",
                  WebkitBackdropFilter: "blur(28px) saturate(150%)",
                }}
                className="flex items-center justify-between gap-3 px-4 py-2.5 cursor-move select-none"
              >
                {/* Left: Window Icon + Title */}
                <div className="flex items-center gap-2 min-w-0">
                  <WindowIcon
                    style={{ color: "var(--workspace-muted, #536176)" }}
                    className="w-4 h-4 shrink-0 opacity-75"
                  />
                  <span
                    style={{ color: "var(--workspace-ink, #172033)" }}
                    className="font-semibold text-[13px] tracking-tight truncate"
                  >
                    {win.title}
                  </span>
                </div>

                {/* Right: Minimalist SVG Workspace Controls */}
                <div
                  className="flex items-center gap-1 shrink-0"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => onReloadWindow(win.id)}
                    title="Refresh window"
                    style={{ color: "var(--workspace-muted, #536176)" }}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <ArrowPathIcon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onSnapWindow(win.id, "left")}
                    title="Snap left half"
                    style={{ color: "var(--workspace-muted, #536176)" }}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <ViewColumnsIcon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigate(win.path);
                      onCloseWindow(win.id);
                    }}
                    title="Expand into main workspace"
                    style={{ color: "var(--workspace-muted, #536176)" }}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMinimizeWindow(win.id)}
                    title="Minimize to dock"
                    style={{ color: "var(--workspace-muted, #536176)" }}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <MinusIcon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleMaximizeWindow(win.id)}
                    title={win.isMaximized ? "Restore size" : "Maximize"}
                    style={{ color: "var(--workspace-muted, #536176)" }}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    {win.isMaximized ? (
                      <ArrowsPointingInIcon className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onCloseWindow(win.id)}
                    title="Close window"
                    style={{ color: "var(--workspace-muted, #536176)" }}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-xl hover:text-white hover:bg-rose-500 transition-colors cursor-pointer"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Sub-Window Workspace Content */}
              <div className="relative flex-1 overflow-hidden bg-transparent">
                {interaction && (
                  <div className="absolute inset-0 z-20 bg-transparent cursor-move" />
                )}
                <iframe
                  key={`${win.id}-${win.reloadKey || 0}`}
                  src={iframeSrc}
                  title={win.title}
                  className="w-full h-full border-0 bg-transparent"
                />
              </div>

              {/* Invisible Edge & Corner Resize Handles */}
              {!win.isMaximized && (
                <>
                  <div
                    onMouseDown={(e) => handleMouseDownResize(e, win, "n")}
                    className="absolute top-0 left-3 right-3 h-1.5 cursor-ns-resize z-30"
                  />
                  <div
                    onMouseDown={(e) => handleMouseDownResize(e, win, "s")}
                    className="absolute bottom-0 left-3 right-3 h-1.5 cursor-ns-resize z-30"
                  />
                  <div
                    onMouseDown={(e) => handleMouseDownResize(e, win, "e")}
                    className="absolute top-3 bottom-3 right-0 w-1.5 cursor-ew-resize z-30"
                  />
                  <div
                    onMouseDown={(e) => handleMouseDownResize(e, win, "w")}
                    className="absolute top-3 bottom-3 left-0 w-1.5 cursor-ew-resize z-30"
                  />
                  <div
                    onMouseDown={(e) => handleMouseDownResize(e, win, "se")}
                    className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-40"
                  />
                  <div
                    onMouseDown={(e) => handleMouseDownResize(e, win, "sw")}
                    className="absolute bottom-0 left-0 w-4 h-4 cursor-nesw-resize z-40"
                  />
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Floating Glass Pill Dock at Bottom Center (Only visible when Sub-Windows exist) */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[85] flex items-center gap-1.5 max-w-[calc(100vw-32px)] rounded-2xl border border-white/80 dark:border-slate-700/80 bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl px-2.5 py-1.5 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.3)] dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7)]">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {windows.map((win) => {
            const isFocused = activeWindowId === win.id && !win.isMinimized;
            return (
              <div
                key={win.id}
                onClick={() => {
                  if (win.isMinimized) {
                    onFocusWindow(win.id);
                  } else if (isFocused) {
                    onMinimizeWindow(win.id);
                  } else {
                    onFocusWindow(win.id);
                  }
                }}
                className={`group inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-medium transition-all cursor-pointer select-none border ${
                  isFocused
                    ? "bg-blue-600/10 dark:bg-blue-500/20 border-blue-500/30 text-blue-700 dark:text-blue-300"
                    : win.isMinimized
                    ? "bg-slate-100/70 dark:bg-slate-800/60 border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    : "bg-slate-100/90 dark:bg-slate-800/90 border-slate-200/70 dark:border-slate-700/70 text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-700/80"
                }`}
              >
                <WindowIcon className="w-3.5 h-3.5 shrink-0 opacity-75" />
                <span className="truncate max-w-[140px]">{win.title}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseWindow(win.id);
                  }}
                  className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-md opacity-60 hover:opacity-100 hover:bg-rose-500 hover:text-white transition-all"
                  title="Close window"
                >
                  <XMarkIcon className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-0.5 shrink-0" />

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onTileWindows}
            title="Tile windows side-by-side"
            className="inline-flex items-center justify-center w-7 h-7 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <ViewColumnsIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onGridWindows}
            title="Arrange windows in 2x2 grid"
            className="inline-flex items-center justify-center w-7 h-7 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Squares2X2Icon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onCloseAll}
            title="Close all sub-windows"
            className="inline-flex items-center justify-center w-7 h-7 rounded-xl text-rose-500 hover:bg-rose-500/15 transition-colors cursor-pointer"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
}
