// resources/js/components/PageSearchModal.jsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  HomeIcon,
  UserIcon,
  CubeIcon,
  BoltIcon,
  Squares2X2Icon,
  TagIcon,
  TruckIcon,
  UserPlusIcon,
  QrCodeIcon,
  DocumentCurrencyDollarIcon,
  BuildingStorefrontIcon,
  ClipboardDocumentListIcon,
  ClipboardDocumentCheckIcon,
  ArrowUturnLeftIcon,
  ArrowUturnDownIcon,
  ClockIcon,
  HandRaisedIcon,
  ArrowsRightLeftIcon,
  ShieldExclamationIcon,
  UsersIcon,
  BanknotesIcon,
  BuildingLibraryIcon,
  CurrencyDollarIcon,
  CalculatorIcon,
  UserGroupIcon,
  ChartBarIcon,
  DocumentTextIcon,
  ClipboardDocumentIcon,
  Cog6ToothIcon,
  KeyIcon,
  ServerIcon,
  ArrowRightIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { usePermissions } from "@/api/usePermissions.js";
import { useSaleSystem } from "@/context/SaleSystemContext.jsx";
import { useTheme } from "@/context/ThemeContext.jsx";

export function useAvailablePages() {
  const { loading: permsLoading, has } = usePermissions();
  const { hasWholesale } = useSaleSystem();

  const allPages = useMemo(
    () => [
      // Overview
      {
        name: "Dashboard",
        path: "/dashboard",
        section: "Overview",
        keywords: "home main overview stats summary",
        icon: HomeIcon,
      },
      {
        name: "Profile",
        path: "/profile",
        section: "Overview",
        keywords: "account my profile password user",
        icon: UserIcon,
      },

      // Items & Masters
      {
        name: "Products",
        path: "/products",
        section: "Items & Masters",
        keywords: "items medicine inventory catalog list",
        icon: CubeIcon,
        perm: "product.view",
      },
      {
        name: "Add Product",
        path: "/products/create",
        section: "Items & Masters",
        keywords: "new product create item medicine",
        icon: CubeIcon,
        perm: "product.create",
      },
      {
        name: "Product Batches",
        path: "/product-batches",
        section: "Items & Masters",
        keywords: "batches workbench lot expiry",
        icon: BoltIcon,
        permAny: ["product.view", "product.update", "batch-expiry.view"],
      },
      {
        name: "Categories",
        path: "/categories",
        section: "Items & Masters",
        keywords: "product categories groups",
        icon: Squares2X2Icon,
        perm: "category.view",
      },
      {
        name: "Brands",
        path: "/brands",
        section: "Items & Masters",
        keywords: "company manufacturer brand",
        icon: TagIcon,
        perm: "brand.view",
      },
      {
        name: "Add Brand",
        path: "/brands/create",
        section: "Items & Masters",
        keywords: "new brand create company manufacturer",
        icon: TagIcon,
        perm: "brand.create",
      },
      {
        name: "Suppliers",
        path: "/suppliers",
        section: "Items & Masters",
        keywords: "vendors distributors supplier",
        icon: TruckIcon,
        perm: "supplier.view",
      },
      {
        name: "Add Supplier",
        path: "/suppliers/create",
        section: "Items & Masters",
        keywords: "new supplier create vendor distributor",
        icon: TruckIcon,
        perm: "supplier.create",
      },
      {
        name: "Customers",
        path: "/customers",
        section: "Items & Masters",
        keywords: "clients buyers patients customer",
        icon: UserPlusIcon,
        perm: "customer.view",
      },
      {
        name: "Add Customer",
        path: "/customers/create",
        section: "Items & Masters",
        keywords: "new customer create client buyer patient",
        icon: UserPlusIcon,
        perm: "customer.create",
      },
      {
        name: "Barcode Studio",
        path: "/barcode-labels",
        section: "Items & Masters",
        keywords: "barcode labels print stickers",
        icon: QrCodeIcon,
        permAny: ["barcode.view", "barcode.print"],
      },

      // Invoices
      {
        name: "Barcode POS",
        path: "/sale-invoices/pos",
        section: "Invoices",
        keywords: "pos terminal point of sale counter billing",
        icon: QrCodeIcon,
        permAny: ["barcode-pos.view", "barcode-pos.create"],
        shortcut: "Ctrl+Shift+P",
      },
      {
        name: "Sale Invoices",
        path: "/sale-invoices",
        section: "Invoices",
        keywords: "sales bills invoices list retail",
        icon: DocumentCurrencyDollarIcon,
        perm: "sale-invoice.view",
      },
      {
        name: "Create Retail Sale Invoice",
        path: "/sale-invoices/create/retail",
        section: "Invoices",
        keywords: "new sale invoice retail bill create",
        icon: DocumentCurrencyDollarIcon,
        perm: "sale-invoice.create",
        shortcut: "Ctrl+Shift+S",
      },
      ...(hasWholesale
        ? [
            {
              name: "Wholesale Invoices",
              path: "/wholesale-invoices",
              section: "Invoices",
              keywords: "wholesale sales b2b invoices list",
              icon: BuildingStorefrontIcon,
              perm: "sale-invoice.view",
            },
            {
              name: "Create Wholesale Invoice",
              path: "/sale-invoices/create/wholesale",
              section: "Invoices",
              keywords: "new wholesale sale invoice create b2b",
              icon: BuildingStorefrontIcon,
              perm: "sale-invoice.create",
              shortcut: "Ctrl+Shift+W",
            },
          ]
        : []),
      {
        name: "Purchase Invoices",
        path: "/purchase-invoices",
        section: "Invoices",
        keywords: "purchases bills grn buying list",
        icon: ClipboardDocumentListIcon,
        perm: "purchase-invoice.view",
      },
      {
        name: "Create Purchase Invoice",
        path: "/purchase-invoices/create",
        section: "Invoices",
        keywords: "new purchase invoice bill add stock",
        icon: ClipboardDocumentListIcon,
        perm: "purchase-invoice.create",
        shortcut: "Ctrl+Shift+U",
      },
      {
        name: "Purchase Orders",
        path: "/purchase-orders",
        section: "Invoices",
        keywords: "po purchase orders procurement",
        icon: ClipboardDocumentCheckIcon,
        perm: "purchase-order.view",
      },
      {
        name: "Create Purchase Order",
        path: "/purchase-orders/create",
        section: "Invoices",
        keywords: "new po create purchase order",
        icon: ClipboardDocumentCheckIcon,
        perm: "purchase-order.create",
      },
      {
        name: "Smart Reorder Forecast",
        path: "/smart-reorder",
        section: "Invoices",
        keywords: "smart reorder forecast ai stock ordering",
        icon: BoltIcon,
        permAny: ["purchase-order.view", "purchase-order.create", "report.reorder.view"],
      },

      // Returns
      {
        name: "Sale Returns",
        path: "/sale-returns",
        section: "Returns",
        keywords: "customer return refund sale returns",
        icon: ArrowUturnLeftIcon,
        perm: "sale-return.view",
      },
      {
        name: "Create Sale Return",
        path: "/sale-returns/create",
        section: "Returns",
        keywords: "new sale return customer refund",
        icon: ArrowUturnLeftIcon,
        perm: "sale-return.create",
      },
      {
        name: "Purchase Returns",
        path: "/purchase-returns",
        section: "Returns",
        keywords: "supplier return debit note purchase returns",
        icon: ArrowUturnDownIcon,
        perm: "purchase-return.view",
      },
      {
        name: "Create Purchase Return",
        path: "/purchase-returns/create",
        section: "Returns",
        keywords: "new purchase return supplier return",
        icon: ArrowUturnDownIcon,
        perm: "purchase-return.create",
      },

      // Stock & Inventory
      {
        name: "Batch & Expiry",
        path: "/batch-expiry",
        section: "Stock & Inventory",
        keywords: "expiry tracking near expired batches",
        icon: ClockIcon,
        perm: "batch-expiry.view",
      },
      {
        name: "User Demands",
        path: "/user-demands",
        section: "Stock & Inventory",
        keywords: "demands requests missing items",
        icon: HandRaisedIcon,
        perm: "user-demands.view",
      },
      {
        name: "New Product Demand",
        path: "/user-demands/create",
        section: "Stock & Inventory",
        keywords: "create demand request product",
        icon: HandRaisedIcon,
        perm: "user-demands.create",
      },
      {
        name: "Stock Adjustments",
        path: "/stock-adjustments",
        section: "Stock & Inventory",
        keywords: "inventory adjustment stock correction",
        icon: ArrowsRightLeftIcon,
        perm: "stock-adjustment.view",
      },
      {
        name: "Add Stock Adjustment",
        path: "/stock-adjustments/create",
        section: "Stock & Inventory",
        keywords: "new stock adjustment create",
        icon: ArrowsRightLeftIcon,
        perm: "stock-adjustment.create",
      },
      {
        name: "Stocktake Sessions",
        path: "/stocktake-sessions",
        section: "Stock & Inventory",
        keywords: "audit physical count stocktake",
        icon: ClipboardDocumentCheckIcon,
        perm: "stocktake.view",
      },
      {
        name: "New Stocktake Session",
        path: "/stocktake-sessions/create",
        section: "Stock & Inventory",
        keywords: "create stocktake session physical count",
        icon: ClipboardDocumentCheckIcon,
        perm: "stocktake.create",
      },
      {
        name: "Quarantine & Disposal",
        path: "/stock-disposals",
        section: "Stock & Inventory",
        keywords: "damaged expired disposal quarantine writeoff",
        icon: ShieldExclamationIcon,
        perm: "stock-disposal.view",
      },
      {
        name: "New Disposal",
        path: "/stock-disposals/create",
        section: "Stock & Inventory",
        keywords: "create stock disposal quarantine",
        icon: ShieldExclamationIcon,
        perm: "stock-disposal.create",
      },

      // Finance & Ledgers
      {
        name: "Customer Ledger",
        path: "/customer-ledger",
        section: "Finance & Ledgers",
        keywords: "receivables customer statement balance ledger",
        icon: UsersIcon,
        perm: "customer-ledger.view",
        shortcut: "Ctrl+Shift+L",
      },
      {
        name: "Supplier Ledger",
        path: "/supplier-ledger",
        section: "Finance & Ledgers",
        keywords: "payables supplier statement balance ledger",
        icon: BuildingStorefrontIcon,
        perm: "supplier-ledger.view",
      },
      {
        name: "Payment Vouchers",
        path: "/payments",
        section: "Finance & Ledgers",
        keywords: "receipts payments vouchers cash bank",
        icon: BanknotesIcon,
        perm: "payment.view",
      },
      {
        name: "Cash Drawer",
        path: "/cash-drawer",
        section: "Finance & Ledgers",
        keywords: "till shift register cash drawer float",
        icon: BanknotesIcon,
        perm: "cash-drawer.view",
      },
      {
        name: "Financial Accounts",
        path: "/accounts",
        section: "Finance & Ledgers",
        keywords: "bank accounts wallets cash balances",
        icon: BuildingLibraryIcon,
        perm: "account.view",
      },
      {
        name: "Operating Expenses",
        path: "/expenses",
        section: "Finance & Ledgers",
        keywords: "expenses bills utility rent vouchers",
        icon: CurrencyDollarIcon,
        perm: "expense.view",
      },
      {
        name: "Double-Entry & GL",
        path: "/accounting",
        section: "Finance & Ledgers",
        keywords: "general ledger journal entries trial balance chart of accounts",
        icon: CalculatorIcon,
        permAny: ["account.view", "report.net-profit.view"],
      },
      {
        name: "HR, Payroll & Commissions",
        path: "/hr-payroll",
        section: "Finance & Ledgers",
        keywords: "employees salary payroll advances commissions attendance",
        icon: UserGroupIcon,
        permAny: ["expense.view", "account.view", "user.view"],
      },

      // Reports
      {
        name: "Net Profit (P&L)",
        path: "/reports/net-profit",
        section: "Reports",
        keywords: "profit and loss income statement report",
        icon: CalculatorIcon,
        perm: "report.net-profit.view",
      },
      {
        name: "Statutory Tax Return",
        path: "/reports/tax-return",
        section: "Reports",
        keywords: "gst tax return report",
        icon: DocumentCurrencyDollarIcon,
        permAny: ["report.net-profit.view", "report.sale-detail.view", "account.view"],
      },
      {
        name: "Cost of Sale",
        path: "/reports/cost-of-sale",
        section: "Reports",
        keywords: "cogs cost of sale report",
        icon: CalculatorIcon,
        perm: "report.cost-of-sale.view",
      },
      {
        name: "Cost of Sale Detail",
        path: "/reports/cost-of-sale-detail",
        section: "Reports",
        keywords: "cogs detail cost of sale detail report",
        icon: DocumentTextIcon,
        perm: "report.cost-of-sale-detail.view",
      },
      {
        name: "Outstanding Aging",
        path: "/reports/outstanding-aging",
        section: "Reports",
        keywords: "aging receivables payables overdue report",
        icon: BanknotesIcon,
        perm: "report.outstanding-aging.view",
      },
      {
        name: "Sale Detail Report",
        path: "/reports/sale-detail",
        section: "Reports",
        keywords: "sales report detail",
        icon: DocumentCurrencyDollarIcon,
        perm: "report.sale-detail.view",
      },
      {
        name: "Purchase Detail Report",
        path: "/reports/purchase-detail",
        section: "Reports",
        keywords: "purchases report detail",
        icon: ClipboardDocumentIcon,
        perm: "report.purchase-detail.view",
      },
      {
        name: "Purchase Summary Report",
        path: "/reports/purchase-summary",
        section: "Reports",
        keywords: "purchase summary report",
        icon: ClipboardDocumentListIcon,
        perm: "report.purchase-summary.view",
      },
      {
        name: "Sale Returns Report",
        path: "/reports/sale-returns",
        section: "Reports",
        keywords: "sale returns report",
        icon: ArrowUturnLeftIcon,
        perm: "report.sale-returns.view",
      },
      {
        name: "Purchase Returns Report",
        path: "/reports/purchase-returns",
        section: "Reports",
        keywords: "purchase returns report",
        icon: ArrowUturnDownIcon,
        perm: "purchase-returns.view",
        permAny: ["report.purchase-returns.view", "purchase-return.view"],
      },
      {
        name: "Current Stock Report",
        path: "/reports/current-stock",
        section: "Reports",
        keywords: "inventory valuation current stock report",
        icon: CubeIcon,
        perm: "report.current-stock.view",
      },
      {
        name: "Low Stock & Reorder",
        path: "/reports/reorder",
        section: "Reports",
        keywords: "low stock reorder shortage report",
        icon: ChartBarIcon,
        perm: "report.reorder.view",
      },
      {
        name: "Product Comprehensive",
        path: "/reports/product-comprehensive",
        section: "Reports",
        keywords: "product comprehensive history ledger report",
        icon: ClipboardDocumentListIcon,
        perm: "report.product-comprehensive.view",
      },
      {
        name: "Near Expiry Product",
        path: "/reports/near-expiry-product",
        section: "Reports",
        keywords: "near expiry product report",
        icon: ClockIcon,
        perm: "report.near-expiry-product.view",
      },
      {
        name: "Stock Adjustment Report",
        path: "/reports/stock-adjustment",
        section: "Reports",
        keywords: "stock adjustment report",
        icon: ArrowsRightLeftIcon,
        perm: "report.stock-adjustment.view",
      },

      // System & Settings
      {
        name: "Settings",
        path: "/settings",
        section: "System & Settings",
        keywords: "configuration preferences theme store settings",
        icon: Cog6ToothIcon,
        perm: "settings.view",
      },
      {
        name: "SQLite Data Import",
        path: "/settings/sqlite-import",
        section: "System & Settings",
        keywords: "sqlite database import migration legacy",
        icon: ServerIcon,
        perm: "settings.update",
      },
      {
        name: "Users",
        path: "/users",
        section: "System & Settings",
        keywords: "staff accounts users management",
        icon: UserGroupIcon,
        permAny: ["user.view", "user.manage"],
      },
      {
        name: "Add User",
        path: "/users/create",
        section: "System & Settings",
        keywords: "create new user staff",
        icon: UserGroupIcon,
        perm: "user.create",
      },
      {
        name: "Roles & Permissions",
        path: "/roles",
        section: "System & Settings",
        keywords: "roles permissions access control",
        icon: KeyIcon,
        perm: "role.view",
      },
      {
        name: "Create Role",
        path: "/roles/create",
        section: "System & Settings",
        keywords: "new role permissions create",
        icon: KeyIcon,
        perm: "role.create",
      },
      {
        name: "Backups & Storage",
        path: "/backups",
        section: "System & Settings",
        keywords: "database backup restore cloud storage",
        icon: ServerIcon,
        perm: "backup.view",
      },
    ],
    [hasWholesale]
  );

  const availablePages = useMemo(() => {
    return allPages.filter((page) => {
      if (page.permAny) {
        return !permsLoading && page.permAny.some((p) => has(p));
      }
      if (page.perm) {
        return !permsLoading && has(page.perm);
      }
      return true;
    });
  }, [allPages, permsLoading, has]);

  return availablePages;
}

