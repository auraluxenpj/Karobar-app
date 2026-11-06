// resources/js/components/PageSkeleton.jsx
import React from "react";
import { useLocation } from "react-router-dom";

/**
 * Bone — A single Facebook-style shimmering placeholder primitive.
 * Supports three visual tones for realistic depth & hierarchy:
 * - "default": Primary bone (#e4e6eb light / slate-700 dark) for text, icons, avatars
 * - "soft": Subtle surface bone (#f0f2f5 light / slate-800 dark) for input wells & containers
 * - "accent": Theme-tinted bone for primary CTA buttons & active states
 */
function Bone({ className = "", tone = "default", style }) {
  const toneClass =
    tone === "soft"
      ? "kd-skeleton-bone-soft"
      : tone === "accent"
      ? "kd-skeleton-bone-accent"
      : "kd-skeleton-bone";

  return (
    <div
      className={`${toneClass} rounded-lg ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

/**
 * Resolves which skeleton layout best matches the current URL pathname
 * so users see a zero-CLS, Facebook-style structural preview of the target screen.
 */
function resolveVariantFromPath(pathname = "") {
  const p = pathname.toLowerCase().replace(/\/+$/, "") || "/";

  if (p === "/" || p.startsWith("/forgot-password") || p.startsWith("/reset-password")) {
    return "auth";
  }

  if (p === "/activate") {
    return "form";
  }

  if (p === "/dashboard") {
    return "dashboard";
  }

  if (p.includes("/pos") || p.includes("/barcode-pos")) {
    return "pos";
  }

  // Invoice & Return creation / editing forms (dense multi-column header + line-item grid)
  if (
    /^\/(sale-invoices|wholesale-invoices|purchase-invoices|sale-returns|purchase-returns)\/(create|[^/]+\/edit)/.test(
      p
    )
  ) {
    return "invoice-form";
  }

  // Standard entity create/edit forms & settings
  if (
    p.endsWith("/create") ||
    p.endsWith("/edit") ||
    p === "/settings" ||
    p === "/profile"
  ) {
    return "form";
  }

  // Read-only invoice / adjustment / stocktake detail views
  if (
    /^\/(sale-invoices|purchase-invoices|stock-adjustments|stocktake-sessions)\/\d+/.test(
      p
    )
  ) {
    return "detail";
  }

  // Reports & Ledgers (filter bar + KPI summary strip + data table)
  if (
    p.startsWith("/reports/") ||
    p === "/customer-ledger" ||
    p === "/supplier-ledger" ||
    p === "/accounting" ||
    p === "/hr-payroll" ||
    p === "/cash-drawer" ||
    p === "/batch-expiry"
  ) {
    return "report";
  }

  // Split directory pages (left quick-create card + right directory table on desktop)
  if (p === "/categories" || p === "/customers") {
    return "directory-split";
  }

  // Default: Master catalog / list table (Products, Invoices list, Suppliers, Brands, etc.)
  return "table";
}

/* ============================================================================
   1. SIDEBAR NAVIGATION SKELETON (Matches ClassicSidebar.jsx)
   ========================================================================== */

/**
 * SidebarNavSkeleton — Renders Facebook-style shimmer bones for the sidebar's
 * accordion sections & navigation items. Used both inside full-screen PageSkeleton
 * and directly inside ClassicSidebar while permissions are loading.
 */
function SidebarNavSkeleton({ collapsed = false, includeDashboard = true }) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-3 py-2" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, i) => (
          <Bone key={i} className="w-9 h-9 rounded-xl" />
        ))}
      </div>
    );
  }

  const expandedGroups = [
    {
      labelWidth: "w-28",
      items: ["w-24", "w-32", "w-24", "w-20", "w-24", "w-28"],
      activeIndex: 0,
    },
    {
      labelWidth: "w-20",
      items: ["w-28", "w-28", "w-36", "w-32"],
      activeIndex: -1,
    },
  ];

  const collapsedGroups = ["w-20", "w-32", "w-32", "w-20", "w-32"];

  return (
    <div className="space-y-1.5 select-none" aria-hidden="true">
      {/* Standalone Pinned Dashboard Link */}
      {includeDashboard && (
        <div className="mb-1.5 pb-1.5 border-b border-gray-200/60 dark:border-slate-700/60">
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-[11px] bg-blue-500/8 dark:bg-blue-500/12 border border-blue-500/15">
            <Bone tone="accent" className="w-5 h-5 rounded-lg shrink-0" />
            <Bone tone="accent" className="h-3.5 w-24 rounded-full" />
          </div>
        </div>
      )}

      {/* Expanded Accordion Sections (Items & Masters, Invoices) */}
      {expandedGroups.map((group, gIdx) => (
        <div key={gIdx} className="pb-1">
          {/* Section Header */}
          <div className="flex items-center justify-between px-2.5 py-2">
            <div className="flex items-center gap-2">
              <Bone className="w-4 h-4 rounded-md shrink-0" />
              <Bone className={`h-3 ${group.labelWidth} rounded-full`} />
            </div>
            <div className="flex items-center gap-1.5">
              <Bone tone="soft" className="w-5 h-4 rounded-md" />
              <Bone className="w-3.5 h-3.5 rounded-full" />
            </div>
          </div>

          {/* Section Nav Items */}
          <div className="space-y-1 mt-0.5">
            {group.items.map((widthCls, iIdx) => {
              const isRowActive = group.activeIndex === iIdx && gIdx === 0;
              return (
                <div
                  key={iIdx}
                  className={`flex items-center justify-between px-2.5 py-2 rounded-[11px] ${
                    isRowActive
                      ? "bg-slate-200/50 dark:bg-slate-800/70"
                      : ""
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Bone className="w-5 h-5 rounded-lg shrink-0" />
                    <Bone className={`h-3.5 ${widthCls} rounded-full`} />
                  </div>
                  {iIdx % 2 === 0 && (
                    <Bone tone="soft" className="w-4 h-4 rounded-md shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Collapsed Accordion Sections (Returns, Stock, Finance, Reports, System) */}
      <div className="pt-1 space-y-1">
        {collapsedGroups.map((widthCls, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between px-2.5 py-2 rounded-[10px]"
          >
            <div className="flex items-center gap-2">
              <Bone className="w-4 h-4 rounded-md shrink-0" />
              <Bone className={`h-3 ${widthCls} rounded-full`} />
            </div>
            <div className="flex items-center gap-1.5">
              <Bone tone="soft" className="w-5 h-4 rounded-md" />
              <Bone className="w-3.5 h-3.5 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * SidebarSkeleton — Full left navigation sidebar chrome matching ClassicSidebar.jsx.
 */
function SidebarSkeleton() {
  return (
    <aside className="workspace-sidebar h-full" aria-hidden="true">
      <div className="workspace-sidebar-inner workspace-sidebar-expanded">
        {/* Brand & Dock Mode Header */}
        <div className="workspace-sidebar-brand">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <Bone tone="accent" className="w-9 h-9 rounded-[11px] shrink-0" />
              <div className="flex flex-col gap-1.5 min-w-0">
                <Bone className="h-4 w-28 rounded-full" />
                <div className="flex items-center gap-1.5">
                  <Bone tone="accent" className="w-2 h-2 rounded-full shrink-0" />
                  <Bone className="h-2.5 w-20 rounded-full" />
                </div>
              </div>
            </div>
            <Bone tone="soft" className="w-7 h-7 rounded-xl shrink-0" />
          </div>

          {/* Quick Filter Input & Expand/Collapse All */}
          <div className="mt-2.5 flex items-center gap-1.5">
            <div className="flex-1 h-8 px-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 flex items-center gap-2">
              <Bone className="w-3.5 h-3.5 rounded-full shrink-0" />
              <Bone className="h-2.5 w-24 rounded-full" />
            </div>
            <Bone tone="soft" className="h-8 w-8 rounded-xl shrink-0" />
          </div>
        </div>

        {/* Scrollable Navigation Sections */}
        <div className="workspace-navigation">
          <SidebarNavSkeleton />
        </div>

        {/* Sidebar Footer */}
        <div className="workspace-sidebar-footer">
          <div className="h-9 w-full rounded-[10px] flex items-center justify-center gap-2 px-3">
            <Bone className="w-4 h-4 rounded-md shrink-0" />
            <Bone className="h-3 w-28 rounded-full" />
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ============================================================================
   2. TOP NAVIGATION BAR SKELETON (Matches Topbar.jsx)
   ========================================================================== */

function TopbarSkeleton({ showDockButton = false }) {
  return (
    <div className="workspace-topbar-slot" aria-hidden="true">
      <header className="workspace-topbar">
        <div className="workspace-topbar-row">
          {/* Left: Dock Trigger + Search Pages (Ctrl+K) + Products (Ctrl+P) + GuideBot (Ctrl+G) */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Mobile / Dock hamburger trigger */}
            <div className={showDockButton ? "shrink-0" : "lg:hidden shrink-0"}>
              <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-slate-100/80 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70">
                <Bone className="w-4 h-4 rounded" />
              </div>
            </div>

            {/* Quick Page Search Pill (Ctrl+K) */}
            <div className="inline-flex items-center gap-2 h-9 px-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 shrink-0">
              <Bone className="w-4 h-4 rounded-full shrink-0" />
              <Bone className="hidden sm:block h-3 w-20 rounded-full" />
              <Bone tone="soft" className="hidden md:block h-4 w-10 rounded" />
            </div>

            {/* Quick Product Lookup Pill (Ctrl+P) */}
            <div className="inline-flex items-center gap-2 h-9 px-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 shrink-0">
              <Bone className="w-4 h-4 rounded-md shrink-0" />
              <Bone className="hidden xl:block h-3 w-14 rounded-full" />
              <Bone tone="soft" className="hidden md:block h-4 w-9 rounded" />
            </div>

            {/* Screen-Aware GuideBot Trigger Pill (Ctrl+G) */}
            <div className="inline-flex items-center gap-2 h-9 px-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 shrink-0">
              <Bone tone="accent" className="w-5 h-5 rounded-lg shrink-0" />
              <Bone className="hidden md:block h-3 w-16 rounded-full" />
            </div>
          </div>

          {/* Right: Financial Registers | System Utilities | License & User Profile */}
          <div className="workspace-topbar-actions">
            {/* Group 1: Cash Drawer + Financial Accounts Pills */}
            <div className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-xl bg-emerald-500/8 border border-emerald-500/20 shrink-0">
              <Bone className="w-4 h-4 rounded shrink-0" />
              <Bone tone="accent" className="w-2 h-2 rounded-full shrink-0" />
              <Bone className="hidden lg:block h-3 w-16 rounded-full" />
            </div>

            <div className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-xl bg-blue-500/8 border border-blue-500/20 shrink-0">
              <Bone className="w-4 h-4 rounded shrink-0" />
              <Bone tone="accent" className="w-2 h-2 rounded-full shrink-0" />
              <Bone className="hidden lg:block h-3 w-20 rounded-full" />
            </div>

            <div className="mx-0.5 h-5 w-px bg-slate-300/60 dark:bg-slate-700/60 shrink-0" />

            {/* Group 2: Notification Bell, Shortcuts, Theme Toggle */}
            <div className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-slate-100/80 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 shrink-0">
              <Bone className="w-4 h-4 rounded-full" />
            </div>
            <div className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-slate-100/80 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 shrink-0">
              <Bone className="w-4 h-4 rounded-md" />
            </div>
            <div className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-slate-100/80 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 shrink-0">
              <Bone className="w-4 h-4 rounded-full" />
            </div>

            <div className="mx-0.5 h-5 w-px bg-slate-300/60 dark:bg-slate-700/60 shrink-0" />

            {/* Group 3: License Pill + User Avatar Menu Pill */}
            <div className="hidden 2xl:inline-flex items-center gap-1.5 h-9 px-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 shrink-0">
              <Bone className="w-3.5 h-3.5 rounded-full shrink-0" />
              <Bone className="h-3 w-16 rounded-full" />
            </div>

            <div className="inline-flex items-center gap-2 h-9 px-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 shrink-0">
              <Bone tone="accent" className="w-5 h-5 rounded-full shrink-0" />
              <Bone className="hidden xl:block h-3 w-16 rounded-full" />
              <Bone className="w-3 h-3 rounded-sm shrink-0" />
            </div>
          </div>
        </div>
      </header>
    </div>
  );
}

/* ============================================================================
   3. ROUTE-SPECIFIC PAGE CONTENT SKELETONS
   ========================================================================== */

/**
 * DashboardSkeleton — Mirrors Dashboard.jsx (Overview banner, 4 KPI cards,
 * 3-column financial strip, 2-col Chart + Top Products/Activity feed).
 */
function DashboardSkeleton() {
  return (
    <div className="dashboard-page">
      {/* Top Overview Header */}
      <div className="dashboard-overview">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <Bone tone="accent" className="w-12 h-12 rounded-2xl shrink-0" />
            <div className="space-y-2.5 pt-0.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <Bone className="h-7 w-56 sm:w-64 rounded-full" />
                <Bone tone="accent" className="h-5 w-20 rounded-full" />
              </div>
              <Bone className="h-3 w-72 sm:w-96 max-w-full rounded-full" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="hidden sm:grid grid-cols-3 gap-3 px-3 py-2 rounded-2xl kd-skeleton-card">
              {[0, 1, 2].map((i) => (
                <div key={i} className="px-2 space-y-1.5">
                  <Bone className="h-2.5 w-14 rounded-full" />
                  <Bone className="h-4 w-20 rounded-full" />
                </div>
              ))}
            </div>
            <Bone tone="soft" className="h-11 w-40 rounded-xl" />
            <Bone tone="accent" className="h-11 w-28 rounded-xl" />
          </div>
        </div>
      </div>

      {/* 4 Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { labelW: "w-24", valW: "w-36", subW: "w-28" },
          { labelW: "w-28", valW: "w-32", subW: "w-24" },
          { labelW: "w-20", valW: "w-36", subW: "w-32" },
          { labelW: "w-24", valW: "w-28", subW: "w-24" },
        ].map((card, i) => (
          <div key={i} className="dashboard-panel p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-1.5">
                <Bone className={`h-3.5 ${card.labelW} rounded-full`} />
                <Bone tone="soft" className="h-2.5 w-16 rounded-full" />
              </div>
              <Bone tone="accent" className="w-11 h-11 rounded-2xl shrink-0" />
            </div>
            <Bone className={`h-8 ${card.valW} rounded-xl`} />
            <div className="flex items-center justify-between pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
              <Bone tone="soft" className="h-5 w-16 rounded-full" />
              <Bone className={`h-2.5 ${card.subW} rounded-full`} />
            </div>
          </div>
        ))}
      </div>

      {/* Secondary 3-Column Financial / Stock Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="dashboard-panel p-4 flex items-center gap-3.5">
            <Bone className="w-11 h-11 rounded-2xl shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Bone className="h-3 w-28 rounded-full" />
                <Bone className="h-4 w-20 rounded-full" />
              </div>
              <Bone tone="soft" className="h-2 w-full rounded-full" />
            </div>
          </div>
        ))}
      </div>

      {/* Charts + Right Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Revenue & Purchase Analytics Chart */}
        <div className="lg:col-span-2 dashboard-panel p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200/60 dark:border-slate-700/60">
            <div className="flex items-center gap-3">
              <Bone className="w-10 h-10 rounded-xl shrink-0" />
              <div className="space-y-2">
                <Bone className="h-4 w-44 rounded-full" />
                <Bone className="h-2.5 w-60 rounded-full" />
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Bone tone="accent" className="h-8 w-16 rounded-lg" />
              <Bone tone="soft" className="h-8 w-16 rounded-lg" />
              <Bone tone="soft" className="h-8 w-16 rounded-lg" />
            </div>
          </div>

          {/* Facebook-style Chart Skeleton with Grid Lines & Bars */}
          <div className="relative h-64 pt-4 pb-6 px-2 flex flex-col justify-between">
            {[0, 1, 2, 3].map((line) => (
              <div
                key={line}
                className="w-full border-b border-dashed border-slate-200/70 dark:border-slate-700/60"
              />
            ))}
            <div className="absolute inset-x-4 bottom-6 top-6 flex items-end justify-between gap-2.5">
              {[42, 64, 50, 82, 58, 92, 70, 62, 86, 54, 76, 95].map((h, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                  <Bone
                    tone={i % 3 === 0 ? "accent" : "default"}
                    className="w-full rounded-t-lg"
                    style={{ height: `${h}%` }}
                  />
                  <Bone tone="soft" className="h-2 w-6 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Top Selling Products / Recent Transactions Feed */}
        <div className="dashboard-panel p-5 space-y-4">
          <div className="flex items-center justify-between pb-3.5 border-b border-slate-200/60 dark:border-slate-700/60">
            <div className="space-y-1.5">
              <Bone className="h-4 w-36 rounded-full" />
              <Bone className="h-2.5 w-24 rounded-full" />
            </div>
            <Bone tone="soft" className="h-7 w-16 rounded-full" />
          </div>

          <div className="space-y-3.5">
            {[
              { nameW: "w-32", metaW: "w-20", valW: "w-16" },
              { nameW: "w-40", metaW: "w-24", valW: "w-20" },
              { nameW: "w-28", metaW: "w-16", valW: "w-16" },
              { nameW: "w-36", metaW: "w-24", valW: "w-20" },
              { nameW: "w-32", metaW: "w-20", valW: "w-14" },
              { nameW: "w-28", metaW: "w-20", valW: "w-16" },
            ].map((row, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-1">
                <div className="flex items-center gap-3 min-w-0">
                  <Bone className="w-10 h-10 rounded-xl shrink-0" />
                  <div className="space-y-1.5 min-w-0">
                    <Bone className={`h-3.5 ${row.nameW} rounded-full`} />
                    <Bone tone="soft" className={`h-2.5 ${row.metaW} rounded-full`} />
                  </div>
                </div>
                <div className="text-right space-y-1.5 shrink-0">
                  <Bone className={`h-4 ${row.valW} rounded-full ml-auto`} />
                  <Bone tone="soft" className="h-2.5 w-12 rounded-full ml-auto" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * TableSkeleton — Mirrors Products/index.jsx, SaleInvoice/Index.jsx, PurchaseInvoice/index.jsx,
 * Suppliers/index.jsx, Brands/index.jsx (.products-page / .products-panel).
 */
function TableSkeleton() {
  const rowWidths = [
    { primary: "w-40", secondary: "w-24", cat: "w-24", price: "w-20" },
    { primary: "w-32", secondary: "w-20", cat: "w-28", price: "w-24" },
    { primary: "w-48", secondary: "w-28", cat: "w-20", price: "w-20" },
    { primary: "w-36", secondary: "w-24", cat: "w-24", price: "w-16" },
    { primary: "w-44", secondary: "w-20", cat: "w-28", price: "w-24" },
    { primary: "w-32", secondary: "w-24", cat: "w-20", price: "w-20" },
    { primary: "w-40", secondary: "w-28", cat: "w-24", price: "w-20" },
  ];

  return (
    <div className="products-page">
      {/* Top Heading + Search/Filter Panel */}
      <div className="products-panel">
        <div className="products-heading">
          <div className="flex items-center gap-4">
            <Bone tone="accent" className="w-[52px] h-[52px] rounded-[18px] shrink-0" />
            <div className="space-y-2.5">
              <Bone className="h-7 w-48 sm:w-56 rounded-full" />
              <div className="flex items-center gap-2">
                <Bone className="h-3 w-32 rounded-full" />
                <Bone tone="soft" className="h-3 w-20 rounded-full" />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Bone tone="soft" className="h-11 w-28 rounded-[14px]" />
            <Bone tone="soft" className="h-11 w-28 rounded-[14px]" />
            <Bone tone="accent" className="h-11 w-36 rounded-[14px]" />
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="products-filter-panel">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-7 space-y-2">
              <Bone className="h-3 w-28 rounded-full" />
              <div className="h-12 px-4 rounded-[14px] border border-slate-200/80 dark:border-slate-700/80 bg-white/70 dark:bg-slate-800/60 flex items-center gap-3">
                <Bone className="w-5 h-5 rounded-full shrink-0" />
                <Bone tone="soft" className="h-3.5 w-64 max-w-full rounded-full" />
              </div>
            </div>
            <div className="md:col-span-3 space-y-2">
              <Bone className="h-3 w-20 rounded-full" />
              <Bone tone="soft" className="h-12 w-full rounded-[14px]" />
            </div>
            <div className="md:col-span-2">
              <Bone tone="soft" className="h-12 w-full rounded-[14px]" />
            </div>
          </div>
        </div>
      </div>

      {/* Catalog Table Panel */}
      <div className="products-panel products-catalog">
        {/* Table Section Header */}
        <div className="products-catalog-heading border-b border-slate-200/70 dark:border-slate-700/70">
          <div className="flex items-center gap-3">
            <Bone className="h-5 w-36 rounded-full" />
            <Bone tone="soft" className="h-6 w-20 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <Bone tone="soft" className="h-9 w-24 rounded-xl" />
            <Bone tone="soft" className="h-9 w-28 rounded-xl" />
          </div>
        </div>

        {/* Table Column Headers */}
        <div className="px-6 py-3.5 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200/70 dark:border-slate-700/70 grid grid-cols-12 gap-4 items-center">
          <div className="col-span-1">
            <Bone className="w-5 h-5 rounded-md" />
          </div>
          <div className="col-span-4">
            <Bone className="h-3 w-28 rounded-full" />
          </div>
          <div className="col-span-2 hidden sm:block">
            <Bone className="h-3 w-20 rounded-full" />
          </div>
          <div className="col-span-2 hidden md:block">
            <Bone className="h-3 w-16 rounded-full" />
          </div>
          <div className="col-span-2">
            <Bone className="h-3 w-20 rounded-full ml-auto" />
          </div>
          <div className="col-span-1">
            <Bone className="h-3 w-12 rounded-full ml-auto" />
          </div>
        </div>

        {/* Facebook-style Shimmer Table Rows */}
        <div className="divide-y divide-slate-200/60 dark:divide-slate-700/50">
          {rowWidths.map((r, rowIdx) => (
            <div
              key={rowIdx}
              className="px-6 py-3.5 grid grid-cols-12 gap-4 items-center bg-white/40 dark:bg-slate-900/20"
            >
              {/* Checkbox */}
              <div className="col-span-1">
                <Bone tone="soft" className="w-5 h-5 rounded-md" />
              </div>

              {/* Primary Media Cell (Avatar/Thumb + 2 text lines) */}
              <div className="col-span-5 sm:col-span-4 flex items-center gap-3 min-w-0">
                <Bone className="w-10 h-10 rounded-xl shrink-0" />
                <div className="space-y-1.5 min-w-0 flex-1">
                  <Bone className={`h-3.5 ${r.primary} max-w-full rounded-full`} />
                  <Bone tone="soft" className={`h-2.5 ${r.secondary} max-w-full rounded-full`} />
                </div>
              </div>

              {/* Category / Party column */}
              <div className="col-span-2 hidden sm:block space-y-1.5">
                <Bone className={`h-3.5 ${r.cat} rounded-full`} />
                <Bone tone="soft" className="h-2.5 w-14 rounded-full" />
              </div>

              {/* Status / Stock Badge */}
              <div className="col-span-2 hidden md:flex items-center">
                <Bone tone="soft" className="h-6 w-20 rounded-full" />
              </div>

              {/* Numeric Value */}
              <div className="col-span-4 sm:col-span-2 space-y-1.5 text-right">
                <Bone className={`h-4 ${r.price} rounded-full ml-auto`} />
                <Bone tone="soft" className="h-2.5 w-12 rounded-full ml-auto" />
              </div>

              {/* Row Actions */}
              <div className="col-span-2 sm:col-span-1 flex items-center justify-end gap-1.5">
                <Bone tone="soft" className="w-8 h-8 rounded-xl" />
                <Bone tone="soft" className="w-8 h-8 rounded-xl hidden xl:block" />
              </div>
            </div>
          ))}
        </div>

        {/* Pagination Footer */}
        <div className="products-pagination border-t border-slate-200/70 dark:border-slate-700/70">
          <Bone className="h-3.5 w-48 rounded-full" />
          <div className="flex items-center gap-2">
            <Bone tone="soft" className="w-10 h-10 rounded-xl" />
            <Bone tone="accent" className="w-10 h-10 rounded-xl" />
            <Bone tone="soft" className="w-10 h-10 rounded-xl" />
            <Bone tone="soft" className="w-10 h-10 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * DirectorySplitSkeleton — Mirrors Categories.jsx & Customers.jsx
 * (.directory-page with left quick-create form panel + right directory table panel).
 */
function DirectorySplitSkeleton() {
  return (
    <div className="directory-page">
      {/* Top Directory Heading */}
      <div className="directory-panel">
        <div className="products-heading">
          <div className="flex items-center gap-4">
            <Bone tone="accent" className="w-[52px] h-[52px] rounded-[18px] shrink-0" />
            <div className="space-y-2">
              <Bone className="h-7 w-48 rounded-full" />
              <Bone className="h-3 w-64 rounded-full" />
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Bone tone="soft" className="h-11 w-28 rounded-[14px]" />
            <Bone tone="accent" className="h-11 w-32 rounded-[14px]" />
          </div>
        </div>
      </div>

      {/* Split Grid: Left Form Card + Right Table Card */}
      <div className="directory-grid">
        <div className="directory-panel">
          <div className="directory-panel-heading">
            <div className="flex items-center gap-3">
              <Bone tone="accent" className="w-10 h-10 rounded-xl shrink-0" />
              <div className="space-y-1.5">
                <Bone className="h-4 w-32 rounded-full" />
                <Bone tone="soft" className="h-2.5 w-44 rounded-full" />
              </div>
            </div>
          </div>
          <div className="p-5 space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Bone className="h-3 w-24 rounded-full" />
                <Bone tone="soft" className="h-11 w-full rounded-xl" />
              </div>
            ))}
            <Bone tone="accent" className="h-12 w-full rounded-xl mt-2" />
          </div>
        </div>

        <div className="directory-panel overflow-hidden">
          <div className="directory-panel-heading">
            <Bone className="h-5 w-40 rounded-full" />
            <Bone tone="soft" className="h-9 w-56 rounded-xl" />
          </div>
          <div className="divide-y divide-slate-200/60 dark:divide-slate-700/50">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="px-5 py-3.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Bone className="w-9 h-9 rounded-xl shrink-0" />
                  <div className="space-y-1.5">
                    <Bone className="h-3.5 w-36 rounded-full" />
                    <Bone tone="soft" className="h-2.5 w-24 rounded-full" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Bone tone="soft" className="h-6 w-20 rounded-full" />
                  <Bone tone="soft" className="w-8 h-8 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * InvoiceFormSkeleton — Mirrors SaleInvoiceRetailForm.jsx / PurchaseInvoiceForm.jsx (.purchase-entry).
 */
function InvoiceFormSkeleton() {
  return (
    <div className="purchase-entry overflow-hidden">
      {/* Top Sticky Invoice Header */}
      <div className="purchase-entry-header p-4 border-b border-slate-200/70 dark:border-slate-700/70 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Bone tone="accent" className="w-10 h-10 rounded-xl shrink-0" />
            <div className="space-y-1.5">
              <Bone className="h-5 w-48 rounded-full" />
              <Bone tone="soft" className="h-2.5 w-32 rounded-full" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Bone tone="soft" className="h-9 w-36 rounded-xl" />
            <Bone tone="accent" className="h-9 w-28 rounded-xl" />
          </div>
        </div>

        {/* Party, Date, Invoice # & Barcode Scan Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
          {[
            "w-24",
            "w-20",
            "w-24",
            "w-28",
            "w-20",
          ].map((lblW, i) => (
            <div key={i} className="space-y-1.5">
              <Bone className={`h-3 ${lblW} rounded-full`} />
              <Bone tone="soft" className="h-10 w-full rounded-xl" />
            </div>
          ))}
        </div>
      </div>

      {/* Line-Items Spreadsheet Table */}
      <div className="p-4 space-y-2.5">
        <div className="grid grid-cols-12 gap-2.5 px-3 py-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/70">
          <Bone className="col-span-4 h-3 w-28 rounded-full" />
          <Bone className="col-span-2 h-3 w-16 rounded-full" />
          <Bone className="col-span-1 h-3 w-10 rounded-full" />
          <Bone className="col-span-2 h-3 w-16 rounded-full" />
          <Bone className="col-span-2 h-3 w-20 rounded-full" />
          <Bone className="col-span-1 h-3 w-8 rounded-full ml-auto" />
        </div>

        {Array.from({ length: 6 }).map((_, rowIdx) => (
          <div
            key={rowIdx}
            className="grid grid-cols-12 gap-2.5 items-center px-2 py-1.5 rounded-xl border border-slate-200/50 dark:border-slate-700/40"
          >
            <div className="col-span-4 flex items-center gap-2">
              <Bone tone="soft" className="w-7 h-7 rounded-lg shrink-0" />
              <Bone tone="soft" className="h-9 flex-1 rounded-lg" />
            </div>
            <Bone tone="soft" className="col-span-2 h-9 rounded-lg" />
            <Bone tone="soft" className="col-span-1 h-9 rounded-lg" />
            <Bone tone="soft" className="col-span-2 h-9 rounded-lg" />
            <Bone className="col-span-2 h-9 rounded-lg" />
            <div className="col-span-1 flex justify-end">
              <Bone tone="soft" className="w-8 h-8 rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      {/* Sticky Footer Totals & Action Bar */}
      <div className="purchase-entry-footer p-4 border-t border-slate-200/70 dark:border-slate-700/70 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-1.5 px-3 py-2 rounded-xl bg-slate-100/60 dark:bg-slate-800/50">
              <Bone className="h-2.5 w-16 rounded-full" />
              <Bone className="h-5 w-24 rounded-full" />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2.5 self-end lg:self-auto">
          <Bone tone="soft" className="h-11 w-28 rounded-xl" />
          <Bone tone="soft" className="h-11 w-32 rounded-xl" />
          <Bone tone="accent" className="h-11 w-40 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/**
 * FormSkeleton — Mirrors ProductForm.jsx, Setting.jsx, Profile.jsx (.product-form-page).
 */
function FormSkeleton() {
  return (
    <div className="product-form-page">
      <div className="product-form-panel">
        <div className="product-form-page-heading">
          <div className="flex items-center gap-3.5">
            <Bone tone="accent" className="w-12 h-12 rounded-2xl shrink-0" />
            <div className="space-y-2">
              <Bone className="h-6 w-48 rounded-full" />
              <Bone className="h-3 w-64 rounded-full" />
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Bone tone="soft" className="h-10 w-24 rounded-xl" />
            <Bone tone="accent" className="h-10 w-32 rounded-xl" />
          </div>
        </div>

        <div className="product-form-body space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Bone className="h-3 w-28 rounded-full" />
                <Bone tone="soft" className="h-11 w-full rounded-xl" />
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Bone className="h-3 w-32 rounded-full" />
            <Bone tone="soft" className="h-24 w-full rounded-xl" />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200/60 dark:border-slate-700/60">
            <Bone tone="soft" className="h-11 w-28 rounded-xl" />
            <Bone tone="accent" className="h-11 w-36 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * DetailSkeleton — Mirrors SaleInvoice/Show.jsx & PurchaseInvoice/Show.jsx.
 */
function DetailSkeleton() {
  return (
    <div className="products-page">
      <div className="products-panel p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200/70 dark:border-slate-700/70">
          <div className="flex items-center gap-4">
            <Bone tone="accent" className="w-12 h-12 rounded-2xl shrink-0" />
            <div className="space-y-2">
              <Bone className="h-6 w-52 rounded-full" />
              <Bone className="h-3 w-36 rounded-full" />
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Bone tone="soft" className="h-10 w-24 rounded-xl" />
            <Bone tone="soft" className="h-10 w-28 rounded-xl" />
            <Bone tone="accent" className="h-10 w-28 rounded-xl" />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="p-4 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 space-y-2"
            >
              <Bone className="h-3 w-20 rounded-full" />
              <Bone className="h-5 w-32 rounded-full" />
              <Bone tone="soft" className="h-2.5 w-24 rounded-full" />
            </div>
          ))}
        </div>

        <div className="space-y-2.5">
          <Bone tone="soft" className="h-10 w-full rounded-xl" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Bone key={i} tone="soft" className="h-12 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * ReportSkeleton — Mirrors Reports/*.jsx & Customer/Supplier Ledgers (.report-page).
 */
function ReportSkeleton() {
  return (
    <div className="report-page">
      {/* Top Report Header + Filter Bar */}
      <div className="products-panel">
        <div className="products-heading">
          <div className="flex items-center gap-4">
            <Bone tone="accent" className="w-[52px] h-[52px] rounded-[18px] shrink-0" />
            <div className="space-y-2">
              <Bone className="h-7 w-56 rounded-full" />
              <Bone className="h-3 w-72 rounded-full" />
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Bone tone="soft" className="h-11 w-28 rounded-[14px]" />
            <Bone tone="accent" className="h-11 w-32 rounded-[14px]" />
          </div>
        </div>

        <div className="products-filter-panel">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Bone className="h-3 w-24 rounded-full" />
                <Bone tone="soft" className="h-11 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Report KPI Summary Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="report-kpi space-y-3">
            <div className="flex items-center gap-2.5">
              <Bone tone="accent" className="w-9 h-9 rounded-xl shrink-0" />
              <Bone className="h-3.5 w-28 rounded-full" />
            </div>
            <Bone className="h-7 w-36 rounded-lg" />
            <Bone tone="soft" className="h-2.5 w-24 rounded-full" />
          </div>
        ))}
      </div>

      {/* Report Data Table */}
      <div className="products-panel overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between">
          <Bone className="h-5 w-40 rounded-full" />
          <Bone tone="soft" className="h-8 w-24 rounded-lg" />
        </div>
        <div className="divide-y divide-slate-200/60 dark:divide-slate-700/50">
          {Array.from({ length: 7 }).map((_, idx) => (
            <div key={idx} className="px-6 py-3.5 grid grid-cols-12 gap-4 items-center">
              <Bone className="col-span-3 h-3.5 w-36 max-w-full rounded-full" />
              <Bone tone="soft" className="col-span-3 h-3.5 w-28 max-w-full rounded-full" />
              <Bone tone="soft" className="col-span-2 h-6 w-20 rounded-full" />
              <Bone className="col-span-2 h-3.5 w-20 rounded-full ml-auto" />
              <Bone className="col-span-2 h-4 w-24 rounded-full ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * PosSkeleton — Mirrors BarcodePos.jsx full-screen terminal.
 */
function PosSkeleton() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-100 dark:bg-slate-950 p-3 flex flex-col gap-3">
      {/* POS Top Bar */}
      <div className="kd-skeleton-card rounded-2xl px-4 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Bone tone="accent" className="w-9 h-9 rounded-xl" />
          <div className="space-y-1.5">
            <Bone className="h-4 w-36 rounded-full" />
            <Bone tone="soft" className="h-2.5 w-24 rounded-full" />
          </div>
        </div>
        <Bone tone="soft" className="h-10 flex-1 max-w-md rounded-xl" />
        <div className="flex items-center gap-2">
          <Bone tone="soft" className="h-9 w-28 rounded-xl" />
          <Bone tone="accent" className="h-9 w-24 rounded-xl" />
        </div>
      </div>

      {/* POS Split Workspace */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0">
        <div className="lg:col-span-8 kd-skeleton-card rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex gap-2">
            <Bone tone="soft" className="h-11 flex-1 rounded-xl" />
            <Bone tone="accent" className="h-11 w-32 rounded-xl" />
          </div>
          <div className="flex-1 space-y-2.5 overflow-hidden">
            {Array.from({ length: 7 }).map((_, i) => (
              <Bone key={i} tone="soft" className="h-12 w-full rounded-xl" />
            ))}
          </div>
        </div>
        <div className="lg:col-span-4 kd-skeleton-card rounded-2xl p-4 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <Bone className="h-5 w-36 rounded-full" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex justify-between items-center py-1">
                <Bone className="h-3.5 w-24 rounded-full" />
                <Bone className="h-4 w-20 rounded-full" />
              </div>
            ))}
          </div>
          <div className="space-y-2.5 pt-3 border-t border-slate-200/70 dark:border-slate-700/70">
            <Bone className="h-14 w-full rounded-2xl" />
            <Bone tone="accent" className="h-12 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * AuthSkeleton — Mirrors Login.jsx.
 */
function AuthSkeleton() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <div className="w-full max-w-md kd-skeleton-card rounded-3xl p-8 space-y-6">
        <div className="flex flex-col items-center gap-3">
          <Bone tone="accent" className="w-16 h-16 rounded-2xl" />
          <Bone className="h-6 w-48 rounded-full" />
          <Bone tone="soft" className="h-3 w-64 rounded-full" />
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Bone className="h-3 w-24 rounded-full" />
            <Bone tone="soft" className="h-11 w-full rounded-xl" />
          </div>
          <div className="space-y-2">
            <Bone className="h-3 w-24 rounded-full" />
            <Bone tone="soft" className="h-11 w-full rounded-xl" />
          </div>
          <Bone tone="accent" className="h-12 w-full rounded-xl mt-2" />
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   4. MAIN PAGE SKELETON ENTRYPOINT
   ========================================================================== */

export default function PageSkeleton({
  variant = "auto",
  fullScreen = false,
  showShell = false,
}) {
  let pathname = "/dashboard";
  try {
    const loc = useLocation();
    if (loc?.pathname) pathname = loc.pathname;
  } catch {
    if (typeof window !== "undefined" && window.location?.pathname) {
      pathname = window.location.pathname;
    }
  }

  const resolvedVariant =
    variant === "auto" ? resolveVariantFromPath(pathname) : variant;

  if (resolvedVariant === "auth") {
    return (
      <div
        className="kd-page-skeleton"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Loading authentication screen"
      >
        <AuthSkeleton />
      </div>
    );
  }

  if (resolvedVariant === "pos") {
    return (
      <div
        className="kd-page-skeleton"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Loading POS terminal"
      >
        <PosSkeleton />
      </div>
    );
  }

  let body;
  switch (resolvedVariant) {
    case "dashboard":
      body = <DashboardSkeleton />;
      break;
    case "invoice-form":
      body = <InvoiceFormSkeleton />;
      break;
    case "form":
      body = <FormSkeleton />;
      break;
    case "detail":
      body = <DetailSkeleton />;
      break;
    case "report":
      body = <ReportSkeleton />;
      break;
    case "directory-split":
      body = <DirectorySplitSkeleton />;
      break;
    case "table":
    default:
      body = <TableSkeleton />;
      break;
  }

  // Full App Shell Skeleton (Sidebar + Topbar + Workspace Page Content)
  // Rendered during initial bundle load, full-screen route transitions, or when showShell is true.
  if (fullScreen || showShell) {
    return (
      <div
        className="kd-page-skeleton workspace-shell workspace-shell-pinned"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Loading application workspace"
      >
        {/* Left Sidebar Skeleton (Desktop) */}
        <div className="workspace-sidebar-slot hidden lg:block">
          <div className="sticky top-[14px] h-[calc(100dvh-28px)]">
            <SidebarSkeleton />
          </div>
        </div>

        {/* Right Main Column: Topbar Skeleton + Route Content Skeleton */}
        <div className="workspace-main">
          <TopbarSkeleton />
          <main className="workspace-content">
            <div className="workspace-page">{body}</div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div
      className="kd-page-skeleton"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading page content"
    >
      {body}
    </div>
  );
}

export {
  Bone,
  SidebarSkeleton,
  SidebarNavSkeleton,
  TopbarSkeleton,
  DashboardSkeleton,
  InvoiceFormSkeleton,
  FormSkeleton,
  DetailSkeleton,
  ReportSkeleton,
  TableSkeleton,
  DirectorySplitSkeleton,
  PosSkeleton,
  AuthSkeleton,
};
