// src/components/ProductSearch.jsx
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
} from "@heroicons/react/24/solid";
import { GlassCard, GlassInput, GlassToolbar, GlassBtn } from "@/components/glass";

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
        "px-3 py-2 transition-all duration-150 cursor-pointer border-b border-slate-100 dark:border-slate-700/50 last:border-0",
        active 
          ? "bg-linear-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/20" 
          : "hover:bg-slate-50 dark:hover:bg-slate-700/30",
      ].join(" ")}
      title="Open product"
      aria-label="Open product"
    >
      <div className="flex items-center gap-3">
        {/* Product Info - No image in list */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="font-medium text-slate-800 dark:text-slate-100 text-sm truncate">
            {p.name || "—"}
          </div>
          {p.formulation && (
            <div className="text-[11px] font-medium text-blue-600 dark:text-blue-400 truncate">
              {p.formulation}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {p.brand?.name && (
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-600 px-1.5 py-0.5 rounded-full">
                <TagIcon className="w-2.5 h-2.5" />
                {p.brand.name}
              </span>
            )}
            {p.category?.name && (
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-full">
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
            {p.supplier?.name && (
              <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[100px]">
                {p.supplier.name}
              </span>
            )}
          </div>
        </div>
        
        {/* Price */}
        <div className="shrink-0 text-right space-y-0.5">
          <div className="px-2 py-0.5 rounded-sm bg-emerald-100 dark:bg-emerald-900/40">
            <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
              {fmtMoney(p.pack_sale_price)}
            </div>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            {fmtMoney(p.pack_purchase_price)}
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
      <div className="hidden md:flex items-center justify-center h-full bg-white dark:bg-slate-800">
        <div className="flex flex-col items-center gap-2">
          <ArrowPathIcon className="w-6 h-6 animate-spin text-blue-500" />
          <span className="text-xs text-slate-500">Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="hidden md:flex items-center justify-center h-full bg-white dark:bg-slate-800">
        <div className="flex flex-col items-center gap-2 text-rose-500">
          <ExclamationTriangleIcon className="w-6 h-6" />
          <span className="text-xs">{error}</span>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="hidden md:flex items-center justify-center h-full bg-white dark:bg-slate-800">
        <div className="flex flex-col items-center gap-2 text-slate-400">
          <PhotoIcon className="w-8 h-8" />
          <span className="text-xs">Hover to preview</span>
        </div>
      </div>
    );
  }

  return (
    <div className="hidden md:block border-l border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 h-full">
      <div className="p-3 space-y-3">
        {/* Header with image */}
        <div className="flex items-start gap-3">
          <div className="w-16 h-16 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700 shrink-0 shadow-xs">
            {detail.image ? (
              <img
                src={detail.image.startsWith("http") ? detail.image : `/storage/${detail.image}`}
                alt={detail.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full grid place-items-center text-slate-400">
                <Squares2X2Icon className="w-6 h-6" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm leading-tight">
              {detail.name}
            </h3>
            {detail.formulation && (
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                {detail.formulation}
              </p>
            )}
          </div>
        </div>

        {/* Pricing */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-lg bg-linear-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-800/20 border border-emerald-200 dark:border-emerald-800">
            <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 block">Sale</span>
            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
              {fmtMoney(detail.pack_sale_price)}
            </span>
          </div>
          <div className="p-2 rounded-lg bg-linear-to-br from-amber-50 to-amber-100 dark:from-amber-900/30 dark:to-amber-800/20 border border-amber-200 dark:border-amber-800">
            <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 block">Purchase</span>
            <span className="text-sm font-bold text-amber-700 dark:text-amber-300">
              {fmtMoney(detail.pack_purchase_price)}
            </span>
          </div>
        </div>

        {/* Details grid */}
        <div className="space-y-1">
          {detail.category?.name && (
            <div className="flex items-center justify-between p-1.5 rounded-sm bg-slate-50 dark:bg-slate-700/50">
              <span className="text-[10px] text-slate-500 dark:text-slate-400">Category</span>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{detail.category.name}</span>
            </div>
          )}
          {detail.brand?.name && (
            <div className="flex items-center justify-between p-1.5 rounded-sm bg-slate-50 dark:bg-slate-700/50">
              <span className="text-[10px] text-slate-500 dark:text-slate-400">Brand</span>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{detail.brand.name}</span>
            </div>
          )}
          {detail.supplier?.name && (
            <div className="flex items-center justify-between p-1.5 rounded-sm bg-slate-50 dark:bg-slate-700/50">
              <span className="text-[10px] text-slate-500 dark:text-slate-400">Supplier</span>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate max-w-[120px]">{detail.supplier.name}</span>
            </div>
          )}
          {detail.pack_size != null && (
            <div className="flex items-center justify-between p-1.5 rounded-sm bg-slate-50 dark:bg-slate-700/50">
              <span className="text-[10px] text-slate-500 dark:text-slate-400">Pack Size</span>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{detail.pack_size}</span>
            </div>
          )}
        </div>

        {/* Action button */}
        <button
          onClick={onOpen}
          className="theme-btn-primary w-full py-2 px-3 text-xs font-medium flex items-center justify-center gap-1.5"
        >
          <ArrowTopRightOnSquareIcon className="w-4 h-4" />
          Open Details
        </button>
      </div>
    </div>
  );
}

/* ─────────────── Main ─────────────── */
export default function ProductSearch({ navigationStyle = "sidebar" }) {
  const [q, setQ] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [activeIdx, setActiveIdx] = useState(-1);

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const inputRef = useRef(null);
  const boxRef = useRef(null);
  const abortRef = useRef(null);
  const debounceRef = useRef(null);

  // Focus shortcut: Ctrl+/
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === "/" || e.code === "Slash")) {
        e.preventDefault();
        inputRef.current?.focus();
        setPanelOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close on outside / Esc
  useEffect(() => {
    const onDoc = (e) => {
      if (!panelOpen) return;
      if (boxRef.current && !boxRef.current.contains(e.target)) setPanelOpen(false);
    };
    const onEsc = (e) => e.key === "Escape" && setPanelOpen(false);
    window.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onEsc);
    };
  }, [panelOpen]);

  // Debounced search
  useEffect(() => {
    if (!panelOpen) return;
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
    }, 220);

    return () => clearTimeout(debounceRef.current);
  }, [q, panelOpen]);

  // Fetch detail for active item
  useEffect(() => {
    const active = results[activeIdx];
    if (!panelOpen || !active) {
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
  }, [activeIdx, results, panelOpen]);

  const onOpen = (id) =>
    window.open(`/products/${id}/edit`, "_blank", "noopener,noreferrer");

  const onKeyDown = (e) => {
    if (!panelOpen) return;
    if (["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"].includes(e.key))
      e.preventDefault();
    if (e.key === "ArrowDown")
      setActiveIdx((i) => Math.min((results.length || 1) - 1, i + 1));
    else if (e.key === "ArrowUp") setActiveIdx((i) => Math.max(0, i - 1));
    else if (e.key === "Enter") results[activeIdx] && onOpen(results[activeIdx].id);
    else if (e.key === "Escape") setPanelOpen(false);
  };

  return (
    <div className={`relative z-35 max-w-[calc(100vw-2rem)] ${navigationStyle === 'topbar' ? 'z-1000000' : ''}`} ref={boxRef}>
      {/* Search bar */}
      <div
          className={[
            "flex items-center gap-2 rounded-lg px-3 h-9 w-full",
            navigationStyle === 'topbar' ? "max-w-2xl" : "max-w-[320px]",
            "bg-white dark:bg-slate-700 ring-1 ring-slate-200 dark:ring-slate-600 shadow-xs",
            "transition-all",
          ].join(" ")}
      >
        <MagnifyingGlassIcon className="w-4 h-4 text-slate-400" />
        <GlassInput
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (!panelOpen) setPanelOpen(true);
          }}
          onFocus={() => setPanelOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search products..."
          className="w-full bg-transparent border-0 ring-0 focus:ring-0 focus:border-0 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm text-slate-900 dark:text-slate-100"
          title="Search products (Ctrl+/)"
          aria-label="Search products"
        />
        {loading ? (
          <ArrowPathIcon className="w-4 h-4 animate-spin text-slate-400" />
        ) : q ? (
          <button
            onClick={() => {
              setQ("");
              setResults([]);
              setActiveIdx(-1);
              setDetail(null);
            }}
            className="p-1 rounded-sm hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
            title="Clear search"
          >
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : (
          <kbd className="text-[10px] border border-slate-200 dark:border-slate-600 rounded-sm px-1.5 py-0.5 bg-slate-50 dark:bg-slate-600 text-slate-500 dark:text-slate-400 font-mono">
            Ctrl+/
          </kbd>
        )}
      </div>

      {/* Results panel */}
      {panelOpen && (
        <div className={`absolute left-0 mt-2 w-[700px] max-w-[calc(100vw-2rem)] ${navigationStyle === 'topbar' ? 'z-1000001' : ''}`}>
          <GlassCard className="overflow-hidden bg-white dark:bg-slate-800 shadow-2xl ring-1 ring-slate-200/50 dark:ring-slate-700/50">

            {/* Toolbar */}
            <GlassToolbar className="items-center justify-between py-2 px-4 bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-700">
              <div className="text-xs text-slate-600 dark:text-slate-300">
                {q ? (
                  <>
                    <span className="font-bold">{results.length}</span> for <span className="font-medium">"{q}"</span>
                  </>
                ) : (
                  <>Type to search...</>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <span className="hidden sm:flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded-sm border border-slate-200 dark:border-slate-600 text-[9px]">↑↓</kbd></span>
                <span className="hidden sm:flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded-sm border border-slate-200 dark:border-slate-600 text-[9px]">↵</kbd></span>
                <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded-sm border border-slate-200 dark:border-slate-600 text-[9px]">Esc</kbd></span>
              </div>
            </GlassToolbar>

            {/* Results grid */}
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)] max-h-[60vh]">
              {/* Results list */}
              <div className="overflow-y-auto bg-white dark:bg-slate-800 max-h-[60vh]">
                {loading && (
                  <div className="flex items-center justify-center py-8">
                    <div className="flex flex-col items-center gap-2">
                      <ArrowPathIcon className="w-6 h-6 animate-spin text-blue-500" />
                      <span className="text-xs text-slate-500">Searching...</span>
                    </div>
                  </div>
                )}
                {!loading && q && results.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                    <ExclamationTriangleIcon className="w-8 h-8 mb-2" />
                    <span className="text-sm">No products found</span>
                  </div>
                )}
                <ul role="list" className="divide-y divide-slate-100 dark:divide-slate-700/50">
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

              {/* Detail pane */}
              <DetailPane
                detail={detail}
                loading={detailLoading}
                error={detailError}
                onOpen={() => detail && onOpen(detail.id)}
              />
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}

