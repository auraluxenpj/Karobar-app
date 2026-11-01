// resources/js/components/FeatureGuideBot.jsx
import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useId,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  SparklesIcon,
  XMarkIcon,
  Squares2X2Icon,
  CheckCircleIcon,
  BoltIcon,
  CommandLineIcon,
  ArrowTopRightOnSquareIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  ArrowPathIcon,
  QuestionMarkCircleIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  ChevronLeftIcon,
  CursorArrowRaysIcon,
  ExclamationTriangleIcon,
  LightBulbIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "@/context/ThemeContext.jsx";
import {
  GuideBotAvatar,
  CursorBuddyAvatar,
  getGuideBotMascotStyle,
  setGuideBotMascotStyle,
  useGuideBotOpenState,
  useBottomMascotEnabledState,
  useInspectElementState,
} from "./GuideBotTrigger.jsx";
import {
  SCREEN_GUIDES,
  MODULE_CATEGORIES,
  resolveScreenGuide,
  answerUserQuestion,
  routeUserQuery,
  DEMO_MANIFESTS,
  PRODUCT_VERSION,
  MODAL_CONTEXT_GUIDES,
  EVIDENCE_TYPES,
  buildEvidenceBadge,
  explainDomElement,
} from "@/data/guideBotKnowledge.js";

const LANG_STORAGE_KEY = "karobar_guide_bot_lang";

// Feature-detect discrete display transitions (guards against Firefox bug 1882408)
let supportsDisplayTransition;
function canTransitionDisplay() {
  if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
  if (
    typeof window === "undefined" ||
    !window.CSS?.supports?.("transition-behavior", "allow-discrete") ||
    !document.body
  ) {
    return false;
  }
  const probe = document.createElement("div");
  probe.style.cssText = "transition: display 1s allow-discrete !important; display: block;";
  document.body.appendChild(probe);
  window.getComputedStyle(probe).display;
  probe.style.display = "none";
  supportsDisplayTransition = window.getComputedStyle(probe).display === "block";
  probe.remove();
  return supportsDisplayTransition;
}

function supportsTopLayerExit() {
  return (
    typeof window !== "undefined" &&
    Boolean(window.CSS?.supports?.("overlay", "auto")) &&
    canTransitionDisplay()
  );
}

/**
 * Renders inline markdown (**bold** and `code`) cleanly without raw asterisks.
 */
function renderInlineFormatting(line, keyPrefix = "ln") {
  if (!line) return null;
  const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong
          key={`${keyPrefix}-${idx}`}
          className="font-extrabold text-slate-900 dark:text-white"
        >
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={`${keyPrefix}-${idx}`}
          className="px-1.5 py-0.5 mx-0.5 text-[11px] font-mono font-bold rounded bg-slate-200/80 dark:bg-slate-800 text-blue-700 dark:text-blue-300"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={`${keyPrefix}-${idx}`}>{part}</React.Fragment>;
  });
}

function FormattedBotMessage({ text, isUrdu = false }) {
  if (!text) return null;
  const lines = text.split("\n");
  return (
    <div
      lang={isUrdu ? "ur" : "en"}
      dir={isUrdu ? "rtl" : "ltr"}
      className={`space-y-1.5 text-[13.5px] ${
        isUrdu ? "guide-bot-urdu-block" : "guide-bot-body-en"
      } text-slate-700 dark:text-slate-200`}
    >
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;
        return (
          <p key={i} className="leading-relaxed">
            {renderInlineFormatting(line, `p-${i}`)}
          </p>
        );
      })}
    </div>
  );
}

/**
 * Computes the optimal placement ('bottom' | 'top' | 'right' | 'left') and clamped
 * viewport coordinates for the floating Click-to-Explain popover beside a target DOM element.
 */
function computeBestPopoverPlacement(targetEl, cardWidth = 356, cardHeight = 220) {
  if (!targetEl || typeof window === "undefined") {
    return {
      top: 84,
      left: 24,
      placement: "bottom",
      arrowX: 40,
      arrowY: 24,
    };
  }

  const rect = targetEl.getBoundingClientRect();
  const vw = window.innerWidth || 1280;
  const vh = window.innerHeight || 800;
  const margin = 12;
  const gap = 12;

  const effectiveWidth = Math.min(cardWidth, vw - margin * 2);
  const effectiveHeight = Math.min(cardHeight, vh - margin * 2);

  const spaceBottom = vh - rect.bottom - margin;
  const spaceTop = rect.top - margin;
  const spaceRight = vw - rect.right - margin;
  const spaceLeft = rect.left - margin;

  let placement = "bottom";
  if (spaceBottom >= effectiveHeight + gap) {
    placement = "bottom";
  } else if (spaceTop >= effectiveHeight + gap) {
    placement = "top";
  } else if (spaceRight >= effectiveWidth + gap) {
    placement = "right";
  } else if (spaceLeft >= effectiveWidth + gap) {
    placement = "left";
  } else {
    // Pick the direction with the highest available space ratio
    const candidates = [
      { dir: "bottom", score: spaceBottom / Math.max(1, effectiveHeight) },
      { dir: "top", score: spaceTop / Math.max(1, effectiveHeight) },
      { dir: "right", score: spaceRight / Math.max(1, effectiveWidth) },
      { dir: "left", score: spaceLeft / Math.max(1, effectiveWidth) },
    ];
    candidates.sort((a, b) => b.score - a.score);
    placement = candidates[0].dir;
  }

  const targetCenterX = rect.left + rect.width / 2;
  const targetCenterY = rect.top + rect.height / 2;

  let top = margin;
  let left = margin;

  if (placement === "bottom") {
    top = Math.min(
      vh - effectiveHeight - margin,
      Math.max(margin, rect.bottom + gap)
    );
    left = Math.min(
      vw - effectiveWidth - margin,
      Math.max(margin, targetCenterX - effectiveWidth / 2)
    );
  } else if (placement === "top") {
    top = Math.max(
      margin,
      Math.min(vh - effectiveHeight - margin, rect.top - effectiveHeight - gap)
    );
    left = Math.min(
      vw - effectiveWidth - margin,
      Math.max(margin, targetCenterX - effectiveWidth / 2)
    );
  } else if (placement === "right") {
    left = Math.min(
      vw - effectiveWidth - margin,
      Math.max(margin, rect.right + gap)
    );
    top = Math.min(
      vh - effectiveHeight - margin,
      Math.max(margin, targetCenterY - effectiveHeight / 2)
    );
  } else {
    left = Math.max(
      margin,
      Math.min(vw - effectiveWidth - margin, rect.left - effectiveWidth - gap)
    );
    top = Math.min(
      vh - effectiveHeight - margin,
      Math.max(margin, targetCenterY - effectiveHeight / 2)
    );
  }

  const arrowX = Math.round(
    Math.min(effectiveWidth - 22, Math.max(22, targetCenterX - left))
  );
  const arrowY = Math.round(
    Math.min(effectiveHeight - 22, Math.max(22, targetCenterY - top))
  );

  return {
    top: Math.round(top),
    left: Math.round(left),
    width: Math.round(effectiveWidth),
    placement,
    arrowX,
    arrowY,
  };
}

const STALKER_IDLE_TRICKS = [
  {
    id: "clickripple",
    en: "Hi, I'm Cursor! Click any item & I'll explain it! 🎯",
    ur: "میں کرسر ہوں! کسی بھی بٹن پر کلک کریں 🎯",
  },
  {
    id: "spy",
    en: "Cursor is stalking your mouse... click anything! 🕵️‍♂️",
    ur: "کرسر آپ کے ماؤس کے پیچھے ہے! کسی بھی بٹن پر کلک کریں 🕵️‍♂️",
  },
  {
    id: "rubiks",
    en: "Cursor is solving a Rubik's Cube beside you 🧩",
    ur: "کرسر روبکس کیوب حل کر رہا ہے 🧩",
  },
  {
    id: "headphones",
    en: "Cursor is vibing to music with your mouse 🎧",
    ur: "کرسر ہیڈ فون لگا کر میوزک سن رہا ہے 🎧",
  },
  {
    id: "shades",
    en: "Coolest Cursor buddy in town 🕶️",
    ur: "آپ کا کول کرسر دوست 🕶️",
  },
  {
    id: "spin",
    en: "Watch Cursor do a 360° pointer spin! 💫",
    ur: "کرسر کا 360° گھومنے والا کرتب! 💫",
  },
];

/**
 * Standalone Topbar-triggered Click-to-Explain UI Inspector (`ScreenElementInspector`).
 * - Summons a cute AI Stalker Mascot that smoothly follows the user's cursor across the screen
 *   with lifelike spring chase physics, funny status bubbles, and cute tricks (solving Rubik's cube,
 *   wearing headphones, peeking through a magnifying glass, 360° flips, etc.).
 * - Highlights any hovered control on the page while `inspectMode` is active.
 * - On click, displays a floating explanation card right beside the clicked element
 *   (bottom, top, right, or left depending on available viewport space).
 * - Automatically dismisses when clicking anywhere else on the page or pressing Escape.
 */
