import React, {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  useMemo,
} from "react";
import axios from "axios";
import { createPortal } from "react-dom";
import {
  MagnifyingGlassIcon,
  CubeIcon,
  TagIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import { GlassToolbar } from "@/components/glass";

let sharedPrefsCache = null;
let sharedPrefsPromise = null;

function loadSharedModalPreferences() {
  if (sharedPrefsCache) return Promise.resolve(sharedPrefsCache);
  if (sharedPrefsPromise) return sharedPrefsPromise;
  sharedPrefsPromise = axios
    .get("/api/preferences")
    .then(({ data }) => {
      sharedPrefsCache = data?.preferences || {};
      sharedPrefsPromise = null;
      return sharedPrefsCache;
    })
    .catch(() => {
      sharedPrefsPromise = null;
      return {};
    });
  return sharedPrefsPromise;
}

const ProductSearchInput = forwardRef(
  ({ value, onChange, products, onRefreshProducts, onKeyDown: onKeyDownProp, className = "" }, ref) => {
    const [display, setDisplay] = useState("");
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [highlightIndex, setHighlightIndex] = useState(0);
    const [isInvalidInput, setIsInvalidInput] = useState(false);

const triggerRef = useRef(null);
    const searchRef = useRef(null);
    const listRef = useRef(null);
    const rowRefs = useRef([]);
    const modalRef = useRef(null);
    const dragRef = useRef({ isDragging: false, offsetX: 0, offsetY: 0 });
    const resizeRef = useRef(null);
    const [isResizing, setIsResizing] = useState(false);

const MIN_WIDTH = typeof window !== "undefined" && window.innerWidth < 1024
      ? Math.min(640, window.innerWidth - 16)
      : 640;
    const MIN_HEIGHT = typeof window !== "undefined" && window.innerWidth < 1024
      ? Math.min(420, window.innerHeight - 24)
      : 420;
    const PREF_KEY_POS = "productSearchModalPos";
    const PREF_KEY_SIZE = "productSearchModalSize";

    const [windowPos, setWindowPos] = useState(() => {
      const isCompact = typeof window !== "undefined" && window.innerWidth < 1024;
      const width = isCompact ? Math.min(960, window.innerWidth - 16) : 960;
      const height = isCompact ? Math.min(600, window.innerHeight - 24) : 600;
      return {
        x: Math.max(8, (window.innerWidth - width) / 2),
        y: Math.max(8, (window.innerHeight - height) / 2),
      };
    });
    const [windowSize, setWindowSize] = useState(() => {
      const isCompact = typeof window !== "undefined" && window.innerWidth < 1024;
      return {
        width: isCompact ? Math.min(960, window.innerWidth - 16) : 960,
        height: isCompact ? Math.min(600, window.innerHeight - 24) : 600,
      };
    });

    // Load saved modal size & position from DB preferences lazily when modal opens
    useEffect(() => {
      if (!isOpen) return undefined;
      let cancelled = false;
      loadSharedModalPreferences().then((prefs) => {
        if (cancelled || !prefs) return;
        const isCompact = typeof window !== "undefined" && window.innerWidth < 1024;
        const savedSize = prefs[PREF_KEY_SIZE];
        const savedPos = prefs[PREF_KEY_POS];
        if (savedSize && Number(savedSize.width) && Number(savedSize.height)) {
          const rawW = Math.max(MIN_WIDTH, Number(savedSize.width));
          const rawH = Math.max(MIN_HEIGHT, Number(savedSize.height));
          setWindowSize({
            width: isCompact ? Math.min(960, rawW, window.innerWidth - 16) : rawW,
            height: isCompact ? Math.min(600, rawH, window.innerHeight - 24) : rawH,
          });
        }
        if (savedPos && savedPos.x != null && savedPos.y != null) {
          setWindowPos({
            x: isCompact ? Math.max(8, Number(savedPos.x)) : Number(savedPos.x),
            y: isCompact ? Math.max(8, Number(savedPos.y)) : Number(savedPos.y),
          });
        }
      });
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // Persist size & position to DB on drag/resize end
    const savePreferences = async (overrides = {}) => {
      const nextPos = overrides.pos || windowPos;
      const nextSize = overrides.size || windowSize;
      if (sharedPrefsCache) {
        sharedPrefsCache[PREF_KEY_POS] = nextPos;
        sharedPrefsCache[PREF_KEY_SIZE] = nextSize;
      }
      try {
        await axios.put("/api/preferences", {
          preferences: {
            [PREF_KEY_POS]: nextPos,
            [PREF_KEY_SIZE]: nextSize,
          },
        });
      } catch (_) {
        /* ignore - non-critical */
      }
    };

    const didRefreshRef = useRef(false);
    const debounceRef = useRef(null);
    const [internalProducts, setInternalProducts] = useState(null);

    const effectiveRefreshProducts = useMemo(() => {
      if (typeof onRefreshProducts === "function") {
        return onRefreshProducts;
      }
      return async (q = "") => {
        try {
          const { data } = await axios.get("/api/products/search", {
            params: { q: q || "", limit: 200, _t: Date.now() },
            cache: false,
          });
          const list = Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data)
            ? data
            : [];
          setInternalProducts(list);
        } catch {
          // ignore
        }
      };
    }, [onRefreshProducts]);

    const items = useMemo(() => {
      if (typeof onRefreshProducts !== "function" && Array.isArray(internalProducts)) {
        return internalProducts;
      }
      if (Array.isArray(products)) return products;
      if (products && Array.isArray(products.data)) return products.data;
      return Array.isArray(internalProducts) ? internalProducts : [];
    }, [products, internalProducts, onRefreshProducts]);

    // Clear refs when results change
    useEffect(() => {
      rowRefs.current = [];
    }, [items.length]);

    useEffect(() => {
      if (highlightIndex >= items.length) setHighlightIndex(0);
    }, [items.length, highlightIndex]);

    // Sync display + selectedProduct from value (resolves fresh matching product from items)
    useEffect(() => {
      if (!value) {
        setDisplay("");
        setSelectedProduct(null);
        return;
      }
      const valId = typeof value === "object" ? value?.id : value;
      const matchingProduct = items.find((p) => String(p?.id) === String(valId));

      if (matchingProduct) {
        setDisplay(matchingProduct.name || "");
        setSelectedProduct(matchingProduct);
        return;
      }

      if (typeof value === "object") {
        const objName = value?.name || value?.product_name || "";
        setDisplay(objName);
        setSelectedProduct(value);
        return;
      }
      setDisplay(String(value));
    }, [value, items]);

    useImperativeHandle(ref, () => ({
      focus: () => triggerRef.current?.focus(),
      refresh: () => effectiveRefreshProducts?.(search),
      openMenu: () => openModal(),
      closeMenu: () => closeModal(),
    }));

    // Listen for global close event (e.g. when resuming invoice drafts)
    useEffect(() => {
      const handleClose = () => {
        setIsOpen(false);
      };
      window.addEventListener("product-search:close", handleClose);
      return () => window.removeEventListener("product-search:close", handleClose);
    }, []);

    const openModal = (seedChar) => {
      if (typeof window !== "undefined" && window.__isResumingInvoiceDraft) {
        return;
      }
      triggerRef.current?.blur?.();
      setIsOpen(true);
      setHighlightIndex(0);
      const initialSearch =
        typeof seedChar === "string" && seedChar.length === 1
          ? (search + seedChar).toLowerCase()
          : (display || "");
      setSearch(initialSearch);

      // Force fresh product fetch immediately upon opening modal
      if (effectiveRefreshProducts) {
        Promise.resolve(effectiveRefreshProducts(initialSearch)).catch(() => {});
      }
    };
    const closeModal = () => setIsOpen(false);

    useEffect(() => {
      if (!isOpen) return;
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => (document.body.style.overflow = prev);
    }, [isOpen]);

    useEffect(() => {
      if (!isOpen) return;
      setTimeout(() => {
        searchRef.current?.focus();
        searchRef.current?.select?.();
      }, 50);
    }, [isOpen]);

    // Fetch fresh product quantities when modal opens
    useEffect(() => {
      if (isOpen && effectiveRefreshProducts) {
        Promise.resolve(effectiveRefreshProducts(search)).catch(() => {});
      }
    }, [isOpen]);

    // Live inventory sync: re-fetch products when inventory changes across tabs or window regains focus
    useEffect(() => {
      if (!effectiveRefreshProducts) return undefined;
      const handler = () => {
        Promise.resolve(effectiveRefreshProducts(search)).catch(() => {});
      };
      window.addEventListener("product:created", handler);
      window.addEventListener("karobar:inventory-changed", handler);
      window.addEventListener("karobar:products-updated", handler);
      window.addEventListener("focus", handler);
      return () => {
        window.removeEventListener("product:created", handler);
        window.removeEventListener("karobar:inventory-changed", handler);
        window.removeEventListener("karobar:products-updated", handler);
        window.removeEventListener("focus", handler);
      };
    }, [effectiveRefreshProducts, search]);

    useEffect(() => {
      if (!effectiveRefreshProducts || !isOpen) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => effectiveRefreshProducts(search), 200);
      return () => clearTimeout(debounceRef.current);
    }, [search, effectiveRefreshProducts, isOpen]);

    // Local filter (matches product name only, in typing order / starts-with) — skip when modal is closed
    const filtered = useMemo(() => {
      if (!isOpen) return [];
      const q = (search || "").toLowerCase().trim();
      if (!q) return items;
      return items.filter((p) =>
        (p?.name ?? "").toString().toLowerCase().startsWith(q)
      );
    }, [isOpen, items, search]);

    // Infinite scroll
    useEffect(() => {
      const container = listRef.current;
      if (!container) return;
      const handleScroll = () => {
        if (
          container.scrollTop + container.clientHeight >=
          container.scrollHeight - 80
        ) {
          effectiveRefreshProducts?.(search);
        }
      };
      container.addEventListener("scroll", handleScroll);
      return () => container.removeEventListener("scroll", handleScroll);
    }, [effectiveRefreshProducts, search, isOpen]);

    const getPackSize = (p) => p?.pack_size ?? p?.packSize ?? p?.packsize ?? "";
    const getSupplierName = (p) => p?.supplier?.name || p?.supplier_name || "";
    const getBrandName = (p) => p?.brand?.name || p?.brand_name || "";
    const getQuantity = (p) =>
      p?.quantity ??
      p?.current_quantity ??
      p?.available_units ??
      p?.batches_sum_quantity ??
      null;
    const getMargin = (p) =>
      p?.margin ?? p?.margin_percentage ?? p?.marginPercent ?? null;
    const getAvgPrice = (p) =>
      p?.avg_price ?? p?.average_price ?? p?.avgPrice ?? null;

    const numFmt = (v) => {
      if (v === null || v === undefined || v === "") return "—";
      const n = Number(v);
      return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 3 }) : "—";
    };

    const handleSelect = (product) => {
      setDisplay(product?.name || "");
      setSelectedProduct(product);
      onChange?.(product);
      closeModal();
    };

    // Auto-scroll to active row
    useEffect(() => {
      if (!isOpen) return;
      if (highlightIndex < 0) return;
      const row = rowRefs.current[highlightIndex];
      if (row) row.scrollIntoView({ block: "nearest" });
    }, [highlightIndex, isOpen, filtered.length]);

    // Close on Escape
    useEffect(() => {
      if (!isOpen) return;
      const onEsc = (e) => {
        if (e.key === "Escape") closeModal();
      };
      window.addEventListener("keydown", onEsc);
      return () => window.removeEventListener("keydown", onEsc);
    }, [isOpen]);

    const handleModalKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((i) => (i < filtered.length - 1 ? i + 1 : i));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((i) => (i > 0 ? i - 1 : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[highlightIndex]) handleSelect(filtered[highlightIndex]);
      }
    };

    const handleSearchChange = (e) => {
      const val = e.target.value;
      const valid = /^[a-zA-Z0-9-.()/+%,&_:\s]*$/;
      if (!valid.test(val)) {
        setIsInvalidInput(true);
        setTimeout(() => setIsInvalidInput(false), 200);
        return;
      }
      setSearch(val);
      setHighlightIndex(0);
    };

    // ---------- Dragging ----------
    const startDrag = (e) => {
      if (!modalRef.current) return;
      dragRef.current = {
        isDragging: true,
        offsetX: e.clientX - windowPos.x,
        offsetY: e.clientY - windowPos.y,
      };
      document.addEventListener("mousemove", handleDrag);
      document.addEventListener("mouseup", stopDrag);
    };

    const handleDrag = (e) => {
      if (!dragRef.current.isDragging) return;
      setWindowPos({
        x: e.clientX - dragRef.current.offsetX,
        y: e.clientY - dragRef.current.offsetY,
      });
    };

