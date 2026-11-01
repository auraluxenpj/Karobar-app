// src/pages/products/ProductForm.jsx
import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle, useMemo } from "react";
import axios from "axios";
import Select from "react-select";
import AsyncSelect from "react-select/async";
import CreatableSelect from "react-select/creatable";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";

// Icons (glassy header/buttons)
import {
  ArrowLeftIcon,
  PencilSquareIcon,
  CubeIcon,
  PlusIcon,
  TrashIcon,
  ArrowsRightLeftIcon,
  BuildingStorefrontIcon,
} from "@heroicons/react/24/solid";
import { getThemeButtonClasses } from "@/utils/buttonStyles";
import {
  MoveBatchLocationModal,
  ManageStorageLocationsModal,
  getLocationTypeMeta,
} from "@/components/StorageLocationsModal.jsx";

// FilePond
import { FilePond, registerPlugin } from "react-filepond";
import FilePondPluginImagePreview from "filepond-plugin-image-preview";
import FilePondPluginFileValidateType from "filepond-plugin-file-validate-type";

// Styles for FilePond
import "filepond/dist/filepond.min.css";
import "filepond-plugin-image-preview/dist/filepond-plugin-image-preview.css";

// 🧊 glass primitives
import { GlassCard, GlassInput, GlassBtn } from "@/components/Glass.jsx";
import { useTheme } from "@/context/ThemeContext";
import { useSaleSystem } from "@/context/SaleSystemContext.jsx";

registerPlugin(FilePondPluginImagePreview, FilePondPluginFileValidateType);

// 👉 Normalize Laravel paginate payloads (or plain arrays) to a simple array
const asList = (payload) => (Array.isArray(payload) ? payload : (payload?.data ?? payload?.items ?? []));

// 👉 Normalize formulation text (trim and collapse extra whitespace)
const normalizeFormulation = (val) => String(val ?? "").trim().replace(/\s+/g, " ");

