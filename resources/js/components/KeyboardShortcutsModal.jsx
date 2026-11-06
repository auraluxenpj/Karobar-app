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
    name: "Global & Quick Navigation",
    description: "Available from anywhere in the Windows desktop application",
    shortcuts: [
      {
        keys: ["Ctrl", "K"],
        label: "Go to Page (Quick Navigation)",
        description: "Search available pages and jump between modules with arrow keys and Enter",
        badge: "Everywhere",
      },
      {
        keys: ["Ctrl", "P"],
        label: "Product Catalog Search",
        description: "Instant product lookup by name, salt, or batch across the software (when not on a printable view)",
        badge: "Everywhere",
      },
      {
        keys: ["Ctrl", "/"],
        label: "Focus Product Search Input",
        description: "Focus the inline product search input bar from anywhere on the screen",
      },
      {
        keys: ["Ctrl", "G"],
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
        keys: ["Ctrl", "1"],
        label: "New Purchase Invoice",
        description: "Open a new Purchase Invoice (GRN) creation screen",
      },
      {
        keys: ["Ctrl", "2"],
        label: "New Retail Sale Invoice",
        description: "Open a new Retail POS Sale Invoice creation screen",
      },
      {
        keys: ["Ctrl", "3"],
        altKeys: ["Ctrl", "W"],
        label: "New Wholesale Sale Invoice",
        description: "Open a new B2B Wholesale Sale Invoice creation screen",
      },
      {
        keys: ["Ctrl", "D"],
        label: "Cash Drawer Shift Register",
        description: "Open cash drawer shift status, cash in/out, and float reconciliation modal",
      },
      {
        keys: ["Ctrl", "A"],
        label: "Financial Accounts Register",
        description: "View liquid balances across all Pakistani banks, wallets, and cash in drawer (when not typing in an input)",
      },
      {
        keys: ["Ctrl", "R"],
        label: "Refresh Dashboard / Expiry / Batches",
        description: "Reload live metrics and data on Dashboard, Batch Expiry Radar, and Product Batch Workbench",
      },
      {
        keys: ["Ctrl", "Shift", "H"],
        label: "Focus Main Dashboard View",
        description: "Return focus to the main Karobar Dashboard workspace",
      },
      {
        keys: ["Ctrl", "Shift", "R"],
        label: "Reload Desktop Application",
        description: "Perform a clean reload of the desktop application window",
      },
    ],
  },
  {
    id: "invoicing",
    name: "Invoicing, Returns & Held Drafts",
    description: "Speed up checkout, billing, and return workflows in Sale and Purchase forms",
    shortcuts: [
      {
        keys: ["Ctrl", "S"],
        altKeys: ["F9"],
        label: "Quick Save / Finalize Invoice",
        description: "Submit and complete the current Sale Invoice, Purchase Invoice, Return, or Purchase Order (also Ctrl + Enter)",
        badge: "Fast Checkout",
      },
      {
        keys: ["Ctrl", "T"],
        label: "Toggle Debit (Cash) / Credit (Udhar)",
        description: "Switch invoice settlement mode between immediate Cash (Debit) and Party Ledger (Credit)",
        badge: "Billing",
      },
      {
        keys: ["Ctrl", "H"],
        label: "Quick-Hold Current Invoice Draft",
        description: "Park the active invoice into Held Drafts and start a fresh invoice immediately",
      },
      {
        keys: ["Ctrl", "D"],
        label: "Open Held / Auto-Saved Drafts",
        description: "View, resume, or manage parked and auto-saved draft invoices",
      },
      {
        keys: ["Ctrl", "N"],
        label: "Start New Blank Invoice / Add Row",
        description: "Start a fresh blank invoice (or insert a new product line row when editing / on Return forms)",
      },
      {
        keys: ["Ctrl", "C"],
        label: "Focus Customer / Supplier Search",
        description: "Open the Customer or Supplier search modal when no text is selected",
      },
      {
        keys: ["Ctrl", "M"],
        label: "Focus Payment Method / Account",
        description: "Focus payment method selector (Cash Drawer, Bank, EasyPaisa, etc.)",
      },
      {
        keys: ["Ctrl", "R"],
        label: "Toggle Retail / Wholesale Pricing",
        description: "Switch sale invoice creation between Retail and Wholesale mode",
      },
    ],
  },
  {
    id: "pos",
    name: "High-Speed Barcode POS",
    description: "Dedicated hotkeys for rapid counter checkout on the Barcode POS terminal",
    shortcuts: [
      {
        keys: ["F2"],
        label: "Focus Manual Barcode / SKU Input",
        description: "Jump cursor to the manual barcode entry box (or focus Product Selector on Batch Workbench)",
        badge: "POS",
      },
      {
        keys: ["F3"],
        label: "Focus Product Name / Salt Search",
        description: "Jump cursor to search medicines by brand name or generic formulation",
        badge: "POS",
      },
      {
        keys: ["F4"],
        altKeys: ["Ctrl", "S"],
        label: "Complete Sale & Print Receipt",
        description: "Finalize the POS cart and trigger thermal receipt printing (also F9 or Ctrl + Enter)",
        badge: "Fast Checkout",
      },
      {
        keys: ["Ctrl", "C"],
        label: "Exact Cash Received",
        description: "Fill 'Cash Given' with the exact Net Payable total when no text is selected",
      },
      {
        keys: ["F8"],
        altKeys: ["Ctrl", "H"],
        label: "Park (Hold) Current POS Cart",
        description: "Park the current customer's cart into the held queue and clear the counter for the next customer",
      },
    ],
  },
  {
    id: "views_masters",
    name: "Invoice View, Lists, Ledgers & Master Forms",
    description: "Document actions, printing, and CRUD shortcuts across lists, ledgers, and master forms",
    shortcuts: [
      {
        keys: ["Ctrl", "N"],
        label: "Create New Record / Invoice",
        description: "Open creation form on Products, Categories, Brands, Suppliers, Customers, Invoices, Returns, Stock Adjustments, Demands, Users & Roles",
        badge: "Lists & Views",
      },
      {
        keys: ["Ctrl", "S"],
        label: "Save Form / Record Ledger Entry",
        description: "Save changes on Product, Category, Brand, Supplier, Customer, Stock Adjustment, Demand, User, Role, Ledger & Settings screens",
        badge: "Forms",
      },
      {
        keys: ["Ctrl", "P"],
        label: "Print Invoice / Ledger / Forecast",
        description: "Print the active Sale Invoice, Purchase Invoice, Customer/Supplier Ledger statement, or Reorder Forecast",
        badge: "Print",
      },
      {
        keys: ["Ctrl", "F"],
        label: "Search & Jump to Another Invoice",
        description: "Focus the quick invoice lookup bar on Sale/Purchase Invoice view screens (or Product search on Batch Workbench)",
      },
      {
        keys: ["Ctrl", "E"],
        label: "Edit Current Invoice",
        description: "Open the currently viewed Sale or Purchase Invoice in Edit mode",
      },
      {
        keys: ["Ctrl", "D"],
        label: "Delete Current Invoice",
        description: "Prompt confirmation to delete the currently viewed Sale or Purchase Invoice",
      },
      {
        keys: ["Ctrl", "B"],
        label: "Go Back / Focus Batch Input",
        description: "Return to the list from Product or Demand forms, or focus Batch # input on the Product Batch Workbench",
      },
      {
        keys: ["Ctrl", "Enter"],
        label: "Generate Smart Reorder Forecast",
        description: "Calculate suggested reorder quantities on the Purchase Order Forecast screen",
      },
    ],
  },
  {
    id: "mdi_windows",
    name: "Desktop Multi-Window (MDI Sub-Windows)",
    description: "Manage floating sub-windows inside the Karobar Windows Desktop workspace",
    shortcuts: [
      {
        keys: ["Ctrl", "Shift", "N"],
        label: "Open Current Page in Sub-Window",
        description: "Open the currently active screen in a new floating MDI sub-window",
        badge: "Desktop MDI",
      },
      {
        keys: ["Ctrl", "Shift", "P"],
        label: "Quick Sub-Window: Barcode POS",
        description: "Launch High-Speed Barcode POS inside an independent floating sub-window",
        badge: "Desktop MDI",
      },
      {
        keys: ["Ctrl", "Shift", "S"],
        label: "Quick Sub-Window: Retail Sale Invoice",
        description: "Launch Create Retail Sale Invoice inside an independent floating sub-window",
        badge: "Desktop MDI",
      },
      {
        keys: ["Ctrl", "Shift", "W"],
        label: "Quick Sub-Window: Wholesale Sale Invoice",
        description: "Launch Create Wholesale Sale Invoice inside an independent floating sub-window",
        badge: "Desktop MDI",
      },
      {
        keys: ["Ctrl", "Shift", "U"],
        label: "Quick Sub-Window: Purchase Invoice",
        description: "Launch Create Purchase Invoice (GRN) inside an independent floating sub-window",
      },
      {
        keys: ["Ctrl", "Shift", "L"],
        label: "Quick Sub-Window: Customer Ledger",
        description: "Launch Customer Ledger (Khata) inside an independent floating sub-window",
      },
      {
        keys: ["Ctrl", "Shift", "D"],
        label: "Sale & Purchase Split Workspace",
        description: "Open dual side-by-side Retail Sale and Purchase Invoice sub-windows",
      },
      {
        keys: ["Ctrl", "Shift", "T"],
        label: "Tile Sub-Windows Side-by-Side",
        description: "Arrange open sub-windows side-by-side in a 2-column split layout",
      },
      {
        keys: ["Ctrl", "Shift", "G"],
        label: "Grid Sub-Windows (2×2 Quad View)",
        description: "Arrange open sub-windows into a 2×2 quad grid across the workspace",
      },
      {
        keys: ["Ctrl", "Shift", "C"],
        label: "Cascade Open Sub-Windows",
        description: "Arrange all open sub-windows in a clean diagonal cascade stack",
      },
      {
        keys: ["Ctrl", "Shift", "M"],
        label: "Minimize All Sub-Windows",
        description: "Minimize all open sub-windows to the bottom desktop taskbar",
      },
      {
        keys: ["Ctrl", "Shift", "X"],
        label: "Close All Sub-Windows",
        description: "Close all open floating sub-windows at once",
      },
    ],
  },
  {
    id: "tables",
    name: "Grids, Dropdowns & Modals",
    description: "Effortless hands-free navigation across table cells, controls, and dialogs",
    shortcuts: [
      {
        keys: ["↑", "↓"],
        label: "Navigate Rows & Dropdowns",
        description: "Move selection highlight up or down in product search, menus, and invoice table rows",
      },
      {
        keys: ["Enter"],
        label: "Confirm Selection / Next Field",
        description: "Pick highlighted search result or advance to the next column in invoice entry tables",
      },
      {
        keys: ["Esc"],
        label: "Close Modal / Dismiss Dropdown",
        description: "Dismiss any open modal, popup, or dropdown menu",
        badge: "Dismiss",
      },
      {
        keys: ["Tab"],
        altKeys: ["Shift", "Tab"],
        label: "Cycle Form Fields",
        description: "Move keyboard focus forward or backward sequentially between input fields",
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

