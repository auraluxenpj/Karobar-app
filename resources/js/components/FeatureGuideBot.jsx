// resources/js/components/FeatureGuideBot.jsx
import React, {
  useState,
  useEffect,
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
  ExclamationTriangleIcon,
  LightBulbIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "@/context/ThemeContext.jsx";
import {
  GuideBotAvatar,
  getGuideBotMascotStyle,
  setGuideBotMascotStyle,
  useGuideBotOpenState,
  useBottomMascotEnabledState,
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
  saveLearnedCursorKnowledge,
} from "@/data/guideBotKnowledge.js";
import {
  BackgroundTaskDetailView,
  loadPersistedBgTask,
  savePersistedBgTask,
} from "@/pages/BackgroundTasks/Index.jsx";
import SpotlightTourOverlay, {
  buildInteractiveSpotlightSteps,
  findBestTourTargetElement,
} from "./SpotlightTourOverlay.jsx";

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
  const growableTextareaWrapRef = useRef(null);
  const chatScrollRef = useRef(null);
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
  const [thinkingStageIdx, setThinkingStageIdx] = useState(0);
  const [isReasoningExpanded, setIsReasoningExpanded] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState(null);
  const [streamedCharCount, setStreamedCharCount] = useState(0);
  const [copiedMsgId, setCopiedMsgId] = useState(null);
  const streamIntervalRef = useRef(null);
  const [questionInput, setQuestionInput] = useState("");
  const [popupTrickIdx, setPopupTrickIdx] = useState(0);
  const [showScrollToBottomBtn, setShowScrollToBottomBtn] = useState(false);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);

  // Cycle through live AI reasoning stages while waiting for response
  useEffect(() => {
    if (!isTyping) {
      setThinkingStageIdx(0);
      return;
    }
    const timer = window.setInterval(() => {
      setThinkingStageIdx((prev) => (prev + 1) % 3);
    }, 950);
    return () => window.clearInterval(timer);
  }, [isTyping]);

  // Live response token/chunk streaming engine
  const stopLiveStream = useCallback(() => {
    if (streamIntervalRef.current) {
      window.clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    setStreamingMsgId(null);
    setStreamedCharCount(0);
  }, []);

  const startLiveStream = useCallback(
    (msgId, fullText = "") => {
      if (streamIntervalRef.current) {
        window.clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
      }
      const totalLen = String(fullText || "").length;
      if (!msgId || totalLen <= 24) {
        setStreamingMsgId(null);
        setStreamedCharCount(totalLen);
        return;
      }
      setStreamingMsgId(msgId);
      setStreamedCharCount(18);
      const stepSize = Math.max(12, Math.min(36, Math.ceil(totalLen / 38)));
      streamIntervalRef.current = window.setInterval(() => {
        setStreamedCharCount((prev) => {
          const next = prev + stepSize;
          if (next >= totalLen) {
            if (streamIntervalRef.current) {
              window.clearInterval(streamIntervalRef.current);
              streamIntervalRef.current = null;
            }
            setStreamingMsgId(null);
            return totalLen;
          }
          return next;
        });
      }, 22);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (streamIntervalRef.current) {
        window.clearInterval(streamIntervalRef.current);
      }
    };
  }, []);

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
  const [bgTask, setBgTask] = useState(() => loadPersistedBgTask());
  const [bgFilterQuery, setBgFilterQuery] = useState("");
  const [bgTaskAwaitingPermission, setBgTaskAwaitingPermission] = useState(false);
  const [bgPreviewLoading, setBgPreviewLoading] = useState(false);
  const [bgPreviewData, setBgPreviewData] = useState(null);
  const [reportFilterTab, setReportFilterTab] = useState("all"); // 'all' | 'filled' | 'skipped'
  const [reportSearchQuery, setReportSearchQuery] = useState("");
  const [isBgTaskDetailPopupOpen, setIsBgTaskDetailPopupOpen] = useState(false);
  const bgDetailDialogRef = useRef(null);
  const bgDetailTitleId = useId();
  const bgTaskCancelRef = useRef(false);

  // Persist bgTask state so the Separate Page (/background-tasks) and Popup stay synchronized
  useEffect(() => {
    if (bgTask !== undefined) {
      savePersistedBgTask(bgTask);
    }
  }, [bgTask]);

  useEffect(() => {
    const onExternalStop = () => {
      bgTaskCancelRef.current = true;
    };
    window.addEventListener("karobar:bg-task-stop", onExternalStop);
    return () => window.removeEventListener("karobar:bg-task-stop", onExternalStop);
  }, []);

  // Native <dialog closedby="any"> control + light-dismiss fallback for the Background Task Detail Popup
  useEffect(() => {
    const dialog = bgDetailDialogRef.current;
    if (!dialog) return;

    if (isBgTaskDetailPopupOpen) {
      if (!dialog.open && typeof dialog.showModal === "function") {
        try {
          dialog.showModal();
        } catch {
          dialog.setAttribute("open", "");
        }
      }
    } else if (dialog.open && typeof dialog.close === "function") {
      try {
        dialog.close();
      } catch {
        dialog.removeAttribute("open");
      }
    }

    const handleNativeClose = () => {
      setIsBgTaskDetailPopupOpen(false);
    };

    const handleBackdropClick = (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isDialogContent =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (!isDialogContent) {
        dialog.close();
      }
    };

    dialog.addEventListener("close", handleNativeClose);
    if (
      typeof HTMLDialogElement !== "undefined" &&
      !("closedBy" in HTMLDialogElement.prototype)
    ) {
      dialog.addEventListener("click", handleBackdropClick);
    }

    return () => {
      dialog.removeEventListener("close", handleNativeClose);
      dialog.removeEventListener("click", handleBackdropClick);
    };
  }, [isBgTaskDetailPopupOpen]);

  const triggerBotTalking = useCallback((durationMs = 1800) => {
    setVisualTalking(true);
    const t = window.setTimeout(() => setVisualTalking(false), durationMs);
    return () => window.clearTimeout(t);
  }, []);

  const scrollToBottom = useCallback(() => {
    window.setTimeout(() => {
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTo({
          top: chatScrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      }
      chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      setShowScrollToBottomBtn(false);
    }, 45);
  }, []);

  const handleChatScroll = useCallback((e) => {
    const el = e.currentTarget;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollToBottomBtn(distanceFromBottom > 140);
  }, []);

  /**
   * Highlights a live DOM element on the user's current screen during a Cube Walkthrough.
   * Uses semantic scoring (`findBestTourTargetElement`) scoped strictly to `.workspace-page, main`.
   */
  const highlightElementOnScreen = useCallback((selector, stepMeta = null) => {
    if (typeof document === "undefined") return;
    if (highlightTimerRef.current) {
      window.clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    document
      .querySelectorAll(".guide-bot-dom-highlight")
      .forEach((el) => el.classList.remove("guide-bot-dom-highlight"));

    const target = findBestTourTargetElement(
      stepMeta || { target: selector, targetSelector: selector },
      selector
    );

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

  // Detect if the currently displayed screen has a matching curated Cube Demo Manifest
  // Strictly match only when the exact screen is the primaryScreen of a multi-step single-screen workflow
  const currentScreenWorkflowId = useMemo(() => {
    const key = displayedGuide?.key || "";
    if (key === "/purchase-orders/create") return "create_purchase_order";
    if (key === "/purchase-invoices/create") return "create_purchase_invoice";
    if (key === "/sale-invoices/pos") return "pos_counter_billing";
    if (key === "/sale-invoices/create/retail") return "create_retail_invoice";
    if (key === "/customer-ledger") return "customer_udhar_recovery";
    if (key === "/cash-drawer") return "cash_drawer_shift";
    if (key === "/stock-adjustments/create") return "inventory_adjustment";
    return null;
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
    setActiveDemo((prev) => (prev ? { ...prev, stepIndex: 0 } : null));
  }, [location.pathname]);

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

  /**
   * Launches an Interactive On-Screen Spotlight Tour (`SpotlightTourOverlay`).
   * Works on any screen: uses curated `DEMO_MANIFESTS` when available or builds
   * a dynamic screen-specific spotlight walkthrough (`dynamic_screen_tour`).
   * Minimizes the modal drawer by default so the underlying ERP screen is live and interactive.
   */
  const startCubeDemo = useCallback(
    (workflowId = null, minimizeDrawer = true) => {
      const resolvedId =
        workflowId && DEMO_MANIFESTS[workflowId]
          ? workflowId
          : currentScreenWorkflowId && DEMO_MANIFESTS[currentScreenWorkflowId]
          ? currentScreenWorkflowId
          : "dynamic_screen_tour";

      setShowDirectory(false);
      setHighlightStatus(null);
      setActiveMainTab("guide");
      setActiveDemo({
        workflowId: resolvedId,
        stepIndex: 0,
        pausedForDetour: false,
        spotlightActive: true,
      });
      triggerBotTalking(1800);
      if (minimizeDrawer) {
        runSmoothClose(true);
      }
    },
    [currentScreenWorkflowId, runSmoothClose, triggerBotTalking]
  );

  // Build the active Spotlight Tour steps for either a curated workflow or any of the 80+ screens
  const activeSpotlightData = useMemo(() => {
    if (!activeDemo) return { title: null, steps: [] };
    const manifest =
      activeDemo.workflowId && DEMO_MANIFESTS[activeDemo.workflowId]
        ? DEMO_MANIFESTS[activeDemo.workflowId]
        : null;
    const built = buildInteractiveSpotlightSteps({
      currentPath: location.pathname,
      guide: displayedGuide,
      manifest,
    });
    if (Array.isArray(built)) {
      return {
        title: manifest?.title || displayedGuide?.title || null,
        steps: built,
      };
    }
    return {
      title: built?.title || manifest?.title || displayedGuide?.title || null,
      steps: Array.isArray(built?.steps) ? built.steps : [],
    };
  }, [activeDemo, location.pathname, displayedGuide]);

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
    const botCardId = `b-${Date.now()}`;

    const renderStaticDocsFallback = () => {
      setIsTyping(false);
      const fallbackBotItem = {
        id: botCardId,
        role: "bot",
        kind: topicType,
        guideKey: displayedGuide.key,
        faq: payload?.faq || null,
        chipId: topicId,
      };
      setThread((prev) => [...prev, fallbackBotItem]);
      scrollToBottom();
      window.setTimeout(() => setVisualTalking(false), 1800);
    };

    // Primary: Generate answer from Generative AI first; fall back to static docs only if AI fails
    const topicQuestion = isUr ? userLabel.ur || userLabel.en : userLabel.en;
    if (!topicQuestion) {
      renderStaticDocsFallback();
      return;
    }

    axios
      .post("/api/cube/ask", {
        question: topicQuestion,
        language: isUr ? "ur" : "en",
        current_route: displayedGuide?.key || location.pathname || "/dashboard",
        screen_guide_id: displayedGuide?.key || null,
        explain_mode: "screen_topic",
      })
      .then((res) => {
        const data = res?.data || {};
        const aiEn = data.answer_en || data.en || "";
        const aiUr = data.answer_ur || data.ur || "";
        const isGeneratedByAi =
          (data.provider === "groq" || data.provider === "gemini") &&
          Boolean(aiEn || aiUr);

        if (!isGeneratedByAi) {
          renderStaticDocsFallback();
          return;
        }

        saveLearnedCursorKnowledge({
          questionText: topicQuestion,
          route: displayedGuide?.key || location.pathname || "/dashboard",
          titleEn: data.title_en || data.title?.en || userLabel.en,
          titleUr: data.title_ur || data.title?.ur || userLabel.ur,
          answerEn: aiEn,
          answerUr: aiUr,
          provider: data.provider || "ai",
        });

        setIsTyping(false);
        const aiBotItem = {
          id: botCardId,
          role: "bot",
          kind: "qa",
          fromGuideChip: true,
          questionText: topicQuestion,
          title: {
            en: data.title_en || data.title?.en || userLabel.en,
            ur: data.title_ur || data.title?.ur || userLabel.ur,
          },
          en: aiEn,
          ur: aiUr || aiEn,
          links: Array.isArray(data.links) ? data.links : [],
          evidenceType:
            data.evidence_classification || EVIDENCE_TYPES.AI_GROUNDED_DOCS,
          evidenceBadge: data.evidence_badge,
          sourceIds: Array.isArray(data.source_ids) ? data.source_ids : [],
          providerStatus: data.provider_status || "groq_primary",
          workflowId:
            data.workflow_id && DEMO_MANIFESTS[data.workflow_id]
              ? data.workflow_id
              : null,
        };
        setThread((prev) => [...prev, aiBotItem]);
        startLiveStream(botCardId, isUr ? aiUr || aiEn : aiEn);
        scrollToBottom();
        window.setTimeout(() => setVisualTalking(false), 1800);
      })
      .catch(() => {
        // Fallback to static docs card if AI endpoint is unreachable
        renderStaticDocsFallback();
      });
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
            accumulatedUpdated = [...accumulatedUpdated, ...newUpdatedList].slice(
              0,
              5000
            );
          }
          if (newSkippedList.length > 0) {
            accumulatedSkipped = [...accumulatedSkipped, ...newSkippedList].slice(
              0,
              5000
            );
          }

          if (meta.refresh_products && typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("karobar:products-updated", { detail: meta })
            );
          }

          const stillRunning = Boolean(nextBg.has_more);
          const nextReportSnapshot = {
            running: stillRunning,
            status: stillRunning ? "running" : "completed",
            processedCount: totalProcessed,
            updatedCount: totalUpdated,
            skippedCount: totalSkipped,
            remainingCount: remaining,
            updatedProducts: accumulatedUpdated,
            skippedProducts: accumulatedSkipped,
            filterQuery,
          };

          setBgTask(nextReportSnapshot);

          if (cardId) {
            setThread((prev) =>
              prev.map((item) =>
                item.id === cardId
                  ? {
                      ...item,
                      hasBackgroundTask: true,
                      autoFillReport: nextReportSnapshot,
                      title: {
                        en: stillRunning
                          ? `Background Task Running (${totalUpdated} Filled, ${totalSkipped} Skipped, ${remaining} Remaining)`
                          : `Completed: Auto-Filled ${totalUpdated} Formulation(s) • ${totalSkipped} Skipped (Detailed Report Below)`,
                        ur: stillRunning
                          ? `بیک گراؤنڈ ٹاسک جاری (${totalUpdated} اپڈیٹ، ${totalSkipped} چھوڑی گئیں، ${remaining} باقی)`
                          : `مکمل: ${totalUpdated} پروڈکٹس میں فارمولیشن شامل • ${totalSkipped} چھوڑی گئیں (تفصیلی رپورٹ نیچے دیکھیں)`,
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

      const finalStatus = bgTaskCancelRef.current ? "stopped" : "completed";
      setBgTask((prev) =>
        prev
          ? {
              ...prev,
              running: false,
              status: prev.status === "error" ? "error" : finalStatus,
            }
          : null
      );

      if (cardId) {
        setThread((prev) =>
          prev.map((item) =>
            item.id === cardId && item.autoFillReport
              ? {
                  ...item,
                  autoFillReport: {
                    ...item.autoFillReport,
                    running: false,
                    status: finalStatus,
                  },
                }
              : item
          )
        );
      }
    },
    []
  );

  /**
   * Computes a dry-run staged preview of Background Formulation Auto-Fill (`preview_only: true`)
   * so the user sees the exact products and 100%-verified formulations BEFORE anything is posted to the database.
   */
  const previewBackgroundFormulationTask = useCallback(async () => {
    if (bgTask?.running || bgPreviewLoading) return;
    const filterToUse = bgFilterQuery.trim();
    setBgPreviewLoading(true);
    setBgTaskAwaitingPermission(true);
    try {
      const res = await axios.post("/api/cube/execute-task", {
        task_type: "bulk_autofill_missing_formulations",
        batch_size: 20,
        after_id: 0,
        filter_query: filterToUse,
        preview_only: true,
      });
      const data = res?.data || {};
      const previewResult = data.task_meta?.preview_result || null;
      setBgPreviewData(previewResult);
    } catch {
      setBgPreviewData(null);
    } finally {
      setBgPreviewLoading(false);
    }
  }, [bgFilterQuery, bgPreviewLoading, bgTask?.running]);

  /**
   * Starts the 100%-certainty background formulation auto-fill directly inside the Background Tasks tab
   * after the user reviews the staged preview and grants permission.
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
   * Exports the Detailed Auto-Fill Formulation Report (both Filled and Skipped items) as a CSV file.
   */
  const exportAutoFillReportCsv = useCallback((report) => {
    if (!report || typeof document === "undefined") return;
    const filled = Array.isArray(report.updatedProducts) ? report.updatedProducts : [];
    const skipped = Array.isArray(report.skippedProducts) ? report.skippedProducts : [];

    const escapeCsv = (val) => {
      const str = String(val ?? "").replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = [
      [
        "Status",
        "Product ID",
        "Product Code",
        "Product Name",
        "Formulation (Generic Salt)",
        "Verification / Skip Reason",
        "Google Search Query",
      ].map(escapeCsv).join(","),
    ];

    filled.forEach((item) => {
      rows.push(
        [
          "FILLED",
          item.id || "",
          item.product_code || "",
          item.name || "",
          item.formulation || "",
          item.source_en || "Google Search Verified",
          item.search_query || "",
        ]
          .map(escapeCsv)
          .join(",")
      );
    });

    skipped.forEach((item) => {
      rows.push(
        [
          "SKIPPED",
          item.id || "",
          item.product_code || "",
          item.name || "",
          "",
          item.reason_en || "No verified salt found on Google Search — skipped",
          item.search_query || "",
        ]
          .map(escapeCsv)
          .join(",")
      );
    });

    const csvContent = "\uFEFF" + rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `karobar-autofill-formulation-report-${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  /**
   * Handles user questions in Cube's Companion Drawer using the 4-layer Hybrid Intelligence Architecture:
   *   Layer 1: Local trained intelligence engine (`routeUserQuery`)
   *   Layer 2: Groq Primary AI (via `POST /api/cube/ask`)
   *   Layer 3: Google Gemini Backup AI (via `POST /api/cube/ask`)
   *   Layer 4: Local knowledge fallback
   */
  const handleAskSubmit = async (
    e,
    presetQuery = null,
    forceAi = false,
    userConfirmed = false,
    permissionCardId = null
  ) => {
    if (e) {
      if (typeof e.preventDefault === "function") e.preventDefault();
      if (typeof e.stopPropagation === "function") e.stopPropagation();
    }
    const raw = (presetQuery ?? questionInput).trim().slice(0, 2000);
    if (!raw) return;

    const isUserTypedQuestion = presetQuery === null || forceAi || userConfirmed;
    setActiveMainTab("chat");

    if (permissionCardId) {
      setThread((prev) =>
        prev.map((item) =>
          item.id === permissionCardId
            ? {
                ...item,
                permissionResolved: userConfirmed ? "approved" : "cancelled",
              }
            : item
        )
      );
    }

    const routed = routeUserQuery({
      queryText: raw,
      currentSpeaker: "cube",
      currentGuide: displayedGuide,
      currentPathname: location.pathname,
      activeDemo,
    });

    const localReply = routed.answer || answerUserQuestion(raw, displayedGuide);
    const lastBotMsg = [...thread].reverse().find((m) => m && m.role === "bot");
    const isAnsweringPendingTask =
      Boolean(userConfirmed) ||
      lastBotMsg?.providerStatus === "cube_task_needs_input" ||
      lastBotMsg?.providerStatus === "cube_task_awaiting_permission";

    // Deterministic walkthrough intelligence: never allow AI to invent selectors or workflow IDs
    if (!isAnsweringPendingTask && routed.startDemoNow) {
      const targetWf =
        routed.workflowId && DEMO_MANIFESTS[routed.workflowId]
          ? routed.workflowId
          : currentScreenWorkflowId || "dynamic_screen_tour";
      setActiveDemo({
        workflowId: targetWf,
        stepIndex: 0,
        pausedForDetour: false,
        spotlightActive: true,
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
    if (!presetQuery) {
      setQuestionInput("");
      if (
        growableTextareaWrapRef.current &&
        typeof CSS !== "undefined" &&
        !CSS.supports("field-sizing", "content")
      ) {
        growableTextareaWrapRef.current.dataset.replicatedValue = "";
      }
    }
    setSlashMenuOpen(false);
    setShowDirectory(false);
    setIsTyping(true);
    setVisualTalking(true);
    scrollToBottom();

    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);

    // Keep only interactive spotlight walkthrough triggers and live-data privacy boundaries local;
    // route all software questions, screen explanations, and preset prompts through Generative AI
    // so the bot explains our software with AI and continuously improves its old knowledge.
    const isStrictlyLocalIntent =
      !isAnsweringPendingTask &&
      (routed.startDemoNow ||
        routed.matchedIntentId === "live_data_privacy_boundary");

    const shouldUseHybridAi =
      forceAi ||
      userConfirmed ||
      isAnsweringPendingTask ||
      !isStrictlyLocalIntent ||
      routed.shouldCallAi ||
      isUserTypedQuestion;

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
        startLiveStream(nextBotItem.id, isUr ? localReply.ur : localReply.en);
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
        user_confirmed: Boolean(userConfirmed),
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
        data.provider_status === "cube_task_executed" &&
          (bgMeta || data.task_meta?.action === "bulk_autofill_missing_formulations")
      );

      const nextCardId = `b-${Date.now()}`;
      const resolvedTitleEn =
        data.title_en || data.title?.en || localReply.title?.en || "Karobar ERP Guide";
      const resolvedTitleUr =
        data.title_ur || data.title?.ur || localReply.title?.ur || "کاروبار ایپ رہنمائی";
      const resolvedAnswerEn = data.answer_en || data.en || localReply.en;
      const resolvedAnswerUr = data.answer_ur || data.ur || localReply.ur;

      if (data.provider === "groq" || data.provider === "gemini") {
        saveLearnedCursorKnowledge({
          intentId: routed.matchedIntentId || "",
          questionText: raw,
          route: displayedGuide?.key || location.pathname || "/dashboard",
          titleEn: resolvedTitleEn,
          titleUr: resolvedTitleUr,
          answerEn: resolvedAnswerEn,
          answerUr: resolvedAnswerUr,
          provider: data.provider,
        });
      }

      const initUpdated = Number(data.task_meta?.updated_count || 0);
      const initProcessed = Number(bgMeta?.processed_in_batch || 0);
      const initUpdatedProducts = Array.isArray(data.task_meta?.updated_products)
        ? data.task_meta.updated_products
        : [];
      const initSkippedProducts = Array.isArray(data.task_meta?.skipped_products)
        ? data.task_meta.skipped_products
        : [];
      const initRemaining = Number(bgMeta?.remaining_count || 0);
      const initialReportSnapshot = isBgTaskResponse
        ? {
            running: Boolean(bgMeta?.has_more),
            status: bgMeta?.has_more ? "running" : "completed",
            processedCount: initProcessed,
            updatedCount: initUpdated,
            skippedCount: initSkippedProducts.length,
            remainingCount: initRemaining,
            updatedProducts: initUpdatedProducts,
            skippedProducts: initSkippedProducts,
            filterQuery: bgMeta?.filter_query || "",
          }
        : null;

      const nextBotItem = {
        id: nextCardId,
        role: "bot",
        kind: "qa",
        questionText: raw,
        hasBackgroundTask: isBgTaskResponse,
        autoFillReport: initialReportSnapshot,
        taskMeta: data.task_meta || null,
        title: {
          en: resolvedTitleEn,
          ur: resolvedTitleUr,
        },
        en: resolvedAnswerEn,
        ur: resolvedAnswerUr,
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
      startLiveStream(nextCardId, isUr ? resolvedAnswerUr : resolvedAnswerEn);
      scrollToBottom();
      window.setTimeout(() => setVisualTalking(false), 1800);

      if (isBgTaskResponse && initialReportSnapshot) {
        setBgTask(initialReportSnapshot);

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
    const chips = [
      {
        id: `walkthrough-${currentScreenWorkflowId || displayedGuide?.key || "screen"}`,
        type: "walkthrough",
        workflowId: currentScreenWorkflowId || "dynamic_screen_tour",
        icon: "🎯",
        en: "Interactive Spotlight Tour (Live Step-by-Step)",
        ur: "لائیو اسپاٹ لائٹ گائیڈ (مرحلہ وار عملی ڈیمو)",
      },
    ];
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

  // `/` Slash Command Palette definitions (Notion AI / Linear / Cursor style)
  const slashCommands = useMemo(
    () => [
      {
        id: "add-product",
        cmd: "/add-product",
        icon: "➕",
        en: "Add New Product",
        ur: "نئی پروڈکٹ شامل کریں",
        descEn: "Guided wizard with DB duplicate check & staged preview",
        descUr: "ڈپلیکیٹ چیک اور پری ویو کے ساتھ نئی پروڈکٹ بنائیں",
        prompt: "Add a new product",
      },
      {
        id: "edit-product",
        cmd: "/edit-product",
        icon: "✏️",
        en: "Edit Existing Product",
        ur: "پروڈکٹ کی قیمت یا تفصیل بدلیں",
        descEn: "Update price, rack, formulation, or barcode with before/after diff",
        descUr: "پروڈکٹ کی قیمت، ریک یا فارمولیشن تبدیل کریں",
        prompt: "Edit a product",
      },
      {
        id: "autofill",
        cmd: "/autofill",
        icon: "🧪",
        en: "Auto-Fill Formulations (Google Search)",
        ur: "گوگل سرچ سے فارمولیشن لگائیں",
        descEn: "Search Google for verified generic salts & generate detailed report",
        descUr: "گوگل سرچ سے تصدیق شدہ سالٹ تلاش کریں اور رپورٹ دیکھیں",
        prompt: "Auto-fill missing formulations for my products",
      },
      {
        id: "add-brand",
        cmd: "/add-brand",
        icon: "🏷️",
        en: "Add New Brand",
        ur: "نیا برانڈ شامل کریں",
        descEn: "Create a pharmaceutical or consumer brand with preview",
        descUr: "نیا برانڈ ڈیٹا بیس میں شامل کریں",
        prompt: "Add a new brand",
      },
      {
        id: "add-category",
        cmd: "/add-category",
        icon: "📂",
        en: "Add New Category",
        ur: "نئی کیٹیگری بنائیں",
        descEn: "Create a product category with staged preview",
        descUr: "نئی پروڈکٹ کیٹیگری بنائیں",
        prompt: "Add a new category",
      },
      {
        id: "add-supplier",
        cmd: "/add-supplier",
        icon: "🚚",
        en: "Add New Supplier",
        ur: "نیا سپلائر شامل کریں",
        descEn: "Register a distributor or supplier account",
        descUr: "نیا سپلائر یا ڈسٹری بیوٹر شامل کریں",
        prompt: "Add a new supplier",
      },
      {
        id: "add-customer",
        cmd: "/add-customer",
        icon: "👤",
        en: "Add New Customer",
        ur: "نیا کسٹمر شامل کریں",
        descEn: "Create a customer profile for credit / khata billing",
        descUr: "ادھار کھاتہ یا بلنگ کے لیے نیا کسٹمر بنائیں",
        prompt: "Add a new customer",
      },
      {
        id: "demand",
        cmd: "/demand",
        icon: "📋",
        en: "Log Customer Demand",
        ur: "کسٹمر ڈیمانڈ درج کریں",
        descEn: "Record an out-of-stock item requested by a customer",
        descUr: "کم یا ختم شدہ پروڈکٹ کی کسٹمر ڈیمانڈ لکھیں",
        prompt: "Add a new user demand",
      },
      {
        id: "explain",
        cmd: "/explain",
        icon: "📘",
        en: `Explain ${displayedGuide?.title?.en || "Current Screen"}`,
        ur: `${displayedGuide?.title?.ur || "اس اسکرین"} کا مکمل طریقہ`,
        descEn: "Step-by-step workflow, fields & accounting impact",
        descUr: "مرحلہ وار طریقہ کار اور کھاتوں پر اثر",
        prompt: isUr
          ? `${displayedGuide?.title?.ur || "اس اسکرین"} کا مکمل طریقہ اور کھاتوں پر اثر بتائیں`
          : `Explain ${displayedGuide?.title?.en || "this screen"} step by step and its accounting impact`,
      },
      {
        id: "walkthrough",
        cmd: "/walkthrough",
        icon: "🎯",
        en: "Interactive Spotlight Tour",
        ur: "لائیو اسپاٹ لائٹ گائیڈ",
        descEn: "Highlight live buttons and fields step by step on screen",
        descUr: "اسکرین کے بٹن اور فیلڈز کو لائیو ہائی لائٹ کریں",
        action: () => {
          startCubeDemo(currentScreenWorkflowId || "dynamic_screen_tour", true);
        },
      },
      {
        id: "tasks",
        cmd: "/tasks",
        icon: "📊",
        en: "Open Background Tasks Monitor",
        ur: "بیک گراؤنڈ ٹاسک رپورٹ کھولیں",
        descEn: "Open the full-screen detailed popup for formulation auto-fill",
        descUr: "فارمولیشن ٹاسک کی تفصیلی پاپ اپ ونڈو کھولیں",
        action: () => setIsBgTaskDetailPopupOpen(true),
      },
      {
        id: "clear",
        cmd: "/clear",
        icon: "🧹",
        en: "Clear Chat Conversation",
        ur: "چیٹ صاف کریں",
        descEn: "Reset the current AI chat thread and start fresh",
        descUr: "موجودہ چیٹ صاف کر کے نئی بات شروع کریں",
        action: () => {
          stopLiveStream();
          clearChatOnly();
        },
      },
    ],
    [
      currentScreenWorkflowId,
      displayedGuide?.title?.en,
      displayedGuide?.title?.ur,
      isUr,
      startCubeDemo,
      stopLiveStream,
      clearChatOnly,
    ]
  );

  const filteredSlashCommands = useMemo(() => {
    const trimmed = questionInput.trim();
    if (!slashMenuOpen && !trimmed.startsWith("/")) return [];
    const query = trimmed.startsWith("/") ? trimmed.slice(1).toLowerCase() : "";
    if (!query) return slashCommands;
    return slashCommands.filter(
      (item) =>
        item.cmd.toLowerCase().includes(query) ||
        item.en.toLowerCase().includes(query) ||
        item.ur.includes(query) ||
        item.descEn.toLowerCase().includes(query)
    );
  }, [questionInput, slashMenuOpen, slashCommands]);

  const executeSlashCommand = (cmdItem) => {
    if (!cmdItem) return;
    setSlashMenuOpen(false);
    setSlashSelectedIndex(0);
    setQuestionInput("");
    if (
      growableTextareaWrapRef.current &&
      typeof CSS !== "undefined" &&
      !CSS.supports("field-sizing", "content")
    ) {
      growableTextareaWrapRef.current.dataset.replicatedValue = "";
    }
    if (typeof cmdItem.action === "function") {
      cmdItem.action();
      return;
    }
    if (cmdItem.prompt) {
      handleAskSubmit(null, cmdItem.prompt, true);
    }
  };

  /**
   * Renders the full-viewport Interactive Spotlight Tour Overlay when a walkthrough is active
   * and the modal drawer is closed so the user can interact directly with the spotlighted controls.
   */
  const renderSpotlightTourOverlay = () => {
    const spotlightSteps = activeSpotlightData?.steps || [];
    if (
      isOpen ||
      !activeDemo ||
      activeDemo.pausedForDetour ||
      activeDemo.spotlightActive === false ||
      !spotlightSteps.length
    ) {
      return null;
    }

    const activeManifest =
      activeDemo.workflowId && DEMO_MANIFESTS[activeDemo.workflowId]
        ? DEMO_MANIFESTS[activeDemo.workflowId]
        : null;

    return (
      <SpotlightTourOverlay
        activeDemo={activeDemo}
        steps={spotlightSteps}
        tourTitle={activeSpotlightData?.title}
        guide={displayedGuide}
        manifest={activeManifest}
        currentPathname={location.pathname}
        isUr={isUr}
        isDark={isDark}
        onToggleLang={() => handleSetLang(isUr ? "en" : "ur")}
        onStepChange={(nextIdx) => {
          setHighlightStatus(null);
          setActiveDemo((prev) =>
            prev
              ? {
                  ...prev,
                  stepIndex: Math.max(0, nextIdx),
                }
              : null
          );
        }}
        onCloseTour={() => setActiveDemo(null)}
        onNavigateToRoute={(routePath) => {
          if (routePath) {
            navigate(routePath);
          }
        }}
        onAskAiAboutStep={(stepObj) => {
          const stepTitle = isUr
            ? stepObj?.title?.ur || stepObj?.title?.en
            : stepObj?.title?.en;
          setActiveDemo((prev) =>
            prev ? { ...prev, pausedForDetour: true } : null
          );
          setActiveMainTab("chat");
          setSharedIsOpen(true);
          window.setTimeout(() => {
            handleAskSubmit(
              null,
              isUr
                ? `${displayedGuide.title.ur} میں "${stepTitle}" کا تفصیلی طریقہ اور مقصد بتائیں`
                : `Explain the "${stepTitle}" step on ${displayedGuide.title.en} in detail`,
              true
            );
          }, 120);
        }}
      />
    );
  };

  if (!isOpen && !isRendered) {
    return (
      <>
        {renderSpotlightTourOverlay()}
        {bottomMascotEnabled ? (
          <RoamingCubeCompanion
            onOpen={() => setSharedIsOpen(true)}
            screenTitle={sensedScreenGuide?.title?.en}
          />
        ) : null}
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
                <button
                  type="button"
                  onClick={() =>
                    startCubeDemo(
                      currentScreenWorkflowId || "dynamic_screen_tour",
                      true
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white transition-all cursor-pointer shadow-2xs"
                >
                  <span aria-hidden="true">🎯</span>
                  <span>
                    {isUr
                      ? "لائیو اسپاٹ لائٹ گائیڈ شروع کریں (Spotlight Tour)"
                      : "Start Interactive Spotlight Tour"}
                  </span>
                </button>

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
                    ? "اس صفحے کے کسی بھی بٹن یا فیلڈ کے بارے میں نیچے چیٹ میں پوچھیں۔"
                    : "Ask any question in the chat below to learn about specific buttons or fields on this page."}
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

    // 7. FREE-TEXT Q&A REPLY & AI TASK AUTOMATION CARDS
    const hasWalkthrough = Boolean(msg.workflowId && DEMO_MANIFESTS[msg.workflowId]);
    const isTaskWaitingForInput = msg.providerStatus === "cube_task_needs_input";
    const isTaskAwaitingPermission =
      msg.providerStatus === "cube_task_awaiting_permission" ||
      Boolean(msg.taskMeta?.awaiting_permission) ||
      Boolean(msg.taskMeta?.requires_permission);
    const isTaskExecuted =
      msg.providerStatus === "cube_task_executed" &&
      Boolean(msg.taskMeta?.result_summary);
    const previewResult = msg.taskMeta?.preview_result || null;
    const isActivelyStreaming = streamingMsgId === msg.id;
    const fullReplyText = String((isUr ? msg.ur : msg.en) || msg.en || "");
    const displayedReplyText = isActivelyStreaming
      ? `${fullReplyText.slice(0, streamedCharCount)} ▍`
      : fullReplyText;
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
        className={`${cardBaseClass} guide-bot-msg-card`}
      >
        {/* Clean Editorial Bot Message Header (Avatar + Title + Live Streaming Indicator) */}
        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-200/60 dark:border-slate-800/80">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-blue-600 via-indigo-600 to-cyan-500 text-white text-xs font-black shrink-0 shadow-2xs">
              🤖
            </span>
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                {msg.title
                  ? isUr
                    ? msg.title.ur || msg.title.en
                    : msg.title.en
                  : isUr
                  ? "کیوب اے آئی"
                  : "Cube AI"}
              </p>
            </div>
          </div>

          {isActivelyStreaming && (
            <div className="flex items-center gap-1.5 shrink-0" dir="ltr">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-extrabold bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>{isUr ? "لائیو..." : "Streaming"}</span>
              </span>
              <button
                type="button"
                onClick={stopLiveStream}
                className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 border border-amber-500/30 cursor-pointer"
              >
                {isUr ? "مکمل دکھائیں" : "⏹ Show Full"}
              </button>
            </div>
          )}
        </div>

        {/* STEP-BY-STEP PROGRESS INDICATOR (`taskMeta.step_info`) */}
        {msg.taskMeta?.step_info && (
          <div
            className={`px-2.5 py-1.5 rounded-xl border flex items-center justify-between gap-2 flex-wrap ${
              isDark
                ? "bg-indigo-950/45 border-indigo-700/60 text-indigo-200"
                : "bg-indigo-50/90 border-indigo-200 text-indigo-900"
            }`}
          >
            <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold">
              <span aria-hidden="true">🪜</span>
              <span>
                {isUr
                  ? msg.taskMeta.step_info.label_ur || msg.taskMeta.step_info.label_en
                  : msg.taskMeta.step_info.label_en}
              </span>
            </span>
            {msg.taskMeta.step_info.current && msg.taskMeta.step_info.total && (
              <div className="flex items-center gap-1" dir="ltr">
                {Array.from({ length: Number(msg.taskMeta.step_info.total) || 3 }).map(
                  (_, sIdx) => {
                    const stepNum = sIdx + 1;
                    const isCompleted = stepNum < Number(msg.taskMeta.step_info.current);
                    const isCurrent = stepNum === Number(msg.taskMeta.step_info.current);
                    return (
                      <span
                        key={stepNum}
                        className={`w-5 h-1.5 rounded-full transition-all ${
                          isCurrent
                            ? "bg-indigo-500 w-7"
                            : isCompleted
                            ? "bg-emerald-500"
                            : isDark
                            ? "bg-slate-700"
                            : "bg-slate-300"
                        }`}
                      />
                    );
                  }
                )}
              </div>
            )}
          </div>
        )}

        <FormattedBotMessage
          text={displayedReplyText}
          isUrdu={isUr}
        />

        {/* INTERACTIVE DATABASE MATCHES PANEL (`taskMeta.db_matches`) */}
        {isTaskWaitingForInput &&
          Array.isArray(msg.taskMeta?.db_matches) &&
          msg.taskMeta.db_matches.length > 0 && (
            <div
              className={`rounded-xl border overflow-hidden mt-1.5 ${
                isDark
                  ? "bg-slate-950/80 border-cyan-800/60"
                  : "bg-cyan-50/50 border-cyan-200"
              }`}
            >
              <div
                className={`px-2.5 py-1.5 border-b flex items-center justify-between gap-2 text-[10.5px] font-extrabold ${
                  isDark
                    ? "bg-cyan-950/50 border-cyan-800/60 text-cyan-300"
                    : "bg-cyan-100/80 border-cyan-200 text-cyan-900"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true">🔍</span>
                  <span>
                    {isUr
                      ? `ڈیٹا بیس میں موجود ملتے جلتے ریکارڈز (${msg.taskMeta.db_matches.length})`
                      : `Matching Records Found in Your Database (${msg.taskMeta.db_matches.length})`}
                  </span>
                </span>
                <span className="text-[9.5px] font-bold opacity-80">
                  {isUr ? "منتخب کرنے کے لیے کلک کریں" : "Select Existing or Create New"}
                </span>
              </div>
              <div className="divide-y divide-slate-200/70 dark:divide-slate-800 max-h-56 overflow-y-auto">
                {msg.taskMeta.db_matches.map((match, mIdx) => (
                  <div
                    key={match.id || mIdx}
                    className="px-2.5 py-2 flex items-center justify-between gap-2 flex-wrap hover:bg-blue-500/5 transition-colors"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                          {match.name}
                        </span>
                        {match.code && (
                          <span className="px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold bg-blue-500/15 text-blue-600 dark:text-blue-300">
                            {match.code}
                          </span>
                        )}
                      </div>
                      {(match.details_en || match.details_ur) && (
                        <p className="text-[10.5px] text-slate-600 dark:text-slate-300">
                          {isUr
                            ? match.details_ur || match.details_en
                            : match.details_en}
                        </p>
                      )}
                    </div>
                    {match.select_reply && (
                      <button
                        type="button"
                        onClick={() =>
                          handleAskSubmit(null, match.select_reply, true)
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs transition-all cursor-pointer shrink-0 active:scale-95"
                      >
                        <span>{isUr ? "✓ منتخب کریں" : "✓ Select"}</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        {/* INTERACTIVE STEP QUICK-CHOICE BUTTONS (`taskMeta.step_choices`) */}
        {isTaskWaitingForInput &&
          Array.isArray(msg.taskMeta?.step_choices) &&
          msg.taskMeta.step_choices.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {msg.taskMeta.step_choices.map((choice, cIdx) => {
                const isPrimary = choice.variant === "primary";
                const isAccent = choice.variant === "accent";
                return (
                  <button
                    key={`${choice.reply}-${cIdx}`}
                    type="button"
                    onClick={() => handleAskSubmit(null, choice.reply, true)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold border transition-all cursor-pointer active:scale-95 ${
                      isPrimary
                        ? "bg-blue-600 hover:bg-blue-500 text-white border-blue-500 shadow-2xs"
                        : isAccent
                        ? isDark
                          ? "bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border-amber-500/40"
                          : "bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300"
                        : isDark
                        ? "bg-slate-800 hover:bg-slate-700 text-cyan-300 border-slate-700"
                        : "bg-white hover:bg-slate-100 text-slate-700 border-slate-300"
                    }`}
                  >
                    <span>
                      {isUr
                        ? choice.label_ur || choice.label_en
                        : choice.label_en}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

        {/* STAGED PRE-DATABASE RESULT PREVIEW & MANDATORY USER PERMISSION CARD */}
        {isTaskAwaitingPermission && (
          <div
            className={`p-3 rounded-xl border space-y-3 mt-1.5 ${
              isDark
                ? "bg-amber-950/35 border-amber-700/60 text-amber-100"
                : "bg-amber-50/90 border-amber-300 text-slate-900"
            }`}
          >
            {/* Header: Permission Status & Pre-DB Guard Badge */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-amber-700 dark:text-amber-300">
                <span aria-hidden="true">🛡️</span>
                <span>
                  {isUr
                    ? msg.taskMeta?.proposed_task?.label_ur ||
                      "ڈیٹا بیس میں پوسٹ کرنے سے پہلے نتیجہ چیک کریں اور اجازت دیں"
                    : msg.taskMeta?.proposed_task?.label_en ||
                      "Staged Result Preview — Permission Required Before Posting to Database"}
                </span>
              </span>

              {msg.permissionResolved ? (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                    msg.permissionResolved === "approved"
                      ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                      : "bg-rose-500/20 text-rose-700 dark:text-rose-300"
                  }`}
                >
                  {msg.permissionResolved === "approved"
                    ? isUr
                      ? "✅ اجازت دے دی گئی (Posted)"
                      : "✅ Approved & Posted"
                    : isUr
                    ? "✕ منسوخ شدہ (Not Posted)"
                    : "✕ Denied (Not Posted)"}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[9.5px] font-extrabold bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-500/30">
                  {isUr ? "ابھی ڈیٹا بیس میں محفوظ نہیں ہوا" : "NOT POSTED TO DB YET"}
                </span>
              )}
            </div>

            {/* Structured Pre-Database Result Preview Table (`preview_result`) */}
            {previewResult && (
              <div
                className={`rounded-xl border overflow-hidden ${
                  isDark
                    ? "bg-slate-950/80 border-slate-800"
                    : "bg-white border-amber-200/90"
                }`}
              >
                <div
                  className={`px-2.5 py-1.5 border-b flex items-center justify-between gap-2 flex-wrap text-[10.5px] font-extrabold ${
                    isDark
                      ? "bg-slate-900 border-slate-800 text-cyan-300"
                      : "bg-slate-100/90 border-slate-200 text-slate-700"
                  }`}
                >
                  <span>
                    {isUr
                      ? previewResult.summary_ur || previewResult.summary_en || "ڈیٹا بیس پری ویو"
                      : previewResult.summary_en || "Staged Database Result Preview"}
                  </span>
                  <div className="flex items-center gap-1.5" dir="ltr">
                    {previewResult.database_table && (
                      <span className="px-1.5 py-0.5 rounded font-mono text-[9.5px] bg-blue-500/15 text-blue-600 dark:text-blue-300">
                        table: {previewResult.database_table}
                      </span>
                    )}
                    {previewResult.operation && (
                      <span className="px-1.5 py-0.5 rounded font-mono text-[9.5px] bg-purple-500/15 text-purple-600 dark:text-purple-300">
                        {previewResult.operation}
                      </span>
                    )}
                  </div>
                </div>

                {/* Case A: Record-by-Record Before -> After Field Table */}
                {Array.isArray(previewResult.records) &&
                  previewResult.records.length > 0 && (
                    <div className="divide-y divide-slate-200/70 dark:divide-slate-800 max-h-60 overflow-y-auto">
                      {previewResult.records.map((rec, rIdx) => (
                        <div key={rIdx} className="p-2.5 space-y-1.5">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                              {rec.title || rec.name || `Record #${rIdx + 1}`}
                            </span>
                            {rec.status && (
                              <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300">
                                {rec.status}
                              </span>
                            )}
                          </div>
                          {Array.isArray(rec.fields) && rec.fields.length > 0 && (
                            <div className="grid grid-cols-1 gap-1 text-[11px]">
                              {rec.fields.map((fld, fIdx) => (
                                <div
                                  key={fIdx}
                                  className={`px-2 py-1 rounded-lg flex items-center justify-between gap-2 ${
                                    isDark ? "bg-slate-900/90" : "bg-slate-50"
                                  }`}
                                >
                                  <span className="font-bold text-slate-500 dark:text-slate-400">
                                    {fld.field}:
                                  </span>
                                  <div className="flex items-center gap-1.5 font-mono text-[10.5px] truncate">
                                    {fld.before &&
                                      !String(fld.before).includes("New") &&
                                      fld.before !== "—" && (
                                        <>
                                          <span className="line-through text-slate-400">
                                            {fld.before}
                                          </span>
                                          <span className="text-slate-400">→</span>
                                        </>
                                      )}
                                    <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                                      {fld.after}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                {/* Case B: Bulk Formulation Preview Items */}
                {Array.isArray(previewResult.preview_items) &&
                  previewResult.preview_items.length > 0 && (
                    <div className="divide-y divide-slate-200/70 dark:divide-slate-800 max-h-52 overflow-y-auto">
                      {previewResult.preview_items.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          className="px-2.5 py-1.5 text-[11px] flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-slate-900 dark:text-white truncate block">
                              {item.name}
                            </span>
                            {item.code && (
                              <span className="text-[9.5px] font-mono text-slate-400">
                                {item.code}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0 font-mono text-[10.5px]">
                            <span className="text-slate-400">
                              {item.before || "Empty"} →
                            </span>
                            <span className="px-1.5 py-0.5 rounded font-extrabold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                              {item.after}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            )}

            {!msg.permissionResolved && (
              <div className="flex items-center flex-wrap gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() =>
                    handleAskSubmit(
                      null,
                      isUr
                        ? "جی ہاں، اجازت ہے — ڈیٹا بیس میں محفوظ کریں"
                        : "Yes, approve and post to database",
                      true,
                      true,
                      msg.id
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs transition-all cursor-pointer active:scale-95"
                >
                  <CheckCircleIcon className="w-4 h-4 shrink-0" />
                  <span>
                    {isUr
                      ? "✅ اجازت دیں اور ڈیٹا بیس میں محفوظ کریں"
                      : "✅ Approve & Post to Database"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    askInputRef.current?.focus();
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    isDark
                      ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-cyan-300"
                      : "bg-white hover:bg-slate-100 border-slate-300 text-slate-700"
                  }`}
                >
                  <span>✏️ {isUr ? "تفصیل تبدیل کریں" : "Modify Details"}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleAskSubmit(null, "cancel", true, false, msg.id)
                  }
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-500/30 transition-all cursor-pointer active:scale-95"
                >
                  <XMarkIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {isUr ? "✕ منسوخ کریں (Do Not Post)" : "✕ Deny & Do Not Post"}
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* STRUCTURED TASK EXECUTION RESULT SUMMARY CARD AFTER PERMISSION */}
        {isTaskExecuted && (
          <div
            className={`p-3 rounded-xl border space-y-2 mt-1 ${
              isDark
                ? "bg-emerald-950/30 border-emerald-700/60 text-emerald-100"
                : "bg-emerald-50/85 border-emerald-300 text-slate-900"
            }`}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300">
                <CheckCircleIcon className="w-4 h-4 shrink-0" />
                <span>
                  {isUr
                    ? `نتیجہ: ${msg.taskMeta?.result_summary?.action_label?.ur || "ڈیٹا بیس میں محفوظ ہو گیا"}`
                    : `Committed Result: ${msg.taskMeta?.result_summary?.action_label?.en || "Posted to Database"}`}
                </span>
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                {isUr ? "✅ اجازت کے بعد ڈیٹا بیس میں محفوظ" : "✅ Posted to Database"}
              </span>
            </div>

            {Array.isArray(msg.taskMeta?.result_summary?.items) &&
              msg.taskMeta.result_summary.items.length > 0 && (
                <div
                  className={`rounded-lg border divide-y ${
                    isDark
                      ? "bg-slate-950/60 border-slate-800 divide-slate-800"
                      : "bg-white border-emerald-200/80 divide-slate-100"
                  }`}
                >
                  {msg.taskMeta.result_summary.items.map((item, idx) => (
                    <div
                      key={`${item.id || idx}-${item.code || idx}`}
                      className="px-2.5 py-2 text-xs flex items-center justify-between gap-2 flex-wrap"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-slate-900 dark:text-white">
                            {item.name}
                          </span>
                          {item.code && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              {item.code}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300">
                          {isUr
                            ? item.details_ur || item.details_en
                            : item.details_en}
                        </p>
                      </div>
                      {item.edit_path && (
                        <button
                          type="button"
                          onClick={() => handleNavigateToRoute(item.edit_path)}
                          className="px-2 py-1 rounded-lg text-[10.5px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer shrink-0"
                        >
                          {isUr ? "دیکھیں ←" : "View →"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

            {Array.isArray(msg.taskMeta?.result_summary?.records) &&
              msg.taskMeta.result_summary.records.length > 0 && (
                <div
                  className={`rounded-lg border divide-y ${
                    isDark
                      ? "bg-slate-950/60 border-slate-800 divide-slate-800"
                      : "bg-white border-emerald-200/80 divide-slate-100"
                  }`}
                >
                  {msg.taskMeta.result_summary.records.map((rec, idx) => (
                    <div
                      key={`${rec.id || idx}-committed`}
                      className="px-2.5 py-2 text-xs flex items-center justify-between gap-2 flex-wrap"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-slate-900 dark:text-white">
                            {rec.name}
                          </span>
                          {rec.id && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                              ID #{rec.id}
                            </span>
                          )}
                          {msg.taskMeta?.result_summary?.database_table && (
                            <span className="px-1.5 py-0.5 rounded text-[9.5px] font-mono bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              {msg.taskMeta.result_summary.database_table}
                            </span>
                          )}
                        </div>
                        {Array.isArray(rec.changes) && rec.changes.length > 0 && (
                          <p className="text-[11px] text-slate-600 dark:text-slate-300">
                            {rec.changes.join(" • ")}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        )}

        {/* Detailed Auto-Fill Formulation Report inside Chat Card */}
        {(msg.autoFillReport ||
          (msg.taskMeta?.action === "bulk_autofill_missing_formulations" &&
            msg.providerStatus === "cube_task_executed")) &&
          renderAutoFillDetailedReport(
            msg.autoFillReport || {
              running: Boolean(msg.taskMeta?.background_task?.has_more),
              status: msg.taskMeta?.background_task?.has_more ? "running" : "completed",
              processedCount: Number(
                msg.taskMeta?.scanned_count ||
                  msg.taskMeta?.background_task?.processed_in_batch ||
                  0
              ),
              updatedCount: Number(msg.taskMeta?.updated_count || 0),
              skippedCount: Number(
                msg.taskMeta?.skipped_count ||
                  (msg.taskMeta?.skipped_products || []).length ||
                  0
              ),
              remainingCount: Number(
                msg.taskMeta?.background_task?.remaining_count || 0
              ),
              updatedProducts: msg.taskMeta?.updated_products || [],
              skippedProducts: msg.taskMeta?.skipped_products || [],
            }
          )}

        {(msg.hasBackgroundTask || isTaskWaitingForInput || hasWalkthrough || canEscalateToAi || (msg.links && msg.links.length > 0)) && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {msg.hasBackgroundTask && (
              <>
                <button
                  type="button"
                  onClick={() => setIsBgTaskDetailPopupOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-extrabold bg-indigo-600 hover:bg-indigo-500 text-white shadow-2xs transition-all cursor-pointer"
                >
                  <ArrowsPointingOutIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {isUr
                      ? "تفصیلی رپورٹ پاپ اپ کھولیں"
                      : "Open Detailed Task Popup"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigateToRoute("/background-tasks")}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs transition-all cursor-pointer"
                >
                  <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {isUr
                      ? "الگ صفحے میں کھولیں"
                      : "Open Separate Task Page"}
                  </span>
                </button>
              </>
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

        {/* Editorial Footer Toolbar (Source Badge + Copy + Regenerate) */}
        <div
          className="pt-1.5 mt-1 border-t border-slate-200/60 dark:border-slate-800/80 flex items-center justify-between gap-2 flex-wrap"
          dir="ltr"
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            {msg.evidenceBadge ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9.5px] font-bold bg-slate-100 dark:bg-slate-800/90 text-slate-500 dark:text-slate-400 border border-slate-200/80 dark:border-slate-700/80 truncate max-w-[230px]">
                {isUr ? msg.evidenceBadge.ur : msg.evidenceBadge.en}
              </span>
            ) : (
              <span className="text-[9.5px] font-bold text-slate-400">
                Cube AI Copilot
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.clipboard) {
                  navigator.clipboard.writeText(fullReplyText).catch(() => {});
                  setCopiedMsgId(msg.id);
                  window.setTimeout(() => setCopiedMsgId(null), 1600);
                }
              }}
              title={isUr ? "کاپی کریں" : "Copy response"}
              className="px-2 py-0.5 rounded-md text-[10px] font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {copiedMsgId === msg.id ? "✓ Copied" : "📋 Copy"}
            </button>
            {msg.questionText && !isTaskAwaitingPermission && (
              <button
                type="button"
                onClick={() => handleAskSubmit(null, msg.questionText, true)}
                title={isUr ? "دوبارہ تیار کریں" : "Regenerate response"}
                className="px-2 py-0.5 rounded-md text-[10px] font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                🔄 {isUr ? "دوبارہ" : "Retry"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  /**
   * Renders the Interactive Detailed Report for Auto-Fill Formulations (`bulk_autofill_missing_formulations`),
   * showing all Scanned, Filled (with Google Search verification badge), and Skipped (with exact skip reason) products,
   * plus filter tabs, search, and CSV export.
   */
  const renderAutoFillDetailedReport = (reportData) => {
    if (!reportData) return null;
    const filledList = Array.isArray(reportData.updatedProducts)
      ? reportData.updatedProducts
      : [];
    const skippedList = Array.isArray(reportData.skippedProducts)
      ? reportData.skippedProducts
      : [];
    const totalScanned =
      Number(reportData.processedCount || 0) ||
      filledList.length + skippedList.length;
    const totalFilled = Number(reportData.updatedCount ?? filledList.length);
    const totalSkipped = Number(reportData.skippedCount ?? skippedList.length);

    if (totalScanned === 0 && filledList.length === 0 && skippedList.length === 0) {
      return null;
    }

    const q = reportSearchQuery.trim().toLowerCase();
    const matchesSearch = (item) => {
      if (!q) return true;
      const nameStr = String(item.name || "").toLowerCase();
      const codeStr = String(item.product_code || "").toLowerCase();
      const saltStr = String(item.formulation || "").toLowerCase();
      const reasonStr = String(item.reason_en || item.source_en || "").toLowerCase();
      return (
        nameStr.includes(q) ||
        codeStr.includes(q) ||
        saltStr.includes(q) ||
        reasonStr.includes(q)
      );
    };

    const combinedRows = [];
    if (reportFilterTab === "all" || reportFilterTab === "filled") {
      filledList.forEach((up) => {
        if (matchesSearch(up)) {
          combinedRows.push({ ...up, _rowType: "filled" });
        }
      });
    }
    if (reportFilterTab === "all" || reportFilterTab === "skipped") {
      skippedList.forEach((sk) => {
        if (matchesSearch(sk)) {
          combinedRows.push({ ...sk, _rowType: "skipped" });
        }
      });
    }

    return (
      <div
        className={`mt-2 p-3 rounded-2xl border space-y-2.5 ${
          isDark
            ? "bg-slate-950/75 border-indigo-500/35"
            : "bg-slate-50/90 border-indigo-200"
        }`}
      >
        {/* Report Title & Popup / Separate Page / Export CSV Buttons */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-sm" aria-hidden="true">
              📋
            </span>
            <span className="text-xs font-extrabold text-indigo-700 dark:text-indigo-300">
              {isUr
                ? "تفصیلی آٹو فل رپورٹ (Detailed Formulation Report)"
                : "Detailed Auto-Fill Formulation Report"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setIsBgTaskDetailPopupOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10.5px] font-extrabold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
            >
              <ArrowsPointingOutIcon className="w-3 h-3 shrink-0" />
              <span>{isUr ? "بڑی پاپ اپ ونڈو" : "Open Popup"}</span>
            </button>
            <button
              type="button"
              onClick={() => handleNavigateToRoute("/background-tasks")}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10.5px] font-extrabold border transition-colors cursor-pointer ${
                isDark
                  ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-indigo-300"
                  : "bg-white hover:bg-indigo-50 border-slate-200 text-indigo-700"
              }`}
            >
              <ArrowTopRightOnSquareIcon className="w-3 h-3 shrink-0" />
              <span>{isUr ? "الگ صفحہ" : "Separate Page"}</span>
            </button>
            <button
              type="button"
              onClick={() => exportAutoFillReportCsv(reportData)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10.5px] font-extrabold border transition-colors cursor-pointer ${
                isDark
                  ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-emerald-300"
                  : "bg-white hover:bg-emerald-50 border-slate-200 text-emerald-700"
              }`}
            >
              <span aria-hidden="true">📥</span>
              <span>{isUr ? "CSV ڈاؤن لوڈ" : "Export CSV"}</span>
            </button>
          </div>
        </div>

        {/* Filter Tabs (All Scanned | Filled | Skipped) */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1 flex-wrap">
            {[
              {
                id: "all",
                en: `📋 All Scanned (${filledList.length + skippedList.length})`,
                ur: `📋 تمام (${filledList.length + skippedList.length})`,
              },
              {
                id: "filled",
                en: `✅ Filled (${totalFilled})`,
                ur: `✅ فارمولیشن لگی (${totalFilled})`,
              },
              {
                id: "skipped",
                en: `⏭️ Skipped (${totalSkipped})`,
                ur: `⏭️ چھوڑی گئیں (${totalSkipped})`,
              },
            ].map((tab) => {
              const active = reportFilterTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setReportFilterTab(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-[10.5px] font-extrabold transition-all cursor-pointer ${
                    active
                      ? "bg-indigo-600 text-white shadow-2xs"
                      : isDark
                      ? "bg-slate-800/80 text-slate-300 hover:bg-slate-800"
                      : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  {isUr ? tab.ur : tab.en}
                </button>
              );
            })}
          </div>

          <input
            type="text"
            value={reportSearchQuery}
            onChange={(e) => setReportSearchQuery(e.target.value)}
            placeholder={
              isUr
                ? "رپورٹ میں پروڈکٹ یا سالٹ تلاش کریں..."
                : "Filter report by product, code, or salt..."
            }
            className={`px-2.5 py-1 rounded-lg text-[11px] border outline-hidden w-full sm:w-52 ${
              isDark
                ? "bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500"
                : "bg-white border-slate-200 text-slate-800 placeholder:text-slate-400"
            }`}
          />
        </div>

        {/* Scrollable Detailed Report Rows */}
        <div
          className={`max-h-72 overflow-y-auto rounded-xl border divide-y ${
            isDark
              ? "bg-slate-900/90 border-slate-800 divide-slate-800"
              : "bg-white border-slate-200 divide-slate-100"
          }`}
        >
          {combinedRows.length > 0 ? (
            combinedRows.slice(0, 300).map((row, idx) => {
              const isFilled = row._rowType === "filled";
              return (
                <div
                  key={`${row._rowType}-${row.id || idx}-${row.product_code || idx}`}
                  className="px-3 py-2 text-xs flex items-start justify-between gap-2.5"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9.5px] font-extrabold uppercase ${
                          isFilled
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        }`}
                      >
                        {isFilled
                          ? isUr
                            ? "✅ اپڈیٹ شدہ"
                            : "✅ Filled"
                          : isUr
                          ? "⏭️ چھوڑی گئی"
                          : "⏭️ Skipped"}
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white truncate">
                        {row.name}
                      </span>
                      {row.product_code && (
                        <span className="text-[10px] font-mono text-slate-400">
                          ({row.product_code})
                        </span>
                      )}
                    </div>

                    {isFilled ? (
                      <div className="flex items-center gap-1.5 flex-wrap text-[10.5px]">
                        <span className="font-semibold text-slate-500 dark:text-slate-400">
                          {isUr ? "فارمولیشن:" : "Formulation:"}
                        </span>
                        <span className="px-1.5 py-0.5 rounded font-extrabold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                          {row.formulation}
                        </span>
                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400">
                          🔍{" "}
                          {isUr
                            ? row.source_ur || "گوگل سرچ سے تصدیق شدہ"
                            : row.source_en || "Google Search Verified"}
                        </span>
                      </div>
                    ) : (
                      <p className="text-[10.5px] text-amber-700 dark:text-amber-300">
                        {isUr
                          ? row.reason_ur ||
                            "گوگل سرچ پر کوئی تصدیق شدہ فارمولیشن نہیں ملی — چھوڑ دیا گیا"
                          : row.reason_en ||
                            "No verified formulation found on Google Search — skipped"}
                      </p>
                    )}
                  </div>

                  {row.id && (
                    <button
                      type="button"
                      onClick={() =>
                        handleNavigateToRoute(
                          row.edit_path || `/products/${row.id}/edit`
                        )
                      }
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold border shrink-0 transition-colors cursor-pointer ${
                        isDark
                          ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200"
                          : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                      }`}
                    >
                      {isUr ? "کھولیں" : "View / Edit"}
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="p-3 text-center text-[11px] text-slate-400">
              {isUr
                ? "اس فلٹر میں کوئی پروڈکٹ موجود نہیں ہے۔"
                : "No products match the current report filter."}
            </div>
          )}
        </div>
      </div>
    );
  };

  /**
   * Renders Cube's Grounded Interactive Step-by-Step Walkthrough Player (`DEMO_MANIFESTS` + `activeSpotlightData`).
   * Distinguishes Observed live screen state vs. Conditional documented state and supports
   * launching the full-viewport Spotlight Tour Overlay + mid-demo concept detours.
   */
  const renderCubeDemoPlayer = () => {
    if (!activeDemo) return null;
    const stepsList = activeSpotlightData.steps || [];
    if (!stepsList.length) return null;

    const tourTitle = activeSpotlightData.title || {
      en: displayedGuide?.title?.en || "Interactive Screen Walkthrough",
      ur: displayedGuide?.title?.ur || "مرحلہ وار عملی گائیڈ",
    };

    const totalSteps = stepsList.length;
    const stepIndex = Math.min(Math.max(0, activeDemo.stepIndex), totalSteps - 1);
    const step = stepsList[stepIndex];
    const isOnTargetScreen = !step.screen || location.pathname === step.screen;

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
              {isUr ? "اسپاٹ لائٹ گائیڈ وقفے پر ہے" : "Spotlight Tour Paused for Question"}
            </p>
            <p className={`text-xs font-bold truncate ${isUr ? "guide-bot-urdu-inline" : ""}`}>
              {isUr ? tourTitle.ur : tourTitle.en} ({stepIndex + 1}/{totalSteps})
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveDemo((prev) =>
                  prev
                    ? { ...prev, pausedForDetour: false, spotlightActive: true }
                    : null
                );
                runSmoothClose(true);
              }}
              className="px-2.5 py-1 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
            >
              {isUr ? `🎯 مرحلہ ${stepIndex + 1} جاری رکھیں` : `🎯 Resume Step ${stepIndex + 1}`}
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
        {/* Top Bar: Title + Step Counter + Launch Live Spotlight + Exit */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-extrabold shrink-0">
              🎯
            </span>
            <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300 truncate">
              {isUr ? tourTitle.ur : tourTitle.en}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveDemo((prev) =>
                  prev ? { ...prev, spotlightActive: true, pausedForDetour: false } : null
                );
                runSmoothClose(true);
              }}
              className="px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-2xs cursor-pointer"
            >
              {isUr ? "🔦 لائیو اسپاٹ لائٹ کھولیں" : "🔦 Live On-Screen Spotlight"}
            </button>
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
                  ? `🟢 موجودہ اسکرین پر مشاہدہ شدہ (${step.screen || location.pathname})`
                  : `🟢 Observed on current screen (${step.screen || location.pathname})`
                : isUr
                ? `📘 مشروط مرحلہ — اسکرین: ${step.screen} (v${PRODUCT_VERSION})`
                : `📘 Conditional — Requires ${step.screen} (v${PRODUCT_VERSION})`}
            </span>
          </span>

          {isOnTargetScreen ? (
            <button
              type="button"
              onClick={() => highlightElementOnScreen(step.target || step.targetSelector, step)}
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
        {/* MODERN 2-TIER GLASSMORPHIC COPILOT HEADER:                          */}
        {/*   TIER 1: Interactive Cube Avatar + Active Screen Title + Controls  */}
        {/*   TIER 2: Segmented Pill Mode Switcher (Chat | Guide | Tasks)       */}
        {/* =================================================================== */}
        <header
          className={`px-3.5 pt-2.5 pb-2.5 shrink-0 flex flex-col gap-2 backdrop-blur-md ${
            isDark
              ? "bg-slate-950/90 border-b border-slate-800/90"
              : "bg-white/95 border-b border-slate-200/85"
          }`}
        >
          {/* TIER 1: Compact Identity + Active Screen Title + Utility Controls */}
          <div className="flex items-center justify-between gap-2">
            {/* Left: Interactive Cube Avatar + Screen Context Title */}
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => {
                  setPopupTrickIdx((prev) => {
                    const next = (prev + 1) % POPUP_STAGE_TRICKS.length;
                    if (next === 0) {
                      const order = ["cube", "pixel", "bot"];
                      const cur = getGuideBotMascotStyle();
                      setGuideBotMascotStyle(
                        order[(order.indexOf(cur) + 1) % order.length]
                      );
                    }
                    return next;
                  });
                  triggerBotTalking(1400);
                }}
                title={
                  isUr
                    ? "اگلا کرتب دیکھنے کے لیے کلک کریں (روبکس کیوب 🧩 / ہیڈ فون 🎧 / فلپ 🤸)"
                    : "Click Cube for next trick (Rubik's Cube 🧩 / Headphones 🎧 / 360° Flip 🤸)"
                }
                className={`group relative shrink-0 flex items-center justify-center w-10 h-11 rounded-2xl border cursor-pointer transition-transform duration-200 hover:scale-105 active:scale-95 focus:outline-hidden ${
                  isDark
                    ? "bg-slate-900 border-slate-700/90 hover:border-cyan-500/60"
                    : "bg-slate-50 border-slate-200/90 hover:border-blue-400"
                }`}
              >
                <GuideBotAvatar
                  className="w-9 h-10 drop-shadow-xs"
                  fullBody={true}
                  speaking={visualTalking || isTyping}
                  presenter={true}
                  trick={
                    POPUP_STAGE_TRICKS[popupTrickIdx % POPUP_STAGE_TRICKS.length]
                      ?.id || "rubiks"
                  }
                />
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-950" />
              </button>

              <div
                className="min-w-0 flex-1"
                dir={isUr ? "rtl" : "ltr"}
                lang={isUr ? "ur" : "en"}
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400 ${
                      isUr ? "guide-bot-urdu-inline" : ""
                    }`}
                  >
                    {isPreviewingOther
                      ? isUr
                        ? "پری ویو موڈ"
                        : "Previewing"
                      : isUr
                      ? "کیوب اے آئی کوپائلٹ"
                      : "Cube AI Copilot"}
                  </span>
                  <span className="text-slate-300 dark:text-slate-700 text-[10px]">
                    •
                  </span>
                  <span
                    className={`text-[10.5px] font-bold text-emerald-600 dark:text-emerald-400 truncate ${
                      isUr ? "guide-bot-urdu-inline" : ""
                    }`}
                  >
                    {isUr ? displayedGuide.section.ur : displayedGuide.section.en}
                  </span>
                  {isPreviewingOther && (
                    <button
                      type="button"
                      onClick={() => setPreviewKey(null)}
                      className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-blue-500/15 hover:bg-blue-500/25 text-blue-600 dark:text-blue-300 cursor-pointer"
                    >
                      {isUr ? "واپس" : "Reset"}
                    </button>
                  )}
                </div>

                <h2
                  id={titleId}
                  className={`font-black tracking-tight truncate text-slate-900 dark:text-white ${
                    isUr
                      ? "guide-bot-urdu-block text-sm"
                      : "text-[14.5px] leading-snug"
                  }`}
                >
                  {isUr ? displayedGuide.title.ur : displayedGuide.title.en}
                </h2>
              </div>
            </div>

            {/* Right Controls: Language (EN | اردو) + Directory + Width + Close */}
            <div className="flex items-center gap-1 shrink-0">
              <div
                role="group"
                aria-label="Language"
                className={`inline-flex items-center p-0.5 rounded-lg border ${
                  isDark
                    ? "bg-slate-900 border-slate-700/90"
                    : "bg-slate-100 border-slate-200"
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleSetLang("en")}
                  aria-pressed={lang === "en"}
                  className={`px-2 py-0.5 rounded-md text-[10.5px] font-extrabold transition-colors cursor-pointer ${
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
                  className={`guide-bot-urdu-inline px-2 py-0.5 rounded-md text-[10.5px] font-bold transition-colors cursor-pointer ${
                    lang === "ur"
                      ? "bg-emerald-500 text-white shadow-2xs"
                      : "text-slate-600 dark:text-slate-300 hover:text-slate-900"
                  }`}
                >
                  اردو
                </button>
              </div>

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

          {/* TIER 2: Segmented Pill Mode Switcher (AI Chat | Screen Guide | Tasks) */}
          <div
            role="tablist"
            aria-label={isUr ? "کیوب اسسٹنٹ موڈز" : "Cube Assistant Modes"}
            dir={isUr ? "rtl" : "ltr"}
            className={`grid grid-cols-3 gap-1 p-1 rounded-xl border ${
              isDark
                ? "bg-slate-900/95 border-slate-800"
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

              {/* Start / Stop Action Buttons with Pre-Database Result Preview & Mandatory Permission */}
              {bgTaskAwaitingPermission && !bgTask?.running && (
                <div
                  className={`p-3 rounded-xl border space-y-2.5 ${
                    isDark
                      ? "bg-amber-950/35 border-amber-700/60 text-amber-100"
                      : "bg-amber-50/90 border-amber-300 text-slate-900"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-xs font-extrabold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                      <span aria-hidden="true">🛡️</span>
                      <span>
                        {isUr
                          ? "ڈیٹا بیس میں محفوظ کرنے سے پہلے نتیجہ چیک کریں اور اجازت دیں"
                          : "Staged Database Preview — Permission Required Before Saving"}
                      </span>
                    </p>
                    <span className="px-2 py-0.5 rounded-full text-[9.5px] font-extrabold bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-500/30">
                      {isUr ? "ابھی ڈیٹا بیس میں پوسٹ نہیں ہوا" : "NOT POSTED TO DB YET"}
                    </span>
                  </div>

                  {bgPreviewLoading ? (
                    <div className="p-2.5 rounded-xl border border-amber-400/30 bg-white/60 dark:bg-slate-900/60 flex items-center gap-2 text-xs font-bold">
                      <SparklesIcon className="w-4 h-4 text-amber-500 animate-spin shrink-0" />
                      <span>
                        {isUr
                          ? "پروڈکٹس کا پری ویو نتیجہ تیار کیا جا رہا ہے (ڈیٹا بیس میں کچھ محفوظ نہیں کیا جا رہا)..."
                          : "Computing dry-run preview of verified formulations (nothing written to database)..."}
                      </span>
                    </div>
                  ) : bgPreviewData ? (
                    <div
                      className={`rounded-xl border overflow-hidden ${
                        isDark
                          ? "bg-slate-950/80 border-slate-800"
                          : "bg-white border-amber-200/90"
                      }`}
                    >
                      <div
                        className={`px-2.5 py-1.5 border-b flex items-center justify-between gap-2 flex-wrap text-[10.5px] font-extrabold ${
                          isDark
                            ? "bg-slate-900 border-slate-800 text-cyan-300"
                            : "bg-slate-100/90 border-slate-200 text-slate-700"
                        }`}
                      >
                        <span>
                          {isUr
                            ? `کل خالی پروڈکٹس: ${bgPreviewData.total_missing || 0} • اس بیچ میں تصدیق شدہ: ${bgPreviewData.resolvable_in_preview || 0}`
                            : `Total Missing: ${bgPreviewData.total_missing || 0} • Verified in Preview Batch: ${bgPreviewData.resolvable_in_preview || 0}`}
                        </span>
                        <span className="px-1.5 py-0.5 rounded font-mono text-[9.5px] bg-blue-500/15 text-blue-600 dark:text-blue-300" dir="ltr">
                          table: products (UPDATE)
                        </span>
                      </div>

                      {Array.isArray(bgPreviewData.preview_items) &&
                      bgPreviewData.preview_items.length > 0 ? (
                        <div className="divide-y divide-slate-200/70 dark:divide-slate-800 max-h-48 overflow-y-auto">
                          {bgPreviewData.preview_items.map((item, idx) => (
                            <div
                              key={item.id || idx}
                              className="px-2.5 py-1.5 text-[11px] flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0 flex-1">
                                <span className="font-bold text-slate-900 dark:text-white truncate block">
                                  {item.name}
                                </span>
                                {item.code && (
                                  <span className="text-[9.5px] font-mono text-slate-400">
                                    {item.code}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0 font-mono text-[10.5px]">
                                <span className="text-slate-400">Empty →</span>
                                <span className="px-1.5 py-0.5 rounded font-extrabold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                  {item.after}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="p-2.5 text-[11px] text-slate-500">
                          {isUr
                            ? "اس فلٹر میں کوئی نئی تصدیق شدہ فارمولیشن اپڈیٹ کے لیے نہیں ملی۔"
                            : "No missing formulations in this batch matched a 100%-verified salt."}
                        </p>
                      )}
                    </div>
                  ) : null}

                  <p className="text-[11.5px] leading-relaxed text-slate-600 dark:text-slate-300">
                    {isUr
                      ? "صرف اوپر دکھائے گئے 100% تصدیق شدہ نتائج ڈیٹا بیس میں محفوظ ہوں گے۔ کیا آپ اجازت دیتے ہیں؟"
                      : "Only 100%-verified pharmaceutical formulations will be posted to the database. Do you grant permission?"}
                  </p>
                  <div className="flex items-center flex-wrap gap-2 pt-0.5">
                    <button
                      type="button"
                      disabled={bgPreviewLoading}
                      onClick={() => {
                        setBgTaskAwaitingPermission(false);
                        setBgPreviewData(null);
                        startBackgroundFormulationTask();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow-2xs transition-all cursor-pointer active:scale-95"
                    >
                      <CheckCircleIcon className="w-4 h-4 shrink-0" />
                      <span>
                        {isUr
                          ? "✅ اجازت دیں اور ڈیٹا بیس میں پوسٹ کریں"
                          : "✅ Approve & Post to Database"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBgTaskAwaitingPermission(false);
                        setBgPreviewData(null);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-500/30 transition-all cursor-pointer"
                    >
                      <XMarkIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>{isUr ? "✕ منسوخ کریں (Do Not Post)" : "✕ Deny & Do Not Post"}</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center flex-wrap gap-2 pt-0.5">
                {!bgTask?.running ? (
                  <button
                    type="button"
                    onClick={previewBackgroundFormulationTask}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold bg-indigo-600 hover:bg-indigo-500 text-white shadow-2xs transition-all cursor-pointer active:scale-95"
                  >
                    <span aria-hidden="true">🔍</span>
                    <span>
                      {isUr
                        ? "نتیجہ چیک کریں اور فارمولیشن ٹاسک شروع کریں"
                        : "Preview Result & Start Auto-Fill"}
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
                  onClick={() => setIsBgTaskDetailPopupOpen(true)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold border transition-colors cursor-pointer ${
                    isDark
                      ? "bg-indigo-950/60 hover:bg-indigo-900/70 border-indigo-500/40 text-indigo-200"
                      : "bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-700"
                  }`}
                >
                  <ArrowsPointingOutIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {isUr ? "تفصیلی پاپ اپ ونڈو" : "Open Detailed Popup"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleNavigateToRoute("/background-tasks")}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold border transition-colors cursor-pointer ${
                    isDark
                      ? "bg-emerald-950/60 hover:bg-emerald-900/70 border-emerald-500/40 text-emerald-200"
                      : "bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700"
                  }`}
                >
                  <span>
                    {isUr ? "الگ صفحے میں کھولیں" : "Open Separate Page"}
                  </span>
                  <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 shrink-0" />
                </button>

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

            {/* Interactive ERP Task Launchers (All Pre-Database Preview + Permission Guarded) */}
            <div
              className={`p-3.5 rounded-2xl border space-y-2.5 shadow-2xs ${
                isDark
                  ? "bg-slate-900 border-slate-800 text-slate-100"
                  : "bg-white border-slate-200/90 text-slate-800"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400">
                  {isUr
                    ? "⚡ دیگر اے آئی ٹاسکس (پری ویو اور اجازت کے ساتھ):"
                    : "⚡ Quick AI Tasks (Staged Preview + Permission Before DB Post):"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { icon: "➕", en: "Add Product", ur: "نئی پروڈکٹ", cmd: "Add a new product" },
                  { icon: "✏️", en: "Edit Product", ur: "پروڈکٹ ایڈٹ", cmd: "Edit a product" },
                  { icon: "🏷️", en: "Add Brand", ur: "نیا برانڈ", cmd: "Add a new brand" },
                  { icon: "📂", en: "Add Category", ur: "نئی کیٹیگری", cmd: "Add a new category" },
                  { icon: "🚚", en: "Add Supplier", ur: "نیا سپلائر", cmd: "Add a new supplier" },
                  { icon: "👤", en: "Add Customer", ur: "نیا کسٹمر", cmd: "Add a new customer" },
                  { icon: "📋", en: "Log Demand", ur: "کسٹمر ڈیمانڈ", cmd: "Add a new user demand" },
                ].map((tsk) => (
                  <button
                    key={tsk.cmd}
                    type="button"
                    onClick={() => handleAskSubmit(null, tsk.cmd, true)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer active:scale-95 ${
                      isDark
                        ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200"
                        : "bg-slate-50 hover:bg-blue-50 border-slate-200 text-slate-700"
                    }`}
                  >
                    <span aria-hidden="true">{tsk.icon}</span>
                    <span>{isUr ? tsk.ur : tsk.en}</span>
                  </button>
                ))}
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

                {/* Interactive Detailed Report (All Scanned, Filled via Google Search, & Skipped with Reasons) */}
                {renderAutoFillDetailedReport(bgTask)}
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
          /* TAB 1 (DEFAULT): MODERN COPILOT AI CHAT & BENTO ZERO-STATE        */
          /* ================================================================= */
          <div
            ref={chatScrollRef}
            onScroll={handleChatScroll}
            className={`guide-bot-drawer-body p-3.5 space-y-3 ${
              isDark ? "bg-slate-950/40" : "bg-slate-50/50"
            }`}
          >
            {/* Subtle 1-Line Live Telemetry Pill if Background Task is Running */}
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
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsBgTaskDetailPopupOpen(true)}
                    className="px-2 py-0.5 rounded-lg text-[10.5px] font-extrabold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                  >
                    {isUr ? "پاپ اپ رپورٹ" : "Popup Report"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveMainTab("tasks")}
                    className="px-2 py-0.5 rounded-lg text-[10.5px] font-bold bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-700 dark:text-indigo-200 cursor-pointer"
                  >
                    {isUr ? "ٹاسک ٹیب" : "Tab →"}
                  </button>
                </div>
              </div>
            )}

            {activeDemo && renderCubeDemoPlayer()}

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
                    className="space-y-3"
                  >
                    {/* Hero Greeting Banner with Interactive Full-Body Mascot */}
                    <div
                      className={`p-3.5 rounded-2xl border flex items-center gap-3 shadow-2xs ${
                        isDark
                          ? "bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border-slate-800 text-slate-100"
                          : "bg-gradient-to-br from-white via-slate-50/60 to-blue-50/50 border-slate-200/90 text-slate-800"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setPopupTrickIdx((prev) => {
                            const next = (prev + 1) % POPUP_STAGE_TRICKS.length;
                            if (next === 0) {
                              const order = ["cube", "pixel", "bot"];
                              const cur = getGuideBotMascotStyle();
                              setGuideBotMascotStyle(
                                order[(order.indexOf(cur) + 1) % order.length]
                              );
                            }
                            return next;
                          });
                          triggerBotTalking(1400);
                        }}
                        title={
                          isUr
                            ? "کرتب بدلنے کے لیے کیوب پر کلک کریں"
                            : "Click Cube to perform next trick"
                        }
                        className="group relative shrink-0 flex flex-col items-center cursor-pointer transition-transform duration-200 hover:scale-105 active:scale-95 focus:outline-hidden"
                      >
                        <GuideBotAvatar
                          className="w-14 h-18 drop-shadow-md"
                          fullBody={true}
                          speaking={visualTalking || isTyping}
                          presenter={true}
                          trick={
                            POPUP_STAGE_TRICKS[
                              popupTrickIdx % POPUP_STAGE_TRICKS.length
                            ]?.id || "rubiks"
                          }
                        />
                        <span
                          className={`-mt-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold whitespace-nowrap border shadow-2xs transition-colors ${
                            isDark
                              ? "bg-slate-800/95 border-slate-700 text-cyan-300 group-hover:border-cyan-500"
                              : "bg-slate-900 text-white border-slate-700 group-hover:bg-blue-600"
                          } ${isUr ? "guide-bot-urdu-inline" : ""}`}
                        >
                          {isUr
                            ? POPUP_STAGE_TRICKS[
                                popupTrickIdx % POPUP_STAGE_TRICKS.length
                              ]?.ur
                            : POPUP_STAGE_TRICKS[
                                popupTrickIdx % POPUP_STAGE_TRICKS.length
                              ]?.en}
                        </span>
                      </button>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-black text-slate-900 dark:text-white">
                            {isUr
                              ? "السلام علیکم! میں کیوب اے آئی ہوں"
                              : "How can I help you today?"}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/25">
                            {isUr ? "🛡️ پری ویو گارڈ" : "🛡️ Pre-DB Preview Guard"}
                          </span>
                        </div>
                        <p className="text-[11.5px] leading-relaxed text-slate-600 dark:text-slate-300">
                          {isUr
                            ? "اس اسکرین کے بارے میں کچھ بھی پوچھیں یا کوئی بھی ٹاسک کروائیں۔ ڈیٹا بیس میں محفوظ کرنے سے پہلے میں ہمیشہ نتیجہ دکھا کر آپ کی اجازت لوں گا۔"
                            : "Ask anything about this screen or run an ERP task below. Every database action shows a staged diff preview for your approval first."}
                        </p>
                      </div>
                    </div>

                    {/* 2x2 Bento Grid of High-Value Copilot Actions */}
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        {
                          id: "bento-explain",
                          icon: "📘",
                          accent: isDark
                            ? "from-blue-500/15 to-cyan-500/5 border-blue-500/30 hover:border-blue-400"
                            : "from-blue-50/90 to-white border-blue-200/90 hover:border-blue-400",
                          badgeEn: "Screen Guide",
                          badgeUr: "اسکرین گائیڈ",
                          titleEn: `Explain ${displayedGuide.title.en}`,
                          titleUr: `${displayedGuide.title.ur} سمجھائیں`,
                          descEn: "Workflow, fields & GL accounting impact",
                          descUr: "مکمل طریقہ اور کھاتوں پر اثر",
                          onClick: () =>
                            handleAskSubmit(
                              null,
                              isUr
                                ? `${displayedGuide.title.ur} کا مکمل طریقہ اور کھاتوں پر اثر بتائیں`
                                : `Explain ${displayedGuide.title.en} step by step and its accounting impact`,
                              true
                            ),
                        },
                        {
                          id: "bento-product",
                          icon: "➕",
                          accent: isDark
                            ? "from-emerald-500/15 to-teal-500/5 border-emerald-500/30 hover:border-emerald-400"
                            : "from-emerald-50/90 to-white border-emerald-200/90 hover:border-emerald-400",
                          badgeEn: "Task Wizard",
                          badgeUr: "ٹاسک وزرڈ",
                          titleEn: "Add or Edit Product",
                          titleUr: "نئی پروڈکٹ یا تبدیلی",
                          descEn: "Guided setup with DB duplicate check",
                          descUr: "ڈپلیکیٹ چیک اور پری ویو کے ساتھ",
                          onClick: () =>
                            handleAskSubmit(null, "Add a new product", true),
                        },
                        {
                          id: "bento-autofill",
                          icon: "🧪",
                          accent: isDark
                            ? "from-indigo-500/15 to-purple-500/5 border-indigo-500/30 hover:border-indigo-400"
                            : "from-indigo-50/90 to-white border-indigo-200/90 hover:border-indigo-400",
                          badgeEn: "Google Verified",
                          badgeUr: "گوگل تصدیق شدہ",
                          titleEn: "Auto-Fill Formulations",
                          titleUr: "خودکار فارمولیشن",
                          descEn: "Search Google for salts + detailed report",
                          descUr: "گوگل سرچ سے سالٹ اور تفصیلی رپورٹ",
                          onClick: () =>
                            handleAskSubmit(
                              null,
                              "Auto-fill missing formulations for my products",
                              true
                            ),
                        },
                        {
                          id: "bento-tour",
                          icon: "🎯",
                          accent: isDark
                            ? "from-amber-500/15 to-orange-500/5 border-amber-500/30 hover:border-amber-400"
                            : "from-amber-50/90 to-white border-amber-200/90 hover:border-amber-400",
                          badgeEn: "Spotlight Tour",
                          badgeUr: "لائیو ڈیمو",
                          titleEn: "Interactive Walkthrough",
                          titleUr: "عملی اسپاٹ لائٹ گائیڈ",
                          descEn: "Highlight live fields step by step",
                          descUr: "اسکرین کے بٹن مرحلہ وار ہائی لائٹ کریں",
                          onClick: () => {
                            startCubeDemo(
                              currentScreenWorkflowId || "dynamic_screen_tour",
                              true
                            );
                          },
                        },
                      ].map((card) => (
                        <button
                          key={card.id}
                          type="button"
                          onClick={card.onClick}
                          className={`guide-bot-bento-card p-3 rounded-2xl border bg-gradient-to-br text-left flex flex-col justify-between gap-1.5 shadow-2xs cursor-pointer ${card.accent}`}
                        >
                          <div className="flex items-center justify-between gap-1.5 w-full">
                            <span className="text-base leading-none" aria-hidden="true">
                              {card.icon}
                            </span>
                            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-wider bg-slate-900/5 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                              {isUr ? card.badgeUr : card.badgeEn}
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-xs font-extrabold text-slate-900 dark:text-white line-clamp-1">
                              {isUr ? card.titleUr : card.titleEn}
                            </p>
                            <p className="text-[10.5px] leading-snug text-slate-500 dark:text-slate-400 line-clamp-2">
                              {isUr ? card.descUr : card.descEn}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Compact Quick-Action Task Strip */}
                    <div
                      className={`p-3 rounded-2xl border space-y-2 ${
                        isDark
                          ? "bg-slate-900/90 border-slate-800"
                          : "bg-white border-slate-200/90 shadow-2xs"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                          {isUr
                            ? "⚡ ون کلک ٹاسکس (یا نیچے / ٹائپ کریں)"
                            : "⚡ Quick ERP Tasks (or type / below)"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsBgTaskDetailPopupOpen(true)}
                          className="text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                        >
                          {isUr ? "📊 ٹاسک رپورٹ پاپ اپ" : "📊 Task Report Popup →"}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { icon: "✏️", en: "Edit Product", ur: "پروڈکٹ ایڈٹ", cmd: "Edit a product" },
                          { icon: "🏷️", en: "Add Brand", ur: "نیا برانڈ", cmd: "Add a new brand" },
                          { icon: "📂", en: "Add Category", ur: "نئی کیٹیگری", cmd: "Add a new category" },
                          { icon: "🚚", en: "Add Supplier", ur: "نیا سپلائر", cmd: "Add a new supplier" },
                          { icon: "👤", en: "Add Customer", ur: "نیا کسٹمر", cmd: "Add a new customer" },
                          { icon: "📋", en: "Log Demand", ur: "ڈیمانڈ درج کریں", cmd: "Add a new user demand" },
                        ].map((chip) => (
                          <button
                            key={chip.cmd}
                            type="button"
                            onClick={() => handleAskSubmit(null, chip.cmd, true)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all cursor-pointer active:scale-95 ${
                              isDark
                                ? "bg-slate-800/90 hover:bg-slate-700 border-slate-700 text-slate-200"
                                : "bg-slate-50 hover:bg-blue-50/80 border-slate-200 text-slate-700"
                            }`}
                          >
                            <span aria-hidden="true">{chip.icon}</span>
                            <span>{isUr ? chip.ur : chip.en}</span>
                          </button>
                        ))}
                      </div>
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
                      <div className="max-w-[86%] flex flex-col items-end gap-1">
                        <span className="text-[10px] font-extrabold text-slate-400 px-1">
                          {isUr ? "آپ" : "You"}
                        </span>
                        <div
                          dir={isUr ? "rtl" : "ltr"}
                          lang={isUr ? "ur" : "en"}
                          className={`px-3.5 py-2.5 rounded-2xl rounded-br-xs bg-gradient-to-br from-slate-900 to-slate-800 dark:from-blue-600 dark:to-indigo-600 text-white text-xs sm:text-[13px] font-semibold shadow-2xs ${
                            isUr ? "guide-bot-urdu-block" : ""
                          }`}
                        >
                          {userText}
                        </div>
                      </div>
                    </div>
                  );
                }
                return renderCubeBotCard(msg);
              });
            })()}

            {/* Collapsible Multi-Stage AI Reasoning ("Thinking...") Pill */}
            {isTyping && (
              <div className="flex items-start gap-2 guide-bot-msg-card">
                <div
                  dir={isUr ? "rtl" : "ltr"}
                  lang={isUr ? "ur" : "en"}
                  className={`w-full px-3.5 py-2.5 rounded-2xl rounded-tl-xs border space-y-2 shadow-2xs ${
                    isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 text-white text-[11px] font-black shrink-0 animate-pulse">
                        🤖
                      </span>
                      <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400 truncate">
                        {thinkingStageIdx === 0
                          ? isUr
                            ? "🧠 آپ کی بات اور ٹاسک کو سمجھا جا رہا ہے..."
                            : "🧠 Understanding your request & intent..."
                          : thinkingStageIdx === 1
                          ? isUr
                            ? "🔍 کاروبار ای آر پی سیاق و سباق اور پری ویو چیک ہو رہا ہے..."
                            : "🔍 Checking Karobar ERP context & staging preview..."
                          : isUr
                          ? "✨ لائیو اے آئی جواب تیار کیا جا رہا ہے..."
                          : "✨ Generating live AI response..."}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsReasoningExpanded((v) => !v)}
                      className="px-2 py-0.5 rounded-md text-[10px] font-bold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer shrink-0"
                    >
                      {isReasoningExpanded
                        ? isUr
                          ? "چھپائیں ▲"
                          : "Hide ▲"
                        : isUr
                        ? "مراحل ▼"
                        : "Steps ▼"}
                    </button>
                  </div>

                  {/* 3-Step Visual Progress Bar */}
                  <div className="grid grid-cols-3 gap-1.5" dir="ltr">
                    {[0, 1, 2].map((stepIdx) => (
                      <div
                        key={stepIdx}
                        className={`h-1 rounded-full transition-all duration-300 ${
                          stepIdx <= thinkingStageIdx
                            ? "bg-gradient-to-r from-blue-500 to-cyan-400"
                            : isDark
                            ? "bg-slate-800"
                            : "bg-slate-200"
                        }`}
                      />
                    ))}
                  </div>

                  {isReasoningExpanded && (
                    <div className="pt-1 space-y-1 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-200/60 dark:border-slate-800">
                      <p className={thinkingStageIdx >= 0 ? "text-emerald-600 dark:text-emerald-400 font-bold" : ""}>
                        ✓ {isUr ? "1. سوال اور اسکرین سیاق و سباق کی شناخت" : "1. Analyzing screen route & task intent"}
                      </p>
                      <p className={thinkingStageIdx >= 1 ? "text-blue-600 dark:text-blue-400 font-bold" : ""}>
                        {thinkingStageIdx >= 1 ? "✓" : "○"}{" "}
                        {isUr ? "2. ڈیٹا بیس ریکارڈز اور پری ویو کی جانچ" : "2. Verifying ERP knowledge & staging DB preview"}
                      </p>
                      <p className={thinkingStageIdx >= 2 ? "text-indigo-600 dark:text-indigo-400 font-bold" : ""}>
                        {thinkingStageIdx >= 2 ? "●" : "○"}{" "}
                        {isUr ? "3. لائیو جواب کی تیاری" : "3. Streaming grounded response"}
                      </p>
                    </div>
                  )}
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
                    {[
                      { icon: "➕", en: "Add Product", ur: "نئی پروڈکٹ", cmd: "Add a new product" },
                      { icon: "✏️", en: "Edit Product", ur: "پروڈکٹ ایڈٹ", cmd: "Edit a product" },
                      { icon: "🧪", en: "Auto-Fill Salts", ur: "فارمولیشن", cmd: "Auto-fill missing formulations for my products" },
                      { icon: "🏷️", en: "Add Brand", ur: "نیا برانڈ", cmd: "Add a new brand" },
                    ].map((quick) => (
                      <button
                        key={quick.cmd}
                        type="button"
                        onClick={() => handleAskSubmit(null, quick.cmd, true)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                          isDark
                            ? "bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200"
                            : "bg-white hover:bg-slate-100 border-slate-200 text-slate-700"
                        }`}
                      >
                        <span aria-hidden="true">{quick.icon}</span>
                        <span>{isUr ? quick.ur : quick.en}</span>
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      stopLiveStream();
                      clearChatOnly();
                    }}
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
        {/* FLOATING ISLAND COMPOSER & SLASH COMMAND PALETTE                    */}
        {/* =================================================================== */}
        <footer
          className={`relative p-2.5 shrink-0 ${
            isDark
              ? "bg-slate-950/90 border-t border-slate-800/80"
              : "bg-slate-50/90 border-t border-slate-200/80"
          }`}
        >
          {/* Floating "Jump to Latest (↓)" Pill when user scrolls up */}
          {showScrollToBottomBtn && activeMainTab === "chat" && !showDirectory && (
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-20">
              <button
                type="button"
                onClick={scrollToBottom}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-slate-900/95 dark:bg-blue-600 text-white shadow-lg border border-slate-700/80 dark:border-blue-400/40 cursor-pointer hover:scale-105 active:scale-95 transition-transform"
              >
                <span aria-hidden="true">↓</span>
                <span>{isUr ? "تازہ ترین پیغام" : "Jump to latest"}</span>
              </button>
            </div>
          )}

          {/* `/` Slash Command Popover Palette (Keyboard + Click Navigable) */}
          {filteredSlashCommands.length > 0 &&
            (slashMenuOpen || questionInput.trim().startsWith("/")) && (
              <div
                role="listbox"
                aria-label={isUr ? "سلیش کمانڈز" : "Slash Commands"}
                dir={isUr ? "rtl" : "ltr"}
                className={`absolute bottom-full left-2.5 right-2.5 mb-2 rounded-2xl border shadow-2xl overflow-hidden z-30 guide-bot-msg-card ${
                  isDark
                    ? "bg-slate-900/98 border-slate-700 text-slate-100"
                    : "bg-white/98 border-slate-200 text-slate-900"
                }`}
              >
                <div
                  className={`px-3 py-1.5 border-b flex items-center justify-between gap-2 text-[10px] font-extrabold uppercase tracking-wider ${
                    isDark
                      ? "bg-slate-950/80 border-slate-800 text-slate-400"
                      : "bg-slate-50 border-slate-200/80 text-slate-500"
                  }`}
                >
                  <span>
                    {isUr
                      ? "⚡ کوپائلٹ کمانڈز (منتخب کرنے کے لیے کلک یا Enter دبائیں)"
                      : "⚡ Copilot Slash Commands (↑↓ Navigate · Enter Select)"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSlashMenuOpen(false)}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <div className="max-h-52 overflow-y-auto divide-y divide-slate-200/60 dark:divide-slate-800/70">
                  {filteredSlashCommands.map((cmdItem, idx) => {
                    const isSelected =
                      idx === slashSelectedIndex % filteredSlashCommands.length;
                    return (
                      <button
                        key={cmdItem.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onMouseEnter={() => setSlashSelectedIndex(idx)}
                        onClick={() => executeSlashCommand(cmdItem)}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          isSelected
                            ? isDark
                              ? "bg-blue-600/20 text-white"
                              : "bg-blue-50 text-slate-900"
                            : "hover:bg-slate-100/70 dark:hover:bg-slate-800/60"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-sm shrink-0" aria-hidden="true">
                            {cmdItem.icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                                {isUr ? cmdItem.ur : cmdItem.en}
                              </span>
                              <code
                                dir="ltr"
                                className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-blue-500/15 text-blue-600 dark:text-blue-300"
                              >
                                {cmdItem.cmd}
                              </code>
                            </div>
                            <p className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
                              {isUr ? cmdItem.descUr : cmdItem.descEn}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 shrink-0">
                          ↵
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

          {/* Floating Island Composer Container */}
          <div
            className={`rounded-2xl border p-2 transition-all shadow-sm focus-within:ring-2 focus-within:ring-blue-500/40 ${
              isDark
                ? "bg-slate-900 border-slate-700/90 focus-within:border-blue-500"
                : "bg-white border-slate-200/95 focus-within:border-blue-500"
            }`}
          >
            {/* Top Context Strip inside Composer Island */}
            <div className="flex items-center justify-between gap-1.5 pb-1.5 mb-1 border-b border-slate-200/60 dark:border-slate-800/80 flex-wrap">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border truncate max-w-[190px] ${
                    isDark
                      ? "bg-slate-800/90 border-slate-700 text-slate-300"
                      : "bg-slate-100 border-slate-200/80 text-slate-700"
                  }`}
                  title={isUr ? displayedGuide.title.ur : displayedGuide.title.en}
                >
                  <span aria-hidden="true">📍</span>
                  <span className="truncate">
                    {isUr ? displayedGuide.title.ur : displayedGuide.title.en}
                  </span>
                </span>

                <button
                  type="button"
                  onClick={() => {
                    setSlashMenuOpen((v) => !v);
                    setSlashSelectedIndex(0);
                    askInputRef.current?.focus();
                  }}
                  title={isUr ? "سلیش کمانڈز کھولیں (/)" : "Open Slash Commands (/)"}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold border transition-colors cursor-pointer ${
                    slashMenuOpen || questionInput.trim().startsWith("/")
                      ? "bg-blue-600 text-white border-blue-600"
                      : isDark
                      ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-cyan-300"
                      : "bg-blue-50/80 hover:bg-blue-100 border-blue-200 text-blue-700"
                  }`}
                >
                  <span className="font-mono">/</span>
                  <span>{isUr ? "کمانڈز" : "Commands"}</span>
                </button>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {thread.some(
                  (msg) =>
                    (msg.role === "user" && !msg.fromGuideChip) || msg.kind === "qa"
                ) && (
                  <button
                    type="button"
                    onClick={() => {
                      stopLiveStream();
                      clearChatOnly();
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <ArrowPathIcon className="w-3 h-3" />
                    <span>{isUr ? "نئی چیٹ" : "New Chat"}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Auto-Growing Textarea + Send Action Row */}
            <div className="flex items-end gap-2" role="search">
              <label htmlFor="guide-bot-ask-input" className="sr-only">
                Ask Cube AI or request a task
              </label>
              <div
                ref={growableTextareaWrapRef}
                className="guide-bot-growable-textarea flex-1"
              >
                <textarea
                  id="guide-bot-ask-input"
                  ref={askInputRef}
                  rows={1}
                  dir={isUr ? "rtl" : "ltr"}
                  value={questionInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setQuestionInput(val);
                    if (val.trim().startsWith("/")) {
                      setSlashMenuOpen(true);
                      setSlashSelectedIndex(0);
                    } else if (slashMenuOpen && !val.trim()) {
                      setSlashMenuOpen(false);
                    }
                    if (
                      growableTextareaWrapRef.current &&
                      typeof CSS !== "undefined" &&
                      !CSS.supports("field-sizing", "content")
                    ) {
                      growableTextareaWrapRef.current.dataset.replicatedValue = val;
                    }
                  }}
                  onKeyDown={(e) => {
                    // Guard against premature Enter submit during IME composition
                    if (
                      e.nativeEvent?.isComposing ||
                      e.isComposing ||
                      e.keyCode === 229
                    ) {
                      return;
                    }

                    const isSlashVisible =
                      filteredSlashCommands.length > 0 &&
                      (slashMenuOpen || questionInput.trim().startsWith("/"));

                    if (isSlashVisible) {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setSlashSelectedIndex(
                          (prev) => (prev + 1) % filteredSlashCommands.length
                        );
                        return;
                      }
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setSlashSelectedIndex(
                          (prev) =>
                            (prev - 1 + filteredSlashCommands.length) %
                            filteredSlashCommands.length
                        );
                        return;
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                        setSlashMenuOpen(false);
                        if (questionInput.trim().startsWith("/")) {
                          setQuestionInput("");
                        }
                        return;
                      }
                      if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey) {
                        e.preventDefault();
                        e.stopPropagation();
                        const chosen =
                          filteredSlashCommands[
                            slashSelectedIndex % filteredSlashCommands.length
                          ];
                        if (chosen) {
                          executeSlashCommand(chosen);
                        }
                        return;
                      }
                    }

                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.stopPropagation();
                      handleAskSubmit(e);
                    }
                  }}
                  placeholder={
                    isUr
                      ? "سوال پوچھیں، ٹاسک بتائیں، یا کمانڈز کے لیے / ٹائپ کریں..."
                      : "Ask anything, request a task, or type / for commands..."
                  }
                  className={`guide-bot-composer-textarea px-1.5 py-1 text-base sm:text-[13px] font-medium bg-transparent border-0 focus:outline-hidden ${
                    isDark
                      ? "text-white placeholder-slate-400"
                      : "text-slate-900 placeholder-slate-400"
                  }`}
                />
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {streamingMsgId && (
                  <button
                    type="button"
                    onClick={stopLiveStream}
                    title={isUr ? "لائیو اسٹریمنگ روکیں" : "Stop streaming"}
                    className="h-8 px-2.5 rounded-xl text-[11px] font-extrabold bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 border border-amber-500/30 cursor-pointer"
                  >
                    ⏹
                  </button>
                )}
                <button
                  type="button"
                  disabled={isTyping || !questionInput.trim()}
                  onClick={(e) => handleAskSubmit(e)}
                  aria-label={isUr ? "سوال بھیجیں" : "Send message"}
                  className="h-8 px-3 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer shrink-0 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 active:scale-95"
                >
                  <PaperAirplaneIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{isUr ? "بھیجیں" : "Send"}</span>
                </button>
              </div>
            </div>

            {/* Bottom Keyboard Shortcut Hint Strip */}
            <div
              className="pt-1 mt-0.5 flex items-center justify-between gap-2 text-[10px] font-semibold text-slate-400 dark:text-slate-500"
              dir="ltr"
            >
              <span>↵ Send · ⇧↵ New line · / Commands</span>
              <span>Alt+G Toggle</span>
            </div>
          </div>
        </footer>
      </div>
      </dialog>

      {/* Full-Screen / Large Detailed Background Task Popup Modal (<dialog closedby="any">) */}
      <dialog
        ref={bgDetailDialogRef}
        {...{ closedby: "any" }}
        aria-labelledby={bgDetailTitleId}
        className={`m-auto w-[96vw] max-w-6xl max-h-[92vh] rounded-3xl p-0 border shadow-2xl overflow-hidden backdrop:bg-slate-950/65 backdrop:backdrop-blur-xs ${
          isDark
            ? "bg-slate-950 border-slate-800 text-slate-100"
            : "bg-slate-50 border-slate-200 text-slate-900"
        }`}
      >
        <span id={bgDetailTitleId} className="sr-only">
          Background Task & Formulation Auto-Fill Detailed Report
        </span>
        <div className="p-4 sm:p-6 overflow-y-auto max-h-[90vh]">
          <BackgroundTaskDetailView
            bgTask={bgTask}
            isUr={isUr}
            isDark={isDark}
            isPopup={true}
            onClosePopup={() => setIsBgTaskDetailPopupOpen(false)}
            onOpenSeparatePage={() => {
              setIsBgTaskDetailPopupOpen(false);
              handleNavigateToRoute("/background-tasks");
            }}
            filterQuery={bgFilterQuery}
            onFilterQueryChange={setBgFilterQuery}
            onPreviewStart={previewBackgroundFormulationTask}
            onDirectStart={() => {
              setBgTaskAwaitingPermission(false);
              setBgPreviewData(null);
              startBackgroundFormulationTask();
            }}
            onStopTask={stopBackgroundTask}
            onClearReport={() => setBgTask(null)}
            previewLoading={bgPreviewLoading}
            awaitingPermission={bgTaskAwaitingPermission}
            previewData={bgPreviewData}
            onConfirmPermission={() => {
              setBgTaskAwaitingPermission(false);
              setBgPreviewData(null);
              startBackgroundFormulationTask();
            }}
            onCancelPermission={() => {
              setBgTaskAwaitingPermission(false);
              setBgPreviewData(null);
            }}
            onNavigateProduct={(path) => {
              setIsBgTaskDetailPopupOpen(false);
              handleNavigateToRoute(path);
            }}
          />
        </div>
      </dialog>

      {/* Full-Viewport Interactive Spotlight Tour Overlay (active when drawer is closed) */}
      {renderSpotlightTourOverlay()}
    </>
  );
}
