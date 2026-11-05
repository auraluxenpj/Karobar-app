// src/pages/purchase-orders/forecast.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import {
  ArrowPathIcon,
  PlayCircleIcon,
  PrinterIcon,
  CalculatorIcon,
  CalendarIcon,
  ShieldCheckIcon,
  CubeIcon,
  TagIcon,
  BuildingStorefrontIcon,
  ArrowUturnLeftIcon,
  HandRaisedIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import { usePermissions } from "@/api/usePermissions.js";
import { useTheme } from "@/context/ThemeContext.jsx";
import { getThemeButtonClasses } from "@/utils/buttonStyles";
import BrandSearch from "../components/BrandSearch.jsx";
import SupplierSearch from "../components/SupplierSearch.jsx";
import { printHtmlViaIframe } from "@/utils/printHelper.js";

import { arrangePurchaseOrderRows, purchaseOrderArrangements } from "@/utils/purchaseOrderArrangement";

// Reusable components
import {
  GlassCard,
  GlassSectionHeader,
  GlassToolbar,
  GlassInput,
  GlassBtn,
  TextSearch,
} from "@/components";

// Helper to determine text color based on background brightness
const getContrastText = (hexColor) => {
  hexColor = hexColor.replace('#', '');
  const r = parseInt(hexColor.substring(0, 2), 16);
  const g = parseInt(hexColor.substring(2, 4), 16);
  const b = parseInt(hexColor.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
};

const getButtonTextColor = (primaryColor, primaryHoverColor) => {
  return getContrastText(primaryHoverColor || primaryColor);
};

// Section configuration with color schemes - will use dynamic theme colors
const SECTION_CONFIG = {
  core: {
    key: 'primary',
  },
  management: {
    key: 'secondary',
  },
};

// Helper to get color value from theme
const getThemeColor = (theme, colorKey, variant = 'color') => {
  if (!theme) return '#3b82f6';
  const key = `${colorKey}_${variant}`;
  return theme[key] || '#3b82f6';
};

// Helper to generate section styles from theme
const getSectionStyles = (theme, colorKey) => {
  const baseColor = getThemeColor(theme, colorKey, 'color');
  const hoverColor = getThemeColor(theme, colorKey, 'hover');
  const lightColor = getThemeColor(theme, colorKey, 'light');
  
  return {
    gradient: `from-[${baseColor}] to-[${hoverColor}]`,
    bgLight: `bg-[${lightColor}]`,
    bgDark: `dark:bg-[${lightColor}]`,
    borderColor: `border-[${baseColor}]/30 dark:border-[${baseColor}]/30`,
    iconColor: `text-[${baseColor}] dark:text-[${baseColor}]`,
    ringColor: `ring-[${baseColor}]/30`,
  };
};

export default function PurchaseOrder() {
  const navigate = useNavigate();
  const today = new Date().toISOString().split("T")[0];

  // 🔒 permissions (support both has() and canFor())
  const { loading: permsLoading, has, canFor } = usePermissions?.() || {};
  const canView =
    typeof has === "function"
      ? has("purchase-order.view")
      : typeof canFor === "function"
      ? !!canFor("purchase-order")?.view
      : true;
  const canGenerate =
    typeof has === "function"
      ? has("purchase-order.generate")
      : typeof canFor === "function"
      ? !!canFor("purchase-order")?.create
      : true;

  // Get dark mode state and theme colors
  const { theme, isDark } = useTheme();

  // Memoize theme colors for performance
  const themeColors = useMemo(() => {
    if (!theme) {
      return {
        primary: '#3b82f6',
        primaryHover: '#2563eb',
        primaryLight: '#dbeafe',
        secondary: '#8b5cf6',
        secondaryHover: '#7c3aed',
        secondaryLight: '#ede9fe',
        tertiary: '#06b6d4',
        tertiaryHover: '#0891b2',
        tertiaryLight: '#cffafe',
        emerald: '#10b981',
        emeraldHover: '#059669',
        emeraldLight: '#d1fae5',
      };
    }
    return {
      primary: theme.primary_color || '#3b82f6',
      primaryHover: theme.primary_hover || '#2563eb',
      primaryLight: theme.primary_light || '#dbeafe',
      secondary: theme.secondary_color || '#8b5cf6',
      secondaryHover: theme.secondary_hover || '#7c3aed',
      secondaryLight: theme.secondary_light || '#ede9fe',
      tertiary: theme.tertiary_color || '#06b6d4',
      tertiaryHover: theme.tertiary_hover || '#0891b2',
      tertiaryLight: theme.tertiary_light || '#cffafe',
      emerald: theme.success_color || '#10b981',
      emeraldHover: '#059669',
      emeraldLight: '#d1fae5',
    };
  }, [theme]);

  // Calculate text colors based on background brightness
  const primaryTextColor = useMemo(() => 
    getButtonTextColor(themeColors.primary, themeColors.primaryHover), 
    [themeColors.primary, themeColors.primaryHover]
  );
  
  const secondaryTextColor = useMemo(() => 
    getButtonTextColor(themeColors.secondary, themeColors.secondaryHover), 
    [themeColors.secondary, themeColors.secondaryHover]
  );
  
  const emeraldTextColor = useMemo(() => 
    getButtonTextColor(themeColors.emerald, themeColors.emeraldHover), 
    [themeColors.emerald, themeColors.emeraldHover]
  );

  // Get section styles for core and management
  const coreStyles = useMemo(() => getSectionStyles(themeColors, 'primary'), [themeColors]);
  const managementStyles = useMemo(() => getSectionStyles(themeColors, 'secondary'), [themeColors]);

  // Get button style from theme
  const buttonStyle = theme?.button_style || 'modern';

  const getButtonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark, primaryTextColor),
    [buttonStyle, themeColors, isDark, primaryTextColor]
  );

  const btnPrimary = getButtonClasses.primary;
  const btnSecondary = getButtonClasses.secondary;
  const btnTertiary = getButtonClasses.tertiary;
  const btnGlass = getButtonClasses.glass;

  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [projectedDays, setProjectedDays] = useState(7);

  const [safetyPacks, setSafetyPacks] = useState(1);
  const [moqPacks, setMoqPacks] = useState(0);