// Helper to determine text color based on background brightness
const getContrastText = (hexColor) => {
  hexColor = hexColor.replace('#', '');
  const r = parseInt(hexColor.substring(0, 2), 16);
  const g = parseInt(hexColor.substring(2, 4), 16);
  const b = parseInt(hexColor.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
};

// ===== Form Fields Component =====
const ProductFormFields = forwardRef(({ 
  form, 
  files, 
  batches, 
  categories, 
  suppliers, 
  formulations = [],
  onCreateFormulation,
  storageLocations = [],
  onOpenManageLocations,
  isEdit, 
  handleChange, 
  onGenerateBarcode,
  loadBrandOptions, 
  getSmallSelectStyles, 
  isDark, 
  onFilesChange, 
  setFiles,
  themeColors,
  primaryTextColor
}, ref) => {
  const [brandOption, setBrandOption] = useState(() =>
    form?.brand?.id && form?.brand?.name
      ? { value: Number(form.brand.id), label: form.brand.name }
      : null
  );

  // Pharmacy shop types get the formulation + narcotic fields
  const { isPharmacy } = useSaleSystem();

  // Keep brandOption synced with form.brand_id and form.brand (including edit mode preload)
  useEffect(() => {
    if (!form.brand_id) {
      setBrandOption(null);
      return;
    }

    const targetBrandId = Number(form.brand_id);

    // 1. If the eager-loaded brand relation matches form.brand_id, use it immediately
    if (form?.brand?.id && Number(form.brand.id) === targetBrandId && form?.brand?.name) {
      if (Number(brandOption?.value) !== targetBrandId || brandOption?.label !== form.brand.name) {
        setBrandOption({ value: targetBrandId, label: form.brand.name });
      }
      return;
    }

    // 2. If already selected with matching ID, keep it
    if (Number(brandOption?.value) === targetBrandId && brandOption?.label) {
      return;
    }

    // 3. Otherwise fetch the specific brand by ID (works even when >25 brands exist)
    let cancelled = false;
    axios
      .get(`/api/brands/${targetBrandId}`)
      .then((res) => {
        if (cancelled) return;
        const b = res.data;
        if (b?.id && b?.name) {
          setBrandOption({ value: Number(b.id), label: b.name });
        }
      })
      .catch(() => {
        if (cancelled) return;
        loadBrandOptions("").then((options) => {
          if (cancelled) return;
          const opt = (options || []).find((o) => Number(o.value) === targetBrandId);
          if (opt) setBrandOption(opt);
        });
      });

    return () => {
      cancelled = true;
    };
  }, [form.brand_id, form?.brand?.id, form?.brand?.name]);

  const categoryOptions = useMemo(() => {
    const opts = asList(categories).map((c) => ({ value: Number(c.id), label: c.name }));
    if (
      form?.category?.id &&
      form?.category?.name &&
      !opts.some((o) => o.value === Number(form.category.id))
    ) {
      opts.unshift({ value: Number(form.category.id), label: form.category.name });
    }
    return opts;
  }, [categories, form?.category?.id, form?.category?.name]);

  const supplierOptions = useMemo(() => {
    const opts = asList(suppliers).map((s) => ({ value: Number(s.id), label: s.name }));
    if (
      form?.supplier?.id &&
      form?.supplier?.name &&
      !opts.some((o) => o.value === Number(form.supplier.id))
    ) {
      opts.unshift({ value: Number(form.supplier.id), label: form.supplier.name });
    }
    return opts;
  }, [suppliers, form?.supplier?.id, form?.supplier?.name]);

  // Deduplicated, case-insensitive formulation options
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

  const [formulationInput, setFormulationInput] = useState("");
  const formulationMenuOpenRef = useRef(false);
  const formulationEscapedRef = useRef(false);

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
      handleChange({ target: { name: "formulation", value: "" } });
      return;
    }

    const lower = clean.toLowerCase();
    const existing = formulationOptions.find((opt) => opt.value.toLowerCase() === lower);
    if (existing) {
      handleChange({ target: { name: "formulation", value: existing.value } });
      if (focusNext) setTimeout(() => packSizeRef.current?.focus(), 0);
      return;
    }

    handleChange({ target: { name: "formulation", value: clean } });
    if (focusNext) setTimeout(() => packSizeRef.current?.focus(), 0);

    if (onCreateFormulation) {
      const canonical = await onCreateFormulation(clean);
      if (canonical && canonical !== clean) {
        handleChange({ target: { name: "formulation", value: canonical } });
      }
    }
  };
  // Create refs locally

  const nameRef = useRef(null);
  const rackRef = useRef(null);
  const formulationRef = useRef(null);
  const packSizeRef = useRef(null);
  const categorySelectRef = useRef(null);
  const brandSelectRef = useRef(null);
  const supplierSelectRef = useRef(null);

  // Expose focus methods to parent
  useImperativeHandle(ref, () => ({
    focusName: () => nameRef.current?.focus(),
    flushPendingFormulation: () => {
      const pending = normalizeFormulation(formulationInput);
      if (!pending) return normalizeFormulation(form?.formulation);
      setFormulationInput("");
      const lower = pending.toLowerCase();
      const existing = formulationOptions.find((opt) => opt.value.toLowerCase() === lower);
      const finalValue = existing ? existing.value : pending;
      handleChange({ target: { name: "formulation", value: finalValue } });
      if (!existing && onCreateFormulation) {
        onCreateFormulation(finalValue);
      }
      return finalValue;
    },
  }));

  return (
    <div className="product-form-fields">
      {/* Image - moved to top, compact */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-start">
        <div className="w-32 shrink-0">
          <label className="block text-xs font-medium mb-1 dark:text-slate-300">Image</label>
          <div className="rounded-xl bg-white/60 dark:bg-slate-700/60 backdrop-blur-xs ring-1 ring-gray-200/60 dark:ring-slate-600/60 p-1.5">
            <FilePond
              files={files}
              onupdatefiles={onFilesChange}
              allowMultiple={false}
              acceptedFileTypes={["image/*"]}
              labelIdle='Drop or <span class="filepond--label-action">browse</span>'
              credits={false}
              stylePanelLayout="compact"
              styleLoadPlaceholder="Loading..."
            />
          </div>
        </div>
        
        {/* Code / Barcode inline */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label className="block text-xs font-medium mb-1 dark:text-slate-300" htmlFor="product-product_code">Product Code</label>
            <GlassInput type="text" id="product-product_code" name="product_code" value={form.product_code || ""} disabled className="w-full bg-white/70 dark:bg-slate-700/70 text-sm h-8 dark:text-slate-200" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium dark:text-slate-300" htmlFor="product-barcode">Barcode</label>
              {onGenerateBarcode && (
                <button
                  type="button"
                  onClick={onGenerateBarcode}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer"
                  title="Generate a new internal barcode"
                >
                  Auto-generate
                </button>
              )}
            </div>
            <GlassInput
              type="text"
              id="product-barcode"
              name="barcode"
              value={form.barcode || ""}
              onChange={handleChange}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  rackRef.current?.focus();
                }
              }}
              placeholder="Scan or enter barcode"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="next"
              className="w-full text-sm h-8 dark:bg-slate-700/70 dark:text-slate-200"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium dark:text-slate-300" htmlFor="product-storage-location">
                Default Location
              </label>
              {onOpenManageLocations && (
                <button
                  type="button"
                  onClick={onOpenManageLocations}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer"
                  title="Add or manage storage locations (Shop, Godown, Fridge)"
                >
                  + Locations
                </button>
              )}
            </div>
            <Select
              inputId="product-storage-location"
              options={asList(storageLocations).map((loc) => ({
                value: loc.id,
                label: `${loc.name} (${loc.code})`,
                location: loc,
              }))}
              value={
                asList(storageLocations)
                  .map((loc) => ({ value: loc.id, label: `${loc.name} (${loc.code})`, location: loc }))
                  .find((opt) => Number(opt.value) === Number(form.storage_location_id)) || null
              }
              onChange={(opt) => {
                handleChange({ target: { name: "storage_location_id", value: opt?.value ?? null } });
                if (opt?.location?.default_rack && !form.rack) {
                  handleChange({ target: { name: "rack", value: opt.location.default_rack } });
                }
              }}
              placeholder="Select location..."
              classNamePrefix="rs"
              isSearchable
              styles={getSmallSelectStyles(isDark)}
              menuPortalTarget={typeof document !== "undefined" ? document.body : null}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 dark:text-slate-300" htmlFor="product-rack">Rack / Shelf Code</label>
            <GlassInput
              ref={rackRef}
              type="text"
              id="product-rack"
              name="rack"
              value={form.rack || ""}
              onChange={handleChange}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  nameRef.current?.focus();
                }
              }}
              placeholder="e.g. R-12 / Shelf 2"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="next"
              className="w-full text-sm h-8 dark:bg-slate-700/70 dark:text-slate-200"
            />
          </div>
          {isPharmacy && (
          <div className="col-span-2">
            <label className="block text-xs font-medium mb-1 dark:text-slate-300" htmlFor="product-narcotic">Narcotic / Controlled</label>
            <Select
              inputId="product-narcotic"
              options={[
                { value: "no", label: "Standard (Non-Narcotic)" },
                { value: "yes", label: "Narcotic / Controlled" },
              ]}
              value={
                form.narcotic === "yes"
                  ? { value: "yes", label: "Narcotic / Controlled" }
                  : { value: "no", label: "Standard (Non-Narcotic)" }
              }
              onChange={(opt) => handleChange({ target: { name: "narcotic", value: opt?.value || "no" } })}
              classNamePrefix="rs"
              isSearchable={false}
              styles={getSmallSelectStyles(isDark)}
              menuPortalTarget={typeof document !== "undefined" ? document.body : null}
            />
          </div>
          )}
        </div>
      </div>

      {/* Name / Formulation / Pack Size (Formulation only for pharmacy shops) */}
      <div className={`grid grid-cols-1 ${isPharmacy ? "md:grid-cols-3" : "md:grid-cols-2"} gap-3`}>
        <div>
          <label className="block text-xs font-medium mb-1 dark:text-slate-300" htmlFor="product-name">Name *</label>
          <GlassInput
            ref={nameRef}
            type="text"
            id="product-name" name="name"
            value={form.name || ""}
            onChange={handleChange}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (isPharmacy ? formulationRef : packSizeRef).current?.focus();
              }
            }}
            className="w-full text-sm h-8 dark:bg-slate-700/70 dark:text-slate-200"
            placeholder="Product name"
          />
        </div>
        {isPharmacy && (
        <div>
          <label className="block text-xs font-medium mb-1 dark:text-slate-300" htmlFor="product-formulation">Formulation (Generic / Salt)</label>
          <CreatableSelect
            ref={formulationRef}
            inputId="product-formulation"
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
              handleChange({ target: { name: "formulation", value: opt?.value || "" } });
              if (opt?.value) {
                setTimeout(() => packSizeRef.current?.focus(), 0);
              }
            }}
            onCreateOption={(inputValue) => {
              setFormulationInput("");
              commitFormulationValue(inputValue, { focusNext: true });
            }}
            onMenuOpen={() => {
              formulationMenuOpenRef.current = true;
            }}
            onMenuClose={() => {
              formulationMenuOpenRef.current = false;
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                formulationEscapedRef.current = true;
                setFormulationInput("");
                return;
              }
              if (e.key === "Enter" && !formulationMenuOpenRef.current && ! normalizeFormulation(formulationInput)) {
                e.preventDefault();
                packSizeRef.current?.focus();
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
          <label className="block text-xs font-medium mb-1 dark:text-slate-300" htmlFor="product-pack_size">Pack Size</label>
          <GlassInput
            ref={packSizeRef}
            type="text"
            id="product-pack_size" name="pack_size"
            value={form.pack_size || ""}
            onChange={handleChange}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                categorySelectRef.current?.focus();
              }
            }}
            className="w-full text-sm h-8 dark:bg-slate-700/70 dark:text-slate-200"
          />
        </div>
      </div>

      {/* Category / Brand / Supplier */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1 dark:text-slate-300" htmlFor="product-category">Category</label>
          <Select
            inputId="product-category" ref={categorySelectRef}
            options={categoryOptions}
            value={categoryOptions.find((opt) => Number(opt.value) === Number(form.category_id)) || null}
            onChange={(opt) => {
              handleChange({ target: { name: "category_id", value: opt?.value } });
              setTimeout(() => brandSelectRef.current?.focus(), 0);
            }}
            classNamePrefix="rs"
            isSearchable
            styles={getSmallSelectStyles(isDark)}
            menuPortalTarget={typeof document !== "undefined" ? document.body : null}
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 dark:text-slate-300" htmlFor="product-brand">Brand</label>
            <AsyncSelect
            inputId="product-brand" ref={brandSelectRef}
            cacheOptions
            defaultOptions
            loadOptions={loadBrandOptions}
            value={brandOption}
            onChange={(opt) => {
              handleChange({ target: { name: "brand_id", value: opt?.value ?? null } });
              setBrandOption(opt);
              setTimeout(() => supplierSelectRef.current?.focus(), 0);
            }}

            classNamePrefix="rs"
            isSearchable
            styles={getSmallSelectStyles(isDark)}
            placeholder="Search brand..."
            noOptionsMessage={() => "Type to search..."}
            menuPortalTarget={typeof document !== "undefined" ? document.body : null}
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 dark:text-slate-300" htmlFor="product-supplier">Supplier</label>
          <Select
            inputId="product-supplier" ref={supplierSelectRef}
            options={supplierOptions}
            value={supplierOptions.find((opt) => Number(opt.value) === Number(form.supplier_id)) || null}
            onChange={(opt) => {
              handleChange({ target: { name: "supplier_id", value: opt?.value } });
              // setTimeout(() => saveBtnRef.current?.focus(), 0);
            }}

            classNamePrefix="rs"
            isSearchable
            styles={getSmallSelectStyles(isDark)}
            menuPortalTarget={typeof document !== "undefined" ? document.body : null}
          />
        </div>
      </div>

      {/* Description - compact */}
      <div>
        <label className="block text-xs font-medium mb-1 dark:text-slate-300" htmlFor="product-description">Description</label>
        <textarea
          id="product-description" name="description"
          value={form.description || ""}
          onChange={handleChange}
          className="w-full h-16 px-3 py-2 rounded-xl bg-white/70 dark:bg-slate-700/70 backdrop-blur-xs border border-gray-200/70 dark:border-slate-600/70 ring-1 ring-transparent focus:ring-blue-400/40 shadow-xs focus:outline-hidden text-sm resize-none dark:text-slate-200"
          placeholder="Optional notes..."
        />
      </div>

      {/* Clean, spacious Pricing, Margins & Thresholds Grid */}
      <div className="rounded-2xl p-4 ring-1 ring-gray-200/70 dark:ring-slate-600/70 bg-white/60 dark:bg-slate-800/50 backdrop-blur-xs space-y-3">
        <div className="flex items-center justify-between border-b border-gray-200/60 dark:border-slate-700/60 pb-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-200">
              Pricing, Margins & Expiry Thresholds
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-slate-400">
              Default product-level rates and alert thresholds (individual batches can override Unit MRP and Unit Cost below)
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {[
            { name: "quantity", label: "On-Hand Stock (Qty)", disabled: true, value: form.quantity ?? "" },
            { name: "pack_purchase_price", label: "Pack Purchase Price", disabled: false, value: form.pack_purchase_price ?? "" },
            { name: "pack_sale_price", label: "Pack Sale Price", disabled: false, value: form.pack_sale_price ?? "" },
            { name: "unit_purchase_price", label: "Unit Purchase Cost", disabled: false, value: form.unit_purchase_price ?? "" },
            { name: "unit_sale_price", label: "Unit Sale MRP", disabled: false, value: form.unit_sale_price ?? "" },
            { name: "margin", label: "Retail Margin (%)", disabled: false, value: form.margin ?? "" },
            { name: "whole_sale_pack_price", label: "Wholesale Pack Price", disabled: false, value: form.whole_sale_pack_price ?? "" },
            { name: "whole_sale_unit_price", label: "Wholesale Unit Price", disabled: false, value: form.whole_sale_unit_price ?? "" },
            { name: "whole_sale_margin", label: "Wholesale Margin (%)", disabled: false, value: form.whole_sale_margin ?? "" },
            { name: "avg_price", label: "Average Unit Cost", disabled: false, value: form.avg_price ?? "" },
            { name: "max_discount", label: "Max Discount (%)", disabled: false, value: form.max_discount ?? "" },
          ].map((cfg) => (
            <div key={cfg.name}>
              <label className="block text-xs font-medium mb-1 dark:text-slate-300" htmlFor={`product-${cfg.name}`}>
                {cfg.label}
              </label>
              <GlassInput
                id={`product-${cfg.name}`}
                type="number"
                step="any"
                name={cfg.name}
                value={cfg.value}
                disabled={cfg.disabled}
                onChange={handleChange}
                placeholder="0.00"
                className="w-full text-sm font-mono tabular-nums bg-white/80 dark:bg-slate-700/80 dark:text-slate-200"
              />
            </div>
          ))}
          <div>
            <label
              className="block text-xs font-medium mb-1 dark:text-slate-300"
              htmlFor="product-expiry_warning_days"
              title="Custom Expiry Warning Days (Leave empty to use store default)"
            >
              Expiry Alert (Days)
            </label>
            <GlassInput
              id="product-expiry_warning_days"
              type="number"
              name="expiry_warning_days"
              value={form.expiry_warning_days ?? ""}
              onChange={handleChange}
              placeholder="Store default"
              title="Custom Expiry Warning Days (leave blank to use default)"
              className="w-full text-sm font-mono tabular-nums bg-white/80 dark:bg-slate-700/80 dark:text-slate-200"
            />
          </div>
        </div>
      </div>
    </div>
  );
});
ProductFormFields.displayName = "ProductFormFields";

