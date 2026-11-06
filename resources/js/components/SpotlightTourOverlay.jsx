// resources/js/components/SpotlightTourOverlay.jsx
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useId,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import {
  XMarkIcon,
  CheckCircleIcon,
  SparklesIcon,
  ArrowTopRightOnSquareIcon,
  BoltIcon,
  CursorArrowRaysIcon,
} from "@heroicons/react/24/outline";
import { GuideBotAvatar } from "./GuideBotTrigger.jsx";

/**
 * Scroll completion helper following `scroll-completion-effects`:
 * Awaits the native Promise returned by `scrollIntoView()` when supported,
 * and falls back to `scrollend` + idle timer when `scrollIntoView()` returns `undefined`.
 */
export function scrollIntoViewAsync(
  element,
  options = { behavior: "smooth", block: "center", inline: "nearest" },
  scroller = typeof window !== "undefined" ? window : null
) {
  if (!element || typeof element.scrollIntoView !== "function") {
    return Promise.resolve();
  }

  const result = element.scrollIntoView(options);

  // Feature detect: in supporting browsers, scrollIntoView() returns a Promise
  if (result instanceof Promise) {
    return result;
  }

  if (!scroller || typeof scroller.addEventListener !== "function") {
    return Promise.resolve();
  }

  // Fallback for browsers where scrollIntoView() returns undefined
  return new Promise((resolve) => {
    let timeoutId;

    const finish = () => {
      window.clearTimeout(timeoutId);
      scroller.removeEventListener("scrollend", finish);
      scroller.removeEventListener("scroll", onScroll);
      resolve();
    };

    const onScroll = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(finish, 100);
    };

    scroller.addEventListener("scrollend", finish, { once: true });
    scroller.addEventListener("scroll", onScroll, { passive: true });
    timeoutId = window.setTimeout(finish, 120);
  });
}

/**
 * Checks whether a DOM element is visible and inside the main workspace
 * (strictly excludes sidebar, topbar, floating dock, and guidebot drawer/overlay).
 */
export function isValidWorkspaceElement(el) {
  if (!el || typeof el.getBoundingClientRect !== "function") return false;
  if (!el.isConnected) return false;
  if (
    el.closest(".guide-bot-drawer") ||
    el.closest(".spotlight-tour-root") ||
    el.closest(".workspace-sidebar") ||
    el.closest(".workspace-topbar") ||
    el.closest(".workspace-dock-trigger") ||
    el.closest(".workspace-dock-floating") ||
    el.closest("aside") ||
    el.closest("[data-roaming-cube]")
  ) {
    return false;
  }
  const style = window.getComputedStyle(el);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number(style.opacity) === 0
  ) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width >= 16 && rect.height >= 14;
}

/**
 * Finds the active main workspace container on screen.
 */
function getActiveWorkspaceContainer() {
  if (typeof document === "undefined") return null;

  // If a business modal (like CashDrawerModal or AccountsModal) is open, prefer it
  const openModal = Array.from(
    document.querySelectorAll(
      "[data-modal='cash-drawer'], [data-modal='accounts'], [role='dialog']:not(.guide-bot-drawer):not(.spotlight-tour-popover)"
    )
  ).find((m) => isValidWorkspaceElement(m));

  if (openModal) return openModal;

  return (
    document.querySelector(".workspace-page") ||
    document.querySelector("main.workspace-main") ||
    document.querySelector("main")
  );
}

/**
 * Extracts readable text & metadata from a DOM element for semantic target matching.
 */