const [supplier, setSupplier] = useState(null);
  const [brands, setBrands] = useState([]); // supports multiple selected brands
  const [supplierSearchOpen, setSupplierSearchOpen] = useState(false);
  const [brandSearchOpen, setBrandSearchOpen] = useState(false);

const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // === result filters (client-side, applied to the fetched rows) ===
  const [resultBrandId, setResultBrandId] = useState("all"); // "all" | brand key ("none" = no brand)
  const [stockFilter, setStockFilter] = useState("all"); // all | out | low | in
  const [lowStockThreshold, setLowStockThreshold] = useState(10);
  const [orderFilter, setOrderFilter] = useState("all"); // all | to_order | no_order

  const [arrangement, setArrangement] = useState(() => {
    try {
      const saved = localStorage.getItem('purchase-order-forecast-arrangement');
      return purchaseOrderArrangements.some(option => option.id === saved) ? saved : 'original';
    } catch { return 'original'; }
  });
  const changeArrangement = (value) => {
    setArrangement(value);
    setSelectedIndex(-1);
    try { localStorage.setItem('purchase-order-forecast-arrangement', value); } catch { /* Storage may be unavailable. */ }
  };

  // === printer type (a4 | thermal) — respects saved setting ===
  const [printerType, setPrinterType] = useState("a4");

  // === keyboard navigation state/refs ===
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const tableWrapRef = useRef(null);
  const inputRefs = useRef({});
  const rowRefs = useRef({});

  const printBtnRef = useRef(null);

  // Load saved printer preference
  useEffect(() => {
    axios
      .get("/api/settings")
      .then(({ data }) => {
        if (data?.printer_type) setPrinterType(String(data.printer_type).toLowerCase());
      })
      .catch(() => {});
  }, []);

  const fmt2 = (v) => Number(v ?? 0).toFixed(2);

  // === Result filters: brand options come only from brands present in the current results ===
  const availableBrands = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const id = r.brand_id ?? null;
      const key = String(id ?? "none");
      if (!map.has(key)) {
        map.set(key, { key, id, name: r.brand_name || (id ? `Brand #${id}` : "No Brand"), count: 0 });
      }
      map.get(key).count += 1;
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  // Rows visible in the table after applying the result filters
  const visibleRows = useMemo(() => {
    return arrangePurchaseOrderRows(rows.filter((r) => {
      if (resultBrandId !== "all" && String(r.brand_id ?? "none") !== String(resultBrandId)) return false;

      const stock = Number(r.current_stock_units || 0);
      if (stockFilter === "out" && stock !== 0) return false;
      if (stockFilter === "low" && stock > lowStockThreshold) return false;
      if (stockFilter === "in" && stock <= 0) return false;

      const packs = Number(r.order_packs || 0);
      if (orderFilter === "to_order" && packs <= 0) return false;
      if (orderFilter === "no_order" && packs > 0) return false;

      return true;
    }), arrangement);
  }, [rows, resultBrandId, stockFilter, lowStockThreshold, orderFilter, arrangement]);

  const hasActiveResultFilters =
    resultBrandId !== "all" || stockFilter !== "all" || orderFilter !== "all";

  const clearResultFilters = () => {
    setResultBrandId("all");
    setStockFilter("all");
    setOrderFilter("all");
  };

  // Rows to print: the visible (filtered) rows with order_packs > 0 — what you see is what you print
  const printRows = useMemo(
    () => visibleRows.filter((r) => Number(r.order_packs || 0) > 0),
    [visibleRows]
  );

  const printTotalPacks = useMemo(
    () => printRows.reduce((sum, r) => sum + Number(r.order_packs || 0), 0),
    [printRows]
  );

  // Alt+P: print (must be declared after printRows so its deps array can reference it)
  useEffect(() => {
    const onKey = (e) => {
      if (!e.altKey) return;
      const key = (e.key || "").toLowerCase();
      if (key !== "p") return;
      e.preventDefault();
      doPrint();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, printRows, brands, supplier, resultBrandId, canView, printerType]);

  // Build a self-contained HTML document for A4 or thermal (80mm)
  const buildPrintHtml = (type) => {
    const isA4 = type === "a4";
    const dateLabel = new Date().toLocaleDateString();
    const supplierLabel = supplier?.label || (rows[0]?.supplier_name || "—");
    // Brand label: the active result-brand filter wins, else selected brands, else distinct brands in rows
    const filteredBrand =
      resultBrandId !== "all"
        ? availableBrands.find((b) => b.key === String(resultBrandId))
        : null;
    const brandLabel = filteredBrand
      ? filteredBrand.name
      : brands.length
        ? brands.map((b) => b.label).join(", ")
        : (Array.from(new Set(rows.map((r) => r.brand_name).filter(Boolean))).join(", ") || "—");

    const esc = (s) =>
      String(s ?? "")
        .replace(/&/g, "&" + "amp;")
        .replace(/</g, "&" + "lt;")
        .replace(/>/g, "&" + "gt;")
        .replace(/"/g, "&" + "quot;");

    const rowsHtml = printRows
      .map(
        (r) => `
          <tr>
            <td class="name">${esc(r.product_name)}</td>
            <td class="qty">${Number(r.order_packs || 0)}</td>
          </tr>`
      )
      .join("");

    // Thermal (80mm) styles
    const thermalCss = `
      @page { size: 80mm auto; margin: 0; }
      * { box-sizing: border-box; }
      body { margin:0; padding:0; color:#000; background:#fff; font-family:'Courier New',monospace; font-weight:700; font-size:12px; line-height:1.35; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      .receipt { width:80mm; max-width:100%; margin:0 auto; padding:8px 6px; }
      .center { text-align:center; }
      .store { font-size:18px; text-align:center; }
      .meta { text-align:center; font-size:10px; }
      .hr { border-top:1px dashed #000; margin:5px 0; }
      .double-hr { border-top:2px double #000; margin:6px 0; }
      .pair { display:flex; justify-content:space-between; }
      .pair + .pair { margin-top:2px; }
      table { width:100%; border-collapse:collapse; }
      thead th { text-align:left; padding:2px 0; border-bottom:1px solid #000; }
      tbody td { padding:2px 0; border-bottom:1px solid #000; }
      td.qty, th.qty { text-align:right; white-space:nowrap; }
      .total { font-size:13px; font-weight:bold; margin-top:4px; display:flex; justify-content:space-between; }
      .foot { margin-top:8px; text-align:center; font-size:9px; }
    `;

    // A4 styles
    const a4Css = `
      @page { size: A4; margin: 14mm; }
      * { box-sizing: border-box; }
      body { margin:0; padding:0; color:#111; background:#fff; font-family:Arial,Helvetica,sans-serif; }
      .page { width:100%; }
      .header { display:flex; align-items:center; gap:14px; border-bottom:1px solid #ccc; padding-bottom:12px; }
      .store h1 { margin:0; font-size:20px; letter-spacing:.4px; }
      .store .meta { margin-top:4px; font-size:12px; color:#666; line-height:1.4; }
      .title-row { display:flex; justify-content:space-between; align-items:baseline; margin:16px 0 6px; }
      .title-row .title { font-size:18px; font-weight:700; }
      .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:6px 16px; font-size:12px; margin-bottom:10px; }
      .grid .lbl { color:#666; }
      .grid .val { font-weight:600; }
      table { width:100%; border-collapse:collapse; margin-top:8px; font-size:12px; }
      thead th { text-align:left; border-bottom:1px solid #ccc; padding:7px 6px; }
      tbody td { border-bottom:1px dashed #e0e0e0; padding:7px 6px; }
      td.qty, th.qty { text-align:right; }
      .footer-total { width:45%; margin-left:auto; border:1px solid #ccc; border-radius:6px; overflow:hidden; margin-top:14px; }
      .footer-total .row { display:flex; justify-content:space-between; padding:9px 12px; }
      .footer-total .row.total { font-weight:800; }
      .foot { margin-top:24px; text-align:center; font-size:12px; color:#666; }
    `;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Purchase Order</title>
<style>${isA4 ? a4Css : thermalCss}</style>
</head>
<body>
${isA4 ? `
<div class="page">
  <div class="header">
    <div class="store">
      <h1>Purchase Order</h1>
      <div class="meta">${esc(supplierLabel)}</div>
    </div>
  </div>
  <div class="title-row">
    <div class="title">Purchase Order</div>
    <div class="meta">Date: ${dateLabel}</div>
  </div>
  <div class="grid">
    <div><span class="lbl">Supplier:</span> <span class="val">${esc(supplierLabel)}</span></div>
    <div><span class="lbl">Brand:</span> <span class="val">${esc(brandLabel)}</span></div>
    <div><span class="lbl">Items:</span> <span class="val">${printRows.length}</span></div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:85%">Product</th>
        <th class="qty" style="width:15%">Order Packs</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="footer-total">
    <div class="row total"><div>Total Packs</div><div>${printTotalPacks}</div></div>
  </div>
  <div class="foot">Generated on ${dateLabel}</div>
</div>
` : `
<div class="receipt">
  <div class="store">PURCHASE ORDER</div>
  <div class="meta">${esc(supplierLabel)}</div>
  <div class="hr"></div>
  <div class="pair"><div>Date</div><div>${dateLabel}</div></div>
  <div class="pair"><div>Brand</div><div>${esc(brandLabel)}</div></div>
  <div class="pair"><div>Items</div><div>${printRows.length}</div></div>
  <div class="double-hr"></div>
  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th class="qty">Packs</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="hr"></div>
  <div class="total"><div>TOTAL PACKS</div><div>${printTotalPacks}</div></div>
  <div class="foot">Generated on ${dateLabel}</div>
</div>
`}
</body>
</html>`;
  };

  const doPrint = (type = printerType) => {
    if (!canView) return toast.error("You don't have permission to view/print.");
    if (!rows.length) return toast.error("Nothing to print.");
    if (!printRows.length) return toast.error("No products with Order Packs > 0 to print.");

    const html = buildPrintHtml(type);

    const width = type === "thermal" ? 400 : 900;
    const height = 700;
    const left = Math.max(0, (window.screenX || 0) + (window.outerWidth - width) / 2);
    const top = Math.max(0, (window.screenY || 0) + (window.outerHeight - height) / 2);
    const features = [
      `width=${width}`,
      `height=${height}`,
      `left=${left}`,
      `top=${top}`,
      "menubar=no",
      "toolbar=no",
      "location=no",
      "status=no",
      "scrollbars=yes",
      "resizable=yes",
    ].join(",");

    const w = window.open("", "poPrintWin", features);
    if (!w) {
      printHtmlViaIframe(html);
      return;
    }

    w.document.open();
    w.document.write(html);
    w.document.close();

    const trigger = () => {
      try { w.focus(); w.print(); } catch {}
    };
    w.onload = trigger;
    setTimeout(trigger, 400);
  };

  const handleFetch = async () => {
    if (!canGenerate) return toast.error("You don't have permission to generate.");
    if (!dateFrom || !dateTo) return toast.error("Please select both dates.");
    if (!projectedDays || projectedDays <= 0) return toast.error("Projected Days must be at least 1.");

    setLoading(true);
    try {
      const params = {
        date_from: dateFrom,
        date_to: dateTo,
        projected_days: projectedDays,
        safety_packs: safetyPacks,
        moq_packs: moqPacks,
      };
      if (supplier) params.supplier_id = supplier.value;
      if (brands.length) params.brand_ids = brands.map((b) => b.value);

      const { data } = await axios.get("/api/purchase-orders/forecast", { params });

      const mapped = (data.items || []).map((r, idx) => {
        const order_packs = r.suggested_packs ?? 0;
        const order_units = order_packs * (r.pack_size ?? 1);
        const order_amount = order_packs * (r.pack_price ?? 0);
        return { ...r, order_packs, order_units, order_amount, _rowId: `${r.product_id}-${idx}` };
      });

      setRows(mapped);
      setSelectedIndex(mapped.length ? 0 : -1);
      // Reset result filters for the new forecast
      setResultBrandId("all");
      setStockFilter("all");
      setOrderFilter("all");
      toast.success("Forecast ready.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to load forecast.");
    } finally {
      setLoading(false);
    }
  };

  const pruneNoPackPrice = () => {
    if (!rows.length) return;
    const before = rows.length;
    const kept = rows.filter((r) => Number(r.pack_purchase_price || 0) > 0);
    const removed = before - kept.length;
    setRows(kept);
    setSelectedIndex((i) => {
      const newLen = kept.length;
      if (newLen === 0) return -1;
      return Math.min(i, newLen - 1);
    });
    toast[removed > 0 ? "success" : "custom"](
      removed > 0 ? `Removed ${removed} item(s) without pack purchase price.` : "No rows without pack purchase price."
    );
  };

  const totals = useMemo(() => {
    let packs = 0, units = 0, amount = 0;
    for (const r of visibleRows) {
      packs  += Number(r.order_packs || 0);
      units  += Number(r.order_units || 0);
      amount += Number(r.order_amount || 0);
    }
    return { packs, units, amount };
  }, [visibleRows]);

  const updateOrderPacks = (rowId, value) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r._rowId !== rowId) return r;
        const v = Math.max(0, parseInt(value || 0, 10));
        const units = v * (r.pack_size ?? 1);
        const amt   = v * (r.pack_price ?? 0);
        return { ...r, order_packs: v, order_units: units, order_amount: amt };
      })
    );
  };

  // Async server-side search (prefix only)
  const makeLoadOptions = (endpoint) => {
    let timeoutId = null;
    let lastReject = null;

    return (inputValue, callback) => {
      if (lastReject) {
        lastReject("Aborted");
        lastReject = null;
      }
      if (timeoutId) clearTimeout(timeoutId);

      const query = (inputValue || "").trim();
      if (!query) {
        callback([]);
        return;
      }

      timeoutId = setTimeout(async () => {
        try {
          const controller = new AbortController();
          lastReject = controller.abort.bind(controller);
          const { data } = await axios.get(endpoint, {
            signal: controller.signal,
            params: { q: query, mode: "prefix", limit: 30 },
          });

          const list = Array.isArray(data) ? data : (data?.data || []);
          const options = list.map((x) => ({ value: x.id, label: x.name }));
          callback(options);
        } catch (e) {
          if (axios.isCancel?.(e)) return;
          console.warn(e);
          callback([]);
        } finally {
          lastReject = null;
        }
      }, 250);
    };
  };

  const loadSupplierOptions = makeLoadOptions("/api/suppliers/search");
  const loadBrandOptions    = makeLoadOptions("/api/brands/search");

  // Dynamic select styles based on dark mode
  const getSelectStyles = (isDarkMode = false) => ({
    control: (base) => ({
      ...base,
      minHeight: 32,
      height: 32,
      fontSize: 12,
      background: isDarkMode ? "rgba(51,65,85,0.7)" : "rgba(255,255,255,0.7)",
      backdropFilter: "blur(6px)",
      borderRadius: 10,
      borderColor: isDarkMode ? "rgba(71,85,105,0.8)" : "rgba(226,232,240,0.7)",
      boxShadow: isDarkMode ? "0 1px 2px rgba(0,0,0,0.2)" : "none",
      color: isDarkMode ? "#f1f5f9" : "#111827",
    }),
    valueContainer: (base) => ({ ...base, height: 32, padding: "0 8px" }),
    indicatorsContainer: (base) => ({ ...base, height: 32 }),
    input: (base) => ({ ...base, margin: 0, padding: 0, color: isDarkMode ? "#f1f5f9" : "#111827" }),
    singleValue: (base) => ({ ...base, color: isDarkMode ? "#f1f5f9" : "#111827" }),
    placeholder: (base) => ({ ...base, color: isDarkMode ? "#64748b" : "#9ca3af" }),
    menu: (base) => ({ 
      ...base, 
      fontSize: 12, 
      borderRadius: 10, 
      overflow: "hidden",
      backgroundColor: isDarkMode ? "rgba(30,41,59,0.95)" : "rgba(255,255,255,0.95)",
      backdropFilter: "blur(10px)",
      boxShadow: isDarkMode ? "0 10px 30px -10px rgba(0,0,0,0.4)" : "0 10px 30px -10px rgba(30,64,175,0.18)",
      border: isDarkMode ? "1px solid rgba(71,85,105,0.5)" : "none",
    }),
    option: (base, state) => ({ 
      ...base, 
      fontSize: 12,
      backgroundColor: isDarkMode
        ? state.isFocused
          ? "rgba(71,85,105,1)"
          : "rgba(51,65,85,1)"
        : state.isFocused
          ? "rgba(241,245,249,1)"
          : "rgba(255,255,255,1)",
      color: isDarkMode ? "#f1f5f9" : "#111827",
      cursor: "pointer",
    }),
    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  });

  // Keyboard navigation handlers (operate over the visible/filtered rows)
  useEffect(() => {
    if (selectedIndex < 0 || selectedIndex >= visibleRows.length) return;
    const row = visibleRows[selectedIndex];
    const inputEl = inputRefs.current[row._rowId];
    const trEl = rowRefs.current[row._rowId];

    if (trEl && tableWrapRef.current) {
      const wrap = tableWrapRef.current;
      const trBox = trEl.getBoundingClientRect();
      const wrapBox = wrap.getBoundingClientRect();
      if (trBox.top < wrapBox.top + 40 || trBox.bottom > wrapBox.bottom - 40) {
        trEl.scrollIntoView({ block: "nearest" });
      }
    }
    if (inputEl) {
      requestAnimationFrame(() => {
        inputEl.focus();
        inputEl.select();
      });
    }
  }, [selectedIndex, visibleRows]);

  const onKeyDownTable = (e) => {
    const key = e.key;
    if (key === "ArrowDown" || key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((idx) => {
        const next =
          key === "ArrowDown"
            ? Math.min((idx < 0 ? -1 : idx) + 1, visibleRows.length - 1)
            : Math.max((idx < 0 ? 0 : idx) - 1, 0);
        return next;
      });
    }
  };

  if (permsLoading) return <div className="p-6">Loading…</div>;
  if (!canView) return <div className="p-6 text-sm text-gray-700">You don't have permission to view Purchase Order (Forecast).</div>;

  return (
    <div className="purchase-order-page space-y-4 print:p-0" onKeyDown={onKeyDownTable}>
<div className="flex flex-wrap gap-2 print:hidden">
        <Link className="g-btn-ghost theme-btn-tertiary inline-flex items-center justify-center gap-2" to="/purchase-orders">Orders & Receipt History</Link>
        {has('purchase-order.create') && <button className="g-btn-primary theme-btn-primary" disabled={!printRows.length} onClick={() => navigate('/purchase-orders/create', { state: { items: printRows.map(r => ({ product_id: r.product_id, product: { id: r.product_id, name: r.product_name, brand_name: r.brand_name }, ordered_quantity: r.order_units, pack_size: r.pack_size, unit_purchase_price: r.pack_price / r.pack_size, item_discount_percentage: 0 })) } })}>Create Order from Forecast</button>}
      </div>
{/* Forecast overview */}
      <div
        className="purchase-order-header products-panel relative overflow-hidden"
      >
        {/* Decorative blurred blobs */}
        <div
          className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-30 blur-3xl pointer-events-none"
          style={{ backgroundColor: "#ffffff" }}
        />
        <div
          className="absolute -bottom-20 -left-10 w-72 h-72 rounded-full opacity-20 blur-3xl pointer-events-none"
          style={{ backgroundColor: themeColors.tertiary }}
        />

        {/* Hero Top */}
        <div className="purchase-order-heading relative flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div
              className="p-2.5 rounded-xl shadow-inner"
              style={{ backgroundColor: "rgba(255,255,255,0.18)", backdropFilter: "blur(4px)" }}
            >
              <CalculatorIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-wide text-white leading-none">Purchase Order (Forecast)</h1>
              <p className="text-xs text-white/80 mt-1">
                {loading ? (
                  <span className="inline-flex items-center gap-1">
                    <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                    Loading...
                  </span>
                ) : (
                  `${rows.length} item(s) in forecast`
                )}
              </p>
            </div>
          </div>

        </div>

        <div className="purchase-order-actions">
          <div className="purchase-order-workflow-actions" role="group" aria-label="Forecast actions">
            <button
              type="button"
              onClick={handleFetch}
              disabled={loading || !canGenerate}
              className="purchase-order-action purchase-order-action-primary theme-btn-primary"
              title={!canGenerate ? "Not permitted" : "Generate forecast (Alt+G)"}
            >
              <PlayCircleIcon aria-hidden="true" />
              <span>{loading ? "Generating…" : "Generate forecast"}</span>
            </button>
            <button
              type="button"
              onClick={pruneNoPackPrice}
              disabled={!rows.length}
              className="purchase-order-action theme-btn-secondary"
              title="Remove products with no Pack Purchase Price"
            >
              <XMarkIcon aria-hidden="true" />
              <span>Exclude zero-price items</span>
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="purchase-order-action purchase-order-action-refresh"
              title="Refresh page"
              aria-label="Refresh page"
            >
              <ArrowPathIcon aria-hidden="true" />
            </button>
          </div>

          <div className="purchase-order-print-actions" role="group" aria-label="Print forecast">
            <span className="purchase-order-format-label">Format</span>
            <div className="purchase-order-print-formats" role="group" aria-label="Print format">
              {["a4", "thermal"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPrinterType(t)}
                  aria-pressed={printerType === t}
                  className={`purchase-order-print-option ${printerType === t ? "theme-btn-secondary" : "theme-btn-tertiary"}`}
                  title={t === "a4" ? "A4 paper" : "Thermal receipt (80mm)"}
                >
                  {t === "a4" ? "A4" : "Thermal"}
                </button>
              ))}
            </div>
            <button
              type="button"
              ref={printBtnRef}
              onClick={doPrint}
              className="purchase-order-action theme-btn-secondary"
              title={`Print ${printerType === "thermal" ? "Thermal (80mm)" : "A4"} (Alt+P)${hasActiveResultFilters ? " — prints the filtered view" : ""}`}
            >
              <PrinterIcon aria-hidden="true" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Integrated Filters */}
        <div className="purchase-order-filters relative px-5 pb-4">
          <div
            className="grid grid-cols-2 md:grid-cols-12 gap-3 rounded-xl p-3"
            style={{ backgroundColor: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.15)" }}
          >
            <div className="col-span-1 md:col-span-2 flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-white/80">From</label>
              <input
                type="date"
                aria-label="Forecast from date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full h-9 px-2 rounded-lg text-xs text-white placeholder-white/60 bg-white/15 border border-white/20 backdrop-blur-xs focus:outline-hidden focus:ring-2 focus:ring-white/40 scheme-dark"
              />
            </div>
            <div className="col-span-1 md:col-span-2 flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-white/80">To</label>
              <input
                type="date"
                aria-label="Forecast to date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full h-9 px-2 rounded-lg text-xs text-white placeholder-white/60 bg-white/15 border border-white/20 backdrop-blur-xs focus:outline-hidden focus:ring-2 focus:ring-white/40 scheme-dark"
              />
            </div>
            <div className="col-span-1 md:col-span-1 flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-white/80">Proj. Days</label>
              <input
                type="number"
                min={1}
                aria-label="Projected days"
                value={projectedDays}
                onChange={(e) => setProjectedDays(parseInt(e.target.value || 0, 10))}
                className="w-full h-9 px-2 rounded-lg text-xs text-white placeholder-white/60 bg-white/15 border border-white/20 backdrop-blur-xs focus:outline-hidden focus:ring-2 focus:ring-white/40 no-spinners"
              />
            </div>

            <div className="col-span-1 md:col-span-1 flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-white/80">Safety</label>
              <input
                type="number"
                min={0}
                aria-label="Safety packs"
                value={safetyPacks}
                onChange={(e) => setSafetyPacks(parseInt(e.target.value || 0, 10))}
                className="w-full h-9 px-2 rounded-lg text-xs text-white placeholder-white/60 bg-white/15 border border-white/20 backdrop-blur-xs focus:outline-hidden focus:ring-2 focus:ring-white/40 no-spinners"
              />
            </div>

            <div className="col-span-1 md:col-span-1 flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-white/80">MOQ</label>
              <input
                type="number"
                min={0}
                aria-label="Minimum order packs"
                value={moqPacks}
                onChange={(e) => setMoqPacks(parseInt(e.target.value || 0, 10))}
                className="w-full h-9 px-2 rounded-lg text-xs text-white placeholder-white/60 bg-white/15 border border-white/20 backdrop-blur-xs focus:outline-hidden focus:ring-2 focus:ring-white/40 no-spinners"
              />
            </div>

<div className="col-span-2 md:col-span-2 flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-white/80">Brand</label>
              <div className={`w-full min-h-9 rounded-lg border p-1 flex flex-wrap items-center gap-1 transition-all ${
                  brands.length
                    ? "border-white/60 bg-white/95 text-gray-800"
                    : "border-white/30 bg-white/15 text-white/80"
                }`}>
                {brands.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setBrandSearchOpen(true)}
                    className="flex-1 h-7 px-2 text-left text-xs flex items-center gap-2 min-w-0"
                    title="Click to search brands..."
                  >
                    <TagIcon className="w-4 h-4 shrink-0" />
                    <span className="truncate">Search brands...</span>
                  </button>
                ) : (
                  <>
                    {brands.map((b) => (
                      <span
                        key={b.value}
                        className="inline-flex items-center gap-1 h-7 pl-2 pr-1 rounded-md bg-violet-100 text-violet-800 text-[11px] font-medium max-w-full"
                        title={b.label}
                      >
                        <span className="truncate max-w-[96px]">{b.label}</span>
                        <button
                          type="button"
                          onClick={() => setBrands((prev) => prev.filter((x) => x.value !== b.value))}
                          className="p-0.5 rounded-sm hover:bg-violet-200 transition-colors shrink-0"
                          title={`Remove ${b.label}`}
                          aria-label={`Remove ${b.label}`}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => setBrandSearchOpen(true)}
                      className="h-7 min-w-7 px-1 inline-flex items-center justify-center rounded-md text-violet-700 hover:bg-violet-100 transition-colors shrink-0"
                      title="Add more brands"
                      aria-label="Add more brands"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBrands([])}
                      className="h-7 min-w-7 px-1 inline-flex items-center justify-center rounded-md text-gray-500 hover:bg-black/10 dark:hover:bg-white/10 transition-colors shrink-0"
                      title="Clear all brands"
                      aria-label="Clear all brands"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="col-span-2 md:col-span-3 flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-white/80">Supplier</label>
<div className={`w-full h-9 rounded-lg border flex items-center gap-1 overflow-hidden transition-all ${
                  supplier
                    ? "border-white/60 bg-white/95 text-gray-800"
                    : "border-white/30 bg-white/15 text-white/80"
                }`}>
                <button
                  type="button"
                  onClick={() => setSupplierSearchOpen(true)}
                  className="flex-1 h-full px-3 text-left text-xs flex items-center gap-2 min-w-0"
                  title={supplier?.label || "Click to search supplier..."}
                >
                  <BuildingStorefrontIcon className="w-4 h-4 shrink-0" />
                  {supplier ? (
                    <span className="truncate font-medium">{supplier.label}</span>
                  ) : (
                    <span className="truncate">Search supplier...</span>
                  )}
                </button>
                {supplier && (
                  <button
                    type="button"
                    onClick={() => setSupplier(null)}
                    className="h-full px-2 flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 transition-colors shrink-0"
                    title="Clear supplier"
                    aria-label="Clear supplier"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

{/* ===== Table ===== */}
      <div className="purchase-order-results products-panel overflow-hidden">
        {/* Table Header + Result Filters */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50/70 dark:bg-slate-800/70 border-b border-gray-200 dark:border-slate-700 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg shadow-xs" style={{ background: `linear-gradient(to bottom right, ${themeColors.primary}, ${themeColors.primaryHover})` }}>
              <CubeIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Forecast Items</span>
              <p className="text-[11px] text-gray-400">
                {hasActiveResultFilters
                  ? `${visibleRows.length} of ${rows.length} shown`
                  : `${rows.length} item(s)`}
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 min-w-0 text-xs font-medium text-gray-700 dark:text-gray-200">
            Arrange by
            <select
              value={arrangement}
              onChange={(e) => changeArrangement(e.target.value)}
              aria-label="Arrange forecast products"
              title="Applies to displayed items, printing and orders created from this forecast"
              className="h-8 max-w-full sm:max-w-72 px-2 rounded-lg text-xs font-medium bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 scheme-light dark:scheme-dark"
            >
              {[...new Set(purchaseOrderArrangements.map(option => option.group))].map(group => (
                <optgroup key={group} label={group}>
                  {purchaseOrderArrangements.filter(option => option.group === group).map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                </optgroup>
              ))}
            </select>
          </label>

          {/* Result filters (client-side over the fetched rows) */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Brand filter — only brands present in the current results */}
            <div className="flex items-center gap-1.5">
              <TagIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <select
                value={resultBrandId}
                onChange={(e) => setResultBrandId(e.target.value)}
                disabled={!rows.length}
                className="h-8 px-2 rounded-lg text-xs font-medium bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed scheme-light dark:scheme-dark"
                title="Filter results by brand (only brands in the current results)"
                aria-label="Filter results by brand"
              >
                <option value="all">All Brands ({rows.length})</option>
                {availableBrands.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.name} ({b.count})
                  </option>
                ))}
              </select>
            </div>

            {/* Current stock quantity filter */}
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              disabled={!rows.length}
              className="h-8 px-2 rounded-lg text-xs font-medium bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed scheme-light dark:scheme-dark"
              title="Filter by current stock quantity (units)"
              aria-label="Filter by current stock quantity"
            >
              <option value="all">All Stock</option>
              <option value="out">Out of Stock (= 0)</option>
              <option value="low">Low Stock (≤ threshold)</option>
              <option value="in">In Stock (&gt; 0)</option>
            </select>

            {stockFilter === "low" && (
              <input
                type="number"
                min={0}
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(parseInt(e.target.value || 0, 10))}
                disabled={!rows.length}
                className="h-8 w-16 px-2 rounded-lg text-xs text-right no-spinners bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
                title="Low stock threshold (units)"
                aria-label="Low stock threshold (units)"
              />
            )}

            {/* Order packs filter */}
            <select
              value={orderFilter}
              onChange={(e) => setOrderFilter(e.target.value)}
              disabled={!rows.length}
              className="h-8 px-2 rounded-lg text-xs font-medium bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed scheme-light dark:scheme-dark"
              title="Filter by order quantity (packs)"
              aria-label="Filter by order quantity"
            >
              <option value="all">All Items</option>
              <option value="to_order">To Order (&gt; 0 packs)</option>
              <option value="no_order">No Order (= 0 packs)</option>
            </select>

            {hasActiveResultFilters && (
              <button
                type="button"
                onClick={clearResultFilters}
                className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg text-xs font-semibold theme-btn-tertiary"
                title="Clear result filters"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Reset</span>
              </button>
            )}

            {hasActiveResultFilters && (
              <span className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {visibleRows.length} of {rows.length} shown
              </span>
            )}
          </div>
        </div>

        <div
          ref={tableWrapRef}
          className="max-h-[65vh] overflow-auto outline-hidden"
          tabIndex={0}
        >
          <table className="min-w-[880px] w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-slate-800 z-10 shadow-xs">
              <tr className="text-left">
                {["#", "Product", "Pack Size", "Units Sold", "Stock (U)", "Pack Price", "Suggested (P)", "Order Packs", "Order Units", "Order Amount"]
                  .map((h, i) => (
                    <th
                      key={h}
                      className={`
                        px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider
                        ${[2, 3, 4, 5, 6, 7, 8, 9].includes(i) ? "text-right" : ""}
                        ${h === "Stock (U)" ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" : ""}
                      `}
                    >
                      {h}
                    </th>
                  ))}
              </tr>
            </thead>

            <tbody>
              {visibleRows.map((r, idx) => {
                const isActive = idx === selectedIndex;
                return (
                  <tr
                    key={r._rowId}
                    ref={(el) => (rowRefs.current[r._rowId] = el)}
                    onClick={() => setSelectedIndex(idx)}
                    className={`
                      purchase-order-row ${isActive ? "is-active" : ""} transition-colors
                      ${isActive 
                        ? "bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500/30" 
                        : "odd:bg-white even:bg-gray-50 dark:odd:bg-slate-700/40 dark:even:bg-slate-800/40 hover:bg-blue-50 dark:hover:bg-slate-600/50"
                      }
                      border-b border-gray-100 dark:border-slate-600/30
                    `}
                  >
                    <td className="px-3 py-3 text-gray-600 dark:text-gray-300">{idx + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-start gap-1.5">
                        {Number(r.has_purchase_return) === 1 && (
                          <span
                            className="shrink-0 mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/40"
                            title={`Returned via Purchase Return${r.purchase_return_units ? ` — ${r.purchase_return_units} unit(s)` : ""}${r.last_purchase_return_date ? ` on ${r.last_purchase_return_date}` : ""}`}
                            aria-label="Returned via purchase return"
                          >
                            <ArrowUturnLeftIcon className="w-3 h-3 text-red-600 dark:text-red-400" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <div
                            className={`font-medium truncate max-w-[260px] ${
                              Number(r.has_purchase_return) === 1
                                ? "text-red-600 dark:text-red-400"
                                : "text-gray-800 dark:text-gray-200"
                            }`}
                            title={r.product_name}
                          >
                            {r.product_name}
                          </div>
                          {r.product_code && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">{r.product_code}</div>
                          )}
                          {Number(r.is_user_demand) === 1 && (
                            <div
                              className="text-[11px] font-medium text-violet-600 dark:text-violet-400 flex items-center gap-1 mt-0.5"
                              title={
                                r.user_demand_customers
                                  ? `User demand from: ${r.user_demand_customers}${r.user_demand_quantity ? ` (${r.user_demand_quantity} unit(s) requested)` : ""}`
                                  : "Originated from a user demand"
                              }
                            >
                              <HandRaisedIcon className="w-3 h-3 shrink-0" />
                              <span className="truncate">
                                User Demand{r.user_demand_customers ? `: ${r.user_demand_customers}` : ""}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-gray-600 dark:text-gray-300">{r.pack_size}</td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-gray-600 dark:text-gray-300">{r.units_sold}</td>
                    <td className="px-3 py-3 text-center tabular-nums whitespace-nowrap">
                      <span className="inline-flex items-center justify-center min-w-12 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                        {r.current_stock_units}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-gray-600 dark:text-gray-300">{fmt2(r.pack_price)}</td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-gray-600 dark:text-gray-300">{r.suggested_packs}</td>
                    <td className="px-3 py-3 text-right">
                      <GlassInput
                        type="number"
                        min={0}
                        value={r.order_packs}
                        onFocus={() => setSelectedIndex(idx)}
                        onChange={(e) => updateOrderPacks(r._rowId, e.target.value)}
                        ref={(el) => (inputRefs.current[r._rowId] = el)}
                        className="w-16 h-8 font-bold text-right text-xs no-spinners"
                        inputMode="numeric"
                      />
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-gray-600 dark:text-gray-300">{r.order_units}</td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap font-semibold text-gray-800 dark:text-gray-200">{fmt2(r.order_amount)}</td>
                  </tr>
                );
              })}

              {!rows.length && (
                <tr>
                  <td colSpan={10} className="px-3 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <CalculatorIcon className="w-8 h-8 text-gray-400" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No data. Choose filters and click Generate.</p>
                    </div>
                  </td>
                </tr>
              )}

              {rows.length > 0 && !visibleRows.length && (
                <tr>
                  <td colSpan={10} className="px-3 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <CalculatorIcon className="w-8 h-8 text-gray-400" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No items match the current result filters.</p>
                      <button
                        type="button"
                        onClick={clearResultFilters}
                        className="theme-btn-tertiary h-8 px-3 text-xs font-semibold"
                      >
                        Reset filters
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>

            {visibleRows.length > 0 && (
              <tfoot>
                <tr className="font-semibold bg-gray-50 dark:bg-slate-700/50 border-t border-gray-200 dark:border-slate-600">
                  <td className="px-3 py-3 text-gray-700 dark:text-gray-200" colSpan={7}>
                    Totals{hasActiveResultFilters ? " (filtered)" : ""}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">{totals.packs}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">{totals.units}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-800 dark:text-gray-100">{fmt2(totals.amount)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

{/* ===== Brand & Supplier Search Modals ===== */}
      <BrandSearch
        isOpen={brandSearchOpen}
        onClose={() => setBrandSearchOpen(false)}
        multiple
        selectedIds={brands.map((b) => b.value)}
        onToggle={(brandObj) => {
          if (!brandObj) return;
          setBrands((prev) =>
            prev.some((b) => b.value === brandObj.id)
              ? prev.filter((b) => b.value !== brandObj.id)
              : [...prev, { value: brandObj.id, label: brandObj.name }]
          );
        }}
      />
      <SupplierSearch
        isOpen={supplierSearchOpen}
        onClose={() => setSupplierSearchOpen(false)}
        onSelect={(supplierObj) => {
          setSupplier(supplierObj ? { value: supplierObj.id, label: supplierObj.name } : null);
        }}
      />

      {/* Print styles */}
      <style>{`
        @media print {
          .print\\:p-0 { padding: 0 !important; }
          .rs__control, .rs__menu, input, select, button, [role="button"] { display: none !important; }
          table { font-size: 10px; }
          thead { position: sticky; top: 0; }
        }
        .no-spinners::-webkit-outer-spin-button,
        .no-spinners::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .no-spinners[type=number] { -moz-appearance: textfield; }
      `}</style>
    </div>
  );
}

