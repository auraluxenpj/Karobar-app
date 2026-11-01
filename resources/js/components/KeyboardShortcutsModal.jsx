// src/components/KeyboardShortcutsModal.jsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  CommandLineIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  ShoppingCartIcon,
  ClipboardDocumentListIcon,
  BanknotesIcon,
  BuildingLibraryIcon,
  ArrowsUpDownIcon,
  KeyIcon,
} from "@heroicons/react/24/solid";
import { useTheme } from "@/context/ThemeContext.jsx";

const SHORTCUT_CATEGORIES = [
  {
    id: "global",
    name: "Global & Navigation",
    description: "Available from anywhere in the application",
    shortcuts: [
      {
        keys: ["Alt", "K"],
        label: "Go to Page (Quick Navigation)",
        description: "Search available pages and jump between modules with arrow keys and Enter",
        badge: "Everywhere",
      },
      {
        keys: ["Alt", "P"],
        label: "Product Catalog Search",
        description: "Instant product lookup by name across the entire software",
        badge: "Everywhere",
      },
      {
        keys: ["Alt", "G"],
        label: "Karobar Screen Guide Bot (EN / اردو)",
        description: "Open the screen-aware bilingual assistant that explains the active page in English and Urdu",
        badge: "Everywhere",
      },
      {
        keys: ["?"],
        label: "Keyboard Shortcuts Guide",
        description: "Open this keyboard shortcuts quick reference modal",
        badge: "Everywhere",
      },
      {
        keys: ["Alt", "1"],
        label: "New Purchase Invoice",
        description: "Open a new purchase invoice creation screen in a new tab",
      },
      {
        keys: ["Alt", "2"],
        label: "New Retail Sale Invoice",
        description: "Open high-speed Retail POS sale invoice in a new tab",
      },
      {
        keys: ["Alt", "W"],
        label: "New Wholesale Sale Invoice",
        description: "Open B2B wholesale sale invoice in a new tab",
      },
      {
        keys: ["Alt", "D"],
        label: "Cash Drawer Shift Register",
        description: "Open cash drawer shift status, cash in/out, and float reconciliation",
      },
      {
        keys: ["Alt", "A"],
        label: "Financial Accounts Register",
        description: "View liquid balances across all Pakistani banks, wallets, and cash in drawer",
      },
    ],
  },
  {
    id: "invoicing",
    name: "Invoicing & Fast Billing",
    description: "Speed up checkout and billing workflows in sale and purchase invoices",
    shortcuts: [
      {
        keys: ["Ctrl", "Enter"],
        altKeys: ["F9"],
        label: "Quick Save / Finalize Invoice",
        description: "Submit and complete the current invoice without reaching for the mouse",
        badge: "Fast Checkout",
      },
      {
        keys: ["Alt", "C"],
        label: "Focus Customer Search",
        description: "Instantly focus customer selector dropdown on sale invoices",
      },
      {
        keys: ["Alt", "S"],
        label: "Focus Supplier Search",
        description: "Instantly focus supplier selector dropdown on purchase invoices",
      },
      {
        keys: ["Alt", "H"],
        label: "Hold & Recall Invoices",
        description: "Park current invoice or recall previously held customer carts",
      },
      {
        keys: ["Alt", "N"],
        label: "Add Product Line Row",
        description: "Insert a new product line row in the invoice items table",
      },
      {
        keys: ["Alt", "R"],
        label: "Toggle Retail / Wholesale",
        description: "Switch pricing mode between retail price and wholesale tiered rate",
      },
      {
        keys: ["Alt", "M"],
        label: "Payment Method / Account",
        description: "Focus payment method selector (Cash Drawer, Bank, EasyPaisa, etc.)",
      },
    ],
  },
  {
    id: "tables",
    name: "Grids, Dropdowns & Modals",
    description: "Effortless hands-free navigation across controls and dialogs",
    shortcuts: [
      {
        keys: ["↑", "↓"],
        label: "Navigate Rows & Dropdowns",
        description: "Move selection highlight up or down in product search and menus",
      },
      {
        keys: ["Enter"],
        label: "Confirm / Next Field",
        description: "Pick highlighted search result or advance to the next entry field",
      },
      {
        keys: ["Esc"],
        label: "Close Modal / Cancel",
        description: "Dismiss any open modal or dropdown (or click outside on backdrop)",
        badge: "Dismiss",
      },
      {
        keys: ["Tab"],
        altKeys: ["Shift", "Tab"],
        label: "Cycle Fields",
        description: "Move keyboard focus sequentially between input fields",
      },
    ],
  },
];