function getElementSignature(el) {
  if (!el) return "";
  const parts = [
    el.innerText || el.textContent || "",
    el.getAttribute?.("placeholder") || "",
    el.getAttribute?.("aria-label") || "",
    el.getAttribute?.("title") || "",
    el.getAttribute?.("name") || "",
    el.getAttribute?.("id") || "",
    el.getAttribute?.("href") || "",
  ];
  const label =
    el.closest?.("label") ||
    (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
  if (label) {
    parts.push(label.innerText || label.textContent || "");
  }
  const parentField = el.closest?.("div, td, th, section, fieldset");
  if (parentField) {
    const fieldLabel = parentField.querySelector?.("label, h1, h2, h3, h4, th");
    if (fieldLabel) {
      parts.push(fieldLabel.innerText || fieldLabel.textContent || "");
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Smart Semantic DOM Target Resolver:
 * Finds the exact interactive control or section on the current screen that matches a tour step.
 */
export function findBestTourTargetElement(step, explicitSelector = null) {
  if (typeof document === "undefined" || !step) return null;

  // 1. Direct DOM element reference if still mounted and visible
  if (step.element && isValidWorkspaceElement(step.element)) {
    return step.element;
  }

  // 2. Step-specific custom resolver function if provided
  if (typeof step.resolveTarget === "function") {
    try {
      const resolved = step.resolveTarget();
      if (resolved && isValidWorkspaceElement(resolved)) {
        return resolved;
      }
    } catch {
      /* ignore resolver error */
    }
  }

  const pageContainers = Array.from(
    document.querySelectorAll(
      "[data-modal='cash-drawer'], [data-modal='accounts'], [role='dialog']:not(.guide-bot-drawer):not(.spotlight-tour-popover), .workspace-page, main"
    )
  ).filter(
    (c) =>
      !c.closest(".guide-bot-drawer") &&
      !c.closest(".spotlight-tour-root") &&
      !c.closest(".workspace-topbar") &&
      !c.closest(".workspace-sidebar")
  );

  if (pageContainers.length === 0) return null;

  const rawSelector =
    explicitSelector ||
    step.exactSelector ||
    step.target ||
    step.targetSelector ||
    "";

  // 3. If step has an exact structural selector (e.g. ".dashboard-overview", ".products-heading"), match it directly first
  if (step.exactSelector) {
    for (const container of pageContainers) {
      try {
        const directMatch = container.querySelector(step.exactSelector);
        if (directMatch && isValidWorkspaceElement(directMatch)) {
          return directMatch;
        }
      } catch {
        /* ignore invalid selector */
      }
    }
  }

  const titleText = `${step.title?.en || ""} ${
    step.observedInstruction?.en || ""
  } ${step.instruction?.en || ""}`.toLowerCase();

  // Extract high-signal domain keywords from the step description
  const keywordWeights = [];
  const keywordPatterns = [
    { rx: /\bsupplier\b/i, tokens: ["supplier", "distributor", "vendor"], weight: 45 },
    { rx: /\bcustomer\b/i, tokens: ["customer", "walk-in", "client", "party"], weight: 45 },
    { rx: /\b(search|scan|barcode|f2)\b/i, tokens: ["search", "scan", "barcode", "filter", "find", "f2"], weight: 50 },
    { rx: /\b(add product|create product|\+ add)\b/i, tokens: ["add product", "create", "+ add", "new"], weight: 55 },
    { rx: /\b(add supplier|\+ add supplier)\b/i, tokens: ["add supplier", "new supplier", "+ add"], weight: 55 },
    { rx: /\b(add expense|\+ add expense)\b/i, tokens: ["add expense", "new expense", "+ add"], weight: 55 },
    { rx: /\b(record payment|payment)\b/i, tokens: ["record payment", "payment", "receive", "pay"], weight: 55 },
    { rx: /\b(transfer)\b/i, tokens: ["transfer", "move", "deposit"], weight: 55 },
    { rx: /\b(open cash drawer|open shift)\b/i, tokens: ["open cash", "open shift", "float", "expected"], weight: 55 },
    { rx: /\b(close|reconcile|z-report)\b/i, tokens: ["close", "reconcile", "z-report"], weight: 55 },
    { rx: /\b(low-stock|smart suggestion|suggest)\b/i, tokens: ["low-stock", "low stock", "suggest", "auto"], weight: 55 },
    { rx: /\b(batch|expiry|bonus|qty|quantity|pack size)\b/i, tokens: ["batch", "expiry", "bonus", "qty", "quantity", "pack"], weight: 45 },
    { rx: /\b(paid amount|received amount|cash received)\b/i, tokens: ["paid", "received", "tendered", "cash", "amount"], weight: 50 },
    { rx: /\b(save|print|submit|ctrl\+s|ctrl\+p)\b/i, tokens: ["save", "print", "submit", "post", "complete"], weight: 55 },
    { rx: /\b(inflow|outflow|category card|breakdown)\b/i, tokens: ["inflow", "outflow", "sales", "expense", "summary"], weight: 45 },
  ];

  keywordPatterns.forEach((kp) => {
    if (kp.rx.test(titleText)) {
      keywordWeights.push(kp);
    }
  });

  const fallbackSelector =
    rawSelector || "button, a, input, select, textarea, table, .g-card";

  let candidates = [];
  for (const container of pageContainers) {
    try {
      const matched = Array.from(
        container.querySelectorAll(fallbackSelector)
      ).filter(isValidWorkspaceElement);
      candidates.push(...matched);
    } catch {
      /* ignore invalid selector */
    }
  }

  // Also gather semantic interactive elements in case fallbackSelector was overly narrow
  for (const container of pageContainers) {
    const extras = Array.from(
      container.querySelectorAll(
        "button, a[href], input:not([type='hidden']), select, textarea, table, [role='tablist'], .g-card"
      )
    ).filter(isValidWorkspaceElement);
    extras.forEach((el) => {
      if (!candidates.includes(el)) candidates.push(el);
    });
  }

  if (candidates.length === 0) {
    return pageContainers[0] || null;
  }

  let bestEl = candidates[0];
  let bestScore = -1;

  candidates.forEach((el, index) => {
    let score = 0;
    const sig = getElementSignature(el);
    const tag = el.tagName?.toLowerCase() || "";
    const rect = el.getBoundingClientRect();

    // Bonus if matched original step selector directly
    try {
      if (rawSelector && el.matches(rawSelector)) {
        score += 25;
      }
    } catch {
      /* ignore */
    }

    // Score keyword matches
    keywordWeights.forEach((kp) => {
      const hit = kp.tokens.some((tok) => sig.includes(tok));
      if (hit) {
        score += kp.weight;
      }
    });

    // Match individual words from step title
    const titleWords = (step.title?.en || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(
        (w) =>
          w.length >= 4 &&
          ![
            "step",
            "click",
            "enter",
            "select",
            "check",
            "your",
            "with",
            "from",
            "live",
            "main",
          ].includes(w)
      );

    titleWords.forEach((w) => {
      if (sig.includes(w)) {
        score += 18;
      }
    });

    // Prefer reasonably sized controls over giant full-page wrappers unless it's a table step
    if (rect.height > window.innerHeight * 0.85 && tag !== "table") {
      score -= 25;
    }

    // Slight tie-breaker for earlier appearance in DOM
    score -= index * 0.05;

    if (score > bestScore) {
      bestScore = score;
      bestEl = el;
    }
  });

  // If the chosen element is a tiny input inside a react-select or input group, highlight its visual wrapper
  const fieldGroup = bestEl?.closest?.(
    ".react-select-container, .product-search-trigger, .batch-search-trigger, .login-input-wrap"
  );
  if (fieldGroup && isValidWorkspaceElement(fieldGroup)) {
    return fieldGroup;
  }

  return bestEl;
}

/**
 * Determines a friendly UI control badge for the currently spotlighted DOM element.
 */
function describeControlType(el) {
  if (!el) {
    return {
      en: "Screen Workspace",
      ur: "اسکرین کا حصہ",
      canTriggerClick: false,
      isInput: false,
    };
  }
  const tag = el.tagName?.toLowerCase() || "";
  const type = (el.getAttribute?.("type") || "").toLowerCase();

  if (tag === "input" || tag === "textarea") {
    if (
      type === "search" ||
      (el.getAttribute?.("placeholder") || "").toLowerCase().includes("search")
    ) {
      return {
        en: "Live Search & Scanner Input",
        ur: "لائیو سرچ اور اسکینر باکس",
        canTriggerClick: false,
        isInput: true,
      };
    }
    return {
      en: "Interactive Input Field",
      ur: "انٹرایکٹو ان پٹ فیلڈ",
      canTriggerClick: false,
      isInput: true,
    };
  }

  if (tag === "select" || el.classList?.contains("react-select-container")) {
    return {
      en: "Interactive Dropdown Selector",
      ur: "ڈراپ ڈاؤن سلیکٹر",
      canTriggerClick: false,
      isInput: true,
    };
  }

  if (
    tag === "button" ||
    tag === "a" ||
    el.getAttribute?.("role") === "button" ||
    el.getAttribute?.("role") === "tab"
  ) {
    return {
      en: "Interactive Action Button",
      ur: "انٹرایکٹو ایکشن بٹن",
      canTriggerClick: true,
      isInput: false,
    };
  }

  if (
    tag === "table" ||
    tag === "tbody" ||
    tag === "thead" ||
    el.querySelector?.("table")
  ) {
    return {
      en: "Interactive Data Table",
      ur: "انٹرایکٹو ڈیٹا ٹیبل",
      canTriggerClick: false,
      isInput: false,
    };
  }

  if (el.querySelector?.("input:not([type='hidden']), select, textarea")) {
    return {
      en: "Interactive Filter & Input Panel",
      ur: "فلٹر اور ان پٹ سیکشن",
      canTriggerClick: false,
      isInput: true,
    };
  }

  return {
    en: "Highlighted Screen Section",
    ur: "نمایاں کردہ اسکرین سیکشن",
    canTriggerClick: false,
    isInput: false,
  };
}

/**
 * Dedicated 6-Step Accurate Spotlight Tour for `/dashboard` (`Dashboard.jsx`).
 * Every step targets the exact Dashboard DOM section and explains its true metrics and controls.
 */
function buildDashboardSpotlightSteps(container) {
  const screenKey = "/dashboard";
  const screenLabel = {
    en: "Business Intelligence Dashboard",
    ur: "بزنس ڈیش بورڈ",
  };

  // Step 1: Top Business Overview Header (`.dashboard-overview`)
  const overviewEl = container?.querySelector(".dashboard-overview") || null;

  // Step 2: Date Range Filter & Quick Period Presets (`.dashboard-filter-panel`)
  const filterPanelEl =
    container?.querySelector(".dashboard-filter-panel") || null;

  // Step 3: 4 Financial KPI Money Cards Grid (`.dashboard-kpi` parent grid)
  const firstKpiCard = container?.querySelector(".dashboard-kpi") || null;
  const kpiGridEl = firstKpiCard?.closest(".grid") || firstKpiCard || null;

  // Step 4: 12 Quick Module Counters & Operational Alerts Grid (`.dashboard-module` parent grid)
  const firstModuleTile = container?.querySelector(".dashboard-module") || null;
  const moduleGridEl =
    firstModuleTile?.closest(".grid") || firstModuleTile || null;

  // Step 5: Revenue Overview & Analytics Charts (`SectionCard` containing `.recharts-responsive-container`)
  const chartContainer =
    container
      ?.querySelector(".recharts-responsive-container")
      ?.closest(".dashboard-panel") || null;

  // Step 6: Near-Expiry Products & Top Selling Products Table at Bottom
  const allPanels = container
    ? Array.from(container.querySelectorAll(".dashboard-panel")).filter(
        isValidWorkspaceElement
      )
    : [];
  const nearExpiryPanel =
    allPanels.find((p) =>
      (p.innerText || "").toLowerCase().includes("near expiry")
    ) ||
    allPanels.find((p) =>
      (p.innerText || "").toLowerCase().includes("top selling")
    ) ||
    allPanels[allPanels.length - 1] ||
    null;

  return [
    {
      step: 1,
      screen: screenKey,
      screenLabel,
      exactSelector: ".dashboard-overview",
      element: overviewEl,
      title: {
        en: "Business Intelligence Command Bar & Live Refresh",
        ur: "بزنس ڈیش بورڈ ہیڈر اور لائیو ریفریش (Alt+R)",
      },
      instruction: {
        en: "This top command bar shows your active date window along with live headline pills for Net Sales, Daily Average, and Return Rate. Click 'Refresh' (or press Alt+R) anytime to reload live figures.",
        ur: "یہ اوپری بار آپ کی منتخب کردہ تاریخ، خالص سیلز (Net Sales)، روزانہ اوسط اور واپسی کی شرح (Return Rate) دکھاتی ہے۔ تازہ ترین اعداد و شمار کے لیے 'Refresh' بٹن (یا Alt+R) دبائیں۔",
      },
      observedInstruction: {
        en: "This top command bar shows your active date window along with live headline pills for Net Sales, Daily Average, and Return Rate. Click 'Refresh' (or press Alt+R) anytime to reload live figures.",
        ur: "یہ اوپری بار آپ کی منتخب کردہ تاریخ، خالص سیلز (Net Sales)، روزانہ اوسط اور واپسی کی شرح (Return Rate) دکھاتی ہے۔ تازہ ترین اعداد و شمار کے لیے 'Refresh' بٹن (یا Alt+R) دبائیں۔",
      },
      checkpoint: {
        en: "Read-only analytical screen — refreshing or changing filters never alters any accounting or stock records.",
        ur: "یہ صرف معلوماتی اسکرین ہے — یہاں فلٹر بدلنے سے کسی کھاتے یا اسٹاک میں کوئی تبدیلی نہیں ہوتی۔",
      },
    },
    {
      step: 2,
      screen: screenKey,
      screenLabel,
      exactSelector: ".dashboard-filter-panel",
      element: filterPanelEl,
      title: {
        en: "Date Range Filter & Quick Period Presets",
        ur: "تاریخ کا فلٹر اور فوری مدت کے بٹن (Today / This Month)",
      },
      instruction: {
        en: "Select custom From / To dates or click a 1-tap preset (Today, This Month, 7 Days, 30 Days, This Year) and press 'Apply'. Every KPI money card, chart, and product ranking below recalculates live for that window.",
        ur: "اپنی مرضی کی تاریخ (From / To) منتخب کریں یا فوری بٹنز (Today, This Month, 7 Days, 30 Days, This Year) پر کلک کر کے 'Apply' دبائیں۔ نیچے تمام مالیاتی کارڈز اور گراف اس تاریخ کے مطابق اپڈیٹ ہو جائیں گے۔",
      },
      observedInstruction: {
        en: "Select custom From / To dates or click a 1-tap preset (Today, This Month, 7 Days, 30 Days, This Year) and press 'Apply'. Every KPI money card, chart, and product ranking below recalculates live for that window.",
        ur: "اپنی مرضی کی تاریخ (From / To) منتخب کریں یا فوری بٹنز (Today, This Month, 7 Days, 30 Days, This Year) پر کلک کر کے 'Apply' دبائیں۔ نیچے تمام مالیاتی کارڈز اور گراف اس تاریخ کے مطابق اپڈیٹ ہو جائیں گے۔",
      },
      checkpoint: {
        en: "Try clicking 'Today' or 'This Month' right now inside the spotlight to see all metrics update!",
        ur: "آپ ابھی 'Today' یا 'This Month' بٹن پر کلک کر کے لائیو نتائج چیک کر سکتے ہیں!",
      },
    },
    {
      step: 3,
      screen: screenKey,
      screenLabel,
      exactSelector: ".dashboard-kpi",
      element: kpiGridEl,
      resolveTarget: () => {
        const c = getActiveWorkspaceContainer();
        const kpi = c?.querySelector(".dashboard-kpi");
        return kpi?.closest(".grid") || kpi;
      },
      title: {
        en: "Financial KPI Cards (Sales, Purchases, Net Sales & Returns)",
        ur: "مالیاتی کارڈز (سیلز، خریداری، خالص سیلز اور واپسی)",
      },
      instruction: {
        en: "These 4 financial cards display your period totals for Sales, Purchases, Net Sales (Gross Sales minus Sale Returns), and Sale Returns. Each card also shows the % trend vs. the previous period, daily average, and a Debit (Cash) vs. Credit (Udhar) breakdown bar.",
        ur: "یہ 4 کارڈز منتخب مدت کی کل سیلز، خریداری، خالص سیلز (Net Sales) اور سیل ریٹرن دکھاتے ہیں۔ ہر کارڈ میں پچھلی مدت سے موازنہ (%)، روزانہ اوسط، اور نقد (Debit/Cash) بمقابلہ ادھار (Credit/Udhar) کی تفصیل موجود ہے۔",
      },
      observedInstruction: {
        en: "These 4 financial cards display your period totals for Sales, Purchases, Net Sales (Gross Sales minus Sale Returns), and Sale Returns. Each card also shows the % trend vs. the previous period, daily average, and a Debit (Cash) vs. Credit (Udhar) breakdown bar.",
        ur: "یہ 4 کارڈز منتخب مدت کی کل سیلز، خریداری، خالص سیلز (Net Sales) اور سیل ریٹرن دکھاتے ہیں۔ ہر کارڈ میں پچھلی مدت سے موازنہ (%)، روزانہ اوسط، اور نقد (Debit/Cash) بمقابلہ ادھار (Credit/Udhar) کی تفصیل موجود ہے۔",
      },
      checkpoint: {
        en: "Click any KPI card to jump directly to Sale Invoices, Purchase Invoices, Sale Returns, or Reports.",
        ur: "کسی بھی کارڈ پر کلک کر کے اس کا تفصیلی صفحہ یا رپورٹ کھولی جا سکتی ہے۔",
      },
    },
    {
      step: 4,
      screen: screenKey,
      screenLabel,
      exactSelector: ".dashboard-module",
      element: moduleGridEl,
      resolveTarget: () => {
        const c = getActiveWorkspaceContainer();
        const mod = c?.querySelector(".dashboard-module");
        return mod?.closest(".grid") || mod;
      },
      title: {
        en: "Quick Module Counters & Operational Alerts",
        ur: "ماڈیول کاؤنٹرز اور لو اسٹاک / ایکسپائری الرٹس",
      },
      instruction: {
        en: "Monitor live store counters in one place: Active Products, Customers, Suppliers, Low Stock items below reorder pack threshold, Near-Expiry batches, Pending Customer Demands, and total Stock on Hand valuation.",
        ur: "یہاں دکان کے تمام اہم کاؤنٹرز ایک نظر میں دیکھیں: کل پروڈکٹس، کسٹمرز، سپلائرز، کم اسٹاک (Low Stock)، قریب ایکسپائر ہونے والے بیچز، کسٹمر ڈیمانڈز اور موجودہ اسٹاک کی کل مالیت۔",
      },
      observedInstruction: {
        en: "Monitor live store counters in one place: Active Products, Customers, Suppliers, Low Stock items below reorder pack threshold, Near-Expiry batches, Pending Customer Demands, and total Stock on Hand valuation.",
        ur: "یہاں دکان کے تمام اہم کاؤنٹرز ایک نظر میں دیکھیں: کل پروڈکٹس، کسٹمرز، سپلائرز، کم اسٹاک (Low Stock)، قریب ایکسپائر ہونے والے بیچز، کسٹمر ڈیمانڈز اور موجودہ اسٹاک کی کل مالیت۔",
      },
      checkpoint: {
        en: "Click 'Low Stock' or 'Near Expiry' tiles anytime to inspect items needing urgent reorder or supplier return.",
        ur: "کم اسٹاک یا قریب ایکسپائری والے آئٹمز دیکھنے کے لیے متعلقہ کارڈ پر کلک کریں۔",
      },
    },
    {
      step: 5,
      screen: screenKey,
      screenLabel,
      element: chartContainer,
      resolveTarget: () => {
        const c = getActiveWorkspaceContainer();
        return (
          c
            ?.querySelector(".recharts-responsive-container")
            ?.closest(".dashboard-panel") || null
        );
      },
      title: {
        en: "Interactive Revenue, Sales vs. Purchases & Returns Charts",
        ur: "سیلز، خریداری اور واپسی کے انٹرایکٹو گراف",
      },
      instruction: {
        en: "Visualize daily performance with the Revenue Overview area chart, Sales vs. Purchases bar comparison, Returns Trend chart, and Top Brands ranking. Hover over any date point to inspect exact rupee figures.",
        ur: "یہاں روزانہ کی سیلز، خریداری بمقابلہ سیلز، ریٹرن ٹرینڈ اور ٹاپ برانڈز کے گراف موجود ہیں۔ گراف کے کسی بھی نقطے پر ماؤس لے جا کر اس دن کی مکمل رقم دیکھیں۔",
      },
      observedInstruction: {
        en: "Visualize daily performance with the Revenue Overview area chart, Sales vs. Purchases bar comparison, Returns Trend chart, and Top Brands ranking. Hover over any date point to inspect exact rupee figures.",
        ur: "یہاں روزانہ کی سیلز، خریداری بمقابلہ سیلز، ریٹرن ٹرینڈ اور ٹاپ برانڈز کے گراف موجود ہیں۔ گراف کے کسی بھی نقطے پر ماؤس لے جا کر اس دن کی مکمل رقم دیکھیں۔",
      },
    },
    {
      step: 6,
      screen: screenKey,
      screenLabel,
      element: nearExpiryPanel,
      resolveTarget: () => {
        const c = getActiveWorkspaceContainer();
        if (!c) return null;
        const panels = Array.from(
          c.querySelectorAll(".dashboard-panel")
        ).filter(isValidWorkspaceElement);
        return (
          panels.find((p) =>
            (p.innerText || "").toLowerCase().includes("near expiry")
          ) ||
          panels[panels.length - 1] ||
          null
        );
      },
      title: {
        en: "Near-Expiry Batch Radar & Top Selling Products",
        ur: "نیئر ایکسپائری بیچ ٹیبل اور سب سے زیادہ بکنے والی اشیاء",
      },
      instruction: {
        en: "At the bottom of the dashboard, review Top Selling Products and the Near-Expiry Products table. Use the 1 mo / 3 mo / 6 mo / 1 yr / 1.5 yr window buttons and Supplier or Brand dropdowns to filter expiring stock batches.",
        ur: "ڈیش بورڈ کے نچلے حصے میں سب سے زیادہ بکنے والی مصنوعات اور قریب ایکسپائر ہونے والے بیچز (Near Expiry Products) کا ٹیبل موجود ہے۔ 1 ماہ، 3 ماہ، 6 ماہ یا 1 سال کے بٹن اور سپلائر یا برانڈ فلٹر سے ایکسپائری اسٹاک چیک کریں۔",
      },
      observedInstruction: {
        en: "At the bottom of the dashboard, review Top Selling Products and the Near-Expiry Products table. Use the 1 mo / 3 mo / 6 mo / 1 yr / 1.5 yr window buttons and Supplier or Brand dropdowns to filter expiring stock batches.",
        ur: "ڈیش بورڈ کے نچلے حصے میں سب سے زیادہ بکنے والی مصنوعات اور قریب ایکسپائر ہونے والے بیچز (Near Expiry Products) کا ٹیبل موجود ہے۔ 1 ماہ، 3 ماہ، 6 ماہ یا 1 سال کے بٹن اور سپلائر یا برانڈ فلٹر سے ایکسپائری اسٹاک چیک کریں۔",
      },
      checkpoint: {
        en: "Color-coded Days Left pills highlight expired or critical (<30d) batches so you can return or clear them first.",
        ur: "رنگین Days Left بیجز کی مدد سے کم مدت والے بیچز کو بروقت فروخت یا سپلائر کو واپس کیا جا سکتا ہے۔",
      },
    },
  ].filter((st) => st.element || st.exactSelector || st.resolveTarget);
}

/**
 * 1. Dedicated 5-Step Walkthrough for Retail Sale Invoice Form (`SaleInvoiceRetailForm.jsx`)
 * Routes: `/sale-invoices/create/retail`, `/sale-invoices/:id/edit` (when not wholesale)
 */
function buildRetailSaleInvoiceFormSteps(container, currentPath) {
  const isEdit = currentPath.includes("/edit");
  const screenLabel = {
    en: isEdit ? "Edit Retail Sale Invoice" : "Retail Sale Invoice Form",
    ur: isEdit ? "ریٹیل سیل انوائس میں ترمیم" : "ریٹیل سیل انوائس فارم",
  };

  return [
    {
      step: 1,
      screen: currentPath,
      screenLabel,
      exactSelector: ".sale-entry-banner",
      element: container?.querySelector(".sale-entry-banner") || null,
      title: {
        en: "Top Command Bar: Debit/Cash vs. Credit/Udhar, Auto-Save Drafts & POS",
        ur: "ٹاپ کمانڈ بار: نقد (Debit) بمقابلہ ادھار (Credit)، ڈرافٹس اور POS",
      },
      instruction: {
        en: "Start here: toggle between Debit (Cash — full payment auto-received) and Credit (Udhar — posts to Customer Ledger, shortcut Alt+T). Your invoice auto-saves as you type—press Alt+H anytime to hold/recall drafts, switch to 'Barcode POS', or press Alt+S to Create/Save.",
        ur: "یہاں سے بل کی قسم منتخب کریں: نقد فروخت کے لیے Debit یا کھاتے میں ادھار لکھنے کے لیے Credit (شارٹ کٹ Alt+T)۔ بل ٹائپ کرتے وقت خودکار ڈرافٹ محفوظ ہوتا رہتا ہے (ہولڈ بل دیکھنے کے لیے Alt+H اور بل محفوظ کرنے کے لیے Alt+S دبائیں)۔",
      },
      observedInstruction: {
        en: "Start here: toggle between Debit (Cash — full payment auto-received) and Credit (Udhar — posts to Customer Ledger, shortcut Alt+T). Your invoice auto-saves as you type—press Alt+H anytime to hold/recall drafts, switch to 'Barcode POS', or press Alt+S to Create/Save.",
        ur: "یہاں سے بل کی قسم منتخب کریں: نقد فروخت کے لیے Debit یا کھاتے میں ادھار لکھنے کے لیے Credit (شارٹ کٹ Alt+T)۔ بل ٹائپ کرتے وقت خودکار ڈرافٹ محفوظ ہوتا رہتا ہے (ہولڈ بل دیکھنے کے لیے Alt+H اور بل محفوظ کرنے کے لیے Alt+S دبائیں)۔",
      },
      checkpoint: {
        en: "Shortcut Tip: Alt+T toggles Debit/Credit mode; Alt+H opens Held Drafts; Alt+S saves & prints.",
        ur: "شارٹ کٹ: Alt+T نقد/ادھار بدلتا ہے، Alt+H ہولڈ بل کھولتا ہے، اور Alt+S بل محفوظ کرتا ہے۔",
      },
    },
    {
      step: 2,
      screen: currentPath,
      screenLabel,
      exactSelector: ".sale-entry-details",
      element: container?.querySelector(".sale-entry-details") || null,
      title: {
        en: "Customer Selection, Clinical Fields (Doctor/Patient) & Credit Limit Strip",
        ur: "گاہک کا انتخاب، ڈاکٹر/مریض کا نام اور کریڈٹ لمٹ اسٹیٹس",
      },
      instruction: {
        en: "Verify the Invoice Date and click 'Customer *' (defaults to Walk-in Customer for cash sales; select a named customer for Credit/Udhar). You can also record Doctor Name, Patient Name, and Remarks. When a Credit customer is chosen, a live Credit Limit, Ledger Balance, Available Credit, and Due Date strip appears here automatically.",
        ur: "بل کی تاریخ چیک کریں اور 'Customer *' منتخب کریں (نقد بل کے لیے Walk-in Customer، جبکہ ادھار بل کے لیے رجسٹرڈ گاہک منتخب کرنا لازمی ہے)۔ یہاں ڈاکٹر کا نام، مریض کا نام اور ریمارکس بھی لکھ سکتے ہیں۔ ادھار گاہک منتخب کرنے پر اس کی کریڈٹ لمٹ، پچھلا بقایا اور مقررہ تاریخ (Due Date) خودکار نظر آتی ہے۔",
      },
      observedInstruction: {
        en: "Verify the Invoice Date and click 'Customer *' (defaults to Walk-in Customer for cash sales; select a named customer for Credit/Udhar). You can also record Doctor Name, Patient Name, and Remarks. When a Credit customer is chosen, a live Credit Limit, Ledger Balance, Available Credit, and Due Date strip appears here automatically.",
        ur: "بل کی تاریخ چیک کریں اور 'Customer *' منتخب کریں (نقد بل کے لیے Walk-in Customer، جبکہ ادھار بل کے لیے رجسٹرڈ گاہک منتخب کرنا لازمی ہے)۔ یہاں ڈاکٹر کا نام، مریض کا نام اور ریمارکس بھی لکھ سکتے ہیں۔ ادھار گاہک منتخب کرنے پر اس کی کریڈٹ لمٹ، پچھلا بقایا اور مقررہ تاریخ (Due Date) خودکار نظر آتی ہے۔",
      },
      checkpoint: {
        en: "Credit Guard: Walk-in Customer cannot be billed on Credit—select a registered customer to track Udhar.",
        ur: "اصول: Walk-in گاہک کو ادھار بل نہیں بن سکتا—ادھار کے لیے رجسٹرڈ گاہک منتخب کریں۔",
      },
    },
    {
      step: 3,
      screen: currentPath,
      screenLabel,
      exactSelector: ".sale-entry-items",
      element: container?.querySelector(".sale-entry-items") || null,
      title: {
        en: "12-Column Unit-Based Retail Line-Items Table & FEFO Batch Selection",
        ur: "12 کالمز کا یونٹ بیسڈ آئٹمز ٹیبل اور خودکار FEFO بیچ سلیکشن",
      },
      instruction: {
        en: "Retail billing is 100% Unit-Based (sell single loose tablets, strips, or full packs in units). Search any item in 'Product *'—the system auto-picks the earliest expiring batch (FEFO) and fills Pack Size (PSize), Expiry (MM/YYYY), Available Units (Avail), and Unit MRP (Price). Enter 'Qty *' in units and optional 'Disc %' (capped at the product's maximum allowed discount).",
        ur: "ریٹیل بلنگ مکمل طور پر یونٹ (کھلی گولی/یونٹ) پر کام کرتی ہے۔ 'Product *' میں دوائی سرچ کریں—سسٹم خودکار طور پر سب سے پہلے ایکسپائر ہونے والا بیچ (FEFO) منتخب کر کے پیک سائز، ایکسپائری، موجودہ یونٹس (Avail) اور فی یونٹ قیمت بھر دیتا ہے۔ 'Qty *' میں یونٹس کی تعداد اور 'Disc %' درج کریں۔",
      },
      observedInstruction: {
        en: "Retail billing is 100% Unit-Based (sell single loose tablets, strips, or full packs in units). Search any item in 'Product *'—the system auto-picks the earliest expiring batch (FEFO) and fills Pack Size (PSize), Expiry (MM/YYYY), Available Units (Avail), and Unit MRP (Price). Enter 'Qty *' in units and optional 'Disc %' (capped at the product's maximum allowed discount).",
        ur: "ریٹیل بلنگ مکمل طور پر یونٹ (کھلی گولی/یونٹ) پر کام کرتی ہے۔ 'Product *' میں دوائی سرچ کریں—سسٹم خودکار طور پر سب سے پہلے ایکسپائر ہونے والا بیچ (FEFO) منتخب کر کے پیک سائز، ایکسپائری، موجودہ یونٹس (Avail) اور فی یونٹ قیمت بھر دیتا ہے۔ 'Qty *' میں یونٹس کی تعداد اور 'Disc %' درج کریں۔",
      },
      checkpoint: {
        en: "Stock Guard: If 'Qty *' exceeds 'Avail' units in the selected batch, the field highlights red to prevent negative stock.",
        ur: "اسٹاک گارڈ: اگر درج کردہ مقدار (Qty) موجودہ اسٹاک (Avail) سے زیادہ ہو تو خانہ سرخ ہو جاتا ہے۔",
      },
    },
    {
      step: 4,
      screen: currentPath,
      screenLabel,
      exactSelector: ".sale-entry-items tbody tr:first-child",
      resolveTarget: () => {
        const c = getActiveWorkspaceContainer();
        return (
          c?.querySelector(".sale-entry-items tbody tr:first-child") ||
          c?.querySelector(".sale-entry-items")
        );
      },
      title: {
        en: "Rapid 'Enter' Key Flow & 1-Click Generic/Salt Substitute Finder (⇄)",
        ur: "تیز 'Enter' کی بورڈ انٹری اور متبادل دوائی (Substitute ⇄) بٹن",
      },
      instruction: {
        en: "Work hands-free with your keyboard: press Enter on 'Product *' → jumps to 'Batch' → 'Qty *' → 'Disc %' → and pressing Enter on 'Disc %' automatically adds and focuses the next row! If a medicine is out of stock, click the green swap icon (⇄) inside the Product cell to find in-stock alternative brands with the exact same generic salt/formulation.",
        ur: "کی بورڈ سے تیز بلنگ کریں: Product منتخب کر کے Enter دبائیں ← کرسر Batch ← پھر Qty ← اور پھر Disc % پر جائے گا، اور دوبارہ Enter دبانے سے نئی لائن خودکار کھل جائے گی! اگر کوئی دوائی ختم ہو تو Product خانے کے اندر سبز آئیکن (⇄) پر کلک کر کے اسی فارمولے (Salt) کی متبادل دوائی منتخب کریں۔",
      },
      observedInstruction: {
        en: "Work hands-free with your keyboard: press Enter on 'Product *' → jumps to 'Batch' → 'Qty *' → 'Disc %' → and pressing Enter on 'Disc %' automatically adds and focuses the next row! If a medicine is out of stock, click the green swap icon (⇄) inside the Product cell to find in-stock alternative brands with the exact same generic salt/formulation.",
        ur: "کی بورڈ سے تیز بلنگ کریں: Product منتخب کر کے Enter دبائیں ← کرسر Batch ← پھر Qty ← اور پھر Disc % پر جائے گا، اور دوبارہ Enter دبانے سے نئی لائن خودکار کھل جائے گی! اگر کوئی دوائی ختم ہو تو Product خانے کے اندر سبز آئیکن (⇄) پر کلک کر کے اسی فارمولے (Salt) کی متبادل دوائی منتخب کریں۔",
      },
      checkpoint: {
        en: "Use Up/Down arrows (↑/↓) inside Qty or Disc % to move vertically across invoice rows.",
        ur: "قطاروں کے درمیان اوپر نیچے جانے کے لیے ↑ اور ↓ ایرو بٹن استعمال کریں۔",
      },
    },
    {
      step: 5,
      screen: currentPath,
      screenLabel,
      exactSelector: ".sale-entry-summary",
      element: container?.querySelector(".sale-entry-summary") || null,
      title: {
        en: "Bill Summary Sidebar: Live Margin %, Payment Account & Cash Change Calculator",
        ur: "بل سمری سائیڈ بار: منافع %، پیمنٹ اکاؤنٹ اور بقایا واپسی (Return) کیلکولیٹر",
      },
      instruction: {
        en: "On the right sidebar, inspect your live Margin % badge, optional Tax %, and bill-level Disc % / Disc Amt. Select the Payment Method & Account (Cash, Card/POS, Bank, or Wallet), enter 'Cash Given' (or click Exact / 500 / 1000 / 5000 note chips) to see instant 'Return' change, verify 'Received' & 'Remaining Due', and click 'Create Sale' (Alt+S).",
        ur: "دائیں جانب سمری پینل میں لائیو Margin %، ٹیکس اور مجموعی ڈسکاؤنٹ چیک کریں۔ پیمنٹ کا طریقہ اور اکاؤنٹ (نقد، کارڈ، بینک یا والٹ) منتخب کریں، گاہک کی دی گئی رقم 'Cash Given' میں لکھیں (یا 500 / 1000 / 5000 کے بٹن دبائیں) تاکہ واپس کرنے والی رقم (Return) نکل آئے، اور 'Create Sale' (Alt+S) دبائیں۔",
      },
      observedInstruction: {
        en: "On the right sidebar, inspect your live Margin % badge, optional Tax %, and bill-level Disc % / Disc Amt. Select the Payment Method & Account (Cash, Card/POS, Bank, or Wallet), enter 'Cash Given' (or click Exact / 500 / 1000 / 5000 note chips) to see instant 'Return' change, verify 'Received' & 'Remaining Due', and click 'Create Sale' (Alt+S).",
        ur: "دائیں جانب سمری پینل میں لائیو Margin %، ٹیکس اور مجموعی ڈسکاؤنٹ چیک کریں۔ پیمنٹ کا طریقہ اور اکاؤنٹ (نقد، کارڈ، بینک یا والٹ) منتخب کریں، گاہک کی دی گئی رقم 'Cash Given' میں لکھیں (یا 500 / 1000 / 5000 کے بٹن دبائیں) تاکہ واپس کرنے والی رقم (Return) نکل آئے، اور 'Create Sale' (Alt+S) دبائیں۔",
      },
      checkpoint: {
        en: "Accounting Impact: Saving deducts batch stock, posts COGS & Revenue to GL, updates Cash Drawer/Bank, and records any Remaining Due in Customer Ledger.",
        ur: "اکاؤنٹنگ اثر: بل محفوظ ہوتے ہی اسٹاک کم ہو جاتا ہے، کیش ڈراور/بینک اپڈیٹ ہوتا ہے اور بقایا رقم گاہک کے کھاتے میں درج ہو جاتی ہے۔",
      },
    },
  ].filter((st) => st.element || st.exactSelector || st.resolveTarget);
}

/**
 * 2. Dedicated 4-Step Walkthrough for Wholesale (B2B) Sale Invoice Form (`SaleInvoiceWholesaleForm.jsx`)
 * Routes: `/sale-invoices/create/wholesale`, `/wholesale-invoices/:id/edit`
 */
function buildWholesaleSaleInvoiceFormSteps(container, currentPath) {
  const isEdit = currentPath.includes("/edit");
  const screenLabel = {
    en: isEdit ? "Edit Wholesale (B2B) Invoice" : "Wholesale (B2B) Sale Invoice Form",
    ur: isEdit ? "ہول سیل (B2B) بل میں ترمیم" : "ہول سیل (B2B) سیل انوائس فارم",
  };

  return [
    {
      step: 1,
      screen: currentPath,
      screenLabel,
      exactSelector: ".sale-entry-banner",
      element: container?.querySelector(".sale-entry-banner") || null,
      title: {
        en: "B2B Wholesale Header: Debit (Cash) vs. Credit (Ledger) & Held Drafts",
        ur: "ہول سیل (B2B) ہیڈر: نقد (Debit) بمقابلہ کھاتہ (Credit) اور ڈرافٹس",
      },
      instruction: {
        en: "This screen is built for B2B distribution and bulk wholesale orders (Pack & Unit billing). Toggle between 'Debit (Cash)' and 'Credit (Ledger)' using Alt+T, manage auto-saved or held drafts via Alt+H, and press Alt+S anytime to save and print your wholesale invoice.",
        ur: "یہ اسکرین ہول سیل اور ڈسٹری بیوشن بلنگ (پیک اور کھلے یونٹس) کے لیے بنائی گئی ہے۔ Alt+T سے Debit (نقد) یا Credit (کھاتہ) منتخب کریں، Alt+H سے ہولڈ ڈرافٹس دیکھیں، اور بل محفوظ کرنے کے لیے Alt+S دبائیں۔",
      },
      observedInstruction: {
        en: "This screen is built for B2B distribution and bulk wholesale orders (Pack & Unit billing). Toggle between 'Debit (Cash)' and 'Credit (Ledger)' using Alt+T, manage auto-saved or held drafts via Alt+H, and press Alt+S anytime to save and print your wholesale invoice.",
        ur: "یہ اسکرین ہول سیل اور ڈسٹری بیوشن بلنگ (پیک اور کھلے یونٹس) کے لیے بنائی گئی ہے۔ Alt+T سے Debit (نقد) یا Credit (کھاتہ) منتخب کریں، Alt+H سے ہولڈ ڈرافٹس دیکھیں، اور بل محفوظ کرنے کے لیے Alt+S دبائیں۔",
      },
      checkpoint: {
        en: "Wholesale invoices support A4 printouts as well as unpriced Delivery Challans for warehouse dispatch.",
        ur: "ہول سیل بل کے ساتھ آپ بغیر قیمت والا ڈلیوری چالان (Delivery Challan) بھی پرنٹ کر سکتے ہیں۔",
      },
    },
    {
      step: 2,
      screen: currentPath,
      screenLabel,
      exactSelector: ".sale-entry-details",
      element: container?.querySelector(".sale-entry-details") || null,
      title: {
        en: "Wholesale Customer, Contracted B2B Rates, Credit Limit & Order Breakdown",
        ur: "ہول سیل کسٹمر، مخصوص رعایتی ریٹس، کریڈٹ لمٹ اور آرڈر کا خلاصہ",
      },
      instruction: {
        en: "Select your 'Wholesale Customer *'. If the customer has custom B2B rates from previous bills, a 'Contracted Rates' badge appears and automatically applies their special pack prices! Below that, inspect their Credit Limit, Previous Balance, Available Credit, and Due Date, enter Bilty/Transporter details in 'Remarks / Delivery Note', and check the live 'Order Breakdown' (Packs + Loose Units + Bonus).",
        ur: "اپنا 'Wholesale Customer *' منتخب کریں۔ اگر اس گاہک کے لیے مخصوص ہول سیل ریٹس پہلے سے محفوظ ہیں تو 'Contracted Rates' بیج نظر آئے گا اور وہی ریٹس خودکار لگ جائیں گے! نیچے گاہک کی کریڈٹ لمٹ، پچھلا بیلنس، بلٹی/ٹرانسپورٹ تفصیلات (Remarks) اور کل پیک/یونٹ/بونس کا خلاصہ دیکھیں۔",
      },
      observedInstruction: {
        en: "Select your 'Wholesale Customer *'. If the customer has custom B2B rates from previous bills, a 'Contracted Rates' badge appears and automatically applies their special pack prices! Below that, inspect their Credit Limit, Previous Balance, Available Credit, and Due Date, enter Bilty/Transporter details in 'Remarks / Delivery Note', and check the live 'Order Breakdown' (Packs + Loose Units + Bonus).",
        ur: "اپنا 'Wholesale Customer *' منتخب کریں۔ اگر اس گاہک کے لیے مخصوص ہول سیل ریٹس پہلے سے محفوظ ہیں تو 'Contracted Rates' بیج نظر آئے گا اور وہی ریٹس خودکار لگ جائیں گے! نیچے گاہک کی کریڈٹ لمٹ، پچھلا بیلنس، بلٹی/ٹرانسپورٹ تفصیلات (Remarks) اور کل پیک/یونٹ/بونس کا خلاصہ دیکھیں۔",
      },
      checkpoint: {
        en: "Custom Customer Pricing: Any custom Pack Price you set for a named customer is remembered automatically for their next wholesale bill!",
        ur: "خاص فیچر: کسی رجسٹرڈ گاہک کو دیا گیا مخصوص پیک ریٹ اگلے بل کے لیے خودکار محفوظ ہو جاتا ہے!",
      },
    },
    {
      step: 3,
      screen: currentPath,
      screenLabel,
      exactSelector: ".sale-entry-items",
      element: container?.querySelector(".sale-entry-items") || null,
      title: {
        en: "18-Column B2B Repeater Table: Pack/Unit Sync, Free Bonus Scheme & Live Margin %",
        ur: "18 کالمز کا ہول سیل ٹیبل: پیک/یونٹ سنک، فری بونس اسکیم اور لائیو منافع %",
      },
      instruction: {
        en: "Add products and select the FEFO Batch. Enter 'Pack.Q' (full boxes) or 'Unit.Q' (total units)—both sync automatically using Pack Size (PSize). Enter trade scheme free items in 'Pack.B' or 'Unit.B' (deducted from batch stock at Rs. 0 charge, shown in 'Tot.U'). Adjust 'Pack.P *' or 'Unit.P *' wholesale prices and watch live 'Margin %' compare your rate against batch Average Cost.",
        ur: "پروڈکٹ اور بیچ منتخب کریں۔ 'Pack.Q' میں ڈبوں کی تعداد لکھیں تو 'Unit.Q' خودکار نکل آئے گا۔ فری اسکیم کے یونٹس 'Pack.B' یا 'Unit.B' میں لکھیں (یہ اسٹاک سے کم ہوں گے مگر گاہک کو مفت ملیں گے)۔ ہول سیل قیمت 'Pack.P *' یا 'Unit.P *' میں لکھیں اور سامنے 'Margin %' میں اپنا منافع لائیو چیک کریں۔",
      },
      observedInstruction: {
        en: "Add products and select the FEFO Batch. Enter 'Pack.Q' (full boxes) or 'Unit.Q' (total units)—both sync automatically using Pack Size (PSize). Enter trade scheme free items in 'Pack.B' or 'Unit.B' (deducted from batch stock at Rs. 0 charge, shown in 'Tot.U'). Adjust 'Pack.P *' or 'Unit.P *' wholesale prices and watch live 'Margin %' compare your rate against batch Average Cost.",
        ur: "پروڈکٹ اور بیچ منتخب کریں۔ 'Pack.Q' میں ڈبوں کی تعداد لکھیں تو 'Unit.Q' خودکار نکل آئے گا۔ فری اسکیم کے یونٹس 'Pack.B' یا 'Unit.B' میں لکھیں (یہ اسٹاک سے کم ہوں گے مگر گاہک کو مفت ملیں گے)۔ ہول سیل قیمت 'Pack.P *' یا 'Unit.P *' میں لکھیں اور سامنے 'Margin %' میں اپنا منافع لائیو چیک کریں۔",
      },
      checkpoint: {
        en: "Margin Alert: If you enter a wholesale price below batch Average Cost, 'Margin %' turns red to warn you before saving.",
        ur: "منافع الرٹ: اگر ہول سیل ریٹ قیمتِ خرید سے کم ہو جائے تو Margin % سرخ ہو کر خبردار کرتا ہے۔",
      },
    },
    {
      step: 4,
      screen: currentPath,
      screenLabel,
      exactSelector: "#wholesale-summary-footer .sale-entry-summary, .sale-entry-summary",
      resolveTarget: () => {
        const c = getActiveWorkspaceContainer();
        return (
          c?.querySelector("#wholesale-summary-footer .sale-entry-summary") ||
          c?.querySelector(".sale-entry-summary")
        );
      },
      title: {
        en: "Sticky Wholesale Summary Footer: Flat Discount/Tax, Payment Account & Tender",
        ur: "ہول سیل سمری فوٹر: ڈسکاؤنٹ/ٹیکس، پیمنٹ اکاؤنٹ اور بل کی تکمیل",
      },
      instruction: {
        en: "At the bottom footer, review the active row's Margin %, apply any bill-level Disc % / Disc Amt or Tax %, and check Gross Amount vs. Net Total. Choose your Payment Method & Account, enter Cash Given (or click Exact / 1000 / 5000 / 10000 chips), adjust 'Received' for partial credit recovery, and click 'Create Wholesale Sale' (Alt+S).",
        ur: "نچلے فوٹر میں ڈسکاؤنٹ، ٹیکس اور کل بل (Net Total) چیک کریں۔ پیمنٹ کا طریقہ اور اکاؤنٹ منتخب کریں، وصول شدہ رقم ('Received') درج کریں (ادھار بل میں جتنی رقم کم ہو گی وہ خودکار گاہک کے کھاتے میں جائے گی) اور 'Create Wholesale Sale' (Alt+S) دبائیں۔",
      },
      observedInstruction: {
        en: "At the bottom footer, review the active row's Margin %, apply any bill-level Disc % / Disc Amt or Tax %, and check Gross Amount vs. Net Total. Choose your Payment Method & Account, enter Cash Given (or click Exact / 1000 / 5000 / 10000 chips), adjust 'Received' for partial credit recovery, and click 'Create Wholesale Sale' (Alt+S).",
        ur: "نچلے فوٹر میں ڈسکاؤنٹ، ٹیکس اور کل بل (Net Total) چیک کریں۔ پیمنٹ کا طریقہ اور اکاؤنٹ منتخب کریں، وصول شدہ رقم ('Received') درج کریں (ادھار بل میں جتنی رقم کم ہو گی وہ خودکار گاہک کے کھاتے میں جائے گی) اور 'Create Wholesale Sale' (Alt+S) دبائیں۔",
      },
      checkpoint: {
        en: "Accounting Impact: Both billed units and bonus units deduct from batch stock and post accurate COGS to the General Ledger.",
        ur: "اکاؤنٹنگ اثر: بل کیے گئے یونٹس اور بونس یونٹس دونوں اسٹاک سے کم ہوتے ہیں اور کھاتہ اپڈیٹ ہو جاتا ہے۔",
      },
    },
  ].filter((st) => st.element || st.exactSelector || st.resolveTarget);
}

/**
 * 3. Dedicated 4-Step Walkthrough for High-Speed Barcode POS (`BarcodePos.jsx`)
 * Route: `/sale-invoices/pos`
 */
function buildBarcodePosSteps(container, currentPath) {
  const screenLabel = {
    en: "High-Speed Barcode POS Terminal",
    ur: "ہائی اسپیڈ بارکوڈ POS ٹرمینل",
  };

  return [
    {
      step: 1,
      screen: currentPath,
      screenLabel,
      exactSelector: "header",
      element: container?.querySelector("header") || null,
      title: {
        en: "POS Command Bar: Hands-Free Scanner Mode, Parked Carts (F8) & Audio Beep",
        ur: "POS ہیڈر بار: ہینڈز فری اسکینر، ہولڈ بل (F8) اور اسٹینڈرڈ فارم سوئچ",
      },
      instruction: {
        en: "Welcome to High-Speed Barcode POS! 'Hands-Free Active' means your USB/Bluetooth barcode scanner works globally from anywhere on this screen without clicking inside an input box. Use 'Parked Carts' (or press F8) to hold a customer's cart and serve the next person in line, toggle the scan audio beep, or switch back to 'Standard Form'.",
        ur: "ہائی اسپیڈ بارکوڈ POS میں خوش آمدید! 'Hands-Free Active' کا مطلب ہے کہ آپ کسی بھی خانے میں کلک کیے بغیر براہِ راست بارکوڈ گن سے آئٹم اسکین کر سکتے ہیں۔ بل عارضی طور پر روکنے کے لیے 'Parked Carts' (F8) استعمال کریں۔",
      },
      observedInstruction: {
        en: "Welcome to High-Speed Barcode POS! 'Hands-Free Active' means your USB/Bluetooth barcode scanner works globally from anywhere on this screen without clicking inside an input box. Use 'Parked Carts' (or press F8) to hold a customer's cart and serve the next person in line, toggle the scan audio beep, or switch back to 'Standard Form'.",
        ur: "ہائی اسپیڈ بارکوڈ POS میں خوش آمدید! 'Hands-Free Active' کا مطلب ہے کہ آپ کسی بھی خانے میں کلک کیے بغیر براہِ راست بارکوڈ گن سے آئٹم اسکین کر سکتے ہیں۔ بل عارضی طور پر روکنے کے لیے 'Parked Carts' (F8) استعمال کریں۔",
      },
      checkpoint: {
        en: "Parked Carts persist safely in your browser even if you refresh the page.",
        ur: "ہولڈ کیے گئے کارٹس (Parked Carts) صفحہ ریفریش کرنے پر بھی محفوظ رہتے ہیں۔",
      },
    },
    {
      step: 2,
      screen: currentPath,
      screenLabel,
      resolveTarget: () => {
        const c = getActiveWorkspaceContainer();
        const scannerInput = c?.querySelector(".scanner-target");
        return (
          scannerInput?.closest(".lg\\:col-span-8 > div:first-child") ||
          scannerInput?.closest(".rounded-xl") ||
          scannerInput
        );
      },
      title: {
        en: "Dual Scanner & Search HUD: Name Search (F3) & Manual Barcode Entry (F2)",
        ur: "ڈوئل اسکین اور سرچ پینل: نام سے تلاش (F3) اور مینوئل بارکوڈ (F2)",
      },
      instruction: {
        en: "Scan any item barcode with your hardware gun (it also decodes GS1 Weight-Embedded Barcodes starting with 20–29 for weighed items!). No barcode on a medicine strip? Press F3 to search by Product Name or Generic Salt on the left, or press F2 to type a Barcode/SKU manually on the right and press Enter.",
        ur: "بارکوڈ گن سے اسکین کریں (یہ وزن والے GS1 بارکوڈز 20–29 کو بھی خودکار پڑھ لیتا ہے!)۔ اگر کسی دوائی پر بارکوڈ نہ ہو تو F3 دبا کر بائیں خانے میں نام یا فارمولے سے سرچ کریں، یا F2 دبا کر دائیں خانے میں بارکوڈ نمبر لکھ کر Enter دبائیں۔",
      },
      observedInstruction: {
        en: "Scan any item barcode with your hardware gun (it also decodes GS1 Weight-Embedded Barcodes starting with 20–29 for weighed items!). No barcode on a medicine strip? Press F3 to search by Product Name or Generic Salt on the left, or press F2 to type a Barcode/SKU manually on the right and press Enter.",
        ur: "بارکوڈ گن سے اسکین کریں (یہ وزن والے GS1 بارکوڈز 20–29 کو بھی خودکار پڑھ لیتا ہے!)۔ اگر کسی دوائی پر بارکوڈ نہ ہو تو F3 دبا کر بائیں خانے میں نام یا فارمولے سے سرچ کریں، یا F2 دبا کر دائیں خانے میں بارکوڈ نمبر لکھ کر Enter دبائیں۔",
      },
      checkpoint: {
        en: "Every scan automatically selects the earliest expiring in-stock batch (FEFO).",
        ur: "ہر اسکین پر سسٹم خودکار طور پر سب سے پہلے ایکسپائر ہونے والا بیچ (FEFO) منتخب کرتا ہے۔",
      },
    },
    {
      step: 3,
      screen: currentPath,
      screenLabel,
      resolveTarget: () => {
        const c = getActiveWorkspaceContainer();
        const cartTable = c?.querySelector(".barcode-pos-items");
        return cartTable?.closest(".flex-1.rounded-xl") || cartTable;
      },
      title: {
        en: "Live Accumulating Cart: FEFO Batches, Quantity (-/+) & Generic Substitutes",
        ur: "لائیو کارٹ ٹیبل: بیچ سلیکشن، مقدار (-/+) اور متبادل دوائی (Substitutes)",
      },
      instruction: {
        en: "Scanning the same barcode multiple times automatically increments its Quantity in this cart. For each row, you can switch the Batch (FEFO) dropdown, adjust Quantity (- / +) or Disc %, or click the green 'Substitutes' button under the product name to swap in an alternative brand with the same salt/formulation.",
        ur: "ایک ہی آئٹم کو بار بار اسکین کرنے سے کارٹ میں اس کی مقدار خودکار بڑھتی جاتی ہے۔ آپ یہاں سے بیچ تبدیل کر سکتے ہیں، مقدار (- / +) یا ڈسکاؤنٹ ایڈجسٹ کر سکتے ہیں، یا پروڈکٹ کے نام کے نیچے سبز 'Substitutes' بٹن دبا کر ہم وزن فارمولے کی متبادل دوائی شامل کر سکتے ہیں۔",
      },
      observedInstruction: {
        en: "Scanning the same barcode multiple times automatically increments its Quantity in this cart. For each row, you can switch the Batch (FEFO) dropdown, adjust Quantity (- / +) or Disc %, or click the green 'Substitutes' button under the product name to swap in an alternative brand with the same salt/formulation.",
        ur: "ایک ہی آئٹم کو بار بار اسکین کرنے سے کارٹ میں اس کی مقدار خودکار بڑھتی جاتی ہے۔ آپ یہاں سے بیچ تبدیل کر سکتے ہیں، مقدار (- / +) یا ڈسکاؤنٹ ایڈجسٹ کر سکتے ہیں، یا پروڈکٹ کے نام کے نیچے سبز 'Substitutes' بٹن دبا کر ہم وزن فارمولے کی متبادل دوائی شامل کر سکتے ہیں۔",
      },
      checkpoint: {
        en: "Press F8 anytime to Park (Hold) the current cart and start a fresh bill immediately.",
        ur: "موجودہ کارٹ کو ہولڈ کرنے کے لیے کسی بھی وقت F8 دبائیں۔",
      },
    },
    {
      step: 4,
      screen: currentPath,
      screenLabel,
      exactSelector: "#pos-tender-panel",
      element: container?.querySelector("#pos-tender-panel") || null,
      title: {
        en: "Customer, Giant Total Payable, 4-Way Payment & Instant Checkout (F4 / Alt+S)",
        ur: "کسٹمر، ٹوٹل بل، پیمنٹ میتھڈ اور فوری بل مکمل کرنا (F4 / Alt+S)",
      },
      instruction: {
        en: "On the right tender panel, keep 'Walk-in Customer' or click 'Search Directory' for a named customer. Review the giant Total Payable banner and optional Extra Bill Discount. Pick your Payment Method (Cash, Card / POS, Wallet, or Split / Credit), enter Cash Given (or press Alt+C for Exact Cash / click 500, 1000, 2000, 5000 chips) to see Change Due, and press 'Complete Sale (Alt+S / F4)'!",
        ur: "دائیں جانب ٹینڈر پینل میں Walk-in Customer رکھیں یا رجسٹرڈ گاہک سرچ کریں۔ کل واجب الادا رقم (Total Payable) اور اضافی ڈسکاؤنٹ چیک کریں۔ پیمنٹ کا طریقہ (Cash, Card / POS, Wallet یا Split / Credit) منتخب کریں، وصول شدہ نقدی لکھیں (پوری رقم کے لیے Alt+C دبائیں) اور رسید پرنٹ کرنے کے لیے 'Complete Sale (Alt+S / F4)' دبائیں!",
      },
      observedInstruction: {
        en: "On the right tender panel, keep 'Walk-in Customer' or click 'Search Directory' for a named customer. Review the giant Total Payable banner and optional Extra Bill Discount. Pick your Payment Method (Cash, Card / POS, Wallet, or Split / Credit), enter Cash Given (or press Alt+C for Exact Cash / click 500, 1000, 2000, 5000 chips) to see Change Due, and press 'Complete Sale (Alt+S / F4)'!",
        ur: "دائیں جانب ٹینڈر پینل میں Walk-in Customer رکھیں یا رجسٹرڈ گاہک سرچ کریں۔ کل واجب الادا رقم (Total Payable) اور اضافی ڈسکاؤنٹ چیک کریں۔ پیمنٹ کا طریقہ (Cash, Card / POS, Wallet یا Split / Credit) منتخب کریں، وصول شدہ نقدی لکھیں (پوری رقم کے لیے Alt+C دبائیں) اور رسید پرنٹ کرنے کے لیے 'Complete Sale (Alt+S / F4)' دبائیں!",
      },
      checkpoint: {
        en: "Split / Credit lets you collect partial cash/card/wallet now and post any remaining balance to the customer's Udhar ledger.",
        ur: "Split / Credit آپشن سے آپ ایک ہی بل میں نقد/کارڈ/والٹ اور ادھار کھاتہ اکٹھا استعمال کر سکتے ہیں۔",
      },
    },
  ].filter((st) => st.element || st.exactSelector || st.resolveTarget);
}

/**
 * 4. Dedicated 4-Step Walkthrough for Purchase Invoice / GRN Form (`PurchaseInvoiceForm.jsx`)
 * Routes: `/purchase-invoices/create`, `/purchase-invoices/:id/edit`
 */
function buildPurchaseInvoiceFormSteps(container, currentPath) {
  const isEdit = currentPath.includes("/edit");
  const screenLabel = {
    en: isEdit ? "Edit Purchase Invoice (GRN)" : "Create Purchase Invoice (GRN)",
    ur: isEdit ? "پرچیز انوائس (GRN) میں ترمیم" : "نیا پرچیز بل (GRN / اسٹاک انٹری)",
  };

  return [
    {
      step: 1,
      screen: currentPath,
      screenLabel,
      exactSelector: ".purchase-entry-banner",
      element: container?.querySelector(".purchase-entry-banner") || null,
      title: {
        en: "Purchase Header: Held Drafts (Alt+H), Debit/Credit Toggle (Alt+T) & '+ Add Product'",
        ur: "پرچیز ہیڈر: ڈرافٹس (Alt+H)، نقد/ادھار بٹن (Alt+T) اور '+ Add Product'",
      },
      instruction: {
        en: "Use this top bar to toggle between 'Debit' (Cash/Bank Paid immediately) and 'Credit' (Supplier Payable ledger, shortcut Alt+T), or manage auto-saved drafts (Alt+H). If the supplier's bill contains a brand-new medicine not in your catalog yet, click '+ Add Product' right here to create it without leaving your invoice!",
        ur: "یہاں سے بل کی قسم منتخب کریں: نقد ادائیگی کے لیے Debit یا سپلائر کے کھاتے میں ادھار لکھنے کے لیے Credit (Alt+T)۔ اگر سپلائر کے بل میں کوئی بالکل نئی پروڈکٹ ہے جو پہلے سسٹم میں نہیں، تو بل بند کیے بغیر '+ Add Product' بٹن دبا کر اسے فوری رجسٹر کریں!",
      },
      observedInstruction: {
        en: "Use this top bar to toggle between 'Debit' (Cash/Bank Paid immediately) and 'Credit' (Supplier Payable ledger, shortcut Alt+T), or manage auto-saved drafts (Alt+H). If the supplier's bill contains a brand-new medicine not in your catalog yet, click '+ Add Product' right here to create it without leaving your invoice!",
        ur: "یہاں سے بل کی قسم منتخب کریں: نقد ادائیگی کے لیے Debit یا سپلائر کے کھاتے میں ادھار لکھنے کے لیے Credit (Alt+T)۔ اگر سپلائر کے بل میں کوئی بالکل نئی پروڈکٹ ہے جو پہلے سسٹم میں نہیں، تو بل بند کیے بغیر '+ Add Product' بٹن دبا کر اسے فوری رجسٹر کریں!",
      },
      checkpoint: {
        en: "Shortcut Tip: Alt+T toggles Debit/Credit; Alt+H opens Held Drafts; Alt+S saves the Purchase Invoice.",
        ur: "شارٹ کٹ: Alt+T نقد/ادھار بدلتا ہے، Alt+H ڈرافٹس کھولتا ہے اور Alt+S بل محفوظ کرتا ہے۔",
      },
    },
    {
      step: 2,
      screen: currentPath,
      screenLabel,
      exactSelector: ".purchase-entry-details",
      element: container?.querySelector(".purchase-entry-details") || null,
      title: {
        en: "Supplier Selection, Paper 'Invoice #', 'Bill Amt' & ±5 Rs 'Diff' Guard",
        ur: "سپلائر، کاغذی بل نمبر ('Invoice #')، 'Bill Amt' اور ±5 روپے 'Diff' گارڈ",
      },
      instruction: {
        en: "Select 'Supplier *', verify 'Date', and enter the distributor's paper 'Invoice #' and printed net total in 'Bill Amt'. Watch the 'Diff' box (Bill Amt − Total Amount): Karobar ERP enforces a strict ±5 Rs accuracy guard so you cannot accidentally save a bill with missing items or wrong supplier rates! Selecting a supplier also reveals their Credit Limit, Current Payable, and Due Date strip.",
        ur: "اپنا 'Supplier *' منتخب کریں، سپلائر کا کاغذی بل نمبر ('Invoice #') اور اس بل پر لکھی کل رقم 'Bill Amt' میں درج کریں۔ ساتھ والا 'Diff' خانہ آپ کے درج کردہ آئٹمز اور سپلائر بل کا فرق دکھاتا ہے—غلطی سے بچنے کے لیے بل محفوظ کرتے وقت یہ فرق ±5 روپے کے اندر ہونا ضروری ہے!",
      },
      observedInstruction: {
        en: "Select 'Supplier *', verify 'Date', and enter the distributor's paper 'Invoice #' and printed net total in 'Bill Amt'. Watch the 'Diff' box (Bill Amt − Total Amount): Karobar ERP enforces a strict ±5 Rs accuracy guard so you cannot accidentally save a bill with missing items or wrong supplier rates! Selecting a supplier also reveals their Credit Limit, Current Payable, and Due Date strip.",
        ur: "اپنا 'Supplier *' منتخب کریں، سپلائر کا کاغذی بل نمبر ('Invoice #') اور اس بل پر لکھی کل رقم 'Bill Amt' میں درج کریں۔ ساتھ والا 'Diff' خانہ آپ کے درج کردہ آئٹمز اور سپلائر بل کا فرق دکھاتا ہے—غلطی سے بچنے کے لیے بل محفوظ کرتے وقت یہ فرق ±5 روپے کے اندر ہونا ضروری ہے!",
      },
      checkpoint: {
        en: "Accuracy Guard: Always copy the supplier's printed net total into 'Bill Amt' first so 'Diff' guides you to 0.00 as you enter rows.",
        ur: "اہم نکتہ: سب سے پہلے سپلائر کے بل کی کل رقم 'Bill Amt' میں لکھیں تاکہ آئٹمز ڈالتے وقت 'Diff' صفر (0) ہونے کی تصدیق ہو سکے۔",
      },
    },
    {
      step: 3,
      screen: currentPath,
      screenLabel,
      exactSelector: ".purchase-entry-items",
      element: container?.querySelector(".purchase-entry-items") || null,
      title: {
        en: "21-Column GRN Table: Batch/Expiry, Pack/Unit Qty, Bonus, Retail/Wholesale Prices & Margin Guard",
        ur: "21 کالمز کا اسٹاک انٹری ٹیبل: بیچ، ایکسپائری، بونس، قیمتیں اور منافع گارڈ",
      },
      instruction: {
        en: "For each received item, enter: 'Product *', 'Batch' & 'Exp' date, 'Pack.Q' / 'Unit.Q', 'Purchase Price (Pack.P / Unit.P)', 'Disc%', and any free scheme 'PBonus' / 'UBonus' (which automatically lowers your effective 'Avg' unit cost!). Verify Retail 'Sale Price (Pack.S / Unit.S)' and Wholesale 'W.S.Pack / W.S.Unit'. You can also drag '⠿' or use the top Brand Arrangement bar to save the supplier's item order.",
        ur: "ہر آئٹم کے لیے درج کریں: 'Product *'، بیچ نمبر ('Batch') اور ایکسپائری ('Exp')، مقدار ('Pack.Q / Unit.Q')، قیمتِ خرید ('Pack.P / Unit.P')، ڈسکاؤنٹ ('Disc%') اور کمپنی کے مفت بونس یونٹس ('PBonus / UBonus' — جس سے اوسط لاگت Avg خودکار کم ہو جاتی ہے!)۔ آگے ریٹیل قیمت ('Pack.S / Unit.S') اور ہول سیل قیمت چیک کریں۔",
      },
      observedInstruction: {
        en: "For each received item, enter: 'Product *', 'Batch' & 'Exp' date, 'Pack.Q' / 'Unit.Q', 'Purchase Price (Pack.P / Unit.P)', 'Disc%', and any free scheme 'PBonus' / 'UBonus' (which automatically lowers your effective 'Avg' unit cost!). Verify Retail 'Sale Price (Pack.S / Unit.S)' and Wholesale 'W.S.Pack / W.S.Unit'. You can also drag '⠿' or use the top Brand Arrangement bar to save the supplier's item order.",
        ur: "ہر آئٹم کے لیے درج کریں: 'Product *'، بیچ نمبر ('Batch') اور ایکسپائری ('Exp')، مقدار ('Pack.Q / Unit.Q')، قیمتِ خرید ('Pack.P / Unit.P')، ڈسکاؤنٹ ('Disc%') اور کمپنی کے مفت بونس یونٹس ('PBonus / UBonus' — جس سے اوسط لاگت Avg خودکار کم ہو جاتی ہے!)۔ آگے ریٹیل قیمت ('Pack.S / Unit.S') اور ہول سیل قیمت چیک کریں۔",
      },
      checkpoint: {
        en: "Profit Guard: Every row requires 'Margin % > 0' so you never accidentally set a retail sale price below purchase cost.",
        ur: "منافع گارڈ: ہر آئٹم کا Margin % صفر سے زیادہ ہونا لازمی ہے تاکہ قیمتِ فروخت کبھی لاگت سے کم نہ ہو۔",
      },
    },
    {
      step: 4,
      screen: currentPath,
      screenLabel,
      exactSelector: ".purchase-entry-footer",
      element: container?.querySelector(".purchase-entry-footer") || null,
      title: {
        en: "Sticky 2-Row Purchase Footer: Bill Discount/Tax, Payment Account & Save (Alt+S)",
        ur: "پرچیز سمری فوٹر: بل ڈسکاؤنٹ/ٹیکس، پیمنٹ اکاؤنٹ اور محفوظ کرنا (Alt+S)",
      },
      instruction: {
        en: "In Row 1 of the footer, enter any flat bill-level 'Disc %' / 'Discount' or 'Tax %' / 'Tax' (WHT/GST) and confirm 'Total Amount'. In Row 2, choose the Payment Method & Account (Cash, Bank, Card, Wallet), enter 'Total Paid' (click the Relink icon to auto-match full Total Amount in Debit mode, or enter 0/partial in Credit mode), and click 'Save Purchase Invoice' (Alt+S).",
        ur: "فوٹر کی پہلی قطار میں بل کا مجموعی ڈسکاؤنٹ یا ودہولڈنگ ٹیکس ('Tax %') درج کریں اور 'Total Amount' چیک کریں۔ دوسری قطار میں پیمنٹ اکاؤنٹ منتخب کریں، ادا شدہ رقم ('Total Paid') لکھیں (ادھار بل میں بقایا رقم سپلائر کھاتے میں چلی جائے گی) اور 'Save Purchase Invoice' (Alt+S) پر کلک کریں۔",
      },
      observedInstruction: {
        en: "In Row 1 of the footer, enter any flat bill-level 'Disc %' / 'Discount' or 'Tax %' / 'Tax' (WHT/GST) and confirm 'Total Amount'. In Row 2, choose the Payment Method & Account (Cash, Bank, Card, Wallet), enter 'Total Paid' (click the Relink icon to auto-match full Total Amount in Debit mode, or enter 0/partial in Credit mode), and click 'Save Purchase Invoice' (Alt+S).",
        ur: "فوٹر کی پہلی قطار میں بل کا مجموعی ڈسکاؤنٹ یا ودہولڈنگ ٹیکس ('Tax %') درج کریں اور 'Total Amount' چیک کریں۔ دوسری قطار میں پیمنٹ اکاؤنٹ منتخب کریں، ادا شدہ رقم ('Total Paid') لکھیں (ادھار بل میں بقایا رقم سپلائر کھاتے میں چلی جائے گی) اور 'Save Purchase Invoice' (Alt+S) پر کلک کریں۔",
      },
      checkpoint: {
        en: "Accounting Impact: Saving immediately increments batch stock (including Bonus units), updates product prices, and posts to Supplier Ledger & GL.",
        ur: "اکاؤنٹنگ اثر: بل محفوظ کرتے ہی بیچ اسٹاک (مع بونس یونٹس) فوری بڑھ جاتا ہے اور سپلائر کا کھاتہ اپڈیٹ ہو جاتا ہے۔",
      },
    },
  ].filter((st) => st.element || st.exactSelector || st.resolveTarget);
}

/**
 * 5. Dedicated 4-Step Walkthrough for Sale Return Form (`SaleReturnForm.jsx`)
 * Routes: `/sale-returns/create`, `/sale-returns/:id/edit`
 */
function buildSaleReturnFormSteps(container, currentPath) {
  const isEdit = currentPath.includes("/edit");
  const screenLabel = {
    en: isEdit ? "Edit Sale Return" : "Create Sale Return Form",
    ur: isEdit ? "سیل ریٹرن میں ترمیم" : "سیل ریٹرن فارم (گاہک سے واپسی)",
  };

  return [
    {
      step: 1,
      screen: currentPath,
      screenLabel,
      exactSelector: ".sale-entry-banner",
      element: container?.querySelector(".sale-entry-banner") || null,
      title: {
        en: "Sale Return Header & Keyboard Shortcuts (Alt+S)",
        ur: "سیل ریٹرن ہیڈر اور شارٹ کٹ (Alt+S)",
      },
      instruction: {
        en: "Use the Sale Return form whenever a customer returns medicines or items. All returns are Unit-Based so you can accept back single tablets, strips, or full packs. Press Alt+S anytime to save the return.",
        ur: "جب کوئی گاہک دوائی یا آئٹم واپس کرے تو یہ سیل ریٹرن فارم استعمال کریں۔ یہاں آپ کھلی گولیاں یا پورا پیک یونٹس کی صورت میں واپس لے سکتے ہیں۔ محفوظ کرنے کے لیے Alt+S دبائیں۔",
      },
      observedInstruction: {
        en: "Use the Sale Return form whenever a customer returns medicines or items. All returns are Unit-Based so you can accept back single tablets, strips, or full packs. Press Alt+S anytime to save the return.",
        ur: "جب کوئی گاہک دوائی یا آئٹم واپس کرے تو یہ سیل ریٹرن فارم استعمال کریں۔ یہاں آپ کھلی گولیاں یا پورا پیک یونٹس کی صورت میں واپس لے سکتے ہیں۔ محفوظ کرنے کے لیے Alt+S دبائیں۔",
      },
      checkpoint: {
        en: "Saving a Sale Return automatically puts the returned units back into their active batch stock.",
        ur: "سیل ریٹرن محفوظ کرنے سے واپس کیے گئے یونٹس دوبارہ اسی بیچ کے اسٹاک میں جمع ہو جاتے ہیں۔",
      },
    },
    {
      step: 2,
      screen: currentPath,
      screenLabel,
      exactSelector: ".sale-entry-details",
      element: container?.querySelector(".sale-entry-details") || null,
      title: {
        en: "Customer Selection & Optional Original Sale Invoice Lookup",
        ur: "گاہک کا انتخاب اور اصل سیل بل (Sale Invoice) لنک کرنا",
      },
      instruction: {
        en: "Select the 'Customer *', then optionally click 'Sale Invoice (optional)' to link the original bill: (1) Invoice-Linked Return (Recommended): auto-loads the exact items, batches, prices, and discounts from that sale and caps 'Returnable' quantities to what was actually sold; (2) Open Return: leave Sale Invoice blank to search and return any product manually.",
        ur: "پہلے 'Customer *' منتخب کریں، پھر چاہیں تو 'Sale Invoice (optional)' پر کلک کر کے اصل سیل بل منتخب کریں: (1) بل کے ساتھ منسلک واپسی: اس سے اصل بل کے تمام آئٹمز، بیچ، ریٹ اور ڈسکاؤنٹ خودکار لوڈ ہو جاتے ہیں؛ (2) اوپن ریٹرن: اگر پرانا بل نمبر معلوم نہ ہو تو اسے خالی چھوڑ کر براہِ راست پروڈکٹ سرچ کر لیں۔",
      },
      observedInstruction: {
        en: "Select the 'Customer *', then optionally click 'Sale Invoice (optional)' to link the original bill: (1) Invoice-Linked Return (Recommended): auto-loads the exact items, batches, prices, and discounts from that sale and caps 'Returnable' quantities to what was actually sold; (2) Open Return: leave Sale Invoice blank to search and return any product manually.",
        ur: "پہلے 'Customer *' منتخب کریں، پھر چاہیں تو 'Sale Invoice (optional)' پر کلک کر کے اصل سیل بل منتخب کریں: (1) بل کے ساتھ منسلک واپسی: اس سے اصل بل کے تمام آئٹمز، بیچ، ریٹ اور ڈسکاؤنٹ خودکار لوڈ ہو جاتے ہیں؛ (2) اوپن ریٹرن: اگر پرانا بل نمبر معلوم نہ ہو تو اسے خالی چھوڑ کر براہِ راست پروڈکٹ سرچ کر لیں۔",
      },
      checkpoint: {
        en: "Linking the original Sale Invoice prevents over-returning more units than the customer originally bought.",
        ur: "اصل سیل بل سلیکٹ کرنے سے فروخت شدہ مقدار سے زیادہ واپسی کی غلطی نہیں ہوتی۔",
      },
    },
    {
      step: 3,
      screen: currentPath,
      screenLabel,
      exactSelector: ".sale-entry-items",
      element: container?.querySelector(".sale-entry-items") || null,
      title: {
        en: "12-Column Return Items Table: Batch, Returnable Cap & Return Qty",
        ur: "12 کالمز کا ریٹرن آئٹمز ٹیبل: بیچ، قابلِ واپسی حد اور واپسی کی مقدار",
      },
      instruction: {
        en: "Review each row's Product, Pack Size (PSize), Batch, Expiry, and 'Returnable' limit (or 'Avail' in open mode). Enter the units being returned in 'Return Qty', verify 'Price' and 'Disc%', and delete any rows from the original invoice that the customer is keeping.",
        ur: "ٹیبل میں پروڈکٹ، بیچ، ایکسپائری اور قابلِ واپسی مقدار ('Returnable') چیک کریں۔ جتنے یونٹس واپس آ رہے ہیں وہ 'Return Qty' میں لکھیں، اور جو آئٹمز گاہک واپس نہیں کر رہا ان کے سامنے سرخ ڈیلیٹ بٹن دبا کر لائن ہٹا دیں۔",
      },
      observedInstruction: {
        en: "Review each row's Product, Pack Size (PSize), Batch, Expiry, and 'Returnable' limit (or 'Avail' in open mode). Enter the units being returned in 'Return Qty', verify 'Price' and 'Disc%', and delete any rows from the original invoice that the customer is keeping.",
        ur: "ٹیبل میں پروڈکٹ، بیچ، ایکسپائری اور قابلِ واپسی مقدار ('Returnable') چیک کریں۔ جتنے یونٹس واپس آ رہے ہیں وہ 'Return Qty' میں لکھیں، اور جو آئٹمز گاہک واپس نہیں کر رہا ان کے سامنے سرخ ڈیلیٹ بٹن دبا کر لائن ہٹا دیں۔",
      },
      checkpoint: {
        en: "If 'Return Qty' exceeds the 'Returnable' limit on a linked invoice, the input highlights red.",
        ur: "اگر واپسی کی مقدار (Return Qty) اصل بل کی مقدار سے زیادہ ہو تو خانہ سرخ ہو جاتا ہے۔",
      },
    },
    {
      step: 4,
      screen: currentPath,
      screenLabel,
      exactSelector: ".sale-return-summary, .sale-entry-summary",
      resolveTarget: () => {
        const c = getActiveWorkspaceContainer();
        return (
          c?.querySelector(".sale-return-summary") ||
          c?.querySelector(".sale-entry-summary")
        );
      },
      title: {
        en: "Return Summary & 2-Way Settlement Outcome (Credit Note vs. Instant Refund)",
        ur: "ریٹرن سمری اور رقم کی واپسی کا طریقہ (کھاتہ ایڈجسٹمنٹ یا فوری نقد واپسی)",
      },
      instruction: {
        en: "Check Gross Total, Discount, Tax, and Net Total on the right panel, then choose your 'Settlement Outcome': (1) 'Adjust Customer Ledger (Credit Note)' — reduces the customer's Udhar receivable balance without touching cash; or (2) 'Instant Refund (Cash / Bank / Wallet)' — pays cash/bank back immediately from your chosen Refund Account. Click 'Create Return' (Alt+S).",
        ur: "دائیں جانب کل واپسی کی رقم چیک کریں اور 'Settlement Outcome' میں سے ایک طریقہ منتخب کریں: (1) 'Adjust Customer Ledger (Credit Note)' — گاہک کے ادھار کھاتے سے رقم کم کرنے کے لیے؛ یا (2) 'Instant Refund (Cash / Bank / Wallet)' — گلے یا بینک سے فوری نقد رقم واپس کرنے کے لیے۔ آخر میں 'Create Return' (Alt+S) دبائیں۔",
      },
      observedInstruction: {
        en: "Check Gross Total, Discount, Tax, and Net Total on the right panel, then choose your 'Settlement Outcome': (1) 'Adjust Customer Ledger (Credit Note)' — reduces the customer's Udhar receivable balance without touching cash; or (2) 'Instant Refund (Cash / Bank / Wallet)' — pays cash/bank back immediately from your chosen Refund Account. Click 'Create Return' (Alt+S).",
        ur: "دائیں جانب کل واپسی کی رقم چیک کریں اور 'Settlement Outcome' میں سے ایک طریقہ منتخب کریں: (1) 'Adjust Customer Ledger (Credit Note)' — گاہک کے ادھار کھاتے سے رقم کم کرنے کے لیے؛ یا (2) 'Instant Refund (Cash / Bank / Wallet)' — گلے یا بینک سے فوری نقد رقم واپس کرنے کے لیے۔ آخر میں 'Create Return' (Alt+S) دبائیں۔",
      },
      checkpoint: {
        en: "Note: Walk-in Customer returns require 'Instant Refund' since Walk-in does not maintain a credit ledger.",
        ur: "نوٹ: Walk-in گاہک کے لیے 'Instant Refund' منتخب کریں کیونکہ اس کا ادھار کھاتہ نہیں ہوتا۔",
      },
    },
  ].filter((st) => st.element || st.exactSelector || st.resolveTarget);
}

/**
 * 6. Dedicated 4-Step Walkthrough for Purchase Return Form (`PurchaseReturnForm.jsx`)
 * Routes: `/purchase-returns/create`, `/purchase-returns/:id/edit`
 */
function buildPurchaseReturnFormSteps(container, currentPath) {
  const isEdit = currentPath.includes("/edit");
  const screenLabel = {
    en: isEdit ? "Edit Purchase Return" : "Create Purchase Return Form",
    ur: isEdit ? "پرچیز ریٹرن میں ترمیم" : "پرچیز ریٹرن فارم (سپلائر کو مال واپسی)",
  };

  return [
    {
      step: 1,
      screen: currentPath,
      screenLabel,
      exactSelector: ".purchase-entry-banner",
      element: container?.querySelector(".purchase-entry-banner") || null,
      title: {
        en: "Purchase Return Header & Save Action (Alt+S)",
        ur: "پرچیز ریٹرن ہیڈر اور شارٹ کٹ (Alt+S)",
      },
      instruction: {
        en: "Use Purchase Return when sending near-expiry, expired, damaged, or excess stock back to a supplier/distributor. Press Alt+S anytime to save the return.",
        ur: "جب سپلائر یا ڈسٹری بیوٹر کو ایکسپائر، قریب ایکسپائری، خراب یا فالتو مال واپس بھیجنا ہو تو یہ پرچیز ریٹرن فارم استعمال کریں۔ محفوظ کرنے کا شارٹ کٹ Alt+S ہے۔",
      },
      observedInstruction: {
        en: "Use Purchase Return when sending near-expiry, expired, damaged, or excess stock back to a supplier/distributor. Press Alt+S anytime to save the return.",
        ur: "جب سپلائر یا ڈسٹری بیوٹر کو ایکسپائر، قریب ایکسپائری، خراب یا فالتو مال واپس بھیجنا ہو تو یہ پرچیز ریٹرن فارم استعمال کریں۔ محفوظ کرنے کا شارٹ کٹ Alt+S ہے۔",
      },
      checkpoint: {
        en: "Saving a Purchase Return immediately deducts the returned units from your batch inventory.",
        ur: "پرچیز ریٹرن محفوظ کرتے ہی واپس کیے گئے یونٹس آپ کے بیچ اسٹاک سے کم ہو جاتے ہیں۔",
      },
    },
    {
      step: 2,
      screen: currentPath,
      screenLabel,
      exactSelector: ".purchase-entry-details",
      element: container?.querySelector(".purchase-entry-details") || null,
      title: {
        en: "Supplier Selection, Optional Original Purchase Invoice (GRN) Link & Remarks",
        ur: "سپلائر کا انتخاب، اصل پرچیز بل (Purchase Invoice) لنک اور ریمارکس",
      },
      instruction: {
        en: "Select 'Supplier *', then optionally click 'Purchase Invoice (optional)' to load the exact batches, purchase prices, and returnable quantities from that GRN bill (or leave it blank for an Open Return from any in-stock batch). Enter the return reason (e.g., '3-Month Near Expiry Return') in 'Remarks'.",
        ur: "پہلے 'Supplier *' منتخب کریں، پھر چاہیں تو 'Purchase Invoice (optional)' پر کلک کر کے اصل پرچیز بل لوڈ کر لیں (یا اوپن ریٹرن کے لیے اسے خالی چھوڑ دیں)۔ 'Remarks' میں واپسی کی وجہ (مثلاً ایکسپائری واپسی) درج کریں۔",
      },
      observedInstruction: {
        en: "Select 'Supplier *', then optionally click 'Purchase Invoice (optional)' to load the exact batches, purchase prices, and returnable quantities from that GRN bill (or leave it blank for an Open Return from any in-stock batch). Enter the return reason (e.g., '3-Month Near Expiry Return') in 'Remarks'.",
        ur: "پہلے 'Supplier *' منتخب کریں، پھر چاہیں تو 'Purchase Invoice (optional)' پر کلک کر کے اصل پرچیز بل لوڈ کر لیں (یا اوپن ریٹرن کے لیے اسے خالی چھوڑ دیں)۔ 'Remarks' میں واپسی کی وجہ (مثلاً ایکسپائری واپسی) درج کریں۔",
      },
      checkpoint: {
        en: "Linking the original Purchase Invoice ensures you claim back the exact purchase cost and discount you were billed.",
        ur: "اصل پرچیز بل سلیکٹ کرنے سے وہی قیمتِ خرید اور ڈسکاؤنٹ خودکار لگ جاتا ہے جس پر مال خریدا گیا تھا۔",
      },
    },
    {
      step: 3,
      screen: currentPath,
      screenLabel,
      exactSelector: ".purchase-entry-items",
      element: container?.querySelector(".purchase-entry-items") || null,
      title: {
        en: "13-Column Purchase Return Table: Batch, Pack/Unit Return Qty & Purchase Cost",
        ur: "13 کالمز کا پرچیز ریٹرن ٹیبل: بیچ، پیک/یونٹ واپسی کی مقدار اور قیمتِ خرید",
      },
      instruction: {
        en: "For each item being returned, verify 'Product', 'PSize', 'Batch', 'Exp', and 'Returnable Qty' (or 'Avail.Q' in units). Enter the quantity being returned in 'Pack.Q' or 'Unit.Q' (both sync automatically), verify 'Purchase Price (Pack.P / Unit.P)' and 'Disc%', and check 'Sub Total'.",
        ur: "واپس بھیجے جانے والے ہر آئٹم کا بیچ، ایکسپائری اور موجودہ اسٹاک چیک کریں۔ واپسی کی مقدار 'Pack.Q' یا 'Unit.Q' میں لکھیں (دونوں خودکار سنک ہوتے ہیں) اور قیمتِ خرید ('Pack.P / Unit.P') چیک کریں۔",
      },
      observedInstruction: {
        en: "For each item being returned, verify 'Product', 'PSize', 'Batch', 'Exp', and 'Returnable Qty' (or 'Avail.Q' in units). Enter the quantity being returned in 'Pack.Q' or 'Unit.Q' (both sync automatically), verify 'Purchase Price (Pack.P / Unit.P)' and 'Disc%', and check 'Sub Total'.",
        ur: "واپس بھیجے جانے والے ہر آئٹم کا بیچ، ایکسپائری اور موجودہ اسٹاک چیک کریں۔ واپسی کی مقدار 'Pack.Q' یا 'Unit.Q' میں لکھیں (دونوں خودکار سنک ہوتے ہیں) اور قیمتِ خرید ('Pack.P / Unit.P') چیک کریں۔",
      },
      checkpoint: {
        en: "In Open Return mode, 'Return Qty (Unit.Q)' cannot exceed the batch's currently available units ('Avail.Q').",
        ur: "واپسی کی مقدار بیچ میں موجود کل اسٹاک (Avail.Q) سے زیادہ نہیں ہو سکتی۔",
      },
    },
    {
      step: 4,
      screen: currentPath,
      screenLabel,
      exactSelector: ".purchase-entry-footer",
      element: container?.querySelector(".purchase-entry-footer") || null,
      title: {
        en: "Return Totals & Settlement Outcome (Supplier Debit Note vs. Instant Refund)",
        ur: "ریٹرن فوٹر اور حساب کا طریقہ (سپلائر کھاتہ ایڈجسٹمنٹ یا نقد واپسی)",
      },
      instruction: {
        en: "In the bottom footer, verify Gross Total, Discount, Tax, and Net Total, then choose the 'Settlement Outcome': (1) 'Adjust Supplier Ledger (Debit Note)' — deducts this return amount from what you owe the supplier; or (2) 'Instant Refund (Cash / Bank / Wallet)' — records immediate cash/bank money received back into your chosen account. Click 'Create' (Alt+S).",
        ur: "نچلے فوٹر میں کل رقم چیک کریں اور 'Settlement Outcome' منتخب کریں: (1) 'Adjust Supplier Ledger (Debit Note)' — سپلائر کے واجب الادا کھاتے سے رقم کم کرنے کے لیے؛ یا (2) 'Instant Refund (Cash / Bank / Wallet)' — اگر سپلائر سے فوری نقد یا بینک میں رقم واپس ملی ہے تو متعلقہ اکاؤنٹ منتخب کریں اور 'Create' (Alt+S) دبائیں۔",
      },
      observedInstruction: {
        en: "In the bottom footer, verify Gross Total, Discount, Tax, and Net Total, then choose the 'Settlement Outcome': (1) 'Adjust Supplier Ledger (Debit Note)' — deducts this return amount from what you owe the supplier; or (2) 'Instant Refund (Cash / Bank / Wallet)' — records immediate cash/bank money received back into your chosen account. Click 'Create' (Alt+S).",
        ur: "نچلے فوٹر میں کل رقم چیک کریں اور 'Settlement Outcome' منتخب کریں: (1) 'Adjust Supplier Ledger (Debit Note)' — سپلائر کے واجب الادا کھاتے سے رقم کم کرنے کے لیے؛ یا (2) 'Instant Refund (Cash / Bank / Wallet)' — اگر سپلائر سے فوری نقد یا بینک میں رقم واپس ملی ہے تو متعلقہ اکاؤنٹ منتخب کریں اور 'Create' (Alt+S) دبائیں۔",
      },
      checkpoint: {
        en: "Accounting Impact: Inventory Asset decreases and either Accounts Payable (Debit Note) is reduced or Cash/Bank is debited.",
        ur: "اکاؤنٹنگ اثر: اسٹاک کم ہو جاتا ہے اور سپلائر کا بقایا کھاتہ کم یا کیش/بینک بیلنس بڑھ جاتا ہے۔",
      },
    },
  ].filter((st) => st.element || st.exactSelector || st.resolveTarget);
}

/**
 * 7. Dedicated Walkthrough for Purchase Orders (`PurchaseOrders.jsx` & `PurchaseOrder.jsx`)
 * Routes: `/purchase-orders/forecast`, `/purchase-orders/create`, `/purchase-orders/:id/edit`, `/purchase-orders/:id`, `/purchase-orders`
 */
function buildPurchaseOrderSteps(container, currentPath) {
  // Case A: Smart Reorder Forecast (`/purchase-orders/forecast`)
  if (currentPath === "/purchase-orders/forecast" || container?.querySelector(".purchase-order-filters")) {
    const screenLabel = {
      en: "Purchase Order Smart Reorder Forecast",
      ur: "سمارٹ ری آرڈر فورکاسٹ (Purchase Order Forecast)",
    };
    return [
      {
        step: 1,
        screen: currentPath,
        screenLabel,
        exactSelector: ".purchase-order-heading",
        element: container?.querySelector(".purchase-order-heading") || null,
        title: {
          en: "Smart Forecast Command Bar: Generate (Alt+G), Print Format & Create PO",
          ur: "سمارٹ فورکاسٹ ہیڈر: فورکاسٹ نکالیں (Alt+G)، پرنٹ فارمیٹ اور PO بنائیں",
        },
        instruction: {
          en: "Click 'Generate forecast' (Alt+G) to calculate suggested reorder quantities from your historical sales velocity. Toggle 'Exclude zero-price items', switch between 'A4' and 'Thermal' print formats, or click 'Create Order from Forecast' to turn the suggestions into a formal Purchase Order.",
          ur: "اپنی پچھلی سیلز کی رفتار کے مطابق مطلوبہ آرڈر مقدار نکالنے کے لیے 'Generate forecast' (Alt+G) پر کلک کریں۔ یہاں سے A4 یا Thermal پرنٹ منتخب کریں، یا ایک کلک سے باقاعدہ پرچیز آرڈر بنانے کے لیے 'Create Order from Forecast' دبائیں۔",
        },
        observedInstruction: {
          en: "Click 'Generate forecast' (Alt+G) to calculate suggested reorder quantities from your historical sales velocity. Toggle 'Exclude zero-price items', switch between 'A4' and 'Thermal' print formats, or click 'Create Order from Forecast' to turn the suggestions into a formal Purchase Order.",
          ur: "اپنی پچھلی سیلز کی رفتار کے مطابق مطلوبہ آرڈر مقدار نکالنے کے لیے 'Generate forecast' (Alt+G) پر کلک کریں۔ یہاں سے A4 یا Thermal پرنٹ منتخب کریں، یا ایک کلک سے باقاعدہ پرچیز آرڈر بنانے کے لیے 'Create Order from Forecast' دبائیں۔",
        },
      },
      {
        step: 2,
        screen: currentPath,
        screenLabel,
        exactSelector: ".purchase-order-filters",
        element: container?.querySelector(".purchase-order-filters") || null,
        title: {
          en: "Sales Velocity Parameters: Date Range, Projection Days, Safety Stock & Brand/Supplier",
          ur: "سیلز کی مدت، متوقع دن (Proj. Days)، سیفٹی اسٹاک اور برانڈ/سپلائر فلٹرز",
        },
        instruction: {
          en: "Set your historical sales window ('From' and 'To'), 'Proj. Days' (how many days of stock you want to cover), 'Safety' buffer packs, and 'MOQ' (Minimum Order Quantity). You can also filter by specific Brands or Suppliers before clicking Generate.",
          ur: "پچھلی سیلز کی تاریخ ('From' تا 'To')، اگلے کتنے دنوں کا اسٹاک چاہیے ('Proj. Days')، اضافی سیفٹی پیکس ('Safety') اور کم از کم آرڈر ('MOQ') مقرر کریں۔ آپ مخصوص برانڈ یا سپلائر کا فلٹر بھی لگا سکتے ہیں۔",
        },
        observedInstruction: {
          en: "Set your historical sales window ('From' and 'To'), 'Proj. Days' (how many days of stock you want to cover), 'Safety' buffer packs, and 'MOQ' (Minimum Order Quantity). You can also filter by specific Brands or Suppliers before clicking Generate.",
          ur: "پچھلی سیلز کی تاریخ ('From' تا 'To')، اگلے کتنے دنوں کا اسٹاک چاہیے ('Proj. Days')، اضافی سیفٹی پیکس ('Safety') اور کم از کم آرڈر ('MOQ') مقرر کریں۔ آپ مخصوص برانڈ یا سپلائر کا فلٹر بھی لگا سکتے ہیں۔",
        },
      },
      {
        step: 3,
        screen: currentPath,
        screenLabel,
        exactSelector: ".purchase-order-results",
        element: container?.querySelector(".purchase-order-results") || null,
        title: {
          en: "Forecast Results Table: Units Sold, Current Stock, Suggested Packs & Editable Order Packs",
          ur: "فورکاسٹ رزلٹ ٹیبل: فروخت شدہ یونٹس، موجودہ اسٹاک اور تجویز کردہ آرڈر پیکس",
        },
        instruction: {
          en: "Filter the generated results by Brand, Stock Status (Out of Stock / Low Stock), or 'Items to Order'. Inspect 'Units Sold', 'Stock (U)', and 'Suggested (P)', edit the 'Order Packs' input on any row as needed, and click 'Create Order from Forecast' at the top right!",
          ur: "حاصل شدہ فہرست میں ہر آئٹم کے فروخت شدہ یونٹس ('Units Sold')، موجودہ اسٹاک ('Stock U') اور تجویز کردہ پیکس ('Suggested P') دیکھیں۔ اپنی مرضی سے 'Order Packs' میں تبدیلی کریں اور اوپر 'Create Order from Forecast' دبا کر آرڈر بنا لیں۔",
        },
        observedInstruction: {
          en: "Filter the generated results by Brand, Stock Status (Out of Stock / Low Stock), or 'Items to Order'. Inspect 'Units Sold', 'Stock (U)', and 'Suggested (P)', edit the 'Order Packs' input on any row as needed, and click 'Create Order from Forecast' at the top right!",
          ur: "حاصل شدہ فہرست میں ہر آئٹم کے فروخت شدہ یونٹس ('Units Sold')، موجودہ اسٹاک ('Stock U') اور تجویز کردہ پیکس ('Suggested P') دیکھیں۔ اپنی مرضی سے 'Order Packs' میں تبدیلی کریں اور اوپر 'Create Order from Forecast' دبا کر آرڈر بنا لیں۔",
        },
      },
    ].filter((st) => st.element || st.exactSelector || st.resolveTarget);
  }

  // Case B: PO Create / Edit Form (`/purchase-orders/create`, `/purchase-orders/:id/edit`, or `.purchase-order-entry`)
  if (
    currentPath === "/purchase-orders/create" ||
    currentPath.endsWith("/edit") ||
    container?.querySelector(".purchase-order-entry")
  ) {
    const screenLabel = {
      en: "Purchase Order Create / Edit Form",
      ur: "پرچیز آرڈر (PO) فارم",
    };
    return [
      {
        step: 1,
        screen: currentPath,
        screenLabel,
        exactSelector: ".purchase-entry-banner",
        element: container?.querySelector(".purchase-entry-banner") || null,
        title: {
          en: "Purchase Order Header: Smart Forecast (Alt+N), Add Product & All Orders",
          ur: "پرچیز آرڈر ہیڈر: سمارٹ فورکاسٹ (Alt+N)، نئی پروڈکٹ اور تمام آرڈرز",
        },
        instruction: {
          en: "Prepare a formal Purchase Order (PO) for your supplier. From this header you can jump to 'New Forecast' (Alt+N), register a new product via 'Add Product', or view 'All Orders'.",
          ur: "سپلائر کے لیے پرچیز آرڈر (PO) تیار کریں۔ اس ہیڈر سے آپ سمارٹ فورکاسٹ (Alt+N) کھول سکتے ہیں، نئی پروڈکٹ بنا سکتے ہیں یا تمام آرڈرز کی فہرست دیکھ سکتے ہیں۔",
        },
        observedInstruction: {
          en: "Prepare a formal Purchase Order (PO) for your supplier. From this header you can jump to 'New Forecast' (Alt+N), register a new product via 'Add Product', or view 'All Orders'.",
          ur: "سپلائر کے لیے پرچیز آرڈر (PO) تیار کریں۔ اس ہیڈر سے آپ سمارٹ فورکاسٹ (Alt+N) کھول سکتے ہیں، نئی پروڈکٹ بنا سکتے ہیں یا تمام آرڈرز کی فہرست دیکھ سکتے ہیں۔",
        },
        checkpoint: {
          en: "Important: Saving a Purchase Order does NOT increase stock or supplier payable until you click 'Receive Delivery' when goods arrive.",
          ur: "یاد رکھیں: پرچیز آرڈر محفوظ کرنے سے ابھی اسٹاک یا سپلائر کھاتے میں اضافہ نہیں ہوتا جب تک مال وصول نہ کیا جائے۔",
        },
      },
      {
        step: 2,
        screen: currentPath,
        screenLabel,
        exactSelector: ".purchase-entry-details",
        element: container?.querySelector(".purchase-entry-details") || null,
        title: {
          en: "Order Date, Expected Receiving Date *, Reference, Supplier * & Notes",
          ur: "آرڈر کی تاریخ، متوقع وصولی کی تاریخ، سپلائر اور نوٹس",
        },
        instruction: {
          en: "Set the PO 'Date' and required 'Expected Receiving Date *', select your 'Supplier *', and optionally add a 'Reference' or supplier delivery 'Notes'.",
          ur: "آرڈر کی تاریخ ('Date')، مال پہنچنے کی متوقع تاریخ ('Expected Receiving Date *') اور اپنا 'Supplier *' منتخب کریں، اور کوئی ہدایت ہو تو 'Notes' میں لکھیں۔",
        },
        observedInstruction: {
          en: "Set the PO 'Date' and required 'Expected Receiving Date *', select your 'Supplier *', and optionally add a 'Reference' or supplier delivery 'Notes'.",
          ur: "آرڈر کی تاریخ ('Date')، مال پہنچنے کی متوقع تاریخ ('Expected Receiving Date *') اور اپنا 'Supplier *' منتخب کریں، اور کوئی ہدایت ہو تو 'Notes' میں لکھیں۔",
        },
      },
      {
        step: 3,
        screen: currentPath,
        screenLabel,
        exactSelector: ".purchase-order-form-items",
        element: container?.querySelector(".purchase-order-form-items") || null,
        title: {
          en: "PO Line Items Table: Product, Order Packs, Pack Purchase Price, Bonus & Discount %",
          ur: "آرڈر آئٹمز ٹیبل: پروڈکٹ، آرڈر پیکس، قیمتِ خرید، بونس اور ڈسکاؤنٹ",
        },
        instruction: {
          en: "Search each product in the table and enter 'Order Packs', 'Pack Purchase Price', optional 'Pack Bonus' / 'Unit Bonus', and 'Discount %'. You can also drag the '⠿' handle to reorder rows by brand.",
          ur: "ٹیبل میں پروڈکٹس سرچ کریں اور مطلوبہ ڈبوں کی تعداد ('Order Packs')، فی ڈبہ قیمتِ خرید ('Pack Purchase Price')، متوقع بونس اور ڈسکاؤنٹ درج کریں۔",
        },
        observedInstruction: {
          en: "Search each product in the table and enter 'Order Packs', 'Pack Purchase Price', optional 'Pack Bonus' / 'Unit Bonus', and 'Discount %'. You can also drag the '⠿' handle to reorder rows by brand.",
          ur: "ٹیبل میں پروڈکٹس سرچ کریں اور مطلوبہ ڈبوں کی تعداد ('Order Packs')، فی ڈبہ قیمتِ خرید ('Pack Purchase Price')، متوقع بونس اور ڈسکاؤنٹ درج کریں۔",
        },
      },
      {
        step: 4,
        screen: currentPath,
        screenLabel,
        exactSelector: ".purchase-entry-footer",
        element: container?.querySelector(".purchase-entry-footer") || null,
        title: {
          en: "PO Footer: Apply Saved Brand Order, Total Packs/Amount & Save (Alt+S)",
          ur: "پرچیز آرڈر فوٹر: محفوظ شدہ برانڈ ترتیب لگائیں اور آرڈر سیو کریں (Alt+S)",
        },
        instruction: {
          en: "Click 'Apply Saved Order' to sort rows by the supplier's saved brand sequence, review total Items, Packs, Units, and Order Total, and click 'Save Purchase Order' (Alt+S).",
          ur: "سپلائر کی محفوظ شدہ برانڈ ترتیب لگانے کے لیے 'Apply Saved Order' دبائیں، کل پیکس اور رقم چیک کریں، اور 'Save Purchase Order' (Alt+S) پر کلک کریں۔",
        },
        observedInstruction: {
          en: "Click 'Apply Saved Order' to sort rows by the supplier's saved brand sequence, review total Items, Packs, Units, and Order Total, and click 'Save Purchase Order' (Alt+S).",
          ur: "سپلائر کی محفوظ شدہ برانڈ ترتیب لگانے کے لیے 'Apply Saved Order' دبائیں، کل پیکس اور رقم چیک کریں، اور 'Save Purchase Order' (Alt+S) پر کلک کریں۔",
        },
      },
    ].filter((st) => st.element || st.exactSelector || st.resolveTarget);
  }

  // Case C: PO Show / Receive View (`/purchase-orders/:id` when `.purchase-order-show` is active)
  if (container?.querySelector(".purchase-order-show")) {
    const screenLabel = {
      en: "Purchase Order Details & Receive Delivery",
      ur: "پرچیز آرڈر کی تفصیل اور مال کی وصولی (Receive Delivery)",
    };
    return [
      {
        step: 1,
        screen: currentPath,
        screenLabel,
        exactSelector: ".purchase-entry-banner",
        element: container?.querySelector(".purchase-entry-banner") || null,
        title: {
          en: "PO Header & 1-Click 'Receive Delivery' (Convert to Purchase Invoice)",
          ur: "پرچیز آرڈر ہیڈر اور 'Receive Delivery' (پرچیز انوائس میں تبدیلی)",
        },
        instruction: {
          en: "When the supplier delivers the ordered goods, click 'Receive Delivery' at the top right to record received quantities, batch numbers, and expiry dates and automatically generate a posted Purchase Invoice (GRN).",
          ur: "جب سپلائر آرڈر کیا گیا مال پہنچا دے تو اوپر دائیں جانب 'Receive Delivery' بٹن دبائیں تاکہ بیچ اور ایکسپائری درج کر کے اسے پرچیز انوائس (GRN) میں تبدیل کیا جا سکے۔",
        },
        observedInstruction: {
          en: "When the supplier delivers the ordered goods, click 'Receive Delivery' at the top right to record received quantities, batch numbers, and expiry dates and automatically generate a posted Purchase Invoice (GRN).",
          ur: "جب سپلائر آرڈر کیا گیا مال پہنچا دے تو اوپر دائیں جانب 'Receive Delivery' بٹن دبائیں تاکہ بیچ اور ایکسپائری درج کر کے اسے پرچیز انوائس (GRN) میں تبدیل کیا جا سکے۔",
        },
      },
      {
        step: 2,
        screen: currentPath,
        screenLabel,
        exactSelector: ".purchase-entry-details",
        element: container?.querySelector(".purchase-entry-details") || null,
        title: {
          en: "PO Metadata: Supplier, Expected Receiving Date & Order Status",
          ur: "پرچیز آرڈر کی معلومات: سپلائر، متوقع تاریخ اور اسٹیٹس",
        },
        instruction: {
          en: "Inspect the PO Date, Expected Receiving Date, Supplier, Reference, and live Fulfillment Status (Draft / Sent / Partially Received / Received / Cancelled).",
          ur: "یہاں آرڈر کی تاریخ، متوقع وصولی کی تاریخ، سپلائر کا نام اور آرڈر کا موجودہ اسٹیٹس چیک کریں۔",
        },
        observedInstruction: {
          en: "Inspect the PO Date, Expected Receiving Date, Supplier, Reference, and live Fulfillment Status (Draft / Sent / Partially Received / Received / Cancelled).",
          ur: "یہاں آرڈر کی تاریخ، متوقع وصولی کی تاریخ، سپلائر کا نام اور آرڈر کا موجودہ اسٹیٹس چیک کریں۔",
        },
      },
      {
        step: 3,
        screen: currentPath,
        screenLabel,
        exactSelector: ".purchase-order-form-items",
        element: container?.querySelector(".purchase-order-form-items") || null,
        title: {
          en: "Ordered vs. Received vs. Remaining Units Table & Receipt History",
          ur: "آرڈر کردہ بمقابلہ وصول شدہ اور بقایا یونٹس کا ٹیبل",
        },
        instruction: {
          en: "Track exact fulfillment per product: compare Ordered Packs/Units against Received Units and Remaining Units, and view linked Purchase Invoices in the Receipt History section below.",
          ur: "ہر پروڈکٹ کے آرڈر کردہ یونٹس، وصول شدہ یونٹس اور بقایا یونٹس کا موازنہ کریں اور نیچے منسلک پرچیز بلوں کی ہسٹری دیکھیں۔",
        },
        observedInstruction: {
          en: "Track exact fulfillment per product: compare Ordered Packs/Units against Received Units and Remaining Units, and view linked Purchase Invoices in the Receipt History section below.",
          ur: "ہر پروڈکٹ کے آرڈر کردہ یونٹس، وصول شدہ یونٹس اور بقایا یونٹس کا موازنہ کریں اور نیچے منسلک پرچیز بلوں کی ہسٹری دیکھیں۔",
        },
      },
      {
        step: 4,
        screen: currentPath,
        screenLabel,
        exactSelector: ".purchase-entry-footer",
        element: container?.querySelector(".purchase-entry-footer") || null,
        title: {
          en: "PO Actions Footer: Receive Order, Print Barcodes, Share PDF & Print Order",
          ur: "آرڈر فوٹر بٹنز: مال وصول کریں، بارکوڈ پرنٹ کریں، شیئر اور پرنٹ کریں",
        },
        instruction: {
          en: "Use the bottom action bar to Edit or Cancel a pending PO, Receive Order into stock, Print Barcodes for received items, Share / Email the PO PDF to your supplier, or Print Order.",
          ur: "نچلے بار سے آرڈر میں ترمیم کریں، مال وصول کریں (Receive Order)، بارکوڈ پرنٹ کریں، یا سپلائر کو PDF واٹس ایپ/ای میل اور پرنٹ بھیجیں۔",
        },
        observedInstruction: {
          en: "Use the bottom action bar to Edit or Cancel a pending PO, Receive Order into stock, Print Barcodes for received items, Share / Email the PO PDF to your supplier, or Print Order.",
          ur: "نچلے بار سے آرڈر میں ترمیم کریں، مال وصول کریں (Receive Order)، بارکوڈ پرنٹ کریں، یا سپلائر کو PDF واٹس ایپ/ای میل اور پرنٹ بھیجیں۔",
        },
      },
    ].filter((st) => st.element || st.exactSelector || st.resolveTarget);
  }

  return null;
}

/**
 * 8. Dedicated 4-Step Walkthrough for Sale Invoice Show & Purchase Invoice Show (`SaleInvoice/Show.jsx`, `PurchaseInvoice/Show.jsx`)
 * Routes: `/sale-invoices/:id`, `/wholesale-invoices/:id`, `/purchase-invoices/:id`
 */
function buildInvoiceShowSteps(container, currentPath) {
  const isPurchase = currentPath.startsWith("/purchase-invoices/");
  const isWholesale = currentPath.startsWith("/wholesale-invoices/");
  const screenLabel = {
    en: isPurchase
      ? "Purchase Invoice (GRN) View"
      : isWholesale
      ? "Wholesale Invoice View"
      : "Sale Invoice View",
    ur: isPurchase
      ? "پرچیز انوائس (GRN) کی تفصیل"
      : isWholesale
      ? "ہول سیل انوائس کی تفصیل"
      : "سیل انوائس کی تفصیل",
  };

  return [
    {
      step: 1,
      screen: currentPath,
      screenLabel,
      exactSelector: ".sale-entry-banner, .purchase-show-banner",
      resolveTarget: () => {
        const c = getActiveWorkspaceContainer();
        return (
          c?.querySelector(".sale-entry-banner") ||
          c?.querySelector(".purchase-show-banner")
        );
      },
      title: {
        en: "Document Command Bar: Search (Alt+F), Print (Alt+P), Share PDF, Payment, History & Void",
        ur: "بل کمانڈ بار: سرچ (Alt+F)، پرنٹ (Alt+P)، شیئر، پیمنٹ، ہسٹری اور کینسل (Void)",
      },
      instruction: {
        en: isPurchase
          ? "From this top toolbar you can Search & jump to another Purchase Invoice (Alt+F), Print (Alt+P), Share PDF, click 'Pay Supplier' if a credit balance is remaining, inspect Audit History, Void/Reverse the invoice safely, Edit (Alt+E), Delete (Alt+D), or start a New invoice (Alt+N)."
          : "From this top toolbar you can Search & jump to another Sale Invoice (Alt+F), Print Receipt/A4 (Alt+P), Share PDF on WhatsApp/Email, print an unpriced 'Delivery Challan', click 'Receive Payment' if Udhar balance is due, inspect Audit History, Void/Reverse the bill, or Edit (Alt+E).",
        ur: isPurchase
          ? "اس ٹاپ بار سے آپ کوئی دوسرا بل سرچ کر سکتے ہیں (Alt+F)، پرنٹ نکال سکتے ہیں (Alt+P)، بقایا رقم کی ادائیگی کے لیے 'Pay Supplier' دبا سکتے ہیں، بل کی ہسٹری دیکھ سکتے ہیں، یا بل کو ریورس (Void) اور ایڈٹ (Alt+E) کر سکتے ہیں۔"
          : "اس ٹاپ بار سے آپ کوئی دوسرا بل سرچ کر سکتے ہیں (Alt+F)، پرنٹ نکال سکتے ہیں (Alt+P)، واٹس ایپ پر PDF شیئر کر سکتے ہیں، ڈلیوری چالان نکال سکتے ہیں، بقایا ادھار وصول کرنے کے لیے 'Receive Payment' دبا سکتے ہیں، یا بل کو Void اور ایڈٹ (Alt+E) کر سکتے ہیں۔",
      },
      observedInstruction: {
        en: isPurchase
          ? "From this top toolbar you can Search & jump to another Purchase Invoice (Alt+F), Print (Alt+P), Share PDF, click 'Pay Supplier' if a credit balance is remaining, inspect Audit History, Void/Reverse the invoice safely, Edit (Alt+E), Delete (Alt+D), or start a New invoice (Alt+N)."
          : "From this top toolbar you can Search & jump to another Sale Invoice (Alt+F), Print Receipt/A4 (Alt+P), Share PDF on WhatsApp/Email, print an unpriced 'Delivery Challan', click 'Receive Payment' if Udhar balance is due, inspect Audit History, Void/Reverse the bill, or Edit (Alt+E).",
        ur: isPurchase
          ? "اس ٹاپ بار سے آپ کوئی دوسرا بل سرچ کر سکتے ہیں (Alt+F)، پرنٹ نکال سکتے ہیں (Alt+P)، بقایا رقم کی ادائیگی کے لیے 'Pay Supplier' دبا سکتے ہیں، بل کی ہسٹری دیکھ سکتے ہیں، یا بل کو ریورس (Void) اور ایڈٹ (Alt+E) کر سکتے ہیں۔"
          : "اس ٹاپ بار سے آپ کوئی دوسرا بل سرچ کر سکتے ہیں (Alt+F)، پرنٹ نکال سکتے ہیں (Alt+P)، واٹس ایپ پر PDF شیئر کر سکتے ہیں، ڈلیوری چالان نکال سکتے ہیں، بقایا ادھار وصول کرنے کے لیے 'Receive Payment' دبا سکتے ہیں، یا بل کو Void اور ایڈٹ (Alt+E) کر سکتے ہیں۔",
      },
    },
    {
      step: 2,
      screen: currentPath,
      screenLabel,
      exactSelector: ".sale-entry-details, .purchase-show-details",
      resolveTarget: () => {
        const c = getActiveWorkspaceContainer();
        return (
          c?.querySelector(".sale-entry-details") ||
          c?.querySelector(".purchase-show-details")
        );
      },
      title: {
        en: isPurchase
          ? "Supplier, Posted #, Paper Invoice # & Bill Verification Details"
          : "Customer, Posted #, Date, Doctor/Patient & Remarks",
        ur: isPurchase
          ? "سپلائر، پوسٹڈ نمبر، کاغذی بل نمبر اور تاریخ کی تفصیل"
          : "گاہک کا نام، بل نمبر، تاریخ، ڈاکٹر/مریض اور ریمارکس",
      },
      instruction: {
        en: isPurchase
          ? "Review the Posted #, Date, Supplier Name, Supplier's paper Invoice #, printed Bill Amount, calculated Difference, and Remarks."
          : "Review the Posted #, Date, Customer Name, Doctor & Patient names, Remarks, and total billed item/unit counters.",
        ur: isPurchase
          ? "یہاں بل کا پوسٹڈ نمبر، تاریخ، سپلائر کا نام، سپلائر کا بل نمبر اور بل کی رقم کا فرق دیکھیں۔"
          : "یہاں بل کا نمبر، تاریخ، گاہک کا نام، ڈاکٹر اور مریض کا نام اور کل آئٹمز کی تعداد دیکھیں۔",
      },
      observedInstruction: {
        en: isPurchase
          ? "Review the Posted #, Date, Supplier Name, Supplier's paper Invoice #, printed Bill Amount, calculated Difference, and Remarks."
          : "Review the Posted #, Date, Customer Name, Doctor & Patient names, Remarks, and total billed item/unit counters.",
        ur: isPurchase
          ? "یہاں بل کا پوسٹڈ نمبر، تاریخ، سپلائر کا نام، سپلائر کا بل نمبر اور بل کی رقم کا فرق دیکھیں۔"
          : "یہاں بل کا نمبر، تاریخ، گاہک کا نام، ڈاکٹر اور مریض کا نام اور کل آئٹمز کی تعداد دیکھیں۔",
      },
    },
    {
      step: 3,
      screen: currentPath,
      screenLabel,
      exactSelector: ".sale-entry-items, .purchase-show-items",
      resolveTarget: () => {
        const c = getActiveWorkspaceContainer();
        return (
          c?.querySelector(".sale-entry-items") ||
          c?.querySelector(".purchase-show-items")
        );
      },
      title: {
        en: "Billed Line-Items, Batches, Quantities, Bonus & Subtotals Table",
        ur: "بل میں شامل تمام آئٹمز، بیچ، مقدار، بونس اور ٹوٹل کا ٹیبل",
      },
      instruction: {
        en: "Inspect every line item on this invoice including Product Name, Pack Size, Batch Number, Expiry Date, Billed Packs/Units, Bonus Units, Price, Discount %, Margin %, and Line Sub Total.",
        ur: "اس ٹیبل میں بل کے تمام آئٹمز، ان کا بیچ نمبر، ایکسپائری، مقدار، بونس یونٹس، قیمت، ڈسکاؤنٹ اور ذیلی ٹوٹل تفصیل سے دیکھیں۔",
      },
      observedInstruction: {
        en: "Inspect every line item on this invoice including Product Name, Pack Size, Batch Number, Expiry Date, Billed Packs/Units, Bonus Units, Price, Discount %, Margin %, and Line Sub Total.",
        ur: "اس ٹیبل میں بل کے تمام آئٹمز، ان کا بیچ نمبر، ایکسپائری، مقدار، بونس یونٹس، قیمت، ڈسکاؤنٹ اور ذیلی ٹوٹل تفصیل سے دیکھیں۔",
      },
    },
    {
      step: 4,
      screen: currentPath,
      screenLabel,
      exactSelector: ".sale-entry-summary, .purchase-show-footer, .purchase-entry-footer",
      resolveTarget: () => {
        const c = getActiveWorkspaceContainer();
        return (
          c?.querySelector(".sale-entry-summary") ||
          c?.querySelector(".purchase-show-footer") ||
          c?.querySelector(".purchase-entry-footer")
        );
      },
      title: {
        en: "Financial Summary: Gross, Discount, Tax, Paid/Received & Remaining Balance",
        ur: "مالیاتی خلاصہ: کل بل، ڈسکاؤنٹ، ٹیکس، وصولی/ادائیگی اور بقایا بیلنس",
      },
      instruction: {
        en: "Review the complete financial summary including Gross Amount, Discount, Tax, Net Total, amount Paid/Received, and any Remaining Balance on this invoice.",
        ur: "یہاں بل کی مجموعی رقم، ڈسکاؤنٹ، ٹیکس، خالص ٹوٹل، ادا یا وصول شدہ رقم اور بقایا واجب الادا بیلنس چیک کریں۔",
      },
      observedInstruction: {
        en: "Review the complete financial summary including Gross Amount, Discount, Tax, Net Total, amount Paid/Received, and any Remaining Balance on this invoice.",
        ur: "یہاں بل کی مجموعی رقم، ڈسکاؤنٹ، ٹیکس، خالص ٹوٹل، ادا یا وصول شدہ رقم اور بقایا واجب الادا بیلنس چیک کریں۔",
      },
    },
  ].filter((st) => st.element || st.exactSelector || st.resolveTarget);
}

/**
 * 9. Dedicated 3-Step Walkthrough for Stock Adjustment Form (`StockAdjustmentForm.jsx`)
 * Routes: `/stock-adjustments/create`, `/stock-adjustments/:id/edit`
 */
function buildStockAdjustmentFormSteps(container, currentPath) {
  const isEdit = currentPath.includes("/edit");
  const screenLabel = {
    en: isEdit ? "Edit Stock Adjustment" : "Create Stock Adjustment Form",
    ur: isEdit ? "اسٹاک ایڈجسٹمنٹ میں ترمیم" : "اسٹاک ایڈجسٹمنٹ فارم",
  };

  return [
    {
      step: 1,
      screen: currentPath,
      screenLabel,
      exactSelector: ".stock-adjustment-header",
      element: container?.querySelector(".stock-adjustment-header") || null,
      title: {
        en: "Adjustment Header: Posted #, Date & Audit Reason ('Note *')",
        ur: "ایڈجسٹمنٹ ہیڈر: پوسٹڈ نمبر، تاریخ اور ایڈجسٹمنٹ کی وجہ ('Note *')",
      },
      instruction: {
        en: "Verify the 'Posted Date' and enter a clear audit reason in 'Note (Reason) *' (e.g., 'Annual Physical Stock Audit', 'Opening Stock Entry', or 'Damaged/Broken Vial Write-off').",
        ur: "ایڈجسٹمنٹ کی تاریخ چیک کریں اور 'Note (Reason) *' میں اسٹاک کم یا زیادہ کرنے کی وجہ لازمی لکھیں (مثلاً سالانہ فزیکل آڈٹ، اوپننگ اسٹاک، یا ٹوٹ پھوٹ)۔",
      },
      observedInstruction: {
        en: "Verify the 'Posted Date' and enter a clear audit reason in 'Note (Reason) *' (e.g., 'Annual Physical Stock Audit', 'Opening Stock Entry', or 'Damaged/Broken Vial Write-off').",
        ur: "ایڈجسٹمنٹ کی تاریخ چیک کریں اور 'Note (Reason) *' میں اسٹاک کم یا زیادہ کرنے کی وجہ لازمی لکھیں (مثلاً سالانہ فزیکل آڈٹ، اوپننگ اسٹاک، یا ٹوٹ پھوٹ)۔",
      },
    },
    {
      step: 2,
      screen: currentPath,
      screenLabel,
      exactSelector: ".stock-adjustment-items",
      element: container?.querySelector(".stock-adjustment-items") || null,
      title: {
        en: "Adjustment Items Table: Available Qty vs. Physical 'Actual Qty *' & Live Diff",
        ur: "ایڈجسٹمنٹ ٹیبل: سسٹم اسٹاک ('Available Qty') بمقابلہ اصل اسٹاک ('Actual Qty *')",
      },
      instruction: {
        en: "Search the 'Product', select or enter the 'Batch' and 'Expiry', and check the system's current 'Available Qty'. Enter the true physical count in 'Actual Qty *'—the system automatically calculates 'Diff' (+ gain in green or − loss in red) and 'Worth Adjusted' based on Unit Cost!",
        ur: "ٹیبل میں پروڈکٹ سرچ کریں، بیچ اور ایکسپائری منتخب کریں اور سسٹم کا موجودہ اسٹاک ('Available Qty') دیکھیں۔ اب شیلف پر موجود حقیقی تعداد 'Actual Qty *' میں لکھیں—سسٹم خودکار طور پر فرق ('Diff' جمع یا منفی) اور اس کی مالیت ('Worth Adjusted') نکال دے گا!",
      },
      observedInstruction: {
        en: "Search the 'Product', select or enter the 'Batch' and 'Expiry', and check the system's current 'Available Qty'. Enter the true physical count in 'Actual Qty *'—the system automatically calculates 'Diff' (+ gain in green or − loss in red) and 'Worth Adjusted' based on Unit Cost!",
        ur: "ٹیبل میں پروڈکٹ سرچ کریں، بیچ اور ایکسپائری منتخب کریں اور سسٹم کا موجودہ اسٹاک ('Available Qty') دیکھیں۔ اب شیلف پر موجود حقیقی تعداد 'Actual Qty *' میں لکھیں—سسٹم خودکار طور پر فرق ('Diff' جمع یا منفی) اور اس کی مالیت ('Worth Adjusted') نکال دے گا!",
      },
      checkpoint: {
        en: "Use the arrows (↑/↓) or Enter key inside 'Actual Qty *' to move rapidly across rows.",
        ur: "تیزی سے اگلی لائن پر جانے کے لیے Enter یا ↑/↓ ایرو بٹن دبائیں۔",
      },
    },
    {
      step: 3,
      screen: currentPath,
      screenLabel,
      exactSelector: ".stock-adjustment-footer",
      element: container?.querySelector(".stock-adjustment-footer") || null,
      title: {
        en: "Total Worth Adjusted & Save Adjustment (Alt+S)",
        ur: "کل ایڈجسٹ شدہ مالیت اور محفوظ کرنے کا بٹن (Alt+S)",
      },
      instruction: {
        en: "Review 'Total Worth Adjusted' at the bottom right and click 'Create Adjustment' (Alt+S) to update batch inventory and post the Inventory Gain/Shrinkage journal entry.",
        ur: "نیچے کل ایڈجسٹ شدہ مالیت ('Total Worth Adjusted') چیک کریں اور اسٹاک و جنرل لیجر اپڈیٹ کرنے کے لیے 'Create Adjustment' (Alt+S) دبائیں۔",
      },
      observedInstruction: {
        en: "Review 'Total Worth Adjusted' at the bottom right and click 'Create Adjustment' (Alt+S) to update batch inventory and post the Inventory Gain/Shrinkage journal entry.",
        ur: "نیچے کل ایڈجسٹ شدہ مالیت ('Total Worth Adjusted') چیک کریں اور اسٹاک و جنرل لیجر اپڈیٹ کرنے کے لیے 'Create Adjustment' (Alt+S) دبائیں۔",
      },
    },
  ].filter((st) => st.element || st.exactSelector || st.resolveTarget);
}

/**
 * 10. Dedicated 4-Step Walkthrough for Product Create/Edit Form (`ProductForm.jsx`)
 * Routes: `/products/create`, `/products/:id/edit`
 */
function buildProductFormSteps(container, currentPath) {
  const isEdit = currentPath.includes("/edit");
  const screenLabel = {
    en: isEdit ? "Edit Product Form" : "Add New Product Form",
    ur: isEdit ? "پروڈکٹ فارم میں ترمیم" : "نئی پروڈکٹ شامل کرنے کا فارم",
  };

  return [
    {
      step: 1,
      screen: currentPath,
      screenLabel,
      resolveTarget: () => {
        const c = getActiveWorkspaceContainer();
        const nameInput = c?.querySelector("#product-name");
        return nameInput?.closest(".grid") || nameInput;
      },
      title: {
        en: "Product Identity: Name, Generic Formulation/Salt, Pack Size, Barcode & Rack",
        ur: "پروڈکٹ کی شناخت: نام، فارمولا (Salt)، پیک سائز، بارکوڈ اور ریک نمبر",
      },
      instruction: {
        en: "Enter 'Name *', 'Formulation (Generic Salt)' (enables 1-click Substitute Medicine matching in POS!), 'Pack Size' (units per box, e.g., 30 tablets), 'Product Code / SKU' & 'Barcode', 'Storage Location' (Room/Fridge), 'Rack' location, and 'Narcotic / Controlled' flag.",
        ur: "یہاں پروڈکٹ کا نام ('Name *')، فارمولا ('Formulation' — جس سے POS میں متبادل دوائی ملتی ہے)، ڈبے میں گولیوں/یونٹس کی تعداد ('Pack Size')، بارکوڈ، اسٹوریج (نارمل یا فریج) اور ریک نمبر درج کریں۔",
      },
      observedInstruction: {
        en: "Enter 'Name *', 'Formulation (Generic Salt)' (enables 1-click Substitute Medicine matching in POS!), 'Pack Size' (units per box, e.g., 30 tablets), 'Product Code / SKU' & 'Barcode', 'Storage Location' (Room/Fridge), 'Rack' location, and 'Narcotic / Controlled' flag.",
        ur: "یہاں پروڈکٹ کا نام ('Name *')، فارمولا ('Formulation' — جس سے POS میں متبادل دوائی ملتی ہے)، ڈبے میں گولیوں/یونٹس کی تعداد ('Pack Size')، بارکوڈ، اسٹوریج (نارمل یا فریج) اور ریک نمبر درج کریں۔",
      },
    },
    {
      step: 2,
      screen: currentPath,
      screenLabel,
      resolveTarget: () => {
        const c = getActiveWorkspaceContainer();
        const catEl = c?.querySelector("#product-category");
        return catEl?.closest(".grid") || catEl;
      },
      title: {
        en: "Category, Brand & Primary Supplier Classification",
        ur: "کیٹیگری، برانڈ (کمپنی) اور پرائمری سپلائر کا انتخاب",
      },
      instruction: {
        en: "Assign the product's 'Category', 'Brand' (manufacturer/company), and primary 'Supplier'. If a Category, Brand, or Supplier doesn't exist yet, you can create it right from the dropdown!",
        ur: "پروڈکٹ کی کیٹیگری ('Category')، کمپنی/برانڈ ('Brand') اور سپلائر ('Supplier') منتخب کریں۔",
      },
      observedInstruction: {
        en: "Assign the product's 'Category', 'Brand' (manufacturer/company), and primary 'Supplier'. If a Category, Brand, or Supplier doesn't exist yet, you can create it right from the dropdown!",
        ur: "پروڈکٹ کی کیٹیگری ('Category')، کمپنی/برانڈ ('Brand') اور سپلائر ('Supplier') منتخب کریں۔",
      },
    },
    {
      step: 3,
      screen: currentPath,
      screenLabel,
      resolveTarget: () => {
        const c = getActiveWorkspaceContainer();
        const priceEl = c?.querySelector("#product-pack_purchase_price");
        return (
          priceEl?.closest(".rounded-xl, .border") ||
          priceEl?.closest(".grid") ||
          priceEl
        );
      },
      title: {
        en: "Pricing & Margin Engine: Pack vs. Unit Cost/MRP, Wholesale Rates & Max Discount %",
        ur: "قیمتوں کا حساب: پیک اور یونٹ قیمتِ خرید و فروخت، ہول سیل ریٹ اور ڈسکاؤنٹ حد",
      },
      instruction: {
        en: "Enter 'Pack Purchase Price' and 'Pack Sale Price'—the system automatically divides by Pack Size to calculate 'Unit Purchase Price', 'Unit Sale Price', and live 'Margin %'! You can also set Wholesale Pack/Unit Prices, 'Max Discount %' allowed at POS, 'Reorder Level (Packs)', and 'Expiry Alert (Days)'.",
        ur: "ڈبے کی قیمتِ خرید ('Pack Purchase Price') اور قیمتِ فروخت ('Pack Sale Price') لکھیں—سسٹم پیک سائز کے مطابق ایک گولی/یونٹ کی قیمت اور منافع ('Margin %') خودکار نکال لے گا! یہاں سے ہول سیل ریٹ، زیادہ سے زیادہ ڈسکاؤنٹ ('Max Discount %') اور ری آرڈر حد بھی مقرر کریں۔",
      },
      observedInstruction: {
        en: "Enter 'Pack Purchase Price' and 'Pack Sale Price'—the system automatically divides by Pack Size to calculate 'Unit Purchase Price', 'Unit Sale Price', and live 'Margin %'! You can also set Wholesale Pack/Unit Prices, 'Max Discount %' allowed at POS, 'Reorder Level (Packs)', and 'Expiry Alert (Days)'.",
        ur: "ڈبے کی قیمتِ خرید ('Pack Purchase Price') اور قیمتِ فروخت ('Pack Sale Price') لکھیں—سسٹم پیک سائز کے مطابق ایک گولی/یونٹ کی قیمت اور منافع ('Margin %') خودکار نکال لے گا! یہاں سے ہول سیل ریٹ، زیادہ سے زیادہ ڈسکاؤنٹ ('Max Discount %') اور ری آرڈر حد بھی مقرر کریں۔",
      },
    },
    {
      step: 4,
      screen: currentPath,
      screenLabel,
      resolveTarget: () => {
        const c = getActiveWorkspaceContainer();
        const submitBtn = c?.querySelector("button[type='submit']");
        return submitBtn?.closest(".flex") || submitBtn;
      },
      title: {
        en: "Save Product (Alt+S) & Next Step: Add Stock via Purchase Invoice",
        ur: "پروڈکٹ محفوظ کریں (Alt+S) اور پرچیز انوائس سے اسٹاک شامل کریں",
      },
      instruction: {
        en: "Click 'Save' (or press Alt+S) to register the product in your master catalog. To add physical batch quantities and expiry dates into inventory, open Create Purchase Invoice (Alt+1) or Stock Adjustment.",
        ur: "'Save' بٹن (یا Alt+S) دبا کر پروڈکٹ کیٹلاگ میں محفوظ کریں۔ اس کے بعد فزیکل اسٹاک اور بیچ شامل کرنے کے لیے Purchase Invoice (Alt+1) استعمال کریں۔",
      },
      observedInstruction: {
        en: "Click 'Save' (or press Alt+S) to register the product in your master catalog. To add physical batch quantities and expiry dates into inventory, open Create Purchase Invoice (Alt+1) or Stock Adjustment.",
        ur: "'Save' بٹن (یا Alt+S) دبا کر پروڈکٹ کیٹلاگ میں محفوظ کریں۔ اس کے بعد فزیکل اسٹاک اور بیچ شامل کرنے کے لیے Purchase Invoice (Alt+1) استعمال کریں۔",
      },
    },
  ].filter((st) => st.element || st.exactSelector || st.resolveTarget);
}

/**
 * Dynamically builds a rich, accurate, multi-step interactive Spotlight Tour for ANY of the 80+ screens
 * in Karobar ERP by inspecting the actual mounted DOM sections on the current screen and pairing each
 * section with its true buttons, inputs, columns, and `SCREEN_GUIDES` knowledge.
 */
export function buildInteractiveSpotlightSteps({
  currentPath = "/dashboard",
  guide = null,
  manifest = null,
}) {
  const container = getActiveWorkspaceContainer();
  const screenKey = guide?.key || currentPath || "/dashboard";
  const screenTitleEn = guide?.title?.en || "Current Screen";
  const screenTitleUr = guide?.title?.ur || "موجودہ اسکرین";
  const screenLabel = { en: screenTitleEn, ur: screenTitleUr };

  // 1. Dedicated 6-Step Accurate Tour for `/dashboard`
  if (currentPath === "/dashboard" || screenKey === "/dashboard") {
    const dashSteps = buildDashboardSpotlightSteps(container);
    return {
      title: guide?.title || {
        en: "Business Intelligence Dashboard",
        ur: "بزنس ڈیش بورڈ",
      },
      steps: dashSteps.map((s, idx) => ({ ...s, step: idx + 1 })),
    };
  }

  // 2. Dedicated Page-Studied Walkthroughs for All Invoice, POS, Return, PO, Show & Entry Forms
  //    (Runs BEFORE generic manifest or DOM fallback so every form step highlights the exact real section!)
  const isWholesaleFormDom = Boolean(
    container?.querySelector(".sale-wholesale-form, #wholesale-summary-footer")
  );
  const isRetailSaleFormRoute =
    currentPath === "/sale-invoices/create/retail" ||
    currentPath === "/sale-invoices/create" ||
    (/^\/sale-invoices\/[^/]+\/edit$/.test(currentPath) && !isWholesaleFormDom);

  if (isRetailSaleFormRoute) {
    const retailSteps = buildRetailSaleInvoiceFormSteps(container, currentPath);
    if (retailSteps.length > 0) {
      return {
        title: {
          en: "Interactive Tour: Retail Sale Invoice Form",
          ur: "ریٹیل سیل انوائس فارم — مرحلہ وار گائیڈ",
        },
        steps: retailSteps.map((s, idx) => ({ ...s, step: idx + 1 })),
      };
    }
  }

  const isWholesaleSaleFormRoute =
    currentPath === "/sale-invoices/create/wholesale" ||
    /^\/wholesale-invoices\/[^/]+\/edit$/.test(currentPath) ||
    (/^\/sale-invoices\/[^/]+\/edit$/.test(currentPath) && isWholesaleFormDom);

  if (isWholesaleSaleFormRoute) {
    const wholesaleSteps = buildWholesaleSaleInvoiceFormSteps(
      container,
      currentPath
    );
    if (wholesaleSteps.length > 0) {
      return {
        title: {
          en: "Interactive Tour: Wholesale (B2B) Sale Invoice Form",
          ur: "ہول سیل (B2B) سیل انوائس فارم — مرحلہ وار گائیڈ",
        },
        steps: wholesaleSteps.map((s, idx) => ({ ...s, step: idx + 1 })),
      };
    }
  }

  if (currentPath === "/sale-invoices/pos") {
    const posSteps = buildBarcodePosSteps(container, currentPath);
    if (posSteps.length > 0) {
      return {
        title: {
          en: "Interactive Tour: High-Speed Barcode POS Terminal",
          ur: "بارکوڈ POS ٹرمینل — مرحلہ وار گائیڈ",
        },
        steps: posSteps.map((s, idx) => ({ ...s, step: idx + 1 })),
      };
    }
  }

  if (
    currentPath === "/purchase-invoices/create" ||
    /^\/purchase-invoices\/[^/]+\/edit$/.test(currentPath)
  ) {
    const purchaseSteps = buildPurchaseInvoiceFormSteps(container, currentPath);
    if (purchaseSteps.length > 0) {
      return {
        title: {
          en: "Interactive Tour: Purchase Invoice (GRN) Form",
          ur: "پرچیز انوائس (GRN) فارم — مرحلہ وار گائیڈ",
        },
        steps: purchaseSteps.map((s, idx) => ({ ...s, step: idx + 1 })),
      };
    }
  }

  if (
    currentPath === "/sale-returns/create" ||
    /^\/sale-returns\/[^/]+\/edit$/.test(currentPath)
  ) {
    const saleReturnSteps = buildSaleReturnFormSteps(container, currentPath);
    if (saleReturnSteps.length > 0) {
      return {
        title: {
          en: "Interactive Tour: Sale Return Form",
          ur: "سیل ریٹرن فارم — مرحلہ وار گائیڈ",
        },
        steps: saleReturnSteps.map((s, idx) => ({ ...s, step: idx + 1 })),
      };
    }
  }

  if (
    currentPath === "/purchase-returns/create" ||
    /^\/purchase-returns\/[^/]+\/edit$/.test(currentPath)
  ) {
    const purchaseReturnSteps = buildPurchaseReturnFormSteps(
      container,
      currentPath
    );
    if (purchaseReturnSteps.length > 0) {
      return {
        title: {
          en: "Interactive Tour: Purchase Return Form",
          ur: "پرچیز ریٹرن فارم — مرحلہ وار گائیڈ",
        },
        steps: purchaseReturnSteps.map((s, idx) => ({ ...s, step: idx + 1 })),
      };
    }
  }

  if (currentPath.startsWith("/purchase-orders")) {
    const poSteps = buildPurchaseOrderSteps(container, currentPath);
    if (poSteps && poSteps.length > 0) {
      return {
        title: {
          en:
            currentPath === "/purchase-orders/forecast"
              ? "Interactive Tour: Smart Reorder Forecast"
              : "Interactive Tour: Purchase Orders (PO)",
          ur:
            currentPath === "/purchase-orders/forecast"
              ? "سمارٹ ری آرڈر فورکاسٹ — مرحلہ وار گائیڈ"
              : "پرچیز آرڈر (PO) — مرحلہ وار گائیڈ",
        },
        steps: poSteps.map((s, idx) => ({ ...s, step: idx + 1 })),
      };
    }
  }

  const isInvoiceShowRoute =
    (/^\/sale-invoices\/[^/]+$/.test(currentPath) &&
      currentPath !== "/sale-invoices/pos" &&
      currentPath !== "/sale-invoices/create") ||
    /^\/wholesale-invoices\/[^/]+$/.test(currentPath) ||
    (/^\/purchase-invoices\/[^/]+$/.test(currentPath) &&
      currentPath !== "/purchase-invoices/create");

  if (isInvoiceShowRoute) {
    const showSteps = buildInvoiceShowSteps(container, currentPath);
    if (showSteps.length > 0) {
      return {
        title: {
          en: "Interactive Tour: Invoice Details & Actions",
          ur: "انوائس کی تفصیل اور ایکشن بٹنز — مرحلہ وار گائیڈ",
        },
        steps: showSteps.map((s, idx) => ({ ...s, step: idx + 1 })),
      };
    }
  }

  if (
    currentPath === "/stock-adjustments/create" ||
    /^\/stock-adjustments\/[^/]+\/edit$/.test(currentPath)
  ) {
    const adjSteps = buildStockAdjustmentFormSteps(container, currentPath);
    if (adjSteps.length > 0) {
      return {
        title: {
          en: "Interactive Tour: Stock Adjustment Form",
          ur: "اسٹاک ایڈجسٹمنٹ فارم — مرحلہ وار گائیڈ",
        },
        steps: adjSteps.map((s, idx) => ({ ...s, step: idx + 1 })),
      };
    }
  }

  if (
    currentPath === "/products/create" ||
    /^\/products\/[^/]+\/edit$/.test(currentPath)
  ) {
    const prodSteps = buildProductFormSteps(container, currentPath);
    if (prodSteps.length > 0) {
      return {
        title: {
          en: "Interactive Tour: Product Master Form",
          ur: "پروڈکٹ فارم — مرحلہ وار گائیڈ",
        },
        steps: prodSteps.map((s, idx) => ({ ...s, step: idx + 1 })),
      };
    }
  }

  // 3. If a curated manifest is specifically designed for the EXACT current screen (`s.screen === currentPath`)
  //    and has >= 3 steps on this exact screen (e.g., `/customer-ledger`, `/cash-drawer`),
  //    use those curated steps directly!
  const sameScreenManifestSteps = Array.isArray(manifest?.steps)
    ? manifest.steps.filter((s) => !s.screen || s.screen === currentPath)
    : [];

  if (sameScreenManifestSteps.length >= 3) {
    return {
      title: manifest?.title || screenLabel,
      steps: sameScreenManifestSteps.map((s, idx) => ({
        ...s,
        step: idx + 1,
      })),
    };
  }

  // 3. Universal Context-True Live DOM Screen Tour Builder for all 80+ screens
  //    (List/Index pages, Forms, Reports, Ledgers, Master tables, Settings, etc.)
  const dynamicSteps = [];
  const usedElements = new Set();

  const markUsed = (el) => {
    if (el) usedElements.add(el);
  };
  const isUnused = (el) => {
    if (!el || !isValidWorkspaceElement(el)) return false;
    for (const u of usedElements) {
      if (u === el || u.contains(el) || el.contains(u)) return false;
    }
    return true;
  };

  if (container) {
    // -------------------------------------------------------------------------
    // STEP A: Screen Header Banner & Top Action Toolbar
    // -------------------------------------------------------------------------
    const headerCandidates = [
      ".products-heading",
      ".sale-list-header > div:first-of-type",
      ".sale-list-header",
      ".purchase-list-header",
      ".sale-entry-header",
      ".purchase-show-header",
      ".return-header",
      "header",
    ];
    let headerSection = null;
    for (const sel of headerCandidates) {
      try {
        const found = container.querySelector(sel);
        if (found && isValidWorkspaceElement(found)) {
          headerSection = found;
          break;
        }
      } catch {
        /* ignore */
      }
    }

    if (!headerSection) {
      const headingEl = container.querySelector("h1, h2");
      if (headingEl) {
        headerSection =
          headingEl.closest(
            ".flex.items-center.justify-between, .products-overview, .g-card, .rounded-2xl"
          ) || headingEl.parentElement;
      }
    }

    if (headerSection && isValidWorkspaceElement(headerSection)) {
      markUsed(headerSection);

      // Extract visible action buttons & links inside this header
      const headerButtons = Array.from(
        headerSection.querySelectorAll("a, button")
      )
        .filter(isValidWorkspaceElement)
        .map((b) => (b.innerText || b.getAttribute("title") || "").replace(/\s+/g, " ").trim())
        .filter((txt) => txt.length >= 2 && txt.length <= 32);

      const uniqueBtnNames = Array.from(new Set(headerButtons)).slice(0, 6);
      const btnSummaryEn =
        uniqueBtnNames.length > 0
          ? `Key actions available here: ${uniqueBtnNames.map((b) => `"${b}"`).join(", ")}.`
          : "";
      const btnSummaryUr =
        uniqueBtnNames.length > 0
          ? `یہاں موجود اہم بٹنز: ${uniqueBtnNames.map((b) => `"${b}"`).join("، ")}۔`
          : "";

      dynamicSteps.push({
        step: dynamicSteps.length + 1,
        screen: currentPath,
        screenLabel,
        element: headerSection,
        title: {
          en: `${screenTitleEn} — Header & Quick Actions`,
          ur: `${screenTitleUr} — ہیڈر اور اہم ایکشن بٹنز`,
        },
        instruction: {
          en: `${guide?.summary?.en || `Welcome to ${screenTitleEn}.`} ${btnSummaryEn}`.trim(),
          ur: `${guide?.summary?.ur || `${screenTitleUr} میں خوش آمدید۔`} ${btnSummaryUr}`.trim(),
        },
        observedInstruction: {
          en: `${guide?.summary?.en || `Welcome to ${screenTitleEn}.`} ${btnSummaryEn}`.trim(),
          ur: `${guide?.summary?.ur || `${screenTitleUr} میں خوش آمدید۔`} ${btnSummaryUr}`.trim(),
        },
        checkpoint:
          guide?.shortcuts?.length > 0
            ? {
                en: `Shortcut Tip: ${guide.shortcuts[0].keys.join(" + ")} — ${guide.shortcuts[0].en}`,
                ur: `شارٹ کٹ: ${guide.shortcuts[0].keys.join(" + ")} — ${guide.shortcuts[0].ur}`,
              }
            : null,
      });
    }

    // -------------------------------------------------------------------------
    // STEP B: Search Bar, Barcode Scanner, or Filter Panel
    // -------------------------------------------------------------------------
    let filterSection = null;
    const filterSelectors = [
      ".products-filter-panel",
      ".sale-list-header > div:nth-of-type(2)",
      ".dashboard-filter-panel",
      "[role='search']",
    ];
    for (const sel of filterSelectors) {
      try {
        const found = container.querySelector(sel);
        if (found && isValidWorkspaceElement(found) && !usedElements.has(found)) {
          filterSection = found;
          break;
        }
      } catch {
        /* ignore */
      }
    }

    if (!filterSection) {
      const searchInput = Array.from(
        container.querySelectorAll(
          "input[type='search'], input[placeholder*='search' i], input[placeholder*='scan' i], input[placeholder*='filter' i], input[placeholder*='posted' i], input[placeholder*='customer' i], input[placeholder*='supplier' i]"
        )
      ).find((el) => isValidWorkspaceElement(el));

      if (searchInput) {
        filterSection =
          searchInput.closest(
            ".products-filter-panel, .grid, .flex.flex-wrap, .flex.items-center.gap-2, .g-card"
          ) || searchInput;
      }
    }

    if (
      filterSection &&
      isValidWorkspaceElement(filterSection) &&
      filterSection !== headerSection
    ) {
      markUsed(filterSection);

      const placeholders = Array.from(
        filterSection.querySelectorAll("input, select")
      )
        .filter(isValidWorkspaceElement)
        .map(
          (inp) =>
            inp.getAttribute("placeholder") ||
            inp.getAttribute("aria-label") ||
            inp.closest("label")?.innerText ||
            ""
        )
        .map((s) => s.replace(/\s+/g, " ").trim())
        .filter(Boolean);

      const filterBtns = Array.from(filterSection.querySelectorAll("button"))
        .filter(isValidWorkspaceElement)
        .map((b) => (b.innerText || "").replace(/\s+/g, " ").trim())
        .filter((txt) => txt.length >= 2 && txt.length <= 28);

      const phText =
        placeholders.length > 0
          ? `Search or filter using: ${Array.from(new Set(placeholders))
              .slice(0, 3)
              .map((p) => `"${p}"`)
              .join(", ")}.`
          : "Use these search and filter controls to narrow down records immediately.";

      const filterBtnTextEn =
        filterBtns.length > 0
          ? ` You can also toggle ${Array.from(new Set(filterBtns))
              .slice(0, 3)
              .map((b) => `"${b}"`)
              .join(", ")}.`
          : "";

      const phTextUr =
        placeholders.length > 0
          ? `یہاں سے آپ (${Array.from(new Set(placeholders))
              .slice(0, 3)
              .map((p) => `"${p}"`)
              .join("، ")}) کے ذریعے فوری تلاش اور فلٹر کر سکتے ہیں۔`
          : "اس سرچ اور فلٹر بار کی مدد سے مطلوبہ ریکارڈز فوری تلاش کریں۔";

      dynamicSteps.push({
        step: dynamicSteps.length + 1,
        screen: currentPath,
        screenLabel,
        element: filterSection,
        title: {
          en: "Live Search & Filter Controls",
          ur: "لائیو سرچ اور فلٹر کنٹرولز",
        },
        instruction: {
          en: `${phText}${filterBtnTextEn} Results update live as you type or change filters.`,
          ur: `${phTextUr} ٹائپ کرنے یا فلٹر بدلنے سے نیچے لسٹ فوری اپڈیٹ ہو جاتی ہے۔`,
        },
        observedInstruction: {
          en: `${phText}${filterBtnTextEn} Try clicking or typing inside the highlighted search box right now!`,
          ur: `${phTextUr} آپ ابھی اس ہائی لائٹ کیے گئے سرچ باکس میں کلک کر کے ٹائپ کر سکتے ہیں!`,
        },
        checkpoint: {
          en: "Tip: You can click and type directly inside any spotlighted field without closing the tour.",
          ur: "نکتہ: آپ ٹور بند کیے بغیر اس ہائی لائٹ شدہ خانے میں براہِ راست ٹائپ کر سکتے ہیں۔",
        },
      });
    }

    // -------------------------------------------------------------------------
    // STEP C: KPI Summary Strip OR Form Header / Entry Controls (if present)
    // -------------------------------------------------------------------------
    const kpiCards = Array.from(
      container.querySelectorAll(
        ".grid > .g-card, .grid > div.rounded-2xl, .grid > div.rounded-xl"
      )
    ).filter(
      (el) =>
        isUnused(el) &&
        el.getBoundingClientRect().height >= 54 &&
        el.getBoundingClientRect().height <= 210 &&
        !el.querySelector("table")
    );

    if (kpiCards.length >= 2) {
      const kpiGrid = kpiCards[0].closest(".grid") || kpiCards[0];
      if (isUnused(kpiGrid)) {
        markUsed(kpiGrid);
        const cardHeadings = kpiCards
          .slice(0, 5)
          .map((c) => {
            const firstLine = (c.innerText || "")
              .split("\n")
              .map((l) => l.trim())
              .find((l) => l.length >= 2 && l.length <= 32);
            return firstLine;
          })
          .filter(Boolean);

        const cardNamesEn =
          cardHeadings.length > 0
            ? `Includes live cards for: ${Array.from(new Set(cardHeadings))
                .map((h) => `"${h}"`)
                .join(", ")}.`
            : "";
        const cardNamesUr =
          cardHeadings.length > 0
            ? `اس میں شامل کارڈز: ${Array.from(new Set(cardHeadings))
                .map((h) => `"${h}"`)
                .join("، ")}۔`
            : "";

        dynamicSteps.push({
          step: dynamicSteps.length + 1,
          screen: currentPath,
          screenLabel,
          element: kpiGrid,
          title: {
            en: "Summary KPI Cards & Live Balances",
            ur: "خلاصہ کارڈز اور لائیو بیلنس",
          },
          instruction: {
            en: `These summary cards display real-time totals, balances, and status counts for ${screenTitleEn}. ${cardNamesEn}`.trim(),
            ur: `یہ کارڈز ${screenTitleUr} کے لائیو ٹوٹل، بیلنس اور اہم اعداد و شمار دکھاتے ہیں۔ ${cardNamesUr}`.trim(),
          },
          observedInstruction: {
            en: `These summary cards display real-time totals, balances, and status counts for ${screenTitleEn}. ${cardNamesEn}`.trim(),
            ur: `یہ کارڈز ${screenTitleUr} کے لائیو ٹوٹل، بیلنس اور اہم اعداد و شمار دکھاتے ہیں۔ ${cardNamesUr}`.trim(),
          },
        });
      }
    }

    // Check if the screen has a Form / Details Entry Section (e.g. Create/Edit Product, Invoice Form, Settings)
    const formDetailsSection =
      container.querySelector(
        ".sale-entry-details, .purchase-show-details, .return-details, form"
      ) || null;

    if (
      formDetailsSection &&
      isValidWorkspaceElement(formDetailsSection) &&
      !usedElements.has(formDetailsSection)
    ) {
      markUsed(formDetailsSection);
      const labels = Array.from(
        formDetailsSection.querySelectorAll("label, h2, h3")
      )
        .filter(isValidWorkspaceElement)
        .map((l) => (l.innerText || "").replace(/\s+/g, " ").trim())
        .filter((t) => t.length >= 2 && t.length <= 34);

      const uniqueLabels = Array.from(new Set(labels)).slice(0, 6);
      const fieldsListEn =
        uniqueLabels.length > 0
          ? `Key fields in this section: ${uniqueLabels.map((l) => `"${l}"`).join(", ")}.`
          : guide?.steps?.en?.[0] || "Fill in the required fields in this form section.";
      const fieldsListUr =
        uniqueLabels.length > 0
          ? `اس حصے کے اہم خانے: ${uniqueLabels.map((l) => `"${l}"`).join("، ")}۔`
          : guide?.steps?.ur?.[0] || "اس فارم کے مطلوبہ خانے پُر کریں۔";

      dynamicSteps.push({
        step: dynamicSteps.length + 1,
        screen: currentPath,
        screenLabel,
        element: formDetailsSection,
        title: {
          en: `${screenTitleEn} — Form Fields & Parameters`,
          ur: `${screenTitleUr} — فارم فیلڈز اور معلومات`,
        },
        instruction: {
          en: `${fieldsListEn} ${guide?.steps?.en?.[1] || ""}`.trim(),
          ur: `${fieldsListUr} ${guide?.steps?.ur?.[1] || ""}`.trim(),
        },
        observedInstruction: {
          en: `${fieldsListEn} ${guide?.steps?.en?.[1] || ""}`.trim(),
          ur: `${fieldsListUr} ${guide?.steps?.ur?.[1] || ""}`.trim(),
        },
        checkpoint:
          guide?.commonMistake
            ? { en: guide.commonMistake.en, ur: guide.commonMistake.ur }
            : null,
      });
    }

    // -------------------------------------------------------------------------
    // STEP D: Data Table, Line-Item Grid, Columns & Row Actions
    // -------------------------------------------------------------------------
    const tablePanel =
      container.querySelector(
        ".products-catalog, .sale-list-table, .purchase-invoice-table-scroll, .sale-entry-items, .purchase-entry-items, .return-items"
      ) || container.querySelector("table");

    if (tablePanel && isValidWorkspaceElement(tablePanel)) {
      markUsed(tablePanel);

      const tableEl =
        tablePanel.tagName?.toLowerCase() === "table"
          ? tablePanel
          : tablePanel.querySelector("table");

      const colHeaders = tableEl
        ? Array.from(tableEl.querySelectorAll("thead th"))
            .map((th) => (th.innerText || "").replace(/\s+/g, " ").trim())
            .filter((t) => t.length >= 1 && t.length <= 28 && t !== "#")
        : [];

      const uniqueCols = Array.from(new Set(colHeaders)).slice(0, 8);
      const colsTextEn =
        uniqueCols.length > 0
          ? `Columns shown here: ${uniqueCols.map((c) => `"${c}"`).join(", ")}.`
          : "";
      const colsTextUr =
        uniqueCols.length > 0
          ? `اس ٹیبل کے کالمز: ${uniqueCols.map((c) => `"${c}"`).join("، ")}۔`
          : "";

      const hasRowActions = uniqueCols.some((c) =>
        c.toLowerCase().includes("action")
      );

      dynamicSteps.push({
        step: dynamicSteps.length + 1,
        screen: currentPath,
        screenLabel,
        element: tablePanel,
        title: {
          en: hasRowActions
            ? `${screenTitleEn} — Data Table & Row Actions`
            : `${screenTitleEn} — Interactive Records & Line Items`,
          ur: hasRowActions
            ? `${screenTitleUr} — ڈیٹا ٹیبل اور ایکشن بٹنز`
            : `${screenTitleUr} — ریکارڈز اور آئٹمز ٹیبل`,
        },
        instruction: {
          en: `${colsTextEn} ${
            hasRowActions
              ? "Use the action buttons on the right of any row to View, Edit, Print, Share, or Delete individual records."
              : guide?.steps?.en?.[2] ||
                "Review or edit your records and line items directly in this table."
          }`.trim(),
          ur: `${colsTextUr} ${
            hasRowActions
              ? "کسی بھی قطار (Row) کے دائیں جانب دیے گئے بٹنز سے ریکارڈ دیکھیں (View)، ایڈٹ کریں، پرنٹ کریں یا حذف کریں۔"
              : guide?.steps?.ur?.[2] ||
                "اس ٹیبل میں تمام آئٹمز اور ریکارڈز کی تفصیل چیک کریں۔"
          }`.trim(),
        },
        observedInstruction: {
          en: `${colsTextEn} ${
            hasRowActions
              ? "Use the action buttons on the right of any row to View, Edit, Print, Share, or Delete individual records."
              : guide?.steps?.en?.[2] ||
                "Review or edit your records and line items directly in this table."
          }`.trim(),
          ur: `${colsTextUr} ${
            hasRowActions
              ? "کسی بھی قطار (Row) کے دائیں جانب دیے گئے بٹنز سے ریکارڈ دیکھیں (View)، ایڈٹ کریں، پرنٹ کریں یا حذف کریں۔"
              : guide?.steps?.ur?.[2] ||
                "اس ٹیبل میں تمام آئٹمز اور ریکارڈز کی تفصیل چیک کریں۔"
          }`.trim(),
        },
        checkpoint: guide?.impacts
          ? { en: guide.impacts.en, ur: guide.impacts.ur }
          : null,
      });
    }

    // -------------------------------------------------------------------------
    // STEP E: Pagination Bar OR Invoice Summary / Save Footer (if present)
    // -------------------------------------------------------------------------
    const footerOrPagination =
      container.querySelector(
        ".sale-entry-summary, .return-footer, .purchase-show-footer, .products-pagination"
      ) || null;

    if (
      footerOrPagination &&
      isValidWorkspaceElement(footerOrPagination) &&
      !usedElements.has(footerOrPagination)
    ) {
      markUsed(footerOrPagination);
      const isPagination = footerOrPagination.classList?.contains(
        "products-pagination"
      );

      dynamicSteps.push({
        step: dynamicSteps.length + 1,
        screen: currentPath,
        screenLabel,
        element: footerOrPagination,
        title: {
          en: isPagination
            ? "Pagination & Page Navigation"
            : "Totals Summary, Payment & Save Controls",
          ur: isPagination
            ? "صفحات کی تبدیلی (Pagination)"
            : "بل کا خلاصہ، ادائیگی اور محفوظ کرنے کے بٹن",
        },
        instruction: {
          en: isPagination
            ? "Navigate across pages (First, Previous, Page Numbers, Next, Last) and see total matching records at the bottom of the list."
            : "Review net totals, discounts, tax, and cash received/paid amounts here before clicking Save or Save & Print.",
          ur: isPagination
            ? "لسٹ کے نچلے حصے سے اگلے یا پچھلے صفحات پر جائیں اور کل ریکارڈز کی تعداد دیکھیں۔"
            : "محفوظ یا پرنٹ کرنے سے پہلے کل رقم، ڈسکاؤنٹ اور نقد وصولی/ادائیگی کا خلاصہ یہاں چیک کریں۔",
        },
        observedInstruction: {
          en: isPagination
            ? "Navigate across pages (First, Previous, Page Numbers, Next, Last) and see total matching records at the bottom of the list."
            : "Review net totals, discounts, tax, and cash received/paid amounts here before clicking Save or Save & Print.",
          ur: isPagination
            ? "لسٹ کے نچلے حصے سے اگلے یا پچھلے صفحات پر جائیں اور کل ریکارڈز کی تعداد دیکھیں۔"
            : "محفوظ یا پرنٹ کرنے سے پہلے کل رقم، ڈسکاؤنٹ اور نقد وصولی/ادائیگی کا خلاصہ یہاں چیک کریں۔",
        },
        checkpoint: guide?.commonMistake
          ? { en: guide.commonMistake.en, ur: guide.commonMistake.ur }
          : guide?.impacts
          ? { en: guide.impacts.en, ur: guide.impacts.ur }
          : null,
      });
    }
  }

  // Fallback if the screen has custom cards/panels not matched above
  if (dynamicSteps.length === 0) {
    const guideStepsEn = guide?.steps?.en || [];
    const guideStepsUr = guide?.steps?.ur || [];

    if (guideStepsEn.length > 0) {
      guideStepsEn.slice(0, 4).forEach((stepTextEn, sIdx) => {
        const stepTextUr = guideStepsUr[sIdx] || stepTextEn;
        dynamicSteps.push({
          step: sIdx + 1,
          screen: currentPath,
          screenLabel,
          target: "button, input, select, table, .g-card",
          title: {
            en: `${screenTitleEn} — Step ${sIdx + 1}`,
            ur: `${screenTitleUr} — مرحلہ ${sIdx + 1}`,
          },
          instruction: { en: stepTextEn, ur: stepTextUr },
          observedInstruction: { en: stepTextEn, ur: stepTextUr },
          checkpoint:
            sIdx === guideStepsEn.slice(0, 4).length - 1 && guide?.impacts
              ? { en: guide.impacts.en, ur: guide.impacts.ur }
              : null,
        });
      });
    } else {
      dynamicSteps.push({
        step: 1,
        screen: currentPath,
        screenLabel,
        target: ".workspace-page, main",
        title: {
          en: `${screenTitleEn} Overview`,
          ur: `${screenTitleUr} کا تعارف`,
        },
        instruction: {
          en:
            guide?.summary?.en ||
            `Explore ${screenTitleEn} controls and records.`,
          ur:
            guide?.summary?.ur ||
            `${screenTitleUr} کے بٹنز اور ریکارڈز دیکھیں۔`,
        },
        observedInstruction: {
          en:
            guide?.summary?.en ||
            `Explore ${screenTitleEn} controls and records.`,
          ur:
            guide?.summary?.ur ||
            `${screenTitleUr} کے بٹنز اور ریکارڈز دیکھیں۔`,
        },
      });
    }
  }

  return {
    title: guide?.title || manifest?.title || {
      en: "Interactive Screen Walkthrough",
      ur: "مرحلہ وار عملی گائیڈ",
    },
    steps: dynamicSteps.map((st, idx) => ({
      ...st,
      step: idx + 1,
    })),
  };
}

/**
 * Computes optimal floating card coordinates & directional arrow placement
 * relative to the spotlight cutout rectangle, flipping automatically when near viewport edges.
 */
function computePopoverPlacement(
  cutoutRect,
  popoverWidth = 372,
  popoverHeight = 290
) {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const margin = 14;
  const gap = 14;

  // If no target rect (or full-screen fallback), dock cleanly at bottom-right
  if (!cutoutRect) {
    return {
      top: Math.max(margin, vh - popoverHeight - 24),
      left: Math.max(margin, vw - popoverWidth - 24),
      side: "center",
      arrowLeft: null,
      arrowTop: null,
    };
  }

  const spaceBottom = vh - (cutoutRect.y + cutoutRect.h) - margin;
  const spaceTop = cutoutRect.y - margin;
  const spaceRight = vw - (cutoutRect.x + cutoutRect.w) - margin;
  const spaceLeft = cutoutRect.x - margin;

  let side = "bottom";
  if (spaceBottom >= popoverHeight + gap) {
    side = "bottom";
  } else if (spaceTop >= popoverHeight + gap) {
    side = "top";
  } else if (spaceRight >= popoverWidth + gap) {
    side = "right";
  } else if (spaceLeft >= popoverWidth + gap) {
    side = "left";
  } else {
    const maxSpace = Math.max(spaceBottom, spaceTop, spaceRight, spaceLeft);
    if (maxSpace === spaceBottom) side = "bottom";
    else if (maxSpace === spaceTop) side = "top";
    else if (maxSpace === spaceRight) side = "right";
    else side = "left";
  }

  const targetCenterX = cutoutRect.x + cutoutRect.w / 2;
  const targetCenterY = cutoutRect.y + cutoutRect.h / 2;

  let left = targetCenterX - popoverWidth / 2;
  let top = cutoutRect.y + cutoutRect.h + gap;

  if (side === "top") {
    top = cutoutRect.y - popoverHeight - gap;
    left = targetCenterX - popoverWidth / 2;
  } else if (side === "right") {
    left = cutoutRect.x + cutoutRect.w + gap;
    top = targetCenterY - popoverHeight / 2;
  } else if (side === "left") {
    left = cutoutRect.x - popoverWidth - gap;
    top = targetCenterY - popoverHeight / 2;
  }

  // Clamp strictly inside viewport bounds
  left = Math.max(margin, Math.min(vw - popoverWidth - margin, left));
  top = Math.max(margin, Math.min(vh - popoverHeight - margin, top));

  // If the popover overlaps a tall target (e.g., a large table or grid), dock cleanly at bottom-right
  const overlapsTarget =
    left < cutoutRect.x + cutoutRect.w &&
    left + popoverWidth > cutoutRect.x &&
    top < cutoutRect.y + cutoutRect.h &&
    top + popoverHeight > cutoutRect.y;

  if (overlapsTarget && cutoutRect.h > vh * 0.42) {
    top = Math.max(margin, vh - popoverHeight - 20);
    left = Math.max(margin, vw - popoverWidth - 20);
  }

  const arrowLeft = Math.max(
    24,
    Math.min(popoverWidth - 24, targetCenterX - left)
  );
  const arrowTop = Math.max(
    24,
    Math.min(popoverHeight - 24, targetCenterY - top)
  );

  return {
    top: Math.round(top),
    left: Math.round(left),
    side,
    arrowLeft: Math.round(arrowLeft),
    arrowTop: Math.round(arrowTop),
  };
}

/**
 * Interactive On-Screen Spotlight Tour Overlay:
 * - Full-viewport SVG mask cutout around the active screen part
 * - Live interactive target hole (user can click/type directly inside the highlighted control)
 * - Tethered floating step card (`role="dialog"`, `aria-labelledby`, rendered via body portal)
 * - Live DOM re-evaluation when async page content finishes loading
 */
export default function SpotlightTourOverlay({
  activeDemo,
  steps: propSteps = [],
  tourTitle: propTourTitle,
  guide = null,
  manifest = null,
  currentPathname = "/dashboard",
  isUr = false,
  isDark = false,
  onToggleLang,
  onStepChange,
  onCloseTour,
  onNavigateToRoute,
  onNavigateRoute,
  onAskAiAboutStep,
}) {
  const handleRouteNav = onNavigateToRoute || onNavigateRoute;
  const maskId = useId();
  const dialogTitleId = useId();
  const popoverRef = useRef(null);
  const primaryNextBtnRef = useRef(null);
  const scrollOpIdRef = useRef(0);
  const activeTargetRef = useRef(null);

  const [domRevision, setDomRevision] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [popoverSize, setPopoverSize] = useState({ width: 372, height: 300 });
  const [actionCompleted, setActionCompleted] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [controlMeta, setControlMeta] = useState({
    en: "Screen Section",
    ur: "اسکرین سیکشن",
    canTriggerClick: false,
    isInput: false,
  });

  // Re-scan live DOM after mount and when async table/page data finishes loading
  useEffect(() => {
    if (typeof document === "undefined") return;
    const t1 = window.setTimeout(() => setDomRevision((v) => v + 1), 90);
    const t2 = window.setTimeout(() => setDomRevision((v) => v + 1), 350);
    const t3 = window.setTimeout(() => setDomRevision((v) => v + 1), 850);

    const workspaceEl =
      document.querySelector(".workspace-page") ||
      document.querySelector("main");
    let debounceTimer = null;
    let observer = null;

    if (workspaceEl && typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(() => {
        if (debounceTimer) window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
          setDomRevision((v) => v + 1);
        }, 180);
      });
      observer.observe(workspaceEl, { childList: true, subtree: true });
    }

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      if (debounceTimer) window.clearTimeout(debounceTimer);
      if (observer) observer.disconnect();
    };
  }, [currentPathname]);

  // Build live steps directly from the currently mounted DOM whenever `domRevision` or `currentPathname` updates
  const liveTourData = useMemo(() => {
    if (guide || currentPathname) {
      const built = buildInteractiveSpotlightSteps({
        currentPath: currentPathname,
        guide,
        manifest,
      });
      if (built?.steps?.length > 0) {
        return built;
      }
    }
    return {
      title: propTourTitle,
      steps: propSteps,
    };
  }, [currentPathname, guide, manifest, propSteps, propTourTitle, domRevision]);

  const steps = liveTourData.steps?.length ? liveTourData.steps : propSteps;
  const tourTitle = liveTourData.title || propTourTitle;

  const stepIndex = Math.min(
    Math.max(0, Number(activeDemo?.stepIndex || 0)),
    Math.max(0, steps.length - 1)
  );
  const currentStep = steps[stepIndex] || null;
  const totalSteps = steps.length;

  const isOnTargetScreen = useMemo(() => {
    if (!currentStep?.screen) return true;
    return (
      currentPathname === currentStep.screen ||
      currentPathname.startsWith(currentStep.screen)
    );
  }, [currentPathname, currentStep]);

  /**
   * Measures the currently resolved DOM target and updates the SVG cutout bounding box.
   */
  const syncTargetGeometry = useCallback(() => {
    const el = activeTargetRef.current;
    if (!el || !isValidWorkspaceElement(el)) {
      setTargetRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const x = Math.round(Math.max(4, r.left - pad));
    const y = Math.round(Math.max(4, r.top - pad));
    const w = Math.round(Math.min(vw - x - 4, r.width + pad * 2));
    const h = Math.round(Math.min(vh - y - 4, r.height + pad * 2));

    setTargetRect((prev) => {
      if (
        prev &&
        Math.abs(prev.x - x) < 1 &&
        Math.abs(prev.y - y) < 1 &&
        Math.abs(prev.w - w) < 1 &&
        Math.abs(prev.h - h) < 1
      ) {
        return prev;
      }
      return { x, y, w, h };
    });
  }, []);

  /**
   * Resolves the target element for the current step, scrolls it smoothly into view
   * using `scrollIntoViewAsync`, and attaches live interaction listeners.
   */
  useEffect(() => {
    if (!currentStep || typeof document === "undefined") return;

    setActionCompleted(false);
    const currentScrollOp = ++scrollOpIdRef.current;

    // Clean up any previous highlight class
    document
      .querySelectorAll(".guide-bot-dom-highlight")
      .forEach((node) => node.classList.remove("guide-bot-dom-highlight"));

    if (!isOnTargetScreen) {
      activeTargetRef.current = null;
      setTargetRect(null);
      setControlMeta({
        en: `Requires ${currentStep.screen}`,
        ur: `صفحہ کھولیں: ${currentStep.screen}`,
        canTriggerClick: false,
        isInput: false,
      });
      return;
    }

    let cleanupInteractionListeners = () => {};

    const resolveAndLockTarget = async () => {
      await new Promise((r) => window.setTimeout(r, 40));
      if (currentScrollOp !== scrollOpIdRef.current) return;

      const targetEl = findBestTourTargetElement(currentStep);
      activeTargetRef.current = targetEl;

      if (!targetEl) {
        setTargetRect(null);
        return;
      }

      setControlMeta(describeControlType(targetEl));

      // Check if target is outside comfortable viewport region before scrolling
      const initialRect = targetEl.getBoundingClientRect();
      const needsScroll =
        initialRect.top < 68 || initialRect.bottom > window.innerHeight - 68;

      if (needsScroll) {
        const scrollContainer =
          targetEl.closest(".workspace-page") || window;
        await scrollIntoViewAsync(
          targetEl,
          {
            behavior: "smooth",
            block:
              initialRect.height > window.innerHeight * 0.65
                ? "start"
                : "center",
            inline: "nearest",
          },
          scrollContainer
        );
      }

      if (currentScrollOp !== scrollOpIdRef.current) return;

      targetEl.classList.add("guide-bot-dom-highlight");
      syncTargetGeometry();

      primaryNextBtnRef.current?.focus({ preventScroll: true });

      const handleTargetInteraction = () => {
        setActionCompleted(true);
      };

      targetEl.addEventListener("click", handleTargetInteraction, {
        capture: true,
      });
      targetEl.addEventListener("input", handleTargetInteraction, {
        capture: true,
      });
      targetEl.addEventListener("change", handleTargetInteraction, {
        capture: true,
      });

      cleanupInteractionListeners = () => {
        targetEl.classList.remove("guide-bot-dom-highlight");
        targetEl.removeEventListener("click", handleTargetInteraction, {
          capture: true,
        });
        targetEl.removeEventListener("input", handleTargetInteraction, {
          capture: true,
        });
        targetEl.removeEventListener("change", handleTargetInteraction, {
          capture: true,
        });
      };
    };

    resolveAndLockTarget();

    return () => {
      cleanupInteractionListeners();
    };
  }, [currentStep, stepIndex, isOnTargetScreen, domRevision, syncTargetGeometry]);

  // Auto-advance to the next step when the user performs the action and Auto-Advance is enabled
  useEffect(() => {
    if (!actionCompleted || !autoAdvance) return;
    const timer = window.setTimeout(() => {
      if (stepIndex < totalSteps - 1) {
        onStepChange(stepIndex + 1);
      }
    }, 1050);
    return () => window.clearTimeout(timer);
  }, [actionCompleted, autoAdvance, stepIndex, totalSteps, onStepChange]);

  // Keep cutout & floating card locked to the target element during scroll or resize
  useEffect(() => {
    if (!currentStep || typeof window === "undefined") return;

    const handleViewportUpdate = () => {
      syncTargetGeometry();
      if (popoverRef.current) {
        const pr = popoverRef.current.getBoundingClientRect();
        if (pr.width > 0 && pr.height > 0) {
          const nextW = Math.round(pr.width);
          const nextH = Math.round(pr.height);
          setPopoverSize((prev) => {
            if (
              Math.abs(prev.width - nextW) < 2 &&
              Math.abs(prev.height - nextH) < 2
            ) {
              return prev;
            }
            return { width: nextW, height: nextH };
          });
        }
      }
    };

    window.addEventListener("scroll", handleViewportUpdate, true);
    window.addEventListener("resize", handleViewportUpdate);
    const rafId = window.requestAnimationFrame(handleViewportUpdate);

    return () => {
      window.removeEventListener("scroll", handleViewportUpdate, true);
      window.removeEventListener("resize", handleViewportUpdate);
      window.cancelAnimationFrame(rafId);
    };
  }, [currentStep, stepIndex, domRevision, syncTargetGeometry]);

  // Keyboard shortcuts during Spotlight Tour: ArrowRight (Next), ArrowLeft (Prev), Escape (Exit)
  useEffect(() => {
    if (!currentStep || typeof window === "undefined") return;

    const handleKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isTypingInField =
        activeTag === "input" ||
        activeTag === "textarea" ||
        activeTag === "select" ||
        document.activeElement?.isContentEditable;

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseTour();
        return;
      }

      if (isTypingInField) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (stepIndex < totalSteps - 1) {
          onStepChange(stepIndex + 1);
        } else {
          onCloseTour();
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (stepIndex > 0) {
          onStepChange(stepIndex - 1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [currentStep, stepIndex, totalSteps, onStepChange, onCloseTour]);

  // Clean up highlight class when unmounting
  useEffect(() => {
    return () => {
      if (typeof document !== "undefined") {
        document
          .querySelectorAll(".guide-bot-dom-highlight")
          .forEach((node) => node.classList.remove("guide-bot-dom-highlight"));
      }
    };
  }, []);

  /**
   * Lets the user click "Focus / Perform Action" directly from the floating tour card
   * to focus the input field or trigger a safe control on screen.
   */
  const handleTriggerTargetAction = () => {
    const el = activeTargetRef.current;
    if (!el) return;

    const inputChild =
      el.tagName?.toLowerCase() === "input" ||
      el.tagName?.toLowerCase() === "textarea" ||
      el.tagName?.toLowerCase() === "select"
        ? el
        : el.querySelector?.("input:not([type='hidden']), select, textarea");

    if (inputChild && typeof inputChild.focus === "function") {
      inputChild.focus({ preventScroll: true });
      setActionCompleted(true);
      return;
    }

    if (
      (el.tagName?.toLowerCase() === "button" ||
        el.tagName?.toLowerCase() === "a") &&
      el.getAttribute("type") !== "submit"
    ) {
      el.focus?.({ preventScroll: true });
      el.click?.();
      setActionCompleted(true);
      return;
    }

    el.focus?.({ preventScroll: true });
    setActionCompleted(true);
  };

  if (!currentStep || typeof document === "undefined") return null;

  const placement = computePopoverPlacement(
    targetRect,
    popoverSize.width,
    popoverSize.height
  );

  const instructionText = isOnTargetScreen
    ? isUr
      ? (currentStep.observedInstruction || currentStep.instruction)?.ur ||
        currentStep.instruction?.en
      : (currentStep.observedInstruction || currentStep.instruction)?.en
    : isUr
    ? currentStep.instruction?.ur || currentStep.instruction?.en
    : currentStep.instruction?.en;

  return createPortal(
    <div
      className="spotlight-tour-root fixed inset-0 z-[9990] pointer-events-none"
      aria-live="polite"
    >
      {/* 1. FULL-VIEWPORT SVG MASK BACKDROP WITH ROUNDED CUTOUT WINDOW */}
      <svg
        className="fixed inset-0 w-full h-full pointer-events-none"
        aria-hidden="true"
      >
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.x}
                y={targetRect.y}
                width={targetRect.w}
                height={targetRect.h}
                rx="14"
                ry="14"
                fill="black"
                className="transition-all duration-300 ease-out"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill={isDark ? "rgba(2, 6, 23, 0.72)" : "rgba(15, 23, 42, 0.58)"}
          mask={`url(#${maskId})`}
        />
      </svg>

      {/* 2. PULSING SPOTLIGHT RING & STEP NUMBER PILL AROUND THE LIVE TARGET */}
      {targetRect && (
        <div
          style={{
            top: `${targetRect.y}px`,
            left: `${targetRect.x}px`,
            width: `${targetRect.w}px`,
            height: `${targetRect.h}px`,
          }}
          className="fixed z-[9992] rounded-[14px] pointer-events-none transition-all duration-300 ease-out ring-3 ring-cyan-400 shadow-[0_0_0_6px_rgba(6,182,212,0.22),0_0_32px_rgba(59,130,246,0.5)]"
        >
          {/* Corner Step Pill */}
          <div
            dir="ltr"
            className="absolute -top-3.5 left-3 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md flex items-center gap-1 whitespace-nowrap"
          >
            <span>#{stepIndex + 1}</span>
            <span>•</span>
            <span>{isUr ? controlMeta.ur : controlMeta.en}</span>
          </div>
        </div>
      )}

      {/* 3. TETHERED FLOATING TOUR STEP CARD (Always visible, fixed above backdrop) */}
      <div
        ref={popoverRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={dialogTitleId}
        dir={isUr ? "rtl" : "ltr"}
        lang={isUr ? "ur" : "en"}
        style={{
          position: "fixed",
          top: `${placement.top}px`,
          left: `${placement.left}px`,
          right: "auto",
          bottom: "auto",
          margin: 0,
        }}
        className={`spotlight-tour-popover pointer-events-auto z-[9998] w-[min(92vw,380px)] rounded-2xl border p-3.5 shadow-2xl transition-all duration-200 ${
          isDark
            ? "bg-slate-900/98 border-cyan-500/50 text-slate-100 shadow-black/70"
            : "bg-white/98 border-blue-300 text-slate-900 shadow-slate-950/25"
        }`}
      >
        {/* Directional Pointer Arrow pointing at the highlighted screen element */}
        {targetRect && placement.side === "bottom" && (
          <div
            style={{ left: `${placement.arrowLeft - 7}px` }}
            className={`absolute -top-2 w-3.5 h-3.5 rotate-45 border-l border-t ${
              isDark
                ? "bg-slate-900 border-cyan-500/50"
                : "bg-white border-blue-300"
            }`}
          />
        )}
        {targetRect && placement.side === "top" && (
          <div
            style={{ left: `${placement.arrowLeft - 7}px` }}
            className={`absolute -bottom-2 w-3.5 h-3.5 rotate-45 border-r border-b ${
              isDark
                ? "bg-slate-900 border-cyan-500/50"
                : "bg-white border-blue-300"
            }`}
          />
        )}
        {targetRect && placement.side === "right" && (
          <div
            style={{ top: `${placement.arrowTop - 7}px` }}
            className={`absolute -left-2 w-3.5 h-3.5 rotate-45 border-l border-b ${
              isDark
                ? "bg-slate-900 border-cyan-500/50"
                : "bg-white border-blue-300"
            }`}
          />
        )}
        {targetRect && placement.side === "left" && (
          <div
            style={{ top: `${placement.arrowTop - 7}px` }}
            className={`absolute -right-2 w-3.5 h-3.5 rotate-45 border-r border-t ${
              isDark
                ? "bg-slate-900 border-cyan-500/50"
                : "bg-white border-blue-300"
            }`}
          />
        )}

        <div className="space-y-2.5">
          {/* Header: Cube Presenter + Step Counter + Language Toggle + Close */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-9 shrink-0 flex items-center justify-center">
                <GuideBotAvatar
                  className="w-8 h-9 drop-shadow-xs"
                  fullBody={true}
                  speaking={true}
                  presenter={true}
                  trick={actionCompleted ? "backflip" : "spy"}
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap" dir="ltr">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-gradient-to-r from-cyan-500 to-blue-600 text-white">
                    {isUr
                      ? `مرحلہ ${stepIndex + 1} از ${totalSteps}`
                      : `Step ${stepIndex + 1} of ${totalSteps}`}
                  </span>
                  <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 truncate max-w-[155px]">
                    {isUr ? tourTitle?.ur || tourTitle?.en : tourTitle?.en}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0" dir="ltr">
              {onToggleLang && (
                <button
                  type="button"
                  onClick={() => onToggleLang(isUr ? "en" : "ur")}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border cursor-pointer ${
                    isDark
                      ? "bg-slate-800 border-slate-700 text-cyan-300"
                      : "bg-slate-100 border-slate-200 text-slate-700"
                  }`}
                >
                  {isUr ? "EN" : "اردو"}
                </button>
              )}
              <button
                type="button"
                onClick={onCloseTour}
                title={isUr ? "ٹور بند کریں (Esc)" : "Exit Spotlight Tour (Esc)"}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Segmented Step Progress Bar */}
          <div className="flex items-center gap-1" dir="ltr">
            {steps.map((st, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onStepChange(idx)}
                title={`Step ${idx + 1}: ${st.title?.en || ""}`}
                className={`h-1.5 flex-1 rounded-full transition-all cursor-pointer ${
                  idx === stepIndex
                    ? "bg-gradient-to-r from-cyan-500 to-blue-600"
                    : idx < stepIndex
                    ? "bg-emerald-500"
                    : isDark
                    ? "bg-slate-800 hover:bg-slate-700"
                    : "bg-slate-200 hover:bg-slate-300"
                }`}
              />
            ))}
          </div>

          {/* Step Title & Actionable Instruction */}
          <div className="space-y-1 pt-0.5">
            <h3
              id={dialogTitleId}
              className={`text-[13.5px] font-black text-slate-900 dark:text-white leading-snug ${
                isUr ? "guide-bot-urdu-block" : ""
              }`}
            >
              {isUr
                ? currentStep.title?.ur || currentStep.title?.en
                : currentStep.title?.en}
            </h3>
            <p
              className={`text-xs leading-relaxed text-slate-600 dark:text-slate-300 ${
                isUr ? "guide-bot-urdu-block" : ""
              }`}
            >
              {instructionText}
            </p>
          </div>

          {/* Live Interactive Action Status / "Try It Now" Strip */}
          {!isOnTargetScreen ? (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => handleRouteNav?.(currentStep.screen)}
                className="w-full py-2 px-3 rounded-xl text-xs font-extrabold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-sm inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>
                  {isUr
                    ? `اس مرحلے کا صفحہ کھولیں (${currentStep.screen})`
                    : `Open ${currentStep.screen} to Continue Tour`}
                </span>
                <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : actionCompleted ? (
            <div className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[11px] font-extrabold flex items-center gap-1.5">
              <CheckCircleIcon className="w-4 h-4 shrink-0 text-emerald-500" />
              <span>
                {isUr
                  ? "بہترین! آپ نے اس حصے کے ساتھ عمل مکمل کر لیا۔"
                  : "Great! You interacted with this screen control."}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-1.5 flex-wrap pt-0.5">
              {targetRect && (
                <button
                  type="button"
                  onClick={handleTriggerTargetAction}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-extrabold border transition-all cursor-pointer active:scale-95 ${
                    isDark
                      ? "bg-cyan-500/15 hover:bg-cyan-500/25 border-cyan-500/40 text-cyan-300"
                      : "bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700"
                  }`}
                >
                  <CursorArrowRaysIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {controlMeta.isInput
                      ? isUr
                        ? "خانے میں کرسر لے جائیں (Focus Input)"
                        : "Focus & Type in Field"
                      : controlMeta.canTriggerClick
                      ? isUr
                        ? "یہ بٹن کلک کریں (Do Action)"
                        : "Click Highlighted Control"
                      : isUr
                      ? "اس حصے پر فوکس کریں"
                      : "Focus This Section"}
                  </span>
                </button>
              )}

              {onAskAiAboutStep && (
                <button
                  type="button"
                  onClick={() => onAskAiAboutStep(currentStep)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-xl text-[10.5px] font-bold border transition-colors cursor-pointer ${
                    isDark
                      ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300"
                      : "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700"
                  }`}
                >
                  <SparklesIcon className="w-3 h-3 shrink-0 text-indigo-500" />
                  <span>{isUr ? "اے آئی سے پوچھیں" : "Ask AI"}</span>
                </button>
              )}
            </div>
          )}

          {/* Checkpoint / Accounting Impact Note */}
          {currentStep.checkpoint && (
            <div
              className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold flex items-start gap-1.5 ${
                isDark
                  ? "bg-slate-800/80 border-slate-700/80 text-emerald-300"
                  : "bg-emerald-50/70 border-emerald-200/80 text-emerald-900"
              }`}
            >
              <BoltIcon className="w-3.5 h-3.5 shrink-0 text-emerald-500 mt-0.5" />
              <span className={isUr ? "guide-bot-urdu-block" : ""}>
                {isUr
                  ? currentStep.checkpoint.ur || currentStep.checkpoint.en
                  : currentStep.checkpoint.en}
              </span>
            </div>
          )}

          {/* Footer Navigation Controls: Auto-Advance Toggle + Prev / Next / Finish */}
          <div
            className="pt-1.5 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2"
            dir="ltr"
          >
            <label className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-slate-500 dark:text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(e) => setAutoAdvance(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
              />
              <span>{isUr ? "خودکار اگلا مرحلہ" : "Auto-next on action"}</span>
            </label>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={stepIndex === 0}
                onClick={() => onStepChange(Math.max(0, stepIndex - 1))}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition-colors ${
                  stepIndex === 0
                    ? "opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-800 text-slate-400"
                    : "cursor-pointer border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                }`}
              >
                {isUr ? "پچھلا" : "← Prev"}
              </button>

              {stepIndex < totalSteps - 1 ? (
                <button
                  ref={primaryNextBtnRef}
                  type="button"
                  onClick={() => onStepChange(stepIndex + 1)}
                  className="px-3 py-1 rounded-xl text-xs font-extrabold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-2xs transition-all cursor-pointer active:scale-95"
                >
                  {isUr ? "اگلا مرحلہ →" : "Next Step →"}
                </button>
              ) : (
                <button
                  ref={primaryNextBtnRef}
                  type="button"
                  onClick={onCloseTour}
                  className="px-3 py-1 rounded-xl text-xs font-extrabold bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-2xs transition-all cursor-pointer active:scale-95"
                >
                  {isUr ? "✓ ٹور مکمل" : "✓ Finish Tour"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
