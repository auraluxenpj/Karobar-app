import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  ArrowPathIcon,
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUturnLeftIcon,
  BanknotesIcon,
  BookOpenIcon,
  ChartBarIcon,
  ChevronDownIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  CubeIcon,
  DocumentDuplicateIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ShoppingCartIcon,
  SparklesIcon,
  TruckIcon,
  WindowIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useAvailablePages, rankPagesByQuery } from "./PageSearchModal.jsx";

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
  { label: "SQLite Data Import", path: "/settings/sqlite-import" },
  { label: "SQLite Data Import", path: "/sqlite-import" },
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
  const clean = (routePath.split("?")[0] || "").replace(/\/+$/, "") || "/dashboard";
  const found = ERP_ROUTE_TITLES.find((item) => item.path === clean);
  if (found) return found.label;
  if (/^\/products\/\d+\/edit$/.test(clean)) return "Edit Product";
  if (/^\/brands\/\d+\/edit$/.test(clean)) return "Edit Brand";
  if (/^\/suppliers\/\d+\/edit$/.test(clean)) return "Edit Supplier";
  if (/^\/customers\/\d+\/edit$/.test(clean)) return "Edit Customer";
  if (/^\/stock-adjustments\/\d+$/.test(clean)) return "Stock Adjustment Details";
  if (/^\/stocktake-sessions\/\d+\/review$/.test(clean)) return "Stocktake Variance Review";
  if (/^\/stocktake-sessions\/\d+$/.test(clean)) return "Stocktake Session";
  if (/^\/stock-disposals\/\d+$/.test(clean)) return "Quarantine / Disposal Details";
  if (/^\/sale-invoices\/\d+\/edit$/.test(clean)) return "Edit Sale Invoice";
  if (/^\/sale-invoices\/\d+$/.test(clean)) return "Sale Invoice Details";
  if (/^\/purchase-invoices\/\d+\/edit$/.test(clean)) return "Edit Purchase Invoice";
  if (/^\/purchase-invoices\/\d+$/.test(clean)) return "Purchase Invoice Details";
  if (/^\/sale-returns\/\d+\/edit$/.test(clean)) return "Edit Sale Return";
  if (/^\/sale-returns\/\d+$/.test(clean)) return "Sale Return Details";
  if (/^\/purchase-returns\/\d+\/edit$/.test(clean)) return "Edit Purchase Return";
  if (/^\/purchase-returns\/\d+$/.test(clean)) return "Purchase Return Details";
  if (/^\/purchase-orders\/\d+\/edit$/.test(clean)) return "Edit Purchase Order";
  if (/^\/purchase-orders\/\d+$/.test(clean)) return "Purchase Order Details";
  if (/^\/users\/\d+\/edit$/.test(clean)) return "Edit User";
  if (/^\/roles\/\d+\/edit$/.test(clean)) return "Edit Role";
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

export function dispatchNavigateActiveTab(path, title) {
  window.dispatchEvent(
    new CustomEvent("karobar:navigate-active-tab", {
      detail: {
        path,
        title: title || resolveTitleForPath(path),
      },
    })
  );
}

export function dispatchOpenTabSearch(mode = "all") {
  window.dispatchEvent(
    new CustomEvent("karobar:open-tab-search", {
      detail: { mode },
    })
  );
}

const LAUNCHER_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "open-tabs", label: "Open Tabs" },
  { id: "Invoices", label: "Invoices" },
  { id: "Items & Masters", label: "Items & Masters" },
  { id: "Finance & Ledgers", label: "Finance & Ledgers" },
  { id: "Stock & Inventory", label: "Stock & Inventory" },
  { id: "Returns", label: "Returns" },
  { id: "Reports", label: "Reports" },
  { id: "System & Settings", label: "Settings" },
];

