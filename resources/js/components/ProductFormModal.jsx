// src/components/ProductFormModal.jsx
import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle, useMemo } from "react";
import axios from "axios";
import { CubeIcon, XMarkIcon } from "@heroicons/react/24/outline";
import Select from "react-select";
import AsyncSelect from "react-select/async";
import CreatableSelect from "react-select/creatable";
import toast from "react-hot-toast";
import { useTheme } from "@/context/ThemeContext.jsx";
import { useSaleSystem } from "@/context/SaleSystemContext.jsx";

// Helper to determine text color based on background brightness
const getContrastText = (hexColor) => {
  hexColor = hexColor.replace('#', '');
  const r = parseInt(hexColor.substring(0, 2), 16);
  const g = parseInt(hexColor.substring(2, 4), 16);
  const b = parseInt(hexColor.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
};

// 👉 Normalize Laravel paginate payloads (or plain arrays) to a simple array
const asList = (payload) => (Array.isArray(payload) ? payload : (payload?.data ?? payload?.items ?? []));

// 👉 Normalize formulation text (trim and collapse extra whitespace)
const normalizeFormulation = (val) => String(val ?? "").trim().replace(/\s+/g, " ");

const ProductFormModal = forwardRef(({ open, onClose, onProductCreated }, ref) => {
  const [form, setForm] = useState({
    product_code: "",
    barcode: "",
    name: "",
    formulation: "",
    pack_size: "",
    category_id: "",
    brand_id: "",
    supplier_id: "",
    description: "",
    quantity: "",
    pack_purchase_price: "",
    pack_sale_price: "",
    unit_purchase_price: "",
    unit_sale_price: "",
    whole_sale_pack_price: "",
    whole_sale_unit_price: "",
    whole_sale_margin: "",
    avg_price: "",
    margin: "",
    max_discount: "",
    rack: "",
    narcotic: "no",
  });

  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [formulations, setFormulations] = useState([]);
  const [formulationInput, setFormulationInput] = useState("");
  const formulationEscapedRef = useRef(false);
  const [brandOption, setBrandOption] = useState(null);
  const [saving, setSaving] = useState(false);
  const [windowPos, setWindowPos] = useState(() => {
    const saved = localStorage.getItem("productModalPos");
    const isCompact = typeof window !== "undefined" && window.innerWidth < 1024;
    if (saved) {
      const parsed = JSON.parse(saved);
      return isCompact
        ? { x: Math.max(8, Number(parsed.x ?? 8)), y: Math.max(8, Number(parsed.y ?? 8)) }
        : parsed;
    }
    const width = isCompact ? Math.min(800, window.innerWidth - 16) : 800;
    const height = isCompact ? Math.min(600, window.innerHeight - 24) : 600;
    const x = isCompact ? Math.max(8, (window.innerWidth - width) / 2) : (window.innerWidth - width) / 2;
    const y = isCompact ? Math.max(8, (window.innerHeight - height) / 2) : (window.innerHeight - height) / 2;
    return { x, y };
  });

  const [windowSize, setWindowSize] = useState(() => {
    const saved = localStorage.getItem("productModalSize");
    const isCompact = typeof window !== "undefined" && window.innerWidth < 1024;
    if (saved) {
      const parsed = JSON.parse(saved);
      return isCompact
        ? {
            width: Math.min(800, Number(parsed.width || 800), window.innerWidth - 16),
            height: Math.min(600, Number(parsed.height || 600), window.innerHeight - 24),
          }
        : parsed;
    }
    return {
      width: isCompact ? Math.min(800, window.innerWidth - 16) : 800,
      height: isCompact ? Math.min(600, window.innerHeight - 24) : 600,
    };
  });

const modalRef = useRef(null);
  const dragRef = useRef({ isDragging: false, offsetX: 0, offsetY: 0 });
  const nameInputRef = useRef(null);
  const rackRef = useRef(null);
  const formulationRef = useRef(null);
  const packSizeRef = useRef(null);
  const categoryRef = useRef(null);
  const brandRef = useRef(null);
const supplierRef = useRef(null);
  const descriptionRef = useRef(null);
  const saveButtonRef = useRef(null);

  // Resize state
  const MIN_WIDTH = typeof window !== "undefined" && window.innerWidth < 1024
    ? Math.min(600, window.innerWidth - 16)
    : 600;
  const MIN_HEIGHT = typeof window !== "undefined" && window.innerWidth < 1024
    ? Math.min(400, window.innerHeight - 24)
    : 400;
  const resizeRef = useRef(null); // { direction, startX, startY, startWidth, startHeight, startLeft, startTop }
  const [isResizing, setIsResizing] = useState(false);

  const { isDark, theme } = useTheme();
  const { isPharmacy } = useSaleSystem();

  // Memoize theme colors for performance
  const themeColors = useMemo(() => {
    if (!theme) {
      return {
        primary: '#3b82f6',
        primaryHover: '#2563eb',
        primaryLight: '#dbeafe',
        secondary: '#8b5cf6',
        secondaryHover: '#7c3aed',
        secondaryLight: '#ede9fe',
        danger: '#ef4444',
        dangerHover: '#dc2626',
      };
    }
    return {
      primary: theme.primary_color || '#3b82f6',
      primaryHover: theme.primary_hover || '#2563eb',
      primaryLight: theme.primary_light || '#dbeafe',
      secondary: theme.secondary_color || '#8b5cf6',
      secondaryHover: theme.secondary_hover || '#7c3aed',
      secondaryLight: theme.secondary_light || '#ede9fe',
      danger: theme.danger_color || '#ef4444',
      dangerHover: '#dc2626',
    };
  }, [theme]);

  const primaryTextColor = useMemo(() => 
    getContrastText(themeColors.primaryHover || themeColors.primary), 
    [themeColors.primary, themeColors.primaryHover]
  );

  const dangerTextColor = useMemo(() => 
    getContrastText(themeColors.dangerHover || themeColors.danger), 
    [themeColors.danger, themeColors.dangerHover]
  );

  // Fetch dropdowns and new code
  useEffect(() => {
    if (open) {
      const fetchData = async () => {
        try {
          const [catRes, supRes, formRes, codeRes] = await Promise.all([
            axios.get("/api/categories"),
            axios.get("/api/suppliers"),
            axios.get("/api/formulations").catch(() => ({ data: [] })),
            axios.get("/api/products/new-code")
          ]);
          setCategories(asList(catRes.data));
          setSuppliers(asList(supRes.data));
          setFormulations(asList(formRes.data));
          setForm(prev => ({
            ...prev,
            product_code: codeRes.data.product_code || "",
            barcode: codeRes.data.barcode || ""
          }));
        } catch (error) {
          console.error("Failed to fetch data:", error);
        }
      };
      fetchData();
      
      // Focus name input after modal opens
      setTimeout(() => nameInputRef.current?.focus(), 100);
    }
  }, [open]);

  // Keyboard shortcut: Alt+S to save, Escape to close
  useEffect(() => {
    if (!open) return;
    
    const handleKeyDown = (e) => {
      if (e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSubmit(e);
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, form]);

const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  // Focus the next field when Enter is pressed
  const focusNextField = (field) => {
    setTimeout(() => {
const ref = {
        name: nameInputRef,
        rack: rackRef,
        formulation: formulationRef,
        pack_size: packSizeRef,
        category: categoryRef,
        brand: brandRef,
        supplier: supplierRef,
        description: descriptionRef,
        save: saveButtonRef,
      }[field];
      if (ref?.current) {
        ref.current.focus();
      }
    }, 0);
  };

  // Generic Enter navigation handler for inputs
const handleEnterNav = (e, nextField) => {
    if (e.key === "Enter") {
      e.preventDefault();
      focusNextField(nextField);
    }
  };

// For react-select: only navigate on Enter when the dropdown menu is NOT open.
  // When the menu is open, Enter should select the highlighted option.
  const handleSelectEnterNav = (e, nextField, selectKey) => {
    if (e.key === "Enter" && !selectMenuOpenRef.current[selectKey]) {
      e.preventDefault();
      focusNextField(nextField);
    }
  };

  // Track open/closed state of each select menu using a ref (updates synchronously
  // so the Enter handler always sees the latest value).
  const selectMenuOpenRef = useRef({
    formulation: false,
    category: false,
    brand: false,
    supplier: false,
  });

  const setSelectMenuOpen = (selectKey, isOpen) => {
    selectMenuOpenRef.current[selectKey] = isOpen;
  };

  const formulationOptions = useMemo(() => {
    const map = new Map();
    asList(formulations).forEach((item) => {
      const name = normalizeFormulation(typeof item === "string" ? item : item?.name);
      if (!name) return;
      const key = name.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { value: name, label: name });
      }
    });

    const current = normalizeFormulation(form?.formulation);
    if (current) {
      const currentKey = current.toLowerCase();
      if (!map.has(currentKey)) {
        map.set(currentKey, { value: current, label: current });
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
  }, [formulations, form?.formulation]);

  const selectedFormulationOption = useMemo(() => {
    const current = normalizeFormulation(form?.formulation);
    if (!current) return null;
    const currentKey = current.toLowerCase();
    return (
      formulationOptions.find((opt) => opt.value.toLowerCase() === currentKey) || {
        value: current,
        label: current,
      }
    );
  }, [form?.formulation, formulationOptions]);

  const isValidNewFormulation = (inputValue, selectValue, selectOptions) => {
    const clean = normalizeFormulation(inputValue);
    if (!clean) return false;
    const lower = clean.toLowerCase();
    const inValue = (Array.isArray(selectValue) ? selectValue : [selectValue])
      .filter(Boolean)
      .some((opt) => normalizeFormulation(opt.value || opt.label).toLowerCase() === lower);
    const inOptions = (selectOptions || []).some(
      (opt) => normalizeFormulation(opt.value || opt.label).toLowerCase() === lower
    );
    return !inValue && !inOptions;
  };

  const commitFormulationValue = async (rawInput, { focusNext = true } = {}) => {
    const clean = normalizeFormulation(rawInput);
    if (!clean) {
      setForm((prev) => ({ ...prev, formulation: "" }));
      return "";
    }

    const lower = clean.toLowerCase();
    const existing = formulationOptions.find((opt) => opt.value.toLowerCase() === lower);
    if (existing) {
      setForm((prev) => ({ ...prev, formulation: existing.value }));
      if (focusNext) focusNextField("pack_size");
      return existing.value;
    }

    setForm((prev) => ({ ...prev, formulation: clean }));
    setFormulations((prev) => {
      if (prev.some((f) => normalizeFormulation(typeof f === "string" ? f : f?.name).toLowerCase() === lower)) {
        return prev;
      }
      return [...prev, { name: clean }];
    });
    if (focusNext) focusNextField("pack_size");

    try {
      const res = await axios.post("/api/formulations", { name: clean });
      const canonical = normalizeFormulation(res.data?.name) || clean;
      setFormulations((prev) => {
        const canonicalLower = canonical.toLowerCase();
        const filtered = prev.filter(
          (f) => normalizeFormulation(typeof f === "string" ? f : f?.name).toLowerCase() !== canonicalLower
        );
        return [...filtered, { id: res.data?.id, name: canonical }];
      });
      if (canonical !== clean) {
        setForm((prev) => (prev.formulation === clean ? { ...prev, formulation: canonical } : prev));
      }
      return canonical;
    } catch {
      return clean;
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    
    if (!form.name?.trim()) {
      toast.error("Product name is required");
      return;
    }

    try {
      setSaving(true);
      const pending = normalizeFormulation(formulationInput);
      let finalFormulation = form.formulation;
      if (pending) {
        setFormulationInput("");
        const lower = pending.toLowerCase();
        const existing = formulationOptions.find((opt) => opt.value.toLowerCase() === lower);
        finalFormulation = existing ? existing.value : pending;
      }
      const payloadForm = { ...form, formulation: finalFormulation };

      const formData = new FormData();
      Object.keys(payloadForm).forEach((key) => {
        if (payloadForm[key] !== undefined && payloadForm[key] !== null) {
          formData.append(key, payloadForm[key]);
        }
      });

      const { data } = await axios.post("/api/products", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (data?.formulation) {
        const cleanSaved = normalizeFormulation(data.formulation);
        if (cleanSaved) {
          setFormulations((prev) => {
            const lower = cleanSaved.toLowerCase();
            if (prev.some((f) => normalizeFormulation(typeof f === "string" ? f : f?.name).toLowerCase() === lower)) {
              return prev;
            }
            return [...prev, { name: cleanSaved }];
          });
        }
      }
      
      toast.success("Product added successfully!");
      
      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent("product:created", { detail: data }));
      
      // Reset form for next entry
      setForm(prev => ({
        ...prev,
        name: "",
        formulation: "",
        pack_size: "",
        category_id: "",
        brand_id: "",
        supplier_id: "",
        description: "",
        quantity: "",
        pack_purchase_price: "",
        pack_sale_price: "",
        unit_purchase_price: "",
        unit_sale_price: "",
        whole_sale_pack_price: "",
        whole_sale_unit_price: "",
        whole_sale_margin: "",
        avg_price: "",
        margin: "",
        max_discount: "",
        rack: "",
        narcotic: "no",
      }));
      
      // Fetch new code
      const codeRes = await axios.get("/api/products/new-code");
      setForm(prev => ({
        ...prev,
        product_code: codeRes.data.product_code || "",
        barcode: codeRes.data.barcode || ""
      }));
      
      // Focus name for next entry
      setTimeout(() => nameInputRef.current?.focus(), 50);
      
      if (onProductCreated) onProductCreated(data);
    } catch (error) {
      if (error.response?.status === 422) {
        const errors = error.response.data.errors;
        Object.values(errors).forEach((messages) => {
          messages.forEach((msg) => toast.error(msg));
        });
      } else {
        toast.error("Failed to create product");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    onClose?.();
  };

  // Dragging
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
    localStorage.setItem("productModalPos", JSON.stringify(windowPos));
    document.removeEventListener("mousemove", handleDrag);
    document.removeEventListener("mouseup", stopDrag);
  };

  // ---------- Resize ----------
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

    // Right edges (e, ne, se)
    if (dir.includes("e")) {
      width = Math.max(MIN_WIDTH, r.startWidth + dx);
    }
    // Bottom edges (s, se, sw)
    if (dir.includes("s")) {
      height = Math.max(MIN_HEIGHT, r.startHeight + dy);
    }
    // Left edges (w, nw, sw)
    if (dir.includes("w")) {
      width = Math.max(MIN_WIDTH, r.startWidth - dx);
      left = r.startLeft + (r.startWidth - width);
    }
    // Top edges (n, ne, nw)
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
    localStorage.setItem("productModalSize", JSON.stringify(windowSize));
    localStorage.setItem("productModalPos", JSON.stringify(windowPos));
    document.removeEventListener("mousemove", handleResize);
    document.removeEventListener("mouseup", stopResize);
  };

  // Render a resize handle element
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

  // Use the same readable surfaces as the modal; menus portal above its overlay.
  const getSmallSelectStyles = () => ({
    control: (base, state) => ({ ...base, minHeight: 40, fontSize: "var(--type-input)", borderRadius: 10,
      borderColor: state.isFocused ? "var(--color-primary, #2563eb)" : "transparent",
      backgroundColor: "var(--color-surface, #fff)", boxShadow: state.isFocused ? "0 0 0 2px var(--color-border, #cbd5e1)" : "none" }),
    valueContainer: (base) => ({ ...base, padding: "0 10px" }),
    input: (base) => ({ ...base, color: "var(--color-text-primary, #172033)", margin: 0, padding: 0 }),
    singleValue: (base) => ({ ...base, color: "var(--color-text-primary, #172033)" }),
    placeholder: (base) => ({ ...base, color: "var(--color-text-secondary, #536176)" }),
    menuPortal: (base) => ({ ...base, zIndex: 10002 }),
    menu: (base) => ({ ...base, fontSize: "var(--type-body)", borderRadius: 10, overflow: "hidden",
      color: "var(--color-text-primary, #172033)", backgroundColor: "var(--color-surface, #fff)", border: "1px solid var(--color-border, #cbd5e1)", boxShadow: "0 12px 32px -12px rgba(15,23,42,.3)" }),
    option: (base, state) => ({ ...base, color: "var(--color-text-primary, #172033)",
      backgroundColor: state.isFocused || state.isSelected ? "color-mix(in srgb, var(--color-primary, #2563eb) 16%, var(--color-surface, #fff))" : "var(--color-surface, #fff)", cursor: "pointer" }),
  });

  if (!open) return null;

  return (
    <div className="product-modal-overlay fixed inset-0 z-10000 flex items-center justify-center">
      <div className="product-modal-backdrop absolute inset-0" onClick={handleClose} />

      {/* Draggable Dialog */}
      <div
        ref={modalRef}
        className="product-modal-dialog absolute flex flex-col"
        role="dialog" aria-modal="true" aria-labelledby="product-modal-title"
style={{
          left: `${typeof window !== "undefined" && window.innerWidth < 1024 ? Math.max(8, windowPos.x) : windowPos.x}px`,
          top: `${typeof window !== "undefined" && window.innerWidth < 1024 ? Math.max(8, windowPos.y) : windowPos.y}px`,
          width: `${typeof window !== "undefined" && window.innerWidth < 1024 ? Math.min(800, windowSize.width, window.innerWidth - 16) : windowSize.width}px`,
          height: `${typeof window !== "undefined" && window.innerWidth < 1024 ? Math.min(windowSize.height, window.innerHeight - 24) : windowSize.height}px`,
          minWidth: `${typeof window !== "undefined" && window.innerWidth < 1024 ? Math.min(600, window.innerWidth - 16) : 600}px`,
          minHeight: `${typeof window !== "undefined" && window.innerWidth < 1024 ? Math.min(400, window.innerHeight - 24) : 400}px`,
          userSelect: isResizing ? "none" : undefined,
        }}
      >
        {/* Resize handles (all sides & corners) */}
        {["n", "s", "e", "w", "ne", "nw", "se", "sw"].map(renderResizeHandle)}

        {/* Header (Draggable) */}
        <div
          className="product-modal-header px-4 py-3 flex items-center justify-between cursor-move"
          onMouseDown={startDrag}
        >
          <div className="product-modal-heading"><span className="product-modal-icon"><CubeIcon aria-hidden="true" /></span><div><h3 id="product-modal-title">Add New Product</h3><p>Product details and inventory classification</p></div></div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="product-modal-close"
              aria-label="Close product form"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <XMarkIcon aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="product-modal-body flex-1 overflow-auto p-4">
          <div className="space-y-3">
            {/* Code / Barcode inline */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="modal-product-code" className="block text-xs font-medium mb-1 dark:text-slate-300">Product Code</label>
                <input
                  id="modal-product-code"
                  type="text"
                  name="product_code"
                  value={form.product_code || ""}
                  disabled
                  className="w-full h-8 px-2 text-xs border rounded-sm bg-gray-100 dark:bg-slate-600 dark:text-slate-200"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="modal-product-barcode" className="block text-xs font-medium dark:text-slate-300">Barcode</label>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await axios.get("/api/products/new-code");
                        if (res.data?.barcode) {
                          setForm((prev) => ({ ...prev, barcode: res.data.barcode }));
                        }
                      } catch {
                        toast.error("Failed to generate barcode");
                      }
                    }}
                    className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                    title="Generate a new internal barcode"
                  >
                    Auto-generate
                  </button>
                </div>
                <input
                  id="modal-product-barcode"
                  type="text"
                  name="barcode"
                  value={form.barcode || ""}
                  onChange={handleChange}
                  onKeyDown={(e) => handleEnterNav(e, "rack")}
                  placeholder="Scan or enter barcode"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  className="w-full h-8 px-2 text-xs border rounded-sm dark:bg-slate-700 dark:text-slate-200"
                />
              </div>
              <div>
                <label htmlFor="modal-product-rack" className="block text-xs font-medium mb-1 dark:text-slate-300">Rack</label>
                <input
                  id="modal-product-rack"
                  ref={rackRef}
                  type="text"
                  name="rack"
                  value={form.rack || ""}
                  onChange={handleChange}
                  onKeyDown={(e) => handleEnterNav(e, "name")}
                  placeholder="e.g. R-12"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  className="w-full h-8 px-2 text-xs border rounded-sm dark:bg-slate-700 dark:text-slate-200"
                />
              </div>
            </div>

            {/* Name / Formulation / Pack Size (Formulation only for pharmacy shops) */}
            <div className={`grid ${isPharmacy ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"} gap-3`}>
              <div>
                <label htmlFor="modal-product-name" className="block text-xs font-medium mb-1 dark:text-slate-300">Name *</label>
                <input
                  id="modal-product-name"
                  ref={nameInputRef}
                  type="text"
                  name="name"
                  value={form.name || ""}
                  onChange={handleChange}
                  onKeyDown={(e) => handleEnterNav(e, isPharmacy ? "formulation" : "pack_size")}
                  className="w-full h-8 px-2 text-xs border rounded-sm dark:bg-slate-700 dark:text-slate-200"
                  placeholder="Product name"
                />
              </div>
              {isPharmacy && (
              <div>
                <label htmlFor="modal-product-formulation" className="block text-xs font-medium mb-1 dark:text-slate-300">Formulation (Generic / Salt)</label>
                <CreatableSelect
                  ref={formulationRef}
                  inputId="modal-product-formulation"
                  name="formulation"
                  options={formulationOptions}
                  value={selectedFormulationOption}
                  inputValue={formulationInput}
                  onInputChange={(newValue, actionMeta) => {
                    if (actionMeta.action === "input-change") {
                      formulationEscapedRef.current = false;
                      setFormulationInput(newValue);
                      return;
                    }
                    if (actionMeta.action === "input-blur") {
                      const pending = normalizeFormulation(formulationInput || actionMeta.prevInputValue || "");
                      setFormulationInput("");
                      if (pending && !formulationEscapedRef.current) {
                        commitFormulationValue(pending, { focusNext: false });
                      }
                      formulationEscapedRef.current = false;
                      return;
                    }
                    if (actionMeta.action === "set-value" || actionMeta.action === "menu-close") {
                      setFormulationInput("");
                    }
                  }}
                  onChange={(opt) => {
                    setFormulationInput("");
                    setForm((prev) => ({ ...prev, formulation: opt?.value || "" }));
                    if (opt?.value) {
                      focusNextField("pack_size");
                    }
                  }}
                  onCreateOption={(inputValue) => {
                    setFormulationInput("");
                    commitFormulationValue(inputValue, { focusNext: true });
                  }}
                  onMenuOpen={() => setSelectMenuOpen("formulation", true)}
                  onMenuClose={() => setSelectMenuOpen("formulation", false)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      formulationEscapedRef.current = true;
                      setFormulationInput("");
                      return;
                    }
                    if (!normalizeFormulation(formulationInput)) {
                      handleSelectEnterNav(e, "pack_size", "formulation");
                    }
                  }}
                  isValidNewOption={isValidNewFormulation}
                  formatCreateLabel={(inputValue) => `Add "${normalizeFormulation(inputValue)}"`}
                  createOptionPosition="first"
                  isClearable
                  isSearchable
                  placeholder="Search or type formulation..."
                  noOptionsMessage={() => "Type formulation to add..."}
                  classNamePrefix="rs"
                  styles={getSmallSelectStyles(isDark)}
                  menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                />
              </div>
              )}
              <div>
                <label htmlFor="modal-product-pack-size" className="block text-xs font-medium mb-1 dark:text-slate-300">Pack Size</label>
                <input
                  id="modal-product-pack-size"
                  ref={packSizeRef}
                  type="text"
                  name="pack_size"
                  value={form.pack_size || ""}
                  onChange={handleChange}
                  onKeyDown={(e) => handleEnterNav(e, "category")}
                  className="w-full h-8 px-2 text-xs border rounded-sm dark:bg-slate-700 dark:text-slate-200"
                />
              </div>
            </div>

            {/* Category / Brand / Supplier */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1 dark:text-slate-300">Category</label>
<Select
                  ref={categoryRef}
                  options={categories.map((c) => ({ value: c.id, label: c.name }))}
                  value={categories.map((c) => ({ value: c.id, label: c.name })).find((opt) => opt.value === Number(form.category_id)) || null}
                  onChange={(opt) => setForm(prev => ({ ...prev, category_id: opt?.value || "" }))}
                  onKeyDown={(e) => handleSelectEnterNav(e, "brand", "category")}
                  onMenuOpen={() => setSelectMenuOpen("category", true)}
                  onMenuClose={() => setSelectMenuOpen("category", false)}
                  isSearchable
                  classNamePrefix="rs"
                  styles={getSmallSelectStyles(isDark)}
                  menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                  placeholder="Select..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 dark:text-slate-300">Brand</label>
<AsyncSelect
                  ref={brandRef}
                  cacheOptions
                  defaultOptions
                  loadOptions={async (inputValue) => {
                    try {
                      const res = await axios.get("/api/brands", { params: { q_name: inputValue || "", per_page: 25 } });
                      return asList(res.data).map((b) => ({ value: b.id, label: b.name }));
                    } catch { return []; }
                  }}
                  value={brandOption}
onChange={(opt) => {
                    setBrandOption(opt);
                    setForm(prev => ({ ...prev, brand_id: opt?.value ?? null }));
                  }}
                  onKeyDown={(e) => handleSelectEnterNav(e, "supplier", "brand")}
                  onMenuOpen={() => setSelectMenuOpen("brand", true)}
                  onMenuClose={() => setSelectMenuOpen("brand", false)}
                  isSearchable
                  classNamePrefix="rs"
                  styles={getSmallSelectStyles(isDark)}
                  placeholder="Search brand..."
                  noOptionsMessage={() => "Type to search..."}
                  menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 dark:text-slate-300">Supplier</label>
<Select
                  ref={supplierRef}
                  options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                  value={suppliers.map((s) => ({ value: s.id, label: s.name })).find((opt) => opt.value === Number(form.supplier_id)) || null}
                  onChange={(opt) => setForm(prev => ({ ...prev, supplier_id: opt?.value || "" }))}
                  onKeyDown={(e) => handleSelectEnterNav(e, "description", "supplier")}
                  onMenuOpen={() => setSelectMenuOpen("supplier", true)}
                  onMenuClose={() => setSelectMenuOpen("supplier", false)}
                  isSearchable
                  classNamePrefix="rs"
                  styles={getSmallSelectStyles(isDark)}
                  menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                  placeholder="Select..."
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium mb-1 dark:text-slate-300">Description</label>
<textarea
                ref={descriptionRef}
                name="description"
                value={form.description || ""}
                onChange={handleChange}
onKeyDown={(e) => {
                  // Enter without Shift moves to next field; Shift+Enter adds newline
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    focusNextField("save");
                  }
                }}
                className="w-full h-16 px-2 py-1 text-xs border rounded-sm dark:bg-slate-700 dark:text-slate-200 resize-none"
                placeholder="Optional notes..."
              />
            </div>

{/* Narcotic checkbox — pharmacy only */}
            {isPharmacy && (
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-xs dark:text-slate-300">
                <input
                  type="checkbox"
                  name="narcotic"
                  checked={form.narcotic === "yes"}
                  onChange={(e) => setForm(prev => ({ ...prev, narcotic: e.target.checked ? "yes" : "no" }))}
                  className="h-4 w-4 rounded-sm border-gray-300 dark:border-slate-500 dark:bg-slate-600"
                  style={{ accentColor: themeColors?.primary }}
                />
                <span>Narcotic</span>
              </label>
            </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="product-modal-footer px-4 py-3 flex items-center justify-between">
          <div className="product-modal-shortcuts">
            Alt+S to save • Esc to close
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="product-modal-cancel theme-btn-tertiary"
            >
              Cancel
            </button>
            <button
              ref={saveButtonRef}
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="product-modal-save theme-btn-primary transition-all duration-200"
            >
              {saving ? 'Saving...' : 'Save Product'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

ProductFormModal.displayName = "ProductFormModal";
export default ProductFormModal;

