// src/components/Topbar.jsx
import React, { Suspense, lazy, useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import {
  ClockIcon,
  BellIcon,
  Bars3Icon,
  BanknotesIcon,
  BuildingLibraryIcon,
  MagnifyingGlassIcon,
  CommandLineIcon,
  CubeIcon,
  ExclamationTriangleIcon,
  HandRaisedIcon,
  XMarkIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/solid";
import toast from "react-hot-toast";
import { useLicense } from "@/context/LicenseContext.jsx";
import { useTheme } from "@/context/ThemeContext.jsx";
import { useCurrency } from "@/context/CurrencyContext.jsx";
import { usePermissions } from "@/api/usePermissions.js";
import ThemeToggle from "./ThemeToggle.jsx";
import {
  GuideBotTopbarButton,
  useGuideBotOpenState,
} from "./GuideBotTrigger.jsx";
import axios from "axios";

const ProductSearchModal = lazy(() => import("@/components/ProductSearchModal.jsx"));
const PageSearchModal = lazy(() => import("@/components/PageSearchModal.jsx"));
const KeyboardShortcutsModal = lazy(() => import("@/components/KeyboardShortcutsModal.jsx"));
const FeatureGuideBot = lazy(() => import("@/components/FeatureGuideBot.jsx"));
const NotificationCenter = lazy(() => import("./NotificationCenter.jsx"));
const CashDrawerModal = lazy(() => import("./CashDrawerModal.jsx"));
const AccountsModal = lazy(() => import("./AccountsModal.jsx"));

function formatRemaining(ms) {
  if (ms == null) return "Perpetual";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export default function Topbar({
  pageTitle,
  navigationStyle = "sidebar",
  onMobileMenuClick,
  sidebarPinned = false,
  onDesktopDockOpen,
  onOpenCurrentInSubWindow,
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const btnRef = useRef(null);

  // Notification center state
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifInitialTab, setNotifInitialTab] = useState("low-stock");
  const [notifCount, setNotifCount] = useState(0);
  const hasBaselinedNotifsRef = useRef(false);

  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const { formatCurrency } = useCurrency();
  const { loading: permsLoading, has } = usePermissions();

  // Cash Drawer Register state
  const [drawerModalOpen, setDrawerModalOpen] = useState(false);
  const [drawerStatus, setDrawerStatus] = useState({ isOpen: false, expected: 0, loading: true });
  const canViewDrawer =
    has("cash-drawer.view") ||
    has("cash-drawer.open") ||
    has("cash-drawer.close") ||
    has("cash-drawer.transaction");
  const canOpenDrawerPopup =
    has("cash-drawer.open") ||
    has("cash-drawer.close") ||
    has("cash-drawer.transaction");

  // Financial Accounts state
  const [accountsModalOpen, setAccountsModalOpen] = useState(false);
  const [accountsStatus, setAccountsStatus] = useState({ total_balance: 0, loading: true });

  // Product Search Modal state (opens anywhere with Alt+P)
  const [productSearchModalOpen, setProductSearchModalOpen] = useState(false);

  // Page Navigation Search Modal state (opens anywhere with Alt+K)
  const [pageSearchModalOpen, setPageSearchModalOpen] = useState(false);

  // Keyboard Shortcuts Modal state (opens anywhere with ?)
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);

  // Screen-Aware Bilingual Feature Guide Bot state (opens anywhere with Alt+G and stays open across pages)
  const [guideBotOpen, setGuideBotOpen] = useGuideBotOpenState();

  const canViewAccounts = has("account.view");

  const fetchDrawerStatus = useCallback(async () => {
    if (permsLoading || !canViewDrawer) {
      setDrawerStatus((prev) => ({ ...prev, loading: false }));
      return;
    }
    try {
      const res = await axios.get("/api/cash-drawer/current", {
        params: { summary_only: 1 },
      });
      setDrawerStatus({
        isOpen: !!res.data?.is_open,
        expected: Number(res.data?.summary?.expected_balance || 0),
        loading: false,
      });
    } catch {
      setDrawerStatus((prev) => ({ ...prev, loading: false }));
    }
  }, [permsLoading, canViewDrawer]);

  const fetchAccountsStatus = useCallback(async () => {
    if (permsLoading || !canViewAccounts) {
      setAccountsStatus((prev) => ({ ...prev, loading: false }));
      return;
    }
    try {
      const res = await axios.get("/api/accounts", {
        params: { summary_only: 1 },
      });
      setAccountsStatus({
        total_balance: Number(res.data?.total_balance || 0),
        loading: false,
      });
    } catch {
      setAccountsStatus((prev) => ({ ...prev, loading: false }));
    }
  }, [permsLoading, canViewAccounts]);

  useEffect(() => {
    if (permsLoading) return undefined;
    fetchDrawerStatus();
    fetchAccountsStatus();
    const onDrawerChanged = () => {
      fetchDrawerStatus();
    };
    const onAccountsChanged = () => {
      fetchAccountsStatus();
    };
    const onStorage = (e) => {
      if (e.key === "cash_drawer_sync" || e.key === "accounts_sync") {
        fetchDrawerStatus();
        fetchAccountsStatus();
      }
    };
    window.addEventListener("cash-drawer-changed", onDrawerChanged);
    window.addEventListener("accounts-changed", onAccountsChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("cash-drawer-changed", onDrawerChanged);
      window.removeEventListener("accounts-changed", onAccountsChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, [permsLoading, fetchDrawerStatus, fetchAccountsStatus]);

  const showLiveNotificationCard = useCallback(
    ({ id, category, badge, title, subtitle, meta, primaryLabel, onPrimary, secondaryLabel, onSecondary }) => {
      const styleMap = {
        "low-stock": {
          icon: ExclamationTriangleIcon,
          accent: "border-l-4 border-l-amber-500",
          badgeCls: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
        },
        demands: {
          icon: HandRaisedIcon,
          accent: "border-l-4 border-l-blue-500",
          badgeCls: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300",
        },
        expiry: {
          icon: ClockIcon,
          accent: "border-l-4 border-l-rose-500",
          badgeCls: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
        },
      };
      const cfg = styleMap[category] || styleMap["low-stock"];
      const Icon = cfg.icon;

      toast.custom(
        (t) => (
          <div
            role="status"
            aria-live="polite"
            className={`${
              t.visible ? "animate-in fade-in slide-in-from-top-2" : "opacity-0"
            } max-w-sm w-full bg-white dark:bg-slate-800 shadow-xl rounded-xl pointer-events-auto ring-1 ring-slate-200 dark:ring-slate-700 overflow-hidden transition-all duration-200 ${cfg.accent}`}
          >
            <div className="p-3.5">
              <div className="flex items-start justify-between gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${cfg.badgeCls}`}>
                  <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{badge}</span>
                </span>
                <button
                  type="button"
                  onClick={() => toast.dismiss(t.id)}
                  aria-label="Close live notification"
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              <p className="mt-1.5 text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug">
                {title}
              </p>
              {subtitle && (
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                  {subtitle}
                </p>
              )}
              {meta && (
                <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {meta}
                </p>
              )}

              {(primaryLabel || secondaryLabel) && (
                <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center gap-3">
                  {primaryLabel && (
                    <button
                      type="button"
                      onClick={() => {
                        toast.dismiss(t.id);
                        onPrimary?.();
                      }}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer"
                    >
                      {primaryLabel}
                    </button>
                  )}
                  {secondaryLabel && (
                    <button
                      type="button"
                      onClick={() => {
                        toast.dismiss(t.id);
                        onSecondary?.();
                      }}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {secondaryLabel}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ),
        { id, duration: 7000 }
      );
    },
    []
  );

  // Poll & reactively listen for low-stock + user-demand + expiry live notifications
  useEffect(() => {
    if (permsLoading) return;
    let cancelled = false;
    const todayKey = new Date().toISOString().slice(0, 10);
    const storageKey = `karobar_live_notified_${user?.id || "anon"}_${todayKey}`;
    const legacySessionKey = `karobar_live_notified_${user?.id || "anon"}`;

    const getSeenSet = () => {
      try {
        const localRaw = localStorage.getItem(storageKey);
        const sessionRaw = sessionStorage.getItem(legacySessionKey);
        const merged = [
          ...(localRaw ? JSON.parse(localRaw) : []),
          ...(sessionRaw ? JSON.parse(sessionRaw) : []),
        ];
        return new Set(merged);
      } catch {
        return new Set();
      }
    };

    const saveSeenSet = (set) => {
      try {
        const serialized = JSON.stringify([...set].slice(-500));
        localStorage.setItem(storageKey, serialized);
        sessionStorage.setItem(legacySessionKey, serialized);
      } catch {
        /* ignore storage quota errors */
      }
    };

    const fetchCount = async ({ isInitialMount = false } = {}) => {
      try {
        let justLoggedIn = false;
        if (isInitialMount) {
          try {
            if (sessionStorage.getItem("karobar_just_logged_in") === "1") {
              justLoggedIn = true;
              sessionStorage.removeItem("karobar_just_logged_in");
            }
          } catch {
            /* ignore storage errors */
          }
        }
        const shouldShowToasts =
          justLoggedIn || (!isInitialMount && hasBaselinedNotifsRef.current);

        const canViewProducts = has("product.view");
        const canViewDemands = has("user-demands.view");
        const canViewExpiry =
          canViewProducts ||
          has("batch-expiry.view") ||
          has("sale-invoice.create") ||
          has("purchase-invoice.create");

        const [lowStockRes, demandsRes, expiryRes] = await Promise.allSettled([
          canViewProducts
            ? axios.get("/api/notifications/low-stock", { params: { limit: 15 } })
            : Promise.resolve({ data: { count: 0, rows: [] } }),
          canViewDemands
            ? axios.get("/api/user-demands", { params: { status: "pending", limit: 15 } })
            : Promise.resolve({ data: { pending_count: 0, rows: [] } }),
          canViewExpiry
            ? axios.get("/api/notifications/expiry-alerts", { params: { limit: 15 } })
            : Promise.resolve({ data: { count: 0, rows: [] } }),
        ]);
        if (cancelled) return;

        const lowStockCount =
          lowStockRes.status === "fulfilled" ? Number(lowStockRes.value.data?.count || 0) : 0;
        const demandCount =
          demandsRes.status === "fulfilled" ? Number(demandsRes.value.data?.pending_count || 0) : 0;
        const expiryCount =
          expiryRes.status === "fulfilled" ? Number(expiryRes.value.data?.count || 0) : 0;

        setNotifCount(lowStockCount + demandCount + expiryCount);
        window.__karobarExpiryAlertCount = expiryCount;
        window.dispatchEvent(new CustomEvent("expiry-alert-count", { detail: expiryCount }));

        const seen = getSeenSet();

        // 1. Live User Demand Notifications
        const demandRows =
          demandsRes.status === "fulfilled" && Array.isArray(demandsRes.value.data?.rows)
            ? demandsRes.value.data.rows
            : [];
        const newDemands = [];
        const ackIds = [];
        const dayAgoMs = Date.now() - 24 * 60 * 60 * 1000;

        for (const d of demandRows) {
          const lastNotifiedMs = d.last_notified_at ? new Date(d.last_notified_at).getTime() : 0;
          const dateTag = lastNotifiedMs ? new Date(lastNotifiedMs).toISOString().slice(0, 10) : "unnotified";
          const baseKey = `demand:${d.id}`;
          const datedKey = `demand:${d.id}:${dateTag}`;
          const alreadySeen =
            seen.has(baseKey) ||
            seen.has(datedKey) ||
            seen.has(`demand:${d.id}:unnotified`) ||
            seen.has(`demand:${d.id}:${todayKey}`);

          seen.add(baseKey);
          seen.add(datedKey);
          seen.add(`demand:${d.id}:${todayKey}`);

          if (!alreadySeen && shouldShowToasts) {
            newDemands.push(d);
            if (!lastNotifiedMs || lastNotifiedMs < dayAgoMs) {
              ackIds.push(d.id);
            }
          }
        }

        if (shouldShowToasts) {
          newDemands.slice(0, 2).forEach((d) => {
            const itemName = d.requested_name || d.product?.name || "Product request";
            showLiveNotificationCard({
              id: `live-demand-${d.id}`,
              category: "demands",
              badge: "Product Demand",
              title: `${itemName} (${d.requested_quantity || 1} units)`,
              subtitle: d.notes || (d.customer?.name ? `Customer: ${d.customer.name}` : "Pending product demand"),
              meta: d.product_supplier_name ? `Supplier: ${d.product_supplier_name}` : undefined,
              primaryLabel: "View Demands",
              onPrimary: () => navigate("/user-demands"),
              secondaryLabel: "Open Center",
              onSecondary: () => {
                setNotifInitialTab("demands");
                setNotifOpen(true);
              },
            });
          });
          if (newDemands.length > 2) {
            showLiveNotificationCard({
              id: "live-demand-summary",
              category: "demands",
              badge: "Product Demands",
              title: `+${newDemands.length - 2} more pending product demand(s)`,
              subtitle: `${demandCount} total pending demand(s) awaiting procurement.`,
              primaryLabel: "View All Demands",
              onPrimary: () => navigate("/user-demands"),
            });
          }
          if (ackIds.length > 0) {
            axios.post("/api/notifications/ack-demand", { demand_ids: ackIds }).catch(() => {});
          }
        }

        // 2. Live Low-Stock Notifications
        const lowStockRows =
          lowStockRes.status === "fulfilled" && Array.isArray(lowStockRes.value.data?.rows)
            ? lowStockRes.value.data.rows
            : [];
        const newLowStock = [];
        for (const item of lowStockRows) {
          const key = `low-stock:${item.product_id}`;
          const alreadySeen = seen.has(key);
          seen.add(key);
          if (!alreadySeen && shouldShowToasts) {
            newLowStock.push(item);
          }
        }

        if (shouldShowToasts) {
          newLowStock.slice(0, 2).forEach((item) => {
            showLiveNotificationCard({
              id: `live-low-stock-${item.product_id}`,
              category: "low-stock",
              badge: "Low Stock Alert",
              title: `${item.product_name} is below pack size`,
              subtitle: `On-hand: ${item.quantity} units · Pack size: ${item.pack_size} units`,
              meta: item.supplier_name ? `Supplier: ${item.supplier_name}` : item.brand_name || undefined,
              primaryLabel: "View Low Stock",
              onPrimary: () => navigate("/products?low_stock=1"),
              secondaryLabel: "Dismiss",
              onSecondary: () => {
                axios
                  .post("/api/notifications/dismiss", { product_id: item.product_id })
                  .then(() => window.dispatchEvent(new CustomEvent("notifications-changed")))
                  .catch(() => {});
              },
            });
          });
          if (newLowStock.length > 2) {
            showLiveNotificationCard({
              id: "live-low-stock-summary",
              category: "low-stock",
              badge: "Low Stock Alerts",
              title: `+${newLowStock.length - 2} more product(s) low on stock`,
              subtitle: `${lowStockCount} running product(s) have dropped below pack size.`,
              primaryLabel: "Open Notification Center",
              onPrimary: () => {
                setNotifInitialTab("low-stock");
                setNotifOpen(true);
              },
            });
          }
        }

        // 3. Live Batch Expiry Notifications
        const expiryRows =
          expiryRes.status === "fulfilled" && Array.isArray(expiryRes.value.data?.rows)
            ? expiryRes.value.data.rows
            : [];
        const newExpiry = [];
        for (const b of expiryRows) {
          const key = `expiry:${b.batch_id}:${b.status || "warn"}`;
          const alreadySeen = seen.has(key);
          seen.add(key);
          if (!alreadySeen && shouldShowToasts) {
            newExpiry.push(b);
          }
        }

        if (shouldShowToasts) {
          newExpiry.slice(0, 2).forEach((b) => {
            const isExp = b.days_remaining < 0;
            showLiveNotificationCard({
              id: `live-expiry-${b.batch_id}`,
              category: "expiry",
              badge: isExp ? "Batch Expired" : "Expiry Warning",
              title: `${b.product_name} — Batch ${b.batch_number}`,
              subtitle: isExp
                ? `Expired ${Math.abs(b.days_remaining)} day(s) ago · ${b.quantity} units on hand`
                : `${b.days_remaining} day(s) remaining · Exp: ${b.expiry_date} (${b.quantity} units)`,
              primaryLabel: "Open Batch Tracking",
              onPrimary: () => navigate("/batch-expiry"),
              secondaryLabel: "Open Center",
              onSecondary: () => {
                setNotifInitialTab("expiry");
                setNotifOpen(true);
              },
            });
          });
          if (newExpiry.length > 2) {
            showLiveNotificationCard({
              id: "live-expiry-summary",
              category: "expiry",
              badge: "Expiry Alerts",
              title: `+${newExpiry.length - 2} more batch expiry alert(s)`,
              subtitle: `${expiryCount} batch(es) require attention.`,
              primaryLabel: "Open Expiry Alerts",
              onPrimary: () => {
                setNotifInitialTab("expiry");
                setNotifOpen(true);
              },
            });
          }
        }

        hasBaselinedNotifsRef.current = true;
        saveSeenSet(seen);
      } catch {
        if (!cancelled) setNotifCount(0);
      }
    };
    fetchCount({ isInitialMount: true });
    const interval = setInterval(() => fetchCount({ isInitialMount: false }), 30000); // poll every 30s

    // Refresh immediately when any relevant event occurs across the application
    const onChanged = () => fetchCount({ isInitialMount: false });
    const onCustomLive = (e) => {
      if (e?.detail) showLiveNotificationCard(e.detail);
    };
    window.addEventListener("notifications-changed", onChanged);
    window.addEventListener("live-notification", onCustomLive);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("notifications-changed", onChanged);
      window.removeEventListener("live-notification", onCustomLive);
    };
  }, [permsLoading, has, user?.id, navigate, showLiveNotificationCard]);

  // License status
  const { loading: licLoading, valid: licValid, remainingMs } = useLicense();
  const leftTxt = formatRemaining(remainingMs);

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

  // Get button style class from theme
  const buttonStyle = theme?.button_style || 'modern';
  const isOutlined = buttonStyle === 'outlined';
  const buttonStyleClass = {
    'modern':     'rounded-xl',
    'rounded':    'rounded-lg',
    'rounded-sm': 'rounded-md',
    'outlined':   'rounded-lg',
    'soft':       'rounded-2xl',
    'pill':       'rounded-full',
  }[buttonStyle] || 'rounded-xl';

  // Get button background based on style (outlined = transparent)
  const getButtonBg = (color) => isOutlined ? "transparent" : `color-mix(in srgb, ${color} 8%, var(--workspace-surface))`;
  const getButtonBorder = (color) => `1px solid color-mix(in srgb, ${color} ${isOutlined ? "50%" : "18%"}, transparent)`;
  const getButtonTextColor = () => "var(--workspace-ink)";

  // Dynamic button class generator
  const getButtonClass = (baseColor, hoverColor, shadowColor) => 
    `inline-flex items-center gap-1.5 ${buttonStyleClass} px-3 py-1 text-xs font-semibold transition-colors focus:outline-hidden focus:ring-2 focus:ring-${baseColor}/50 relative z-50 ${isOutlined ? 'border-2' : 'shadow-xs'}`;

  const openInNewTab = (path, title) =>
    window.dispatchEvent(
      new CustomEvent("karobar:open-subwindow", { detail: { path, title } })
    );

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      const isTyping =
        ["input", "textarea", "select"].includes(tag) || e.target?.isContentEditable;

      // ? (Shift+/) opens Shortcuts Modal when not typing
      if (!isTyping && e.key === "?") {
        e.preventDefault();
        setShortcutsModalOpen(true);
        return;
      }

      if (!e.altKey) return;

      // Alt+P opens Product Search Modal anywhere in the software (even when focused in forms)
      // Except on Sale Invoice Show (/sale-invoices/:id), where Alt+P prints the invoice
      if (e.code === "KeyP" || (e.key || "").toLowerCase() === "p") {
        const cleanPath = (window.location.pathname || "").replace(/\/+$/, "");
        if (/^\/sale-invoices\/\d+$/.test(cleanPath)) {
          return;
        }
        e.preventDefault();
        setProductSearchModalOpen((v) => !v);
        return;
      }

      // Alt+K opens Page Navigation Search modal anywhere in the software
      if (e.code === "KeyK" || e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPageSearchModalOpen((v) => !v);
        return;
      }

      // Alt+D opens Cash Drawer modal anywhere (only if user has operational drawer permissions)
      if (e.code === "KeyD" || e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (canOpenDrawerPopup) {
          setDrawerModalOpen((v) => !v);
        }
        return;
      }

      // Alt+A opens Accounts Register modal anywhere
      if (e.code === "KeyA" || e.key.toLowerCase() === "a") {
        e.preventDefault();
        setAccountsModalOpen((v) => !v);
        return;
      }

      // Alt+G opens the Screen-Aware Bilingual Guide Bot anywhere
      if (e.code === "KeyG" || e.key.toLowerCase() === "g") {
        e.preventDefault();
        setGuideBotOpen((v) => !v);
        return;
      }

      if (isTyping) return;

      if (e.code === "Digit1" || e.code === "Numpad1") {
        e.preventDefault();
        openInNewTab("/purchase-invoices/create");
      } else if (e.code === "Digit2" || e.code === "Numpad2") {
        e.preventDefault();
        openInNewTab("/sale-invoices/create/retail");
      } else if (e.key.toLowerCase() === "w") {
        e.preventDefault();
        openInNewTab("/sale-invoices/create/wholesale");
      }
    };

    const onOpenSearch = () => setProductSearchModalOpen(true);
    const onOpenPageSearch = () => setPageSearchModalOpen(true);
    const onOpenShortcuts = () => setShortcutsModalOpen(true);
    const onOpenGuideBot = () => setGuideBotOpen(true);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("open-product-search", onOpenSearch);
    window.addEventListener("open-page-search", onOpenPageSearch);
    window.addEventListener("open-shortcuts-modal", onOpenShortcuts);
    window.addEventListener("open-guide-bot", onOpenGuideBot);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("open-product-search", onOpenSearch);
      window.removeEventListener("open-page-search", onOpenPageSearch);
      window.removeEventListener("open-shortcuts-modal", onOpenShortcuts);
      window.removeEventListener("open-guide-bot", onOpenGuideBot);
    };
  }, []);

  useEffect(() => {
    function onClick(e) {
      if (!open) return;
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        btnRef.current &&
        !btnRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    function onEsc(e) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className="workspace-topbar-slot">
      <header
        role="banner"
        className="workspace-topbar"
      >
        <div className="workspace-topbar-row">
          {/* Left: Navigation Toggle + Quick Search (Alt+K) + Product Lookup (Alt+P) */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink-0">
            {/* Mobile menu button — visible on < lg */}
            <div className="lg:hidden shrink-0">
              <button
                type="button"
                onClick={onMobileMenuClick}
                aria-label="Open sidebar"
                className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-gray-200/70 dark:border-slate-600/70 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 focus:outline-none transition-all duration-150"
              >
                <Bars3Icon className="w-5 h-5" />
              </button>
            </div>

            {/* Desktop dock trigger button — visible on lg+ when sidebar is in macOS Auto-Hide Dock mode */}
            {!sidebarPinned && onDesktopDockOpen && (
              <div className="hidden lg:block shrink-0">
                <button
                  type="button"
                  onClick={onDesktopDockOpen}
                  aria-label="Toggle navigation dock"
                  title="Open Navigation Dock (or hover left screen edge)"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-gray-200/70 dark:border-slate-600/70 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-slate-700 focus:outline-none transition-all duration-150 cursor-pointer"
                >
                  <Bars3Icon className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Quick Page Navigation Search (Alt+K) */}
            <button
              type="button"
              onClick={() => setPageSearchModalOpen(true)}
              title="Quick Navigation — Go to any page or report (Alt+K)"
              aria-label="Open page search"
              aria-keyshortcuts="Alt+K"
              className="inline-flex items-center justify-center gap-2 h-9 w-9 md:w-auto md:px-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/70 hover:bg-slate-200/70 dark:hover:bg-slate-700/80 border border-slate-200/80 dark:border-slate-700/80 text-xs text-slate-600 dark:text-slate-300 transition-all duration-150 cursor-pointer shrink-0 whitespace-nowrap"
            >
              <MagnifyingGlassIcon className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
              <span className="hidden md:inline font-medium">Search Pages</span>
              <kbd className="hidden xl:inline-block px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 shrink-0">
                Alt+K
              </kbd>
            </button>

            {/* Quick Product Lookup (Alt+P) */}
            <button
              type="button"
              onClick={() => setProductSearchModalOpen(true)}
              title="Global Product & Batch Lookup (Alt+P)"
              aria-label="Open product lookup"
              aria-keyshortcuts="Alt+P"
              className="inline-flex items-center justify-center gap-2 h-9 w-9 xl:w-auto xl:px-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/70 hover:bg-slate-200/70 dark:hover:bg-slate-700/80 border border-slate-200/80 dark:border-slate-700/80 text-xs font-medium text-slate-700 dark:text-slate-200 transition-all duration-150 cursor-pointer shrink-0 whitespace-nowrap"
            >
              <CubeIcon className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
              <span className="hidden xl:inline">Products</span>
              <kbd className="hidden 2xl:inline-block px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 shrink-0">
                Alt+P
              </kbd>
            </button>

            {/* Screen-Aware Bilingual Guide Bot (English + اردو) (Alt+G) */}
            <GuideBotTopbarButton
              onClick={() => setGuideBotOpen((v) => !v)}
              isOpen={guideBotOpen}
              pageTitle={pageTitle}
            />

            {/* Open Current View in a Floating Sub-Window inside Main Window */}
            {onOpenCurrentInSubWindow && (
              <button
                type="button"
                onClick={onOpenCurrentInSubWindow}
                title={`Open "${pageTitle || "Current View"}" in a floating Sub-Window inside Main Window (Ctrl+Shift+N)`}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-2.5 rounded-xl bg-blue-50/90 dark:bg-blue-950/60 hover:bg-blue-600 hover:text-white border border-blue-200 dark:border-blue-800 text-xs font-semibold text-blue-700 dark:text-blue-300 transition-all duration-150 cursor-pointer shrink-0 whitespace-nowrap"
              >
                <span>⧉</span>
                <span className="hidden xl:inline">Sub-Window</span>
              </button>
            )}
          </div>

          {/* Right: 1) Financial Registers | 2) System Utilities | 3) License & User */}
          <div className="workspace-topbar-actions">
            {/* Group 1: Financial Registers (Cash Drawer + Accounts) */}
            {permsLoading ? (
              <>
                <div
                  aria-hidden="true"
                  className="inline-flex items-center gap-1.5 h-9 px-2 sm:px-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-100/70 dark:bg-slate-800/60 shrink-0"
                >
                  <span className="kd-skeleton-bone w-4 h-4 rounded shrink-0" />
                  <span className="kd-skeleton-bone-accent w-2 h-2 rounded-full shrink-0" />
                  <span className="hidden xl:inline-block kd-skeleton-bone h-3 w-16 rounded-full" />
                </div>
                <div
                  aria-hidden="true"
                  className="inline-flex items-center gap-1.5 h-9 px-2 sm:px-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-100/70 dark:bg-slate-800/60 shrink-0"
                >
                  <span className="kd-skeleton-bone w-4 h-4 rounded shrink-0" />
                  <span className="kd-skeleton-bone-accent w-2 h-2 rounded-full shrink-0" />
                  <span className="hidden xl:inline-block kd-skeleton-bone h-3 w-20 rounded-full" />
                </div>
                <div className="hidden sm:block mx-0.5 h-5 w-px bg-slate-300/60 dark:bg-slate-700/60 shrink-0" />
              </>
            ) : (
              <>
                {canViewDrawer && (
                  <button
                    type="button"
                    onClick={() => {
                      if (canOpenDrawerPopup) {
                        setDrawerModalOpen(true);
                      }
                    }}
                    aria-label="Cash Drawer register"
                    title={
                      drawerStatus.isOpen
                        ? `Cash Drawer Open: ${formatCurrency(drawerStatus.expected)} (Alt+D)`
                        : canOpenDrawerPopup
                        ? "Cash Drawer is Closed — Click to Open Shift (Alt+D)"
                        : "Cash Drawer is Closed"
                    }
                    className={`inline-flex items-center gap-1 sm:gap-1.5 h-9 px-2 sm:px-2.5 text-xs font-semibold rounded-xl transition-all duration-150 relative z-20 shrink-0 whitespace-nowrap border ${
                      canOpenDrawerPopup ? "cursor-pointer" : "cursor-default"
                    } ${
                      drawerStatus.isOpen
                        ? `bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400${
                            canOpenDrawerPopup ? " hover:bg-emerald-500/20" : ""
                          }`
                        : `bg-slate-500/10 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300${
                            canOpenDrawerPopup ? " hover:bg-slate-500/20" : ""
                          }`
                    }`}
                  >
                    <BanknotesIcon className="w-4 h-4 shrink-0" />
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        drawerStatus.isOpen ? "bg-emerald-500 animate-pulse" : "bg-amber-400"
                      }`}
                    />
                    {drawerStatus.loading ? (
                      <span className="hidden xl:inline-block kd-skeleton-bone h-3 w-16 rounded-full" />
                    ) : (
                      <span className="hidden xl:inline font-bold">
                        {drawerStatus.isOpen ? formatCurrency(drawerStatus.expected) : "Drawer"}
                      </span>
                    )}
                  </button>
                )}

                {has("account.view") && (
                  <button
                    type="button"
                    onClick={() => setAccountsModalOpen(true)}
                    aria-label="Financial Accounts register"
                    title={`Financial Accounts Register: ${formatCurrency(accountsStatus.total_balance)} across all accounts (Alt+A)`}
                    className="inline-flex items-center gap-1 sm:gap-1.5 h-9 px-2 sm:px-2.5 text-xs font-semibold rounded-xl transition-all duration-150 relative z-20 shrink-0 whitespace-nowrap border bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 cursor-pointer"
                  >
                    <BuildingLibraryIcon className="w-4 h-4 shrink-0" />
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    {accountsStatus.loading ? (
                      <span className="hidden xl:inline-block kd-skeleton-bone h-3 w-20 rounded-full" />
                    ) : (
                      <span className="hidden xl:inline font-bold">
                        {formatCurrency(accountsStatus.total_balance)}
                      </span>
                    )}
                  </button>
                )}

                {(canViewDrawer || has("account.view")) && (
                  <div className="hidden sm:block mx-0.5 h-5 w-px bg-slate-300/60 dark:bg-slate-700/60 shrink-0" />
                )}
              </>
            )}

            {/* Group 2: System Utilities (Notification Bell, Shortcuts, Theme) */}
            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              title="Notifications & Stock Alerts"
              aria-label="Open notification center"
              className={`relative inline-flex items-center justify-center h-9 w-9 ${buttonStyleClass} transition-colors focus:outline-hidden focus:ring-2 focus:ring-${themeColors.primary}/50 shrink-0 cursor-pointer ${isOutlined ? 'border-2' : 'shadow-xs'}`}
              style={{
                background: getButtonBg(themeColors.primary),
                border: getButtonBorder(themeColors.primary),
                color: getButtonTextColor(themeColors.primary),
                borderRadius: 'var(--btn-radius, 0.75rem)',
              }}
            >
              <BellIcon className="w-4 h-4 shrink-0" />
              {notifCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold text-white"
                  style={{
                    background: 'linear-gradient(to bottom right, #ef4444, #dc2626)',
                    boxShadow: '0 2px 6px rgba(239,68,68,0.5)',
                  }}
                >
                  {notifCount > 99 ? "99+" : notifCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShortcutsModalOpen(true)}
              title="Keyboard Shortcuts (?)"
              aria-label="Open keyboard shortcuts guide"
              aria-keyshortcuts="?"
              className={`relative hidden md:inline-flex items-center justify-center h-9 w-9 ${buttonStyleClass} transition-colors focus:outline-hidden focus:ring-2 focus:ring-${themeColors.primary}/50 shrink-0 cursor-pointer ${isOutlined ? 'border-2' : 'shadow-xs'}`}
              style={{
                background: getButtonBg(themeColors.primary),
                border: getButtonBorder(themeColors.primary),
                color: getButtonTextColor(themeColors.primary),
                borderRadius: 'var(--btn-radius, 0.75rem)',
              }}
            >
              <CommandLineIcon className="w-4 h-4 shrink-0" />
            </button>

            <div className="shrink-0 flex items-center">
              <ThemeToggle />
            </div>

            <div className="hidden sm:block mx-0.5 h-5 w-px bg-slate-300/60 dark:bg-slate-700/60 shrink-0" />

            {/* Group 3: License & User Account */}
            <button
              type="button"
              onClick={() => navigate("/settings#license")}
              className="hidden sm:inline-flex items-center justify-center gap-1.5 h-9 px-2.5 text-xs font-semibold rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-100/80 dark:bg-slate-800/70 hover:bg-slate-200/70 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 transition-all duration-150 relative z-20 shrink-0 whitespace-nowrap cursor-pointer"
              title={licLoading ? "Checking license…" : licValid ? `License active (${leftTxt} left)` : "License required – click to activate"}
            >
              <ClockIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden 2xl:inline">{licLoading ? "Checking…" : licValid ? `${leftTxt} left` : "Activate"}</span>
            </button>

            {/* User menu */}
            <div className="relative shrink-0">
              <button
                ref={btnRef}
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-1 sm:gap-1.5 h-9 px-2 sm:px-2.5 text-xs font-semibold rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-100/80 dark:bg-slate-800/70 hover:bg-slate-200/70 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 transition-all duration-150 relative z-20 shrink-0 cursor-pointer"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls="topbar-user-menu"
              >
                <span className="inline-grid h-5 w-5 place-items-center rounded-full border border-current/30 text-xs font-bold shrink-0">
                  {(user?.name || "U").slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden xl:inline text-xs font-semibold workspace-user-name">
                  {user?.name || "User"}
                </span>
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {open && (
                <div
                  id="topbar-user-menu"
                  ref={menuRef}
                  role="menu"
                  className={[
                    "absolute right-0 mt-2 w-48 rounded-xl overflow-hidden shadow-xl border border-slate-200 dark:border-slate-700",
                    "workspace-user-menu",
                    navigationStyle === 'topbar' ? 'z-1000000' : 'z-50',
                  ].join(" ")}
                >
                  <button
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      navigate("/profile");
                    }}
                    className="workspace-user-menu-item"
                  >
                    Profile
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      navigate("/settings#license");
                    }}
                    className="workspace-user-menu-item sm:hidden"
                  >
                    {licLoading ? "License Status" : licValid ? `License (${leftTxt} left)` : "Activate License"}
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      setShortcutsModalOpen(true);
                    }}
                    className="workspace-user-menu-item md:hidden"
                  >
                    Keyboard Shortcuts
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      fetch("/api/logout", {
                        method: "POST",
                        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
                      }).finally(() => {
                        logout();
                        navigate("/");
                      });
                    }}
                    className="workspace-user-menu-item"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Lazy-loaded Topbar Modals — only mounted & downloaded when opened */}
      <Suspense fallback={null}>
        {notifOpen && (
          <NotificationCenter
            open={notifOpen}
            onClose={() => setNotifOpen(false)}
            initialTab={notifInitialTab}
          />
        )}

        {canOpenDrawerPopup && drawerModalOpen && (
          <CashDrawerModal
            isOpen={drawerModalOpen}
            onClose={() => setDrawerModalOpen(false)}
            onSessionUpdated={fetchDrawerStatus}
          />
        )}

        {accountsModalOpen && (
          <AccountsModal
            isOpen={accountsModalOpen}
            onClose={() => setAccountsModalOpen(false)}
            onAccountUpdated={() => {
              fetchAccountsStatus();
              fetchDrawerStatus();
            }}
            onOpenCashDrawer={() => {
              if (canOpenDrawerPopup) {
                setDrawerModalOpen(true);
              }
            }}
          />
        )}

        {productSearchModalOpen && (
          <ProductSearchModal
            isOpen={productSearchModalOpen}
            onClose={() => setProductSearchModalOpen(false)}
          />
        )}

        {pageSearchModalOpen && (
          <PageSearchModal
            isOpen={pageSearchModalOpen}
            onClose={() => setPageSearchModalOpen(false)}
          />
        )}

        {shortcutsModalOpen && (
          <KeyboardShortcutsModal
            isOpen={shortcutsModalOpen}
            onClose={() => setShortcutsModalOpen(false)}
          />
        )}
      </Suspense>

      <Suspense fallback={null}>
        <FeatureGuideBot
          isOpen={guideBotOpen}
          onClose={() => setGuideBotOpen(false)}
        />
      </Suspense>
    </div>
  );
}