function getTabIconMeta(routePath) {
  const clean = (routePath || "/dashboard").split("?")[0];
  if (clean === "/dashboard" || clean.startsWith("/dashboard/")) {
    return {
      Icon: HomeIcon,
      colorClass: "text-blue-500 dark:text-blue-400",
      badgeBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    };
  }
  if (
    clean.startsWith("/sale-invoices") ||
    clean.startsWith("/wholesale-invoices") ||
    clean.startsWith("/sale-returns")
  ) {
    return {
      Icon: ShoppingCartIcon,
      colorClass: "text-emerald-500 dark:text-emerald-400",
      badgeBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    };
  }
  if (
    clean.startsWith("/purchase-invoices") ||
    clean.startsWith("/purchase-orders") ||
    clean.startsWith("/purchase-returns") ||
    clean.startsWith("/smart-reorder")
  ) {
    return {
      Icon: ClipboardDocumentListIcon,
      colorClass: "text-indigo-500 dark:text-indigo-400",
      badgeBg: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
    };
  }
  if (
    clean.startsWith("/products") ||
    clean.startsWith("/product-batches") ||
    clean.startsWith("/categories") ||
    clean.startsWith("/brands") ||
    clean.startsWith("/batch-expiry") ||
    clean.startsWith("/stock-") ||
    clean.startsWith("/stocktake-") ||
    clean.startsWith("/barcode-labels") ||
    clean.startsWith("/user-demands")
  ) {
    return {
      Icon: CubeIcon,
      colorClass: "text-amber-500 dark:text-amber-400",
      badgeBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    };
  }
  if (clean.startsWith("/suppliers") || clean.startsWith("/customers")) {
    return {
      Icon: TruckIcon,
      colorClass: "text-violet-500 dark:text-violet-400",
      badgeBg: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
    };
  }
  if (
    clean.startsWith("/customer-ledger") ||
    clean.startsWith("/supplier-ledger") ||
    clean.startsWith("/accounting")
  ) {
    return {
      Icon: BookOpenIcon,
      colorClass: "text-cyan-500 dark:text-cyan-400",
      badgeBg: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
    };
  }
  if (
    clean.startsWith("/cash-drawer") ||
    clean.startsWith("/accounts") ||
    clean.startsWith("/payments") ||
    clean.startsWith("/expenses") ||
    clean.startsWith("/hr-payroll")
  ) {
    return {
      Icon: BanknotesIcon,
      colorClass: "text-teal-500 dark:text-teal-400",
      badgeBg: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
    };
  }
  if (clean.startsWith("/reports")) {
    return {
      Icon: ChartBarIcon,
      colorClass: "text-rose-500 dark:text-rose-400",
      badgeBg: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    };
  }
  if (
    clean.startsWith("/settings") ||
    clean.startsWith("/users") ||
    clean.startsWith("/roles") ||
    clean.startsWith("/backups") ||
    clean.startsWith("/profile")
  ) {
    return {
      Icon: Cog6ToothIcon,
      colorClass: "text-slate-500 dark:text-slate-400",
      badgeBg: "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20",
    };
  }
  return {
    Icon: WindowIcon,
    colorClass: "text-blue-500 dark:text-blue-400",
    badgeBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  };
}

