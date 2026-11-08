// resources/js/components/sidebar-templates/ClassicSidebar.jsx
import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  HomeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  BuildingStorefrontIcon,
  UsersIcon,
  Squares2X2Icon,
  TagIcon,
  CubeIcon,
  ClipboardDocumentListIcon,
  ArrowUturnLeftIcon,
  DocumentCurrencyDollarIcon,
  ArrowUturnDownIcon,
  ClipboardDocumentCheckIcon,
  ArrowsRightLeftIcon,
  BanknotesIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  UserGroupIcon,
  KeyIcon,
  ShoppingCartIcon,
  UserPlusIcon,
  TruckIcon,
  CurrencyDollarIcon,
  ClipboardDocumentIcon,
  DocumentTextIcon,
  CalculatorIcon,
  ClipboardDocumentListIcon as ReportIcon,
  ClockIcon,
  HandRaisedIcon,
  ServerIcon,
  QrCodeIcon,
  BuildingLibraryIcon,
  ShieldExclamationIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  PlusIcon,
  StarIcon as StarOutlineIcon,
  BoltIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  LockClosedIcon,
  LockOpenIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";
import { usePermissions } from "@/api/usePermissions";
import { useTheme } from "@/context/ThemeContext";
import { useSaleSystem } from "@/context/SaleSystemContext.jsx";
import { preloadRoute } from "@/routes/index.jsx";
import { SidebarNavSkeleton } from "@/components/PageSkeleton.jsx";

const FAVORITES_STORAGE_KEY = "karobar_sidebar_favorites";
const EXPANDED_SECTIONS_STORAGE_KEY = "karobar_sidebar_expanded_sections_v2";

// Section color mapping
const SECTION_CONFIG = {
  favorites: { key: "primary" },
  items: { key: "primary" },
  invoices: { key: "secondary" },
  returns: { key: "tertiary" },
  inventory: { key: "primary" },
  finance: { key: "secondary" },
  reports: { key: "tertiary" },
  system: { key: "primary" },
};

const getThemeColor = (theme, colorKey, variant = "color") => {
  if (!theme) return "#3b82f6";
  const key = `${colorKey}_${variant}`;
  return theme[key] || "#3b82f6";
};

