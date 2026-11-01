// src/layouts/DashboardLayout.jsx
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";
import Topbar from "../components/Topbar.jsx";
import ProtectedRoute from "../components/ProtectedRoute.jsx";
import PageSkeleton from "../components/PageSkeleton.jsx";
import { Toaster } from "react-hot-toast";

const SIDEBAR_PIN_STORAGE_KEY = "karobar_sidebar_pinned";

export default function DashboardLayout({ children }) {
  const location = useLocation();

  // Brand from /api/settings
  const [appName, setAppName] = useState("ERP");
  const [logoUrl, setLogoUrl] = useState(null);

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

  // Fetch settings from API and sync with localStorage
  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get("/api/settings");
        const sn = (data?.store_name || "").trim();
        setAppName(sn || "ERP");
        setLogoUrl(data?.logo_url || null);
      } catch {
        setAppName("ERP");
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
    "/products": "Products",
    "/products/create": "Add Product",
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
    document.title = `${pageTitle} - ${appName || "ERP"}`;
  }, [pageTitle, appName]);

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

      {/* Main content area — topbar + page */}
      <div className="workspace-main">
        <Topbar
          pageTitle={pageTitle}
          onMobileMenuClick={() => setMobileSidebarOpen(true)}
          sidebarPinned={sidebarPinned}
          onDesktopDockOpen={() => {
            clearDockTimers();
            setDockOpen((v) => !v);
          }}
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
      </div>
    </div>
  );
}