const stopDrag = () => {
      dragRef.current.isDragging = false;
      document.removeEventListener("mousemove", handleDrag);
      document.removeEventListener("mouseup", stopDrag);
      // Persist final position to DB
      setWindowPos((prev) => {
        savePreferences({ pos: prev });
        return prev;
      });
    };

    // ---------- Resizing ----------
    const getResizeCursor = (direction) => {
      const cursors = {
        n: "ns-resize",
        s: "ns-resize",
        e: "ew-resize",
        w: "ew-resize",
        ne: "nesw-resize",
        sw: "nesw-resize",
        nw: "nwse-resize",
        se: "nwse-resize",
      };
      return cursors[direction] || "default";
    };

    const startResize = (e, direction) => {
      e.preventDefault();
      e.stopPropagation();
      if (!modalRef.current) return;

      const rect = modalRef.current.getBoundingClientRect();
      resizeRef.current = {
        direction,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: rect.width,
        startHeight: rect.height,
        startLeft: rect.left,
        startTop: rect.top,
      };
      setIsResizing(true);
      document.body.style.userSelect = "none";
      document.body.style.cursor = getResizeCursor(direction);
      document.addEventListener("mousemove", handleResize);
      document.addEventListener("mouseup", stopResize);
    };

    const handleResize = (e) => {
      const r = resizeRef.current;
      if (!r) return;

      const dx = e.clientX - r.startX;
      const dy = e.clientY - r.startY;

      let { width, height, left, top } = {
        width: r.startWidth,
        height: r.startHeight,
        left: r.startLeft,
        top: r.startTop,
      };

      const dir = r.direction;

      if (dir.includes("e")) {
        width = Math.max(MIN_WIDTH, r.startWidth + dx);
      }
      if (dir.includes("s")) {
        height = Math.max(MIN_HEIGHT, r.startHeight + dy);
      }
      if (dir.includes("w")) {
        width = Math.max(MIN_WIDTH, r.startWidth - dx);
        left = r.startLeft + (r.startWidth - width);
      }
      if (dir.includes("n")) {
        height = Math.max(MIN_HEIGHT, r.startHeight - dy);
        top = r.startTop + (r.startHeight - height);
      }

      setWindowSize({ width, height });
      setWindowPos({ x: left, y: top });
    };

