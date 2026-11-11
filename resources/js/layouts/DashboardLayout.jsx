// src/layouts/DashboardLayout.jsx
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";
import Topbar from "../components/Topbar.jsx";
import ProtectedRoute from "../components/ProtectedRoute.jsx";
import PageSkeleton from "../components/PageSkeleton.jsx";
import SubWindowManager, {
  resolveTitleForPath,
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

  // Brand from /api/settings
  const [appName, setAppName] = useState("Karobar-App");
  const [logoUrl, setLogoUrl] = useState(null);

  // Multi-Window (MDI Sub-Windows) State inside Main Window
  const [subWindows, setSubWindows] = useState([]);
  const [activeSubWindowId, setActiveSubWindowId] = useState(null);
  const [defaultSubWindowMode, setDefaultSubWindowMode] = useState(false);
  const zCounterRef = useRef(100);
  const winIdCounterRef = useRef(1);
  const lastMdiActionTsRef = useRef(0);

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
  const resolvePageTitle = (path) => {
    const cleanPath = (path || "").replace(/\/+$/, "") || "/dashboard";
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
    return "Dashboard";
  };
  const pageTitle = resolvePageTitle(currentPath);

  useEffect(() => {
    document.title = `${pageTitle} - ${appName || "Karobar-App"}`;
  }, [pageTitle, appName]);

  // --- Sub-Window (MDI) Operations Inside Main Window ---
  const openSubWindow = useCallback((path, title, customBounds = null) => {
    const cleanPath = (path || "/dashboard").split("?")[0];
    const resolvedTitle = title || resolveTitleForPath(cleanPath, "Workspace Window");
    const nextZ = ++zCounterRef.current;
    const nextId = `subwin-${winIdCounterRef.current++}-${Date.now().toString(36)}`;

    setSubWindows((prev) => {
      const idx = prev.length;
      const offset = (idx % 6) * 32;
      const vw = typeof window !== "undefined" ? window.innerWidth : 1366;
      const vh = typeof window !== "undefined" ? window.innerHeight : 820;
      const defaultW = Math.min(1040, Math.max(640, Math.floor(vw * 0.72)));
      const defaultH = Math.min(720, Math.max(460, Math.floor(vh * 0.76)));
      const defaultX = Math.max(24, Math.min(vw - defaultW - 24, 90 + offset));
      const defaultY = Math.max(44, Math.min(vh - defaultH - 56, 56 + offset));

      return [
        ...prev,
        {
          id: nextId,
          title: resolvedTitle,
          path: cleanPath,
          x: customBounds?.x ?? defaultX,
          y: customBounds?.y ?? defaultY,
          width: customBounds?.width ?? defaultW,
          height: customBounds?.height ?? defaultH,
          isMinimized: false,
          isMaximized: false,
          zIndex: nextZ,
          reloadKey: 0,
        },
      ];
    });
    setActiveSubWindowId(nextId);
  }, []);

  const focusSubWindow = useCallback((id) => {
    const nextZ = ++zCounterRef.current;
    setSubWindows((prev) =>
      prev.map((w) =>
        w.id === id ? { ...w, isMinimized: false, zIndex: nextZ } : w
      )
    );
    setActiveSubWindowId(id);
  }, []);

  const closeSubWindow = useCallback((id) => {
    setSubWindows((prev) => {
      const remaining = prev.filter((w) => w.id !== id);
      if (remaining.length > 0) {
        const topWin = [...remaining].sort((a, b) => b.zIndex - a.zIndex)[0];
        setActiveSubWindowId(topWin.id);
      } else {
        setActiveSubWindowId(null);
      }
      return remaining;
    });
  }, []);

  const minimizeSubWindow = useCallback((id) => {
    setSubWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, isMinimized: true } : w))
    );
  }, []);

  const toggleMaximizeSubWindow = useCallback((id) => {
    const nextZ = ++zCounterRef.current;
    setSubWindows((prev) =>
      prev.map((w) =>
        w.id === id
          ? { ...w, isMaximized: !w.isMaximized, isMinimized: false, zIndex: nextZ }
          : w
      )
    );
    setActiveSubWindowId(id);
  }, []);

  const snapSubWindow = useCallback((id, side) => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1366;
    const vh = typeof window !== "undefined" ? window.innerHeight : 820;
    const halfW = Math.floor((vw - 24) / 2);
    const fullH = Math.max(360, vh - 88);
    const nextZ = ++zCounterRef.current;

    setSubWindows((prev) =>
      prev.map((w) =>
        w.id === id
          ? {
              ...w,
              isMaximized: false,
              isMinimized: false,
              x: side === "left" ? 8 : 16 + halfW,
              y: 38,
              width: halfW,
              height: fullH,
              zIndex: nextZ,
            }
          : w
      )
    );
    setActiveSubWindowId(id);
  }, []);

  const updateSubWindowBounds = useCallback((id, patch) => {
    setSubWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, ...patch } : w))
    );
  }, []);

  const updateSubWindowRoute = useCallback((id, path, title) => {
    setSubWindows((prev) =>
      prev.map((w) =>
        w.id === id
          ? { ...w, path, title, reloadKey: (w.reloadKey || 0) + 1 }
          : w
      )
    );
  }, []);

  const reloadSubWindow = useCallback((id) => {
    setSubWindows((prev) =>
      prev.map((w) =>
        w.id === id ? { ...w, reloadKey: (w.reloadKey || 0) + 1 } : w
      )
    );
  }, []);

  const tileSubWindows = useCallback(() => {
    setSubWindows((prev) => {
      const visible = prev.map((w) => ({
        ...w,
        isMinimized: false,
        isMaximized: false,
      }));
      const count = visible.length;
      if (!count) return visible;
      const vw = typeof window !== "undefined" ? window.innerWidth : 1366;
      const vh = typeof window !== "undefined" ? window.innerHeight : 820;
      const cols = Math.min(count, 2);
      const rows = Math.ceil(count / cols);
      const cellW = Math.floor((vw - 24) / cols);
      const cellH = Math.floor((vh - 92) / rows);

      return visible.map((w, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        return {
          ...w,
          x: 8 + col * (cellW + 8),
          y: 38 + row * (cellH + 6),
          width: cellW,
          height: cellH,
          zIndex: ++zCounterRef.current,
        };
      });
    });
  }, []);

  const gridSubWindows = useCallback(() => {
    setSubWindows((prev) => {
      const visible = prev.map((w) => ({
        ...w,
        isMinimized: false,
        isMaximized: false,
      }));
      const count = visible.length;
      if (!count) return visible;
      const vw = typeof window !== "undefined" ? window.innerWidth : 1366;
      const vh = typeof window !== "undefined" ? window.innerHeight : 820;
      const cols = count === 1 ? 1 : 2;
      const rows = Math.max(1, Math.min(2, Math.ceil(count / 2)));
      const cellW = Math.floor((vw - 24) / cols);
      const cellH = Math.floor((vh - 92) / rows);

      return visible.map((w, i) => {
        const slot = i % 4;
        const col = slot % cols;
        const row = Math.floor(slot / cols);
        return {
          ...w,
          x: 8 + col * (cellW + 8),
          y: 38 + row * (cellH + 6),
          width: cellW,
          height: cellH,
          zIndex: ++zCounterRef.current,
        };
      });
    });
  }, []);

  const cascadeSubWindows = useCallback(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1366;
    const vh = typeof window !== "undefined" ? window.innerHeight : 820;
    const baseW = Math.min(980, Math.floor(vw * 0.68));
    const baseH = Math.min(680, Math.floor(vh * 0.72));

    setSubWindows((prev) =>
      prev.map((w, i) => ({
        ...w,
        isMinimized: false,
        isMaximized: false,
        x: 40 + (i % 7) * 34,
        y: 46 + (i % 7) * 32,
        width: baseW,
        height: baseH,
        zIndex: ++zCounterRef.current,
      }))
    );
  }, []);

  const minimizeAllSubWindows = useCallback(() => {
    setSubWindows((prev) => prev.map((w) => ({ ...w, isMinimized: true })));
  }, []);

  const restoreAllSubWindows = useCallback(() => {
    setSubWindows((prev) => prev.map((w) => ({ ...w, isMinimized: false })));
  }, []);

  const closeAllSubWindows = useCallback(() => {
    setSubWindows([]);
    setActiveSubWindowId(null);
  }, []);

  const openSalePurchaseSplit = useCallback(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1366;
    const vh = typeof window !== "undefined" ? window.innerHeight : 820;
    const halfW = Math.floor((vw - 24) / 2);
    const fullH = Math.max(380, vh - 88);

    openSubWindow("/sale-invoices/create/retail", "Create Retail Sale", {
      x: 8,
      y: 38,
      width: halfW,
      height: fullH,
    });
    openSubWindow("/purchase-invoices/create", "Create Purchase Invoice", {
      x: 16 + halfW,
      y: 38,
      width: halfW,
      height: fullH,
    });
  }, [openSubWindow]);

  // Listen to Electron Native Top Menu IPC events & Custom DOM events (only in main window)
  useEffect(() => {
    if (isSubWindow) {
      // Forward global & MDI multi-window shortcuts from Sub-Window iframe to top window
      const forwardGlobalShortcuts = (e) => {
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
          if (["n", "p", "s", "w", "u", "l", "d", "t", "g", "c", "m", "x", "h"].includes(key)) {
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

        // Plain Ctrl+<key> global shortcuts inside Sub-Window
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
          // Always prevent browser/OS native print dialog on Ctrl+P
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
          navigate("/purchase-invoices/create");
        } else if (e.code === "Digit2" || e.code === "Numpad2") {
          e.preventDefault();
          navigate("/sale-invoices/create/retail");
        } else if (e.code === "Digit3" || e.code === "Numpad3") {
          e.preventDefault();
          navigate("/sale-invoices/create/wholesale");
        }
      };

      window.addEventListener("keydown", forwardGlobalShortcuts);
      return () => window.removeEventListener("keydown", forwardGlobalShortcuts);
    }

    const markMdiAction = () => {
      const now = Date.now();
      if (now - lastMdiActionTsRef.current < 180) return false;
      lastMdiActionTsRef.current = now;
      return true;
    };

    const handleCustomOpen = (e) => {
      const detail = e.detail || {};
      openSubWindow(
        detail.path || currentPath || "/dashboard",
        detail.title || pageTitle
      );
    };

    window.addEventListener("karobar:open-subwindow", handleCustomOpen);

    const desktopApi = window.karobarDesktop;
    const unsubNav = desktopApi?.onNavigate?.((payload) => {
      if (payload?.path && markMdiAction()) {
        navigate(payload.path);
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
      if (!markMdiAction()) return;
      if (cmd === "open-current") {
        openSubWindow(currentPath || "/dashboard", pageTitle);
      } else if (cmd === "preset-sale-purchase") {
        openSalePurchaseSplit();
      } else if (cmd === "tile") {
        tileSubWindows();
      } else if (cmd === "grid") {
        gridSubWindows();
      } else if (cmd === "cascade") {
        cascadeSubWindows();
      } else if (cmd === "minimize-all") {
        minimizeAllSubWindows();
      } else if (cmd === "restore-all") {
        restoreAllSubWindows();
      } else if (cmd === "close-all") {
        closeAllSubWindows();
      }
    });

    const handleKeyShortcuts = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey) {
        const key = (e.key || "").toLowerCase();
        if (!["n", "p", "s", "w", "u", "l", "d", "t", "g", "c", "m", "x", "h"].includes(key)) {
          return;
        }
        e.preventDefault();
        if (!markMdiAction()) return;

        if (key === "n") {
          openSubWindow(currentPath || "/dashboard", pageTitle);
        } else if (key === "p") {
          openSubWindow("/sale-invoices/pos", "Barcode POS");
        } else if (key === "s") {
          openSubWindow("/sale-invoices/create/retail", "Create Retail Sale");
        } else if (key === "w") {
          openSubWindow("/sale-invoices/create/wholesale", "Create Wholesale Sale");
        } else if (key === "u") {
          openSubWindow("/purchase-invoices/create", "Create Purchase Invoice");
        } else if (key === "l") {
          openSubWindow("/customer-ledger", "Customer Ledger");
        } else if (key === "d") {
          openSalePurchaseSplit();
        } else if (key === "t") {
          tileSubWindows();
        } else if (key === "g") {
          gridSubWindows();
        } else if (key === "c") {
          cascadeSubWindows();
        } else if (key === "m") {
          minimizeAllSubWindows();
        } else if (key === "x") {
          closeAllSubWindows();
        } else if (key === "h") {
          navigate("/dashboard");
        }
      }
    };
    window.addEventListener("keydown", handleKeyShortcuts);

    return () => {
      window.removeEventListener("karobar:open-subwindow", handleCustomOpen);
      window.removeEventListener("keydown", handleKeyShortcuts);
      if (typeof unsubNav === "function") unsubNav();
      if (typeof unsubSubWin === "function") unsubSubWin();
      if (typeof unsubCmd === "function") unsubCmd();
    };
  }, [
    isSubWindow,
    currentPath,
    pageTitle,
    navigate,
    openSubWindow,
    openSalePurchaseSplit,
    tileSubWindows,
    gridSubWindows,
    cascadeSubWindows,
    minimizeAllSubWindows,
    restoreAllSubWindows,
    closeAllSubWindows,
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
  useEffect(() => () => clearDockTimers(), [clearDockTimers]);

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

  // If this instance is rendered inside a Sub-Window iframe, preserve .workspace-shell CSS variables & styling
  if (isSubWindow) {
    return (
      <div className="workspace-shell !p-3 !min-h-screen">
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

      {/* Main content area — Topbar + Page + Sub-Window Manager */}
      <div className="workspace-main">
        <Topbar
          pageTitle={pageTitle}
          onMobileMenuClick={() => setMobileSidebarOpen(true)}
          sidebarPinned={sidebarPinned}
          onDesktopDockOpen={() => {
            clearDockTimers();
            setDockOpen((v) => !v);
          }}
          onOpenCurrentInSubWindow={() =>
            openSubWindow(currentPath || "/dashboard", pageTitle)
          }
        />
        <main className="workspace-content">
          <div className="workspace-page">
            <Toaster position="top-right" reverseOrder={false} />
            <ProtectedRoute>
              <Suspense fallback={<PageSkeleton />}>
                {children ?? <Outlet />}
              </Suspense>
            </ProtectedRoute>
          </div>
        </main>

        <SubWindowManager
          windows={subWindows}
          activeWindowId={activeSubWindowId}
          onFocusWindow={focusSubWindow}
          onCloseWindow={closeSubWindow}
          onMinimizeWindow={minimizeSubWindow}
          onToggleMaximizeWindow={toggleMaximizeSubWindow}
          onSnapWindow={snapSubWindow}
          onUpdateWindowBounds={updateSubWindowBounds}
          onReloadWindow={reloadSubWindow}
          onTileWindows={tileSubWindows}
          onGridWindows={gridSubWindows}
          onCloseAll={closeAllSubWindows}
        />

        <AppUpdateNotification />
        <SessionExpiryModal />
      </div>
    </div>
  );
}
