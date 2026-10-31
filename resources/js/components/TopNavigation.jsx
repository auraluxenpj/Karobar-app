import React, { Suspense, lazy, useState, useRef, useEffect, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  HomeIcon,
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
  ChevronDownIcon,
  ShoppingCartIcon,
  UserPlusIcon,
  TruckIcon,
  CurrencyDollarIcon,
  ClipboardDocumentIcon,
  DocumentTextIcon,
  ArrowPathIcon,
  CalculatorIcon,
  ClipboardDocumentListIcon as ReportIcon,
  ClockIcon,
  ServerIcon,
  QrCodeIcon,
} from "@heroicons/react/24/outline";
import { usePermissions } from "@/api/usePermissions";
import { useTheme } from "@/context/ThemeContext";
import { useSaleSystem } from "@/context/SaleSystemContext.jsx";
import {
  GuideBotTopbarButton,
  InspectElementTopbarButton,
  useGuideBotOpenState,
} from "./GuideBotTrigger.jsx";

const FeatureGuideBot = lazy(() => import("./FeatureGuideBot.jsx"));

export default function TopNavigation() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { loading: permsLoading, has } = usePermissions();
  const { theme } = useTheme();
  const { hasWholesale } = useSaleSystem();
  const [openDropdown, setOpenDropdown] = useState(null);
  const [guideBotOpen, setGuideBotOpen] = useGuideBotOpenState();
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [hoveredDropdown, setHoveredDropdown] = useState(null);
  const buttonRefs = useRef({});
  const dropdownRef = useRef(null);
  const brandName = "Karobar App";
  const logoCandidates = ["/storage/logos/logo.png", "/logo.png"];

  // Get theme colors with defaults
  const themeColors = useMemo(() => ({
    primary: theme?.primary_color || '#3b82f6',
    primaryHover: theme?.primary_hover || '#2563eb',
    primaryLight: theme?.primary_light || '#dbeafe',
    secondary: theme?.secondary_color || '#8b5cf6',
    secondaryHover: theme?.secondary_hover || '#7c3aed',
    secondaryLight: theme?.secondary_light || '#ede9fe',
    tertiary: theme?.tertiary_color || '#06b6d4',
    tertiaryHover: theme?.tertiary_hover || '#0891b2',
    tertiaryLight: theme?.tertiary_light || '#cffafe',
  }), [theme]);

  // Get section config using dynamic theme colors
  const getSectionConfig = (key) => {
    const colorMap = {
      core: { base: themeColors.primary, light: themeColors.primaryLight, hover: themeColors.primaryHover },
      invoices: { base: themeColors.secondary, light: themeColors.secondaryLight, hover: themeColors.secondaryHover },
      returns: { base: themeColors.tertiary, light: themeColors.tertiaryLight, hover: themeColors.tertiaryHover },
      transactions: { base: themeColors.primary, light: themeColors.primaryLight, hover: themeColors.primaryHover },
      finance: { base: themeColors.secondary, light: themeColors.secondaryLight, hover: themeColors.secondaryHover },
      reports: { base: themeColors.tertiary, light: themeColors.tertiaryLight, hover: themeColors.tertiaryHover },
      system: { base: themeColors.primary, light: themeColors.primaryLight, hover: themeColors.primaryHover },
    };
    return colorMap[key] || colorMap.core;
  };

  // Organized menu with sections and items - Matching sidebar structure
  const menuSections = useMemo(() => [
    {
      name: "Items & Masters",
      key: "core",
      icon: <CubeIcon className="w-5 h-5" />,
      items: [
        { name: "Products", path: "/products", icon: <CubeIcon className="w-5 h-5" />, perm: "product.view" },
        { name: "Product Batches", path: "/product-batches", icon: <ClockIcon className="w-5 h-5" />, permAny: ["product.view", "product.update", "batch-expiry.view"] },
        { name: "Categories", path: "/categories", icon: <Squares2X2Icon className="w-5 h-5" />, perm: "category.view" },
        { name: "Brands", path: "/brands", icon: <TagIcon className="w-5 h-5" />, perm: "brand.view" },
        { name: "Suppliers", path: "/suppliers", icon: <TruckIcon className="w-5 h-5" />, perm: "supplier.view" },
        { name: "Customers", path: "/customers", icon: <UserPlusIcon className="w-5 h-5" />, perm: "customer.view" },
        { name: "Barcode Studio", path: "/barcode-labels", icon: <QrCodeIcon className="w-5 h-5" />, permAny: ["barcode.view", "barcode.print"] },
      ]
    },
    {
      name: "Invoices",
      key: "invoices",
      icon: <DocumentTextIcon className="w-5 h-5" />,
      items: [
        { name: "⚡ Barcode POS", path: "/sale-invoices/pos", icon: <QrCodeIcon className="w-5 h-5" />, permAny: ["barcode-pos.view", "barcode-pos.create"] },
        { name: "Sale Invoices", path: "/sale-invoices", icon: <DocumentCurrencyDollarIcon className="w-5 h-5" />, perm: "sale-invoice.view" },
        ...(hasWholesale
          ? [{ name: "Wholesale Invoices", path: "/wholesale-invoices", icon: <BuildingStorefrontIcon className="w-5 h-5" />, perm: "sale-invoice.view" }]
          : []),
        { name: "Purchase Invoices", path: "/purchase-invoices", icon: <ClipboardDocumentListIcon className="w-5 h-5" />, perm: "purchase-invoice.view" },
        { name: "Purchase Orders", path: "/purchase-orders", icon: <ClipboardDocumentCheckIcon className="w-5 h-5" />, perm: "purchase-order.view" },
      ]
    },
    {
      name: "Returns",
      key: "returns",
      icon: <ArrowUturnLeftIcon className="w-5 h-5" />,
      items: [
        { name: "Sale Returns", path: "/sale-returns", icon: <ArrowUturnLeftIcon className="w-5 h-5" />, perm: "sale-return.view" },
        { name: "Purchase Returns", path: "/purchase-returns", icon: <ArrowUturnDownIcon className="w-5 h-5" />, perm: "purchase-return.view" },
      ]
    },
    {
      name: "Stock & Inventory",
      key: "transactions",
      icon: <ShoppingCartIcon className="w-5 h-5" />,
      items: [
        { name: "Batch & Expiry", path: "/batch-expiry", icon: <ClockIcon className="w-5 h-5" />, perm: "batch-expiry.view" },
        { name: "User Demands", path: "/user-demands", icon: <ClipboardDocumentCheckIcon className="w-5 h-5" />, perm: "user-demands.view" },
        { name: "Stock Adjustments", path: "/stock-adjustments", icon: <ArrowsRightLeftIcon className="w-5 h-5" />, perm: "stock-adjustment.view" },
        { name: "Stocktake Sessions", path: "/stocktake-sessions", icon: <ClipboardDocumentCheckIcon className="w-5 h-5" />, perm: "stocktake.view" },
        { name: "Quarantine & Disposal", path: "/stock-disposals", icon: <ClockIcon className="w-5 h-5" />, perm: "stock-disposal.view" },
      ]
    },
    {
      name: "Finance & Ledgers",
      key: "finance",
      icon: <CurrencyDollarIcon className="w-5 h-5" />,
      items: [
        { name: "Customer Ledger", path: "/customer-ledger", icon: <UsersIcon className="w-5 h-5" />, perm: "customer-ledger.view" },
        { name: "Supplier Ledger", path: "/supplier-ledger", icon: <BuildingStorefrontIcon className="w-5 h-5" />, perm: "supplier-ledger.view" },
        { name: "Payment Vouchers", path: "/payments", icon: <BanknotesIcon className="w-5 h-5" />, perm: "payment.view" },
        { name: "Cash Drawer", path: "/cash-drawer", icon: <BanknotesIcon className="w-5 h-5" />, perm: "cash-drawer.view" },
        { name: "Financial Accounts", path: "/accounts", icon: <BanknotesIcon className="w-5 h-5" />, perm: "account.view" },
        { name: "Operating Expenses", path: "/expenses", icon: <CurrencyDollarIcon className="w-5 h-5" />, perm: "expense.view" },
        { name: "Double-Entry & GL", path: "/accounting", icon: <CalculatorIcon className="w-5 h-5" />, permAny: ["account.view", "report.net-profit.view"] },
        { name: "HR, Payroll & Commissions", path: "/hr-payroll", icon: <UserGroupIcon className="w-5 h-5" />, permAny: ["expense.view", "account.view", "user.view"] },
      ]
    },
    {
      name: "Reports",
      key: "reports",
      icon: <ChartBarIcon className="w-5 h-5" />,
      items: [
        { name: "Net Profit (P&L)", path: "/reports/net-profit", icon: <CalculatorIcon className="w-5 h-5" />, perm: "report.net-profit.view" },
        { name: "Statutory Tax Return", path: "/reports/tax-return", icon: <DocumentCurrencyDollarIcon className="w-5 h-5" />, permAny: ["report.net-profit.view", "report.sale-detail.view", "account.view"] },
        { name: "Cost of Sale", path: "/reports/cost-of-sale", icon: <CalculatorIcon className="w-5 h-5" />, perm: "report.cost-of-sale.view" },
        { name: "Cost of Sale Detail", path: "/reports/cost-of-sale-detail", icon: <DocumentTextIcon className="w-5 h-5" />, perm: "report.cost-of-sale-detail.view" },
        { name: "Outstanding Aging", path: "/reports/outstanding-aging", icon: <BanknotesIcon className="w-5 h-5" />, perm: "report.outstanding-aging.view" },
        { name: "Sale Detail", path: "/reports/sale-detail", icon: <DocumentCurrencyDollarIcon className="w-5 h-5" />, perm: "report.sale-detail.view" },
        { name: "Purchase Detail", path: "/reports/purchase-detail", icon: <ClipboardDocumentIcon className="w-5 h-5" />, perm: "report.purchase-detail.view" },
        { name: "Purchase Summary", path: "/reports/purchase-summary", icon: <ClipboardDocumentListIcon className="w-5 h-5" />, perm: "report.purchase-summary.view" },
        { name: "Sale Returns Report", path: "/reports/sale-returns", icon: <ArrowUturnLeftIcon className="w-5 h-5" />, perm: "report.sale-returns.view" },
        { name: "Purchase Returns Report", path: "/reports/purchase-returns", icon: <ArrowUturnDownIcon className="w-5 h-5" />, perm: "report.purchase-returns.view" },
        { name: "Current Stock", path: "/reports/current-stock", icon: <CubeIcon className="w-5 h-5" />, perm: "report.current-stock.view" },
        { name: "Low Stock & Reorder", path: "/reports/reorder", icon: <CubeIcon className="w-5 h-5" />, perm: "report.reorder.view" },
        { name: "Product Comprehensive", path: "/reports/product-comprehensive", icon: <ReportIcon className="w-5 h-5" />, perm: "report.product-comprehensive.view" },
        { name: "Near Expiry Product", path: "/reports/near-expiry-product", icon: <ClockIcon className="w-5 h-5" />, perm: "report.near-expiry-product.view" },
        { name: "Stock Adjustment Report", path: "/reports/stock-adjustment", icon: <ArrowsRightLeftIcon className="w-5 h-5" />, perm: "report.stock-adjustment.view" },
      ]
    },
    {
      name: "System & Settings",
      key: "system",
      icon: <Cog6ToothIcon className="w-5 h-5" />,
      items: [
        { name: "Settings", path: "/settings", icon: <Cog6ToothIcon className="w-5 h-5" />, perm: "settings.view" },
        { name: "Users", path: "/users", icon: <UserGroupIcon className="w-5 h-5" />, permAny: ["user.view", "user.manage"] },
        { name: "Roles", path: "/roles", icon: <KeyIcon className="w-5 h-5" />, perm: "role.view" },
        { name: "Backups & Storage", path: "/backups", icon: <ServerIcon className="w-5 h-5" />, perm: "backup.view" },
      ]
    },
  ], [hasWholesale]);

  // Flat menu for Dashboard
  const flatMenu = useMemo(() => [
    { name: "Dashboard", path: "/dashboard", icon: <HomeIcon className="w-5 h-5" />, perm: null },
  ], []);

  // Filter items based on permissions
  const getFilteredItems = (items) => {
    return items.filter((item) => {
      if (item.permAny) return !permsLoading && item.permAny.some((p) => has(p));
      if (item.perm) return !permsLoading && has(item.perm);
      return true;
    });
  };

  const isActive = (path) => pathname === path || pathname.startsWith(path + "/");

  // Check if any item in section is active
  const isSectionActive = (items) => {
    return items.some(item => isActive(item.path));
  };

  // Handle dropdown toggle with position calculation
  const toggleDropdown = (sectionName) => {
    if (openDropdown === sectionName) {
      setOpenDropdown(null);
      return;
    }

    const button = buttonRefs.current[sectionName];
    if (button) {
      const rect = button.getBoundingClientRect();
      const maxLeft = typeof window !== "undefined" ? Math.max(8, window.innerWidth - 256) : rect.left;
      setDropdownPosition({
        top: rect.bottom + 8,
        left: Math.max(8, Math.min(rect.left, maxLeft))
      });
    }
    setOpenDropdown(sectionName);
  };

  // Handle menu item click
  const handleMenuClick = (path) => {
    setOpenDropdown(null);
    navigate(path);
  };

  // Close dropdown when clicking outside (only if not clicking inside dropdown)
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if click is inside dropdown
      if (dropdownRef.current && dropdownRef.current.contains(event.target)) {
        return;
      }
      // Check if click is on a dropdown button
      const isOnButton = Object.values(buttonRefs.current).some(
        ref => ref && ref.contains(event.target)
      );
      if (!isOnButton) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <>
      <div className="
        bg-white/90 dark:bg-slate-800/90
        backdrop-blur-xl
        border-b border-gray-200/60 dark:border-slate-700/60
        shadow-lg
      ">
        <div className="flex items-stretch h-13 min-w-0">
          {/* Logo & Brand - Enhanced visibility */}
          <div className="flex items-center gap-2 sm:gap-2.5 px-2.5 sm:px-4 border-r border-gray-200/60 dark:border-slate-700/60 shrink-0">
            <div className="relative group shrink-0">
              <picture>
                {logoCandidates.map((src) => (
                  <img
                    key={src}
                    src={src}
                    alt={brandName}
                    className="h-8 w-8 sm:h-9 sm:w-9 object-contain rounded-xl shadow-md hidden"
                    onLoad={(e) => {
                      const imgs = e.currentTarget.parentElement.querySelectorAll("img");
                      imgs.forEach((im) => (im.style.display = "none"));
                      e.currentTarget.style.display = "block";
                    }}
                  />
                ))}
              </picture>
              {/* Decorative gradient ring */}
              <div className="absolute inset-0 rounded-xl bg-linear-to-br from-violet-500/30 to-purple-500/30 dark:from-violet-400/30 dark:to-purple-400/30" />
            </div>
            <div className="hidden sm:flex flex-col min-w-0">
              <span className="text-sm font-bold bg-linear-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent whitespace-nowrap truncate max-w-[140px]">
                {brandName}
              </span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                Management
              </span>
            </div>
          </div>
          
          {/* Navigation Items */}
          <nav
            className="
              flex-1 flex items-center gap-0.5
              overflow-x-auto
              px-2
              scrollbar-thin
            "
            role="navigation"
            aria-label="Main navigation"
          >
            {/* Dashboard Link - Uses primary theme color */}
            {getFilteredItems(flatMenu).map((item) => {
              const active = isActive(item.path);
              const colors = getSectionConfig('core');
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`
                    shrink-0 flex items-center gap-1 px-2.5 py-1.5
                    rounded-lg text-sm font-medium
                    transition-all duration-200
                    whitespace-nowrap
                    ${active
                      ? ""
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100/80 dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-slate-700/60"
                    }
                  `}
                  style={{
                    backgroundColor: active ? colors.light : undefined,
                  }}
                >
                  <span 
                    className="w-4 h-4 transition-colors duration-200"
                    style={{ color: active ? colors.base : undefined }}
                  >
                    <HomeIcon className="w-4 h-4" />
                  </span>
                  <span 
                    className="transition-colors duration-200"
                    style={{ color: active ? colors.base : undefined }}
                  >
                    {item.name}
                  </span>
                </Link>
              );
            })}

            {/* Section Divider */}
            <div className="shrink-0 w-px h-5 bg-gray-200 dark:bg-slate-600 my-auto mx-1" />

            {/* Dropdown Sections - Color coded with dynamic theme colors */}
            {menuSections.map((section) => {
              const filteredItems = getFilteredItems(section.items);
              if (filteredItems.length === 0) return null;

              const isOpen = openDropdown === section.name;
              const isActiveSection = isSectionActive(filteredItems);
              const colors = getSectionConfig(section.key);

              return (
                <div 
                  key={section.name} 
                  className="relative shrink-0"
                  onMouseEnter={() => setHoveredDropdown(section.key)}
                  onMouseLeave={() => setHoveredDropdown(null)}
                >
                  <button
                    ref={el => buttonRefs.current[section.name] = el}
                    onClick={() => toggleDropdown(section.name)}
                    className={`
                      flex items-center gap-1 px-2.5 py-1.5
                      rounded-lg text-sm font-medium
                      transition-all duration-200
                      whitespace-nowrap
                    `}
                    style={{
                      backgroundColor: (isActiveSection || hoveredDropdown === section.key) ? colors.light : undefined,
                    }}
                  >
                    <span 
                      className="w-4 h-4 transition-colors duration-200"
                      style={{ color: isActiveSection ? colors.base : undefined }}
                    >
                      {React.cloneElement(section.icon, { className: "w-4 h-4" })}
                    </span>
                    <span 
                      className="transition-colors duration-200"
                      style={{ color: isActiveSection ? colors.base : undefined }}
                    >
                      {section.name}
                    </span>
                    <ChevronDownIcon 
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      style={{ color: isActiveSection ? colors.base : undefined }}
                    />
                  </button>
                </div>
              );
            })}
          </nav>

          {/* Right: Screen-Aware Bilingual Guide Bot + Click-to-Explain */}
          <div className="flex items-center gap-1.5 px-2 sm:px-3 border-l border-gray-200/60 dark:border-slate-700/60 shrink-0">
            <GuideBotTopbarButton
              onClick={() => setGuideBotOpen((v) => !v)}
              isOpen={guideBotOpen}
              compact
            />
            <InspectElementTopbarButton compact />
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <FeatureGuideBot
          isOpen={guideBotOpen}
          onClose={() => setGuideBotOpen(false)}
        />
      </Suspense>

      {/* Fixed Position Dropdown Overlay - Enhanced with dynamic theme colors */}
      {openDropdown && (() => {
        const section = menuSections.find(s => s.name === openDropdown);
        const colors = section ? getSectionConfig(section.key) : getSectionConfig('core');
        const filteredItems = getFilteredItems(section?.items || []);
        
        return (
          <div
            ref={dropdownRef}
            className="fixed bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl rounded-xl shadow-2xl ring-1 ring-black/5 dark:ring-white/10 py-2 z-99999 overflow-hidden"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              minWidth: 'min(240px, calc(100vw - 16px))',
              maxWidth: 'calc(100vw - 16px)',
              maxHeight: 'min(400px, calc(100dvh - 80px))',
              overflowY: 'auto'
            }}
          >
            {/* Dropdown header with gradient */}
            <div 
              className="px-4 py-2 border-b border-gray-100 dark:border-slate-700"
              style={{ backgroundColor: colors.light }}
            >
              <div className="flex items-center gap-2">
                <div 
                  className="p-1 rounded-lg bg-white/50 dark:bg-slate-700/50"
                  style={{ color: colors.base }}
                >
                  {React.cloneElement(section?.icon, { className: "w-4 h-4" })}
                </div>
                <span 
                  className="text-sm font-semibold"
                  style={{ color: colors.base }}
                >
                  {section?.name}
                </span>
              </div>
            </div>
            
            {/* Dropdown items */}
            <div className="py-1">
              {filteredItems.map((item, index) => {
                const itemActive = isActive(item.path);
                return (
                  <button
                    key={item.path}
                    onClick={() => handleMenuClick(item.path)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all duration-150 text-left relative"
                    style={{
                      backgroundColor: itemActive ? colors.light : undefined,
                      color: itemActive ? colors.base : undefined,
                    }}
                  >
                    {/* Active indicator */}
                    {itemActive && (
                      <div 
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full"
                        style={{ backgroundColor: colors.base }}
                      />
                    )}
                    <span className="transition-transform duration-200" style={{ transform: itemActive ? 'scale(1.1)' : 'scale(1)' }}>
                      <div style={{ color: itemActive ? colors.base : undefined }}>
                        {React.cloneElement(item.icon, { className: "w-5 h-5" })}
                      </div>
                    </span>
                    <span className={itemActive ? "font-semibold" : ""}>{item.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}
    </>
  );
}