function KeyCap({ keyStr }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[26px] h-6 px-1.5 py-0.5 text-[11px] font-mono font-bold tracking-tight rounded-md shadow-xs bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 select-none">
      {keyStr}
    </kbd>
  );
}

function ShortcutItem({ item }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-slate-100">
            {item.label}
          </span>
          {item.badge && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              {item.badge}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1 sm:line-clamp-none">
          {item.description}
        </p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-center">
        <div className="flex items-center gap-1">
          {item.keys.map((k, i) => (
            <React.Fragment key={k}>
              {i > 0 && <span className="text-xs text-slate-400 font-bold">+</span>}
              <KeyCap keyStr={k} />
            </React.Fragment>
          ))}
        </div>

        {item.altKeys && (
          <>
            <span className="text-[11px] text-slate-400 font-medium px-0.5">or</span>
            <div className="flex items-center gap-1">
              {item.altKeys.map((k, i) => (
                <React.Fragment key={k}>
                  {i > 0 && <span className="text-xs text-slate-400 font-bold">+</span>}
                  <KeyCap keyStr={k} />
                </React.Fragment>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function KeyboardShortcutsModal({ isOpen, onClose }) {
  const { isDark, theme } = useTheme();
  const [filterQuery, setFilterQuery] = useState("");
  const mouseDownRef = useRef(null);
  const searchInputRef = useRef(null);

  // Focus filter input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 60);
    } else {
      setFilterQuery("");
    }
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose && onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Filter shortcuts
  const filteredCategories = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return SHORTCUT_CATEGORIES;

    return SHORTCUT_CATEGORIES.map((cat) => {
      const filtered = cat.shortcuts.filter((s) => {
        const text = `${s.label} ${s.description} ${s.keys.join(" ")} ${
          s.altKeys ? s.altKeys.join(" ") : ""
        }`.toLowerCase();
        return text.includes(q);
      });
      return { ...cat, shortcuts: filtered };
    }).filter((cat) => cat.shortcuts.length > 0);
  }, [filterQuery]);

  if (!isOpen) return null;

  return (
    <div
      onMouseDown={(e) => {
        mouseDownRef.current = e.target;
      }}
      onClick={(e) => {
        // Outside click handler
        if (e.target === e.currentTarget && mouseDownRef.current === e.currentTarget) {
          onClose && onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 cursor-default"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-3xl max-h-[90dvh] flex flex-col rounded-2xl shadow-2xl border transition-all duration-200 overflow-hidden ${
          isDark
            ? "bg-slate-900 border-slate-700/80 text-slate-100"
            : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
            isDark ? "border-slate-800 bg-slate-900/80" : "border-slate-100 bg-slate-50/70"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2.5 rounded-xl text-white shadow-md"
              style={{
                backgroundColor: theme?.primary_color || "#3b82f6",
              }}
            >
              <CommandLineIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold">Keyboard Shortcuts</h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  Quick Access
                </span>
              </div>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Work at lightning speed without lifting your hands from the keyboard
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Bar */}
        <div
          className={`px-6 py-3 border-b flex items-center gap-3 ${
            isDark ? "border-slate-800 bg-slate-800/30" : "border-slate-100 bg-slate-50/30"
          }`}
        >
          <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Search shortcuts (e.g. invoice, product, drawer)..."
            className="flex-1 bg-transparent text-base sm:text-sm font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          {filterQuery && (
            <button
              type="button"
              onClick={() => {
                setFilterQuery("");
                searchInputRef.current?.focus();
              }}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              Clear
            </button>
          )}
        </div>

        {/* Shortcuts List Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {filteredCategories.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <KeyIcon className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-medium">No shortcuts matching "{filterQuery}"</p>
              <button
                type="button"
                onClick={() => setFilterQuery("")}
                className="mt-3 text-xs font-semibold text-blue-500 hover:underline"
              >
                View all shortcuts
              </button>
            </div>
          ) : (
            filteredCategories.map((cat) => (
              <div key={cat.id} className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {cat.name}
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {cat.shortcuts.length} shortcuts
                  </span>
                </div>
                <div className="space-y-1.5">
                  {cat.shortcuts.map((s) => (
                    <ShortcutItem key={s.label} item={s} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Note */}
        <div
          className={`px-6 py-3 border-t flex flex-wrap items-center justify-between gap-2 shrink-0 ${
            isDark ? "border-slate-800 bg-slate-900/60" : "border-slate-100 bg-slate-50/50"
          }`}
        >
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <SparklesIcon className="w-3.5 h-3.5 text-amber-500" />
            <span>Click anywhere outside or press <kbd className="px-1 py-0.5 text-[10px] font-mono font-bold bg-slate-200 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-300">Esc</kbd> to close any modal</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