const stopResize = () => {
      resizeRef.current = null;
      setIsResizing(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", handleResize);
      document.removeEventListener("mouseup", stopResize);
      // Persist final size & position to DB
      setWindowSize((prevSize) => {
        setWindowPos((prevPos) => {
          savePreferences({ size: prevSize, pos: prevPos });
          return prevPos;
        });
        return prevSize;
      });
    };

    const renderResizeHandle = (direction) => {
      const base = "absolute z-10001";
      const positionMap = {
        n: "top-0 left-0 w-full h-2 cursor-ns-resize",
        s: "bottom-0 left-0 w-full h-2 cursor-ns-resize",
        e: "top-0 right-0 w-2 h-full cursor-ew-resize",
        w: "top-0 left-0 w-2 h-full cursor-ew-resize",
        ne: "top-0 right-0 w-4 h-4 cursor-nesw-resize",
        nw: "top-0 left-0 w-4 h-4 cursor-nwse-resize",
        se: "bottom-0 right-0 w-4 h-4 cursor-nwse-resize",
        sw: "bottom-0 left-0 w-4 h-4 cursor-nesw-resize",
      };
      return (
        <div
          key={direction}
          className={`${base} ${positionMap[direction]}`}
          onMouseDown={(e) => startResize(e, direction)}
        />
      );
    };

    return (
      <>
{/* Trigger Input — shows selected product like other selects */}
        <div className="product-search-trigger relative w-full min-w-0">
          <input
            ref={triggerRef}
            type="text"
            size={1}
            value={display}
            readOnly
            placeholder="Search product…"
            className={`w-full min-w-0 h-7 text-xs px-2 rounded-md text-left truncate cursor-pointer transition-all border pr-5 ${className} ${
                selectedProduct
                  ? "border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 font-semibold"
                  : "border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
            } focus:outline-hidden focus:ring-2 focus:ring-blue-400/40`}
            title={selectedProduct?.name || "Search product…"}
            onFocus={() => openModal()}
            onClick={() => openModal()}
            onKeyDown={(e) => {
              if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
                e.preventDefault();
                openModal(e.key);
                return;
              }
              if (e.key === "Enter" || e.key === "ArrowDown") {
                e.preventDefault();
                openModal();
                return;
              }
              onKeyDownProp?.(e);
            }}
          />
          <CubeIcon
            className="w-3.5 h-3.5 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none shrink-0"
          />
        </div>

{/* Modal */}
        {isOpen &&
          createPortal(
            <div
              className="product-search-overlay fixed inset-0 z-10000"
              onKeyDown={handleModalKeyDown}
              onClick={(e) => {
                if (e.target === e.currentTarget) closeModal();
              }}
            >
              {/* Draggable + Resizable Dialog */}
              <div
                ref={modalRef}
                className="product-search-dialog absolute flex flex-col overflow-hidden"
                role="dialog" aria-modal="true" aria-label="Search products"
                style={{
                  left: `${typeof window !== "undefined" && window.innerWidth < 1024 ? Math.max(8, windowPos.x) : windowPos.x}px`,
                  top: `${typeof window !== "undefined" && window.innerWidth < 1024 ? Math.max(8, windowPos.y) : windowPos.y}px`,
                  width: `${typeof window !== "undefined" && window.innerWidth < 1024 ? Math.min(960, windowSize.width, window.innerWidth - 16) : windowSize.width}px`,
                  height: `${typeof window !== "undefined" && window.innerWidth < 1024 ? Math.min(600, windowSize.height, window.innerHeight - 24) : windowSize.height}px`,
                  minWidth: `${typeof window !== "undefined" && window.innerWidth < 1024 ? Math.min(640, window.innerWidth - 16) : MIN_WIDTH}px`,
                  minHeight: `${typeof window !== "undefined" && window.innerWidth < 1024 ? Math.min(420, window.innerHeight - 24) : MIN_HEIGHT}px`,
                  userSelect: isResizing ? "none" : undefined,
                }}
              >
                {/* Resize handles (all sides & corners) */}
                {["n", "s", "e", "w", "ne", "nw", "se", "sw"].map(renderResizeHandle)}

                {/* Header (Draggable) */}
                <div
                  className="product-search-header flex items-center gap-3 px-5 py-3 cursor-move select-none"
                  onMouseDown={startDrag}
                >
                  <MagnifyingGlassIcon className="w-5 h-5 text-slate-400 shrink-0" />
                  <input
                    ref={searchRef}
                    aria-label="Search by product name"
                    onMouseDown={(e) => e.stopPropagation()}
                    type="text"
                    value={search}
                    onChange={handleSearchChange}
                    placeholder="Search by product name..."
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className={`flex-1 bg-transparent border-0 outline-hidden placeholder:text-slate-400 dark:placeholder:text-slate-500 text-base sm:text-sm h-10 sm:h-9 text-slate-900 dark:text-slate-100 ${
                      isInvalidInput ? "animate-shake" : ""
                    }`}
                    autoFocus
                  />
                  <kbd className="text-[0.714em] border border-slate-200 dark:border-slate-600 rounded-sm px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-mono shrink-0">
                    Esc
                  </kbd>
                  <button
                    type="button"
                    className="px-2.5 py-1 rounded-xl text-xs font-bold border border-rose-300 dark:border-rose-800/80 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 hover:bg-rose-500 hover:text-white transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                    aria-label="Close product search"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={closeModal}
                  >
                    <XMarkIcon className="w-4 h-4" />
                    <span>Close</span>
                  </button>
                </div>

                  {/* Results table */}
                  {filtered.length === 0 ? (
                    <div className="product-search-empty flex flex-col items-center justify-center py-14">
                      <CubeIcon className="w-8 h-8 mb-2" />
                      <span className="text-[1em]">No products found</span>
                    </div>
                  ) : (
                    <div ref={listRef} className="product-search-results">
                      <table className="w-full border-collapse text-[0.857em]">
                        {/* Grouped header */}
<thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-600">
<tr>
<th rowSpan={2} className="bg-slate-200/80 dark:bg-slate-700 px-4 py-2 text-left font-bold text-slate-600 dark:text-slate-200 w-[240px]">Product</th>
                            <th rowSpan={2} className="px-3 py-1.5 text-center font-semibold text-[0.714em] uppercase tracking-wide text-cyan-600 dark:text-cyan-300">Pack Size</th>
                            <th rowSpan={2} className="px-3 py-1.5 text-center font-semibold text-[0.714em] uppercase tracking-wide text-sky-600 dark:text-sky-300">Qty</th>
                            <th colSpan={2} className="px-2 py-1.5 text-center font-semibold text-[0.714em] uppercase tracking-wide text-cyan-600 dark:text-cyan-300">Purchase</th>
                            <th colSpan={2} className="px-2 py-1.5 text-center font-semibold text-[0.714em] uppercase tracking-wide text-green-600 dark:text-green-300">Sale</th>
                            <th className="px-3 py-1.5 text-center font-semibold text-[0.714em] uppercase tracking-wide text-slate-500 dark:text-slate-400">Avg</th>
                            <th className="px-3 py-1.5 text-center font-semibold text-[0.714em] uppercase tracking-wide text-emerald-600 dark:text-emerald-300">Mrg %</th>
                          </tr>
                          <tr>
                            <th className="px-3 py-1.5 text-center font-medium text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-600">Pack</th>
                            <th className="px-3 py-1.5 text-center font-medium text-slate-500 dark:text-slate-400">Unit</th>
                            <th className="px-3 py-1.5 text-center font-medium text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-600">Pack</th>
                            <th className="px-3 py-1.5 text-center font-medium text-slate-500 dark:text-slate-400">Unit</th>
                            <th className="px-3 py-1.5" />
                            <th className="px-3 py-1.5" />
                          </tr>
                        </thead>
                        <tbody className="text-slate-700 dark:text-slate-200">
{filtered.map((p, idx) => {
                            const active = idx === highlightIndex;
                            const qty = getQuantity(p);
                            const margin = getMargin(p);
                            const avg = getAvgPrice(p);
                            const packSizeRaw = getPackSize(p);
                            const packSizeNum = packSizeRaw !== "" && packSizeRaw != null ? Number(packSizeRaw) : null;
                            const qtyNum = qty != null ? Number(qty) : null;
                            // Low stock: on-hand quantity < pack size
                            const lowStock = qtyNum != null && packSizeNum != null && qtyNum < packSizeNum;
                            // Trend: down when below pack size, up when at/above it
                            const trend = qtyNum == null || packSizeNum == null
                              ? null
                              : (qtyNum < packSizeNum ? "down" : "up");
                            return (
                              <tr
                                key={p.id}
                                ref={(el) => (rowRefs.current[idx] = el)}
                                onMouseEnter={() => setHighlightIndex(idx)}
                                onClick={() => handleSelect(p)}
                                className={`product-search-row cursor-pointer ${active ? "is-active" : ""}`}
                                aria-selected={active}
                                title="Select product"
                                aria-label="Select product"
                              >
{/* Product identity */}
                                <td className="px-4 py-3">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={`text-[1.143em] leading-tight font-extrabold tracking-tight truncate ${active ? "text-indigo-700 dark:text-indigo-200" : "text-slate-900 dark:text-white"}`}>
                                        {p?.name || "—"}
                                      </span>
                                      {getBrandName(p) && (
                                        <span className={`font-bold text-[0.857em] ${active ? "text-indigo-600/70 dark:text-indigo-300/70" : "text-slate-500 dark:text-slate-400"}`}>
                                          {getBrandName(p)}
                                        </span>
                                      )}
                                    </div>
                                    {p?.formulation && (
                                      <div className={`text-[0.857em] font-semibold truncate mt-0.5 ${active ? "text-blue-700 dark:text-blue-300" : "text-blue-600 dark:text-blue-400"}`}>
                                        {p.formulation}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                      {getSupplierName(p) && (
                                        <span className={`font-semibold text-[0.857em] ${active ? "text-indigo-600/70 dark:text-indigo-300/70" : "text-slate-500 dark:text-slate-400"}`}>
                                          • {getSupplierName(p)}
                                        </span>
                                      )}
                                      {p?.rack && (
                                        <span className="px-1.5 py-0.2 rounded-sm bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-bold text-[0.785em]">
                                          Rack: {p.rack}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>

{/* Pack Size */}
                                <td className="px-3 py-3 text-center">
                                  {getPackSize(p) ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 font-extrabold text-[1em] ring-1 ring-cyan-200 dark:ring-cyan-800">
                                      <TagIcon className="w-4 h-4" />
                                      {getPackSize(p)}
                                    </span>
                                  ) : (
                                    <span className={`font-bold ${active ? "text-indigo-400 dark:text-indigo-300" : "text-slate-400"}`}>—</span>
                                  )}
                                </td>

{/* Qty — only this cell is colored red for low stock */}
                                <td className="px-3 py-3 text-center">
                                  {qty != null ? (
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-extrabold text-[1em] ${lowStock ? "bg-red-600 text-white dark:bg-red-500" : "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300"}`}>
                                      {qty != null && trend && (
                                        <svg
                                          width="12"
                                          height="12"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="3"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          className={trend === "down" ? "" : "rotate-180"}
                                        >
                                          <polyline points="6 9 12 15 18 9" />
                                        </svg>
                                      )}
                                      {qty}
                                    </span>
                                  ) : (
                                    <span className={`font-bold ${lowStock ? "text-red-600 dark:text-red-500" : active ? "text-indigo-400 dark:text-indigo-300" : "text-slate-400"}`}>—</span>
                                  )}
                                </td>

{/* Purchase prices */}
                                <td className={`px-3 py-3 text-center font-extrabold text-[1em] border-l border-slate-100 dark:border-slate-700 ${active ? "text-cyan-600 dark:text-cyan-300" : "text-cyan-700 dark:text-cyan-300"}`}>
                                  {numFmt(p?.pack_purchase_price)}
                                </td>
                                <td className={`px-3 py-3 text-center font-bold text-[1em] ${active ? "text-slate-800 dark:text-slate-100" : "text-slate-600 dark:text-slate-300"}`}>
                                  {numFmt(p?.unit_purchase_price)}
                                </td>

                                {/* Sale prices */}
                                <td className={`px-3 py-3 text-center font-extrabold text-[1em] border-l border-slate-100 dark:border-slate-700 ${active ? "text-green-600 dark:text-green-300" : "text-green-700 dark:text-green-300"}`}>
                                  {numFmt(p?.pack_sale_price)}
                                </td>
                                <td className={`px-3 py-3 text-center font-bold text-[1em] ${active ? "text-slate-800 dark:text-slate-100" : "text-slate-600 dark:text-slate-300"}`}>
                                  {numFmt(p?.unit_sale_price)}
                                </td>

                                {/* Avg */}
                                <td className={`px-3 py-3 text-center font-extrabold text-[1em] ${active ? "text-slate-800 dark:text-slate-100" : "text-slate-700 dark:text-slate-200"}`}>
                                  {numFmt(avg)}
                                </td>

                                {/* Margin */}
                                <td className={`px-3 py-3 text-center ${active ? "text-emerald-600 dark:text-emerald-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                                  <span className="inline-block px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 font-extrabold text-[1em]">
                                    {margin != null ? `${margin}%` : "—"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

{/* Footer */}
                  <GlassToolbar className="product-search-footer items-center justify-between py-2 px-4">
                    <div className="text-[0.857em] text-slate-500 dark:text-slate-400">
                      {search ? (
                        <>
                          <span className="font-bold">{filtered.length}</span> results for{" "}
                          <span className="font-medium">"{search}"</span>
                        </>
                      ) : (
                        <>All products</>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[0.714em] text-slate-400">
                      <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 rounded-sm border border-slate-200 dark:border-slate-600 text-[0.643em]">↑↓</kbd>
                        <span>Navigate</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 rounded-sm border border-slate-200 dark:border-slate-600 text-[0.643em]">↵</kbd>
                        <span>Select</span>
                      </span>
                      <button
                        type="button"
                        onClick={closeModal}
                        className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-slate-200/60 dark:bg-slate-700/60 hover:bg-rose-500 hover:text-white dark:hover:bg-rose-600 text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1 cursor-pointer font-bold"
                      >
                        <XMarkIcon className="w-3 h-3" />
                        <span>Close (Esc)</span>
                      </button>
                    </div>
                  </GlassToolbar>
              </div>
            </div>,
            document.body
          )}
      </>
    );
  }
);

ProductSearchInput.displayName = "ProductSearchInput";
export default ProductSearchInput;