function ScreenElementInspector({ guide, lang, onSetLang, isDark }) {
  const location = useLocation();
  const [inspectMode, setInspectMode] = useInspectElementState();
  const [inspectedPopover, setInspectedPopover] = useState(null);
  const [hoveredControlLabel, setHoveredControlLabel] = useState(null);
  const [stalkerTrickIdx, setStalkerTrickIdx] = useState(0);
  const popoverRef = useRef(null);
  const highlightedElRef = useRef(null);
  const stalkerElRef = useRef(null);
  const stalkerPosRef = useRef({
    x: typeof window !== "undefined" ? Math.round(window.innerWidth * 0.65) : 520,
    y: 86,
  });
  const isUr = lang === "ur";

  const clearElementHighlight = useCallback(() => {
    if (highlightedElRef.current) {
      highlightedElRef.current.classList.remove("guide-bot-dom-highlight");
      highlightedElRef.current = null;
    }
    if (typeof document !== "undefined") {
      document
        .querySelectorAll(".guide-bot-dom-highlight, .guide-bot-inspect-hover")
        .forEach((el) => {
          el.classList.remove("guide-bot-dom-highlight");
          el.classList.remove("guide-bot-inspect-hover");
        });
    }
  }, []);

  const dismissPopover = useCallback(() => {
    setInspectedPopover(null);
    clearElementHighlight();
  }, [clearElementHighlight]);

  // Clear inspect mode and any open popover only when the route actually changes after mount
  const prevRouteKeyRef = useRef(
    `${location.pathname}|${location.search}|${location.hash}`
  );
  useEffect(() => {
    const nextKey = `${location.pathname}|${location.search}|${location.hash}`;
    if (prevRouteKeyRef.current !== nextKey) {
      prevRouteKeyRef.current = nextKey;
      setInspectMode(false);
      dismissPopover();
    }
  }, [location.pathname, location.search, location.hash, setInspectMode, dismissPopover]);

  // Clear any previous popover when entering inspect mode
  useEffect(() => {
    if (inspectMode) {
      dismissPopover();
      setHoveredControlLabel(null);
    }
  }, [inspectMode, dismissPopover]);

  // Cycle through cute stalker tricks when following the cursor
  useEffect(() => {
    if (!inspectMode && !inspectedPopover) return;
    const timer = window.setInterval(() => {
      setStalkerTrickIdx((prev) => (prev + 1) % STALKER_IDLE_TRICKS.length);
    }, 2800);
    return () => window.clearInterval(timer);
  }, [inspectMode, inspectedPopover]);

  // Hide the native OS cursor while `inspectMode` is active and lock our animated
  // Cursor arrow 1:1 to the exact mouse pointer hotspot (no second cursor, no question mark!)
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!inspectMode) {
      document.documentElement.classList.remove("guide-bot-inspect-active");
      return;
    }

    document.documentElement.classList.add("guide-bot-inspect-active");

    // Seed initial position near the Topbar Explain button if present
    const triggerBtn = document.querySelector("[data-inspect-trigger]");
    if (triggerBtn) {
      const r = triggerBtn.getBoundingClientRect();
      if (r.width > 0) {
        const initX = Math.round(r.left + r.width / 2);
        const initY = Math.round(r.top + r.height / 2);
        stalkerPosRef.current = { x: initX, y: initY };
        if (stalkerElRef.current) {
          stalkerElRef.current.style.transform = `translate3d(${initX - 4}px, ${
            initY - 3
          }px, 0)`;
        }
      }
    }

    const handleMouseMove = (e) => {
      const x = e.clientX;
      const y = e.clientY;
      stalkerPosRef.current = { x, y };
      if (stalkerElRef.current) {
        // Hotspot of CursorBuddyAvatar tip is at (4px, 3px) -> lock 1:1 to mouse point
        stalkerElRef.current.style.transform = `translate3d(${x - 4}px, ${
          y - 3
        }px, 0)`;
      }
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => {
      document.documentElement.classList.remove("guide-bot-inspect-active");
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [inspectMode]);

  // Hover + Click-to-Explain capture listener when `inspectMode` is active
  useEffect(() => {
    if (!inspectMode || typeof document === "undefined") return;

    let hoveredEl = null;
    const clearHover = () => {
      if (hoveredEl) {
        hoveredEl.classList.remove("guide-bot-inspect-hover");
        hoveredEl = null;
      }
      setHoveredControlLabel(null);
    };

    const resolveTableHeaderForCell = (el) => {
      const cell = el?.closest?.("td, th");
      if (!cell) return "";
      if (cell.tagName?.toLowerCase() === "th") {
        return (cell.innerText || "").replace(/\s+/g, " ").trim();
      }
      const table = cell.closest?.("table");
      if (!table) return "";
      const allThs = Array.from(table.querySelectorAll("thead th"));
      if (!allThs.length) return "";

      const cellRect = cell.getBoundingClientRect?.();
      if (cellRect && cellRect.width > 0) {
        const centerX = cellRect.left + cellRect.width / 2;
        const matchingThs = allThs
          .map((th) => ({ th, rect: th.getBoundingClientRect?.() }))
          .filter(
            ({ rect }) =>
              rect &&
              rect.width > 0 &&
              centerX >= rect.left - 2 &&
              centerX <= rect.right + 2
          );
        if (matchingThs.length > 0) {
          matchingThs.sort((a, b) => b.rect.top - a.rect.top);
          const bestText = (matchingThs[0].th.innerText || "").replace(/\s+/g, " ").trim();
          if (bestText) return bestText;
        }
      }

      const lastRowThs = table.querySelectorAll("thead tr:last-child th");
      if (lastRowThs && lastRowThs[cell.cellIndex]) {
        return (lastRowThs[cell.cellIndex].innerText || "").replace(/\s+/g, " ").trim();
      }
      if (allThs[cell.cellIndex]) {
        return (allThs[cell.cellIndex].innerText || "").replace(/\s+/g, " ").trim();
      }
      return "";
    };

    const resolveInspectableTarget = (rawTarget) => {
      if (!rawTarget || rawTarget === document.body || rawTarget === document.documentElement) {
        return null;
      }

      // 1. Direct interactive controls (buttons, inputs, selects, links, custom dropdowns)
      const directControl = rawTarget.closest?.(
        "button, a, input, select, textarea, [role='button'], [role='tab'], [role='switch'], [role='combobox'], .react-select__control, .rs__control"
      );
      if (directControl && !directControl.classList?.contains("workspace-dock-trigger")) {
        return directControl;
      }

      // 2. Labels & Table Headers
      const labelOrTh = rawTarget.closest?.("label, th");
      if (labelOrTh) {
        const innerControl = labelOrTh.querySelector?.("input, select, textarea, button");
        return innerControl || labelOrTh;
      }

      // 3. Table Data Cells (if cell wraps a single input/select/button, inspect that control; otherwise inspect the cell)
      const td = rawTarget.closest?.("td");
      if (td) {
        const innerControls = td.querySelectorAll?.("input, select, textarea, button");
        if (innerControls && innerControls.length === 1) {
          return innerControls[0];
        }
        return td;
      }

      // 4. Compact UI sections, KPI stat cards, badges, or headings (avoid huge full-page wrappers)
      let cursor = rawTarget;
      while (cursor && cursor !== document.body) {
        const rect = cursor.getBoundingClientRect?.();
        const tag = (cursor.tagName || "").toLowerCase();
        if (rect && rect.width > 16 && rect.height > 14) {
          if (["h1", "h2", "h3", "h4", "dt", "dd", "summary"].includes(tag)) {
            return cursor;
          }
          if (
            rect.width <= 460 &&
            rect.height <= 220 &&
            (cursor.innerText || "").trim().length > 0
          ) {
            return cursor;
          }
        }
        cursor = cursor.parentElement;
      }

      if (
        rawTarget.matches?.(
          ".workspace-shell, .workspace-main, .workspace-content, .workspace-page, .workspace-sidebar-slot, .workspace-topbar-slot, .workspace-dock-trigger, .workspace-dock-floating, main, header, aside, nav"
        )
      ) {
        return null;
      }

      return rawTarget;
    };

    const extractShortLabel = (el) => {
      if (!el) return null;
      const thText = resolveTableHeaderForCell(el);
      let fieldLabel = "";
      const closestLabel = el.closest?.("label");
      if (closestLabel) {
        fieldLabel = (closestLabel.innerText || "").trim();
      } else if (el.id) {
        try {
          const forLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (forLabel) fieldLabel = (forLabel.innerText || "").trim();
        } catch {
          // ignore selector errors
        }
      }
      if (!fieldLabel) {
        let p = el.parentElement;
        for (let i = 0; i < 3 && p && p !== document.body; i++) {
          const r = p.getBoundingClientRect?.();
          if (r && r.height <= 110 && p.querySelectorAll?.("input, select, textarea").length <= 2) {
            const lbl = p.querySelector?.("label");
            if (lbl && lbl.innerText) {
              fieldLabel = lbl.innerText.trim();
              break;
            }
          }
          p = p.parentElement;
        }
      }

      const raw =
        fieldLabel ||
        thText ||
        el.getAttribute?.("aria-label") ||
        el.getAttribute?.("title") ||
        el.getAttribute?.("placeholder") ||
        (el.innerText || "").trim() ||
        (el.value || "").trim();
      const cleaned = String(raw || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!cleaned) return null;
      return cleaned.length > 28 ? `${cleaned.slice(0, 26)}…` : cleaned;
    };

    const handleMouseOver = (e) => {
      const target = e.target;
      if (
        !target ||
        target.closest?.("[data-inspect-trigger]") ||
        target.closest?.("[data-inspector-popover]") ||
        target.closest?.("[data-inspector-banner]") ||
        target.closest?.("[data-roaming-cube]") ||
        target.closest?.(".guide-bot-drawer")
      ) {
        clearHover();
        return;
      }
      const interactive = resolveInspectableTarget(target);
      if (!interactive) {
        clearHover();
        return;
      }
      if (interactive !== hoveredEl) {
        if (hoveredEl) {
          hoveredEl.classList.remove("guide-bot-inspect-hover");
        }
        hoveredEl = interactive;
        hoveredEl.classList.add("guide-bot-inspect-hover");
        setHoveredControlLabel(extractShortLabel(hoveredEl));
      }
    };

    const handleClickCapture = (e) => {
      const target = e.target;
      if (!target) return;

      // Allow clicking the Topbar Explain button or Cancel pill to toggle/exit
      if (
        target.closest?.("[data-inspect-trigger]") ||
        target.closest?.("[data-inspector-banner]")
      ) {
        clearHover();
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      clearHover();

      const inspectedEl = resolveInspectableTarget(target) || target;

      clearElementHighlight();
      inspectedEl.classList.add("guide-bot-dom-highlight");
      highlightedElRef.current = inspectedEl;

      const explanation = explainDomElement(inspectedEl, guide);
      setInspectMode(false);

      if (explanation) {
        const initialLayout = computeBestPopoverPlacement(inspectedEl, 370, 250);
        setInspectedPopover({
          element: inspectedEl,
          explanation,
          layout: initialLayout,
        });
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        clearHover();
        setInspectMode(false);
      }
    };

    document.addEventListener("mouseover", handleMouseOver, true);
    document.addEventListener("click", handleClickCapture, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearHover();
      document.removeEventListener("mouseover", handleMouseOver, true);
      document.removeEventListener("click", handleClickCapture, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [inspectMode, guide, setInspectMode, clearElementHighlight]);

  // Measure actual popover height and keep it anchored beside the target element on scroll/resize
  useLayoutEffect(() => {
    if (!inspectedPopover?.element || !popoverRef.current) return;

    const updatePosition = () => {
      const el = inspectedPopover.element;
      const card = popoverRef.current;
      if (!el || !card || !document.body.contains(el)) {
        dismissPopover();
        return;
      }
      const measuredHeight = card.offsetHeight || 220;
      const nextLayout = computeBestPopoverPlacement(el, 360, measuredHeight);
      setInspectedPopover((prev) => {
        if (!prev) return null;
        if (
          prev.layout.top === nextLayout.top &&
          prev.layout.left === nextLayout.left &&
          prev.layout.placement === nextLayout.placement &&
          prev.layout.arrowX === nextLayout.arrowX &&
          prev.layout.arrowY === nextLayout.arrowY
        ) {
          return prev;
        }
        return { ...prev, layout: nextLayout };
      });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [inspectedPopover?.element, inspectedPopover?.explanation, lang, dismissPopover]);

  // Light-dismiss when clicking anywhere on the page outside the floating explanation popover
  useEffect(() => {
    if (!inspectedPopover || typeof document === "undefined") return;

    const handlePointerDownOutside = (e) => {
      const target = e.target;
      if (!target) return;
      if (popoverRef.current && popoverRef.current.contains(target)) {
        return;
      }
      if (target.closest?.("[data-inspect-trigger]")) {
        return;
      }
      dismissPopover();
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        dismissPopover();
      }
    };

    document.addEventListener("pointerdown", handlePointerDownOutside, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDownOutside, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [inspectedPopover, dismissPopover]);

  if (typeof document === "undefined" || (!inspectMode && !inspectedPopover)) {
    return null;
  }

  const currentStalkerTrick =
    STALKER_IDLE_TRICKS[stalkerTrickIdx % STALKER_IDLE_TRICKS.length] ||
    STALKER_IDLE_TRICKS[0];

  const activeStalkerTrickId = hoveredControlLabel
    ? "spy"
    : currentStalkerTrick.id;

  return createPortal(
    <>
      {/* =================================================================== */}
      {/* SIMPLE BASELINE CURSOR (Replaces OS cursor 1:1 at tip hotspot 4,3)  */}
      {/* Wrapped in a viewport-clipped fixed layer so it never overflows right */}
      {/* =================================================================== */}
      {inspectMode && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[1000002] pointer-events-none overflow-hidden select-none"
        >
          <div
            ref={stalkerElRef}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              pointerEvents: "none",
              willChange: "transform",
              transform: `translate3d(${stalkerPosRef.current.x - 4}px, ${
                stalkerPosRef.current.y - 3
              }px, 0)`,
            }}
          >
            {/* Simple Baseline Pointer Arrow (Tip anchored at 4px, 3px) */}
            <CursorBuddyAvatar
              className="w-6 h-6 drop-shadow-xs"
              fullBody={true}
              speaking={Boolean(hoveredControlLabel)}
            />

            {/* Compact Label Badge Tucked Beside the Cursor Tail only when hovering a control */}
            {hoveredControlLabel && (
              <div
                dir={isUr ? "rtl" : "ltr"}
                lang={isUr ? "ur" : "en"}
                className={`ml-5 -mt-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold whitespace-nowrap shadow-md border bg-slate-900/95 text-amber-300 border-amber-400/70 ${
                  isUr ? "guide-bot-urdu-inline" : ""
                }`}
              >
                {isUr
                  ? `کلک کریں: ${hoveredControlLabel}`
                  : `Click to explain: ${hoveredControlLabel}`}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top Floating Instruction Pill while Inspect Mode is active */}
      {inspectMode && (
        <div
          data-inspector-banner="true"
          dir={isUr ? "rtl" : "ltr"}
          lang={isUr ? "ur" : "en"}
          className="fixed top-14 left-1/2 -translate-x-1/2 z-[1000001] max-w-[92vw] px-3.5 py-1.5 rounded-2xl border shadow-xl bg-slate-900/95 dark:bg-slate-900/95 border-cyan-400/70 text-white flex items-center gap-2.5 text-xs font-bold backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <CursorBuddyAvatar
            className="w-4 h-4 shrink-0"
            fullBody={false}
          />
          <span className={isUr ? "guide-bot-urdu-inline" : ""}>
            {isUr
              ? "کسی بھی بٹن، خانے یا کالم کی تفصیل اور شارٹ کٹ دیکھنے کے لیے اس پر کلک کریں!"
              : "Click any button, field, or column to see its detailed explanation & keyboard shortcut!"}
          </span>
          <button
            type="button"
            onClick={() => setInspectMode(false)}
            className="px-2 py-0.5 rounded-lg text-[10.5px] font-extrabold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer shrink-0"
          >
            {isUr ? "منسوخ (Esc)" : "Stop (Esc)"}
          </button>
        </div>
      )}

      {/* Floating Explanation Card Positioned Beside the Clicked Element */}
      {inspectedPopover && (
        <div
          ref={popoverRef}
          data-inspector-popover="true"
          role="dialog"
          aria-label="UI Element Explanation"
          dir={isUr ? "rtl" : "ltr"}
          lang={isUr ? "ur" : "en"}
          style={{
            position: "fixed",
            top: `${inspectedPopover.layout.top}px`,
            left: `${inspectedPopover.layout.left}px`,
            width: `${inspectedPopover.layout.width || 370}px`,
            zIndex: 1000001,
          }}
          className={`rounded-2xl border shadow-2xl transition-opacity duration-150 ${
            isDark
              ? "bg-slate-900/98 border-cyan-500/60 text-slate-100 shadow-black/70"
              : "bg-white/98 border-cyan-500/70 text-slate-800 shadow-slate-900/25"
          } backdrop-blur-md`}
        >
          {/* Directional Pointer Diamond pointing toward the inspected element */}
          {inspectedPopover.layout.placement === "bottom" && (
            <div
              aria-hidden="true"
              style={{ left: `${inspectedPopover.layout.arrowX - 6}px` }}
              className={`absolute -top-1.5 w-3 h-3 rotate-45 border-l border-t ${
                isDark
                  ? "bg-slate-900 border-cyan-500/60"
                  : "bg-white border-cyan-500/70"
              }`}
            />
          )}
          {inspectedPopover.layout.placement === "top" && (
            <div
              aria-hidden="true"
              style={{ left: `${inspectedPopover.layout.arrowX - 6}px` }}
              className={`absolute -bottom-1.5 w-3 h-3 rotate-45 border-r border-b ${
                isDark
                  ? "bg-slate-900 border-cyan-500/60"
                  : "bg-white border-cyan-500/70"
              }`}
            />
          )}
          {inspectedPopover.layout.placement === "right" && (
            <div
              aria-hidden="true"
              style={{ top: `${inspectedPopover.layout.arrowY - 6}px` }}
              className={`absolute -left-1.5 w-3 h-3 rotate-45 border-l border-b ${
                isDark
                  ? "bg-slate-900 border-cyan-500/60"
                  : "bg-white border-cyan-500/70"
              }`}
            />
          )}
          {inspectedPopover.layout.placement === "left" && (
            <div
              aria-hidden="true"
              style={{ top: `${inspectedPopover.layout.arrowY - 6}px` }}
              className={`absolute -right-1.5 w-3 h-3 rotate-45 border-r border-t ${
                isDark
                  ? "bg-slate-900 border-cyan-500/60"
                  : "bg-white border-cyan-500/70"
              }`}
            />
          )}

          {/* Header: Simple Baseline Cursor Icon + Control Title + Type & Shortcut Badges + Language Switcher + Close */}
          <div
            className={`px-3.5 py-2 border-b flex items-center justify-between gap-2 rounded-t-2xl ${
              isDark
                ? "bg-slate-950/80 border-slate-800"
                : "bg-cyan-50/70 border-slate-200/80"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <CursorBuddyAvatar
                className="w-5 h-5 shrink-0"
                fullBody={false}
              />
              <div className="min-w-0 flex-1">
                <h3
                  className={`text-xs font-extrabold truncate text-slate-900 dark:text-white ${
                    isUr ? "guide-bot-urdu-inline" : ""
                  }`}
                >
                  {(isUr
                    ? inspectedPopover.explanation.title?.ur
                    : inspectedPopover.explanation.title?.en
                  )?.replace(/^(UI Inspector:\s*|اسکرین انسپکٹر:\s*)/i, "") ||
                    (isUr ? "کنٹرول کی وضاحت" : "Control Explanation")}
                </h3>
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  {(inspectedPopover.explanation.badge?.en ||
                    inspectedPopover.explanation.badge?.ur) && (
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9.5px] font-bold ${
                        isDark
                          ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                          : "bg-cyan-100/90 text-cyan-800 border border-cyan-300/70"
                      } ${isUr ? "guide-bot-urdu-inline" : ""}`}
                    >
                      {isUr
                        ? inspectedPopover.explanation.badge?.ur ||
                          inspectedPopover.explanation.badge?.en
                        : inspectedPopover.explanation.badge?.en}
                    </span>
                  )}
                  {inspectedPopover.explanation.shortcut?.keys && (
                    <kbd
                      dir="ltr"
                      className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9.5px] font-mono font-extrabold ${
                        isDark
                          ? "bg-amber-500/20 text-amber-300 border border-amber-400/40"
                          : "bg-amber-100 text-amber-900 border border-amber-300"
                      }`}
                    >
                      <span>⌨</span>
                      <span>{inspectedPopover.explanation.shortcut.keys}</span>
                    </kbd>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0" dir="ltr">
              <div
                role="group"
                aria-label="Explanation Language"
                className={`inline-flex items-center p-0.5 rounded-lg border ${
                  isDark
                    ? "bg-slate-800 border-slate-700"
                    : "bg-white border-slate-200"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSetLang("en")}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                    lang === "en"
                      ? "bg-slate-900 dark:bg-blue-600 text-white"
                      : "text-slate-500 dark:text-slate-300"
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => onSetLang("ur")}
                  lang="ur"
                  dir="rtl"
                  className={`guide-bot-urdu-inline px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                    lang === "ur"
                      ? "bg-emerald-500 text-white"
                      : "text-slate-500 dark:text-slate-300"
                  }`}
                >
                  اردو
                </button>
              </div>

              <button
                type="button"
                onClick={dismissPopover}
                aria-label="Close explanation"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body: Formatted Explanation */}
          <div className="p-3.5 max-h-[55vh] overflow-y-auto space-y-2">
            <FormattedBotMessage
              text={
                isUr
                  ? inspectedPopover.explanation.ur || inspectedPopover.explanation.en
                  : inspectedPopover.explanation.en
              }
              isUrdu={isUr}
            />
          </div>

          {/* Footer: Quick Re-Inspect or Click-Anywhere Hint */}
          <div
            className={`px-3.5 py-2 border-t flex items-center justify-between gap-2 rounded-b-2xl text-[10.5px] ${
              isDark
                ? "bg-slate-950/50 border-slate-800 text-slate-400"
                : "bg-slate-50/80 border-slate-200/70 text-slate-500"
            }`}
          >
            <span className="truncate">
              {isUr
                ? "بند کرنے کے لیے صفحے پر کہیں بھی کلک کریں"
                : "Click anywhere on page to dismiss"}
            </span>
            <button
              type="button"
              onClick={() => {
                dismissPopover();
                setInspectMode(true);
              }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-extrabold text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 transition-colors cursor-pointer shrink-0"
            >
              <CursorArrowRaysIcon className="w-3 h-3 shrink-0" />
              <span>{isUr ? "دوسرا بٹن چیک کریں" : "Explain Another"}</span>
            </button>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}

// Stationary tricks performed along the bottom
const STATIONARY_TRICKS = [
  { id: "rubiks", durationMs: 3600, badge: "Solving Cube 🧩" },
  { id: "headphones", durationMs: 3600, badge: "Music Vibe 🎧" },
  { id: "backflip", durationMs: 2600, badge: "360° Flip! 🤸" },
  { id: "dance", durationMs: 3400, badge: "Robot Boogie ♪" },
  { id: "juggle", durationMs: 3200, badge: "Cube Juggle 🎲" },
  { id: "shades", durationMs: 3000, badge: "Cool Shades 🕶️" },
  { id: "charge", durationMs: 3000, badge: "Supercharge ⚡" },
  { id: "scan", durationMs: 2800, badge: "Screen Scan 🔍" },
];

// Stage tricks performed by the mascot inside the Guide Bot popup header when open
const POPUP_STAGE_TRICKS = [
  { id: "rubiks", en: "Solving Cube 🧩", ur: "کیوب حل کر رہا ہے 🧩" },
  { id: "headphones", en: "Vibing to Music 🎧", ur: "میوزک سن رہا ہے 🎧" },
  { id: "juggle", en: "Cube Juggle 🎲", ur: "کیوب جگنگ 🎲" },
  { id: "shades", en: "Cool Shades 🕶️", ur: "کول چشمہ 🕶️" },
  { id: "charge", en: "Coffee Boost ☕", ur: "کافی بوسٹ ☕" },
  { id: "dance", en: "Robot Groove ♫", ur: "روبوٹ ڈانس ♫" },
  { id: "backflip", en: "360° Flip 🤸", ur: "360° فلپ 🤸" },
];

const TRICK_BADGES = {
  rubiks: "Solving Cube 🧩",
  headphones: "Music Vibe 🎧",
  spy: "Inspecting 🕵️‍♂️",
  backflip: "360° Flip! 🤸",
  dance: "Robot Boogie ♪",
  juggle: "Cube Juggle 🎲",
  shades: "Cool Shades 🕶️",
  charge: "Supercharge ⚡",
  scan: "Screen Scan 🔍",
  hoverboard: "Hover-Glide 🛹",
  sleep: "Resting... 💤",
  wake: "Ready! ⚡",
};

/**
 * Bottom Free-Roaming Full-Body Cube Companion (`RoamingCubeCompanion`):
 * - Roams freely along the bottom of the app with a cute walking cycle, full Cube body,
 *   and an autonomous Finite State Machine that performs 8 entertaining tricks:
 *   ('backflip', 'dance', 'hoverboard', 'juggle', 'shades', 'charge', 'scan', 'sleep' + 'wake').
 * - Portaled to `document.body` inside a viewport-clipped fixed container so it never affects
 *   layout or causes horizontal overflow.
 */
function RoamingCubeCompanion({ onOpen, screenTitle }) {
  const mascotBtnRef = useRef(null);
  const stateRef = useRef({
    x: 320,
    bottomOffset: 6,
    isWalking: false,
    walkDirection: "left",
    moveDurationMs: 0,
    activeTrick: "dance",
    isVanishing: false,
    isHovered: false,
  });
  const roamTimerRef = useRef(null);
  const actionEndTimerRef = useRef(null);
  const lastTrickRef = useRef("dance");
  const lastUserActivityRef = useRef(Date.now());
  const stepCounterRef = useRef(0);
  const sidebarBoundsCacheRef = useRef({ minX: 28, ts: 0 });

  const [state, setState] = useState(() => {
    const startX =
      typeof window !== "undefined"
        ? Math.max(140, Math.min(window.innerWidth - 140, Math.round(window.innerWidth * 0.56)))
        : 320;
    const initial = {
      x: startX,
      bottomOffset: 6,
      isWalking: false,
      walkDirection: "left",
      moveDurationMs: 0,
      activeTrick: "dance",
      isVanishing: false,
      isHovered: false,
    };
    stateRef.current = initial;
    return initial;
  });

  const updateState = useCallback((patch) => {
    setState((prev) => {
      const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
      stateRef.current = next;
      return next;
    });
  }, []);

  const pickNextTrick = useCallback(() => {
    const candidates = STATIONARY_TRICKS.filter((t) => t.id !== lastTrickRef.current);
    const chosen =
      candidates[Math.floor(Math.random() * candidates.length)] || STATIONARY_TRICKS[0];
    lastTrickRef.current = chosen.id;
    return chosen;
  }, []);

  const findSafeSpot = useCallback((avoidX = null, currentX = stateRef.current.x) => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return { x: 320, bottomOffset: 6 };
    }

    const vw = window.innerWidth;
    const cubeW = 68;
    const now = Date.now();

    if (now - sidebarBoundsCacheRef.current.ts > 4000) {
      let minX = 28;
      const sidebarEl = document.querySelector(".workspace-sidebar");
      if (sidebarEl) {
        const sbRect = sidebarEl.getBoundingClientRect();
        if (sbRect.width > 0 && sbRect.right > 0 && sbRect.left >= 0 && sbRect.right < vw * 0.5) {
          minX = Math.max(28, Math.ceil(sbRect.right + 20));
        }
      }
      sidebarBoundsCacheRef.current = { minX, ts: now };
    }

    const minX = sidebarBoundsCacheRef.current.minX;
    const maxX = Math.max(minX + 40, vw - cubeW - 48);

    const safeSlots = [];
    for (let candX = minX; candX <= maxX; candX += 36) {
      safeSlots.push(candX);
    }

    if (safeSlots.length > 0) {
      if (typeof avoidX === "number") {
        const farSlots = safeSlots.filter((sx) => Math.abs(sx + cubeW / 2 - avoidX) >= 140);
        if (farSlots.length > 0) {
          farSlots.sort(
            (a, b) => Math.abs(b + cubeW / 2 - avoidX) - Math.abs(a + cubeW / 2 - avoidX)
          );
          return { x: farSlots[0], bottomOffset: 6 };
        }
      }

      const strollSlots = safeSlots.filter(
        (sx) => Math.abs(sx - currentX) >= 90 && Math.abs(sx - currentX) <= 360
      );
      const pool = strollSlots.length > 0 ? strollSlots : safeSlots;
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      return { x: chosen, bottomOffset: 6 };
    }

    return { x: Math.round((minX + maxX) * 0.62), bottomOffset: 6 };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let isCancelled = false;

    const clearTimers = () => {
      if (roamTimerRef.current) window.clearTimeout(roamTimerRef.current);
      if (actionEndTimerRef.current) window.clearTimeout(actionEndTimerRef.current);
    };

    const runCycle = (delayMs = 900) => {
      if (isCancelled) return;
      if (roamTimerRef.current) window.clearTimeout(roamTimerRef.current);

      roamTimerRef.current = window.setTimeout(() => {
        if (isCancelled) return;

        if (typeof document !== "undefined" && document.hidden) {
          runCycle(3000);
          return;
        }

        const cur = stateRef.current;
        if (cur.isVanishing) return;

        if (cur.isHovered) {
          runCycle(1200);
          return;
        }

        const inactiveMs = Date.now() - lastUserActivityRef.current;
        if (inactiveMs > 45000) {
          if (cur.activeTrick !== "sleep") {
            updateState({
              isWalking: false,
              moveDurationMs: 0,
              activeTrick: "sleep",
            });
          }
          runCycle(3500);
          return;
        }

        stepCounterRef.current += 1;
        const doStationaryTrick = stepCounterRef.current % 3 !== 0;

        if (doStationaryTrick) {
          const trickSpec = pickNextTrick();
          updateState({
            isWalking: false,
            moveDurationMs: 0,
            activeTrick: trickSpec.id,
          });

          if (actionEndTimerRef.current) window.clearTimeout(actionEndTimerRef.current);
          actionEndTimerRef.current = window.setTimeout(() => {
            if (isCancelled) return;
            updateState((prev) =>
              prev.activeTrick === trickSpec.id ? { ...prev, activeTrick: null } : prev
            );
            runCycle(1100);
          }, trickSpec.durationMs);
          return;
        }

        const nextSpot = findSafeSpot(null, cur.x);
        const dist = Math.abs(nextSpot.x - cur.x);

        if (dist < 30 && nextSpot.bottomOffset === cur.bottomOffset) {
          const trickSpec = pickNextTrick();
          updateState({
            isWalking: false,
            moveDurationMs: 0,
            activeTrick: trickSpec.id,
          });
          if (actionEndTimerRef.current) window.clearTimeout(actionEndTimerRef.current);
          actionEndTimerRef.current = window.setTimeout(() => {
            if (isCancelled) return;
            updateState({ activeTrick: null });
            runCycle(1100);
          }, trickSpec.durationMs);
          return;
        }

        const useHoverboard = dist >= 140 && Math.random() < 0.55;
        const speedPxPerSec = useHoverboard ? 115 : 75;
        const durationMs = Math.min(
          3400,
          Math.max(1200, Math.round((dist / speedPxPerSec) * 1000))
        );
        const dir = nextSpot.x < cur.x ? "left" : "right";

        updateState({
          x: nextSpot.x,
          bottomOffset: nextSpot.bottomOffset,
          isWalking: !useHoverboard,
          walkDirection: dir,
          moveDurationMs: durationMs,
          activeTrick: useHoverboard ? "hoverboard" : null,
        });

        if (actionEndTimerRef.current) window.clearTimeout(actionEndTimerRef.current);
        actionEndTimerRef.current = window.setTimeout(() => {
          if (isCancelled) return;
          updateState({
            isWalking: false,
            moveDurationMs: 0,
            activeTrick: null,
          });
          runCycle(600);
        }, durationMs);
      }, delayMs);
    };

    const initialSpot = findSafeSpot(null, stateRef.current.x);
    updateState({
      x: initialSpot.x,
      bottomOffset: initialSpot.bottomOffset,
      moveDurationMs: 0,
      activeTrick: "dance",
    });
    runCycle(2600);

    return () => {
      isCancelled = true;
      clearTimers();
    };
  }, [findSafeSpot, pickNextTrick, updateState]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const recordUserActivity = () => {
      const now = Date.now();
      if (now - lastUserActivityRef.current < 1500 && stateRef.current.activeTrick !== "sleep") {
        return;
      }
      lastUserActivityRef.current = now;
      if (stateRef.current.activeTrick === "sleep") {
        updateState({
          activeTrick: "wake",
          isWalking: false,
        });
        window.setTimeout(() => {
          updateState((prev) =>
            prev.activeTrick === "wake" ? { ...prev, activeTrick: "backflip" } : prev
          );
        }, 480);
      }
    };

    const handleFocusIn = (e) => {
      recordUserActivity();
      const target = e.target;
      if (!target || typeof target.getBoundingClientRect !== "function") return;
      if (target.closest?.("[data-roaming-cube]")) return;
      const r = target.getBoundingClientRect();
      const vh = window.innerHeight;
      const cur = stateRef.current;
      const cubeLeft = cur.x - 10;
      const cubeRight = cur.x + 78;
      const cubeTop = vh - cur.bottomOffset - 86;

      if (r.bottom >= cubeTop && r.right >= cubeLeft && r.left <= cubeRight) {
        const next = findSafeSpot(r.left + r.width / 2, cur.x);
        const dir = next.x < cur.x ? "left" : "right";
        updateState({
          x: next.x,
          bottomOffset: next.bottomOffset,
          isWalking: true,
          walkDirection: dir,
          moveDurationMs: 420,
          activeTrick: null,
        });
        window.setTimeout(() => {
          updateState({ isWalking: false, moveDurationMs: 0 });
        }, 440);
      }
    };

    window.addEventListener("focusin", handleFocusIn, { passive: true });
    window.addEventListener("keydown", recordUserActivity, { passive: true });
    window.addEventListener("pointerdown", recordUserActivity, { passive: true });

    return () => {
      window.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("keydown", recordUserActivity);
      window.removeEventListener("pointerdown", recordUserActivity);
    };
  }, [findSafeSpot, updateState]);

  if (typeof document === "undefined") return null;

  const handleClickMascot = () => {
    updateState({
      isVanishing: true,
      isWalking: false,
      activeTrick: null,
    });
    window.setTimeout(() => {
      onOpen?.();
    }, 140);
  };

  const pillText = state.isHovered
    ? "Ask Guide Bot ✨"
    : state.activeTrick && TRICK_BADGES[state.activeTrick]
    ? TRICK_BADGES[state.activeTrick]
    : null;

  return createPortal(
    <div
      data-roaming-cube="true"
      className="hidden md:block fixed inset-x-0 bottom-0 h-32 z-40 pointer-events-none overflow-hidden select-none"
    >
      <div
        className="absolute bottom-0 left-0 pointer-events-none"
        style={{
          transform: `translate3d(${state.x}px, -${state.bottomOffset}px, 0)`,
          transitionProperty: "transform",
          transitionDuration: `${state.moveDurationMs}ms`,
          transitionTimingFunction: "linear",
        }}
      >
        <button
          ref={mascotBtnRef}
          type="button"
          data-roaming-cube="true"
          onClick={handleClickMascot}
          onMouseEnter={() => updateState({ isHovered: true })}
          onMouseLeave={() => updateState({ isHovered: false })}
          aria-label="Open Guide Bot"
          title={screenTitle ? `Guide Bot — Explain ${screenTitle}` : "Click to open Guide Bot"}
          className={`group relative pointer-events-auto flex flex-col items-center cursor-pointer focus:outline-hidden transition-all duration-200 ${
            state.isVanishing
              ? "opacity-0 -translate-y-6 scale-75"
              : "opacity-100 translate-y-0 scale-100 hover:-translate-y-1"
          }`}
        >
          <span
            className={`mb-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold whitespace-nowrap shadow-md border transition-all duration-200 pointer-events-none ${
              pillText
                ? "opacity-100 translate-y-0 scale-100"
                : "opacity-0 translate-y-1 scale-95"
            } ${
              state.isHovered
                ? "bg-blue-600 text-white border-blue-400"
                : "bg-slate-900/95 text-white border-slate-700 dark:bg-white/95 dark:text-slate-900 dark:border-slate-200"
            }`}
          >
            {pillText || "Guide Bot ✨"}
          </span>

          <GuideBotAvatar
            className="w-[72px] h-[84px] drop-shadow-lg"
            fullBody={true}
            walking={state.isWalking}
            walkDirection={state.walkDirection}
            waving={state.isHovered}
            trick={state.activeTrick}
          />
        </button>
      </div>
    </div>,
    document.body
  );
}

export default function FeatureGuideBot({ isOpen, onClose }) {
  const [, setSharedIsOpen] = useGuideBotOpenState();
  const [bottomMascotEnabled] = useBottomMascotEnabledState();
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const dialogRef = useRef(null);
  const askInputRef = useRef(null);
  const chatEndRef = useRef(null);
  const typingTimerRef = useRef(null);
  const closingPromiseRef = useRef(null);
  const pointerDownInsideRef = useRef(false);
  const modeSwitchRef = useRef(false);
  const titleId = useId();

  // Keep DOM mounted while smooth exit animation plays
  const [isRendered, setIsRendered] = useState(isOpen);
  const [isExpandedWidth, setIsExpandedWidth] = useState(false);

  // Single active language ('en' | 'ur')
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      return saved === "ur" ? "ur" : "en";
    } catch {
      return "en";
    }
  });

  const isUr = lang === "ur";

  const handleSetLang = useCallback((nextLang) => {
    setLang(nextLang);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, nextLang);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent("guide-bot-lang-changed", { detail: nextLang }));
  }, []);

  const [showDirectory, setShowDirectory] = useState(false);
  const [previewKey, setPreviewKey] = useState(null);

  // Resolved guide for the user's current live screen
  const sensedScreenGuide = useMemo(
    () =>
      resolveScreenGuide(location.pathname, location.search, location.hash) ||
      SCREEN_GUIDES["/dashboard"],
    [location.pathname, location.search, location.hash]
  );

  const displayedGuide = useMemo(() => {
    if (previewKey && SCREEN_GUIDES[previewKey]) {
      return SCREEN_GUIDES[previewKey];
    }
    return sensedScreenGuide || SCREEN_GUIDES["/dashboard"];
  }, [previewKey, sensedScreenGuide]);

  const isPreviewingOther = Boolean(previewKey && previewKey !== sensedScreenGuide.key);

  const [visualTalking, setVisualTalking] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [questionInput, setQuestionInput] = useState("");
  const [popupTrickIdx, setPopupTrickIdx] = useState(0);

  // Automatically cycle the Guide Bot popup mascot through fun stage tricks
  // (Solving Rubik's Cube 🧩, Wearing Headphones & Listening to Music 🎧, etc.) while open
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => {
      setPopupTrickIdx((prev) => (prev + 1) % POPUP_STAGE_TRICKS.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  // Top-level drawer tab ('chat' = clean chat only, 'guide' = screen guide & walkthroughs, 'tasks' = background AI tasks)
  const [activeMainTab, setActiveMainTab] = useState("chat");

  // Active tab inside the upfront Screen Blueprint Card ('overview' | 'fields' | 'steps' | 'impact')
  const [blueprintTab, setBlueprintTab] = useState("overview");

  // Detect if a topbar modal (CashDrawerModal / AccountsModal) is currently open on screen
  const [activeModalContext, setActiveModalContext] = useState(null);

  // Cube Companion Drawer state (conversational thread + progressive topic chips)
  const [usedTopics, setUsedTopics] = useState([]);
  const [thread, setThread] = useState([]);

  // Cube Interactive Walkthrough State
  const [activeDemo, setActiveDemo] = useState(null);
  const [highlightStatus, setHighlightStatus] = useState(null);
  const highlightTimerRef = useRef(null);

  // Background AI Task State (e.g. multi-product formulation enrichment in background)
  const [bgTask, setBgTask] = useState(null);
  const [bgFilterQuery, setBgFilterQuery] = useState("");
  const bgTaskCancelRef = useRef(false);

  const triggerBotTalking = useCallback((durationMs = 1800) => {
    setVisualTalking(true);
    const t = window.setTimeout(() => setVisualTalking(false), durationMs);
    return () => window.clearTimeout(t);
  }, []);

  const scrollToBottom = useCallback(() => {
    window.setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 45);
  }, []);

  /**
   * Highlights a live DOM element on the user's current screen during a Cube Walkthrough.
   * Scoped strictly to `.workspace-page, main` so it never highlights Topbar or Sidebar controls!
   */
  const highlightElementOnScreen = useCallback((selector) => {
    if (!selector || typeof document === "undefined") return;
    if (highlightTimerRef.current) {
      window.clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    document
      .querySelectorAll(".guide-bot-dom-highlight")
      .forEach((el) => el.classList.remove("guide-bot-dom-highlight"));

    let target = null;
    try {
      const pageContainers = document.querySelectorAll(
        ".workspace-page, main, [role='dialog']:not(.guide-bot-drawer)"
      );
      for (const container of pageContainers) {
        const candidates = container.querySelectorAll(selector);
        for (const el of candidates) {
          if (
            !el.closest(".guide-bot-drawer") &&
            !el.closest(".workspace-sidebar") &&
            !el.closest("aside") &&
            !el.closest("[data-roaming-cube]") &&
            el.offsetParent !== null
          ) {
            target = el;
            break;
          }
        }
        if (target) break;
      }
      if (!target) {
        const fallbackCandidates = document.querySelectorAll(selector);
        for (const el of fallbackCandidates) {
          if (
            !el.closest(".guide-bot-drawer") &&
            !el.closest(".workspace-sidebar") &&
            !el.closest("aside") &&
            !el.closest("header") &&
            !el.closest("[data-roaming-cube]") &&
            el.offsetParent !== null
          ) {
            target = el;
            break;
          }
        }
      }
    } catch {
      target = null;
    }

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("guide-bot-dom-highlight");
      setHighlightStatus("found");
      highlightTimerRef.current = window.setTimeout(() => {
        target.classList.remove("guide-bot-dom-highlight");
        setHighlightStatus(null);
      }, 3200);
    } else {
      setHighlightStatus("not_found");
      highlightTimerRef.current = window.setTimeout(() => {
        setHighlightStatus(null);
      }, 2600);
    }
  }, []);

  /**
   * Launches a Grounded Interactive Step-by-Step Walkthrough in Cube.
   */
  const startCubeDemo = useCallback(
    (workflowId) => {
      if (!workflowId || !DEMO_MANIFESTS[workflowId]) return;
      setShowDirectory(false);
      setHighlightStatus(null);
      setActiveMainTab("guide");
      setActiveDemo({
        workflowId,
        stepIndex: 0,
        pausedForDetour: false,
      });
      triggerBotTalking(1800);
    },
    [triggerBotTalking]
  );

  // Detect if the currently displayed screen has a matching interactive Cube Demo Manifest
  const currentScreenWorkflowId = useMemo(() => {
    const key = displayedGuide?.key || "";
    if (key.startsWith("/purchase-orders")) return "create_purchase_order";
    if (key.startsWith("/purchase-invoices")) return "create_purchase_invoice";
    if (key === "/sale-invoices/pos") return "pos_counter_billing";
    if (key.startsWith("/sale-invoices")) return "create_retail_invoice";
    if (key.startsWith("/customer-ledger") || key.startsWith("/customers")) {
      return "customer_udhar_recovery";
    }
    if (key.startsWith("/suppliers")) return "manage_suppliers";
    if (key.startsWith("/products")) return "manage_products";
    if (key.startsWith("/cash-drawer")) return "cash_drawer_shift";
    if (key.startsWith("/expenses")) return "record_shop_expense";
    if (key.startsWith("/accounts")) return "manage_accounts_transfer";
    if (key.startsWith("/stock-adjustments")) return "inventory_adjustment";
    const found = Object.values(DEMO_MANIFESTS).find((m) =>
      m.steps?.some((s) => s.screen === key)
    );
    return found ? found.id || found.workflowId : null;
  }, [displayedGuide]);

  const resetToGreeting = useCallback(
    (guide) => {
      if (typingTimerRef.current) {
        window.clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      setIsTyping(false);
      setBlueprintTab("overview");
      setUsedTopics([]);
      setThread([
        {
          id: `greeting-${guide.key}-${Date.now()}`,
          role: "bot",
          kind: "greeting",
          guideKey: guide.key,
        },
      ]);
      triggerBotTalking(1800);
    },
    [triggerBotTalking]
  );

  const clearChatOnly = useCallback(() => {
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    setIsTyping(false);
    setThread((prev) =>
      prev.filter(
        (m) =>
          m.kind === "greeting" ||
          m.fromGuideChip ||
          (m.role === "bot" && m.kind !== "qa")
      )
    );
  }, []);

  useEffect(() => {
    setPreviewKey(null);
    setShowDirectory(false);
    setHighlightStatus(null);
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    setBlueprintTab("overview");
    setUsedTopics([]);
    setThread((prev) => {
      const chatItems = prev.filter(
        (m) => (m.role === "user" && !m.fromGuideChip) || m.kind === "qa"
      );
      return [
        {
          id: `greeting-${displayedGuide.key}-${Date.now()}`,
          role: "bot",
          kind: "greeting",
          guideKey: displayedGuide.key,
        },
        ...chatItems,
      ];
    });
  }, [displayedGuide]);

  // Sense when CashDrawerModal or AccountsModal is open in the DOM
  useEffect(() => {
    if (!isOpen || typeof document === "undefined") {
      setActiveModalContext(null);
      return;
    }
    const checkModals = () => {
      const bodyText = document.body?.innerText || "";
      if (
        document.querySelector("[data-modal='cash-drawer']") ||
        (bodyText.includes("Cash Register") && bodyText.includes("Detailed Report"))
      ) {
        setActiveModalContext(MODAL_CONTEXT_GUIDES.cash_drawer);
      } else if (
        document.querySelector("[data-modal='accounts']") ||
        (bodyText.includes("Financial Accounts") && bodyText.includes("Transfer Funds"))
      ) {
        setActiveModalContext(MODAL_CONTEXT_GUIDES.accounts);
      } else {
        setActiveModalContext(null);
      }
    };
    checkModals();
    const timer = window.setInterval(checkModals, 1200);
    return () => window.clearInterval(timer);
  }, [isOpen, location.pathname]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    };
  }, []);

  /**
   * Smoothly animates the <dialog> out before closing and unmounting.
   */
  const runSmoothClose = useCallback(
    async (notifyParent = true) => {
      const dialog = dialogRef.current;
      if (!dialog) {
        setIsRendered(false);
        if (notifyParent) {
          setSharedIsOpen(false);
          onClose?.();
        }
        return;
      }

      if (closingPromiseRef.current) {
        return closingPromiseRef.current;
      }

      const closeTask = (async () => {
        dialog.setAttribute("data-closing", "");
        const animations =
          typeof dialog.getAnimations === "function"
            ? dialog.getAnimations({ subtree: true })
            : [];

        if (animations.length > 0) {
          await Promise.race([
            Promise.allSettled(animations.map((a) => a.finished)),
            new Promise((r) => window.setTimeout(r, 260)),
          ]);
        } else if (!supportsTopLayerExit()) {
          await new Promise((r) => window.setTimeout(r, 220));
        }

        if (dialog.hasAttribute("data-closing")) {
          dialog.removeAttribute("data-closing");
        }
        if (dialog.open && typeof dialog.close === "function") {
          try {
            dialog.close();
          } catch {
            dialog.removeAttribute("open");
          }
        }
        closingPromiseRef.current = null;
        setIsRendered(false);
        if (notifyParent) {
          setSharedIsOpen(false);
          onClose?.();
        }
      })();

      closingPromiseRef.current = closeTask;
      return closeTask;
    },
    [onClose, setSharedIsOpen]
  );

  // Sync `isOpen` prop changes with smooth open & smooth close
  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      const dialog = dialogRef.current;
      if (dialog) {
        dialog.removeAttribute("data-closing");
      }
      triggerBotTalking(1600);
      window.setTimeout(() => askInputRef.current?.focus(), 60);
    } else if (isRendered) {
      runSmoothClose(false);
    }
  }, [isOpen, isRendered, runSmoothClose, triggerBotTalking]);

  // Open <dialog> with `showModal()` and `closedby="any"` so clicking outside (backdrop)
  // light-dismisses the drawer, with a fallback for browsers without `closedBy` support.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !isRendered || !isOpen) return;

    dialog.removeAttribute("data-closing");
    try {
      if (!dialog.open) {
        if (typeof dialog.showModal === "function") {
          dialog.showModal();
        } else if (typeof dialog.show === "function") {
          dialog.show();
        } else {
          dialog.setAttribute("open", "");
        }
      }
    } catch {
      if (!dialog.open) {
        dialog.setAttribute("open", "");
      }
    }

    const handleCancel = (event) => {
      event.preventDefault();
      runSmoothClose(true);
    };

    const handleNativeClose = () => {
      if (dialog.open || modeSwitchRef.current || closingPromiseRef.current) return;
      setIsRendered(false);
      setSharedIsOpen(false);
      onClose?.();
    };

    const handleDialogClick = (event) => {
      if (pointerDownInsideRef.current) {
        pointerDownInsideRef.current = false;
        return;
      }
      if (event.target !== dialog) return;

      const rect = dialog.getBoundingClientRect();
      const isDialogContent =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;

      if (isDialogContent) return;

      runSmoothClose(true);
    };

    const handleDocumentPointerDown = (event) => {
      const target = event.target;
      if (!target) return;

      if (target !== dialog && dialog.contains(target)) {
        pointerDownInsideRef.current = true;
        return;
      }

      const rect = dialog.getBoundingClientRect();
      const isInsideRect =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;

      if (isInsideRect) {
        pointerDownInsideRef.current = true;
        return;
      }

      pointerDownInsideRef.current = false;

      if (
        target.closest?.("[data-guide-bot-trigger]") ||
        target.closest?.("[data-roaming-cube]")
      ) {
        return;
      }

      runSmoothClose(true);
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        runSmoothClose(true);
      }
    };

    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleNativeClose);
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      dialog.addEventListener("click", handleDialogClick);
    }
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleNativeClose);
      dialog.removeEventListener("click", handleDialogClick);
      document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isRendered, isOpen, runSmoothClose, onClose, setSharedIsOpen]);

  /**
   * Handles progressive-disclosure chip clicks in Cube Drawer.
   */
  const handleTopicChipClick = (topicType, payload = null) => {
    if (topicType === "walkthrough" && payload?.workflowId) {
      startCubeDemo(payload.workflowId);
      return;
    }

    const topicId = payload?.id || topicType;
    setUsedTopics((prev) => (prev.includes(topicId) ? prev : [...prev, topicId]));

    let userLabel = { en: "", ur: "" };
    if (topicType === "steps") {
      userLabel = {
        en: "How do I use this screen step by step?",
        ur: "اس اسکرین کو استعمال کرنے کا مرحلہ وار طریقہ کیا ہے؟",
      };
    } else if (topicType === "features") {
      userLabel = {
        en: "What are the key features on this screen?",
        ur: "اس اسکرین کی اہم خصوصیات کیا ہیں؟",
      };
    } else if (topicType === "impacts") {
      userLabel = {
        en: "How does this screen affect stock & accounting?",
        ur: "اس اسکرین کا اسٹاک اور کھاتوں پر کیا اثر پڑتا ہے؟",
      };
    } else if (topicType === "shortcuts") {
      userLabel = {
        en: "What keyboard shortcuts work here?",
        ur: "یہاں کون سے کی بورڈ شارٹ کٹس کام کرتے ہیں؟",
      };
    } else if (topicType === "faq" && payload?.faq) {
      userLabel = {
        en: payload.faq.q.en,
        ur: payload.faq.q.ur,
      };
    }

    const userMsg = {
      id: `u-${Date.now()}`,
      role: "user",
      fromGuideChip: true,
      label: userLabel,
    };

    setThread((prev) => [...prev, userMsg]);
    setIsTyping(true);
    setVisualTalking(true);
    scrollToBottom();

    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      setIsTyping(false);
      const nextBotItem = {
        id: `b-${Date.now()}`,
        role: "bot",
        kind: topicType,
        guideKey: displayedGuide.key,
        faq: payload?.faq || null,
        chipId: topicId,
      };
      setThread((prev) => [...prev, nextBotItem]);
      scrollToBottom();
      window.setTimeout(() => setVisualTalking(false), 1800);
    }, 220);
  };

  /**
   * Continues running multi-batch background tasks (like auto-filling missing formulations
   * across products) without blocking the UI or timing out on shared hosting.
   * Updates the dedicated `bgTask` state for the Background Tasks tab without spamming the chat thread.
   */
  const continueBackgroundTaskLoop = useCallback(
    async (
      initialBgMeta,
      cardId = null,
      initialUpdatedCount = 0,
      initialProcessedCount = 0,
      initialSkippedCount = 0,
      initialUpdatedProducts = [],
      initialSkippedProducts = []
    ) => {
      if (!initialBgMeta || !initialBgMeta.has_more) return;

      bgTaskCancelRef.current = false;
      let afterId = Number(initialBgMeta.last_processed_id || 0);
      let totalUpdated = Number(initialUpdatedCount || 0);
      let totalProcessed = Number(
        initialProcessedCount || initialBgMeta.processed_in_batch || 0
      );
      let totalSkipped = Number(initialSkippedCount || 0);
      let remaining = Number(initialBgMeta.remaining_count || 0);
      let accumulatedUpdated = Array.isArray(initialUpdatedProducts)
        ? [...initialUpdatedProducts]
        : [];
      let accumulatedSkipped = Array.isArray(initialSkippedProducts)
        ? [...initialSkippedProducts]
        : [];
      const filterQuery = initialBgMeta.filter_query || "";

      setBgTask({
        running: true,
        status: "running",
        processedCount: totalProcessed,
        updatedCount: totalUpdated,
        skippedCount: totalSkipped,
        remainingCount: remaining,
        updatedProducts: accumulatedUpdated,
        skippedProducts: accumulatedSkipped,
        filterQuery,
      });

      while (!bgTaskCancelRef.current) {
        await new Promise((r) => window.setTimeout(r, 420));
        if (bgTaskCancelRef.current) break;

        try {
          const res = await axios.post("/api/cube/execute-task", {
            task_type: "bulk_autofill_missing_formulations",
            batch_size: 20,
            after_id: afterId,
            filter_query: filterQuery,
          });

          const data = res?.data || {};
          const meta = data.task_meta || {};
          const nextBg = data.background_task || meta.background_task || {};
          const batchUpdated = Number(meta.updated_count || 0);
          const batchProcessed = Number(nextBg.processed_in_batch || 0);
          const newUpdatedList = Array.isArray(meta.updated_products)
            ? meta.updated_products
            : [];
          const newSkippedList = Array.isArray(meta.skipped_products)
            ? meta.skipped_products
            : [];

          totalUpdated += batchUpdated;
          totalProcessed += batchProcessed;
          totalSkipped += newSkippedList.length;
          afterId = Number(nextBg.last_processed_id || afterId);
          remaining = Number(nextBg.remaining_count || 0);

          if (newUpdatedList.length > 0) {
            accumulatedUpdated = [...newUpdatedList, ...accumulatedUpdated].slice(
              0,
              150
            );
          }
          if (newSkippedList.length > 0) {
            accumulatedSkipped = [...newSkippedList, ...accumulatedSkipped].slice(
              0,
              80
            );
          }

          if (meta.refresh_products && typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("karobar:products-updated", { detail: meta })
            );
          }

          const stillRunning = Boolean(nextBg.has_more);
          setBgTask({
            running: stillRunning,
            status: stillRunning ? "running" : "completed",
            processedCount: totalProcessed,
            updatedCount: totalUpdated,
            skippedCount: totalSkipped,
            remainingCount: remaining,
            updatedProducts: accumulatedUpdated,
            skippedProducts: accumulatedSkipped,
            filterQuery,
          });

          if (cardId) {
            setThread((prev) =>
              prev.map((item) =>
                item.id === cardId
                  ? {
                      ...item,
                      hasBackgroundTask: true,
                      title: {
                        en: stillRunning
                          ? `Background Task Running (${totalUpdated} Updated, ${remaining} Remaining)`
                          : `Background Task Completed (${totalUpdated} Product(s) Updated)`,
                        ur: stillRunning
                          ? `بیک گراؤنڈ ٹاسک جاری (${totalUpdated} اپڈیٹ، ${remaining} باقی)`
                          : `بیک گراؤنڈ ٹاسک مکمل (${totalUpdated} پروڈکٹس اپڈیٹ)`,
                      },
                    }
                  : item
              )
            );
          }

          if (!stillRunning) {
            break;
          }
        } catch {
          setBgTask((prev) =>
            prev ? { ...prev, running: false, status: "error" } : null
          );
          break;
        }
      }

      setBgTask((prev) =>
        prev
          ? {
              ...prev,
              running: false,
              status: bgTaskCancelRef.current ? "stopped" : prev.status === "running" ? "completed" : prev.status,
            }
          : null
      );
    },
    []
  );

  /**
   * Starts the 100%-certainty background formulation auto-fill directly inside the Background Tasks tab
   * without adding any noise to the clean Chat tab.
   */
  const startBackgroundFormulationTask = useCallback(
    async (customFilter = null) => {
      if (bgTask?.running) return;
      const filterToUse =
        customFilter !== null ? String(customFilter).trim() : bgFilterQuery.trim();

      bgTaskCancelRef.current = false;
      setBgTask({
        running: true,
        status: "running",
        processedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        remainingCount: 0,
        updatedProducts: [],
        skippedProducts: [],
        filterQuery: filterToUse,
      });

      try {
        const res = await axios.post("/api/cube/execute-task", {
          task_type: "bulk_autofill_missing_formulations",
          batch_size: 20,
          after_id: 0,
          filter_query: filterToUse,
        });

        const data = res?.data || {};
        const meta = data.task_meta || {};
        const nextBg = data.background_task || meta.background_task || {};
        const batchUpdated = Number(meta.updated_count || 0);
        const batchProcessed = Number(nextBg.processed_in_batch || 0);
        const updatedList = Array.isArray(meta.updated_products)
          ? meta.updated_products
          : [];
        const skippedList = Array.isArray(meta.skipped_products)
          ? meta.skipped_products
          : [];
        const remaining = Number(nextBg.remaining_count || 0);
        const hasMore = Boolean(nextBg.has_more);

        if (meta.refresh_products && typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("karobar:products-updated", { detail: meta })
          );
        }

        setBgTask({
          running: hasMore,
          status: hasMore ? "running" : "completed",
          processedCount: batchProcessed,
          updatedCount: batchUpdated,
          skippedCount: skippedList.length,
          remainingCount: remaining,
          updatedProducts: updatedList,
          skippedProducts: skippedList,
          filterQuery: filterToUse,
        });

        if (hasMore && !bgTaskCancelRef.current) {
          await continueBackgroundTaskLoop(
            nextBg,
            null,
            batchUpdated,
            batchProcessed,
            skippedList.length,
            updatedList,
            skippedList
          );
        }
      } catch {
        setBgTask((prev) =>
          prev ? { ...prev, running: false, status: "error" } : null
        );
      }
    },
    [bgFilterQuery, bgTask?.running, continueBackgroundTaskLoop]
  );

  const stopBackgroundTask = useCallback(() => {
    bgTaskCancelRef.current = true;
    setBgTask((prev) =>
      prev ? { ...prev, running: false, status: "stopped" } : null
    );
  }, []);

  /**
   * Handles user questions in Cube's Companion Drawer using the 4-layer Hybrid Intelligence Architecture:
   *   Layer 1: Local trained intelligence engine (`routeUserQuery`)
   *   Layer 2: Groq Primary AI (via `POST /api/cube/ask`)
   *   Layer 3: Google Gemini Backup AI (via `POST /api/cube/ask`)
   *   Layer 4: Local knowledge fallback
   */
  const handleAskSubmit = async (e, presetQuery = null, forceAi = false) => {
    if (e) e.preventDefault();
    const raw = (presetQuery ?? questionInput).trim().slice(0, 2000);
    if (!raw) return;

    const isUserTypedQuestion = presetQuery === null || forceAi;
    setActiveMainTab("chat");

    const routed = routeUserQuery({
      queryText: raw,
      currentSpeaker: "cube",
      currentGuide: displayedGuide,
      currentPathname: location.pathname,
      activeDemo,
    });

    const localReply = routed.answer || answerUserQuestion(raw, displayedGuide);
    const lastBotMsg = [...thread].reverse().find((m) => m && m.role === "bot");
    const isAnsweringPendingTask = lastBotMsg?.providerStatus === "cube_task_needs_input";

    // Deterministic walkthrough intelligence: never allow AI to invent selectors or workflow IDs
    if (!isAnsweringPendingTask && routed.startDemoNow && routed.workflowId && DEMO_MANIFESTS[routed.workflowId]) {
      setActiveDemo({
        workflowId: routed.workflowId,
        stepIndex: 0,
        pausedForDetour: false,
      });
    } else if (activeDemo && !routed.startDemoNow) {
      setActiveDemo((prev) => (prev ? { ...prev, pausedForDetour: true } : null));
    }

    // Build up to 6 recent conversation messages for contextual follow-up understanding
    const recentHistory = thread
      .filter((item) => item && (item.role === "user" || item.kind === "qa"))
      .slice(-6)
      .map((item) => ({
        role: item.role === "user" ? "user" : "assistant",
        content: String(
          item.role === "user"
            ? item.text || (isUr ? item.label?.ur : item.label?.en) || ""
            : (isUr ? item.ur : item.en) || item.en || ""
        ).slice(0, 2000),
      }))
      .filter((item) => item.content.trim().length > 0);

    const userMsg = {
      id: `u-${Date.now()}`,
      role: "user",
      text: raw,
    };

    setThread((prev) => [...prev, userMsg]);
    if (!presetQuery) setQuestionInput("");
    setShowDirectory(false);
    setIsTyping(true);
    setVisualTalking(true);
    scrollToBottom();

    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);

    // Keep greetings, live-data privacy boundary, explicit screen overview, interactive demos,
    // and preset topic queries in Layer 1; send user-typed chat questions and pending-task answers to Hybrid AI
    const isStrictlyLocalIntent =
      !isAnsweringPendingTask &&
      (routed.startDemoNow ||
        routed.matchedIntentId === "greeting_and_help" ||
        routed.matchedIntentId === "live_data_privacy_boundary" ||
        routed.matchedIntentId === "current_screen_overview");

    const shouldUseHybridAi =
      forceAi ||
      isAnsweringPendingTask ||
      (!isStrictlyLocalIntent && (routed.shouldCallAi || isUserTypedQuestion));

    if (!shouldUseHybridAi) {
      typingTimerRef.current = window.setTimeout(() => {
        setIsTyping(false);
        const nextBotItem = {
          id: `b-${Date.now()}`,
          role: "bot",
          kind: "qa",
          questionText: raw,
          title: localReply.title,
          en: localReply.en,
          ur: localReply.ur,
          links: localReply.links || [],
          evidenceType: routed.evidenceType,
          evidenceBadge: routed.evidenceBadge,
          matchCategory: routed.matchCategory,
          matchedIntentId: routed.matchedIntentId,
          confidence: routed.confidence,
          sourceIds: routed.sourceIds || [],
          providerStatus: "local_engine",
          workflowId:
            routed.workflowId && DEMO_MANIFESTS[routed.workflowId]
              ? routed.workflowId
              : null,
        };
        setThread((prev) => [...prev, nextBotItem]);
        scrollToBottom();
        window.setTimeout(() => setVisualTalking(false), 1800);
      }, 220);
      return;
    }

    // Layers 2, 3 & 4: Backend Hybrid AI (`POST /api/cube/ask`) with local fallback resilience
    try {
      const response = await axios.post("/api/cube/ask", {
        question: raw,
        language: isUr ? "ur" : "en",
        current_route: displayedGuide?.key || location.pathname || "/dashboard",
        history: recentHistory,
        matched_intent_id: routed.matchedIntentId || null,
        screen_guide_id: displayedGuide?.key || null,
      });

      const data = response?.data || {};
      const resolvedWorkflowId =
        data.workflow_id && DEMO_MANIFESTS[data.workflow_id]
          ? data.workflow_id
          : routed.workflowId && DEMO_MANIFESTS[routed.workflowId]
          ? routed.workflowId
          : null;

      const resolvedLinks =
        Array.isArray(data.links) && data.links.length > 0
          ? data.links.filter(
              (lnk) =>
                lnk &&
                typeof lnk.path === "string" &&
                lnk.path.startsWith("/") &&
                !lnk.path.includes(":")
            )
          : localReply.links || [];

      const bgMeta = data.background_task || data.task_meta?.background_task;
      const isBgTaskResponse = Boolean(
        bgMeta || data.task_meta?.action === "bulk_autofill_missing_formulations"
      );

      const nextCardId = `b-${Date.now()}`;
      const nextBotItem = {
        id: nextCardId,
        role: "bot",
        kind: "qa",
        questionText: raw,
        hasBackgroundTask: isBgTaskResponse,
        title: {
          en: data.title_en || data.title?.en || localReply.title?.en || "Karobar ERP Guide",
          ur: data.title_ur || data.title?.ur || localReply.title?.ur || "کاروبار ایپ رہنمائی",
        },
        en: data.answer_en || data.en || localReply.en,
        ur: data.answer_ur || data.ur || localReply.ur,
        links: resolvedLinks,
        evidenceType: data.evidence_classification || routed.evidenceType,
        evidenceBadge: data.evidence_badge || routed.evidenceBadge,
        sourceIds: Array.isArray(data.source_ids) ? data.source_ids : routed.sourceIds || [],
        providerStatus: data.provider_status || "local_fallback",
        workflowId: resolvedWorkflowId,
      };

      if (data.task_meta?.refresh_products && typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("karobar:products-updated", { detail: data.task_meta })
        );
      }

      setIsTyping(false);
      setThread((prev) => [...prev, nextBotItem]);
      scrollToBottom();
      window.setTimeout(() => setVisualTalking(false), 1800);

      if (isBgTaskResponse) {
        const initUpdated = Number(data.task_meta?.updated_count || 0);
        const initProcessed = Number(bgMeta?.processed_in_batch || 0);
        const initUpdatedProducts = Array.isArray(data.task_meta?.updated_products)
          ? data.task_meta.updated_products
          : [];
        const initSkippedProducts = Array.isArray(data.task_meta?.skipped_products)
          ? data.task_meta.skipped_products
          : [];
        const initRemaining = Number(bgMeta?.remaining_count || 0);

        setBgTask({
          running: Boolean(bgMeta?.has_more),
          status: bgMeta?.has_more ? "running" : "completed",
          processedCount: initProcessed,
          updatedCount: initUpdated,
          skippedCount: initSkippedProducts.length,
          remainingCount: initRemaining,
          updatedProducts: initUpdatedProducts,
          skippedProducts: initSkippedProducts,
          filterQuery: bgMeta?.filter_query || "",
        });

        if (bgMeta?.has_more) {
          continueBackgroundTaskLoop(
            bgMeta,
            nextCardId,
            initUpdated,
            initProcessed,
            initSkippedProducts.length,
            initUpdatedProducts,
            initSkippedProducts
          );
        }
      }
    } catch {
      // Layer 4 Frontend Fallback: Cube never becomes unavailable if backend or network fails
      setIsTyping(false);
      const fallbackBotItem = {
        id: `b-${Date.now()}`,
        role: "bot",
        kind: "qa",
        questionText: raw,
        title: localReply.title,
        en: localReply.en,
        ur: localReply.ur,
        links: localReply.links || [],
        evidenceType: routed.evidenceType,
        evidenceBadge: routed.evidenceBadge,
        sourceIds: routed.sourceIds || [],
        providerStatus: "local_fallback",
        workflowId:
          routed.workflowId && DEMO_MANIFESTS[routed.workflowId]
            ? routed.workflowId
            : null,
      };
      setThread((prev) => [...prev, fallbackBotItem]);
      scrollToBottom();
      window.setTimeout(() => setVisualTalking(false), 1800);
    }
  };

  const handleNavigateToRoute = (path) => {
    if (!path || path.includes(":")) return;
    setPreviewKey(null);
    setShowDirectory(false);
    navigate(path);
  };

  // Directory search & filter state
  const [exploreCategory, setExploreCategory] = useState("all");
  const [exploreQuery, setExploreQuery] = useState("");

  const filteredModules = useMemo(() => {
    const q = exploreQuery.trim().toLowerCase();
    return Object.values(SCREEN_GUIDES).filter((item) => {
      if (!q && item.key.includes(":")) return false;
      if (exploreCategory !== "all" && item.category !== exploreCategory) return false;
      if (!q) return true;
      const haystack = `${item.title.en} ${item.title.ur} ${item.summary.en} ${item.summary.ur} ${item.section.en} ${item.section.ur} ${item.key}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [exploreCategory, exploreQuery]);

  // Topic chips for progressive disclosure
  const allScreenChips = useMemo(() => {
    const chips = [];
    if (currentScreenWorkflowId && DEMO_MANIFESTS[currentScreenWorkflowId]) {
      chips.push({
        id: `walkthrough-${currentScreenWorkflowId}`,
        type: "walkthrough",
        workflowId: currentScreenWorkflowId,
        icon: "🎯",
        en: "Interactive Walkthrough (Live Demo)",
        ur: "مرحلہ وار عملی گائیڈ (لائیو ڈیمو)",
      });
    }
    if ((displayedGuide?.steps?.en?.length || 0) > 0) {
      chips.push({
        id: "steps",
        type: "steps",
        icon: "🪜",
        en: "How to use (Steps)",
        ur: "استعمال کا طریقہ",
      });
    }
    if ((displayedGuide?.features?.en?.length || 0) > 0) {
      chips.push({
        id: "features",
        type: "features",
        icon: "✨",
        en: "Key features",
        ur: "اہم خصوصیات",
      });
    }
    if (displayedGuide?.impacts?.en) {
      chips.push({
        id: "impacts",
        type: "impacts",
        icon: "📊",
        en: "Stock & ledger impact",
        ur: "کھاتے اور اسٹاک پر اثر",
      });
    }
    if ((displayedGuide?.shortcuts?.length || 0) > 0) {
      chips.push({
        id: "shortcuts",
        type: "shortcuts",
        icon: "⌨️",
        en: "Shortcuts",
        ur: "شارٹ کٹس",
      });
    }
    (displayedGuide?.faqs || []).forEach((faq, idx) => {
      chips.push({
        id: `faq-${idx}`,
        type: "faq",
        icon: "❓",
        en: faq.q.en,
        ur: faq.q.ur,
        faq,
      });
    });
    return chips;
  }, [displayedGuide, currentScreenWorkflowId]);

  const cubeAvailableChips = useMemo(
    () => allScreenChips.filter((c) => !usedTopics.includes(c.id)),
    [allScreenChips, usedTopics]
  );

  if (!isOpen && !isRendered) {
    return (
      <>
        <ScreenElementInspector
          guide={sensedScreenGuide}
          lang={lang}
          onSetLang={handleSetLang}
          isDark={isDark}
        />
        {bottomMascotEnabled && (
          <RoamingCubeCompanion
            onOpen={() => setSharedIsOpen(true)}
            screenTitle={sensedScreenGuide?.title?.en}
          />
        )}
      </>
    );
  }

  const relatedRoutes = displayedGuide?.relatedRoutes || [];

  /**
   * Renders a Bot Answer Card inside Cube Mode's conversational thread.
   */
  const renderCubeBotCard = (msg) => {
    const guide = SCREEN_GUIDES[msg.guideKey] || displayedGuide;
    const cardBaseClass = `p-3.5 rounded-2xl rounded-tl-xs border shadow-2xs space-y-2 ${
      isDark
        ? "bg-slate-900 border-slate-800 text-slate-100"
        : "bg-white border-slate-200/90 text-slate-800"
    }`;

    // 1. UPFRONT 4-TAB SCREEN BLUEPRINT CARD (Overview + Example, Fields Glossary, Steps, 4-Pillar Impact)
    if (msg.kind === "greeting") {
      const fields = guide.fields || [];
      const steps = (isUr ? guide.steps?.ur : guide.steps?.en) || [];
      const features = (isUr ? guide.features?.ur : guide.features?.en) || [];
      const shortcuts = guide.shortcuts || [];
      const impactMatrix = guide.impactMatrix || null;
      const example = guide.example || null;
      const commonMistake = guide.commonMistake || null;

      return (
        <div
          key={msg.id}
          dir={isUr ? "rtl" : "ltr"}
          lang={isUr ? "ur" : "en"}
          className={cardBaseClass}
        >
          {/* Top Greeting & Action Bar */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-blue-600 dark:text-blue-400">
              <SparklesIcon className="w-3.5 h-3.5 shrink-0" />
              <span>
                {isUr
                  ? `مکمل گائیڈ: ${guide.title.ur}`
                  : `Screen Blueprint: ${guide.title.en}`}
              </span>
            </span>
          </div>

          {/* 4-Pillar Blueprint Navigation Tabs */}
          <div
            role="tablist"
            aria-label="Screen Blueprint Sections"
            className={`grid grid-cols-4 gap-1 p-1 rounded-xl border ${
              isDark
                ? "bg-slate-950/70 border-slate-800"
                : "bg-slate-100/90 border-slate-200/80"
            }`}
          >
            {[
              {
                id: "overview",
                en: "Overview",
                ur: "خلاصہ و مثال",
              },
              {
                id: "fields",
                en: `Fields (${fields.length})`,
                ur: `فیلڈز (${fields.length})`,
              },
              {
                id: "steps",
                en: `Steps (${steps.length})`,
                ur: `طریقہ (${steps.length})`,
              },
              {
                id: "impact",
                en: "GL Impact",
                ur: "کھاتوں پر اثر",
              },
            ].map((tb) => {
              const active = blueprintTab === tb.id;
              return (
                <button
                  key={tb.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setBlueprintTab(tb.id)}
                  className={`px-1.5 py-1 rounded-lg text-[11px] font-extrabold truncate transition-all cursor-pointer ${
                    active
                      ? "bg-blue-600 text-white shadow-2xs"
                      : isDark
                      ? "text-slate-300 hover:bg-slate-800 hover:text-white"
                      : "text-slate-600 hover:bg-white hover:text-slate-900"
                  } ${isUr ? "guide-bot-urdu-inline" : ""}`}
                >
                  {isUr ? tb.ur : tb.en}
                </button>
              );
            })}
          </div>

          {/* TAB 1: OVERVIEW + WORKED EXAMPLE + COMMON MISTAKE */}
          {blueprintTab === "overview" && (
            <div className="space-y-2.5 pt-0.5">
              <div
                className={`text-[13px] leading-relaxed ${
                  isUr ? "guide-bot-urdu-block" : "guide-bot-body-en"
                } text-slate-700 dark:text-slate-200`}
              >
                <FormattedBotMessage
                  text={isUr ? guide.summary.ur : guide.summary.en}
                  isUrdu={isUr}
                />
              </div>

              {example && (isUr ? example.ur : example.en) && (
                <div
                  className={`p-2.5 rounded-xl border space-y-1 ${
                    isDark
                      ? "bg-blue-950/30 border-blue-800/60 text-blue-100"
                      : "bg-blue-50/70 border-blue-200 text-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-blue-700 dark:text-blue-300">
                    <LightBulbIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {isUr
                        ? example.title?.ur || "عملی مثال:"
                        : example.title?.en || "Practical Numerical Example:"}
                    </span>
                  </div>
                  <div className="text-[12.5px]">
                    <FormattedBotMessage
                      text={isUr ? example.ur : example.en}
                      isUrdu={isUr}
                    />
                  </div>
                </div>
              )}

              {commonMistake && (isUr ? commonMistake.ur : commonMistake.en) && (
                <div
                  className={`p-2.5 rounded-xl border flex items-start gap-2 text-[12px] ${
                    isDark
                      ? "bg-amber-950/30 border-amber-800/60 text-amber-200"
                      : "bg-amber-50/80 border-amber-200 text-amber-900"
                  }`}
                >
                  <ExclamationTriangleIcon className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                  <div className={isUr ? "guide-bot-urdu-block" : ""}>
                    <span className="font-extrabold">
                      {isUr ? "اہم نکتہ: " : "Pro-Tip: "}
                    </span>
                    {renderInlineFormatting(
                      isUr ? commonMistake.ur : commonMistake.en,
                      "mistake"
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {currentScreenWorkflowId && DEMO_MANIFESTS[currentScreenWorkflowId] && (
                  <button
                    type="button"
                    onClick={() => startCubeDemo(currentScreenWorkflowId)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white transition-all cursor-pointer shadow-2xs"
                  >
                    <span aria-hidden="true">🎯</span>
                    <span>
                      {isUr
                        ? "مرحلہ وار عملی ڈیمو شروع کریں"
                        : "Start Interactive Walkthrough"}
                    </span>
                  </button>
                )}

                {isPreviewingOther && !guide.key.includes(":") && (
                  <button
                    type="button"
                    onClick={() => handleNavigateToRoute(guide.key)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white transition-all cursor-pointer shadow-xs"
                  >
                    <span>{isUr ? "یہ صفحہ کھولیں" : `Open ${guide.title.en}`}</span>
                    <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: FIELDS, COLUMNS & FORMULAS GLOSSARY */}
          {blueprintTab === "fields" && (
            <div className="space-y-2 pt-0.5">
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {isUr
                  ? "اس اسکرین کے اہم خانوں، کالمز اور فارمولوں کی تفصیل:"
                  : "Every key field, column, badge & formula on this screen:"}
              </p>

              {fields.length > 0 ? (
                <div className="space-y-2">
                  {fields.map((fld, idx) => (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-xl border space-y-1 ${
                        isDark
                          ? "bg-slate-950/60 border-slate-800"
                          : "bg-slate-50/80 border-slate-200/80"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400">
                          {isUr ? fld.term.ur || fld.term.en : fld.term.en}
                        </span>
                        {fld.type && (
                          <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {fld.type}
                          </span>
                        )}
                      </div>
                      <div className="text-[12.5px] text-slate-700 dark:text-slate-200">
                        <FormattedBotMessage
                          text={isUr ? fld.ur || fld.en : fld.en}
                          isUrdu={isUr}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  {isUr
                    ? "کسی بھی بٹن یا فیلڈ پر کلک کرنے کے لیے ٹاپ بار میں 'سمجھیں (Alt+E)' دبائیں۔"
                    : "Use the 'Explain (Alt+E)' button in the top navigation bar to click and explain any element on the page."}
                </p>
              )}
            </div>
          )}

          {/* TAB 3: STEP-BY-STEP WORKFLOW & SHORTCUTS */}
          {blueprintTab === "steps" && (
            <div className="space-y-2.5 pt-0.5">
              {steps.length > 0 && (
                <ol
                  role="list"
                  className={`space-y-2 text-[12.5px] ${
                    isUr ? "guide-bot-urdu-block" : ""
                  } text-slate-700 dark:text-slate-200`}
                >
                  {steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold shrink-0 mt-0.5 bg-amber-500/15 text-amber-700 dark:text-amber-300">
                        {i + 1}
                      </span>
                      <span className="leading-relaxed">
                        {renderInlineFormatting(step, `st-${i}`)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}

              {features.length > 0 && (
                <div className="pt-1 border-t border-slate-200/70 dark:border-slate-800 space-y-1.5">
                  <p className="text-[11px] font-extrabold text-indigo-600 dark:text-indigo-400">
                    {isUr ? "اہم خصوصیات:" : "Key Capabilities:"}
                  </p>
                  <ul role="list" className="space-y-1.5 text-[12px] text-slate-600 dark:text-slate-300">
                    {features.map((feat, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 bg-indigo-500" />
                        <span>{renderInlineFormatting(feat, `ft-${i}`)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {shortcuts.length > 0 && (
                <div className="pt-1 border-t border-slate-200/70 dark:border-slate-800 space-y-1">
                  <p className="text-[11px] font-extrabold text-blue-600 dark:text-blue-400">
                    {isUr ? "کی بورڈ شارٹ کٹس:" : "Keyboard Shortcuts:"}
                  </p>
                  {shortcuts.map((sc, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2 text-xs py-0.5"
                    >
                      <span>{isUr ? sc.ur : sc.en}</span>
                      <div className="flex items-center gap-1 shrink-0" dir="ltr">
                        {sc.keys.map((k) => (
                          <kbd
                            key={k}
                            className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded border bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: 4-PILLAR STOCK, PARTY LEDGER, TREASURY & GL IMPACT MATRIX */}
          {blueprintTab === "impact" && (
            <div className="space-y-2.5 pt-0.5">
              {impactMatrix && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    {
                      key: "stock",
                      icon: "📦",
                      en: "Stock & Batches",
                      ur: "اسٹاک اور بیچز",
                      val: impactMatrix.stock,
                    },
                    {
                      key: "ledger",
                      icon: "📒",
                      en: "Party Khata / Ledger",
                      ur: "کسٹمر / سپلائر کھاتہ",
                      val: impactMatrix.ledger,
                    },
                    {
                      key: "treasury",
                      icon: "💵",
                      en: "Cash Drawer & Bank",
                      ur: "کیش ڈراور اور بینک",
                      val: impactMatrix.treasury,
                    },
                    {
                      key: "gl",
                      icon: "⚖️",
                      en: "Double-Entry GL",
                      ur: "جنرل لیجر (GL)",
                      val: impactMatrix.gl,
                    },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className={`p-2 rounded-xl border space-y-0.5 ${
                        isDark
                          ? "bg-slate-950/60 border-slate-800"
                          : "bg-slate-50 border-slate-200/80"
                      }`}
                    >
                      <div className="flex items-center gap-1 text-[11px] font-extrabold text-purple-600 dark:text-purple-400">
                        <span>{item.icon}</span>
                        <span>{isUr ? item.ur : item.en}</span>
                      </div>
                      <p
                        className={`text-[12px] leading-snug text-slate-700 dark:text-slate-200 ${
                          isUr ? "guide-bot-urdu-block" : ""
                        }`}
                      >
                        {renderInlineFormatting(
                          isUr ? item.val?.ur || item.val?.en : item.val?.en,
                          `imp-${item.key}`
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {guide.impacts && (
                <div
                  className={`p-2.5 rounded-xl border text-[12.5px] leading-relaxed ${
                    isDark
                      ? "bg-purple-950/25 border-purple-800/50 text-purple-100"
                      : "bg-purple-50/70 border-purple-200 text-slate-800"
                  }`}
                >
                  <FormattedBotMessage
                    text={isUr ? guide.impacts.ur : guide.impacts.en}
                    isUrdu={isUr}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    // 2. STEP-BY-STEP HOW TO USE
    if (msg.kind === "steps") {
      const steps = (isUr ? guide.steps?.ur : guide.steps?.en) || [];
      return (
        <div
          key={msg.id}
          dir={isUr ? "rtl" : "ltr"}
          lang={isUr ? "ur" : "en"}
          className={cardBaseClass}
        >
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-600 dark:text-amber-400">
            <BoltIcon className="w-4 h-4 shrink-0" />
            <span>{isUr ? "استعمال کا طریقہ (مرحلہ وار):" : "How to use this screen:"}</span>
          </div>
          <ol
            role="list"
            className={`space-y-2 text-[13px] ${
              isUr ? "guide-bot-urdu-block" : ""
            } text-slate-700 dark:text-slate-200`}
          >
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold shrink-0 mt-0.5 bg-amber-500/15 text-amber-700 dark:text-amber-300">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      );
    }

    // 3. KEY FEATURES
    if (msg.kind === "features") {
      const features = (isUr ? guide.features?.ur : guide.features?.en) || [];
      return (
        <div
          key={msg.id}
          dir={isUr ? "rtl" : "ltr"}
          lang={isUr ? "ur" : "en"}
          className={cardBaseClass}
        >
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
            <CheckCircleIcon className="w-4 h-4 shrink-0" />
            <span>{isUr ? "اہم خصوصیات:" : "Key features on this screen:"}</span>
          </div>
          <ul
            role="list"
            className={`space-y-2 text-[13px] ${
              isUr ? "guide-bot-urdu-block" : ""
            } text-slate-700 dark:text-slate-200`}
          >
            {features.map((feat, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0 bg-indigo-500" />
                <span className="leading-relaxed">{feat}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    // 4. STOCK & ACCOUNTING IMPACT
    if (msg.kind === "impacts") {
      return (
        <div
          key={msg.id}
          dir={isUr ? "rtl" : "ltr"}
          lang={isUr ? "ur" : "en"}
          className={cardBaseClass}
        >
          <p className="text-xs font-extrabold text-purple-700 dark:text-purple-300">
            {isUr ? "📊 اسٹاک اور کھاتے پر اثر:" : "📊 Stock & Accounting Impact:"}
          </p>
          <p
            className={`text-[13px] leading-relaxed ${
              isUr ? "guide-bot-urdu-block" : ""
            } text-slate-700 dark:text-slate-200`}
          >
            {isUr ? guide.impacts?.ur : guide.impacts?.en}
          </p>
        </div>
      );
    }

    // 5. KEYBOARD SHORTCUTS
    if (msg.kind === "shortcuts") {
      const shortcuts = guide.shortcuts || [];
      return (
        <div
          key={msg.id}
          dir={isUr ? "rtl" : "ltr"}
          lang={isUr ? "ur" : "en"}
          className={cardBaseClass}
        >
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-blue-600 dark:text-blue-400">
            <CommandLineIcon className="w-4 h-4 shrink-0" />
            <span>{isUr ? "کی بورڈ شارٹ کٹس:" : "Keyboard Shortcuts:"}</span>
          </div>
          <div className="space-y-1.5">
            {shortcuts.map((sc, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 text-xs py-1 border-b last:border-0 border-slate-100 dark:border-slate-800"
              >
                <span className={isUr ? "guide-bot-urdu-inline" : "font-medium"}>
                  {isUr ? sc.ur : sc.en}
                </span>
                <div className="flex items-center gap-1 shrink-0" dir="ltr">
                  {sc.keys.map((k) => (
                    <kbd
                      key={k}
                      className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded border bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // 6. SPECIFIC FAQ ANSWER
    if (msg.kind === "faq" && msg.faq) {
      const faqQuestionText = isUr ? msg.faq.q.ur : msg.faq.q.en;
      return (
        <div
          key={msg.id}
          dir={isUr ? "rtl" : "ltr"}
          lang={isUr ? "ur" : "en"}
          className={cardBaseClass}
        >
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
            <QuestionMarkCircleIcon className="w-4 h-4 shrink-0" />
            <span>{faqQuestionText}</span>
          </div>
          <p
            className={`text-[13px] leading-relaxed ${
              isUr ? "guide-bot-urdu-block" : ""
            } text-slate-700 dark:text-slate-200`}
          >
            {isUr ? msg.faq.a.ur : msg.faq.a.en}
          </p>
          <div className="pt-1">
            <button
              type="button"
              onClick={() => handleAskSubmit(null, faqQuestionText, true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-extrabold bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/25 transition-all cursor-pointer"
            >
              <SparklesIcon className="w-3.5 h-3.5 shrink-0" />
              <span>
                {isUr
                  ? "کیوب اے آئی سے مزید تفصیلی وضاحت پوچھیں"
                  : "Explain in Detail with Cube AI"}
              </span>
            </button>
          </div>
        </div>
      );
    }

    // 7. FREE-TEXT Q&A REPLY
    const hasWalkthrough = Boolean(msg.workflowId && DEMO_MANIFESTS[msg.workflowId]);
    const isTaskWaitingForInput = msg.providerStatus === "cube_task_needs_input";
    const canEscalateToAi =
      Boolean(msg.questionText) &&
      msg.evidenceType !== EVIDENCE_TYPES.AI_GROUNDED_DOCS &&
      msg.evidenceType !== "ai_grounded_docs" &&
      msg.evidenceType !== EVIDENCE_TYPES.LIVE_DOM_INSPECTION &&
      msg.matchedIntentId !== "live_data_privacy_boundary" &&
      !String(msg.providerStatus || "").startsWith("cube_task_");

    return (
      <div
        key={msg.id}
        dir={isUr ? "rtl" : "ltr"}
        lang={isUr ? "ur" : "en"}
        className={cardBaseClass}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {msg.title && (
            <p className="text-xs font-extrabold text-blue-600 dark:text-blue-400">
              {isUr ? msg.title.ur : msg.title.en}
            </p>
          )}
          {msg.evidenceBadge && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              {isUr ? msg.evidenceBadge.ur : msg.evidenceBadge.en}
            </span>
          )}
        </div>

        <FormattedBotMessage
          text={isUr ? msg.ur : msg.en}
          isUrdu={isUr}
        />

        {(msg.hasBackgroundTask || isTaskWaitingForInput || hasWalkthrough || canEscalateToAi || (msg.links && msg.links.length > 0)) && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {msg.hasBackgroundTask && (
              <button
                type="button"
                onClick={() => setActiveMainTab("tasks")}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-extrabold bg-indigo-600 hover:bg-indigo-500 text-white shadow-2xs transition-all cursor-pointer"
              >
                <span aria-hidden="true">⚡</span>
                <span>
                  {isUr
                    ? "بیک گراؤنڈ ٹاسک کی لائیو پراگریس دیکھیں"
                    : "View Live Progress in Background Tasks"}
                </span>
              </button>
            )}
            {isTaskWaitingForInput && (
              <button
                type="button"
                onClick={() => handleAskSubmit(null, "cancel", true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/25 transition-all cursor-pointer"
              >
                <XMarkIcon className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isUr ? "ٹاسک منسوخ کریں (Cancel)" : "Cancel Pending Task"}
                </span>
              </button>
            )}
            {canEscalateToAi && (
              <button
                type="button"
                onClick={() => handleAskSubmit(null, msg.questionText, true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-extrabold bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/25 transition-all cursor-pointer"
              >
                <SparklesIcon className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isUr
                    ? "کیوب اے آئی سے مزید تفصیل پوچھیں"
                    : "Explain in Detail with Cube AI"}
                </span>
              </button>
            )}
            {hasWalkthrough && (
              <button
                type="button"
                onClick={() => startCubeDemo(msg.workflowId)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs transition-all cursor-pointer"
              >
                <span aria-hidden="true">🎯</span>
                <span>
                  {isUr
                    ? "مرحلہ وار عملی گائیڈ شروع کریں (Interactive Demo)"
                    : "Start Interactive Walkthrough (Step-by-Step)"}
                </span>
              </button>
            )}
            {(msg.links || []).map((lnk) => (
              <button
                key={lnk.path}
                type="button"
                onClick={() => handleNavigateToRoute(lnk.path)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-2xs transition-all cursor-pointer"
              >
                <span>{isUr ? lnk.ur : lnk.en}</span>
                <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  /**
   * Renders Cube's Grounded Interactive Step-by-Step Walkthrough Player (`DEMO_MANIFESTS`).
   * Distinguishes Observed live screen state vs. Conditional documented state and supports
   * live DOM target highlighting + mid-demo concept detours.
   */
  const renderCubeDemoPlayer = () => {
    if (!activeDemo) return null;
    const manifest = DEMO_MANIFESTS[activeDemo.workflowId];
    if (!manifest || !manifest.steps?.length) return null;

    const totalSteps = manifest.steps.length;
    const stepIndex = Math.min(Math.max(0, activeDemo.stepIndex), totalSteps - 1);
    const step = manifest.steps[stepIndex];
    const isOnTargetScreen = location.pathname === step.screen;

    // If paused for a mid-demo concept detour, show a compact "Resume Walkthrough" bar
    if (activeDemo.pausedForDetour) {
      return (
        <div
          dir={isUr ? "rtl" : "ltr"}
          lang={isUr ? "ur" : "en"}
          className={`p-3 rounded-2xl border flex items-center justify-between gap-2 ${
            isDark
              ? "bg-emerald-950/35 border-emerald-700/60 text-emerald-100"
              : "bg-emerald-50 border-emerald-300 text-emerald-950"
          }`}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              {isUr ? "عملی گائیڈ وقفے پر ہے" : "Walkthrough Paused for Question"}
            </p>
            <p className={`text-xs font-bold truncate ${isUr ? "guide-bot-urdu-inline" : ""}`}>
              {isUr ? manifest.title.ur : manifest.title.en} ({stepIndex + 1}/{totalSteps})
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                setActiveDemo((prev) => (prev ? { ...prev, pausedForDetour: false } : null))
              }
              className="px-2.5 py-1 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
            >
              {isUr ? `مرحلہ ${stepIndex + 1} جاری رکھیں` : `Resume Step ${stepIndex + 1}`}
            </button>
            <button
              type="button"
              onClick={() => setActiveDemo(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              title={isUr ? "بند کریں" : "Exit walkthrough"}
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        dir={isUr ? "rtl" : "ltr"}
        lang={isUr ? "ur" : "en"}
        className={`p-3.5 rounded-2xl border shadow-xs space-y-2.5 ${
          isDark
            ? "bg-slate-900/95 border-emerald-600/60 text-slate-100"
            : "bg-white border-emerald-400/90 text-slate-900"
        }`}
      >
        {/* Top Bar: Title + Version + Exit */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-extrabold shrink-0">
              🎯
            </span>
            <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300 truncate">
              {isUr ? manifest.title.ur : manifest.title.en}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              {isUr
                ? `مرحلہ ${stepIndex + 1} از ${totalSteps}`
                : `Step ${stepIndex + 1} of ${totalSteps}`}
            </span>
            <button
              type="button"
              onClick={() => setActiveDemo(null)}
              title={isUr ? "ڈیمو بند کریں" : "Exit Walkthrough"}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-300"
            style={{ width: `${Math.round(((stepIndex + 1) / totalSteps) * 100)}%` }}
          />
        </div>

        {/* Grounded Provenance Status: Observed on Current Screen vs. Conditional */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold ${
              isOnTargetScreen
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
            }`}
          >
            <span>
              {isOnTargetScreen
                ? isUr
                  ? `🟢 موجودہ اسکرین پر مشاہدہ شدہ (${step.screen})`
                  : `🟢 Observed on current screen (${step.screen})`
                : isUr
                ? `📘 مشروط مرحلہ — اسکرین: ${step.screen} (v${PRODUCT_VERSION})`
                : `📘 Conditional — Requires ${step.screen} (v${PRODUCT_VERSION})`}
            </span>
          </span>

          {isOnTargetScreen ? (
            <button
              type="button"
              onClick={() => highlightElementOnScreen(step.target || step.targetSelector)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 transition-colors cursor-pointer"
            >
              <span>🎯</span>
              <span>{isUr ? "اسکرین پر نمایاں کریں" : "Highlight on Screen"}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleNavigateToRoute(step.screen)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-2xs cursor-pointer"
            >
              <span>{isUr ? `صفحہ کھولیں (${step.screen})` : `Open ${step.screen}`}</span>
              <ArrowTopRightOnSquareIcon className="w-3 h-3" />
            </button>
          )}
        </div>

        {highlightStatus === "found" && (
          <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            {isUr
              ? "✓ متعلقہ بٹن/فیلڈ کو اسکرین پر ہائی لائٹ کر دیا گیا ہے!"
              : "✓ Highlighted target area on your active screen!"}
          </p>
        )}
        {highlightStatus === "not_found" && (
          <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
            {isUr
              ? "ℹ️ یہ فیلڈ فارم کھولنے یا اگلے مرحلے میں نظر آئے گی۔"
              : "ℹ️ This control appears once the form/modal is open on screen."}
          </p>
        )}

        {/* Step Heading & Grounded Instruction */}
        <div className="space-y-1">
          <h4
            className={`text-xs font-extrabold text-slate-900 dark:text-white ${
              isUr ? "guide-bot-urdu-block" : ""
            }`}
          >
            {isUr ? step.title.ur : step.title.en}
          </h4>
          <p
            className={`text-[13px] leading-relaxed text-slate-700 dark:text-slate-200 ${
              isUr ? "guide-bot-urdu-block" : ""
            }`}
          >
            {isOnTargetScreen
              ? isUr
                ? (step.observedInstruction || step.observedText)?.ur
                : (step.observedInstruction || step.observedText)?.en
              : isUr
              ? (step.instruction || step.conditionalText)?.ur
              : (step.instruction || step.conditionalText)?.en}
          </p>
        </div>

        {/* Checkpoint Verification Box */}
        {step.checkpoint && (
          <div
            className={`p-2 rounded-xl border text-[11.5px] font-semibold flex items-start gap-1.5 ${
              isDark
                ? "bg-slate-800/80 border-slate-700 text-emerald-300"
                : "bg-slate-50 border-slate-200/90 text-emerald-800"
            }`}
          >
            <CheckCircleIcon className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
            <span className={isUr ? "guide-bot-urdu-block" : ""}>
              {isUr ? `چیک پوائنٹ: ${step.checkpoint.ur}` : `Checkpoint: ${step.checkpoint.en}`}
            </span>
          </div>
        )}

        {/* Step Navigation Controls */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            disabled={stepIndex === 0}
            onClick={() => {
              setHighlightStatus(null);
              setActiveDemo((prev) =>
                prev ? { ...prev, stepIndex: Math.max(0, prev.stepIndex - 1) } : null
              );
            }}
            className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition-colors ${
              stepIndex === 0
                ? "opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-800 text-slate-400"
                : "cursor-pointer border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {isUr ? "→ پچھلا مرحلہ" : "← Previous"}
          </button>

          {stepIndex < totalSteps - 1 ? (
            <button
              type="button"
              onClick={() => {
                setHighlightStatus(null);
                setActiveDemo((prev) =>
                  prev
                    ? { ...prev, stepIndex: Math.min(totalSteps - 1, prev.stepIndex + 1) }
                    : null
                );
                triggerBotTalking(1200);
              }}
              className="px-3 py-1 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs transition-colors cursor-pointer"
            >
              {isUr ? "اگلا مرحلہ ←" : "Next Step →"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActiveDemo(null)}
              className="px-3 py-1 rounded-xl text-xs font-extrabold bg-gradient-to-r from-emerald-500 to-cyan-500 text-white shadow-2xs transition-colors cursor-pointer"
            >
              {isUr ? "✓ گائیڈ مکمل" : "✓ Finish Walkthrough"}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <ScreenElementInspector
        guide={sensedScreenGuide}
        lang={lang}
        onSetLang={handleSetLang}
        isDark={isDark}
      />
      <dialog
        ref={dialogRef}
        {...({ closedby: "any" })}
        aria-labelledby={titleId}
        className={`guide-bot-drawer guide-bot-mode-cube border shadow-2xl ${
          isExpandedWidth ? "guide-bot-drawer-wide" : ""
        } p-0 ${
          isDark
            ? "bg-slate-900 border-slate-700/90 text-slate-100 shadow-black/60"
            : "bg-white border-slate-200/95 text-slate-900 shadow-slate-900/15"
        }`}
      >
      <div className="guide-bot-drawer-shell">
        {/* =================================================================== */}
        {/* 2-ROW HEADER:                                                       */}
        {/*   ROW 1: Cube Identity Pill + Lang + Utility + Close                */}
        {/*   ROW 2: Full-Width Mascot + Crisp Unclipped Heading & Subtitle     */}
        {/* =================================================================== */}
        <header
          className={`px-4 pt-3 pb-3 shrink-0 flex flex-col gap-3 ${
            isDark
              ? "bg-gradient-to-b from-slate-950 to-slate-900 border-b border-slate-800"
              : "bg-gradient-to-b from-slate-50 to-white border-b border-slate-200/80"
          }`}
        >
          {/* ROW 1: Top Utility Controls Bar */}
          <div className="flex items-center justify-between gap-2">
            {/* Cube Identity Pill */}
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-extrabold border ${
                isDark
                  ? "bg-slate-800 border-slate-700 text-slate-100"
                  : "bg-slate-100 border-slate-200 text-slate-900"
              }`}
            >
              <span aria-hidden="true">🤖</span>
              <span>{isUr ? "کاروبار اسسٹنٹ" : "Cube Assistant"}</span>
            </span>

            {/* Right Controls: Language (EN | اردو) + Inspect (?) + Directory + Width + Close */}
            <div className="flex items-center gap-1 shrink-0">
              <div
                role="group"
                aria-label="Language"
                className={`inline-flex items-center p-0.5 rounded-lg border ${
                  isDark
                    ? "bg-slate-800 border-slate-700"
                    : "bg-slate-100 border-slate-200"
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleSetLang("en")}
                  aria-pressed={lang === "en"}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                    lang === "en"
                      ? "bg-slate-900 dark:bg-blue-600 text-white shadow-2xs"
                      : "text-slate-600 dark:text-slate-300 hover:text-slate-900"
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => handleSetLang("ur")}
                  aria-pressed={lang === "ur"}
                  lang="ur"
                  dir="rtl"
                  className={`guide-bot-urdu-inline px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                    lang === "ur"
                      ? "bg-emerald-500 text-white shadow-2xs"
                      : "text-slate-600 dark:text-slate-300 hover:text-slate-900"
                  }`}
                >
                  اردو
                </button>
              </div>

              {/* Directory & Width Controls */}
              <button
                type="button"
                onClick={() => setShowDirectory((v) => !v)}
                title={isUr ? "تمام صفحات دیکھیں" : "Browse all screens"}
                aria-pressed={showDirectory}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  showDirectory
                    ? "bg-blue-600 text-white"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                }`}
              >
                <Squares2X2Icon className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setIsExpandedWidth((v) => !v)}
                title={isExpandedWidth ? "Compact width" : "Wider view"}
                className="hidden sm:inline-flex p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {isExpandedWidth ? (
                  <ArrowsPointingInIcon className="w-4 h-4" />
                ) : (
                  <ArrowsPointingOutIcon className="w-4 h-4" />
                )}
              </button>

              <button
                type="button"
                onClick={() => runSmoothClose(true)}
                aria-label="Close Assistant"
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ROW 2: Mascot + Full-Width Heading Stage (Spacious & Never Truncated!) */}
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              onClick={() => {
                setPopupTrickIdx((prev) => {
                  const next = (prev + 1) % POPUP_STAGE_TRICKS.length;
                  // Every full trick cycle also rotates the mascot outfit style
                  if (next === 0) {
                    const order = ["cube", "pixel", "bot"];
                    const cur = getGuideBotMascotStyle();
                    setGuideBotMascotStyle(order[(order.indexOf(cur) + 1) % order.length]);
                  }
                  return next;
                });
                triggerBotTalking(1400);
              }}
              title={
                isUr
                  ? "اگلا کرتب دیکھنے کے لیے کلک کریں (روبکس کیوب 🧩 / ہیڈ فون 🎧 / فلپ 🤸)"
                  : "Click mascot to do next trick (Rubik's Cube 🧩 / Headphones 🎧 / 360° Flip 🤸)"
              }
              className="group relative shrink-0 flex flex-col items-center cursor-pointer transition-transform duration-200 hover:scale-105 active:scale-95 focus:outline-hidden"
            >
              <GuideBotAvatar
                className="w-16 h-20 drop-shadow-md"
                fullBody={true}
                speaking={visualTalking || isTyping}
                presenter={true}
                trick={
                  POPUP_STAGE_TRICKS[popupTrickIdx % POPUP_STAGE_TRICKS.length]?.id ||
                  "rubiks"
                }
              />
              <span
                className={`-mt-1 px-2 py-0.5 rounded-full text-[9.5px] font-extrabold whitespace-nowrap border shadow-2xs transition-colors ${
                  isDark
                    ? "bg-slate-800/95 border-slate-700 text-cyan-300 group-hover:border-cyan-500"
                    : "bg-slate-900 text-white border-slate-700 group-hover:bg-blue-600"
                } ${isUr ? "guide-bot-urdu-inline" : ""}`}
              >
                {isUr
                  ? POPUP_STAGE_TRICKS[popupTrickIdx % POPUP_STAGE_TRICKS.length]?.ur
                  : POPUP_STAGE_TRICKS[popupTrickIdx % POPUP_STAGE_TRICKS.length]?.en}
              </span>
            </button>

            <div
              className="min-w-0 flex-1 space-y-0.5"
              dir={isUr ? "rtl" : "ltr"}
              lang={isUr ? "ur" : "en"}
            >
              {/* Status Badge Row */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="w-2 h-2 rounded-full shrink-0 animate-pulse bg-emerald-500" />
                <span
                  className={`text-[11px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400 ${
                    isUr ? "guide-bot-urdu-inline" : ""
                  }`}
                >
                  {isPreviewingOther
                    ? isUr
                      ? "پری ویو موڈ"
                      : "Previewing Screen"
                    : isUr
                    ? "کاروبار اسسٹنٹ • لائیو گائیڈ"
                    : "Karobar Sidekick • Live Guide"}
                </span>

                {isPreviewingOther && (
                  <button
                    type="button"
                    onClick={() => setPreviewKey(null)}
                    className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/15 hover:bg-blue-500/25 text-blue-600 dark:text-blue-300 cursor-pointer"
                  >
                    {isUr ? "واپس" : "Reset"}
                  </button>
                )}
              </div>

              {/* Primary Heading Next to Mascot */}
              <h2
                id={titleId}
                className={`font-black tracking-tight break-words text-slate-900 dark:text-white ${
                  isUr
                    ? "guide-bot-urdu-block text-base py-0.5"
                    : "text-[16px] sm:text-[17px] leading-snug"
                }`}
              >
                {isUr ? displayedGuide.title.ur : displayedGuide.title.en}
              </h2>

              {/* Subtitle / Active Screen Context */}
              <p
                className={`text-xs font-semibold text-emerald-600 dark:text-emerald-400 ${
                  isUr ? "guide-bot-urdu-inline" : ""
                }`}
              >
                {isUr ? displayedGuide.section.ur : displayedGuide.section.en}
              </p>
            </div>
          </div>

          {/* ROW 3: Clean Top-Level Mode Tabs (AI Chat | Screen Guide | Background Tasks) */}
          <div
            role="tablist"
            aria-label={isUr ? "کیوب اسسٹنٹ موڈز" : "Cube Assistant Modes"}
            dir={isUr ? "rtl" : "ltr"}
            className={`grid grid-cols-3 gap-1 p-1 rounded-xl border ${
              isDark
                ? "bg-slate-950/80 border-slate-800"
                : "bg-slate-100/90 border-slate-200/85"
            }`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={!showDirectory && activeMainTab === "chat"}
              onClick={() => {
                setShowDirectory(false);
                setActiveMainTab("chat");
              }}
              className={`px-2 py-1.5 rounded-lg text-[11.5px] font-extrabold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer truncate ${
                !showDirectory && activeMainTab === "chat"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : isDark
                  ? "text-slate-300 hover:bg-slate-800 hover:text-white"
                  : "text-slate-600 hover:bg-white hover:text-slate-900"
              } ${isUr ? "guide-bot-urdu-inline" : ""}`}
            >
              <span aria-hidden="true">💬</span>
              <span className="truncate">{isUr ? "اے آئی چیٹ" : "AI Chat"}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={!showDirectory && activeMainTab === "guide"}
              onClick={() => {
                setShowDirectory(false);
                setActiveMainTab("guide");
              }}
              className={`px-2 py-1.5 rounded-lg text-[11.5px] font-extrabold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer truncate ${
                !showDirectory && activeMainTab === "guide"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : isDark
                  ? "text-slate-300 hover:bg-slate-800 hover:text-white"
                  : "text-slate-600 hover:bg-white hover:text-slate-900"
              } ${isUr ? "guide-bot-urdu-inline" : ""}`}
            >
              <span aria-hidden="true">📘</span>
              <span className="truncate">{isUr ? "اسکرین گائیڈ" : "Screen Guide"}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={!showDirectory && activeMainTab === "tasks"}
              onClick={() => {
                setShowDirectory(false);
                setActiveMainTab("tasks");
              }}
              className={`px-2 py-1.5 rounded-lg text-[11.5px] font-extrabold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer truncate ${
                !showDirectory && activeMainTab === "tasks"
                  ? "bg-indigo-600 text-white shadow-2xs"
                  : isDark
                  ? "text-slate-300 hover:bg-slate-800 hover:text-white"
                  : "text-slate-600 hover:bg-white hover:text-slate-900"
              } ${isUr ? "guide-bot-urdu-inline" : ""}`}
            >
              {bgTask?.running ? (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
              ) : (
                <span aria-hidden="true">⚡</span>
              )}
              <span className="truncate">
                {isUr ? "بیک گراؤنڈ ٹاسکس" : "Tasks"}
              </span>
              {bgTask && (bgTask.running || bgTask.updatedCount > 0) && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-black shrink-0 ${
                    !showDirectory && activeMainTab === "tasks"
                      ? "bg-white/20 text-white"
                      : bgTask.running
                      ? "bg-indigo-500 text-white animate-pulse"
                      : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300"
                  }`}
                >
                  {bgTask.updatedCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* =================================================================== */}
        {/* BODY: MODULE DIRECTORY OR TABBED VIEWS (CHAT | GUIDE | TASKS)       */}
        {/* =================================================================== */}
        {showDirectory ? (
          <div className="guide-bot-drawer-body p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowDirectory(false)}
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                <ChevronLeftIcon className="w-3.5 h-3.5" />
                <span>{isUr ? "واپس جائیں" : "Back"}</span>
              </button>
              <span className="text-[11px] font-semibold text-slate-400">
                {filteredModules.length} {isUr ? "صفحات" : "screens"}
              </span>
            </div>

            <div className="relative">
              <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={exploreQuery}
                onChange={(e) => setExploreQuery(e.target.value)}
                placeholder={
                  isUr ? "کوئی بھی صفحہ تلاش کریں..." : "Search any screen or feature..."
                }
                aria-label="Search screens"
                className={`w-full h-9 pl-9 pr-3 rounded-xl border text-base sm:text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500 ${
                  isDark
                    ? "bg-slate-800 border-slate-700 text-white placeholder-slate-400"
                    : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400"
                }`}
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {MODULE_CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setExploreCategory(cat.key)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer border ${
                    exploreCategory === cat.key
                      ? "bg-slate-900 dark:bg-blue-600 text-white border-slate-900 dark:border-blue-600"
                      : isDark
                      ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {isUr ? cat.ur : cat.en}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {filteredModules.map((mod) => {
                const isCurrent = mod.key === sensedScreenGuide.key;
                return (
                  <div
                    key={mod.key}
                    dir={isUr ? "rtl" : "ltr"}
                    lang={isUr ? "ur" : "en"}
                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-2.5 transition-colors ${
                      isCurrent
                        ? isDark
                          ? "bg-emerald-950/30 border-emerald-600/60"
                          : "bg-emerald-50/70 border-emerald-300"
                        : isDark
                        ? "bg-slate-800/50 border-slate-700/80 hover:border-slate-600"
                        : "bg-white border-slate-200 hover:border-blue-300"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                        {isUr ? mod.section.ur : mod.section.en}
                      </p>
                      <h4
                        className={`text-xs font-extrabold text-slate-900 dark:text-white ${
                          isUr ? "guide-bot-urdu-block" : ""
                        }`}
                      >
                        {isUr ? mod.title.ur : mod.title.en}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewKey(mod.key);
                          setShowDirectory(false);
                          setActiveMainTab("guide");
                        }}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-200/80 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
                      >
                        {isUr ? "گائیڈ" : "Guide"}
                      </button>
                      {!mod.key.includes(":") && (
                        <button
                          type="button"
                          onClick={() => handleNavigateToRoute(mod.key)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white inline-flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <span>{isUr ? "کھولیں" : "Open"}</span>
                          <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : activeMainTab === "tasks" ? (
          /* ================================================================= */
          /* TAB 3: DEDICATED BACKGROUND TASKS MONITOR & CONTROL CENTER        */
          /* ================================================================= */
          <div
            dir={isUr ? "rtl" : "ltr"}
            lang={isUr ? "ur" : "en"}
            className={`guide-bot-drawer-body p-4 space-y-3.5 ${
              isDark ? "bg-slate-950/40" : "bg-slate-50/50"
            }`}
          >
            {/* Background Formulation Enrichment Card */}
            <div
              className={`p-3.5 rounded-2xl border space-y-3 shadow-2xs ${
                isDark
                  ? "bg-slate-900 border-slate-800 text-slate-100"
                  : "bg-white border-slate-200/90 text-slate-800"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="inline-flex items-center gap-1.5 text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                    <SparklesIcon className="w-4 h-4 shrink-0" />
                    <span>
                      {isUr
                        ? "خودکار فارمولیشن ٹاسک (100% تصدیق شدہ)"
                        : "Auto-Fill Missing Formulations (100% Verified Only)"}
                    </span>
                  </div>
                  <p className="text-[12px] leading-relaxed text-slate-600 dark:text-slate-300">
                    {isUr
                      ? "کیوب بیک گراؤنڈ میں خالی فارمولیشن والی پروڈکٹس چیک کرتا ہے اور صرف ان ادویات کی فارمولیشن لگاتا ہے جن کے بارے میں وہ 100% یقینی ہو (کسی بھی پروڈکٹ کا اندازہ یا تکّہ نہیں لگاتا)۔"
                      : "Scans products with empty formulations in background batches (20 at a time). Strictly fills ONLY 100%-verified pharmaceutical formulations — never guesses uncertain or non-medicine items."}
                  </p>
                </div>
              </div>

              {/* Optional Product Name Filter */}
              <div className="space-y-1">
                <label
                  htmlFor="cube-bg-filter-input"
                  className="block text-[11px] font-bold text-slate-500 dark:text-slate-400"
                >
                  {isUr
                    ? "مخصوص پروڈکٹ فلٹر (اختیاری — تمام پروڈکٹس کے لیے خالی چھوڑیں):"
                    : "Optional product name filter (leave empty for all products):"}
                </label>
                <input
                  id="cube-bg-filter-input"
                  type="text"
                  disabled={Boolean(bgTask?.running)}
                  value={bgFilterQuery}
                  onChange={(e) => setBgFilterQuery(e.target.value)}
                  placeholder={
                    isUr
                      ? "مثلاً: Panadol یا Augmentin (اختیاری)..."
                      : "e.g. Panadol or Augmentin (optional)..."
                  }
                  className={`w-full h-9 px-3 rounded-xl border text-base sm:text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 ${
                    isDark
                      ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500"
                      : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400"
                  }`}
                />
              </div>

              {/* Start / Stop Action Buttons */}
              <div className="flex items-center flex-wrap gap-2 pt-0.5">
                {!bgTask?.running ? (
                  <button
                    type="button"
                    onClick={() => startBackgroundFormulationTask()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold bg-indigo-600 hover:bg-indigo-500 text-white shadow-2xs transition-all cursor-pointer active:scale-95"
                  >
                    <span aria-hidden="true">▶️</span>
                    <span>
                      {isUr
                        ? "بیک گراؤنڈ فارمولیشن ٹاسک شروع کریں"
                        : "Start Background Auto-Fill"}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopBackgroundTask}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold bg-rose-600 hover:bg-rose-500 text-white shadow-2xs transition-all cursor-pointer active:scale-95"
                  >
                    <span aria-hidden="true">⏹️</span>
                    <span>
                      {isUr ? "بیک گراؤنڈ ٹاسک روکیں" : "Stop Background Task"}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleNavigateToRoute("/products")}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                    isDark
                      ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200"
                      : "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700"
                  }`}
                >
                  <span>{isUr ? "پروڈکٹس لسٹ کھولیں" : "Open Products"}</span>
                  <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 shrink-0" />
                </button>
              </div>
            </div>

            {/* Live Progress & Telemetry Card */}
            {bgTask ? (
              <div
                className={`p-3.5 rounded-2xl border space-y-3 shadow-2xs ${
                  isDark
                    ? "bg-slate-900 border-slate-800 text-slate-100"
                    : "bg-white border-slate-200/90 text-slate-800"
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    {bgTask.running ? (
                      <SparklesIcon className="w-4 h-4 text-indigo-500 animate-spin shrink-0" />
                    ) : (
                      <CheckCircleIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                    )}
                    <span className="text-xs font-extrabold">
                      {bgTask.running
                        ? isUr
                          ? "بیک گراؤنڈ میں پروڈکٹس چیک ہو رہی ہیں..."
                          : "Running in Background..."
                        : bgTask.status === "stopped"
                        ? isUr
                          ? " صارف نے ٹاسک روک دیا"
                          : "Task Stopped by User"
                        : isUr
                        ? "بیک گراؤنڈ ٹاسک مکمل ہو گیا!"
                        : "Background Task Completed!"}
                    </span>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                      bgTask.running
                        ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300"
                        : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                    }`}
                  >
                    {Math.round(
                      ((bgTask.processedCount || 0) /
                        Math.max(
                          1,
                          (bgTask.processedCount || 0) +
                            (bgTask.remainingCount || 0)
                        )) *
                        100
                    )}
                    %
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      bgTask.running
                        ? "bg-gradient-to-r from-indigo-500 via-blue-500 to-emerald-500"
                        : "bg-emerald-500"
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          ((bgTask.processedCount || 0) /
                            Math.max(
                              1,
                              (bgTask.processedCount || 0) +
                                (bgTask.remainingCount || 0)
                            )) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </div>

                {/* 4-Metric Telemetry Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div
                    className={`p-2 rounded-xl border text-center ${
                      isDark
                        ? "bg-slate-800/70 border-slate-700"
                        : "bg-slate-50 border-slate-200/80"
                    }`}
                  >
                    <p className="text-[10px] font-bold text-slate-400 uppercase">
                      {isUr ? "چیک شدہ" : "Scanned"}
                    </p>
                    <p className="text-sm font-black text-slate-900 dark:text-white">
                      {bgTask.processedCount || 0}
                    </p>
                  </div>

                  <div
                    className={`p-2 rounded-xl border text-center ${
                      isDark
                        ? "bg-emerald-950/35 border-emerald-700/50"
                        : "bg-emerald-50/80 border-emerald-200"
                    }`}
                  >
                    <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                      {isUr ? "100% اپڈیٹ" : "100% Filled"}
                    </p>
                    <p className="text-sm font-black text-emerald-700 dark:text-emerald-300">
                      {bgTask.updatedCount || 0}
                    </p>
                  </div>

                  <div
                    className={`p-2 rounded-xl border text-center ${
                      isDark
                        ? "bg-amber-950/30 border-amber-700/50"
                        : "bg-amber-50/80 border-amber-200"
                    }`}
                  >
                    <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">
                      {isUr ? "نظر انداز (محفوظ)" : "Skipped (Safe)"}
                    </p>
                    <p className="text-sm font-black text-amber-700 dark:text-amber-300">
                      {bgTask.skippedCount || 0}
                    </p>
                  </div>

                  <div
                    className={`p-2 rounded-xl border text-center ${
                      isDark
                        ? "bg-indigo-950/30 border-indigo-700/50"
                        : "bg-indigo-50/80 border-indigo-200"
                    }`}
                  >
                    <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">
                      {isUr ? "باقی" : "Remaining"}
                    </p>
                    <p className="text-sm font-black text-indigo-700 dark:text-indigo-300">
                      {bgTask.remainingCount || 0}
                    </p>
                  </div>
                </div>

                {/* Live Feed of Updated Products */}
                {Array.isArray(bgTask.updatedProducts) &&
                  bgTask.updatedProducts.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <p className="text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400">
                        {isUr
                          ? `✅ اپڈیٹ شدہ پروڈکٹس (${bgTask.updatedProducts.length}):`
                          : `✅ Verified Formulations Filled (${bgTask.updatedProducts.length}):`}
                      </p>
                      <div
                        className={`max-h-52 overflow-y-auto rounded-xl border divide-y ${
                          isDark
                            ? "bg-slate-950/60 border-slate-800 divide-slate-800"
                            : "bg-slate-50 border-slate-200 divide-slate-200/70"
                        }`}
                      >
                        {bgTask.updatedProducts.map((up, idx) => (
                          <div
                            key={`${up.id || idx}-${up.product_code || idx}`}
                            className="px-3 py-1.5 text-xs flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="font-bold text-slate-900 dark:text-white truncate block">
                                {up.name}
                              </span>
                              {up.product_code && (
                                <span className="text-[10px] font-mono text-slate-400">
                                  {up.product_code}
                                </span>
                              )}
                            </div>
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0 max-w-[52%] truncate">
                              {up.formulation}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Skipped Products Summary (Zero Guessing Proof) */}
                {Array.isArray(bgTask.skippedProducts) &&
                  bgTask.skippedProducts.length > 0 && (
                    <div className="space-y-1 pt-0.5">
                      <p className="text-[10.5px] font-bold text-slate-400">
                        {isUr
                          ? `ℹ️ ${bgTask.skippedCount} پروڈکٹس جن میں فارمولیشن کا اندازہ نہیں لگایا گیا (مثلاً عام اشیاء یا غیر واضح نام):`
                          : `ℹ️ Safely skipped without guessing (${bgTask.skippedCount} total):`}
                      </p>
                      <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                        {bgTask.skippedProducts.slice(0, 20).map((sk, idx) => (
                          <span
                            key={`${sk.id || idx}-sk`}
                            className={`px-2 py-0.5 rounded-md text-[10.5px] font-medium border ${
                              isDark
                                ? "bg-slate-800/80 border-slate-700 text-slate-400"
                                : "bg-slate-100 border-slate-200 text-slate-600"
                            }`}
                          >
                            {sk.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            ) : (
              <div
                className={`p-4 rounded-2xl border text-center space-y-1 ${
                  isDark
                    ? "bg-slate-900/50 border-slate-800 text-slate-400"
                    : "bg-white/80 border-slate-200 text-slate-500"
                }`}
              >
                <p className="text-xs font-bold">
                  {isUr
                    ? "اس وقت کوئی بیک گراؤنڈ ٹاسک نہیں چل رہا۔"
                    : "No background task is currently running."}
                </p>
                <p className="text-[11px]">
                  {isUr
                    ? "اوپر دیے گئے بٹن پر کلک کر کے بیک گراؤنڈ میں فارمولیشن اپڈیٹ شروع کریں اور آرام سے اپنا کام یا چیٹ جاری رکھیں۔"
                    : "Click 'Start Background Auto-Fill' above anytime — it runs silently in the background while you chat or work."}
                </p>
              </div>
            )}
          </div>
        ) : activeMainTab === "guide" ? (
          /* ================================================================= */
          /* TAB 2: SCREEN GUIDE, BLUEPRINT & INTERACTIVE WALKTHROUGHS         */
          /* ================================================================= */
          <div
            className={`guide-bot-drawer-body p-4 space-y-3.5 ${
              isDark ? "bg-slate-950/40" : "bg-slate-50/50"
            }`}
          >
            {/* Open Modal Context Banner (CashDrawerModal / AccountsModal) */}
            {activeModalContext && (
              <div
                dir={isUr ? "rtl" : "ltr"}
                lang={isUr ? "ur" : "en"}
                className={`p-3 rounded-2xl border space-y-1 ${
                  isDark
                    ? "bg-cyan-950/35 border-cyan-700/60 text-cyan-100"
                    : "bg-cyan-50/90 border-cyan-300 text-slate-900"
                }`}
              >
                <p className="text-[10.5px] font-extrabold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                  {isUr ? activeModalContext.badge.ur : activeModalContext.badge.en}
                </p>
                <div className="text-xs">
                  <FormattedBotMessage
                    text={isUr ? activeModalContext.summary.ur : activeModalContext.summary.en}
                    isUrdu={isUr}
                  />
                </div>
              </div>
            )}

            {renderCubeDemoPlayer()}

            {thread
              .filter(
                (msg) =>
                  msg.kind === "greeting" ||
                  msg.fromGuideChip ||
                  (msg.role === "bot" && msg.kind !== "qa")
              )
              .map((msg) => {
                if (msg.role === "user") {
                  const userText = msg.label
                    ? isUr
                      ? msg.label.ur
                      : msg.label.en
                    : msg.text;
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div
                        dir={isUr ? "rtl" : "ltr"}
                        lang={isUr ? "ur" : "en"}
                        className={`max-w-[85%] px-3.5 py-2 rounded-2xl rounded-br-xs bg-slate-900 dark:bg-blue-600 text-white text-xs sm:text-[13px] font-semibold shadow-2xs ${
                          isUr ? "guide-bot-urdu-block" : ""
                        }`}
                      >
                        {userText}
                      </div>
                    </div>
                  );
                }
                return renderCubeBotCard(msg);
              })}

            {cubeAvailableChips.length > 0 && (
              <div
                dir={isUr ? "rtl" : "ltr"}
                lang={isUr ? "ur" : "en"}
                className="space-y-1.5 pt-1"
              >
                <p className="text-[11px] font-bold text-slate-400 dark:text-slate-400 px-0.5">
                  {isUr
                    ? "مزید جاننے کے لیے کسی موضوع پر کلک کریں:"
                    : "Tap a topic to explore:"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {cubeAvailableChips.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => handleTopicChipClick(chip.type, chip)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer active:scale-95 ${
                        chip.type === "walkthrough"
                          ? "bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                          : isDark
                          ? "bg-slate-900 hover:bg-slate-800 border-slate-700/90 text-slate-200 hover:border-blue-500/60"
                          : "bg-white hover:bg-blue-50/60 border-slate-200/90 text-slate-700 hover:border-blue-300 shadow-2xs"
                      } ${isUr ? "guide-bot-urdu-inline" : ""}`}
                    >
                      <span aria-hidden="true">{chip.icon}</span>
                      <span>{isUr ? chip.ur : chip.en}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {relatedRoutes.length > 0 && (
              <div
                dir={isUr ? "rtl" : "ltr"}
                lang={isUr ? "ur" : "en"}
                className="space-y-1.5 pt-0.5"
              >
                <p className="text-[11px] font-bold text-slate-400 dark:text-slate-400 px-0.5">
                  {isUr ? "متعلقہ صفحات کھولیں:" : "Quick open related screen:"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {relatedRoutes.map((rel) => (
                    <button
                      key={rel.path}
                      type="button"
                      onClick={() => handleNavigateToRoute(rel.path)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-300 border border-blue-500/20 transition-colors cursor-pointer ${
                        isUr ? "guide-bot-urdu-inline" : ""
                      }`}
                    >
                      <span>{isUr ? rel.ur : rel.en}</span>
                      <ArrowTopRightOnSquareIcon className="w-3 h-3 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        ) : (
          /* ================================================================= */
          /* TAB 1 (DEFAULT): CLEAN AI CHAT ONLY                               */
          /* ================================================================= */
          <div
            className={`guide-bot-drawer-body p-4 space-y-3.5 ${
              isDark ? "bg-slate-950/40" : "bg-slate-50/50"
            }`}
          >
            {/* Subtle 1-Line Pill if Background Task is Running (Switch to Tasks Tab if Wanted) */}
            {bgTask?.running && (
              <div
                dir={isUr ? "rtl" : "ltr"}
                lang={isUr ? "ur" : "en"}
                className="px-3 py-2 rounded-xl border bg-indigo-500/10 border-indigo-500/30 text-indigo-950 dark:text-indigo-200 flex items-center justify-between gap-2 text-xs font-bold"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <SparklesIcon className="w-3.5 h-3.5 shrink-0 text-indigo-500 animate-spin" />
                  <span className="truncate">
                    {isUr
                      ? `بیک گراؤنڈ ٹاسک جاری (${bgTask.updatedCount} اپڈیٹ)...`
                      : `Background task running (${bgTask.updatedCount} filled)...`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveMainTab("tasks")}
                  className="px-2 py-0.5 rounded-lg text-[10.5px] font-extrabold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shrink-0"
                >
                  {isUr ? "ٹاسک دیکھیں ←" : "View Task →"}
                </button>
              </div>
            )}

            {(() => {
              const chatMessages = thread.filter(
                (msg) =>
                  (msg.role === "user" && !msg.fromGuideChip) || msg.kind === "qa"
              );

              if (chatMessages.length === 0 && !isTyping) {
                return (
                  <div
                    dir={isUr ? "rtl" : "ltr"}
                    lang={isUr ? "ur" : "en"}
                    className={`p-4 rounded-2xl border space-y-3 shadow-2xs ${
                      isDark
                        ? "bg-slate-900 border-slate-800 text-slate-100"
                        : "bg-white border-slate-200/90 text-slate-800"
                    }`}
                  >
                    <div className="space-y-1">
                      <p className="text-xs font-extrabold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                        <SparklesIcon className="w-4 h-4 shrink-0" />
                        <span>
                          {isUr
                            ? "کیوب اے آئی چیٹ (کلین موڈ)"
                            : "Cube AI Chat (Clean Mode)"}
                        </span>
                      </p>
                      <p className="text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-300">
                        {isUr
                          ? "یہاں آپ بغیر کسی اضافی کارڈ کے براہِ راست کیوب اے آئی سے بات کر سکتے ہیں، نئی پروڈکٹ شامل کر سکتے ہیں یا موجودہ پروڈکٹ ایڈٹ کر سکتے ہیں۔"
                          : "Chat directly with Cube AI without screen clutter. Ask any question, or tell Cube to add or edit a product (Cube will ask for any required fields and never assumes)."}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          handleAskSubmit(null, "Add a new product", true)
                        }
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer active:scale-95 ${
                          isDark
                            ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-emerald-300"
                            : "bg-emerald-50/70 hover:bg-emerald-100 border-emerald-200 text-emerald-800"
                        }`}
                      >
                        <span aria-hidden="true">➕</span>
                        <span>{isUr ? "نئی پروڈکٹ بنائیں" : "Add Product"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleAskSubmit(null, "Edit a product", true)
                        }
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer active:scale-95 ${
                          isDark
                            ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-amber-300"
                            : "bg-amber-50/70 hover:bg-amber-100 border-amber-200 text-amber-800"
                        }`}
                      >
                        <span aria-hidden="true">✏️</span>
                        <span>{isUr ? "پروڈکٹ ایڈٹ کریں" : "Edit Product"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveMainTab("tasks")}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer active:scale-95 ${
                          isDark
                            ? "bg-indigo-950/60 hover:bg-indigo-900/70 border-indigo-500/40 text-indigo-200"
                            : "bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-800"
                        }`}
                      >
                        <span aria-hidden="true">⚡</span>
                        <span>
                          {isUr ? "بیک گراؤنڈ ٹاسکس" : "Background Tasks"}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              }

              return chatMessages.map((msg) => {
                if (msg.role === "user") {
                  const userText = msg.label
                    ? isUr
                      ? msg.label.ur
                      : msg.label.en
                    : msg.text;
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div
                        dir={isUr ? "rtl" : "ltr"}
                        lang={isUr ? "ur" : "en"}
                        className={`max-w-[85%] px-3.5 py-2 rounded-2xl rounded-br-xs bg-slate-900 dark:bg-blue-600 text-white text-xs sm:text-[13px] font-semibold shadow-2xs ${
                          isUr ? "guide-bot-urdu-block" : ""
                        }`}
                      >
                        {userText}
                      </div>
                    </div>
                  );
                }
                return renderCubeBotCard(msg);
              });
            })()}

            {isTyping && (
              <div className="flex items-center gap-2">
                <div
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl rounded-tl-xs border ${
                    isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" />
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce"
                    style={{ animationDelay: "120ms" }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce"
                    style={{ animationDelay: "240ms" }}
                  />
                </div>
              </div>
            )}

            {!isTyping &&
              thread.some(
                (msg) =>
                  (msg.role === "user" && !msg.fromGuideChip) || msg.kind === "qa"
              ) && (
                <div
                  dir={isUr ? "rtl" : "ltr"}
                  lang={isUr ? "ur" : "en"}
                  className="pt-1 flex items-center justify-between gap-2 flex-wrap"
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() =>
                        handleAskSubmit(null, "Add a new product", true)
                      }
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                        isDark
                          ? "bg-slate-900 hover:bg-slate-800 border-slate-700 text-emerald-300"
                          : "bg-white hover:bg-emerald-50 border-slate-200 text-emerald-700"
                      }`}
                    >
                      <span aria-hidden="true">➕</span>
                      <span>{isUr ? "نئی پروڈکٹ" : "Add Product"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleAskSubmit(null, "Edit a product", true)
                      }
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                        isDark
                          ? "bg-slate-900 hover:bg-slate-800 border-slate-700 text-amber-300"
                          : "bg-white hover:bg-amber-50 border-slate-200 text-amber-700"
                      }`}
                    >
                      <span aria-hidden="true">✏️</span>
                      <span>{isUr ? "پروڈکٹ ایڈٹ" : "Edit Product"}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={clearChatOnly}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    <ArrowPathIcon className="w-3 h-3" />
                    <span>{isUr ? "چیٹ صاف کریں" : "Clear chat"}</span>
                  </button>
                </div>
              )}

            <div ref={chatEndRef} />
          </div>
        )}

        {/* =================================================================== */}
        {/* BOTTOM ASK INPUT BAR                                                */}
        {/* =================================================================== */}
        <footer
          className={`p-3 shrink-0 ${
            isDark
              ? "bg-slate-900 border-t border-slate-800"
              : "bg-white border-t border-slate-200"
          }`}
        >
          <form onSubmit={handleAskSubmit} className="flex items-center gap-2">
            <label htmlFor="guide-bot-ask-input" className="sr-only">
              Ask a question
            </label>
            <input
              id="guide-bot-ask-input"
              ref={askInputRef}
              type="text"
              dir={isUr ? "rtl" : "ltr"}
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              placeholder={
                isUr
                  ? "کچھ بھی پوچھیں (مثلاً: پرچیز آرڈر کیسے بنائیں؟)..."
                  : "Ask Cube anything (e.g. how to make purchase order)..."
              }
              className={`flex-1 h-10 px-3.5 text-base sm:text-[13px] font-medium rounded-xl border focus:outline-hidden focus:ring-2 focus:ring-blue-500 ${
                isDark
                  ? "bg-slate-800 border-slate-700 text-white placeholder-slate-400"
                  : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400"
              }`}
            />
            <button
              type="submit"
              aria-label={isUr ? "سوال بھیجیں" : "Send question"}
              className="h-10 px-3.5 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer shrink-0 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <PaperAirplaneIcon className="w-4 h-4" />
            </button>
          </form>
        </footer>
      </div>
      </dialog>
    </>
  );
}
