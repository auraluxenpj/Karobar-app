// src/layouts/DashboardLayout.jsx
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";
import Topbar from "../components/Topbar.jsx";
import ProtectedRoute from "../components/ProtectedRoute.jsx";
import PageSkeleton from "../components/PageSkeleton.jsx";
import SubWindowManager, {
  resolveTitleForPath,
  dispatchOpenTabSearch,
} from "../components/SubWindowManager.jsx";
import AppUpdateNotification from "../components/AppUpdateNotification.jsx";
import SessionExpiryModal from "../components/SessionExpiryModal.jsx";
import { Toaster } from "react-hot-toast";
import { printCurrentView } from "@/utils/printHelper.js";

const SIDEBAR_PIN_STORAGE_KEY = "karobar_sidebar_pinned";

export default function DashboardLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

  const isSubWindow =
    typeof window !== "undefined" &&
    (new URLSearchParams(location.search).get("subwindow") === "1" ||
      window.self !== window.top);

  const subWinIdRef = useRef(
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("winId")
      : null
  );

  // Brand from /api/settings
  const [appName, setAppName] = useState("Karobar-App");
  const [logoUrl, setLogoUrl] = useState(null);

  // Top Browser Tabs State inside Main Window
  const [subWindows, setSubWindows] = useState([]);
  const [activeSubWindowId, setActiveSubWindowId] = useState("main");
  const [mainTabPinned, setMainTabPinned] = useState(false);
  const [tabOrder, setTabOrder] = useState(["main"]);
  const [closedTabs, setClosedTabs] = useState([]);
  const [defaultSubWindowMode, setDefaultSubWindowMode] = useState(false);
  const [tabCycleHud, setTabCycleHud] = useState(null);

  const winIdCounterRef = useRef(1);
  const lastMdiActionTsRef = useRef(0);
  const lastTabCycleTsRef = useRef(0);
  const hudTimerRef = useRef(null);
  const iframeRefs = useRef({});
  const tabPanelRefs = useRef({});
  const mainPanelRef = useRef(null);

  // Mobile sidebar state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Desktop macOS Dock auto-hide state vs Pinned state (defaults to unpinned auto-hide dock)
  const [sidebarPinned, setSidebarPinned] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_PIN_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [dockOpen, setDockOpen] = useState(false);
  const openTimerRef = useRef(null);
  const closeTimerRef = useRef(null);

  const clearDockTimers = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const handleDockTriggerEnter = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (!dockOpen && !openTimerRef.current) {
      openTimerRef.current = setTimeout(() => {
        setDockOpen(true);
        openTimerRef.current = null;
      }, 65);
    }
  }, [dockOpen]);

  const handleDockTriggerLeave = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (dockOpen && !closeTimerRef.current) {
      closeTimerRef.current = setTimeout(() => {
        setDockOpen(false);
        closeTimerRef.current = null;
      }, 260);
    }
  }, [dockOpen]);

  const handleDockPanelEnter = useCallback(() => {
    clearDockTimers();
    setDockOpen(true);
  }, [clearDockTimers]);

  const handleDockPanelLeave = useCallback(() => {
    clearDockTimers();
    closeTimerRef.current = setTimeout(() => {
      setDockOpen(false);
      closeTimerRef.current = null;
    }, 250);
  }, [clearDockTimers]);

  const handleTogglePin = useCallback(() => {
    setSidebarPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_PIN_STORAGE_KEY, String(next));
      } catch {
        /* ignore quota errors */
      }
      if (next) {
        setDockOpen(false);
      }
      return next;
    });
  }, []);

  // Fetch lightweight branding from shared /api/sale-system endpoint
  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get("/api/sale-system");
        const sn = (data?.store_name || "").trim();
        setAppName(sn || "Karobar-App");
        setLogoUrl(data?.logo_url || null);
      } catch {
        setAppName("Karobar-App");
        setLogoUrl(null);
      }
    })();
  }, []);

  // Page titles
  const titles = {
    "/dashboard": "Dashboard",
    "/profile": "Profile",
    "/suppliers": "Suppliers",
    "/suppliers/create": "Add Supplier",
    "/customers": "Customers",
    "/customers/create": "Add Customer",
    "/products": "Products",
    "/products/create": "Add Product",
    "/background-tasks": "Background Tasks & Formulation Report",
    "/categories": "Categories",
    "/brands": "Brands",
    "/brands/create": "Add Brand",
    "/barcode-labels": "Barcode Studio",
    "/batch-expiry": "Batch Expiry & Tracking",
    "/stock-disposals": "Quarantine & Disposals",
    "/stock-disposals/create": "New Quarantine / Disposal",
    "/purchase-invoices": "Purchase Invoices",
    "/purchase-invoices/create": "Purchase Invoice",
    "/purchase-returns": "Purchase Returns",
    "/purchase-returns/create": "Create Purchase Return",
    "/sale-invoices": "Sale Invoices",
    "/sale-invoices/pos": "POS Terminal",
    "/sale-invoices/barcode-pos": "POS Terminal",
    "/sale-invoices/create": "Create Sale Invoice",
    "/sale-invoices/create/retail": "Retail Sale Invoice",
    "/sale-invoices/create-retail": "Retail Sale Invoice",
    "/sale-invoices/create/wholesale": "Wholesale Sale Invoice",
    "/sale-invoices/create-wholesale": "Wholesale Sale Invoice",
    "/sale-returns": "Sale Returns",
    "/sale-returns/create": "Create Sale Return",
    "/purchase-orders": "Purchase Orders",
    "/purchase-orders/create": "Create Purchase Order",
    "/purchase-orders/forecast": "Smart Reorder Forecast",
    "/user-demands": "User Demands",
    "/user-demands/create": "Request Product",
    "/settings": "Settings",
    "/settings/sqlite-import": "SQLite Data Import & Migration Studio",
    "/sqlite-import": "SQLite Data Import & Migration Studio",
    "/reports": "Reports",
    "/users": "Users",
    "/users/create": "Add User",
    "/roles": "Roles",
    "/roles/create": "Create Role",
    "/reports/sale-detail": "Sales Detail Report",
    "/reports/purchase-detail": "Purchase Detail Report",
    "/reports/cost-of-sale": "Cost of Sale Report",
    "/reports/cost-of-sale-detail": "Cost of Sale Detail Report",
    "/reports/current-stock": "Current Stock Report",
    "/reports/stock-adjustment": "Stock Adjustment Report",
    "/reports/product-comprehensive": "Product Comprehensive Report",
    "/reports/near-expiry-product": "Near Expiry Product Report",
    "/reports/purchase-returns": "Purchase Returns Report",
    "/reports/sale-returns": "Sale Returns Report",
    "/reports/purchase-summary": "Purchase Summary Report",
    "/reports/outstanding-aging": "Outstanding Aging Report",
    "/reports/overdue-work-queue": "Overdue Work Queue",
    "/reports/reorder": "Low Stock & Reorder Report",
    "/supplier-ledger": "Supplier Ledger",
    "/customer-ledger": "Customer Ledger",
    "/accounts": "Financial Accounts",
    "/accounting": "Double-Entry Accounting & GL",
    "/hr-payroll": "HR, Payroll & Sales Commissions",
    "/payments": "Payment Vouchers",
    "/cash-drawer": "Cash Drawer",
    "/expenses": "Operating Expenses",
    "/product-batches": "Product Batches",
    "/reports/net-profit": "Profit & Loss Statement",
    "/reports/tax-return": "Statutory Tax & GST Return",
    "/stock-adjustments": "Stock Adjustments",
    "/stock-adjustments/create": "Add Stock Adjustment",
    "/stocktake-sessions": "Stocktake Sessions",
    "/stocktake-sessions/create": "New Stocktake Session",
    "/backups": "Backups & Offsite Storage",
    "/activate": "License Activation",
  };

  const currentPath = location.pathname;
  const resolvePageTitle = useCallback((path) => {
    const cleanPath = (path || "").split("?")[0].replace(/\/+$/, "") || "/dashboard";
    if (titles[cleanPath]) return titles[cleanPath];
    if (/^\/products\/\d+\/edit$/.test(cleanPath)) return "Edit Product";
    if (/^\/brands\/\d+\/edit$/.test(cleanPath)) return "Edit Brand";
    if (/^\/suppliers\/\d+\/edit$/.test(cleanPath)) return "Edit Supplier";
    if (/^\/customers\/\d+\/edit$/.test(cleanPath)) return "Edit Customer";
    if (/^\/stock-adjustments\/\d+$/.test(cleanPath)) return "Stock Adjustment Details";
    if (/^\/stocktake-sessions\/\d+\/review$/.test(cleanPath)) return "Stocktake Variance Review";
    if (/^\/stocktake-sessions\/\d+$/.test(cleanPath)) return "Stocktake Session";
    if (/^\/stock-disposals\/\d+$/.test(cleanPath)) return "Quarantine / Disposal Details";
    if (/^\/sale-invoices\/\d+\/edit$/.test(cleanPath)) return "Edit Sale Invoice";
    if (/^\/sale-invoices\/\d+$/.test(cleanPath)) return "Sale Invoice Details";
    if (/^\/purchase-invoices\/\d+\/edit$/.test(cleanPath)) return "Edit Purchase Invoice";
    if (/^\/purchase-invoices\/\d+$/.test(cleanPath)) return "Purchase Invoice Details";
    if (/^\/sale-returns\/\d+\/edit$/.test(cleanPath)) return "Edit Sale Return";
    if (/^\/sale-returns\/\d+$/.test(cleanPath)) return "Sale Return Details";
    if (/^\/purchase-returns\/\d+\/edit$/.test(cleanPath)) return "Edit Purchase Return";
    if (/^\/purchase-returns\/\d+$/.test(cleanPath)) return "Purchase Return Details";
    if (/^\/purchase-orders\/\d+\/edit$/.test(cleanPath)) return "Edit Purchase Order";
    if (/^\/purchase-orders\/\d+$/.test(cleanPath)) return "Purchase Order Details";
    if (/^\/users\/\d+\/edit$/.test(cleanPath)) return "Edit User";
    if (/^\/roles\/\d+\/edit$/.test(cleanPath)) return "Edit Role";
    return resolveTitleForPath(cleanPath, "Dashboard");
  }, []);

  const pageTitle = resolvePageTitle(currentPath);

  // Build ordered list of all Browser Tabs (Primary "main" tab + dynamic tabs, pinned first)
  const allTabs = useMemo(() => {
    const mainTab = {
      id: "main",
      title: pageTitle,
      path: currentPath,
      pinned: mainTabPinned,
      isMain: true,
      reloadKey: 0,
    };
    const byId = new Map([["main", mainTab]]);
    for (const w of subWindows) {
      byId.set(w.id, w);
    }

    const ordered = [];
    for (const id of tabOrder) {
      if (byId.has(id)) {
        ordered.push(byId.get(id));
        byId.delete(id);
      }
    }
    for (const remaining of byId.values()) {
      ordered.push(remaining);
    }

    const pinned = ordered.filter((t) => t.pinned);
    const unpinned = ordered.filter((t) => !t.pinned);
    return [...pinned, ...unpinned];
  }, [pageTitle, currentPath, mainTabPinned, subWindows, tabOrder]);

  const effectiveActiveTabId = useMemo(() => {
    if (activeSubWindowId && allTabs.some((t) => t.id === activeSubWindowId)) {
      return activeSubWindowId;
    }
    return "main";
  }, [activeSubWindowId, allTabs]);

  const activeTabObj = useMemo(
    () => allTabs.find((t) => t.id === effectiveActiveTabId) || allTabs[0],
    [allTabs, effectiveActiveTabId]
  );

  // Sync active tab ID and document.title globally
  useEffect(() => {
    if (!isSubWindow && typeof window !== "undefined") {
      window.__karobarActiveTabId = effectiveActiveTabId;
    }
    const activeTitle = isSubWindow ? pageTitle : activeTabObj?.title || pageTitle;
    document.title = `${activeTitle} - ${appName || "Karobar-App"}`;
  }, [isSubWindow, effectiveActiveTabId, activeTabObj, pageTitle, appName]);

  // If rendered inside a tab iframe, notify parent whenever route/title changes
  useEffect(() => {
    if (!isSubWindow) return;
    if (!subWinIdRef.current) {
      const parsed = new URLSearchParams(window.location.search).get("winId");
      if (parsed) subWinIdRef.current = parsed;
    }
    try {
      window.parent?.postMessage(
        {
          type: "karobar:subwindow-route-sync",
          winId: subWinIdRef.current,
          path: location.pathname,
          title: pageTitle,
        },
        "*"
      );
    } catch {}
  }, [isSubWindow, location.pathname, pageTitle]);

  const showCycleHud = useCallback((targetTabId, direction = 1) => {
    if (hudTimerRef.current) {
      clearTimeout(hudTimerRef.current);
    }
    setTabCycleHud({
      visible: true,
      activeTabId: targetTabId,
      direction,
    });
    hudTimerRef.current = setTimeout(() => {
      setTabCycleHud(null);
      hudTimerRef.current = null;
    }, 850);
  }, []);

  // --- Browser Tab Operations Inside Main Window ---
  const focusSubWindow = useCallback(
    (id, options = {}) => {
      const targetId = id || "main";
      setActiveSubWindowId(targetId);
      if (options.showHud) {
        showCycleHud(targetId, options.direction || 1);
      }
      setTimeout(() => {
        if (targetId === "main") {
          try {
            window.focus();
          } catch {}
        } else {
          try {
            iframeRefs.current[targetId]?.contentWindow?.focus();
          } catch {}
        }
      }, 20);
    },
    [showCycleHud]
  );

  const openSubWindow = useCallback(
    (path, title) => {
      const cleanPath = (path || "/dashboard").split("?")[0];
      const resolvedTitle =
        title || resolvePageTitle(cleanPath) || resolveTitleForPath(cleanPath, "Workspace Tab");
      const nextId = `subwin-${winIdCounterRef.current++}-${Date.now().toString(36)}`;

      setSubWindows((prev) => [
        ...prev,
        {
          id: nextId,
          title: resolvedTitle,
          path: cleanPath,
          pinned: false,
          reloadKey: 0,
        },
      ]);
      setTabOrder((prev) => [...prev, nextId]);
      focusSubWindow(nextId);
    },
    [resolvePageTitle, focusSubWindow]
  );

  const navigateActiveTab = useCallback(
    (path, title) => {
      const targetPath = path || "/dashboard";
      const cleanPath = targetPath.split("?")[0];
      const resolvedTitle = title || resolvePageTitle(cleanPath);

      if (effectiveActiveTabId === "main") {
        navigate(targetPath);
        return;
      }

      setSubWindows((prev) =>
        prev.map((w) =>
          w.id === effectiveActiveTabId
            ? { ...w, path: cleanPath, title: resolvedTitle }
            : w
        )
      );

      const frameWin = iframeRefs.current[effectiveActiveTabId]?.contentWindow;
      if (frameWin) {
        try {
          frameWin.postMessage(
            { type: "karobar:subwindow-navigate", path: targetPath },
            "*"
          );
          frameWin.focus();
          return;
        } catch {}
      }
    },
    [effectiveActiveTabId, navigate, resolvePageTitle]
  );

  const cycleSubWindow = useCallback(
    (direction = 1) => {
      const now = Date.now();
      if (now - lastTabCycleTsRef.current < 55) return;
      lastTabCycleTsRef.current = now;

      if (!allTabs.length) return;
      if (allTabs.length === 1) {
        showCycleHud(allTabs[0].id, direction);
        return;
      }
      const curIdx = allTabs.findIndex((t) => t.id === effectiveActiveTabId);
      const safeIdx = curIdx === -1 ? 0 : curIdx;
      const nextIdx = (safeIdx + direction + allTabs.length) % allTabs.length;
      const nextTab = allTabs[nextIdx];
      if (nextTab) {
        focusSubWindow(nextTab.id, { showHud: true, direction });
      }
    },
    [allTabs, effectiveActiveTabId, focusSubWindow, showCycleHud]
  );

  const jumpToTabByNumber = useCallback(
    (num) => {
      if (!allTabs.length || num < 1 || num > 9) return;
      const targetTab =
        num === 9 ? allTabs[allTabs.length - 1] : allTabs[num - 1];
      if (targetTab) {
        focusSubWindow(targetTab.id, { showHud: true, direction: 1 });
      }
    },
    [allTabs, focusSubWindow]
  );

  const closeSubWindow = useCallback(
    (id) => {
      const targetId = id || effectiveActiveTabId || "main";
      const targetTab = allTabs.find((t) => t.id === targetId);
      if (targetTab) {
        setClosedTabs((prev) =>
          [{ title: targetTab.title, path: targetTab.path, closedAt: Date.now() }, ...prev].slice(
            0,
            15
          )
        );
      }

      if (targetId === "main") {
        if (allTabs.length > 1) {
          const idx = allTabs.findIndex((t) => t.id === "main");
          const nextTab = allTabs[idx + 1] || allTabs[idx - 1];
          if (nextTab && effectiveActiveTabId === "main") {
            focusSubWindow(nextTab.id);
          }
        }
        if (currentPath !== "/dashboard") {
          navigate("/dashboard");
        }
        return;
      }

      const idxInAll = allTabs.findIndex((t) => t.id === targetId);
      const fallbackTab =
        allTabs[idxInAll + 1] || allTabs[idxInAll - 1] || { id: "main" };

      setSubWindows((prev) => prev.filter((w) => w.id !== targetId));
      setTabOrder((prev) => prev.filter((tid) => tid !== targetId));

      if (effectiveActiveTabId === targetId) {
        focusSubWindow(fallbackTab.id);
      }
    },
    [effectiveActiveTabId, allTabs, currentPath, navigate, focusSubWindow]
  );

  const duplicateSubWindow = useCallback(
    (id) => {
      const targetId = id || effectiveActiveTabId || "main";
      const target = allTabs.find((t) => t.id === targetId);
      if (!target) {
        openSubWindow(currentPath || "/dashboard", pageTitle);
        return;
      }
      openSubWindow(target.path, target.title);
    },
    [effectiveActiveTabId, allTabs, openSubWindow, currentPath, pageTitle]
  );

  const reloadSubWindow = useCallback(
    (id) => {
      const targetId = id || effectiveActiveTabId || "main";
      if (targetId === "main") {
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "r",
            code: "KeyR",
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          })
        );
        return;
      }
      setSubWindows((prev) =>
        prev.map((w) =>
          w.id === targetId ? { ...w, reloadKey: (w.reloadKey || 0) + 1 } : w
        )
      );
    },
    [effectiveActiveTabId]
  );

  const togglePinSubWindow = useCallback((id) => {
    const targetId = id || "main";
    if (targetId === "main") {
      setMainTabPinned((prev) => !prev);
      return;
    }
    setSubWindows((prev) =>
      prev.map((w) => (w.id === targetId ? { ...w, pinned: !w.pinned } : w))
    );
  }, []);

  const reorderSubWindows = useCallback(
    (sourceId, targetId) => {
      if (!sourceId || !targetId || sourceId === targetId) return;
      setTabOrder(() => {
        const currentIds = allTabs.map((t) => t.id);
        const fromIdx = currentIds.indexOf(sourceId);
        const toIdx = currentIds.indexOf(targetId);
        if (fromIdx === -1 || toIdx === -1) return currentIds;
        const next = [...currentIds];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        return next;
      });
    },
    [allTabs]
  );

  const reopenLastClosedTab = useCallback(
    (index = 0) => {
      setClosedTabs((prev) => {
        if (!prev.length || index < 0 || index >= prev.length) return prev;
        const target = prev[index];
        if (target) {
          setTimeout(() => {
            openSubWindow(target.path, target.title);
          }, 0);
        }
        return prev.filter((_, i) => i !== index);
      });
    },
    [openSubWindow]
  );

  const closeOtherSubWindows = useCallback(
    (keepId) => {
      const targetKeepId = keepId || effectiveActiveTabId || "main";
      setSubWindows((prev) => {
        const toClose = prev.filter((w) => w.id !== targetKeepId && !w.pinned);
        if (toClose.length) {
          setClosedTabs((old) =>
            [
              ...toClose.map((w) => ({
                title: w.title,
                path: w.path,
                closedAt: Date.now(),
              })),
              ...old,
            ].slice(0, 15)
          );
        }
        return prev.filter((w) => w.id === targetKeepId || w.pinned);
      });
      focusSubWindow(targetKeepId);
    },
    [effectiveActiveTabId, focusSubWindow]
  );

  const closeSubWindowsToRight = useCallback(
    (fromId) => {
      const idx = allTabs.findIndex((t) => t.id === fromId);
      if (idx === -1) return;
      const rightIds = new Set(
        allTabs
          .slice(idx + 1)
          .filter((t) => !t.isMain && !t.pinned)
          .map((t) => t.id)
      );
      if (!rightIds.size) return;

      setSubWindows((prev) => {
        const toClose = prev.filter((w) => rightIds.has(w.id));
        if (toClose.length) {
          setClosedTabs((old) =>
            [
              ...toClose.map((w) => ({
                title: w.title,
                path: w.path,
                closedAt: Date.now(),
              })),
              ...old,
            ].slice(0, 15)
          );
        }
        return prev.filter((w) => !rightIds.has(w.id));
      });

      if (rightIds.has(effectiveActiveTabId)) {
        focusSubWindow(fromId);
      }
    },
    [allTabs, effectiveActiveTabId, focusSubWindow]
  );

  const closeAllSubWindows = useCallback(() => {
    setSubWindows((prev) => {
      if (prev.length) {
        setClosedTabs((old) =>
          [
            ...prev.map((w) => ({
              title: w.title,
              path: w.path,
              closedAt: Date.now(),
            })),
            ...old,
          ].slice(0, 15)
        );
      }
      return [];
    });
    setTabOrder(["main"]);
    focusSubWindow("main");
  }, [focusSubWindow]);

  const openSalePurchaseSplit = useCallback(() => {
    openSubWindow("/sale-invoices/create/retail", "Retail Sale Invoice");
    openSubWindow("/purchase-invoices/create", "Purchase Invoice");
  }, [openSubWindow]);

  // Sync hidden="until-found" beforematch events so Find-in-Page activates the matched tab
  useEffect(() => {
    if (isSubWindow) return;
    const cleanups = [];

    if (mainPanelRef.current) {
      const onMainMatch = () => focusSubWindow("main");
      mainPanelRef.current.addEventListener("beforematch", onMainMatch);
      cleanups.push(() =>
        mainPanelRef.current?.removeEventListener("beforematch", onMainMatch)
      );
    }

    for (const win of subWindows) {
      const panelEl = tabPanelRefs.current[win.id];
      if (panelEl) {
        const onMatch = () => focusSubWindow(win.id);
        panelEl.addEventListener("beforematch", onMatch);
        cleanups.push(() => panelEl.removeEventListener("beforematch", onMatch));
      }
    }

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [isSubWindow, subWindows, focusSubWindow]);

  // Listen to Electron Native Top Menu IPC events, Tab Frame Sync & Keyboard Shortcuts
  useEffect(() => {
    if (isSubWindow) {
      const handleParentMessage = (event) => {
        const data = event?.data;
        if (!data || typeof data !== "object") return;
        if (data.type === "karobar:subwindow-navigate" && data.path) {
          navigate(data.path);
        }
      };

      // Forward global & Browser-Tab shortcuts from inside Sub-Window iframe to top window
      const forwardGlobalShortcuts = (e) => {
        // 1. Ctrl+Tab / Ctrl+Shift+Tab cycle tabs immediately
        if (
          e.ctrlKey &&
          !e.altKey &&
          !e.metaKey &&
          (e.key === "Tab" || e.code === "Tab")
        ) {
          e.preventDefault();
          e.stopPropagation();
          try {
            window.top?.dispatchEvent(
              new CustomEvent("karobar:tab-command", {
                detail: { command: e.shiftKey ? "prev-tab" : "next-tab" },
              })
            );
          } catch {}
          return;
        }

        // Ctrl+PageDown / Ctrl+PageUp and Ctrl+] / Ctrl+[ cycle tabs
        if (
          e.ctrlKey &&
          !e.altKey &&
          !e.metaKey &&
          !e.shiftKey &&
          (e.key === "PageDown" ||
            e.key === "PageUp" ||
            e.code === "BracketRight" ||
            e.code === "BracketLeft")
        ) {
          e.preventDefault();
          e.stopPropagation();
          const isPrev = e.key === "PageUp" || e.code === "BracketLeft";
          try {
            window.top?.dispatchEvent(
              new CustomEvent("karobar:tab-command", {
                detail: { command: isPrev ? "prev-tab" : "next-tab" },
              })
            );
          } catch {}
          return;
        }

        // Ctrl+Shift+1..9 jumps directly to tab 1..8 or last tab (9)
        if (
          (e.ctrlKey || e.metaKey) &&
          e.shiftKey &&
          !e.altKey &&
          /^Digit[1-9]$/.test(e.code)
        ) {
          e.preventDefault();
          e.stopPropagation();
          const num = Number(e.code.replace("Digit", ""));
          try {
            window.top?.dispatchEvent(
              new CustomEvent("karobar:tab-command", {
                detail: { command: "jump-tab", index: num },
              })
            );
          } catch {}
          return;
        }

        if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && e.key === "F4") {
          e.preventDefault();
          e.stopPropagation();
          try {
            window.top?.dispatchEvent(
              new CustomEvent("karobar:tab-command", {
                detail: { command: "close-active-tab" },
              })
            );
          } catch {}
          return;
        }

        if (e.defaultPrevented) return;
        const tag = (e.target?.tagName || "").toLowerCase();
        const isTyping =
          ["input", "textarea", "select"].includes(tag) || e.target?.isContentEditable;

        if (!isTyping && e.key === "?") {
          e.preventDefault();
          try {
            window.top?.dispatchEvent(new CustomEvent("open-shortcuts-modal"));
          } catch {}
          return;
        }

        const hasCtrl = e.ctrlKey || e.metaKey;
        if (!hasCtrl || e.altKey) return;
        const key = (e.key || "").toLowerCase();
        const cleanSubPath = (window.location.pathname || "").replace(/\/+$/, "");

        if (e.shiftKey) {
          if (["a", "o", "q", "n", "p", "s", "w", "u", "l", "d", "t", "g", "c", "m", "x", "h"].includes(key)) {
            e.preventDefault();
            try {
              window.top?.dispatchEvent(
                new KeyboardEvent("keydown", {
                  key: e.key,
                  code: e.code,
                  ctrlKey: e.ctrlKey,
                  metaKey: e.metaKey,
                  shiftKey: true,
                  altKey: false,
                  bubbles: true,
                  cancelable: true,
                })
              );
            } catch {}
          }
          return;
        }

        // Plain Ctrl+<key> global shortcuts inside Sub-Window Tab
        if (key === "k" || e.code === "KeyK") {
          e.preventDefault();
          try {
            window.top?.dispatchEvent(new CustomEvent("open-page-search"));
          } catch {}
        } else if (key === "g" || e.code === "KeyG") {
          e.preventDefault();
          try {
            window.top?.dispatchEvent(new CustomEvent("open-guide-bot"));
          } catch {}
        } else if (key === "p" || e.code === "KeyP") {
          e.preventDefault();
          if (
            /^\/(sale-invoices|wholesale-invoices)\/(\d+(\/edit)?|create(\/(retail|wholesale))?|create-retail|create-wholesale|pos|barcode-pos)$/.test(cleanSubPath) ||
            /^\/(purchase-invoices|stock-adjustments|purchase-orders)\/\d+$/.test(cleanSubPath) ||
            /^\/(purchase-orders\/forecast|smart-reorder|customer-ledger|supplier-ledger|barcode-labels)$/.test(cleanSubPath) ||
            (/^\/(sale-returns|purchase-returns)$/.test(cleanSubPath) && document.querySelector(".fixed.inset-0.z-50"))
          ) {
            return;
          }
          if (/^\/(reports\/|accounting$|hr-payroll$|payments$)/.test(cleanSubPath)) {
            printCurrentView();
            return;
          }
          try {
            window.top?.dispatchEvent(new CustomEvent("open-product-search"));
          } catch {}
        } else if (e.code === "Digit1" || e.code === "Numpad1") {
          e.preventDefault();
          try {
            window.top?.dispatchEvent(
              new CustomEvent("karobar:open-subwindow", {
                detail: { path: "/purchase-invoices/create", title: "Purchase Invoice" },
              })
            );
          } catch {}
        } else if (e.code === "Digit2" || e.code === "Numpad2") {
          e.preventDefault();
          try {
            window.top?.dispatchEvent(
              new CustomEvent("karobar:open-subwindow", {
                detail: { path: "/sale-invoices/create/retail", title: "Retail Sale Invoice" },
              })
            );
          } catch {}
        } else if (e.code === "Digit3" || e.code === "Numpad3") {
          e.preventDefault();
          try {
            window.top?.dispatchEvent(
              new CustomEvent("karobar:open-subwindow", {
                detail: {
                  path: "/sale-invoices/create/wholesale",
                  title: "Wholesale Sale Invoice",
                },
              })
            );
          } catch {}
        }
      };

      window.addEventListener("message", handleParentMessage);
      window.addEventListener("keydown", forwardGlobalShortcuts, true);
      return () => {
        window.removeEventListener("message", handleParentMessage);
        window.removeEventListener("keydown", forwardGlobalShortcuts, true);
      };
    }

    const markMdiAction = () => {
      const now = Date.now();
      if (now - lastMdiActionTsRef.current < 160) return false;
      lastMdiActionTsRef.current = now;
      return true;
    };

    const handleCustomOpen = (e) => {
      const detail = e.detail || {};
      openSubWindow(
        detail.path || activeTabObj?.path || currentPath || "/dashboard",
        detail.title
      );
    };

    const handleCustomNavigateActive = (e) => {
      const detail = e.detail || {};
      if (detail.path) {
        if (defaultSubWindowMode) {
          openSubWindow(detail.path, detail.title);
        } else {
          navigateActiveTab(detail.path, detail.title);
        }
      }
    };

    const handleSubWindowMessage = (event) => {
      const data = event?.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "karobar:subwindow-route-sync" && data.winId && data.path) {
        setSubWindows((prev) =>
          prev.map((w) =>
            w.id === data.winId
              ? {
                  ...w,
                  path: data.path,
                  title: data.title || resolvePageTitle(data.path),
                }
              : w
          )
        );
      }
    };

    const handleTabCommandEvent = (e) => {
      const detail = e.detail || {};
      const cmd = detail.command;
      if (cmd === "next-tab") {
        cycleSubWindow(1);
      } else if (cmd === "prev-tab") {
        cycleSubWindow(-1);
      } else if (cmd === "jump-tab" && detail.index) {
        jumpToTabByNumber(Number(detail.index));
      } else if (cmd === "close-active-tab") {
        closeSubWindow(effectiveActiveTabId);
      } else if (cmd === "open-tab-search") {
        dispatchOpenTabSearch(detail.mode || "new-tab");
      } else if (cmd === "new-tab") {
        openSubWindow("/dashboard", "Dashboard");
      }
    };

    window.addEventListener("karobar:open-subwindow", handleCustomOpen);
    window.addEventListener("karobar:navigate-active-tab", handleCustomNavigateActive);
    window.addEventListener("karobar:tab-command", handleTabCommandEvent);
    window.addEventListener("message", handleSubWindowMessage);

    const desktopApi = window.karobarDesktop;
    const unsubNav = desktopApi?.onNavigate?.((payload) => {
      if (payload?.path && markMdiAction()) {
        navigateActiveTab(payload.path, payload.title);
      }
    });
    const unsubSubWin = desktopApi?.onOpenSubWindow?.((payload) => {
      if (payload?.path && markMdiAction()) {
        openSubWindow(payload.path, payload.title);
      }
    });
    const unsubCmd = desktopApi?.onWindowCommand?.((payload) => {
      const cmd = payload?.command;
      if (cmd === "set-menu-subwindow-mode") {
        setDefaultSubWindowMode(Boolean(payload?.enabled));
        return;
      }
      if (cmd === "next-tab") {
        cycleSubWindow(1);
        return;
      }
      if (cmd === "prev-tab") {
        cycleSubWindow(-1);
        return;
      }
      if (cmd === "jump-tab" && payload?.index) {
        jumpToTabByNumber(Number(payload.index));
        return;
      }
      if (!markMdiAction()) return;
      if (cmd === "open-current" || cmd === "duplicate-tab") {
        duplicateSubWindow(effectiveActiveTabId);
      } else if (cmd === "open-tab-search") {
        dispatchOpenTabSearch(payload?.mode || "all");
      } else if (cmd === "new-tab") {
        openSubWindow("/dashboard", "Dashboard");
      } else if (cmd === "close-active-tab") {
        closeSubWindow(effectiveActiveTabId);
      } else if (cmd === "reopen-closed-tab") {
        reopenLastClosedTab(0);
      } else if (cmd === "preset-sale-purchase") {
        openSalePurchaseSplit();
      } else if (cmd === "close-others") {
        closeOtherSubWindows(effectiveActiveTabId);
      } else if (cmd === "close-all") {
        closeAllSubWindows();
      }
    });

    const handleKeyShortcuts = (e) => {
      // 1. Ctrl+Tab / Ctrl+Shift+Tab cycle tabs
      if (
        e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        (e.key === "Tab" || e.code === "Tab")
      ) {
        e.preventDefault();
        e.stopPropagation();
        cycleSubWindow(e.shiftKey ? -1 : 1);
        return;
      }

      // 2. Ctrl+PageDown / Ctrl+PageUp and Ctrl+] / Ctrl+[ cycle tabs
      if (
        e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        !e.shiftKey &&
        (e.key === "PageDown" ||
          e.key === "PageUp" ||
          e.code === "BracketRight" ||
          e.code === "BracketLeft")
      ) {
        e.preventDefault();
        e.stopPropagation();
        const isPrev = e.key === "PageUp" || e.code === "BracketLeft";
        cycleSubWindow(isPrev ? -1 : 1);
        return;
      }

      // 3. Ctrl+Shift+1..9 jumps directly to tab 1..8 or last tab (9)
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        !e.altKey &&
        /^Digit[1-9]$/.test(e.code)
      ) {
        e.preventDefault();
        e.stopPropagation();
        jumpToTabByNumber(Number(e.code.replace("Digit", "")));
        return;
      }

      // 4. Ctrl+F4 closes active tab
      if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && e.key === "F4") {
        e.preventDefault();
        e.stopPropagation();
        if (markMdiAction()) {
          closeSubWindow(effectiveActiveTabId);
        }
        return;
      }

      // 5. Ctrl+Shift+<Key> Browser Tab & Quick-Open Shortcuts
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey) {
        const key = (e.key || "").toLowerCase();
        if (!["a", "o", "q", "n", "p", "s", "w", "u", "l", "d", "t", "g", "c", "m", "x", "h"].includes(key)) {
          return;
        }
        e.preventDefault();
        if (!markMdiAction()) return;

        if (key === "a" || key === "o") {
          dispatchOpenTabSearch(key === "o" ? "new-tab" : "all");
        } else if (key === "q") {
          closeSubWindow(effectiveActiveTabId);
        } else if (key === "n") {
          openSubWindow("/dashboard", "Dashboard");
        } else if (key === "d") {
          duplicateSubWindow(effectiveActiveTabId);
        } else if (key === "t") {
          reopenLastClosedTab(0);
        } else if (key === "p") {
          openSubWindow("/sale-invoices/pos", "POS Terminal");
        } else if (key === "s") {
          openSubWindow("/sale-invoices/create/retail", "Retail Sale Invoice");
        } else if (key === "w") {
          openSubWindow("/sale-invoices/create/wholesale", "Wholesale Sale Invoice");
        } else if (key === "u") {
          openSubWindow("/purchase-invoices/create", "Purchase Invoice");
        } else if (key === "l") {
          openSubWindow("/customer-ledger", "Customer Ledger");
        } else if (key === "x") {
          closeOtherSubWindows(effectiveActiveTabId);
        } else if (key === "m" || key === "c" || key === "g") {
          cycleSubWindow(1);
        } else if (key === "h") {
          focusSubWindow("main");
          navigate("/dashboard");
        }
      }
    };
    window.addEventListener("keydown", handleKeyShortcuts, true);

    return () => {
      window.removeEventListener("karobar:open-subwindow", handleCustomOpen);
      window.removeEventListener("karobar:navigate-active-tab", handleCustomNavigateActive);
      window.removeEventListener("karobar:tab-command", handleTabCommandEvent);
      window.removeEventListener("message", handleSubWindowMessage);
      window.removeEventListener("keydown", handleKeyShortcuts, true);
      if (typeof unsubNav === "function") unsubNav();
      if (typeof unsubSubWin === "function") unsubSubWin();
      if (typeof unsubCmd === "function") unsubCmd();
    };
  }, [
    isSubWindow,
    currentPath,
    pageTitle,
    activeTabObj,
    effectiveActiveTabId,
    defaultSubWindowMode,
    navigate,
    resolvePageTitle,
    openSubWindow,
    navigateActiveTab,
    cycleSubWindow,
    jumpToTabByNumber,
    closeSubWindow,
    duplicateSubWindow,
    reopenLastClosedTab,
    openSalePurchaseSplit,
    closeOtherSubWindows,
    closeAllSubWindows,
    focusSubWindow,
  ]);

  // Close mobile sidebar and floating dock on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
    setDockOpen(false);
    clearDockTimers();
  }, [location.pathname, clearDockTimers]);

  // Close floating dock or mobile sidebar on Escape key
  useEffect(() => {
    if ((!dockOpen || sidebarPinned) && !mobileSidebarOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setDockOpen(false);
        setMobileSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dockOpen, sidebarPinned, mobileSidebarOpen]);

  // Cleanup timers on unmount
  useEffect(
    () => () => {
      clearDockTimers();
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    },
    [clearDockTimers]
  );

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileSidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileSidebarOpen]);

  // If this instance is rendered inside a Browser Tab iframe, preserve .workspace-shell CSS variables & styling seamlessly
  if (isSubWindow) {
    return (
      <div className="workspace-shell !p-2 sm:!p-3 !min-h-screen">
        <div className="workspace-main">
          <main className="workspace-content">
            <div className="workspace-page !pt-1 !pb-2">
              <Toaster position="top-right" reverseOrder={false} />
              <ProtectedRoute>
                <Suspense fallback={<PageSkeleton />}>
                  {children ?? <Outlet />}
                </Suspense>
              </ProtectedRoute>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // --- Responsive layout ---
  //  • Mobile (< lg):  sidebar becomes a slide-over overlay
  //  • Desktop (≥ lg):  macOS Dock auto-hide on left edge hover by default, or fixed when pinned
  return (
    <div className="workspace-shell">
      {sidebarPinned ? (
        /* Desktop Pinned Mode — docked side-by-side on lg+ */
        <div className="workspace-sidebar-slot hidden lg:block lg:shrink-0">
          <div className="workspace-sidebar-position">
            <Sidebar
              appName={appName}
              logoUrl={logoUrl}
              isPinned={sidebarPinned}
              onTogglePin={handleTogglePin}
            />
          </div>
        </div>
      ) : (
        /* Desktop macOS Dock Mode — left edge trigger + floating dock on lg+ */
        <>
          <div
            className="workspace-dock-trigger hidden lg:flex"
            onMouseEnter={handleDockTriggerEnter}
            onMouseLeave={handleDockTriggerLeave}
            onClick={() => {
              clearDockTimers();
              setDockOpen(true);
            }}
            role="button"
            tabIndex={0}
            aria-label="Reveal navigation dock"
            aria-expanded={dockOpen}
            title="Hover or click to open Navigation Dock"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setDockOpen(true);
              }
            }}
          >
            <div className="workspace-dock-pill" />
          </div>

          <div
            className={`workspace-dock-floating hidden lg:block ${dockOpen ? "is-open" : ""}`}
            onMouseEnter={handleDockPanelEnter}
            onMouseLeave={handleDockPanelLeave}
          >
            <Sidebar
              appName={appName}
              logoUrl={logoUrl}
              isPinned={sidebarPinned}
              onTogglePin={handleTogglePin}
              isDockOpen={dockOpen}
              onRequestCloseDock={() => setDockOpen(false)}
            />
          </div>
        </>
      )}

      {/* Mobile sidebar overlay — slide-in panel on < lg */}
      {mobileSidebarOpen && (
        <>
          {/* Backdrop */}
          <div
            className="workspace-mobile-scrim fixed inset-0 lg:hidden kd-mobile-backdrop"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Close sidebar"
          />
          {/* Slide-in panel */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="
              workspace-mobile-drawer fixed inset-y-3 left-3 w-[286px] max-w-[calc(100dvw-24px)]
              kd-mobile-panel
              lg:hidden
            "
          >
            <div className="h-full">
              <Sidebar
                appName={appName}
                logoUrl={logoUrl}
                isPinned={false}
                onRequestCloseDock={() => setMobileSidebarOpen(false)}
              />
            </div>
          </div>
        </>
      )}

      {/* Main content area — Chrome-Style Top Browser Tab Bar + Topbar + Keep-Alive Tab Panels */}
      <div className="workspace-main">
        <SubWindowManager
          tabs={allTabs}
          activeWindowId={effectiveActiveTabId}
          closedTabs={closedTabs}
          tabCycleHud={tabCycleHud}
          onFocusWindow={focusSubWindow}
          onCloseWindow={closeSubWindow}
          onReloadWindow={reloadSubWindow}
          onDuplicateWindow={duplicateSubWindow}
          onTogglePinWindow={togglePinSubWindow}
          onReorderWindows={reorderSubWindows}
          onOpenNewTab={openSubWindow}
          onReopenClosedTab={reopenLastClosedTab}
          onCloseOtherWindows={closeOtherSubWindows}
          onCloseWindowsToRight={closeSubWindowsToRight}
          onCloseAll={closeAllSubWindows}
        />

        <Topbar
          pageTitle={activeTabObj?.title || pageTitle}
          onMobileMenuClick={() => setMobileSidebarOpen(true)}
          sidebarPinned={sidebarPinned}
          onDesktopDockOpen={() => {
            clearDockTimers();
            setDockOpen((v) => !v);
          }}
          onOpenCurrentInSubWindow={() =>
            duplicateSubWindow(effectiveActiveTabId)
          }
        />

        <main className="workspace-content">
          {/* Primary Tab Panel ("main") */}
          <div
            ref={mainPanelRef}
            role="tabpanel"
            aria-labelledby="workspace-tab-main"
            hidden={effectiveActiveTabId !== "main" ? "until-found" : undefined}
            className="workspace-tabpanel"
          >
            <div className="workspace-page">
              <Toaster position="top-right" reverseOrder={false} />
              <ProtectedRoute>
                <Suspense fallback={<PageSkeleton />}>
                  {children ?? <Outlet />}
                </Suspense>
              </ProtectedRoute>
            </div>
          </div>

          {/* Keep-Alive Browser Tab Panels */}
          {subWindows.map((win) => {
            const isSelected = effectiveActiveTabId === win.id;
            const iframeSrc = `${win.path}${win.path.includes("?") ? "&" : "?"}subwindow=1&winId=${win.id}&reloadKey=${win.reloadKey || 0}`;

            return (
              <div
                key={win.id}
                ref={(el) => {
                  if (el) tabPanelRefs.current[win.id] = el;
                  else delete tabPanelRefs.current[win.id];
                }}
                role="tabpanel"
                aria-labelledby={`workspace-tab-${win.id}`}
                hidden={!isSelected ? "until-found" : undefined}
                className="workspace-tabpanel"
              >
                <div className="workspace-tabpanel-inner">
                  <iframe
                    ref={(el) => {
                      if (el) iframeRefs.current[win.id] = el;
                      else delete iframeRefs.current[win.id];
                    }}
                    key={`${win.id}-${win.reloadKey || 0}`}
                    src={iframeSrc}
                    title={`${win.title} workspace tab`}
                    className="workspace-tab-iframe"
                  />
                </div>
              </div>
            );
          })}
        </main>

        <AppUpdateNotification />
        <SessionExpiryModal />
      </div>
    </div>
  );
}