export default function ClassicSidebar({
  appName,
  logoUrl,
  isPinned = false,
  onTogglePin,
  isDockOpen = false,
  onRequestCloseDock,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef(null);

  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { hasWholesale } = useSaleSystem();
  const { loading: permsLoading, has } = usePermissions();
  const [expiryAlertCount, setExpiryAlertCount] = useState(
    () => Number(window.__karobarExpiryAlertCount || 0)
  );

  // Favorites state persisted in localStorage
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Expanded accordion sections state
  const [expandedSections, setExpandedSections] = useState(() => {
    try {
      const saved = localStorage.getItem(EXPANDED_SECTIONS_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      /* ignore */
    }
    return {
      favorites: true,
      items: true,
      invoices: true,
      returns: true,
      inventory: false,
      finance: false,
      reports: false,
      system: false,
    };
  });

  // Track which collapsed panels have finished their exit transition so we can set `hidden`
  const [hiddenPanels, setHiddenPanels] = useState(() => ({
    favorites: !expandedSections.favorites,
    items: !expandedSections.items,
    invoices: !expandedSections.invoices,
    returns: !expandedSections.returns,
    inventory: !expandedSections.inventory,
    finance: !expandedSections.finance,
    reports: !expandedSections.reports,
    system: !expandedSections.system,
  }));

  // When in floating dock mode, always show full expanded width (never icon-only rail)
  const effectiveCollapsed = isPinned ? collapsed : false;

  useEffect(() => {
    const onExpiryCount = (e) => {
      setExpiryAlertCount(Number(e?.detail || 0));
    };
    window.addEventListener("expiry-alert-count", onExpiryCount);
    return () => {
      window.removeEventListener("expiry-alert-count", onExpiryCount);
    };
  }, []);

  const brandName = appName && appName !== "ERP" ? appName : "Karobar App";
  const logoCandidates = [
    ...new Set([logoUrl, "/storage/logos/logo.png", "/logo.png"].filter(Boolean)),
  ];

  // Cleanly grouped, domain-sorted menu definition:
  // 1. Items & Masters (all item & party creation in one tab)
  // 2. Invoices (all invoices, orders & POS in one tab)
  // 3. Returns (all returns in one tab)
  // 4. Stock & Inventory (batch/expiry, demands, adjustments, stocktake, disposal)
  // 5. Finance & Ledgers (customer/supplier ledgers, payments, cash drawer, accounts, expenses, GL)
  // 6. Reports (all reports in one tab)
  // 7. System & Settings (settings, users, roles, backups)
  const rawSections = useMemo(
    () => [
      {
        key: "items",
        name: "Items & Masters",
        icon: <CubeIcon className="w-4 h-4" />,
        items: [
          {
            name: "Products",
            path: "/products",
            icon: <CubeIcon className="w-5 h-5" />,
            perm: "product.view",
            quickCreatePath: "/products/create",
            quickCreatePerm: "product.create",
            quickCreateLabel: "Add Product",
          },
          {
            name: "Product Batches",
            path: "/product-batches",
            icon: <BoltIcon className="w-5 h-5" />,
            permAny: ["product.view", "product.update", "batch-expiry.view"],
          },
          {
            name: "Categories",
            path: "/categories",
            icon: <Squares2X2Icon className="w-5 h-5" />,
            perm: "category.view",
          },
          {
            name: "Brands",
            path: "/brands",
            icon: <TagIcon className="w-5 h-5" />,
            perm: "brand.view",
            quickCreatePath: "/brands/create",
            quickCreatePerm: "brand.create",
            quickCreateLabel: "Add Brand",
          },
          {
            name: "Suppliers",
            path: "/suppliers",
            icon: <TruckIcon className="w-5 h-5" />,
            perm: "supplier.view",
            quickCreatePath: "/suppliers/create",
            quickCreatePerm: "supplier.create",
            quickCreateLabel: "Add Supplier",
          },
          {
            name: "Customers",
            path: "/customers",
            icon: <UserPlusIcon className="w-5 h-5" />,
            perm: "customer.view",
          },
          {
            name: "Barcode Studio",
            path: "/barcode-labels",
            icon: <QrCodeIcon className="w-5 h-5" />,
            permAny: ["barcode.view", "barcode.print"],
          },
        ],
      },
      {
        key: "invoices",
        name: "Invoices",
        icon: <DocumentTextIcon className="w-4 h-4" />,
        items: [
          {
            name: "Barcode POS",
            path: "/sale-invoices/pos",
            icon: <QrCodeIcon className="w-5 h-5" />,
            permAny: ["barcode-pos.view", "barcode-pos.create"],
          },
          {
            name: "Sale Invoices",
            path: "/sale-invoices",
            exactExclude: [
              "/sale-invoices/pos",
              "/sale-invoices/barcode-pos",
              "/sale-invoices/create/wholesale",
              "/sale-invoices/create-wholesale",
            ],
            icon: <DocumentCurrencyDollarIcon className="w-5 h-5" />,
            perm: "sale-invoice.view",
            quickCreatePath: "/sale-invoices/create/retail",
            quickCreatePerm: "sale-invoice.create",
            quickCreateLabel: "Create Retail Sale Invoice",
          },
          ...(hasWholesale
            ? [
                {
                  name: "Wholesale Invoices",
                  path: "/wholesale-invoices",
                  matchPaths: ["/wholesale-invoices", "/sale-invoices/create/wholesale"],
                  icon: <BuildingStorefrontIcon className="w-5 h-5" />,
                  perm: "sale-invoice.view",
                  quickCreatePath: "/sale-invoices/create/wholesale",
                  quickCreatePerm: "sale-invoice.create",
                  quickCreateLabel: "Create Wholesale Invoice",
                },
              ]
            : []),
          {
            name: "Purchase Invoices",
            path: "/purchase-invoices",
            icon: <ClipboardDocumentListIcon className="w-5 h-5" />,
            perm: "purchase-invoice.view",
            quickCreatePath: "/purchase-invoices/create",
            quickCreatePerm: "purchase-invoice.create",
            quickCreateLabel: "Create Purchase Invoice",
          },
          {
            name: "Purchase Orders",
            path: "/purchase-orders",
            icon: <ClipboardDocumentCheckIcon className="w-5 h-5" />,
            perm: "purchase-order.view",
            quickCreatePath: "/purchase-orders/create",
            quickCreatePerm: "purchase-order.create",
            quickCreateLabel: "Create Purchase Order",
          },
        ],
      },
      {
        key: "returns",
        name: "Returns",
        icon: <ArrowUturnLeftIcon className="w-4 h-4" />,
        items: [
          {
            name: "Sale Returns",
            path: "/sale-returns",
            icon: <ArrowUturnLeftIcon className="w-5 h-5" />,
            perm: "sale-return.view",
            quickCreatePath: "/sale-returns/create",
            quickCreatePerm: "sale-return.create",
            quickCreateLabel: "Create Sale Return",
          },
          {
            name: "Purchase Returns",
            path: "/purchase-returns",
            icon: <ArrowUturnDownIcon className="w-5 h-5" />,
            perm: "purchase-return.view",
            quickCreatePath: "/purchase-returns/create",
            quickCreatePerm: "purchase-return.create",
            quickCreateLabel: "Create Purchase Return",
          },
        ],
      },
      {
        key: "inventory",
        name: "Stock & Inventory",
        icon: <ShoppingCartIcon className="w-4 h-4" />,
        items: [
          {
            name: "Batch & Expiry",
            path: "/batch-expiry",
            icon: <ClockIcon className="w-5 h-5" />,
            perm: "batch-expiry.view",
            quickCreatePath: "/product-batches",
            quickCreatePerm: "product.update",
            quickCreateLabel: "Quick Add / Edit Batches",
          },
          {
            name: "User Demands",
            path: "/user-demands",
            icon: <HandRaisedIcon className="w-5 h-5" />,
            perm: "user-demands.view",
            quickCreatePath: "/user-demands/create",
            quickCreatePerm: "user-demands.create",
            quickCreateLabel: "New Product Demand",
          },
          {
            name: "Stock Adjustments",
            path: "/stock-adjustments",
            icon: <ArrowsRightLeftIcon className="w-5 h-5" />,
            perm: "stock-adjustment.view",
            quickCreatePath: "/stock-adjustments/create",
            quickCreatePerm: "stock-adjustment.create",
            quickCreateLabel: "Add Stock Adjustment",
          },
          {
            name: "Stocktake Sessions",
            path: "/stocktake-sessions",
            icon: <ClipboardDocumentCheckIcon className="w-5 h-5" />,
            perm: "stocktake.view",
            quickCreatePath: "/stocktake-sessions/create",
            quickCreatePerm: "stocktake.create",
            quickCreateLabel: "New Stocktake Session",
          },
          {
            name: "Quarantine & Disposal",
            path: "/stock-disposals",
            icon: <ShieldExclamationIcon className="w-5 h-5" />,
            perm: "stock-disposal.view",
            quickCreatePath: "/stock-disposals/create",
            quickCreatePerm: "stock-disposal.create",
            quickCreateLabel: "New Disposal",
          },
        ],
      },
      {
        key: "finance",
        name: "Finance & Ledgers",
        icon: <CurrencyDollarIcon className="w-4 h-4" />,
        items: [
          {
            name: "Customer Ledger",
            path: "/customer-ledger",
            icon: <UsersIcon className="w-5 h-5" />,
            perm: "customer-ledger.view",
          },
          {
            name: "Supplier Ledger",
            path: "/supplier-ledger",
            icon: <BuildingStorefrontIcon className="w-5 h-5" />,
            perm: "supplier-ledger.view",
          },
          {
            name: "Payment Vouchers",
            path: "/payments",
            icon: <BanknotesIcon className="w-5 h-5" />,
            perm: "payment.view",
          },
          {
            name: "Cash Drawer",
            path: "/cash-drawer",
            icon: <BanknotesIcon className="w-5 h-5" />,
            perm: "cash-drawer.view",
          },
          {
            name: "Financial Accounts",
            path: "/accounts",
            icon: <BuildingLibraryIcon className="w-5 h-5" />,
            perm: "account.view",
          },
          {
            name: "Operating Expenses",
            path: "/expenses",
            icon: <CurrencyDollarIcon className="w-5 h-5" />,
            perm: "expense.view",
          },
          {
            name: "Double-Entry & GL",
            path: "/accounting",
            icon: <CalculatorIcon className="w-5 h-5" />,
            permAny: ["account.view", "report.net-profit.view"],
          },
          {
            name: "HR, Payroll & Commissions",
            path: "/hr-payroll",
            icon: <UserGroupIcon className="w-5 h-5" />,
            permAny: ["expense.view", "account.view", "user.view"],
          },
        ],
      },
      {
        key: "reports",
        name: "Reports",
        icon: <ChartBarIcon className="w-4 h-4" />,
        items: [
          // Financial & Tax
          {
            name: "Net Profit (P&L)",
            path: "/reports/net-profit",
            subGroup: "Financial & Tax",
            icon: <CalculatorIcon className="w-5 h-5" />,
            perm: "report.net-profit.view",
          },
          {
            name: "Statutory Tax Return",
            path: "/reports/tax-return",
            subGroup: "Financial & Tax",
            icon: <DocumentCurrencyDollarIcon className="w-5 h-5" />,
            permAny: ["report.net-profit.view", "report.sale-detail.view", "account.view"],
          },
          {
            name: "Cost of Sale",
            path: "/reports/cost-of-sale",
            subGroup: "Financial & Tax",
            icon: <CalculatorIcon className="w-5 h-5" />,
            perm: "report.cost-of-sale.view",
          },
          {
            name: "Cost of Sale Detail",
            path: "/reports/cost-of-sale-detail",
            subGroup: "Financial & Tax",
            icon: <DocumentTextIcon className="w-5 h-5" />,
            perm: "report.cost-of-sale-detail.view",
          },
          {
            name: "Outstanding Aging",
            path: "/reports/outstanding-aging",
            subGroup: "Financial & Tax",
            icon: <BanknotesIcon className="w-5 h-5" />,
            perm: "report.outstanding-aging.view",
          },
          // Sales, Purchases & Returns
          {
            name: "Sale Detail",
            path: "/reports/sale-detail",
            subGroup: "Sales, Purchases & Returns",
            icon: <DocumentCurrencyDollarIcon className="w-5 h-5" />,
            perm: "report.sale-detail.view",
          },
          {
            name: "Purchase Detail",
            path: "/reports/purchase-detail",
            subGroup: "Sales, Purchases & Returns",
            icon: <ClipboardDocumentIcon className="w-5 h-5" />,
            perm: "report.purchase-detail.view",
          },
          {
            name: "Purchase Summary",
            path: "/reports/purchase-summary",
            subGroup: "Sales, Purchases & Returns",
            icon: <ClipboardDocumentListIcon className="w-5 h-5" />,
            perm: "report.purchase-summary.view",
          },
          {
            name: "Sale Returns Report",
            path: "/reports/sale-returns",
            subGroup: "Sales, Purchases & Returns",
            icon: <ArrowUturnLeftIcon className="w-5 h-5" />,
            perm: "report.sale-returns.view",
          },
          {
            name: "Purchase Returns Report",
            path: "/reports/purchase-returns",
            subGroup: "Sales, Purchases & Returns",
            icon: <ArrowUturnDownIcon className="w-5 h-5" />,
            perm: "report.purchase-returns.view",
          },
          // Inventory & Stock
          {
            name: "Current Stock",
            path: "/reports/current-stock",
            subGroup: "Inventory & Stock",
            icon: <CubeIcon className="w-5 h-5" />,
            perm: "report.current-stock.view",
          },
          {
            name: "Low Stock & Reorder",
            path: "/reports/reorder",
            subGroup: "Inventory & Stock",
            icon: <CubeIcon className="w-5 h-5" />,
            perm: "report.reorder.view",
          },
          {
            name: "Product Comprehensive",
            path: "/reports/product-comprehensive",
            subGroup: "Inventory & Stock",
            icon: <ReportIcon className="w-5 h-5" />,
            perm: "report.product-comprehensive.view",
          },
          {
            name: "Near Expiry Product",
            path: "/reports/near-expiry-product",
            subGroup: "Inventory & Stock",
            icon: <ClockIcon className="w-5 h-5" />,
            perm: "report.near-expiry-product.view",
          },
          {
            name: "Stock Adjustment Report",
            path: "/reports/stock-adjustment",
            subGroup: "Inventory & Stock",
            icon: <ArrowsRightLeftIcon className="w-5 h-5" />,
            perm: "report.stock-adjustment.view",
          },
        ],
      },
      {
        key: "system",
        name: "System & Settings",
        icon: <Cog6ToothIcon className="w-4 h-4" />,
        items: [
          {
            name: "Settings",
            path: "/settings",
            icon: <Cog6ToothIcon className="w-5 h-5" />,
            perm: "settings.view",
          },
          {
            name: "Users",
            path: "/users",
            icon: <UserGroupIcon className="w-5 h-5" />,
            permAny: ["user.view", "user.manage"],
            quickCreatePath: "/users/create",
            quickCreatePerm: "user.create",
            quickCreateLabel: "Add User",
          },
          {
            name: "Roles",
            path: "/roles",
            icon: <KeyIcon className="w-5 h-5" />,
            perm: "role.view",
            quickCreatePath: "/roles/create",
            quickCreatePerm: "role.create",
            quickCreateLabel: "Create Role",
          },
          {
            name: "Backups & Storage",
            path: "/backups",
            icon: <ServerIcon className="w-5 h-5" />,
            perm: "backup.view",
          },
        ],
      },
    ],
    [hasWholesale]
  );

  const isItemActive = useCallback(
    (item) => {
      if (item.exactExclude && item.exactExclude.some((ex) => pathname.startsWith(ex))) {
        return false;
      }
      if (Array.isArray(item.matchPaths) && item.matchPaths.length > 0) {
        return item.matchPaths.some((mp) => pathname === mp || pathname.startsWith(mp + "/"));
      }
      return pathname === item.path || pathname.startsWith(item.path + "/");
    },
    [pathname]
  );

  // Filter sections by user permissions and search query
  const visibleSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const allowedSections = rawSections
      .map((section) => {
        const permittedItems = section.items
          .filter((it) => {
            if (it.permAny) {
              return !permsLoading && it.permAny.some((p) => has(p));
            }
            if (it.perm) {
              return !permsLoading && has(it.perm);
            }
            return true;
          })
          .map((it) => ({
            ...it,
            parent: section.key,
            canQuickCreate:
              Boolean(it.quickCreatePath) &&
              (!it.quickCreatePerm || (!permsLoading && has(it.quickCreatePerm))),
          }));

        const matchingItems = q
          ? permittedItems.filter(
              (it) =>
                it.name.toLowerCase().includes(q) ||
                section.name.toLowerCase().includes(q) ||
                (it.subGroup && it.subGroup.toLowerCase().includes(q))
            )
          : permittedItems;

        return {
          ...section,
          items: matchingItems,
          allPermittedItems: permittedItems,
        };
      })
      .filter((sec) => sec.items.length > 0);

    // Build Starred / Favorites section at the top if user has starred items
    const allPermittedFlat = allowedSections.flatMap((s) => s.allPermittedItems);
    const favItems = favorites
      .map((favPath) => allPermittedFlat.find((it) => it.path === favPath))
      .filter(Boolean)
      .filter((it) => !q || it.name.toLowerCase().includes(q));

    if (favItems.length > 0) {
      return [
        {
          key: "favorites",
          name: "Starred",
          icon: <StarSolidIcon className="w-4 h-4 text-amber-400" />,
          items: favItems.map((it) => ({ ...it, isFavoriteSection: true })),
        },
        ...allowedSections,
      ];
    }

    return allowedSections;
  }, [rawSections, permsLoading, has, searchQuery, favorites]);

  // Automatically expand whichever section owns the currently active route
  useEffect(() => {
    const activeSec = visibleSections.find(
      (sec) => sec.key !== "favorites" && sec.items.some((item) => isItemActive(item))
    );
    if (activeSec && !expandedSections[activeSec.key]) {
      setHiddenPanels((prev) => ({ ...prev, [activeSec.key]: false }));
      setExpandedSections((prev) => {
        const next = { ...prev, [activeSec.key]: true };
        try {
          localStorage.setItem(EXPANDED_SECTIONS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    }
  }, [pathname, visibleSections, isItemActive]);

  const toggleFavorite = useCallback((e, path) => {
    e.preventDefault();
    e.stopPropagation();
    setFavorites((prev) => {
      const exists = prev.includes(path);
      const next = exists ? prev.filter((p) => p !== path) : [...prev, path];
      try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const toggleSection = useCallback((sectionKey) => {
    setExpandedSections((prev) => {
      const willExpand = !prev[sectionKey];
      if (willExpand) {
        // Unhide before expanding so CSS block-size transition runs smoothly
        setHiddenPanels((hp) => ({ ...hp, [sectionKey]: false }));
      }
      const next = { ...prev, [sectionKey]: willExpand };
      try {
        localStorage.setItem(EXPANDED_SECTIONS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const allExpanded = useMemo(() => {
    return visibleSections.every((s) => expandedSections[s.key]);
  }, [visibleSections, expandedSections]);

  const toggleAllSections = useCallback(() => {
    const target = !allExpanded;
    const next = {};
    visibleSections.forEach((s) => {
      next[s.key] = target;
    });
    if (target) {
      setHiddenPanels({});
    }
    setExpandedSections((prev) => {
      const merged = { ...prev, ...next };
      try {
        localStorage.setItem(EXPANDED_SECTIONS_STORAGE_KEY, JSON.stringify(merged));
      } catch {
        /* ignore */
      }
      return merged;
    });
  }, [allExpanded, visibleSections]);

  const getSectionTheme = (sectionKey) => {
    const config = SECTION_CONFIG[sectionKey] || SECTION_CONFIG.items;
    const colorKey = config.key || "primary";
    return {
      key: colorKey,
      baseColor: getThemeColor(theme, colorKey, "color"),
      hoverColor: getThemeColor(theme, colorKey, "hover"),
      lightColor: getThemeColor(theme, colorKey, "light"),
    };
  };

  // Keyboard navigation across visible items
  const isSearching = searchQuery.trim().length > 0;
  const navigableItems = useMemo(() => {
    const list = [];
    visibleSections.forEach((sec) => {
      const isOpen = effectiveCollapsed || isSearching || expandedSections[sec.key];
      if (isOpen) {
        sec.items.forEach((it) => {
          list.push({
            ...it,
            uniqueKey: `${sec.key}:${it.path}`,
          });
        });
      }
    });
    return list;
  }, [visibleSections, effectiveCollapsed, isSearching, expandedSections]);

  const itemRefs = useRef({});
  const [focusedKey, setFocusedKey] = useState(null);

  function handleKeyDown(e) {
    if (e.key === "/" && document.activeElement !== searchInputRef.current) {
      e.preventDefault();
      searchInputRef.current?.focus();
      return;
    }
    if (navigableItems.length === 0) return;
    const currentIdx = navigableItems.findIndex((i) => i.uniqueKey === focusedKey);
    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        const nextIdx = (currentIdx + 1) % navigableItems.length;
        const nextKey = navigableItems[nextIdx].uniqueKey;
        setFocusedKey(nextKey);
        itemRefs.current[nextKey]?.focus();
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        const prevIdx = currentIdx <= 0 ? navigableItems.length - 1 : currentIdx - 1;
        const prevKey = navigableItems[prevIdx].uniqueKey;
        setFocusedKey(prevKey);
        itemRefs.current[prevKey]?.focus();
        break;
      }
      default:
        break;
    }
  }

  const widthCls = effectiveCollapsed
    ? "workspace-sidebar-collapsed"
    : "workspace-sidebar-expanded";

  return (
    <aside className="workspace-sidebar">
      <div className={`workspace-sidebar-inner ${widthCls}`}>
        {/* Brand & Dock Mode Header */}
        <div className="workspace-sidebar-brand">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <picture className="workspace-brand-mark">
                <span aria-hidden="true">{brandName.slice(0, 1).toUpperCase()}</span>
                {logoCandidates.map((src) => (
                  <img
                    key={src}
                    src={src}
                    alt={brandName}
                    className="absolute inset-0 h-full w-full object-contain rounded-xl hidden"
                    onLoad={(e) => {
                      const imgs = e.currentTarget.parentElement.querySelectorAll("img");
                      imgs.forEach((im) => (im.style.display = "none"));
                      e.currentTarget.style.display = "block";
                    }}
                  />
                ))}
              </picture>
              {!effectiveCollapsed && (
                <div className="flex flex-col min-w-0">
                  <span className="workspace-brand-name leading-tight">{brandName}</span>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 hidden lg:flex items-center gap-1">
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full ${
                        isPinned ? "bg-blue-500" : "bg-emerald-500"
                      }`}
                    />
                    {isPinned ? "Pinned Sidebar" : "Auto-Hide Dock"}
                  </span>
                </div>
              )}
            </div>

            {/* Pin / Unpin Dock Button on Desktop */}
            {!effectiveCollapsed && onTogglePin && (
              <button
                type="button"
                onClick={onTogglePin}
                title={
                  isPinned
                    ? "Switch to macOS Auto-Hide Dock (opens on left-edge hover)"
                    : "Pin sidebar open permanently"
                }
                aria-label={isPinned ? "Switch to auto-hide dock" : "Pin sidebar"}
                className={`hidden lg:inline-flex p-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer shrink-0 ${
                  isPinned
                    ? "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20"
                    : "bg-slate-500/8 border-slate-200/80 dark:border-slate-700/80 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-500/15"
                }`}
              >
                {isPinned ? (
                  <LockClosedIcon className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <LockOpenIcon className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            )}

            {/* Mobile Drawer Close Button */}
            {!effectiveCollapsed && onRequestCloseDock && (
              <button
                type="button"
                onClick={onRequestCloseDock}
                title="Close navigation menu"
                aria-label="Close navigation menu"
                className="lg:hidden p-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-500/8 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-all cursor-pointer shrink-0"
              >
                <XMarkIcon className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Quick Filter Input & Expand/Collapse All */}
          {!effectiveCollapsed && (
            <div className="mt-2.5 flex items-center gap-1.5">
              <div className="relative flex-1 min-w-0">
                <MagnifyingGlassIcon
                  className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter menu... (/)"
                  aria-label="Filter navigation menu"
                  className="w-full h-8.5 pl-8 pr-7 text-base sm:text-sm font-semibold rounded-xl bg-slate-500/8 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear menu filter"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <XMarkIcon className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={toggleAllSections}
                title={allExpanded ? "Collapse all sections" : "Expand all sections"}
                aria-label={allExpanded ? "Collapse all sections" : "Expand all sections"}
                className="h-8 w-8 inline-flex items-center justify-center rounded-xl bg-slate-500/8 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer shrink-0"
              >
                {allExpanded ? (
                  <ArrowsPointingInIcon className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <ArrowsPointingOutIcon className="w-3.5 h-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Navigation Sections */}
        <nav
          className="workspace-navigation"
          role="navigation"
          aria-label="Main navigation"
          onKeyDown={handleKeyDown}
        >
          {/* Standalone Pinned Dashboard Link */}
          {(!searchQuery.trim() || "dashboard".includes(searchQuery.trim().toLowerCase())) && (
            <div className="mb-1.5 pb-1.5 border-b border-gray-200/60 dark:border-slate-700/60">
              <div
                className="workspace-nav-row group/navitem relative flex items-center"
                style={{ "--nav-accent": getThemeColor(theme, "primary", "color") }}
              >
                <Link
                  to="/dashboard"
                  onMouseEnter={() => preloadRoute("/dashboard")}
                  onFocus={() => preloadRoute("/dashboard")}
                  onClick={() => {
                    if (!isPinned && onRequestCloseDock) {
                      onRequestCloseDock();
                    }
                  }}
                  className={`workspace-nav-item flex-1 min-w-0 ${
                    pathname === "/dashboard" || pathname.startsWith("/dashboard/")
                      ? "workspace-nav-item-active"
                      : ""
                  }`}
                  style={{ "--nav-accent": getThemeColor(theme, "primary", "color") }}
                  aria-current={pathname === "/dashboard" ? "page" : undefined}
                  title={effectiveCollapsed ? "Dashboard" : undefined}
                >
                  <span
                    className={[
                      "workspace-nav-icon shrink-0 relative",
                      pathname === "/dashboard" ? "" : "text-gray-500 dark:text-gray-400",
                    ].join(" ")}
                    style={{
                      color:
                        pathname === "/dashboard"
                          ? getThemeColor(theme, "primary", "color")
                          : undefined,
                    }}
                  >
                    <HomeIcon className="w-4.5 h-4.5" aria-hidden="true" />
                  </span>
                  {!effectiveCollapsed && (
                    <span className="workspace-nav-title truncate font-bold">
                      Dashboard
                    </span>
                  )}
                </Link>
              </div>
            </div>
          )}

          {permsLoading ? (
            <SidebarNavSkeleton collapsed={effectiveCollapsed} includeDashboard={false} />
          ) : visibleSections.length === 0 ? (
            <div className="py-8 px-4 text-center text-sm font-semibold text-slate-400 dark:text-slate-500">
              No menu items match &ldquo;{searchQuery}&rdquo;
            </div>
          ) : (
            visibleSections.map((section) => {
              const sectionConfig = getSectionTheme(section.key);
              const isOpen =
                effectiveCollapsed || isSearching || Boolean(expandedSections[section.key]);
              const hasActiveChild = section.items.some((it) => isItemActive(it));
              const hasSectionAlert =
                section.key === "inventory" && expiryAlertCount > 0;

              let lastSubGroup = null;

              return (
                <div key={section.key} className="mb-1">
                  {/* Section Header / Accordion Trigger */}
                  {effectiveCollapsed ? (
                    <div
                      className="flex items-center justify-center py-2.5 mx-2 mt-1.5 border-b border-gray-200/70 dark:border-slate-700/70"
                      title={section.name}
                    >
                      <span style={{ color: sectionConfig.baseColor }}>
                        {React.cloneElement(section.icon, {
                          className: "w-4 h-4",
                          "aria-hidden": "true",
                        })}
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleSection(section.key)}
                      aria-expanded={isOpen}
                      aria-controls={`sidebar-sec-${section.key}`}
                      className="workspace-nav-section"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="shrink-0"
                          style={{ color: sectionConfig.baseColor }}
                        >
                          {React.cloneElement(section.icon, {
                            className: "w-4 h-4",
                            "aria-hidden": "true",
                          })}
                        </span>
                        <span
                          className={`workspace-nav-section-label truncate ${
                            hasActiveChild ? "text-slate-900 dark:text-slate-100" : ""
                          }`}
                        >
                          {section.name}
                        </span>
                        {hasActiveChild && !isOpen && (
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: sectionConfig.baseColor }}
                          />
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {hasSectionAlert && !isOpen && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                            {expiryAlertCount}
                          </span>
                        )}
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded-md bg-slate-500/10 text-slate-600 dark:text-slate-300">
                          {section.items.length}
                        </span>
                        <ChevronDownIcon
                          className={`w-3.5 h-3.5 transition-transform duration-200 ${
                            isOpen ? "rotate-0" : "-rotate-90"
                          }`}
                          aria-hidden="true"
                        />
                      </div>
                    </button>
                  )}

                  {/* Collapsible Accordion Panel */}
                  <div
                    id={`sidebar-sec-${section.key}`}
                    hidden={!isOpen && Boolean(hiddenPanels[section.key])}
                    onTransitionEnd={(e) => {
                      if (
                        e.target === e.currentTarget &&
                        e.propertyName === "block-size" &&
                        !isOpen
                      ) {
                        setHiddenPanels((hp) => ({ ...hp, [section.key]: true }));
                      }
                    }}
                    className={`workspace-accordion-panel ${isOpen ? "is-expanded" : ""}`}
                  >
                    {section.items.map((item) => {
                      const uniqueKey = `${section.key}:${item.path}`;
                      const active = isItemActive(item);
                      const isFav = favorites.includes(item.path);
                      const showSubGroupHeader =
                        !effectiveCollapsed &&
                        item.subGroup &&
                        item.subGroup !== lastSubGroup;
                      if (item.subGroup) {
                        lastSubGroup = item.subGroup;
                      }

                      return (
                        <React.Fragment key={uniqueKey}>
                          {showSubGroupHeader && (
                            <div className="workspace-nav-subgroup px-3 pt-2.5 pb-1 text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              {item.subGroup}
                            </div>
                          )}

                          <div
                            className="workspace-nav-row group/navitem relative flex items-center"
                            style={{ "--nav-accent": sectionConfig.baseColor }}
                          >
                            <Link
                              to={item.path}
                              ref={(el) => {
                                itemRefs.current[uniqueKey] = el;
                              }}
                              onMouseEnter={() => preloadRoute(item.path)}
                              onClick={() => {
                                if (!isPinned && onRequestCloseDock) {
                                  onRequestCloseDock();
                                }
                              }}
                              className={`workspace-nav-item flex-1 min-w-0 ${
                                active ? "workspace-nav-item-active" : ""
                              } ${
                                !effectiveCollapsed
                                  ? item.canQuickCreate
                                    ? "pr-16"
                                    : "pr-10"
                                  : ""
                              }`}
                              style={{ "--nav-accent": sectionConfig.baseColor }}
                              onFocus={() => {
                                setFocusedKey(uniqueKey);
                                preloadRoute(item.path);
                              }}
                              aria-current={active ? "page" : undefined}
                              title={effectiveCollapsed ? item.name : undefined}
                            >
                              <span
                                className={[
                                  "workspace-nav-icon shrink-0 relative",
                                  active ? "" : "text-gray-500 dark:text-gray-400",
                                ].join(" ")}
                                style={{
                                  color: active ? sectionConfig.baseColor : undefined,
                                }}
                              >
                                {React.cloneElement(item.icon, {
                                  className: "w-4.5 h-4.5",
                                  "aria-hidden": "true",
                                })}
                                {effectiveCollapsed &&
                                  item.path === "/batch-expiry" &&
                                  expiryAlertCount > 0 && (
                                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-800" />
                                  )}
                              </span>

                              {!effectiveCollapsed && (
                                <span className="flex items-center justify-between flex-1 min-w-0">
                                  <span className="workspace-nav-title truncate font-bold">
                                    {item.name}
                                  </span>
                                  {item.path === "/batch-expiry" &&
                                    expiryAlertCount > 0 && (
                                      <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white shadow-xs shrink-0">
                                        {expiryAlertCount}
                                      </span>
                                    )}
                                </span>
                              )}
                            </Link>

                            {/* Pop-up Action Buttons: Quick-Create (+) and Favorite Star (★) */}
                            {!effectiveCollapsed && (
                              <div
                                className={`workspace-nav-actions absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 z-20 ${
                                  isFav ? "has-fav" : ""
                                }`}
                              >
                                {item.canQuickCreate && (
                                  <button
                                    type="button"
                                    onMouseEnter={() => preloadRoute(item.quickCreatePath)}
                                    onFocus={() => preloadRoute(item.quickCreatePath)}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (!isPinned && onRequestCloseDock) {
                                        onRequestCloseDock();
                                      }
                                      navigate(item.quickCreatePath);
                                    }}
                                    title={item.quickCreateLabel || `Quick create ${item.name}`}
                                    aria-label={
                                      item.quickCreateLabel || `Quick create ${item.name}`
                                    }
                                    className="workspace-nav-action-btn p-1 rounded-lg text-slate-500 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/15 transition-all cursor-pointer"
                                  >
                                    <PlusIcon className="w-3.5 h-3.5" aria-hidden="true" />
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={(e) => toggleFavorite(e, item.path)}
                                  title={
                                    isFav ? "Remove from Starred" : "Pin to Starred at top"
                                  }
                                  aria-label={
                                    isFav ? "Remove from Starred" : "Pin to Starred at top"
                                  }
                                  className={`workspace-nav-action-btn p-1 rounded-lg transition-all cursor-pointer ${
                                    isFav
                                      ? "text-amber-400 hover:text-amber-500 bg-amber-500/10"
                                      : "text-slate-500 dark:text-slate-300 hover:text-amber-400 hover:bg-amber-500/15"
                                  }`}
                                >
                                  {isFav ? (
                                    <StarSolidIcon
                                      className="w-3.5 h-3.5"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <StarOutlineIcon
                                      className="w-3.5 h-3.5"
                                      aria-hidden="true"
                                    />
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </nav>

        {/* Footer */}
        <div className="workspace-sidebar-footer hidden lg:block">
          {isPinned ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCollapsed((v) => !v)}
                className="workspace-collapse flex-1 cursor-pointer"
                aria-label={effectiveCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={effectiveCollapsed ? "Expand sidebar" : "Collapse to icon rail"}
              >
                {effectiveCollapsed ? (
                  <ChevronRightIcon className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <ChevronLeftIcon className="w-4 h-4" aria-hidden="true" />
                )}
                {!effectiveCollapsed && <span>Compact Rail</span>}
              </button>
            </div>
          ) : (
            onTogglePin && (
              <button
                type="button"
                onClick={onTogglePin}
                className="workspace-collapse cursor-pointer"
                aria-label="Pin sidebar open permanently"
              >
                <LockClosedIcon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Pin Sidebar to Page</span>
              </button>
            )
          )}
        </div>
      </div>
    </aside>
  );
}