export function rankPagesByQuery(availablePages, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return availablePages;

  const startsWithName = [];
  const wordStartsWithName = [];
  const includesMatches = [];

  for (const page of availablePages) {
    const nameLower = page.name.toLowerCase();
    const sectionLower = page.section.toLowerCase();
    const keywordsLower = (page.keywords || "").toLowerCase();
    const pathLower = page.path.toLowerCase();

    if (nameLower.startsWith(q)) {
      startsWithName.push(page);
    } else if (nameLower.split(/\s+/).some((w) => w.startsWith(q))) {
      wordStartsWithName.push(page);
    } else if (
      nameLower.includes(q) ||
      sectionLower.includes(q) ||
      keywordsLower.includes(q) ||
      pathLower.includes(q)
    ) {
      includesMatches.push(page);
    }
  }

  return [...startsWithName, ...wordStartsWithName, ...includesMatches];
}

export default function PageSearchModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { isDark, theme } = useTheme();
  const primaryColor = theme?.primary_color || (isDark ? "#60A5FA" : "#2563EB");
  const successColor = theme?.success_color || (isDark ? "#4ADE80" : "#15803D");

  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  const inputRef = useRef(null);
  const rowRefs = useRef([]);
  const mouseDownTargetRef = useRef(null);

  const availablePages = useAvailablePages();

  // Filter & rank by search query
  const filteredPages = useMemo(
    () => rankPagesByQuery(availablePages, query),
    [availablePages, query]
  );

  // Reset search and focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 30);
    }
  }, [isOpen]);

  // Keep activeIdx within bounds when filtered results change
  useEffect(() => {
    setActiveIdx(0);
    rowRefs.current = [];
  }, [query]);

  // Auto-scroll active item into view when navigating with arrows
  useEffect(() => {
    if (!isOpen || activeIdx < 0) return;
    const row = rowRefs.current[activeIdx];
    if (row) {
      row.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx, isOpen, filteredPages.length]);

  const handleSelectPage = (page, openInNewTab = false) => {
    if (!page) return;
    onClose?.();
    if (openInNewTab) {
      window.dispatchEvent(
        new CustomEvent("karobar:open-subwindow", {
          detail: { path: page.path, title: page.name },
        })
      );
    } else if (
      typeof window !== "undefined" &&
      window.__karobarActiveTabId &&
      window.__karobarActiveTabId !== "main"
    ) {
      window.dispatchEvent(
        new CustomEvent("karobar:navigate-active-tab", {
          detail: { path: page.path, title: page.name },
        })
      );
    } else {
      navigate(page.path);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose?.();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filteredPages.length > 0) {
        setActiveIdx((prev) => (prev + 1) % filteredPages.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filteredPages.length > 0) {
        setActiveIdx((prev) => (prev - 1 + filteredPages.length) % filteredPages.length);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filteredPages[activeIdx];
      if (target) {
        handleSelectPage(target, e.ctrlKey || e.metaKey);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onMouseDown={(e) => {
        mouseDownTargetRef.current = e.target;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && mouseDownTargetRef.current === e.currentTarget) {
          onClose?.();
        }
      }}
      className="fixed inset-0 z-100000 flex items-start justify-center pt-12 sm:pt-24 p-3 sm:p-4 bg-black/55 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="Go to page"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className={`w-full max-w-xl flex flex-col rounded-2xl shadow-2xl border overflow-hidden animate-in zoom-in-95 duration-150 ${
          isDark
            ? "bg-slate-900 border-slate-700/80 text-slate-100"
            : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        {/* Search Input Header */}
        <div
          className={`flex items-center gap-3 px-4 py-3.5 border-b ${
            isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"
          }`}
        >
          <MagnifyingGlassIcon className="w-5 h-5 shrink-0" style={{ color: primaryColor }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Go to page (e.g. Sale Invoices, Products, Ledger, POS)..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Search available pages"
            className="flex-1 bg-transparent text-base sm:text-sm font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Clear search"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-500">
            Esc
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-[60dvh] overflow-y-auto p-2 divide-y divide-slate-100/60 dark:divide-slate-800/60">
          {filteredPages.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <p className="text-sm font-medium">No pages found for "{query}"</p>
            </div>
          ) : (
            filteredPages.map((page, idx) => {
              const Icon = page.icon;
              const isActive = idx === activeIdx;
              const isCurrentRoute = pathname === page.path;

              return (
                <button
                  key={page.path}
                  ref={(el) => (rowRefs.current[idx] = el)}
                  type="button"
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={(e) => handleSelectPage(page, e.ctrlKey || e.metaKey)}
                  onAuxClick={(e) => {
                    if (e.button === 1) {
                      e.preventDefault();
                      handleSelectPage(page, true);
                    }
                  }}
                  className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                    isActive
                      ? "text-white shadow-xs"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-800 dark:text-slate-200"
                  }`}
                  style={isActive ? { backgroundColor: primaryColor, color: "#ffffff" } : {}}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2 rounded-lg shrink-0 ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold truncate">{page.name}</span>
                        {isCurrentRoute && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                            style={
                              isActive
                                ? { backgroundColor: "rgba(255, 255, 255, 0.25)", color: "#ffffff" }
                                : {
                                    backgroundColor: `${successColor}1A`,
                                    color: successColor,
                                    border: `1px solid ${successColor}33`,
                                  }
                            }
                          >
                            Current
                          </span>
                        )}
                      </div>
                      <div
                        className={`text-[11px] truncate ${
                          isActive ? "text-white/80" : "text-slate-400 dark:text-slate-500"
                        }`}
                      >
                        {page.section}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectPage(page, true);
                      }}
                      title={`Open ${page.name} in a new browser tab`}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                        isActive
                          ? "bg-white/20 hover:bg-white/30 text-white"
                          : "bg-slate-100 dark:bg-slate-800 hover:opacity-85 text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      <PlusIcon className="w-3 h-3" />
                      <span>New Tab</span>
                    </span>
                    <ArrowRightIcon
                      className={`w-4 h-4 transition-transform ${
                        isActive ? "text-white translate-x-0.5" : "text-slate-300 dark:text-slate-600"
                      }`}
                    />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          className={`px-4 py-2.5 border-t flex items-center justify-between text-[11px] ${
            isDark
              ? "border-slate-800 bg-slate-900/80 text-slate-400"
              : "border-slate-100 bg-slate-50 text-slate-500"
          }`}
        >
          <div className="flex items-center gap-3">
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
              <span>Go to page</span>
            </span>
            <span className="hidden sm:flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-[10px]">
                Ctrl+↵
              </kbd>
              <span>Open in New Tab</span>
            </span>
          </div>
          <span>{filteredPages.length} available pages</span>
        </div>
      </div>
    </div>
  );
}

