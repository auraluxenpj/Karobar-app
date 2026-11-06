import React from "react";

/**
 * Expressive SVG Mascot for the Dark / Light Mode Curtain Transition.
 * - Right arm (viewer's left) reaches up to grip the curtain cord tassel.
 * - Left arm (viewer's right) waves cheerfully at the user as the mascot rides the curtain.
 * - Outfit adapts subtly to the target mode:
 *   - 'to-dark': Cozy starry nightcap + midnight-indigo cape
 *   - 'to-light': Sunny golden crown-visor + warm amber-sky cape
 */
export default function MascotCharacter({ direction = "to-dark" }) {
  const isToDark = direction === "to-dark";

  return (
    <div className={`mascot-character mascot-character-${direction}`} aria-hidden="true">
      {/* Friendly floating wave badge */}
      <div className="mascot-wave-bubble">
        <span className="mascot-wave-text">{isToDark ? "Nighty night!" : "Rise & shine!"}</span>
      </div>

      <svg
        viewBox="0 0 160 175"
        className="mascot-svg"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Plush body gradient */}
          <radialGradient id="mascotBodyGrad" cx="42%" cy="35%" r="65%">
            <stop offset="0%" stopColor={isToDark ? "#e0e7ff" : "#fef9c3"} />
            <stop offset="55%" stopColor={isToDark ? "#a5b4fc" : "#fde047"} />
            <stop offset="100%" stopColor={isToDark ? "#6366f1" : "#f59e0b"} />
          </radialGradient>

          {/* Belly patch gradient */}
          <linearGradient id="mascotBellyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="100%" stopColor={isToDark ? "#e0e7ff" : "#fef3c7"} stopOpacity="0.88" />
          </linearGradient>

          {/* Cape / scarf gradient */}
          <linearGradient id="mascotCapeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={isToDark ? "#312e81" : "#f97316"} />
            <stop offset="100%" stopColor={isToDark ? "#4338ca" : "#eab308"} />
          </linearGradient>

          {/* Nightcap / Hat gradient */}
          <linearGradient id="mascotHatGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={isToDark ? "#1e1b4b" : "#f59e0b"} />
            <stop offset="60%" stopColor={isToDark ? "#3730a3" : "#fbbf24"} />
            <stop offset="100%" stopColor={isToDark ? "#6366f1" : "#fde68a"} />
          </linearGradient>

          {/* Golden star / pom glow */}
          <radialGradient id="mascotGlowGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="65%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#ca8a04" />
          </radialGradient>

          {/* Soft drop shadow */}
          <filter id="mascotShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#0f172a" floodOpacity="0.35" />
          </filter>
        </defs>

        <g filter="url(#mascotShadow)" className="mascot-body-rig">
          {/* Fluttering Cape behind body */}
          <path
            className="mascot-cape"
            d="M52 92 C34 108, 28 134, 40 144 C54 140, 68 142, 80 140 C92 142, 104 140, 116 144 C126 132, 122 108, 106 92 Z"
            fill="url(#mascotCapeGrad)"
          />

          {/* Left & Right Kicking Legs */}
          <g className="mascot-leg-left">
            <path
              d="M62 132 C60 144, 58 152, 55 157"
              stroke={isToDark ? "#4f46e5" : "#d97706"}
              strokeWidth="11"
              strokeLinecap="round"
            />
            <ellipse cx="53" cy="159" rx="9" ry="5.5" fill={isToDark ? "#1e1b4b" : "#92400e"} />
            <ellipse cx="51" cy="157.5" rx="4" ry="2" fill="#ffffff" fillOpacity="0.35" />
          </g>

          <g className="mascot-leg-right">
            <path
              d="M94 132 C96 144, 99 152, 102 157"
              stroke={isToDark ? "#4f46e5" : "#d97706"}
              strokeWidth="11"
              strokeLinecap="round"
            />
            <ellipse cx="104" cy="159" rx="9" ry="5.5" fill={isToDark ? "#1e1b4b" : "#92400e"} />
            <ellipse cx="102" cy="157.5" rx="4" ry="2" fill="#ffffff" fillOpacity="0.35" />
          </g>

          {/* Cord-Gripping Arm (viewer's left, reaching UP to the cord tassel at x=46, y=18) */}
          <g className="mascot-arm-grip">
            <path
              d="M54 88 C44 68, 43 44, 46 22"
              stroke="url(#mascotBodyGrad)"
              strokeWidth="12"
              strokeLinecap="round"
            />
            {/* Gripping paw/hand around the cord tassel */}
            <circle cx="46" cy="20" r="8" fill={isToDark ? "#c7d2fe" : "#fde047"} stroke={isToDark ? "#4338ca" : "#b45309"} strokeWidth="2" />
            <path
              d="M41 18 C44 15, 49 15, 51 18 M41 22 C44 20, 49 20, 51 22"
              stroke={isToDark ? "#312e81" : "#92400e"}
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </g>

          {/* Main Plush Torso & Head (chibi rounded bean shape) */}
          <path
            d="M44 78 C44 48, 60 36, 78 36 C96 36, 112 48, 112 78 C115 108, 106 138, 78 138 C50 138, 41 108, 44 78 Z"
            fill="url(#mascotBodyGrad)"
            stroke={isToDark ? "#4338ca" : "#d97706"}
            strokeWidth="2.2"
          />

          {/* Soft Belly Patch with theme emblem */}
          <ellipse cx="78" cy="112" rx="22" ry="18" fill="url(#mascotBellyGrad)" />
          {isToDark ? (
            /* Crescent moon emblem on belly */
            <path
              d="M82 104 A9 9 0 1 0 82 120 A7 7 0 1 1 82 104 Z"
              fill="#6366f1"
              opacity="0.85"
            />
          ) : (
            /* Little sun emblem on belly */
            <g opacity="0.9">
              <circle cx="78" cy="112" r="6" fill="#f59e0b" />
              <circle cx="78" cy="112" r="9" stroke="#fbbf24" strokeWidth="1.8" strokeDasharray="3 3" />
            </g>
          )}

          {/* Cute Little Ears */}
          <path
            d="M52 46 C44 33, 52 24, 63 38 Z"
            fill="url(#mascotBodyGrad)"
            stroke={isToDark ? "#4338ca" : "#d97706"}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M53 43 C49 35, 53 30, 59 38 Z" fill="#fda4af" opacity="0.75" />

          <path
            d="M104 46 C112 33, 104 24, 93 38 Z"
            fill="url(#mascotBodyGrad)"
            stroke={isToDark ? "#4338ca" : "#d97706"}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M103 43 C107 35, 103 30, 97 38 Z" fill="#fda4af" opacity="0.75" />

          {/* Cozy Scarf around neck */}
          <path
            d="M49 88 Q78 97 107 88 Q109 95 104 97 Q78 105 52 97 Q47 95 49 88 Z"
            fill={isToDark ? "#facc15" : "#2563eb"}
          />
          <path
            d="M88 94 C94 104, 98 114, 93 120 C88 118, 84 108, 83 96 Z"
            fill={isToDark ? "#eab308" : "#1d4ed8"}
          />

          {/* Face: Glossy Blinking Eyes, Eyebrows, Rosy Cheeks, Cheerful Smile */}
          <g className="mascot-face">
            {/* Eyebrows */}
            <path
              d="M59 57 Q64 53 69 56"
              stroke={isToDark ? "#1e1b4b" : "#78350f"}
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <path
              d="M87 56 Q92 53 97 57"
              stroke={isToDark ? "#1e1b4b" : "#78350f"}
              strokeWidth="2.4"
              strokeLinecap="round"
            />

            {/* Eyes (with blink animation) */}
            <g className="mascot-eyes">
              <ellipse cx="64" cy="66" rx="5.5" ry="6.5" fill="#0f172a" />
              <circle cx="62.2" cy="63.5" r="2.2" fill="#ffffff" />
              <circle cx="66" cy="68.5" r="1.1" fill="#ffffff" />

              <ellipse cx="92" cy="66" rx="5.5" ry="6.5" fill="#0f172a" />
              <circle cx="90.2" cy="63.5" r="2.2" fill="#ffffff" />
              <circle cx="94" cy="68.5" r="1.1" fill="#ffffff" />
            </g>

            {/* Rosy Cheeks */}
            <ellipse cx="55" cy="73" rx="5.5" ry="3.2" fill="#fb7185" opacity="0.65" />
            <ellipse cx="101" cy="73" rx="5.5" ry="3.2" fill="#fb7185" opacity="0.65" />

            {/* Happy Open Smile */}
            <path
              d="M70 73 Q78 83 86 73 Z"
              fill="#be123c"
              stroke={isToDark ? "#1e1b4b" : "#78350f"}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path d="M73 77 Q78 81 83 77" fill="#fda4af" />
          </g>

          {/* Nightcap (for Dark Mode) or Sunny Cap (for Light Mode) */}
          {isToDark ? (
            <g className="mascot-hat">
              {/* Fluffy hat brim */}
              <path
                d="M54 42 Q78 34 102 42 Q105 47 100 49 Q78 42 56 49 Q51 47 54 42 Z"
                fill="#f8fafc"
                stroke="#cbd5e1"
                strokeWidth="1.5"
              />
              {/* Curved sleepy nightcap cone */}
              <path
                d="M57 42 C62 20, 88 14, 114 26 C104 29, 98 35, 99 42 Z"
                fill="url(#mascotHatGrad)"
                stroke="#312e81"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              {/* Glowing Pom-Pom at tip of nightcap */}
              <circle cx="116" cy="27" r="6.5" fill="url(#mascotGlowGrad)" />
            </g>
          ) : (
            <g className="mascot-hat">
              {/* Sunny crown headband */}
              <path
                d="M58 41 L65 27 L73 36 L78 23 L83 36 L91 27 L98 41 Z"
                fill="url(#mascotGlowGrad)"
                stroke="#b45309"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </g>
          )}

          {/* WAVING ARM (viewer's right, waving enthusiastically at us!) */}
          <g className="mascot-arm-wave">
            <path
              d="M104 88 C118 82, 128 68, 134 52"
              stroke="url(#mascotBodyGrad)"
              strokeWidth="12"
              strokeLinecap="round"
            />
            {/* Open Waving Hand / Paw */}
            <circle
              cx="135"
              cy="49"
              r="8.5"
              fill={isToDark ? "#c7d2fe" : "#fde047"}
              stroke={isToDark ? "#4338ca" : "#b45309"}
              strokeWidth="2"
            />
            {/* Cute little fingers */}
            <path
              d="M130 42 L128 36 M135 40 L136 34 M140 42 L143 37"
              stroke={isToDark ? "#4338ca" : "#b45309"}
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            {/* Animated Wave Motion Arcs around the waving hand */}
            <path
              className="mascot-wave-arc mascot-wave-arc-1"
              d="M145 38 Q152 46 147 56"
              stroke="#facc15"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <path
              className="mascot-wave-arc mascot-wave-arc-2"
              d="M150 34 Q159 45 152 59"
              stroke="#fde08a"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