export default function SubWindowManager({
  tabs = [],
  activeWindowId,
  closedTabs = [],
  tabCycleHud = null,
  onFocusWindow,
  onCloseWindow,
  onReloadWindow,
  onDuplicateWindow,
  onTogglePinWindow,
  onReorderWindows,
  onOpenNewTab,
  onReopenClosedTab,
  onCloseOtherWindows,
  onCloseWindowsToRight,
  onCloseAll,
}) {
  const scrollerRef = useRef(null);
  const tabRefs = useRef({});
  const launcherDialogRef = useRef(null);
  const filterInputRef = useRef(null);
  const launcherRowRefs = useRef([]);

  const availablePages = useAvailablePages();

  const [draggedTabId, setDraggedTabId] = useState(null);
  const [dragOverTabId, setDragOverTabId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [launcherMode, setLauncherMode] = useState("all"); // "all" | "new-tab"
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [tabSearchQuery, setTabSearchQuery] = useState("");
  const [launcherActiveIdx, setLauncherActiveIdx] = useState(0);

  const openLauncher = useCallback((mode = "all") => {
    setContextMenu(null);
    setLauncherMode(mode);
    setSelectedCategory("all");
    setTabSearchQuery("");
    setOverviewOpen(true);
  }, []);

  // Listen globally for karobar:open-tab-search (triggered by Ctrl+Shift+A, Ctrl+Shift+O, etc.)
  useEffect(() => {
    const handleOpenTabSearch = (e) => {
      const requestedMode = e.detail?.mode || "all";
      setOverviewOpen((prev) => {
        if (prev && launcherMode === requestedMode) {
          return false;
        }
        setLauncherMode(requestedMode);
        setSelectedCategory("all");
        setTabSearchQuery("");
        return true;
      });
    };
    window.addEventListener("karobar:open-tab-search", handleOpenTabSearch);
    return () => window.removeEventListener("karobar:open-tab-search", handleOpenTabSearch);
  }, [launcherMode]);

  // Sync native <dialog closedby="any"> with overviewOpen state
  useEffect(() => {
    const dialog = launcherDialogRef.current;
    if (!dialog) return;

    if (overviewOpen) {
      if (!dialog.open && typeof dialog.showModal === "function") {
        try {
          dialog.showModal();
        } catch {}
      }
      setTimeout(() => {
        filterInputRef.current?.focus();
        filterInputRef.current?.select();
      }, 20);
    } else {
      if (dialog.open && typeof dialog.close === "function") {
        try {
          dialog.close();
        } catch {}
      }
      setTabSearchQuery("");
    }
  }, [overviewOpen]);

  // Fallback for browsers without native <dialog closedby="any"> support (modern-web-guidance: light-dismiss-a-dialog)
  useEffect(() => {
    const dialog = launcherDialogRef.current;
    if (!dialog || typeof HTMLDialogElement === "undefined") return;
    if ("closedBy" in HTMLDialogElement.prototype) return;

    const handleBackdropClick = (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isDialogContent =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (isDialogContent) return;
      dialog.close();
    };

    dialog.addEventListener("click", handleBackdropClick);
    return () => dialog.removeEventListener("click", handleBackdropClick);
  }, []);

  // Scroll the selected tab into view whenever selection changes (modern-web-guidance: tabs)
  useEffect(() => {
    if (!activeWindowId) return;
    const selectedEl = tabRefs.current[activeWindowId];
    if (selectedEl && typeof selectedEl.scrollIntoView === "function") {
      try {
        selectedEl.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          container: "nearest",
        });
      } catch {
        selectedEl.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }
  }, [activeWindowId, tabs.length]);

  // IntersectionObserver fallback for horizontal edge fades when scroll-driven animations are unsupported
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || typeof IntersectionObserver === "undefined") return;
    if (typeof CSS !== "undefined" && CSS.supports && CSS.supports("animation-timeline", "scroll()")) {
      return;
    }
    const first = scroller.firstElementChild;
    const last = scroller.lastElementChild;
    if (!first || !last) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const { target, intersectionRatio } of entries) {
          if (target === first) {
            scroller.classList.toggle("more-start", intersectionRatio < 1);
          }
          if (target === last) {
            scroller.classList.toggle("more-end", intersectionRatio < 1);
          }
        }
      },
      { root: scroller, threshold: 1, rootMargin: "1px" }
    );

    observer.observe(first);
    observer.observe(last);
    return () => observer.disconnect();
  }, [tabs.length]);

  // Dismiss context menu on outside click or Escape
  useEffect(() => {
    if (!contextMenu) return;

    const handlePointerDown = () => {
      setContextMenu(null);
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setContextMenu(null);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  // Keyboard navigation inside the tablist (selection follows focus for instant tab switching)
  const handleTabListKeyDown = useCallback(
    (e) => {
      if (!tabs.length) return;
      const currentIndex = tabs.findIndex((t) => t.id === activeWindowId);
      if (currentIndex === -1) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        const nextTab = tabs[(currentIndex + 1) % tabs.length];
        if (nextTab) {
          onFocusWindow?.(nextTab.id);
          tabRefs.current[nextTab.id]?.focus();
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prevTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
        if (prevTab) {
          onFocusWindow?.(prevTab.id);
          tabRefs.current[prevTab.id]?.focus();
        }
      } else if (e.key === "Home") {
        e.preventDefault();
        const firstTab = tabs[0];
        if (firstTab) {
          onFocusWindow?.(firstTab.id);
          tabRefs.current[firstTab.id]?.focus();
        }
      } else if (e.key === "End") {
        e.preventDefault();
        const lastTab = tabs[tabs.length - 1];
        if (lastTab) {
          onFocusWindow?.(lastTab.id);
          tabRefs.current[lastTab.id]?.focus();
        }
      } else if (e.key === "Delete") {
        e.preventDefault();
        onCloseWindow?.(activeWindowId);
      }
    },
    [tabs, activeWindowId, onFocusWindow, onCloseWindow]
  );

  // Filter Open Tabs by query
  const filteredTabs = useMemo(() => {
    if (selectedCategory !== "all" && selectedCategory !== "open-tabs") {
      return [];
    }
    const q = tabSearchQuery.trim().toLowerCase();
    if (!q) return tabs;
    return tabs.filter(
      (t) =>
        (t.title || "").toLowerCase().includes(q) ||
        (t.path || "").toLowerCase().includes(q)
    );
  }, [tabs, tabSearchQuery, selectedCategory]);

  // Filter & rank All Available Pages for the user by query and category
  const filteredAvailablePages = useMemo(() => {
    if (selectedCategory === "open-tabs") return [];
    const basePages =
      selectedCategory === "all"
        ? availablePages
        : availablePages.filter((p) => p.section === selectedCategory);
    return rankPagesByQuery(basePages, tabSearchQuery);
  }, [availablePages, tabSearchQuery, selectedCategory]);

  // Filter Recently Closed Tabs by query
  const filteredClosedTabs = useMemo(() => {
    if (selectedCategory !== "all") return [];
    const q = tabSearchQuery.trim().toLowerCase();
    const list = closedTabs.slice(0, 5).map((item, idx) => ({ ...item, closedIdx: idx }));
    if (!q) return list;
    return list.filter(
      (c) =>
        (c.title || "").toLowerCase().includes(q) ||
        (c.path || "").toLowerCase().includes(q)
    );
  }, [closedTabs, tabSearchQuery, selectedCategory]);

  // Build unified flat list for smooth Up/Down arrow navigation
  const flatLauncherItems = useMemo(() => {
    const items = [];
    for (const t of filteredTabs) {
      items.push({ type: "open-tab", key: `tab-${t.id}`, tab: t });
    }
    for (const p of filteredAvailablePages) {
      items.push({ type: "available-page", key: `page-${p.path}`, page: p });
    }
    for (const c of filteredClosedTabs) {
      items.push({
        type: "closed-tab",
        key: `closed-${c.path}-${c.closedIdx}`,
        closed: c,
        closedIdx: c.closedIdx,
      });
    }
    return items;
  }, [filteredTabs, filteredAvailablePages, filteredClosedTabs]);

  // Set smart default active index when opening or changing search query / category
  useEffect(() => {
    launcherRowRefs.current = [];
    if (!flatLauncherItems.length) {
      setLauncherActiveIdx(0);
      return;
    }
    const q = tabSearchQuery.trim();
    if (launcherMode === "new-tab" && !q && selectedCategory === "all") {
      const firstPageIdx = flatLauncherItems.findIndex(
        (item) => item.type === "available-page"
      );
      setLauncherActiveIdx(firstPageIdx >= 0 ? firstPageIdx : 0);
      return;
    }
    if (!q && selectedCategory === "all" && flatLauncherItems.length > 1) {
      // If item 0 is the already-focused tab, highlight the next item or first available page
      const firstItem = flatLauncherItems[0];
      if (firstItem?.type === "open-tab" && firstItem.tab.id === activeWindowId) {
        setLauncherActiveIdx(1);
        return;
      }
    }
    setLauncherActiveIdx(0);
  }, [tabSearchQuery, selectedCategory, launcherMode, overviewOpen, flatLauncherItems.length, activeWindowId]);

  // Auto-scroll active item in launcher into view
  useEffect(() => {
    if (!overviewOpen || launcherActiveIdx < 0) return;
    const el = launcherRowRefs.current[launcherActiveIdx];
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [launcherActiveIdx, overviewOpen]);

  const executeLauncherItem = useCallback(
    (item, options = {}) => {
      if (!item) return;
      setOverviewOpen(false);

      if (item.type === "open-tab") {
        if (options.duplicate) {
          onOpenNewTab?.(item.tab.path, item.tab.title);
        } else {
          onFocusWindow?.(item.tab.id);
        }
        return;
      }

      if (item.type === "available-page") {
        if (options.openInCurrentTab) {
          dispatchNavigateActiveTab(item.page.path, item.page.name);
        } else {
          onOpenNewTab?.(item.page.path, item.page.name);
        }
        return;
      }

      if (item.type === "closed-tab") {
        onReopenClosedTab?.(item.closedIdx);
      }
    },
    [onFocusWindow, onOpenNewTab, onReopenClosedTab]
  );

  const handleLauncherKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flatLauncherItems.length > 0) {
        setLauncherActiveIdx((prev) => (prev + 1) % flatLauncherItems.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flatLauncherItems.length > 0) {
        setLauncherActiveIdx(
          (prev) => (prev - 1 + flatLauncherItems.length) % flatLauncherItems.length
        );
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = flatLauncherItems[launcherActiveIdx];
      if (target) {
        executeLauncherItem(target, {
          duplicate: (e.ctrlKey || e.metaKey) && target.type === "open-tab",
          openInCurrentTab: e.shiftKey && target.type === "available-page",
        });
      }
    }
  };

  if (!tabs.length) return null;

  return (
    <div className="workspace-tabbar-slot">
      <div
        className="workspace-tabbar"
        onDoubleClick={(e) => {
          if (e.target === e.currentTarget || e.target === scrollerRef.current) {
            openLauncher("new-tab");
          }
        }}
      >
        {/* Accessible Single-Row Browser Tablist */}
        <div
          ref={scrollerRef}
          role="tablist"
          aria-label="Workspace browser tabs"
          {...({ focusgroup: "tablist nomemory" })}
          onKeyDown={handleTabListKeyDown}
          onWheel={(e) => {
            if (scrollerRef.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
              scrollerRef.current.scrollLeft += e.deltaY;
            }
          }}
          className="workspace-tabbar-scroller"
        >
          {tabs.map((tab, idx) => {
            const isSelected = activeWindowId === tab.id;
            const { Icon, colorClass } = getTabIconMeta(tab.path);
            const shortcutHint =
              idx < 8
                ? `Ctrl+Shift+${idx + 1}`
                : idx === tabs.length - 1
                ? "Ctrl+Shift+9"
                : "";

            return (
              <button
                key={tab.id}
                ref={(el) => {
                  if (el) tabRefs.current[tab.id] = el;
                  else delete tabRefs.current[tab.id];
                }}
                id={`workspace-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                {...(isSelected ? { focusgroupstart: "" } : {})}
                draggable
                onDragStart={(e) => {
                  setDraggedTabId(tab.id);
                  e.dataTransfer.effectAllowed = "move";
                  try {
                    e.dataTransfer.setData("text/plain", tab.id);
                  } catch {}
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (draggedTabId && draggedTabId !== tab.id) {
                    setDragOverTabId(tab.id);
                  }
                }}
                onDragLeave={() => {
                  if (dragOverTabId === tab.id) {
                    setDragOverTabId(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const sourceId = draggedTabId || e.dataTransfer.getData("text/plain");
                  setDraggedTabId(null);
                  setDragOverTabId(null);
                  if (sourceId && sourceId !== tab.id) {
                    onReorderWindows?.(sourceId, tab.id);
                  }
                }}
                onDragEnd={() => {
                  setDraggedTabId(null);
                  setDragOverTabId(null);
                }}
                onClick={() => onFocusWindow?.(tab.id)}
                onAuxClick={(e) => {
                  // Middle mouse button closes tab immediately like Chrome
                  if (e.button === 1) {
                    e.preventDefault();
                    e.stopPropagation();
                    onCloseWindow?.(tab.id);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const menuW = 236;
                  const menuH = 280;
                  const x = Math.min(e.clientX, window.innerWidth - menuW - 12);
                  const y = Math.min(e.clientY, window.innerHeight - menuH - 12);
                  setContextMenu({ tab, idx, x, y });
                }}
                title={`${tab.title} (${tab.path})${shortcutHint ? ` · ${shortcutHint}` : ""}\nSwitch: Ctrl+Tab · Reverse: Ctrl+Shift+Tab · Middle-click to close`}
                className={`workspace-tab ${tab.pinned ? "is-pinned" : ""} ${
                  dragOverTabId === tab.id ? "ring-2 ring-blue-500/60" : ""
                } ${draggedTabId === tab.id ? "opacity-50" : ""}`}
              >
                <Icon
                  className={`w-3.5 h-3.5 shrink-0 ${colorClass}`}
                  aria-hidden="true"
                />

                {tab.pinned && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"
                    aria-hidden="true"
                  />
                )}

                <span className="workspace-tab-label">{tab.title}</span>

                {!tab.pinned && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseWindow?.(tab.id);
                    }}
                    title={`Close ${tab.title} (Ctrl+F4)`}
                    aria-hidden="true"
                    className="workspace-tab-close"
                  >
                    <XMarkIcon className="w-3 h-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Outside the tablist: New Tab (+), Duplicate, Reload, and Search Tabs & Pages (▾) */}
        <div className="workspace-tabbar-actions">
          <button
            type="button"
            onClick={(e) => {
              if (e.shiftKey) {
                onOpenNewTab?.("/dashboard", "Dashboard");
              } else {
                openLauncher("new-tab");
              }
            }}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                onOpenNewTab?.("/dashboard", "Dashboard");
              }
            }}
            title="Open Page in New Tab (Ctrl+Shift+A or Ctrl+Shift+N · Shift+Click for Blank Dashboard)"
            aria-label="Open page in new tab"
            className="workspace-tabbar-btn"
          >
            <PlusIcon className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => onDuplicateWindow?.(activeWindowId)}
            title="Duplicate Active Tab (Ctrl+Shift+D)"
            aria-label="Duplicate active tab"
            className="workspace-tabbar-btn hidden sm:inline-flex"
          >
            <DocumentDuplicateIcon className="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => onReloadWindow?.(activeWindowId)}
            title="Reload Active Tab"
            aria-label="Reload active tab"
            className="workspace-tabbar-btn hidden md:inline-flex"
          >
            <ArrowPathIcon className="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => openLauncher("all")}
            title="Search Open Tabs & Open Any Page in New Tab (Ctrl+Shift+A)"
            aria-label="Search open tabs and available pages"
            aria-haspopup="dialog"
            aria-expanded={overviewOpen}
            className="workspace-tabbar-btn"
          >
            <MagnifyingGlassIcon className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" aria-hidden="true" />
            <span className="text-[11px] font-bold tabular-nums">{tabs.length}</span>
            <ChevronDownIcon className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Native Top-Layer Tab Search & New Tab Page Launcher (<dialog closedby="any">) */}
      <dialog
        ref={launcherDialogRef}
        closedby="any"
        aria-label="Search open tabs and open page in new tab"
        onClose={() => setOverviewOpen(false)}
        onKeyDown={handleLauncherKeyDown}
        className="workspace-tab-launcher-dialog"
      >
        {/* Top Search Bar */}
        <div className="px-4 py-3 border-b border-slate-200/80 dark:border-slate-800 flex items-center gap-3 bg-gradient-to-r from-blue-500/[0.06] via-transparent to-indigo-500/[0.06]">
          <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
            <MagnifyingGlassIcon className="w-5 h-5" aria-hidden="true" />
          </div>

          <div className="flex-1 min-w-0">
            <input
              ref={filterInputRef}
              type="text"
              value={tabSearchQuery}
              onChange={(e) => setTabSearchQuery(e.target.value)}
              placeholder="Search open tabs or any page to open in a new tab..."
              aria-label="Search open tabs and all available pages"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full bg-transparent text-sm sm:text-[15px] font-semibold text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
            />
          </div>

          {tabSearchQuery && (
            <button
              type="button"
              onClick={() => {
                setTabSearchQuery("");
                filterInputRef.current?.focus();
              }}
              className="px-2 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Clear
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onOpenNewTab?.("/dashboard", "Dashboard");
              setOverviewOpen(false);
            }}
            title="Immediately open a new Dashboard tab"
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-xs transition-colors cursor-pointer shrink-0"
          >
            <PlusIcon className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Dashboard Tab</span>
          </button>

          <button
            type="button"
            onClick={() => setOverviewOpen(false)}
            aria-label="Close tab search dialog"
            title="Close (Esc)"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <XMarkIcon className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Category Filter Pills */}
        <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800/80 flex items-center gap-1.5 overflow-x-auto no-scrollbar bg-slate-50/60 dark:bg-slate-900/50">
          {LAUNCHER_CATEGORIES.map((cat) => {
            const active = selectedCategory === cat.id;
            const label =
              cat.id === "open-tabs"
                ? `Open Tabs (${tabs.length})`
                : cat.id === "all"
                ? `All (${tabs.length} open · ${availablePages.length} pages)`
                : cat.label;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat.id);
                  filterInputRef.current?.focus();
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  active
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-white dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/70 hover:border-blue-400 dark:hover:border-blue-500"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Unified Results Body: Open Tabs + All Available Pages + Recently Closed */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-3 min-h-[260px] max-h-[54dvh]">
          {flatLauncherItems.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <MagnifyingGlassIcon className="w-8 h-8 mx-auto mb-2 opacity-40" aria-hidden="true" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                No matching open tabs or pages for "{tabSearchQuery}"
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Try searching by module name, invoice type, report, or route path.
              </p>
            </div>
          ) : (
            <>
              {/* 1. Open Tabs Section */}
              {filteredTabs.length > 0 && (
                <div className="space-y-1">
                  <div className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center justify-between">
                    <span>Open Browser Tabs ({filteredTabs.length})</span>
                    <span>Ctrl+Tab / Ctrl+Shift+Tab to cycle</span>
                  </div>

                  {filteredTabs.map((t) => {
                    const flatIdx = flatLauncherItems.findIndex(
                      (item) => item.key === `tab-${t.id}`
                    );
                    const isHighlighted = flatIdx === launcherActiveIdx;
                    const isCurrentTab = activeWindowId === t.id;
                    const { Icon, colorClass, badgeBg } = getTabIconMeta(t.path);
                    const tabNumberIdx = tabs.findIndex((item) => item.id === t.id);

                    return (
                      <div
                        key={t.id}
                        ref={(el) => {
                          launcherRowRefs.current[flatIdx] = el;
                        }}
                        onMouseEnter={() => setLauncherActiveIdx(flatIdx)}
                        onClick={() => executeLauncherItem({ type: "open-tab", tab: t })}
                        className={`group flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-xs transition-all cursor-pointer ${
                          isHighlighted
                            ? "bg-blue-600 text-white shadow-sm"
                            : isCurrentTab
                            ? "bg-blue-500/[0.08] text-slate-900 dark:text-slate-100 border border-blue-500/20"
                            : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div
                            className={`p-1.5 rounded-lg shrink-0 border ${
                              isHighlighted
                                ? "bg-white/20 text-white border-white/20"
                                : badgeBg
                            }`}
                          >
                            <Icon
                              className={`w-4 h-4 ${isHighlighted ? "text-white" : colorClass}`}
                              aria-hidden="true"
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold truncate text-[13px]">
                                {t.title}
                              </span>
                              {isCurrentTab && (
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                    isHighlighted
                                      ? "bg-white/25 text-white"
                                      : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                  }`}
                                >
                                  Active Tab
                                </span>
                              )}
                              {t.pinned && (
                                <span
                                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                    isHighlighted
                                      ? "bg-white/20 text-white"
                                      : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                  }`}
                                >
                                  Pinned
                                </span>
                              )}
                            </div>
                            <div
                              className={`text-[11px] truncate ${
                                isHighlighted
                                  ? "text-blue-100"
                                  : "text-slate-400 dark:text-slate-500"
                              }`}
                            >
                              {t.path}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {tabNumberIdx >= 0 && tabNumberIdx < 8 && (
                            <kbd
                              className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${
                                isHighlighted
                                  ? "bg-white/20 text-white border-white/25"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                              }`}
                            >
                              Ctrl+Shift+{tabNumberIdx + 1}
                            </kbd>
                          )}

                          <span
                            className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold ${
                              isHighlighted
                                ? "bg-white/20 text-white"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                            }`}
                          >
                            <span>Switch</span>
                            <ArrowRightIcon className="w-3 h-3" aria-hidden="true" />
                          </span>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              executeLauncherItem(
                                { type: "open-tab", tab: t },
                                { duplicate: true }
                              );
                            }}
                            title={`Duplicate ${t.title} in a new tab`}
                            aria-label={`Duplicate ${t.title}`}
                            className={`p-1 rounded-lg transition-colors cursor-pointer ${
                              isHighlighted
                                ? "text-blue-100 hover:text-white hover:bg-white/20"
                                : "text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10"
                            }`}
                          >
                            <DocumentDuplicateIcon className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCloseWindow?.(t.id);
                            }}
                            aria-label={`Close ${t.title}`}
                            title={`Close ${t.title}`}
                            className={`p-1 rounded-lg transition-colors cursor-pointer ${
                              isHighlighted
                                ? "text-blue-100 hover:text-white hover:bg-rose-500"
                                : "text-slate-400 hover:text-white hover:bg-rose-500"
                            }`}
                          >
                            <XMarkIcon className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 2. Open Page in New Tab (All Available Pages for User) */}
              {filteredAvailablePages.length > 0 && (
                <div className="space-y-1">
                  <div className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center justify-between">
                    <span>
                      Open Page in New Tab ({filteredAvailablePages.length} available pages)
                    </span>
                    <span>Click or press Enter ↵ to open in new tab</span>
                  </div>

                  <div className="grid grid-cols-1 gap-1">
                    {filteredAvailablePages.map((page) => {
                      const flatIdx = flatLauncherItems.findIndex(
                        (item) => item.key === `page-${page.path}`
                      );
                      const isHighlighted = flatIdx === launcherActiveIdx;
                      const PageIcon = page.icon || getTabIconMeta(page.path).Icon;
                      const { colorClass, badgeBg } = getTabIconMeta(page.path);
                      const matchingOpenTab = tabs.find(
                        (t) => (t.path || "").split("?")[0] === page.path
                      );

                      return (
                        <div
                          key={page.path}
                          ref={(el) => {
                            launcherRowRefs.current[flatIdx] = el;
                          }}
                          onMouseEnter={() => setLauncherActiveIdx(flatIdx)}
                          onClick={() =>
                            executeLauncherItem({ type: "available-page", page })
                          }
                          className={`group flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-xs transition-all cursor-pointer ${
                            isHighlighted
                              ? "bg-blue-600 text-white shadow-sm"
                              : "text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div
                              className={`p-1.5 rounded-lg shrink-0 border ${
                                isHighlighted
                                  ? "bg-white/20 text-white border-white/20"
                                  : badgeBg
                              }`}
                            >
                              <PageIcon
                                className={`w-4 h-4 ${
                                  isHighlighted ? "text-white" : colorClass
                                }`}
                                aria-hidden="true"
                              />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold truncate text-[13px]">
                                  {page.name}
                                </span>
                                <span
                                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                                    isHighlighted
                                      ? "bg-white/20 text-white"
                                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                                  }`}
                                >
                                  {page.section}
                                </span>
                                {matchingOpenTab && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onFocusWindow?.(matchingOpenTab.id);
                                      setOverviewOpen(false);
                                    }}
                                    title="Already open — click to switch to existing tab"
                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full transition-colors cursor-pointer ${
                                      isHighlighted
                                        ? "bg-white/25 hover:bg-white/35 text-white"
                                        : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                    }`}
                                  >
                                    Open · Switch
                                  </button>
                                )}
                              </div>
                              <div
                                className={`text-[11px] truncate ${
                                  isHighlighted
                                    ? "text-blue-100"
                                    : "text-slate-400 dark:text-slate-500"
                                }`}
                              >
                                {page.path}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {page.shortcut && (
                              <kbd
                                className={`hidden md:inline-block px-1.5 py-0.5 text-[10px] font-mono rounded border ${
                                  isHighlighted
                                    ? "bg-white/20 text-white border-white/25"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                                }`}
                              >
                                {page.shortcut}
                              </kbd>
                            )}

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                executeLauncherItem(
                                  { type: "available-page", page },
                                  { openInCurrentTab: true }
                                );
                              }}
                              title={`Navigate current tab to ${page.name} (Shift+Enter)`}
                              className={`hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                                isHighlighted
                                  ? "bg-white/15 hover:bg-white/25 text-white"
                                  : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                              }`}
                            >
                              <ArrowTopRightOnSquareIcon className="w-3 h-3" aria-hidden="true" />
                              <span>Here</span>
                            </button>

                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                                isHighlighted
                                  ? "bg-white text-blue-600 shadow-xs"
                                  : "bg-blue-500/10 text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white"
                              }`}
                            >
                              <PlusIcon className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>New Tab</span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. Recently Closed Tabs */}
              {filteredClosedTabs.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center justify-between">
                    <span>Recently Closed Tabs</span>
                    <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                      Ctrl+Shift+T
                    </kbd>
                  </div>

                  {filteredClosedTabs.map((closed) => {
                    const flatIdx = flatLauncherItems.findIndex(
                      (item) => item.key === `closed-${closed.path}-${closed.closedIdx}`
                    );
                    const isHighlighted = flatIdx === launcherActiveIdx;

                    return (
                      <button
                        key={`closed-${closed.path}-${closed.closedIdx}`}
                        ref={(el) => {
                          launcherRowRefs.current[flatIdx] = el;
                        }}
                        type="button"
                        onMouseEnter={() => setLauncherActiveIdx(flatIdx)}
                        onClick={() =>
                          executeLauncherItem({
                            type: "closed-tab",
                            closed,
                            closedIdx: closed.closedIdx,
                          })
                        }
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
                          isHighlighted
                            ? "bg-blue-600 text-white"
                            : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80"
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <ArrowUturnLeftIcon
                            className={`w-4 h-4 shrink-0 ${
                              isHighlighted ? "text-white" : "text-slate-400"
                            }`}
                            aria-hidden="true"
                          />
                          <span className="font-semibold truncate">{closed.title}</span>
                          <span
                            className={`text-[11px] truncate ${
                              isHighlighted ? "text-blue-100" : "text-slate-400"
                            }`}
                          >
                            {closed.path}
                          </span>
                        </span>
                        <span
                          className={`text-[11px] font-bold shrink-0 ${
                            isHighlighted ? "text-white" : "text-blue-500"
                          }`}
                        >
                          Reopen Tab ↵
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Dialog Footer with Keyboard Hints & Bulk Tab Actions */}
        <div className="px-4 py-2.5 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-[10px]">
                ↑↓
              </kbd>
              <span>Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-[10px]">
                ↵
              </kbd>
              <span>Open New Tab / Switch</span>
            </span>
            <span className="hidden sm:flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-[10px]">
                Shift+↵
              </kbd>
              <span>Open in Current Tab</span>
            </span>
            <span className="hidden md:flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-[10px]">
                Ctrl+Shift+A
              </kbd>
              <span>Launcher</span>
            </span>
          </div>

          {tabs.length > 1 && (
            <div className="flex items-center gap-3 ml-auto">
              <button
                type="button"
                onClick={() => {
                  onCloseOtherWindows?.(activeWindowId);
                  setOverviewOpen(false);
                }}
                className="font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
              >
                Close Other Tabs
              </button>
              <button
                type="button"
                onClick={() => {
                  onCloseAll?.();
                  setOverviewOpen(false);
                }}
                className="font-semibold text-rose-500 hover:text-rose-600 cursor-pointer"
              >
                Reset to Main Tab
              </button>
            </div>
          )}
        </div>
      </dialog>

      {/* Right-Click Tab Context Menu (Chrome-style) */}
      {contextMenu && (
        <div
          role="menu"
          aria-label="Tab actions"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onMouseDown={(e) => e.stopPropagation()}
          className="fixed z-[130] w-60 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl p-1.5 shadow-2xl text-xs font-medium text-slate-700 dark:text-slate-200"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setContextMenu(null);
              openLauncher("new-tab");
            }}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <span>Open Page in New Tab...</span>
            <kbd className="text-[10px] text-slate-400 font-mono">Ctrl+Shift+A</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onOpenNewTab?.("/dashboard", "Dashboard");
              setContextMenu(null);
            }}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <span>New Dashboard Tab</span>
            <kbd className="text-[10px] text-slate-400 font-mono">Ctrl+Shift+N</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onDuplicateWindow?.(contextMenu.tab.id);
              setContextMenu(null);
            }}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <span>Duplicate Tab</span>
            <kbd className="text-[10px] text-slate-400 font-mono">Ctrl+Shift+D</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onReloadWindow?.(contextMenu.tab.id);
              setContextMenu(null);
            }}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <span>Reload Tab</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onTogglePinWindow?.(contextMenu.tab.id);
              setContextMenu(null);
            }}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <span>{contextMenu.tab.pinned ? "Unpin Tab" : "Pin Tab"}</span>
          </button>

          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onCloseWindow?.(contextMenu.tab.id);
              setContextMenu(null);
            }}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
          >
            <span>Close Tab</span>
            <kbd className="text-[10px] text-rose-400 font-mono">Ctrl+F4</kbd>
          </button>
          {tabs.length > 1 && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onCloseOtherWindows?.(contextMenu.tab.id);
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <span>Close Other Tabs</span>
                <kbd className="text-[10px] text-slate-400 font-mono">Ctrl+Shift+X</kbd>
              </button>
              {contextMenu.idx < tabs.length - 1 && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onCloseWindowsToRight?.(contextMenu.tab.id);
                    setContextMenu(null);
                  }}
                  className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <span>Close Tabs to the Right</span>
                </button>
              )}
            </>
          )}
          {closedTabs.length > 0 && (
            <>
              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onReopenClosedTab?.(0);
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <span>Reopen Closed Tab</span>
                <kbd className="text-[10px] text-slate-400 font-mono">Ctrl+Shift+T</kbd>
              </button>
            </>
          )}
        </div>
      )}

      {/* Visual Tab Switcher HUD Pill when cycling with Ctrl+Tab / Ctrl+Shift+Tab */}
      {tabCycleHud?.visible && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-14 left-1/2 -translate-x-1/2 z-[140] pointer-events-none flex items-center gap-2 px-3.5 py-2 rounded-2xl border border-slate-200/90 dark:border-slate-700/90 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        >
          <SparklesIcon className="w-4 h-4 text-blue-500 shrink-0" aria-hidden="true" />
          <div className="flex items-center gap-1.5 max-w-[75vw] overflow-x-auto no-scrollbar">
            {tabs.map((t, i) => {
              const isAct = t.id === activeWindowId;
              const { Icon, colorClass } = getTabIconMeta(t.path);
              return (
                <div
                  key={t.id}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold transition-all ${
                    isAct
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 opacity-75"
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${isAct ? "text-white" : colorClass}`}
                    aria-hidden="true"
                  />
                  <span className="truncate max-w-[140px]">{t.title}</span>
                  <span
                    className={`text-[10px] font-mono ${
                      isAct ? "text-blue-100" : "text-slate-400"
                    }`}
                  >
                    {i + 1}
                  </span>
                </div>
              );
            })}
          </div>
          <span className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-[10px] font-mono font-bold rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
            {tabCycleHud.direction < 0 ? "Reverse ◂" : "Next ▸"}
          </span>
        </div>
      )}
    </div>
  );
}