export default function ProductForm({ initialData = null, onSubmitSuccess }) {
  const isEdit = !!initialData;
  const navigate = useNavigate();
  const formFieldsRef = useRef(null);

  const [form, setForm] = useState({
    ...initialData,
    narcotic: initialData?.narcotic || "no",
  });

  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [formulations, setFormulations] = useState([]);
  const [storageLocations, setStorageLocations] = useState([]);
  const [files, setFiles] = useState([]);
  const [batches, setBatches] = useState([]);
  const [moveModalBatch, setMoveModalBatch] = useState(null);
  const [manageLocationsOpen, setManageLocationsOpen] = useState(false);

  const [isLoaded, setIsLoaded] = useState(false);

  const { isDark, theme, buttonStyle } = useTheme();

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
      };
    }
    return {
      primary: theme.primary_color || '#3b82f6',
      primaryHover: theme.primary_hover || '#2563eb',
      primaryLight: theme.primary_light || '#dbeafe',
      secondary: theme.secondary_color || '#8b5cf6',
      secondaryHover: theme.secondary_hover || '#7c3aed',
      secondaryLight: theme.secondary_light || '#ede9fe',
    };
  }, [theme]);

  const themeButtonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark),
    [buttonStyle, themeColors, isDark]
  );

  const [newBatch, setNewBatch] = useState({
    batch_number: "",
    expiry_date: "",
    quantity: "",
    storage_location_id: "",
    rack: "",
    unit_sale_price: "",
    unit_purchase_price: "",
  });
  const [editingBatchId, setEditingBatchId] = useState(null);
  const [addingBatch, setAddingBatch] = useState(false);
  const [deletingBatchId, setDeletingBatchId] = useState(null);
  const [batchStatusFilter, setBatchStatusFilter] = useState("all");
  const [batchLocationFilter, setBatchLocationFilter] = useState("all");
  const [batchSortOrder, setBatchSortOrder] = useState("fefo");
  const [batchSearchQuery, setBatchSearchQuery] = useState("");

  // Multi-Supplier Mapping State
  const [productSuppliers, setProductSuppliers] = useState([]);
  const [newSupplierLink, setNewSupplierLink] = useState({
    supplier_id: "",
    supplier_sku: "",
    last_purchase_price: "",
    lead_time_days: "",
    min_order_qty: "1",
    is_preferred: false,
  });
  const [savingSupplierLink, setSavingSupplierLink] = useState(false);

  const realBatches = useMemo(
    () => (batches || []).filter((b) => !b.is_unbatched && b.batch_number && b.id != null),
    [batches]
  );
  const totalStock = parseInt(form.quantity, 10) || 0;
  const batchedStock = realBatches.reduce((acc, b) => acc + (parseInt(b.quantity, 10) || 0), 0);
  const unassignedStock = Math.max(0, totalStock - batchedStock);
  const editingBatchObj = useMemo(
    () => (editingBatchId ? realBatches.find((b) => Number(b.id) === Number(editingBatchId)) : null),
    [editingBatchId, realBatches]
  );
  const matchingBatchInForm = useMemo(() => {
    if (editingBatchId || !newBatch.batch_number?.trim()) return null;
    const typed = newBatch.batch_number.trim().toLowerCase();
    const locId = Number(newBatch.storage_location_id || form.storage_location_id || 0);
    return (
      realBatches.find(
        (b) =>
          (b.batch_number || "").trim().toLowerCase() === typed &&
          (!locId || Number(b.storage_location_id || 0) === locId)
      ) || null
    );
  }, [editingBatchId, newBatch.batch_number, newBatch.storage_location_id, form.storage_location_id, realBatches]);

  const maxBatchAssignable = editingBatchObj
    ? unassignedStock + (parseInt(editingBatchObj.quantity, 10) || 0)
    : matchingBatchInForm
    ? unassignedStock + (parseInt(matchingBatchInForm.quantity, 10) || 0)
    : unassignedStock;

  const batchPickerOptions = useMemo(
    () => [
      { value: "__new__", label: "+ Create New Batch" },
      ...realBatches.map((b) => {
        const locName =
          b.storage_location?.name ||
          storageLocations.find((l) => Number(l.id) === Number(b.storage_location_id))?.name ||
          "";
        const locInfo = locName ? ` • [${locName}]` : "";
        const mrpInfo =
          b.unit_sale_price != null ? ` • MRP: ${Number(b.unit_sale_price).toFixed(2)}` : "";
        const statusTag = b.is_expired
          ? " [Expired]"
          : b.is_fefo_recommended
          ? " [FEFO]"
          : "";
        return {
          value: String(b.id),
          label: `${b.batch_number} — ${b.quantity} units • Exp: ${b.expiry_date || "N/A"}${locInfo}${mrpInfo}${statusTag}`,
          batch: b,
        };
      }),
    ],
    [realBatches, storageLocations]
  );

  const batchLocationOptions = useMemo(
    () => [
      { value: "all", label: "All Locations" },
      ...storageLocations.map((loc) => ({
        value: String(loc.id),
        label: `${loc.name} (${loc.code})`,
      })),
    ],
    [storageLocations]
  );

  const locationSummary = useMemo(() => {
    const map = {};
    realBatches.forEach((b) => {
      const locId = b.storage_location_id ? String(b.storage_location_id) : "default";
      const locObj =
        b.storage_location ||
        storageLocations.find((l) => String(l.id) === String(b.storage_location_id));
      const label = locObj ? `${locObj.name} (${locObj.code})` : "Shop Counter";
      const type = locObj?.type || "shop";
      if (!map[locId]) {
        map[locId] = { id: locId, label, type, qty: 0, count: 0 };
      }
      map[locId].qty += parseInt(b.quantity, 10) || 0;
      map[locId].count += 1;
    });
    return Object.values(map);
  }, [realBatches, storageLocations]);

  const batchStatusOptions = useMemo(
    () => [
      { value: "all", label: `All Batches (${realBatches.length})` },
      {
        value: "fefo",
        label: `FEFO Recommended (${realBatches.filter((b) => b.is_fefo_recommended).length})`,
      },
      {
        value: "active",
        label: `Active / Non-Expired (${realBatches.filter((b) => !b.is_expired).length})`,
      },
      {
        value: "expired",
        label: `Expired Batches (${realBatches.filter((b) => b.is_expired).length})`,
      },
    ],
    [realBatches]
  );

  const batchSortOptions = useMemo(
    () => [
      { value: "fefo", label: "Sort: Earliest Expiry First (FEFO)" },
      { value: "expiry_desc", label: "Sort: Latest Expiry First" },
      { value: "qty_desc", label: "Sort: Highest Quantity First" },
      { value: "batch_asc", label: "Sort: Batch Number (A–Z)" },
    ],
    []
  );

  const supplierPriorityOptions = useMemo(
    () => [
      { value: "secondary", label: "Secondary / Backup Distributor" },
      { value: "preferred", label: "Preferred Primary Distributor" },
    ],
    []
  );

  const filteredBatches = useMemo(() => {
    const q = batchSearchQuery.trim().toLowerCase();
    const list = realBatches.filter((b) => {
      if (batchStatusFilter === "fefo" && !b.is_fefo_recommended) return false;
      if (batchStatusFilter === "active" && b.is_expired) return false;
      if (batchStatusFilter === "expired" && !b.is_expired) return false;
      if (
        batchLocationFilter !== "all" &&
        String(b.storage_location_id || "") !== String(batchLocationFilter)
      ) {
        return false;
      }
      if (
        q &&
        !String(b.batch_number || "").toLowerCase().includes(q) &&
        !String(b.expiry_date || "").toLowerCase().includes(q) &&
        !String(b.rack || "").toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (batchSortOrder === "expiry_desc") {
        return String(b.expiry_date || "").localeCompare(String(a.expiry_date || ""));
      }
      if (batchSortOrder === "qty_desc") {
        return (Number(b.quantity) || 0) - (Number(a.quantity) || 0);
      }
      if (batchSortOrder === "batch_asc") {
        return String(a.batch_number || "").localeCompare(String(b.batch_number || ""));
      }
      return String(a.expiry_date || "").localeCompare(String(b.expiry_date || ""));
    });
  }, [realBatches, batchStatusFilter, batchLocationFilter, batchSortOrder, batchSearchQuery]);

  const handleAddBatch = async (e) => {
    e.preventDefault();
    if (!newBatch.batch_number.trim() || !newBatch.expiry_date) {
      toast.error("Please enter both Batch # and Expiry date");
      return;
    }
    const requestedQty = newBatch.quantity !== "" ? parseInt(newBatch.quantity, 10) : 0;

    if (!editingBatchId && !matchingBatchInForm) {
      if (maxBatchAssignable <= 0) {
        toast.error(
          "Cannot add a new batch because this product has 0 unassigned stock available. Select an existing batch to edit or add stock via Purchase Invoice / Stock Adjustment."
        );
        return;
      }
      if (requestedQty <= 0) {
        toast.error(`Batch quantity must be between 1 and ${maxBatchAssignable} unassigned units.`);
        return;
      }
    }

    if (requestedQty > maxBatchAssignable) {
      toast.error(
        `Cannot assign ${requestedQty} units. Only ${maxBatchAssignable} unassigned units are available for this batch.`
      );
      return;
    }

    setAddingBatch(true);
    try {
      const payload = {
        batch_number: newBatch.batch_number.trim(),
        expiry_date: newBatch.expiry_date,
        quantity: requestedQty,
        storage_location_id: newBatch.storage_location_id
          ? Number(newBatch.storage_location_id)
          : form.storage_location_id
          ? Number(form.storage_location_id)
          : null,
        rack: newBatch.rack?.trim() || form.rack || null,
      };
      if (newBatch.unit_sale_price !== "") {
        payload.unit_sale_price = parseFloat(newBatch.unit_sale_price);
      }
      if (newBatch.unit_purchase_price !== "") {
        payload.unit_purchase_price = parseFloat(newBatch.unit_purchase_price);
      }
      if (editingBatchId) {
        await axios.put(`/api/batches/${editingBatchId}`, payload);
        toast.success("Batch updated successfully");
      } else {
        await axios.post(`/api/products/${initialData.id}/batches`, payload);
        toast.success("Batch added / updated successfully");
      }
      setNewBatch({
        batch_number: "",
        expiry_date: "",
        quantity: "",
        storage_location_id: form.storage_location_id ? String(form.storage_location_id) : "",
        rack: form.rack || "",
        unit_sale_price: "",
        unit_purchase_price: "",
      });
      setEditingBatchId(null);
      const bRes = await axios.get(`/api/products/${initialData.id}/batches`);
      setBatches(bRes.data);
    } catch (err) {
      const msg =
        err?.response?.data?.errors?.batch_number?.[0] ||
        err?.response?.data?.errors?.quantity?.[0] ||
        err?.response?.data?.message ||
        "Failed to save batch";
      toast.error(msg);
    } finally {
      setAddingBatch(false);
    }
  };

  const handleStartEditBatch = (batch) => {
    setEditingBatchId(batch.id);
    setNewBatch({
      batch_number: batch.batch_number || "",
      expiry_date: (batch.expiry_date || "").slice(0, 10),
      quantity: String(batch.quantity ?? 0),
      storage_location_id: batch.storage_location_id ? String(batch.storage_location_id) : "",
      rack: batch.rack || "",
      unit_sale_price: batch.unit_sale_price != null ? String(batch.unit_sale_price) : "",
      unit_purchase_price: batch.unit_purchase_price != null ? String(batch.unit_purchase_price) : "",
    });
  };

  const handleCancelEditBatch = () => {
    setEditingBatchId(null);
    setNewBatch({
      batch_number: "",
      expiry_date: "",
      quantity: "",
      storage_location_id: form.storage_location_id ? String(form.storage_location_id) : "",
      rack: form.rack || "",
      unit_sale_price: "",
      unit_purchase_price: "",
    });
  };

  const handleDeleteBatch = async (batchId) => {
    if (!window.confirm("Are you sure you want to delete this batch? (Allocated units will return to unassigned stock)")) return;
    setDeletingBatchId(batchId);
    try {
      await axios.delete(`/api/batches/${batchId}`);
      toast.success("Batch removed (units returned to unassigned stock)");
      const bRes = await axios.get(`/api/products/${initialData.id}/batches`);
      setBatches(bRes.data);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Cannot delete batch");
    } finally {
      setDeletingBatchId(null);
    }
  };

  // Calculate text color based on background brightness
  const primaryTextColor = useMemo(() => 
    getContrastText(themeColors.primaryHover || themeColors.primary), 
    [themeColors.primary, themeColors.primaryHover]
  );

  // ===== Load dropdown data =====
  const fetchStorageLocations = async () => {
    try {
      const locRes = await axios.get("/api/storage-locations");
      const locs = asList(locRes.data);
      setStorageLocations(locs);
      const defLoc = locs.find((l) => l.is_default) || locs[0];
      if (defLoc) {
        setForm((prev) => ({
          ...prev,
          storage_location_id: prev.storage_location_id ?? defLoc.id,
        }));
        setNewBatch((prev) => ({
          ...prev,
          storage_location_id: prev.storage_location_id || String(defLoc.id),
        }));
      }
    } catch {
      // ignore
    }
  };

  const fetchDropdowns = async () => {
    const [catRes, supRes, formRes] = await Promise.all([
      axios.get("/api/categories"),
      axios.get("/api/suppliers"),
      axios.get("/api/formulations").catch(() => ({ data: [] })),
      fetchStorageLocations(),
    ]);
    setCategories(asList(catRes.data));
    setSuppliers(asList(supRes.data));
    setFormulations(asList(formRes.data));
  };

  const handleCreateFormulation = async (rawName) => {
    const clean = normalizeFormulation(rawName);
    if (!clean) return "";

    setFormulations((prev) => {
      const lower = clean.toLowerCase();
      if (prev.some((f) => normalizeFormulation(typeof f === "string" ? f : f?.name).toLowerCase() === lower)) {
        return prev;
      }
      return [...prev, { name: clean }];
    });

    try {
      const res = await axios.post("/api/formulations", { name: clean });
      const canonical = normalizeFormulation(res.data?.name) || clean;
      setFormulations((prev) => {
        const lower = canonical.toLowerCase();
        const filtered = prev.filter(
          (f) => normalizeFormulation(typeof f === "string" ? f : f?.name).toLowerCase() !== lower
        );
        return [...filtered, { id: res.data?.id, name: canonical }];
      });
      return canonical;
    } catch {
      return clean;
    }
  };

  // ===== Preload a new product code =====
  const fetchNewCodes = async () => {
    const res = await axios.get("/api/products/new-code");
    setForm((prev) => ({
      ...prev,
      product_code: res.data.product_code,
      barcode: res.data.barcode,
    }));
  };

  // ===== Generate a new internal barcode only =====
  const handleGenerateBarcode = async () => {
    try {
      const res = await axios.get("/api/products/new-code");
      if (res.data?.barcode) {
        setForm((prev) => ({ ...prev, barcode: res.data.barcode }));
      }
    } catch {
      toast.error("Failed to generate barcode");
    }
  };

  // ===== Load batches & suppliers on edit =====
  const fetchBatches = async () => {
    if (isEdit && initialData?.id) {
      try {
        const [res, supRes] = await Promise.all([
          axios.get(`/api/products/${initialData.id}/batches`),
          axios.get(`/api/products/${initialData.id}/suppliers`).catch(() => ({ data: [] })),
        ]);
        setBatches(res.data);
        setProductSuppliers(Array.isArray(supRes.data) ? supRes.data : []);
      } catch (error) {
        console.error("Failed to fetch batches:", error);
      }
    }
  };

  const handleSaveSupplierLink = async (e) => {
    e.preventDefault();
    if (!newSupplierLink.supplier_id) {
      toast.error("Please select a supplier");
      return;
    }
    setSavingSupplierLink(true);
    try {
      await axios.post(`/api/products/${initialData.id}/suppliers`, {
        supplier_id: Number(newSupplierLink.supplier_id),
        supplier_sku: newSupplierLink.supplier_sku.trim() || null,
        last_purchase_price:
          newSupplierLink.last_purchase_price !== "" ? Number(newSupplierLink.last_purchase_price) : null,
        lead_time_days:
          newSupplierLink.lead_time_days !== "" ? Number(newSupplierLink.lead_time_days) : null,
        min_order_qty: Number(newSupplierLink.min_order_qty) || 1,
        is_preferred: Boolean(newSupplierLink.is_preferred),
      });
      toast.success("Supplier linked to product");
      setNewSupplierLink({
        supplier_id: "",
        supplier_sku: "",
        last_purchase_price: "",
        lead_time_days: "",
        min_order_qty: "1",
        is_preferred: false,
      });
      const supRes = await axios.get(`/api/products/${initialData.id}/suppliers`);
      setProductSuppliers(Array.isArray(supRes.data) ? supRes.data : []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to link supplier");
    } finally {
      setSavingSupplierLink(false);
    }
  };

  const handleRemoveSupplierLink = async (supplierId) => {
    try {
      await axios.delete(`/api/products/${initialData.id}/suppliers/${supplierId}`);
      toast.success("Supplier unlinked");
      const supRes = await axios.get(`/api/products/${initialData.id}/suppliers`);
      setProductSuppliers(Array.isArray(supRes.data) ? supRes.data : []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Cannot remove supplier");
    }
  };

  // ===== Preload selected Brand label on edit =====
  const preloadBrandOption = async (brandId) => {
    if (!brandId) return;
    try {
      const res = await axios.get(`/api/brands/${brandId}`);
      const b = res.data;
      if (b?.id && b?.name) {
        setForm((prev) => ({ ...prev, brand: b }));
      }
    } catch {
      // ignore
    }
  };

  // Initial data fetch
  useEffect(() => {
    const loadData = async () => {
      await fetchDropdowns();
      if (!isEdit) {
        await fetchNewCodes();
      } else {
        if (initialData?.image) {
          const imageUrl = `${window.location.origin}/storage/${initialData.image}`;
          setFiles([{ source: imageUrl, options: { type: "remote" } }]);
        }
        await fetchBatches();
        if (initialData?.brand_id && !initialData?.brand?.name) {
          await preloadBrandOption(initialData.brand_id);
        }
      }
      setIsLoaded(true);
    };
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus Name after form is loaded and rendered
  useEffect(() => {
    if (isLoaded) {
      const timer = setTimeout(() => {
        formFieldsRef.current?.focusName();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoaded, isEdit]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const flushedFormulation = formFieldsRef.current?.flushPendingFormulation?.();
      const payloadForm =
        flushedFormulation !== undefined
          ? { ...form, formulation: flushedFormulation }
          : form;

      const formData = new FormData();
      Object.keys(payloadForm).forEach((key) => {
        if (payloadForm[key] !== undefined && payloadForm[key] !== null) {
          formData.append(key, payloadForm[key]);
        }
      });

      if (files.length > 0 && files[0].file) {
        formData.append("image", files[0].file);
      }

      if (isEdit) {
        const { data } = await axios.post(`/api/products/${initialData.id}?_method=PUT`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        if (data?.formulation) {
          setForm((prev) => ({ ...prev, formulation: data.formulation }));
        }
        toast.success("✅ Product updated!");
      } else {
        const { data } = await axios.post("/api/products", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        if (data?.formulation) {
          setFormulations((prev) => {
            const clean = normalizeFormulation(data.formulation);
            const lower = clean.toLowerCase();
            if (!clean || prev.some((f) => normalizeFormulation(typeof f === "string" ? f : f?.name).toLowerCase() === lower)) {
              return prev;
            }
            return [...prev, { name: clean }];
          });
        }
        toast.success("✅ Product added!");
        setForm({ narcotic: "no" });
        setFiles([]);
        await fetchNewCodes();
        setTimeout(() => formFieldsRef.current?.focusName(), 50);
      }


      if (onSubmitSuccess) onSubmitSuccess();
    } catch (error) {
      if (error.response?.status === 422) {
        const errors = error.response.data.errors;
        Object.values(errors).forEach((messages) => {
          messages.forEach((msg) => toast.error(msg));
        });
      } else {
        toast.error("❌ Something went wrong. Please try again.");
      }
    }
  };

  // ===== Keyboard Shortcuts =====
  useEffect(() => {
    const handleShortcut = (e) => {
      if (e.altKey && (e.key.toLowerCase() === "s" || e.key.toLowerCase() === "n")) {
        e.preventDefault();
        document.getElementById("save-product-btn-top")?.click();
      }
      if (e.altKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        navigate("/products");
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [navigate]);

  // ===== Brand: async server-side search =====
  const loadBrandOptions = async (inputValue) => {
    try {
      const res = await axios.get("/api/brands", {
        params: { q_name: inputValue || "", per_page: 25 },
      });
      return asList(res.data).map((b) => ({ value: b.id, label: b.name }));
    } catch {
      return [];
    }
  };

  // ===== Helper for react-select styles =====
  const getSmallSelectStyles = () => ({
    control: (base, state) => ({ ...base, minHeight: "40px", borderRadius: 12, backgroundColor: "var(--color-surface)", borderColor: state.isFocused ? "var(--color-primary)" : "var(--color-border)", boxShadow: state.isFocused ? "0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent)" : "none", fontSize: "var(--type-input)" }),
    valueContainer: (base) => ({ ...base, padding: "4px 10px" }),
    input: (base) => ({ ...base, color: "var(--color-text-primary)", margin: 0, padding: 0 }),
    singleValue: (base) => ({ ...base, color: "var(--color-text-primary)" }),
    placeholder: (base) => ({ ...base, color: "var(--color-text-secondary)" }),
    menuPortal: (base) => ({ ...base, zIndex: 50 }),
    menu: (base) => ({ ...base, backgroundColor: "var(--color-surface)", borderRadius: 14, border: "1px solid var(--color-border)", overflow: "hidden" }),
    option: (base, state) => ({ ...base, minHeight: 44, backgroundColor: state.isSelected || state.isFocused ? "color-mix(in srgb, var(--color-primary) 15%, var(--color-surface))" : "var(--color-surface)", color: "var(--color-text-primary)", cursor: "pointer" }),
  });

  // ===== Dynamic Button styles using theme colors =====
  // Get button style classes and styles based on theme button_style
  
  // Get button style classes and styles based on theme button_style
  const getButtonClasses = useMemo(() => {
    const radiusMap = {
      'modern':     'rounded-xl',
      'rounded':    'rounded-lg',
      'rounded-sm': 'rounded-md',
      'outlined':   'rounded-lg',
      'soft':       'rounded-2xl',
      'pill':       'rounded-full',
    };
    const radiusClass = radiusMap[buttonStyle] || 'rounded-xl';
    
    if (buttonStyle === 'outlined') {
      return {
        primary: {
          className: `${radiusClass} border-2 transition-all duration-200`,
          style: {
            borderColor: themeColors.primary,
            color: themeColors.primary,
            backgroundColor: 'transparent',
          }
        },
        glass: {
          className: `${radiusClass} transition-all duration-200`,
          style: {
            backgroundColor: 'transparent',
            color: isDark ? '#f1f5f9' : '#111827',
          }
        },
      };
    }
    
    if (buttonStyle === 'modern') {
      return {
        primary: {
          className: `${radiusClass} font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]`,
          style: {
            background: `linear-gradient(135deg, ${themeColors.primary}, ${themeColors.primaryHover})`,
            color: 'white',
            boxShadow: `0 4px 14px 0 ${themeColors.primary}45, 0 1px 2px 0 rgba(0,0,0,0.06)`,
            border: '1px solid rgba(255, 255, 255, 0.25)',
          }
        },
        secondary: {
          className: `${radiusClass} font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]`,
          style: {
            background: `linear-gradient(135deg, ${themeColors.secondary}, ${themeColors.secondaryHover})`,
            color: 'white',
            boxShadow: `0 4px 14px 0 ${themeColors.secondary}45, 0 1px 2px 0 rgba(0,0,0,0.06)`,
            border: '1px solid rgba(255, 255, 255, 0.25)',
          }
        },
        danger: {
          className: `${radiusClass} font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]`,
          style: {
            background: `linear-gradient(135deg, ${themeColors.danger}, ${themeColors.dangerHover})`,
            color: 'white',
            boxShadow: '0 4px 14px 0 rgba(239, 68, 68, 0.45), 0 1px 2px 0 rgba(0,0,0,0.06)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
          }
        },
      };
    }

    // Filled styles for rounded, soft, pill, rounded-sm
    return {
      primary: {
        className: radiusClass,
        style: {
          background: `linear-gradient(to bottom right, ${themeColors.primary}, ${themeColors.primaryHover})`,
          color: 'white',
          boxShadow: `0 4px 14px 0 ${themeColors.primary}40`,
        }
      },
      glass: {
        className: radiusClass,
        style: {
          backgroundColor: isDark ? 'rgba(51, 65, 85, 0.6)' : 'rgba(255, 255, 255, 0.8)',
          color: isDark ? '#f1f5f9' : '#111827',
          backdropFilter: 'blur(6px)',
          border: isDark ? '1px solid rgba(71, 85, 105, 0.5)' : '1px solid rgba(229, 231, 235, 0.6)',
        }
      },
    };
  }, [buttonStyle, themeColors, isDark]);

  // Destructure button classes for easier use
  const btnPrimary = getButtonClasses.primary;
  const btnGlass = getButtonClasses.glass;

  // ===== Loading State =====
  if (!isLoaded) {
    return (
      <div className="p-3 md:p-4">
        <GlassCard className="product-form-panel">
          <div className="flex items-center justify-center py-12">
            <span className="text-gray-500 dark:text-slate-400">Loading...</span>
          </div>
        </GlassCard>
      </div>
    );
  }

  // ===== Add Mode: Full Width Card =====
  if (!isEdit) {
    return (
      <>
        <GlassCard className="product-form-panel">
          <form id="product-form" onSubmit={handleSubmit} className="product-form-body">
            <ProductFormFields
              ref={formFieldsRef}
              form={form}
              files={files}
              batches={batches}
              categories={categories}
              suppliers={suppliers}
              formulations={formulations}
              onCreateFormulation={handleCreateFormulation}
              storageLocations={storageLocations}
              onOpenManageLocations={() => setManageLocationsOpen(true)}
              isEdit={isEdit}
              handleChange={handleChange}
              onGenerateBarcode={handleGenerateBarcode}
              loadBrandOptions={loadBrandOptions}
              getSmallSelectStyles={getSmallSelectStyles}
              isDark={isDark}
              onFilesChange={setFiles}
              setFiles={setFiles}
              themeColors={themeColors}
              primaryTextColor={primaryTextColor}
            />
          </form>
        </GlassCard>
        <ManageStorageLocationsModal
          isOpen={manageLocationsOpen}
          onClose={() => setManageLocationsOpen(false)}
          storageLocations={storageLocations}
          onChanged={fetchStorageLocations}
          isDark={isDark}
          selectStyles={getSmallSelectStyles(isDark)}
        />
      </>
    );
  }

  // ===== Edit Mode: Clean Full-Width Stacked Sections =====
  return (
    <div className="product-form-page">
      <div className="product-form-edit-grid">
        {/* Section 1: Main Product Information & Pricing */}
        <GlassCard className="product-form-panel product-form-edit-main">
          <div className="product-form-page-heading">
            <div className="flex items-center gap-3">
              <div className="products-identity-icon">
                <CubeIcon className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Product</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Update core product details, pricing, margins, and alert thresholds
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link 
                to="/products" 
                className="products-action theme-btn-secondary"
                title="Back (Alt+C)"
              >
                <ArrowLeftIcon className="w-4 h-4" />
                <span className="text-sm">Back</span>
              </Link>
              <button
                id="save-product-btn-top"
                type="submit"
                form="product-form"
                className="products-action products-action-primary theme-btn-primary"
                title="Save (Alt+S)"
              >
                <PencilSquareIcon className="w-4 h-4" />
                <span className="text-sm font-medium">Save Changes</span>
              </button>
            </div>
          </div>

          <form id="product-form" onSubmit={handleSubmit} className="product-form-body">
            <ProductFormFields
              ref={formFieldsRef}
              form={form}
              files={files}
              batches={batches}
              categories={categories}
              suppliers={suppliers}
              formulations={formulations}
              onCreateFormulation={handleCreateFormulation}
              storageLocations={storageLocations}
              onOpenManageLocations={() => setManageLocationsOpen(true)}
              isEdit={isEdit}
              handleChange={handleChange}
              onGenerateBarcode={handleGenerateBarcode}
              loadBrandOptions={loadBrandOptions}
              getSmallSelectStyles={getSmallSelectStyles}
              isDark={isDark}
              onFilesChange={setFiles}
              setFiles={setFiles}
              themeColors={themeColors}
              primaryTextColor={primaryTextColor}
            />
          </form>
        </GlassCard>

        {/* Section 2: Batches & Expiry (FEFO) Panel — Clean & Spacious */}
        <GlassCard className="product-form-panel product-form-batches">
          <div className="product-form-batches-heading flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base font-bold text-gray-900 dark:text-white">
                  Batches & Expiry Management (FEFO)
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 font-semibold">
                  {realBatches.length} {realBatches.length === 1 ? "batch" : "batches"}
                </span>
                <button
                  type="button"
                  onClick={() => setManageLocationsOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800/70 hover:bg-indigo-100 cursor-pointer"
                  title="Manage Shop, Godown & Fridge storage locations"
                >
                  <BuildingStorefrontIcon className="w-3.5 h-3.5" />
                  <span>Manage Locations</span>
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                First-Expired, First-Out (FEFO) queue for POS and sales. Assign storage locations (Shop, Godown, Fridge) and move stock in 1 click.
              </p>
              {locationSummary.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  {locationSummary.map((ls) => {
                    const meta = getLocationTypeMeta(ls.type);
                    return (
                      <span
                        key={ls.id}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${meta.badgeClass}`}
                      >
                        <span>{ls.label}:</span>
                        <span className="font-mono font-bold">{ls.qty} units</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Spacious Stock Breakdown Pills */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:min-w-[360px]">
              <div className="px-3.5 py-2 rounded-xl bg-gray-100/80 dark:bg-slate-800/80 border border-gray-200/70 dark:border-slate-700/70 text-center">
                <span className="block text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-slate-400">
                  Total Stock
                </span>
                <span className="font-mono font-bold text-gray-900 dark:text-white text-base tabular-nums">
                  {totalStock}
                </span>
              </div>
              <div className="px-3.5 py-2 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-900/60 text-center">
                <span className="block text-[10px] uppercase tracking-wider font-bold text-blue-600 dark:text-blue-400">
                  Batched
                </span>
                <span className="font-mono font-bold text-blue-700 dark:text-blue-300 text-base tabular-nums">
                  {batchedStock}
                </span>
              </div>
              <div className="px-3.5 py-2 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-900/60 text-center">
                <span className="block text-[10px] uppercase tracking-wider font-bold text-emerald-600 dark:text-emerald-400">
                  Unassigned
                </span>
                <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300 text-base tabular-nums">
                  {unassignedStock}
                </span>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-6">
            {isEdit ? (
              <form
                onSubmit={handleAddBatch}
                className="p-4 sm:p-5 rounded-2xl bg-gray-50/70 dark:bg-slate-800/50 border border-gray-200/70 dark:border-slate-700/70 space-y-4"
              >
                {/* Top Toolbar of Batch Form with React-Select Batch Switcher */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-200/70 dark:border-slate-700/70">
                  <div className="flex items-center gap-2">
                    <div
                      className={`p-2 rounded-xl ${
                        editingBatchId
                          ? "bg-amber-100 text-amber-600 dark:bg-amber-950/70 dark:text-amber-400"
                          : "bg-blue-100 text-blue-600 dark:bg-blue-950/70 dark:text-blue-400"
                      }`}
                    >
                      {editingBatchId ? (
                        <PencilSquareIcon className="w-4 h-4" />
                      ) : (
                        <PlusIcon className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                        {editingBatchId
                          ? `Editing Batch: ${editingBatchObj?.batch_number || ""}`
                          : "Add New Batch or Update Existing"}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        {maxBatchAssignable > 0
                          ? `Up to ${maxBatchAssignable} unassigned units available to allocate to this batch`
                          : "0 unassigned units available — select an existing batch to edit or add stock first"}
                      </p>
                    </div>
                  </div>

                  <div className="w-full sm:w-80">
                    <label
                      htmlFor="batch-quick-select"
                      className="block text-[11px] font-medium text-gray-600 dark:text-slate-300 mb-1"
                    >
                      Quick Select Batch (Mode)
                    </label>
                    <Select
                      inputId="batch-quick-select"
                      options={batchPickerOptions}
                      value={
                        editingBatchId
                          ? batchPickerOptions.find((o) => o.value === String(editingBatchId)) ||
                            batchPickerOptions[0]
                          : batchPickerOptions[0]
                      }
                      onChange={(opt) => {
                        if (!opt || opt.value === "__new__") {
                          handleCancelEditBatch();
                        } else if (opt.batch) {
                          handleStartEditBatch(opt.batch);
                        }
                      }}
                      classNamePrefix="rs"
                      isSearchable
                      styles={getSmallSelectStyles(isDark)}
                      menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                    />
                  </div>
                </div>

                {/* Spacious 7-Column Input Grid (Batch #, Expiry, Qty, Location, Rack, MRP, Cost) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3.5">
                  <div>
                    <label
                      htmlFor="batch-number-input"
                      className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1"
                    >
                      Batch Number *
                    </label>
                    <GlassInput
                      id="batch-number-input"
                      type="text"
                      placeholder="e.g. B-101"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      value={newBatch.batch_number}
                      onChange={(e) => setNewBatch((p) => ({ ...p, batch_number: e.target.value }))}
                      className="w-full text-sm font-medium bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="batch-expiry-input"
                      className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1"
                    >
                      Expiry Date *
                    </label>
                    <GlassInput
                      id="batch-expiry-input"
                      type="date"
                      value={newBatch.expiry_date}
                      onChange={(e) => setNewBatch((p) => ({ ...p, expiry_date: e.target.value }))}
                      className="w-full text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label
                        htmlFor="batch-qty-input"
                        className="block text-xs font-medium text-gray-700 dark:text-slate-300"
                      >
                        Batch Quantity
                      </label>
                      <span
                        className={`text-[11px] font-semibold ${
                          maxBatchAssignable > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        Max: {maxBatchAssignable}
                      </span>
                    </div>
                    <GlassInput
                      id="batch-qty-input"
                      type="number"
                      min="0"
                      max={maxBatchAssignable}
                      placeholder={`Max ${maxBatchAssignable}`}
                      value={newBatch.quantity}
                      onChange={(e) => setNewBatch((p) => ({ ...p, quantity: e.target.value }))}
                      className="w-full text-sm font-mono tabular-nums bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="batch-location-select"
                      className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1"
                    >
                      Storage Location
                    </label>
                    <Select
                      inputId="batch-location-select"
                      options={storageLocations.map((loc) => ({
                        value: String(loc.id),
                        label: `${loc.name} (${loc.code})`,
                        location: loc,
                      }))}
                      value={
                        storageLocations
                          .map((loc) => ({
                            value: String(loc.id),
                            label: `${loc.name} (${loc.code})`,
                            location: loc,
                          }))
                          .find(
                            (opt) =>
                              opt.value ===
                              String(newBatch.storage_location_id || form.storage_location_id || "")
                          ) || null
                      }
                      onChange={(opt) =>
                        setNewBatch((p) => ({
                          ...p,
                          storage_location_id: opt?.value || "",
                          rack: p.rack || opt?.location?.default_rack || "",
                        }))
                      }
                      placeholder="Select location..."
                      classNamePrefix="rs"
                      isSearchable
                      styles={getSmallSelectStyles(isDark)}
                      menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="batch-rack-input"
                      className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1"
                    >
                      Rack / Shelf Code
                    </label>
                    <GlassInput
                      id="batch-rack-input"
                      type="text"
                      placeholder={form.rack ? `Default: ${form.rack}` : "e.g. R-04 / S2"}
                      value={newBatch.rack}
                      onChange={(e) => setNewBatch((p) => ({ ...p, rack: e.target.value }))}
                      className="w-full text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="batch-mrp-input"
                      className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1"
                    >
                      Batch Unit MRP (Sale)
                    </label>
                    <GlassInput
                      id="batch-mrp-input"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={
                        form.unit_sale_price ? `Default: ${form.unit_sale_price}` : "0.00"
                      }
                      value={newBatch.unit_sale_price}
                      onChange={(e) =>
                        setNewBatch((p) => ({ ...p, unit_sale_price: e.target.value }))
                      }
                      className="w-full text-sm font-mono tabular-nums bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="batch-cost-input"
                      className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1"
                    >
                      Batch Unit Cost
                    </label>
                    <GlassInput
                      id="batch-cost-input"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={
                        form.unit_purchase_price ? `Default: ${form.unit_purchase_price}` : "0.00"
                      }
                      value={newBatch.unit_purchase_price}
                      onChange={(e) =>
                        setNewBatch((p) => ({ ...p, unit_purchase_price: e.target.value }))
                      }
                      className="w-full text-sm font-mono tabular-nums bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-1">
                  {editingBatchId && (
                    <button
                      type="button"
                      onClick={handleCancelEditBatch}
                      className="text-xs px-4 py-2 rounded-xl font-medium border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      Cancel Edit
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={addingBatch}
                    className={`${themeButtonClasses.primary} text-xs px-4 py-2 rounded-xl font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50`}
                  >
                    {editingBatchId ? (
                      <PencilSquareIcon className="w-4 h-4" />
                    ) : (
                      <PlusIcon className="w-4 h-4" />
                    )}
                    <span>
                      {addingBatch
                        ? "Saving..."
                        : editingBatchId
                        ? "Update Batch"
                        : "Save Batch"}
                    </span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/60 text-xs text-blue-700 dark:text-blue-300">
                Save the product first to add and configure specific batches and expiry dates.
              </div>
            )}

            {/* Batch Inventory Filter Toolbar + Table */}
            {realBatches.length > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                  <div>
                    <label
                      htmlFor="batch-search-filter"
                      className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1"
                    >
                      Search Batches
                    </label>
                    <GlassInput
                      id="batch-search-filter"
                      type="text"
                      placeholder="Filter by batch #, rack, or expiry..."
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      value={batchSearchQuery}
                      onChange={(e) => setBatchSearchQuery(e.target.value)}
                      className="w-full text-sm bg-white dark:bg-slate-700"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="batch-location-filter"
                      className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1"
                    >
                      Filter Location
                    </label>
                    <Select
                      inputId="batch-location-filter"
                      options={batchLocationOptions}
                      value={
                        batchLocationOptions.find((o) => o.value === String(batchLocationFilter)) ||
                        batchLocationOptions[0]
                      }
                      onChange={(opt) => setBatchLocationFilter(opt?.value || "all")}
                      classNamePrefix="rs"
                      isSearchable
                      styles={getSmallSelectStyles(isDark)}
                      menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="batch-status-select"
                      className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1"
                    >
                      Filter Status
                    </label>
                    <Select
                      inputId="batch-status-select"
                      options={batchStatusOptions}
                      value={
                        batchStatusOptions.find((o) => o.value === batchStatusFilter) ||
                        batchStatusOptions[0]
                      }
                      onChange={(opt) => setBatchStatusFilter(opt?.value || "all")}
                      classNamePrefix="rs"
                      isSearchable={false}
                      styles={getSmallSelectStyles(isDark)}
                      menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="batch-sort-select"
                      className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1"
                    >
                      Sort Batches
                    </label>
                    <Select
                      inputId="batch-sort-select"
                      options={batchSortOptions}
                      value={
                        batchSortOptions.find((o) => o.value === batchSortOrder) ||
                        batchSortOptions[0]
                      }
                      onChange={(opt) => setBatchSortOrder(opt?.value || "fefo")}
                      classNamePrefix="rs"
                      isSearchable={false}
                      styles={getSmallSelectStyles(isDark)}
                      menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                    />
                  </div>
                </div>

                <div className="product-form-batch-scroll overflow-hidden rounded-2xl border border-gray-200/80 dark:border-slate-700/80">
                  <table className="w-full text-xs sm:text-sm">
                    <thead className="bg-gray-50/95 dark:bg-slate-700/90 border-b border-gray-200/80 dark:border-slate-600/80 text-left">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-semibold text-gray-700 dark:text-slate-200">
                          Batch #
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold text-gray-700 dark:text-slate-200">
                          Expiry Date
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold text-gray-700 dark:text-slate-200">
                          Location & Rack
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-slate-200">
                          Unit Cost
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-slate-200">
                          Unit MRP (Sale)
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-slate-200">
                          Batch Qty
                        </th>
                        {isEdit && (
                          <th scope="col" className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-slate-200">
                            Actions
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
                      {filteredBatches.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-6 text-center text-xs text-gray-500 dark:text-slate-400">
                            No batches match the selected filter criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredBatches.map((batch, i) => {
                          const isBeingEdited = Number(editingBatchId) === Number(batch.id);
                          const locObj =
                            batch.storage_location ||
                            storageLocations.find(
                              (l) => Number(l.id) === Number(batch.storage_location_id)
                            );
                          const locMeta = getLocationTypeMeta(locObj?.type || "shop");
                          const effectiveRack = batch.rack || form.rack || locObj?.default_rack || "";
                          return (
                            <tr
                              key={batch.id || i}
                              className={`text-gray-900 dark:text-slate-200 transition-colors ${
                                isBeingEdited
                                  ? "bg-amber-50/70 dark:bg-amber-950/30"
                                  : i % 2
                                  ? "bg-white/50 dark:bg-slate-800/40"
                                  : "bg-white/90 dark:bg-slate-800/80"
                              } hover:bg-blue-50/40 dark:hover:bg-slate-700/40`}
                            >
                              <td className="px-4 py-3 font-semibold">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono">{batch.batch_number}</span>
                                  {batch.is_fefo_recommended && (
                                    <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300/60 text-[10px] font-bold rounded-full uppercase tracking-wider">
                                      FEFO Pick
                                    </span>
                                  )}
                                  {batch.is_expired && (
                                    <span className="px-2 py-0.5 bg-red-100 dark:bg-red-950/70 text-red-700 dark:text-red-300 border border-red-300/60 text-[10px] font-bold rounded-full uppercase tracking-wider">
                                      Expired
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-slate-300">
                                {batch.expiry_date}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${locMeta.badgeClass}`}
                                  >
                                    {locObj?.name || "Shop Counter"}
                                  </span>
                                  {effectiveRack && (
                                    <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300">
                                      {effectiveRack}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-700 dark:text-slate-300">
                                {batch.unit_purchase_price != null ? (
                                  <span className="font-semibold">
                                    {Number(batch.unit_purchase_price).toFixed(2)}
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-400 dark:text-slate-500">
                                    {form.unit_purchase_price
                                      ? `Default (${Number(form.unit_purchase_price).toFixed(2)})`
                                      : "—"}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-mono tabular-nums">
                                {batch.unit_sale_price != null ? (
                                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                    {Number(batch.unit_sale_price).toFixed(2)}
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-400 dark:text-slate-500">
                                    {form.unit_sale_price
                                      ? `Default (${Number(form.unit_sale_price).toFixed(2)})`
                                      : "—"}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-mono tabular-nums font-bold">
                                {batch.quantity}
                              </td>
                              {isEdit && (
                                <td className="px-4 py-3 text-right">
                                  <div className="inline-flex items-center justify-end gap-1.5">
                                    {Number(batch.quantity) > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => setMoveModalBatch(batch)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50/70 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors cursor-pointer"
                                        title="Move or split stock to another location (e.g. Godown to Shop Counter)"
                                      >
                                        <ArrowsRightLeftIcon className="w-3.5 h-3.5" />
                                        <span>Move</span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleStartEditBatch(batch)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50/70 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors cursor-pointer"
                                      title="Edit batch"
                                      aria-label={`Edit batch ${batch.batch_number}`}
                                    >
                                      <PencilSquareIcon className="w-3.5 h-3.5" />
                                      <span>Edit</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteBatch(batch.id)}
                                      disabled={deletingBatchId === batch.id}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 bg-red-50/70 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 transition-colors cursor-pointer disabled:opacity-50"
                                      title="Delete batch"
                                      aria-label={`Delete batch ${batch.batch_number}`}
                                    >
                                      <TrashIcon className="w-3.5 h-3.5" />
                                      <span>Delete</span>
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 dark:text-slate-400 text-sm text-center py-8 bg-gray-50/50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-gray-200 dark:border-slate-700">
                No batches created yet for this product. Use the form above to allocate stock to a batch.
              </p>
            )}
          </div>
        </GlassCard>

        {/* Section 3: Multi-Supplier Catalog & Lead Times Card — Powered by React-Select */}
        {isEdit && (
          <GlassCard className="product-form-panel p-0 overflow-hidden">
            <div className="product-form-batches-heading flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">
                    Multi-Supplier Catalog & Lead Times
                  </h2>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold">
                    {productSuppliers.length}{" "}
                    {productSuppliers.length === 1 ? "supplier" : "suppliers"}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  Link secondary distributors, vendor SKUs, last purchase rates, minimum order quantities, and delivery lead times.
                </p>
              </div>
            </div>

            <div className="p-5 space-y-5">
              <form
                onSubmit={handleSaveSupplierLink}
                className="p-4 sm:p-5 rounded-2xl bg-gray-50/70 dark:bg-slate-800/50 border border-gray-200/70 dark:border-slate-700/70 space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="multi-supplier-select"
                      className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1"
                    >
                      Supplier *
                    </label>
                    <Select
                      inputId="multi-supplier-select"
                      options={asList(suppliers).map((s) => ({
                        value: s.id,
                        label: s.name,
                      }))}
                      value={
                        asList(suppliers)
                          .map((s) => ({ value: s.id, label: s.name }))
                          .find((opt) => opt.value === Number(newSupplierLink.supplier_id)) || null
                      }
                      onChange={(opt) =>
                        setNewSupplierLink((p) => ({
                          ...p,
                          supplier_id: opt?.value ? String(opt.value) : "",
                        }))
                      }
                      placeholder="Search and select supplier..."
                      isClearable
                      isSearchable
                      classNamePrefix="rs"
                      styles={getSmallSelectStyles(isDark)}
                      menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="multi-supplier-priority"
                      className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1"
                    >
                      Supplier Priority
                    </label>
                    <Select
                      inputId="multi-supplier-priority"
                      options={supplierPriorityOptions}
                      value={
                        newSupplierLink.is_preferred
                          ? supplierPriorityOptions[1]
                          : supplierPriorityOptions[0]
                      }
                      onChange={(opt) =>
                        setNewSupplierLink((p) => ({
                          ...p,
                          is_preferred: opt?.value === "preferred",
                        }))
                      }
                      isSearchable={false}
                      classNamePrefix="rs"
                      styles={getSmallSelectStyles(isDark)}
                      menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="multi-supplier-rate"
                      className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1"
                    >
                      Last Unit Rate
                    </label>
                    <GlassInput
                      id="multi-supplier-rate"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={newSupplierLink.last_purchase_price}
                      onChange={(e) =>
                        setNewSupplierLink((p) => ({
                          ...p,
                          last_purchase_price: e.target.value,
                        }))
                      }
                      className="w-full text-sm font-mono tabular-nums bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="multi-supplier-lead"
                      className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1"
                    >
                      Lead Time (Days)
                    </label>
                    <GlassInput
                      id="multi-supplier-lead"
                      type="number"
                      min="0"
                      placeholder="e.g. 2"
                      value={newSupplierLink.lead_time_days}
                      onChange={(e) =>
                        setNewSupplierLink((p) => ({
                          ...p,
                          lead_time_days: e.target.value,
                        }))
                      }
                      className="w-full text-sm font-mono tabular-nums bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="multi-supplier-sku"
                      className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1"
                    >
                      Vendor SKU / Code
                    </label>
                    <GlassInput
                      id="multi-supplier-sku"
                      type="text"
                      placeholder="Optional code"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      value={newSupplierLink.supplier_sku}
                      onChange={(e) =>
                        setNewSupplierLink((p) => ({
                          ...p,
                          supplier_sku: e.target.value,
                        }))
                      }
                      className="w-full text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end pt-1">
                  <button
                    type="submit"
                    disabled={savingSupplierLink}
                    className={`${themeButtonClasses.primary} text-xs px-4 py-2 rounded-xl font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50`}
                  >
                    <PlusIcon className="w-4 h-4" />
                    <span>{savingSupplierLink ? "Linking..." : "Link Supplier"}</span>
                  </button>
                </div>
              </form>

              {productSuppliers.length > 0 && (
                <div className="product-form-batch-scroll overflow-hidden rounded-2xl border border-gray-200/80 dark:border-slate-700/80">
                  <table className="w-full text-xs sm:text-sm">
                    <thead className="bg-gray-50/95 dark:bg-slate-700/90 border-b border-gray-200/80 dark:border-slate-600/80 text-left">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-semibold text-gray-700 dark:text-slate-200">
                          Supplier
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold text-gray-700 dark:text-slate-200">
                          Vendor SKU
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-slate-200">
                          Last Unit Rate
                        </th>
                        <th scope="col" className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-slate-200">
                          Lead Time
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-slate-200">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
                      {productSuppliers.map((ps, idx) => (
                        <tr
                          key={ps.id}
                          className={`text-gray-900 dark:text-slate-200 ${
                            idx % 2
                              ? "bg-white/50 dark:bg-slate-800/40"
                              : "bg-white/90 dark:bg-slate-800/80"
                          }`}
                        >
                          <td className="px-4 py-3 font-semibold">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>{ps.supplier?.name || `#${ps.supplier_id}`}</span>
                              {ps.is_preferred && (
                                <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold rounded-full uppercase tracking-wider">
                                  Preferred
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-slate-400">
                            {ps.supplier_sku || "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                            {ps.last_purchase_price != null
                              ? Number(ps.last_purchase_price).toFixed(2)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-xs">
                            {ps.lead_time_days != null ? `${ps.lead_time_days} days` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {Number(ps.supplier_id) !== Number(form.supplier_id) ? (
                              <button
                                type="button"
                                onClick={() => handleRemoveSupplierLink(ps.supplier_id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50/70 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 rounded-lg cursor-pointer"
                                title="Remove secondary supplier"
                              >
                                <TrashIcon className="w-3.5 h-3.5" />
                                <span>Unlink</span>
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400 dark:text-slate-500">
                                Primary Supplier
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </GlassCard>
        )}
      </div>

      <MoveBatchLocationModal
        isOpen={Boolean(moveModalBatch)}
        onClose={() => setMoveModalBatch(null)}
        batch={moveModalBatch}
        storageLocations={storageLocations}
        onMoved={fetchBatches}
        isDark={isDark}
        selectStyles={getSmallSelectStyles(isDark)}
        packSize={form.pack_size || 1}
      />

      <ManageStorageLocationsModal
        isOpen={manageLocationsOpen}
        onClose={() => setManageLocationsOpen(false)}
        storageLocations={storageLocations}
        onChanged={fetchStorageLocations}
        isDark={isDark}
        selectStyles={getSmallSelectStyles(isDark)}
      />
    </div>
  );
}

