// src/components/ProductSearchModal.jsx
import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ArrowTopRightOnSquareIcon,
  PhotoIcon,
  TagIcon,
  FolderIcon,
  Squares2X2Icon,
  XMarkIcon,
  CubeIcon,
  BuildingStorefrontIcon,
} from "@heroicons/react/24/solid";
import { useCurrency } from "@/context/CurrencyContext.jsx";
import { useTheme } from "@/context/ThemeContext.jsx";

/* ─────────────── Helpers ─────────────── */
function fmtMoney(v) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return Number.isNaN(n)
    ? String(v)
    : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ─────────────── List Row ─────────────── */
function ResultRow({ p, active, onHover, onOpen }) {
  return (
    <li
      onMouseEnter={onHover}
      onClick={onOpen}
      className={[
        "px-4 py-2.5 transition-all duration-150 cursor-pointer border-b border-slate-100 dark:border-slate-800 last:border-0",
        active
          ? "bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100"
          : "hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-800 dark:text-slate-200",
      ].join(" ")}
      title="Click or press Enter to open"
      aria-label={`Product ${p.name}`}
    >
      <div className="flex items-center gap-3">
        {/* Product Info */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="font-bold text-sm leading-tight truncate">
            {p.name || "—"}
          </div>
          {p.formulation && (
            <div className="text-[11px] font-medium text-blue-600 dark:text-blue-400 truncate">
              {p.formulation}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {p.brand?.name && (
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-300 bg-slate-200/70 dark:bg-slate-700/70 px-1.5 py-0.5 rounded-full font-medium">
                <TagIcon className="w-2.5 h-2.5" />
                {p.brand.name}
              </span>
            )}
            {p.category?.name && (
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full font-medium">
                <FolderIcon className="w-2.5 h-2.5" />
                {p.category.name}
              </span>
            )}
            {p.rack && (
              <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">
                Rack: {p.rack}
              </span>
            )}
            {p.pack_size != null && (
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                Pack: {p.pack_size}
              </span>
            )}
            {p.barcode && (
              <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                {p.barcode}
              </span>
            )}
          </div>
        </div>

        {/* Pricing & Stock */}
        <div className="shrink-0 text-right space-y-0.5">
          <div className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-right">
            <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
              Rs. {fmtMoney(p.pack_sale_price)}
            </span>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            Cost: Rs. {fmtMoney(p.pack_purchase_price)}
          </div>
        </div>
      </div>
    </li>
  );
}

/* ─────────────── Detail Pane ─────────────── */
function DetailPane({ detail, loading, error, onOpen }) {
  if (loading) {
    return (
      <div className="hidden md:flex items-center justify-center h-full p-8 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex flex-col items-center gap-2 text-slate-400">
          <ArrowPathIcon className="w-6 h-6 animate-spin text-blue-500" />
          <span className="text-xs">Loading details...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="hidden md:flex items-center justify-center h-full p-8 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex flex-col items-center gap-2 text-rose-500">
          <ExclamationTriangleIcon className="w-6 h-6" />
          <span className="text-xs text-center">{error}</span>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="hidden md:flex items-center justify-center h-full p-8 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex flex-col items-center gap-2 text-slate-400 text-center">
          <PhotoIcon className="w-10 h-10 opacity-40" />
          <span className="text-xs">Select or hover a product to preview</span>
        </div>
      </div>
    );
  }

  const marginPct =
    Number(detail.pack_sale_price) > 0 && Number(detail.pack_purchase_price) > 0
      ? Math.round(
          ((Number(detail.pack_sale_price) - Number(detail.pack_purchase_price)) /
            Number(detail.pack_sale_price)) *
            100
        )
      : null;

  return (
    <div className="hidden md:flex flex-col justify-between border-l border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 h-full p-4 overflow-y-auto">
      <div className="space-y-3.5">
        {/* Header with image */}
        <div className="flex items-start gap-3">
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 shadow-xs flex items-center justify-center">
            {detail.image ? (
              <img
                src={detail.image.startsWith("http") ? detail.image : `/storage/${detail.image}`}
                alt={detail.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <CubeIcon className="w-8 h-8 text-slate-300 dark:text-slate-600" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-snug">
              {detail.name}
            </h3>
            {detail.formulation && (
              <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-0.5 line-clamp-2">
                {detail.formulation}
              </p>
            )}
            {detail.barcode && (
              <p className="text-[10px] font-mono text-slate-400 mt-0.5">
                Barcode: {detail.barcode}
              </p>
            )}
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
              Pack Sale
            </span>
            <span className="text-base font-black text-emerald-700 dark:text-emerald-300">
              Rs. {fmtMoney(detail.pack_sale_price)}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block">
              Pack Cost
            </span>
            <span className="text-base font-black text-amber-700 dark:text-amber-300">
              Rs. {fmtMoney(detail.pack_purchase_price)}
            </span>
          </div>
        </div>

        {/* Profit Margin Badge */}
        {marginPct !== null && (
          <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
            <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">Estimated Margin</span>
            <span className="font-bold text-blue-700 dark:text-blue-300">{marginPct}%</span>
          </div>
        )}

        {/* Meta details list */}
        <div className="space-y-1.5 text-xs">
          {detail.category?.name && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Category</span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">{detail.category.name}</span>
            </div>
          )}
          {detail.brand?.name && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Brand / Company</span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">{detail.brand.name}</span>
            </div>
          )}
          {detail.supplier?.name && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Supplier</span>
              <span className="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[140px]">
                {detail.supplier.name}
              </span>
            </div>
          )}
          {detail.pack_size != null && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Units Per Pack</span>
              <span className="font-semibold text-slate-700 dark:text-slate-200 font-mono">{detail.pack_size}</span>
            </div>
          )}
        </div>
      </div>

      {/* Action button */}
      <div className="pt-3">
        <button
          onClick={onOpen}
          className="w-full py-2.5 px-4 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all flex items-center justify-center gap-2"
        >
          <ArrowTopRightOnSquareIcon className="w-4 h-4" />
          Open Product Details
        </button>
      </div>
    </div>
  );
}

/* ─────────────── Main Modal Component ─────────────── */
export default function ProductSearchModal({ isOpen, onClose }) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [activeIdx, setActiveIdx] = useState(-1);

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const debounceRef = useRef(null);
  const mouseDownRef = useRef(null);

  // Auto focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  // Debounced live search
  useEffect(() => {
    if (!isOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      const term = q.trim();
      if (!term) {
        setResults([]);
        setActiveIdx(-1);
        setDetail(null);
        return;
      }

      setLoading(true);
      try {
        const res = await axios.get("/api/products/search", {
          params: { q: term, limit: 30 },
          signal,
        });
        const arr = Array.isArray(res.data) ? res.data : [];
        setResults(arr);
        setActiveIdx(arr.length ? 0 : -1);
      } catch (err) {
        if (!axios.isCancel(err)) console.error(err);
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => clearTimeout(debounceRef.current);
  }, [q, isOpen]);

  // Fetch detail for active item
  useEffect(() => {
    const active = results[activeIdx];
    if (!isOpen || !active) {
      setDetail(null);
      setDetailError("");
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError("");
    axios
      .get(`/api/products/${active.id}`)
      .then((r) => !cancelled && setDetail(r.data))
      .catch((e) => {
        if (!cancelled) {
          console.error(e);
          setDetail(null);
          setDetailError("Unable to load product detail.");
        }
      })
      .finally(() => !cancelled && setDetailLoading(false));
    return () => {
      cancelled = true;
    };
  }, [activeIdx, results, isOpen]);

  const onOpen = (id) => {
    window.open(`/products/${id}/edit`, "_blank", "noopener,noreferrer");
    onClose && onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose && onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min((results.length || 1) - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[activeIdx]) {
        onOpen(results[activeIdx].id);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onMouseDown={(e) => {
        mouseDownRef.current = e.target;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && mouseDownRef.current === e.currentTarget) {
          onClose && onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150 cursor-default"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl flex flex-col rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden animate-in zoom-in-95 duration-150 max-h-[85dvh]"
        onKeyDown={handleKeyDown}
      >
        {/* Top Search Header */}
        <div className="relative flex items-center px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <MagnifyingGlassIcon className="w-5 h-5 text-slate-400 shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products by name, generic/formula, barcode, brand, or supplier... (Ctrl+P)"
            className="flex-1 bg-transparent text-base sm:text-sm font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
            autoComplete="off"
            spellCheck="false"
          />

          <div className="flex items-center gap-2 shrink-0 ml-2">
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  inputRef.current?.focus();
                }}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Clear input"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}

            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-500">
              Esc
            </kbd>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Close modal"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar info bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-800/40 text-xs text-slate-500 dark:text-slate-400 shrink-0">
          <div>
            {q ? (
              <span>
                Found <strong className="text-slate-800 dark:text-slate-200">{results.length}</strong> matching products
              </span>
            ) : (
              <span>Type a keyword or scan barcode to search products catalog</span>
            )}
          </div>
          <div className="hidden sm:flex items-center gap-3 text-[11px]">
            <span>
              <kbd className="px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[10px] font-mono mr-1">
                ↑↓
              </kbd>
              Navigate
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[10px] font-mono mr-1">
                ↵
              </kbd>
              Open
            </span>
          </div>
        </div>

        {/* Content Body: Left Results List, Right Details Pane */}
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,340px)] min-h-[350px] max-h-[58dvh] overflow-hidden">
          {/* Left Results List */}
          <div className="overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {loading && (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                <ArrowPathIcon className="w-7 h-7 animate-spin text-blue-500" />
                <span className="text-xs">Searching inventory...</span>
              </div>
            )}

            {!loading && q && results.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2 text-center px-4">
                <ExclamationTriangleIcon className="w-8 h-8 text-amber-500/70" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  No products matched "{q}"
                </span>
                <span className="text-xs text-slate-400">
                  Check for typos or try searching by generic formula or barcode.
                </span>
              </div>
            )}

            {!loading && !q && results.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2 text-center px-4">
                <MagnifyingGlassIcon className="w-8 h-8 opacity-30" />
                <span className="text-xs text-slate-400">
                  Start typing to instantly search products, prices, and stock
                </span>
              </div>
            )}

            <ul role="list">
              {results.map((p, idx) => (
                <ResultRow
                  key={p.id}
                  p={p}
                  active={idx === activeIdx}
                  onHover={() => setActiveIdx(idx)}
                  onOpen={() => onOpen(p.id)}
                />
              ))}
            </ul>
          </div>

          {/* Right Details Pane */}
          <DetailPane
            detail={detail}
            loading={detailLoading}
            error={detailError}
            onOpen={() => detail && onOpen(detail.id)}
          />
        </div>
      </div>
    </div>
  );
}

