// resources/js/components/GuideBotTrigger.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";

const MASCOT_STYLE_KEY = "karobar_guide_bot_mascot_style";
const OPEN_STATE_KEY = "karobar_guide_bot_is_open";
const BOTTOM_MASCOT_ENABLED_KEY = "karobar_bottom_mascot_enabled";

/**
 * Shared persistent setting for enabling/disabling ONLY the bottom roaming Cube mascot.
 * Defaults to `true` (ON). Does not affect the Topbar "Guide Bot" button or popup.
 */
export function getBottomMascotEnabled() {
  try {
    return localStorage.getItem(BOTTOM_MASCOT_ENABLED_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setBottomMascotEnabled(enabled) {
  const resolved = Boolean(enabled);
  try {
    localStorage.setItem(BOTTOM_MASCOT_ENABLED_KEY, resolved ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(
    new CustomEvent("guide-bot-bottom-mascot-changed", { detail: resolved })
  );
  return resolved;
}

export function useBottomMascotEnabledState() {
  const [enabled, setEnabledState] = useState(() => getBottomMascotEnabled());
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const setEnabled = useCallback((nextVal) => {
    const resolved =
      typeof nextVal === "function"
        ? Boolean(nextVal(enabledRef.current))
        : Boolean(nextVal);
    enabledRef.current = resolved;
    setEnabledState(resolved);
    setBottomMascotEnabled(resolved);
  }, []);

  useEffect(() => {
    const onSync = (e) => {
      const next =
        typeof e?.detail === "boolean" ? e.detail : getBottomMascotEnabled();
      enabledRef.current = next;
      setEnabledState(next);
    };
    const onStorage = (e) => {
      if (e.key === BOTTOM_MASCOT_ENABLED_KEY) {
        const next = getBottomMascotEnabled();
        enabledRef.current = next;
        setEnabledState(next);
      }
    };
    window.addEventListener("guide-bot-bottom-mascot-changed", onSync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("guide-bot-bottom-mascot-changed", onSync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return [enabled, setEnabled];
}

/**
 * Shared persistent open-state hook so the Guide Bot stays open across all page
 * navigations (including standalone routes like Barcode POS).
 */
export function useGuideBotOpenState() {
  const [isOpen, setIsOpenState] = useState(() => {
    try {
      return sessionStorage.getItem(OPEN_STATE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const setIsOpen = useCallback((nextVal) => {
    const resolved =
      typeof nextVal === "function"
        ? Boolean(nextVal(isOpenRef.current))
        : Boolean(nextVal);
    isOpenRef.current = resolved;
    setIsOpenState(resolved);
    try {
      sessionStorage.setItem(OPEN_STATE_KEY, resolved ? "1" : "0");
    } catch {
      /* ignore */
    }
    window.dispatchEvent(
      new CustomEvent("guide-bot-open-state-changed", { detail: resolved })
    );
  }, []);

  useEffect(() => {
    const onSync = (e) => {
      if (typeof e?.detail === "boolean") {
        isOpenRef.current = e.detail;
        setIsOpenState(e.detail);
      }
    };
    window.addEventListener("guide-bot-open-state-changed", onSync);
    return () => window.removeEventListener("guide-bot-open-state-changed", onSync);
  }, []);

  return [isOpen, setIsOpen];
}

// Autonomous gaze + cute expression keyframes when cursor is idle
const IDLE_FRAMES = [
  { x: 0, y: 0, happyArcs: false, bigSmile: true },
  { x: -3.2, y: -0.5, happyArcs: false, bigSmile: true },
  { x: 3.2, y: -0.5, happyArcs: false, bigSmile: true },
  { x: 0, y: -0.4, happyArcs: true, bigSmile: true }, // Cute ^ ^ happy eye arcs
  { x: -2.2, y: 1.1, happyArcs: false, bigSmile: false },
  { x: 2.4, y: -1.1, happyArcs: false, bigSmile: true },
  { x: 0, y: 0, happyArcs: false, bigSmile: true },
];

// Presenter gaze frames when the big bot is on stage explaining the screen below
const PRESENTER_FRAMES = [
  { x: 0, y: 0, happyArcs: false, bigSmile: true },
  { x: -2.6, y: 1.6, happyArcs: false, bigSmile: true }, // Glancing down-left at explanation
  { x: 0, y: 0, happyArcs: true, bigSmile: true },      // Proud ^ ^ smile at user
  { x: 2.6, y: 1.6, happyArcs: false, bigSmile: true },  // Glancing down-right at explanation
  { x: -3.0, y: -0.4, happyArcs: false, bigSmile: true },
  { x: 3.0, y: -0.4, happyArcs: false, bigSmile: true },
  { x: 0, y: 0, happyArcs: false, bigSmile: true },
];

/**
 * Cube Mascot Avatar:
 * - `fullBody={false}`: Compact solid-black Cube head icon for the Topbar button.
 * - `fullBody={true}`: Full-Body Cube character with a matching solid-black geometric
 *   cube torso, glowing chest core/equalizer, articulated swinging/waving cube arms,
 *   stepping white-soled cube boots, and 8 entertaining desktop-robot tricks:
 *   ('backflip' | 'dance' | 'hoverboard' | 'juggle' | 'shades' | 'charge' | 'scan' | 'sleep' | 'wake')
 */
export function GuideBotAvatar({
  className = "w-9 h-8",
  interactive = true,
  forceStyle = null,
  speaking = false,
  presenter = false,
  fullBody = false,
  walking = false,
  walkDirection = "right",
  waving = false,
  trick = null,
}) {
  const svgRef = useRef(null);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const [isBlinking, setIsBlinking] = useState(false);
  const [happyArcs, setHappyArcs] = useState(false);
  const [bigSmile, setBigSmile] = useState(true);
  const [talkPhase, setTalkPhase] = useState(0); // 0 = smile, 1 = open oval, 2 = wide D-talk
  const [isHovered, setIsHovered] = useState(false);
  const [mascotStyle, setMascotStyle] = useState(() => {
    try {
      return localStorage.getItem(MASCOT_STYLE_KEY) || "cube";
    } catch {
      return "cube";
    }
  });
  const lastMouseMoveRef = useRef(0);

  useEffect(() => {
    const onStyleChange = (e) => {
      if (e?.detail) setMascotStyle(e.detail);
    };
    window.addEventListener("guide-bot-mascot-changed", onStyleChange);
    return () => window.removeEventListener("guide-bot-mascot-changed", onStyleChange);
  }, []);

  // 1. Smooth Mouse Cursor Eye Tracking (throttled + cached rect to avoid 60fps synchronous reflows)
  const rectCacheRef = useRef({ rect: null, ts: 0 });
  const shouldTrackMouse = interactive && (fullBody || presenter || isHovered);

  useEffect(() => {
    if (!shouldTrackMouse || typeof window === "undefined") return;

    let rafId = null;
    let lastTick = 0;

    const invalidateRect = () => {
      rectCacheRef.current.ts = 0;
    };

    const handleMouseMove = (e) => {
      const now = Date.now();
      if (now - lastTick < 80 || rafId) return;
      lastTick = now;

      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        const el = svgRef.current;
        if (!el) return;

        if (!rectCacheRef.current.rect || now - rectCacheRef.current.ts > 600) {
          rectCacheRef.current.rect = el.getBoundingClientRect();
          rectCacheRef.current.ts = now;
        }
        const rect = rectCacheRef.current.rect;
        if (!rect || (rect.width === 0 && rect.height === 0)) return;

        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY;
        const dist = Math.hypot(dx, dy) || 1;

        const factor = Math.min(dist / 80, 1);
        const nx = Number(((dx / dist) * 3.5 * factor).toFixed(2));
        const ny = Number(((dy / dist) * 2.0 * factor).toFixed(2));

        lastMouseMoveRef.current = now;
        setGaze((prev) => {
          if (Math.abs(prev.x - nx) < 0.35 && Math.abs(prev.y - ny) < 0.35) {
            return prev;
          }
          return { x: nx, y: ny };
        });
      });
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("scroll", invalidateRect, { passive: true });
    window.addEventListener("resize", invalidateRect, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("scroll", invalidateRect);
      window.removeEventListener("resize", invalidateRect);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [shouldTrackMouse]);

  // 2. Autonomous Eye Glancing & Cute Expressions when cursor is idle
  useEffect(() => {
    if (typeof window === "undefined" || trick === "sleep") return;
    let idx = 0;
    const frames = presenter ? PRESENTER_FRAMES : IDLE_FRAMES;

    const timer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      const idleMs = Date.now() - lastMouseMoveRef.current;
      idx = (idx + 1) % frames.length;
      const frame = frames[idx];

      setHappyArcs((prev) => (prev === frame.happyArcs ? prev : frame.happyArcs));
      setBigSmile((prev) => (prev === frame.bigSmile ? prev : frame.bigSmile));

      if (idleMs > 1200) {
        let nextX = frame.x;
        let nextY = frame.y;
        if (walking || trick === "hoverboard") {
          nextX = walkDirection === "left" ? -2.8 : 2.8;
          nextY = 0.2;
        } else if (trick === "scan" || trick === "spy") {
          nextX = idx % 2 === 0 ? -2.5 : 2.5;
          nextY = -1.2;
        } else if (trick === "juggle") {
          nextX = idx % 2 === 0 ? -2.2 : 2.2;
          nextY = -1.6;
        } else if (trick === "rubiks") {
          nextX = idx % 2 === 0 ? -1.4 : 1.4;
          nextY = 1.9;
        } else if (trick === "headphones") {
          nextX = idx % 2 === 0 ? -1.8 : 1.8;
          nextY = -0.4;
        }
        setGaze((prev) =>
          prev.x === nextX && prev.y === nextY ? prev : { x: nextX, y: nextY }
        );
      }
    }, presenter ? 2000 : 2800);

    return () => window.clearInterval(timer);
  }, [presenter, walking, walkDirection, trick]);

  // Update gaze immediately when starting to walk or perform a directional trick
  useEffect(() => {
    if ((walking || trick === "hoverboard") && Date.now() - lastMouseMoveRef.current > 900) {
      setGaze({
        x: walkDirection === "left" ? -2.8 : 2.8,
        y: 0.2,
      });
    } else if (trick === "scan" || trick === "spy") {
      setGaze({ x: 1.2, y: -0.8 });
    } else if (trick === "juggle") {
      setGaze({ x: 0, y: -1.5 });
    } else if (trick === "rubiks") {
      setGaze({ x: 0, y: 1.9 });
    } else if (trick === "headphones") {
      setGaze({ x: 0, y: -0.3 });
    }
  }, [walking, walkDirection, trick]);

  // 3. Natural Periodic Eye Blinking
  useEffect(() => {
    if (typeof window === "undefined" || trick === "sleep") return;
    let t1 = null;
    let t2 = null;
    let t3 = null;

    const triggerBlink = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      setIsBlinking(true);
      t1 = window.setTimeout(() => {
        setIsBlinking(false);
        if (Math.random() < 0.3) {
          t2 = window.setTimeout(() => {
            setIsBlinking(true);
            t3 = window.setTimeout(() => setIsBlinking(false), 110);
          }, 130);
        }
      }, 125);
    };

    const blinkInterval = window.setInterval(triggerBlink, 4200);
    return () => {
      window.clearInterval(blinkInterval);
      if (t1) window.clearTimeout(t1);
      if (t2) window.clearTimeout(t2);
      if (t3) window.clearTimeout(t3);
    };
  }, [trick]);

  // 4. Animated Talking Phase (only run fast interval when actively speaking)
  useEffect(() => {
    if (!speaking || typeof window === "undefined") {
      setTalkPhase(0);
      return;
    }
    const talkTimer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setTalkPhase((prev) => (prev + 1) % 3);
    }, 220);
    return () => window.clearInterval(talkTimer);
  }, [speaking]);

  const activeStyle = forceStyle || mascotStyle;
  const isSleeping = trick === "sleep";
  const isWake = trick === "wake";
  const showArcs =
    !isSleeping &&
    !isWake &&
    trick !== "spy" &&
    (isHovered ||
      happyArcs ||
      trick === "backflip" ||
      trick === "dance" ||
      trick === "charge" ||
      trick === "headphones" ||
      (trick === "rubiks" && talkPhase === 2));
  const isWaving =
    waving || isHovered || speaking || trick === "shades";

  // =========================================================================
  // FULL-BODY CUBE CHARACTER (for Bottom Roaming Companion & Popup Stage)
  // =========================================================================
  if (fullBody) {
    const leanDeg =
      walking || trick === "hoverboard"
        ? walkDirection === "left"
          ? trick === "hoverboard"
            ? -6.5
            : -3.2
          : trick === "hoverboard"
          ? 6.5
          : 3.2
        : 0;

    const trickClass = trick ? `cube-trick-${trick}` : "";

    return (
      <svg
        ref={svgRef}
        viewBox="0 0 68 84"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`guide-bot-avatar guide-bot-fullbody overflow-visible select-none ${
          walking && trick !== "hoverboard" ? "cube-is-walking" : "cube-is-idle"
        } ${isWaving ? "cube-is-waving" : ""} ${trickClass} ${className}`}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="cubeScanBeamGrad" x1="50%" y1="100%" x2="50%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="cubeBoardGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>

        {/* Soft Ground Shadow */}
        <ellipse
          cx="34"
          cy="79.5"
          rx={trick === "hoverboard" ? "24" : walking ? "19" : "17"}
          ry="3.2"
          fill={trick === "hoverboard" ? "rgba(6, 182, 212, 0.38)" : "rgba(15, 23, 42, 0.24)"}
          className="cube-ground-shadow"
        />

        {/* =============================================================== */}
        {/* HOVERBOARD PROP (Trick 3: Neon Hover-Skateboard under boots)     */}
        {/* =============================================================== */}
        {trick === "hoverboard" && (
          <g className="cube-prop-hoverboard">
            {/* Speed trail lines behind the board */}
            {walkDirection === "left" ? (
              <g stroke="#38bdf8" strokeWidth="1.6" strokeLinecap="round" opacity="0.75">
                <line x1="54" y1="74" x2="66" y2="74" className="cube-speed-line-1" />
                <line x1="56" y1="78" x2="65" y2="78" className="cube-speed-line-2" />
              </g>
            ) : (
              <g stroke="#38bdf8" strokeWidth="1.6" strokeLinecap="round" opacity="0.75">
                <line x1="2" y1="74" x2="14" y2="74" className="cube-speed-line-1" />
                <line x1="3" y1="78" x2="12" y2="78" className="cube-speed-line-2" />
              </g>
            )}
            {/* Hover-deck */}
            <rect
              x="12"
              y="74.5"
              width="44"
              height="4.2"
              rx="2.1"
              fill="#09090b"
              stroke="url(#cubeBoardGrad)"
              strokeWidth="1.5"
            />
            {/* Glowing anti-gravity thrusters */}
            <ellipse cx="21" cy="79.5" rx="4.5" ry="1.4" fill="#38bdf8" opacity="0.9" />
            <ellipse cx="47" cy="79.5" rx="4.5" ry="1.4" fill="#10b981" opacity="0.9" />
          </g>
        )}

        {/* =============================================================== */}
        {/* WHOLE-BODY RIG (Used for Backflip, Jump, Squat, Dance & Sleep)   */}
        {/* =============================================================== */}
        <g className="cube-whole-body-rig" style={{ transformOrigin: "34px 48px" }}>
          {/* ============================================================= */}
          {/* CUBE LEGS & WHITE-SOLED BOOTS                                 */}
          {/* ============================================================= */}
          <g className="cube-legs-group">
            {/* Left Leg */}
            <g className="cube-leg cube-leg-left" style={{ transformOrigin: "26px 62px" }}>
              <rect
                x="21.5"
                y="60"
                width="9"
                height="13"
                rx="3.5"
                fill="#09090b"
                stroke="#27272a"
                strokeWidth="1.2"
              />
              {/* Left Boot */}
              <rect
                x="19.5"
                y="71"
                width="12"
                height="6"
                rx="3"
                fill="#09090b"
                stroke="#27272a"
                strokeWidth="1.1"
              />
              {/* Crisp White Sneaker Sole Accent */}
              <rect
                x="21"
                y="74.8"
                width="9"
                height="1.6"
                rx="0.8"
                fill="#ffffff"
                opacity="0.92"
              />
            </g>

            {/* Right Leg */}
            <g className="cube-leg cube-leg-right" style={{ transformOrigin: "42px 62px" }}>
              <rect
                x="37.5"
                y="60"
                width="9"
                height="13"
                rx="3.5"
                fill="#09090b"
                stroke="#27272a"
                strokeWidth="1.2"
              />
              {/* Right Boot */}
              <rect
                x="36.5"
                y="71"
                width="12"
                height="6"
                rx="3"
                fill="#09090b"
                stroke="#27272a"
                strokeWidth="1.1"
              />
              {/* Crisp White Sneaker Sole Accent */}
              <rect
                x="38"
                y="74.8"
                width="9"
                height="1.6"
                rx="0.8"
                fill="#ffffff"
                opacity="0.92"
              />
            </g>
          </g>

          {/* ============================================================= */}
          {/* UPPER RIG: TORSO + ARMS + SIGNATURE CUBE HEAD                 */}
          {/* ============================================================= */}
          <g
            className="cube-upper-rig"
            style={{
              transformOrigin: "34px 56px",
              transform: `rotate(${leanDeg}deg)`,
              transition: "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            {/* Trick 7: Curious Screen Scanner Hologram Cone */}
            {trick === "scan" && (
              <path
                d="M 22 18 L -2 -18 L 70 -18 L 46 18 Z"
                fill="url(#cubeScanBeamGrad)"
                className="cube-scan-cone"
              />
            )}

            {/* Left Cube Arm */}
            <g className="cube-arm cube-arm-left" style={{ transformOrigin: "16px 45px" }}>
              <rect
                x="10"
                y="42.5"
                width="7.5"
                height="16.5"
                rx="3.75"
                fill="#09090b"
                stroke="#27272a"
                strokeWidth="1.2"
              />
              {/* Crisp White Wrist Cuff */}
              <rect x="11.5" y="54" width="4.5" height="2" rx="1" fill="#ffffff" opacity="0.9" />
            </g>

            {/* Right Cube Arm (Swings, waves, sips coffee, or salutes) */}
            <g className="cube-arm cube-arm-right" style={{ transformOrigin: "52px 45px" }}>
              <rect
                x="50.5"
                y="42.5"
                width="7.5"
                height="16.5"
                rx="3.75"
                fill="#09090b"
                stroke="#27272a"
                strokeWidth="1.2"
              />
              {/* Crisp White Wrist Cuff */}
              <rect x="52" y="54" width="4.5" height="2" rx="1" fill="#ffffff" opacity="0.9" />

              {/* Trick 6: Cute Steaming Coffee / Energy Mug in Right Hand */}
              {trick === "charge" && (
                <g transform="translate(48, 52)">
                  <rect
                    x="0"
                    y="0"
                    width="9"
                    height="9"
                    rx="2"
                    fill="#ffffff"
                    stroke="#09090b"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M 9 2.2 H 11 A 1.8 1.8 0 0 1 11 6.8 H 9"
                    stroke="#ffffff"
                    strokeWidth="1.4"
                    fill="none"
                  />
                  <rect x="2" y="2.5" width="5" height="4" rx="1" fill="#10b981" />
                </g>
              )}

              {/* Trick 11: Cute Detective Magnifying Glass in Right Hand ('spy') */}
              {trick === "spy" && (
                <g className="cube-prop-spy" transform="translate(43, 33)">
                  <line
                    x1="10"
                    y1="14"
                    x2="14"
                    y2="20"
                    stroke="#f59e0b"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                  />
                  <circle
                    cx="7"
                    cy="8"
                    r="6.8"
                    fill="rgba(56, 189, 248, 0.28)"
                    stroke="#38bdf8"
                    strokeWidth="2.2"
                  />
                  <path
                    d="M 4.5 5.2 A 3.5 3.5 0 0 1 9.5 5.2"
                    stroke="#ffffff"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    fill="none"
                  />
                </g>
              )}
            </g>

            {/* Neck Joint */}
            <rect x="28" y="38" width="12" height="6" rx="2" fill="#18181b" />

            {/* Matching Rounded-Cube Torso */}
            <rect
              x="18.5"
              y="41.5"
              width="31"
              height="21.5"
              rx={activeStyle === "pixel" ? "3.5" : "6.5"}
              fill="#09090b"
              stroke={
                trick === "charge"
                  ? "#10b981"
                  : trick === "headphones"
                  ? "#38bdf8"
                  : trick === "rubiks"
                  ? "#f59e0b"
                  : "#27272a"
              }
              strokeWidth="1.3"
            />

            {/* Recessed Chest Core Screen */}
            <rect
              x="23.5"
              y="45.5"
              width="21"
              height="13.5"
              rx={activeStyle === "pixel" ? "2" : "4"}
              fill="#18181b"
              stroke="#27272a"
              strokeWidth="1"
            />

            {/* Glowing Chest Equalizer / Core Bars */}
            <g className="cube-chest-core">
              <rect
                x="27.2"
                y={
                  (speaking ||
                    trick === "dance" ||
                    trick === "charge" ||
                    trick === "headphones") &&
                  talkPhase === 1
                    ? "47.4"
                    : "50.2"
                }
                width="3"
                height={
                  (speaking ||
                    trick === "dance" ||
                    trick === "charge" ||
                    trick === "headphones") &&
                  talkPhase === 1
                    ? "9.2"
                    : "4.2"
                }
                rx="1.5"
                fill={
                  trick === "charge"
                    ? "#10b981"
                    : trick === "headphones"
                    ? "#a855f7"
                    : "#38bdf8"
                }
              />
              <rect
                x="32.5"
                y={
                  (speaking ||
                    trick === "dance" ||
                    trick === "charge" ||
                    trick === "headphones") &&
                  talkPhase === 2
                    ? "46.8"
                    : "48.5"
                }
                width="3"
                height={
                  (speaking ||
                    trick === "dance" ||
                    trick === "charge" ||
                    trick === "headphones") &&
                  talkPhase === 2
                    ? "10.6"
                    : "7.5"
                }
                rx="1.5"
                fill={trick === "headphones" ? "#38bdf8" : "#ffffff"}
              />
              <rect
                x="37.8"
                y={
                  (speaking ||
                    trick === "dance" ||
                    trick === "charge" ||
                    trick === "headphones") &&
                  talkPhase === 1
                    ? "48.0"
                    : "50.2"
                }
                width="3"
                height={
                  (speaking ||
                    trick === "dance" ||
                    trick === "charge" ||
                    trick === "headphones") &&
                  talkPhase === 1
                    ? "8.2"
                    : "4.2"
                }
                rx="1.5"
                fill={
                  trick === "charge" || trick === "headphones"
                    ? "#10b981"
                    : "#38bdf8"
                }
              />
            </g>

            {/* =========================================================== */}
            {/* Trick 9: SOLVING RUBIK'S CUBE IN HANDS ('rubiks')            */}
            {/* =========================================================== */}
            {trick === "rubiks" && (
              <g
                className="cube-prop-rubiks"
                style={{ transformOrigin: "34px 52px" }}
              >
                {/* 3x3 Rubik's Cube Base Frame */}
                <rect
                  x="24.5"
                  y="42.5"
                  width="19"
                  height="19"
                  rx="2.5"
                  fill="#09090b"
                  stroke="#ffffff"
                  strokeWidth="1.1"
                />
                {/* Row 1 Tiles */}
                <rect
                  x="25.8"
                  y="43.8"
                  width="5"
                  height="5"
                  rx="0.9"
                  fill={talkPhase === 2 ? "#ef4444" : talkPhase === 1 ? "#3b82f6" : "#facc15"}
                />
                <rect
                  x="31.5"
                  y="43.8"
                  width="5"
                  height="5"
                  rx="0.9"
                  fill="#ef4444"
                />
                <rect
                  x="37.2"
                  y="43.8"
                  width="5"
                  height="5"
                  rx="0.9"
                  fill={talkPhase === 2 ? "#ef4444" : talkPhase === 1 ? "#10b981" : "#ef4444"}
                />
                {/* Row 2 Tiles */}
                <rect
                  x="25.8"
                  y="49.5"
                  width="5"
                  height="5"
                  rx="0.9"
                  fill={talkPhase === 2 ? "#3b82f6" : talkPhase === 1 ? "#facc15" : "#10b981"}
                />
                <rect
                  x="31.5"
                  y="49.5"
                  width="5"
                  height="5"
                  rx="0.9"
                  fill="#3b82f6"
                />
                <rect
                  x="37.2"
                  y="49.5"
                  width="5"
                  height="5"
                  rx="0.9"
                  fill={talkPhase === 2 ? "#3b82f6" : talkPhase === 1 ? "#f97316" : "#3b82f6"}
                />
                {/* Row 3 Tiles */}
                <rect
                  x="25.8"
                  y="55.2"
                  width="5"
                  height="5"
                  rx="0.9"
                  fill={talkPhase === 2 ? "#facc15" : talkPhase === 1 ? "#ef4444" : "#f97316"}
                />
                <rect
                  x="31.5"
                  y="55.2"
                  width="5"
                  height="5"
                  rx="0.9"
                  fill="#facc15"
                />
                <rect
                  x="37.2"
                  y="55.2"
                  width="5"
                  height="5"
                  rx="0.9"
                  fill={talkPhase === 2 ? "#facc15" : talkPhase === 1 ? "#ffffff" : "#10b981"}
                />
              </g>
            )}

            {/* =========================================================== */}
            {/* CUBE HEAD SILHOUETTE (shifted to center x=12..56, y=8..40)   */}
            {/* =========================================================== */}
            <g transform="translate(12, 8)">
              {activeStyle === "pixel" ? (
                <g fill="#09090b">
                  <rect x="8" y="0" width="6" height="4" rx="1" />
                  <rect x="30" y="0" width="6" height="4" rx="1" />
                  <rect
                    x="4"
                    y="3"
                    width="36"
                    height="28"
                    rx="4"
                    stroke="#27272a"
                    strokeWidth="1.2"
                  />
                </g>
              ) : activeStyle === "bot" ? (
                <g>
                  <rect x="20.5" y="-1" width="3" height="5" rx="1.5" fill="#09090b" />
                  <circle cx="22" cy="-1.5" r="2" fill="#38bdf8" />
                  <rect x="1" y="12" width="3" height="10" rx="1.5" fill="#09090b" />
                  <rect x="40" y="12" width="3" height="10" rx="1.5" fill="#09090b" />
                  <rect
                    x="3.5"
                    y="3"
                    width="37"
                    height="29"
                    rx="11"
                    fill="#09090b"
                    stroke="#27272a"
                    strokeWidth="1.3"
                  />
                </g>
              ) : (
                /* Default 'cube': Pure Solid Black Rounded Cube Head + Top Cube Node */
                <g>
                  <rect
                    x="18.5"
                    y="-1.5"
                    width="7"
                    height="4.5"
                    rx="2"
                    fill="#09090b"
                    stroke="#27272a"
                    strokeWidth="1.1"
                  />
                  <circle
                    cx="22"
                    cy="0.5"
                    r="1.3"
                    fill={trick === "charge" ? "#10b981" : trick === "scan" ? "#38bdf8" : "#ffffff"}
                  />
                  <rect
                    x="2"
                    y="2"
                    width="40"
                    height="31"
                    rx="8.5"
                    fill="#09090b"
                    stroke="#27272a"
                    strokeWidth="1.3"
                  />
                </g>
              )}

              {/* Trick 10: Studio Over-Ear Headphones on Head ('headphones') */}
              {trick === "headphones" && (
                <g className="cube-prop-headphones">
                  {/* Curved Studio Headband Arch */}
                  <path
                    d="M 0.5 14 C 0.5 -5.5, 43.5 -5.5, 43.5 14"
                    stroke="#38bdf8"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <path
                    d="M 8 1 C 16 -3.2, 28 -3.2, 36 1"
                    stroke="#a855f7"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    fill="none"
                  />
                  {/* Left Cushioned Earcup */}
                  <rect
                    x="-4.2"
                    y="9.5"
                    width="6.8"
                    height="14.5"
                    rx="3.4"
                    fill="#09090b"
                    stroke="#38bdf8"
                    strokeWidth="1.6"
                  />
                  <rect
                    x="-2.2"
                    y="12.5"
                    width="2.4"
                    height="8.5"
                    rx="1.2"
                    fill={talkPhase === 1 ? "#10b981" : "#38bdf8"}
                  />
                  {/* Right Cushioned Earcup */}
                  <rect
                    x="41.4"
                    y="9.5"
                    width="6.8"
                    height="14.5"
                    rx="3.4"
                    fill="#09090b"
                    stroke="#38bdf8"
                    strokeWidth="1.6"
                  />
                  <rect
                    x="43.8"
                    y="12.5"
                    width="2.4"
                    height="8.5"
                    rx="1.2"
                    fill={talkPhase === 1 ? "#10b981" : "#38bdf8"}
                  />
                </g>
              )}

              {/* Moving Solid White Eyes & Smile */}
              <g
                style={{
                  transform: `translate(${gaze.x}px, ${gaze.y}px)`,
                  transition: "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
                <g
                  style={{
                    transformOrigin: "22px 15px",
                    transform: isBlinking && !isSleeping ? "scaleY(0.08)" : "scaleY(1)",
                    transition: "transform 110ms ease-in-out",
                  }}
                >
                  {isSleeping ? (
                    /* Trick 8: Peaceful Sleeping Downward Eye Arcs (︶ ︶) */
                    <g>
                      <path
                        d="M 11.5 14.5 Q 15.2 19.2 19.0 14.5"
                        stroke="#ffffff"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        fill="none"
                      />
                      <path
                        d="M 25.0 14.5 Q 28.8 19.2 32.5 14.5"
                        stroke="#ffffff"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        fill="none"
                      />
                    </g>
                  ) : showArcs ? (
                    /* Happy Laughing Eye Arcs (^ ^) */
                    <g>
                      <path
                        d="M 11.5 16.5 Q 15.2 11.2 19.0 16.5"
                        stroke="#ffffff"
                        strokeWidth="2.8"
                        strokeLinecap="round"
                        fill="none"
                      />
                      <path
                        d="M 25.0 16.5 Q 28.8 11.2 32.5 16.5"
                        stroke="#ffffff"
                        strokeWidth="2.8"
                        strokeLinecap="round"
                        fill="none"
                      />
                    </g>
                  ) : trick === "hoverboard" ? (
                    /* Cool Focused Squint Eyes when Gliding on Hoverboard */
                    <g>
                      <rect x="11.5" y="12.2" width="7" height="5.8" rx="2.4" fill="#ffffff" />
                      <rect x="25.5" y="12.2" width="7" height="5.8" rx="2.4" fill="#ffffff" />
                    </g>
                  ) : trick === "spy" ? (
                    /* Cute Detective Zoomed-In Eye + Curious Eye ('spy') */
                    <g>
                      <rect x="11.5" y="11" width="6.2" height="8.5" rx="3" fill="#ffffff" />
                      <circle
                        cx="29"
                        cy="14.8"
                        r="5.2"
                        fill="#ffffff"
                        stroke="#38bdf8"
                        strokeWidth="1.2"
                      />
                      <circle cx="29" cy="14.8" r="2.1" fill="#09090b" />
                      <circle cx="30" cy="13.8" r="0.9" fill="#ffffff" />
                    </g>
                  ) : (
                    /* Crisp Solid White Rounded Eyes */
                    <g>
                      <rect
                        x="11.8"
                        y="10"
                        width="6.4"
                        height={isWake ? "10.8" : "9.6"}
                        rx={activeStyle === "pixel" ? "1.5" : "3.2"}
                        fill="#ffffff"
                      />
                      <rect
                        x="25.8"
                        y="10"
                        width="6.4"
                        height={isWake ? "10.8" : "9.6"}
                        rx={activeStyle === "pixel" ? "1.5" : "3.2"}
                        fill="#ffffff"
                      />
                    </g>
                  )}
                </g>

                {/* Trick 5: Pixel "Deal With It" Sunglasses Overlay */}
                {trick === "shades" && (
                  <g className="cube-prop-shades">
                    {/* Bridge & Frame */}
                    <rect x="7" y="10.5" width="30" height="2.2" fill="#ffffff" />
                    {/* Left Lens */}
                    <rect
                      x="9"
                      y="10.5"
                      width="11.5"
                      height="8"
                      rx="1.5"
                      fill="#09090b"
                      stroke="#ffffff"
                      strokeWidth="1.6"
                    />
                    {/* Right Lens */}
                    <rect
                      x="23.5"
                      y="10.5"
                      width="11.5"
                      height="8"
                      rx="1.5"
                      fill="#09090b"
                      stroke="#ffffff"
                      strokeWidth="1.6"
                    />
                    {/* Lens Diagonal Shine Glint */}
                    <line
                      x1="11.5"
                      y1="16.8"
                      x2="15.5"
                      y2="12"
                      stroke="#38bdf8"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                    <line
                      x1="26"
                      y1="16.8"
                      x2="30"
                      y2="12"
                      stroke="#38bdf8"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </g>
                )}

                {/* Mouth Expression */}
                {isSleeping ? (
                  /* Peaceful sleeping 'o' mouth */
                  <circle cx="22" cy="24.5" r="2.1" fill="#ffffff" opacity="0.85" />
                ) : isWake ? (
                  /* Startled 'O' mouth */
                  <ellipse cx="22" cy="24.5" rx="3.2" ry="3.6" fill="#ffffff" />
                ) : (speaking && talkPhase === 1) || trick === "backflip" ? (
                  <path d="M 17.5 22.8 Q 22 28.8 26.5 22.8 Z" fill="#ffffff" />
                ) : speaking && talkPhase === 2 ? (
                  <rect
                    x="18.8"
                    y="22.4"
                    width="6.4"
                    height="4.0"
                    rx="2.0"
                    fill="#ffffff"
                  />
                ) : (
                  <path
                    d={
                      bigSmile || isHovered || trick === "dance" || trick === "shades"
                        ? "M 17.5 23.2 Q 22 27.6 26.5 23.2"
                        : "M 18.2 23.5 Q 22 26.5 25.8 23.5"
                    }
                    stroke="#ffffff"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    fill="none"
                  />
                )}
              </g>
            </g>
          </g>
        </g>

        {/* =============================================================== */}
        {/* FLOATING TRICK PARTICLES & PROPS (Outside rotating body rig)    */}
        {/* =============================================================== */}

        {/* Trick 1: Backflip Star Sparkles (✦) */}
        {trick === "backflip" && (
          <g className="cube-prop-sparkles">
            <path
              d="M 8 10 L 10 15 L 15 17 L 10 19 L 8 24 L 6 19 L 1 17 L 6 15 Z"
              fill="#facc15"
              className="cube-sparkle-1"
            />
            <path
              d="M 59 6 L 60.5 10 L 64.5 11.5 L 60.5 13 L 59 17 L 57.5 13 L 53.5 11.5 L 57.5 10 Z"
              fill="#38bdf8"
              className="cube-sparkle-2"
            />
            <circle cx="14" cy="4" r="2" fill="#10b981" className="cube-sparkle-2" />
          </g>
        )}

        {/* Trick 2 & 10: Floating Musical Notes (♪ ♫) during Dance Groove or Headphones Vibe */}
        {(trick === "dance" || trick === "headphones") && (
          <g className="cube-prop-music">
            <text
              x="4"
              y="18"
              fill="#38bdf8"
              fontSize="13"
              fontWeight="900"
              className="cube-float-item-1"
            >
              ♪
            </text>
            <text
              x="53"
              y="14"
              fill="#10b981"
              fontSize="14"
              fontWeight="900"
              className="cube-float-item-2"
            >
              ♫
            </text>
            <text
              x="28"
              y="3"
              fill={trick === "headphones" ? "#a855f7" : "#f59e0b"}
              fontSize="11.5"
              fontWeight="900"
              className="cube-float-item-3"
            >
              {trick === "headphones" ? "♬" : "♪"}
            </text>
          </g>
        )}

        {/* Trick 9: Rubik's Cube Solve Sparkles */}
        {trick === "rubiks" && talkPhase === 2 && (
          <g className="cube-prop-sparkles">
            <path
              d="M 12 44 L 13.5 47.5 L 17 49 L 13.5 50.5 L 12 54 L 10.5 50.5 L 7 49 L 10.5 47.5 Z"
              fill="#facc15"
              className="cube-sparkle-1"
            />
            <path
              d="M 56 42 L 57.2 45 L 60.2 46.2 L 57.2 47.4 L 56 50.4 L 54.8 47.4 L 51.8 46.2 L 54.8 45 Z"
              fill="#10b981"
              className="cube-sparkle-2"
            />
          </g>
        )}

        {/* Trick 4: Cozmo-Style Orbiting Mini-Cubes during Juggle */}
        {trick === "juggle" && (
          <g className="cube-prop-juggle">
            <rect
              x="8"
              y="26"
              width="8.5"
              height="8.5"
              rx="2"
              fill="#38bdf8"
              stroke="#ffffff"
              strokeWidth="1.2"
              className="cube-juggle-orb-1"
            />
            <rect
              x="51"
              y="26"
              width="8.5"
              height="8.5"
              rx="2"
              fill="#10b981"
              stroke="#ffffff"
              strokeWidth="1.2"
              className="cube-juggle-orb-2"
            />
            <rect
              x="29.5"
              y="4"
              width="8"
              height="8"
              rx="2"
              fill="#f59e0b"
              stroke="#ffffff"
              strokeWidth="1.2"
              className="cube-juggle-orb-3"
            />
          </g>
        )}

        {/* Trick 6: Supercharge Floating Lightning Badge */}
        {trick === "charge" && (
          <g className="cube-prop-charge">
            <g className="cube-float-item-1">
              <rect
                x="18"
                y="-8"
                width="32"
                height="13"
                rx="6.5"
                fill="#09090b"
                stroke="#10b981"
                strokeWidth="1.2"
              />
              <text
                x="34"
                y="1.5"
                textAnchor="middle"
                fill="#10b981"
                fontSize="8.5"
                fontWeight="900"
              >
                ⚡100%
              </text>
            </g>
          </g>
        )}

        {/* Trick 8: Floating Zzz Bubbles during Nap Mode */}
        {trick === "sleep" && (
          <g className="cube-prop-sleep">
            <text
              x="48"
              y="18"
              fill="#38bdf8"
              fontSize="10"
              fontWeight="900"
              className="cube-float-item-1"
            >
              z
            </text>
            <text
              x="54"
              y="9"
              fill="#60a5fa"
              fontSize="12"
              fontWeight="900"
              className="cube-float-item-2"
            >
              Z
            </text>
            <text
              x="60"
              y="-1"
              fill="#818cf8"
              fontSize="14"
              fontWeight="900"
              className="cube-float-item-3"
            >
              Z
            </text>
          </g>
        )}

        {/* Wake-Up Startle Exclamation (!) */}
        {trick === "wake" && (
          <g className="cube-prop-wake">
            <rect x="31.5" y="-11" width="5" height="9" rx="2.5" fill="#f59e0b" />
            <circle cx="34" cy="1.5" r="2.4" fill="#f59e0b" />
          </g>
        )}
      </svg>
    );
  }

  // =========================================================================
  // COMPACT HEAD ICON (for Topbar Button)
  // =========================================================================
  return (
    <svg
      ref={svgRef}
      viewBox="0 0 44 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`guide-bot-avatar select-none ${className}`}
      aria-hidden="true"
    >
      {activeStyle === "pixel" ? (
        <g fill="#09090b">
          <rect x="8" y="1" width="6" height="4" rx="1" />
          <rect x="30" y="1" width="6" height="4" rx="1" />
          <rect x="4" y="4" width="36" height="26" rx="4" stroke="#27272a" strokeWidth="1" />
          <rect x="10" y="30" width="6" height="4" rx="1" />
          <rect x="28" y="30" width="6" height="4" rx="1" />
        </g>
      ) : activeStyle === "bot" ? (
        <g>
          <rect x="20.5" y="1" width="3" height="4" rx="1.5" fill="#09090b" />
          <rect x="1" y="13" width="3" height="10" rx="1.5" fill="#09090b" />
          <rect x="40" y="13" width="3" height="10" rx="1.5" fill="#09090b" />
          <rect
            x="3.5"
            y="4"
            width="37"
            height="29"
            rx="11"
            fill="#09090b"
            stroke="#27272a"
            strokeWidth="1.2"
          />
        </g>
      ) : (
        <rect
          x="2"
          y="2.5"
          width="40"
          height="31"
          rx="8"
          fill="#09090b"
          stroke="#27272a"
          strokeWidth="1.2"
        />
      )}

      <g
        style={{
          transform: `translate(${gaze.x}px, ${gaze.y}px)`,
          transition: "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <g
          style={{
            transformOrigin: "22px 15px",
            transform: isBlinking ? "scaleY(0.08)" : "scaleY(1)",
            transition: "transform 110ms ease-in-out",
          }}
        >
          {showArcs ? (
            <g>
              <path
                d="M 11.5 16.5 Q 15.2 11.2 19.0 16.5"
                stroke="#ffffff"
                strokeWidth="2.8"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M 25.0 16.5 Q 28.8 11.2 32.5 16.5"
                stroke="#ffffff"
                strokeWidth="2.8"
                strokeLinecap="round"
                fill="none"
              />
            </g>
          ) : (
            <g>
              <rect
                x="11.8"
                y="10"
                width="6.4"
                height="9.6"
                rx={activeStyle === "pixel" ? "1.5" : "3.2"}
                fill="#ffffff"
              />
              <rect
                x="25.8"
                y="10"
                width="6.4"
                height="9.6"
                rx={activeStyle === "pixel" ? "1.5" : "3.2"}
                fill="#ffffff"
              />
            </g>
          )}
        </g>

        {speaking && talkPhase === 1 ? (
          <path d="M 17.5 22.8 Q 22 28.8 26.5 22.8 Z" fill="#ffffff" />
        ) : speaking && talkPhase === 2 ? (
          <rect
            x="18.8"
            y="22.4"
            width="6.4"
            height="4.0"
            rx="2.0"
            fill="#ffffff"
          />
        ) : (
          <path
            d={
              bigSmile || isHovered
                ? "M 17.5 23.2 Q 22 27.6 26.5 23.2"
                : "M 18.2 23.5 Q 22 26.5 25.8 23.5"
            }
            stroke="#ffffff"
            strokeWidth="2.4"
            strokeLinecap="round"
            fill="none"
          />
        )}
      </g>
    </svg>
  );
}

export function setGuideBotMascotStyle(style) {
  try {
    localStorage.setItem(MASCOT_STYLE_KEY, style);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("guide-bot-mascot-changed", { detail: style }));
}

export function getGuideBotMascotStyle() {
  try {
    return localStorage.getItem(MASCOT_STYLE_KEY) || "cube";
  } catch {
    return "cube";
  }
}

/**
 * Top Navigation Trigger Button for Guide Bot (English only, no Urdu).
 */
export function GuideBotTopbarButton({
  onClick,
  isOpen = false,
  compact = false,
}) {
  return (
    <button
      type="button"
      data-guide-bot-trigger="true"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-keyshortcuts="Alt+G"
      title="Guide Bot (Alt+G)"
      className="group relative inline-flex items-center justify-center gap-1.5 h-9 px-2 sm:px-2.5 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/90 text-slate-900 dark:text-slate-100 transition-all duration-150 cursor-pointer shrink-0 whitespace-nowrap shadow-2xs hover:shadow-sm active:scale-[0.98]"
    >
      {/* Cube Mascot Icon */}
      <span className="inline-flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105">
        <GuideBotAvatar className="w-7 h-[22px] sm:w-8 sm:h-[24px]" speaking={isOpen} fullBody={false} />
      </span>

      {/* English-Only Label */}
      {!compact && (
        <span className="hidden lg:inline text-xs font-extrabold tracking-tight">
          Guide Bot
        </span>
      )}

      <kbd className="hidden 2xl:inline-block px-1.5 py-0.5 text-[0.625rem] font-mono font-semibold rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 shrink-0">
        Alt+G
      </kbd>
    </button>
  );
}

