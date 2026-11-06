// resources/js/pages/Barcodes/Index.jsx
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import Select from "react-select";
import { useSearchParams } from "react-router-dom";
import { useTheme } from "@/context/ThemeContext";
import { useCurrency } from "@/context/CurrencyContext";
import { usePermissions } from "@/api/usePermissions";
import { getThemeButtonClasses } from "@/utils/buttonStyles";
import { BarcodeSvg, generateBarcodeSvgString } from "@/utils/barcode";
import ProductSearchInput from "@/components/ProductSearchInput.jsx";
import { printHtmlViaIframe } from "@/utils/printHelper.js";
import {
  QrCodeIcon,
  PrinterIcon,
  Cog6ToothIcon,
  PlusIcon,
  TrashIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  AdjustmentsHorizontalIcon,
  DocumentDuplicateIcon,
  EyeIcon,
  CalendarDaysIcon,
  TagIcon,
  BuildingStorefrontIcon,
  SparklesIcon,
  Squares2X2Icon,
  MagnifyingGlassIcon,
  XMarkIcon,
  DocumentArrowDownIcon,
  BookmarkSquareIcon,
  ClipboardDocumentListIcon,
  CheckIcon,
} from "@heroicons/react/24/solid";

const TABS = [
  { id: "queue", label: "Print Queue & Items", icon: DocumentDuplicateIcon },
  { id: "designer", label: "Label Content & Styling", icon: AdjustmentsHorizontalIcon },
  { id: "paper", label: "Paper & Grid Setup", icon: Squares2X2Icon },
];

export default function BarcodeIndex() {
  const { theme, isDark } = useTheme();
  const { formatCurrency, currencySymbol } = useCurrency();
  const { loading: permsLoading, has } = usePermissions();
  const [searchParams] = useSearchParams();

  const canViewBarcode = !permsLoading && (has("barcode.view") || has("barcode.print"));
  const canPrintBarcode = !permsLoading && (has("barcode.print") || has("barcode.view"));
  const canSaveTemplate = !permsLoading && (has("barcode.create") || has("barcode.update"));
  const canDeleteTemplate = !permsLoading && (has("barcode.delete") || has("barcode.update"));

  // Navigation tab
  const [activeTab, setActiveTab] = useState("queue");

  // Templates & Store Settings from API
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [storeInfo, setStoreInfo] = useState({
    store_name: "My Store",
    phone_number: "",
    currency_symbol: "Rs.",
  });
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  // Template Form & Layout state
  const [layout, setLayout] = useState({
    name: "Custom Label",
    paper_type: "roll", // "roll" | "sheet"
    width_mm: 50.0,
    height_mm: 25.0,
    orientation: "landscape",
    columns: 1,
    rows: 1,
    gap_x_mm: 0,
    gap_y_mm: 3.0,
    margin_top_mm: 1.0,
    margin_left_mm: 1.0,
    margin_right_mm: 1.0,
    margin_bottom_mm: 1.0,
    options: {
      show_store_name: true,
      store_name_override: "",
      show_product_name: true,
      name_lines: 2,
      show_product_code: false,
      show_barcode: true,
      barcode_height: 28,
      bar_width: 1.3,
      show_barcode_text: true,
      show_price: true,
      price_type: "retail", // "retail" | "wholesale"
      price_prefix: "MRP:",
      show_batch: true,
      show_expiry: true,
      expiry_format: "MM/YY", // "MM/YY" | "MM/YYYY" | "DD-MM-YYYY"
      custom_footer: "",
      font_scale: 10,
      text_align: "center", // "center" | "left"
    },
  });

  // Print Queue
  const [printQueue, setPrintQueue] = useState([]);
  const [skipLabelsCount, setSkipLabelsCount] = useState(0);

  // Products catalog for ProductSearchInput
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Fetch products for ProductSearchInput modal
  const fetchProducts = useCallback(async (q = "") => {
    try {
      setLoadingProducts(true);
      const { data } = await axios.get("/api/products/search", {
        params: { q: q || "", limit: 30 },
      });
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts("");
  }, [fetchProducts]);

  // Suppliers & Brands list for filtering purchase orders
  const [suppliersList, setSuppliersList] = useState([]);
  const [brandsList, setBrandsList] = useState([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [selectedSupplierOpt, setSelectedSupplierOpt] = useState({ value: null, label: "All Suppliers" });
  const [selectedBrandOpt, setSelectedBrandOpt] = useState({ value: null, label: "All Brands" });
  const supplierSearchTimerRef = useRef(null);
  const brandSearchTimerRef = useRef(null);

  // Purchase Orders & Purchase Invoices list and selection
  const [importDocType, setImportDocType] = useState("purchase_invoices"); // "purchase_invoices" | "purchase_orders"
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState([]);
  const [loadingPoList, setLoadingPoList] = useState(false);
  const [selectedPoOpt, setSelectedPoOpt] = useState(null);
  const [selectedPoData, setSelectedPoData] = useState(null);
  const [poQtyMode, setPoQtyMode] = useState("units"); // "units" | "packs"
  const [poItemSelections, setPoItemSelections] = useState([]);

  const mergeUniqueById = useCallback((prevList, incomingList) => {
    const map = new Map();
    (prevList || []).forEach((item) => {
      if (item && item.id != null) map.set(Number(item.id), item);
    });
    (incomingList || []).forEach((item) => {
      if (item && item.id != null) map.set(Number(item.id), item);
    });
    return Array.from(map.values()).sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""))
    );
  }, []);

  // Fetch all suppliers and brands on mount
  useEffect(() => {
    const loadFilters = async () => {
      try {
        setLoadingSuppliers(true);
        setLoadingBrands(true);
        const [supRes, brandRes] = await Promise.all([
          axios
            .get("/api/suppliers/search", { params: { limit: 5000 } })
            .catch(() => axios.get("/api/suppliers", { params: { per_page: 5000 } })),
          axios
            .get("/api/brands/search", { params: { limit: 5000 } })
            .catch(() => axios.get("/api/brands", { params: { per_page: 5000 } })),
        ]);
        const supRows = Array.isArray(supRes?.data?.data)
          ? supRes.data.data
          : Array.isArray(supRes?.data)
          ? supRes.data
          : [];
        const brandRows = Array.isArray(brandRes?.data?.data)
          ? brandRes.data.data
          : Array.isArray(brandRes?.data)
          ? brandRes.data
          : [];
        setSuppliersList((prev) => mergeUniqueById(prev, supRows));
        setBrandsList((prev) => mergeUniqueById(prev, brandRows));
      } catch {
        // silent
      } finally {
        setLoadingSuppliers(false);
        setLoadingBrands(false);
      }
    };
    loadFilters();
    return () => {
      if (supplierSearchTimerRef.current) clearTimeout(supplierSearchTimerRef.current);
      if (brandSearchTimerRef.current) clearTimeout(brandSearchTimerRef.current);
    };
  }, [mergeUniqueById]);

  // Live server-side search when typing in Supplier Select
  const handleSupplierInputChange = useCallback(
    (inputValue, { action } = {}) => {
      if (action !== "input-change") return;
      const trimmed = String(inputValue || "").trim();
      if (supplierSearchTimerRef.current) clearTimeout(supplierSearchTimerRef.current);
      if (!trimmed) return;

      supplierSearchTimerRef.current = setTimeout(async () => {
        try {
          setLoadingSuppliers(true);
          const res = await axios
            .get("/api/suppliers/search", { params: { q: trimmed, limit: 250 } })
            .catch(() => axios.get("/api/suppliers", { params: { q: trimmed, per_page: 250 } }));
          const rows = Array.isArray(res?.data?.data)
            ? res.data.data
            : Array.isArray(res?.data)
            ? res.data
            : [];
          if (rows.length > 0) {
            setSuppliersList((prev) => mergeUniqueById(prev, rows));
          }
        } catch {
          // silent
        } finally {
          setLoadingSuppliers(false);
        }
      }, 180);
    },
    [mergeUniqueById]
  );

  // Live server-side search when typing in Brand Select so ALL brands are searchable
  const handleBrandInputChange = useCallback(
    (inputValue, { action } = {}) => {
      if (action !== "input-change") return;
      const trimmed = String(inputValue || "").trim();
      if (brandSearchTimerRef.current) clearTimeout(brandSearchTimerRef.current);
      if (!trimmed) return;

      brandSearchTimerRef.current = setTimeout(async () => {
        try {
          setLoadingBrands(true);
          const res = await axios
            .get("/api/brands/search", { params: { q: trimmed, limit: 250 } })
            .catch(() => axios.get("/api/brands", { params: { q_name: trimmed, per_page: 250 } }));
          const rows = Array.isArray(res?.data?.data)
            ? res.data.data
            : Array.isArray(res?.data)
            ? res.data
            : [];
          if (rows.length > 0) {
            setBrandsList((prev) => mergeUniqueById(prev, rows));
          }
        } catch {
          // silent
        } finally {
          setLoadingBrands(false);
        }
      }, 180);
    },
    [mergeUniqueById]
  );

  // Fetch purchase orders & purchase invoices matching supplier and brand
  const fetchPurchaseOrders = useCallback(async (supplierId = null, brandId = null) => {
    try {
      setLoadingPoList(true);
      const params = {};
      if (supplierId) params.supplier_id = supplierId;
      if (brandId) params.brand_id = brandId;
      const [poRes, piRes] = await Promise.all([
        axios.get("/api/barcodes/purchase-orders", { params }).catch(() => ({ data: {} })),
        axios.get("/api/barcodes/purchase-invoices", { params }).catch(() => ({ data: {} })),
      ]);
      setPurchaseOrders(poRes.data?.purchase_orders || []);
      setPurchaseInvoices(piRes.data?.purchase_invoices || []);
    } catch {
      setPurchaseOrders([]);
      setPurchaseInvoices([]);
    } finally {
      setLoadingPoList(false);
    }
  }, []);

  useEffect(() => {
    fetchPurchaseOrders(selectedSupplierOpt?.value, selectedBrandOpt?.value);
  }, [fetchPurchaseOrders, selectedSupplierOpt, selectedBrandOpt]);

  // Options for Supplier, Brand and PO/PI Selects
  const supplierOptions = useMemo(() => [
    { value: null, label: "All Suppliers" },
    ...suppliersList.map((s) => ({ value: s.id, label: s.name })),
  ], [suppliersList]);

  const brandOptions = useMemo(() => [
    { value: null, label: "All Brands" },
    ...brandsList.map((b) => ({ value: b.id, label: b.name })),
  ], [brandsList]);

  const poSelectOptions = useMemo(() => {
    if (importDocType === "purchase_invoices") {
      return purchaseInvoices.map((pi) => {
        const dateStr = pi.posted_date ? ` — ${pi.posted_date}` : "";
        const supStr = pi.supplier?.name ? ` — ${pi.supplier.name}` : "";
        const invNum = pi.invoice_number ? ` [Inv: ${pi.invoice_number}]` : "";
        const itemsCount = pi.items_count || pi.items?.length || 0;
        const unitsCount =
          pi.items_sum_quantity ||
          (pi.items || []).reduce((acc, i) => acc + Number(i.quantity || i.unit_quantity || 0), 0);
        return {
          value: `pi_${pi.id}`,
          docType: "purchase_invoice",
          label: `${pi.posted_number || `GRN #${pi.id}`}${invNum}${dateStr}${supStr} (${itemsCount} items, ${unitsCount} units)`,
          po: pi,
        };
      });
    }
    return purchaseOrders.map((po) => {
      const dateStr = po.date ? ` — ${po.date}` : "";
      const supStr = po.supplier?.name ? ` — ${po.supplier.name}` : "";
      const itemsCount = po.items_count || po.items?.length || 0;
      const unitsCount =
        po.items_sum_ordered_quantity ||
        (po.items || []).reduce((acc, i) => acc + Number(i.ordered_quantity || 0), 0);
      return {
        value: `po_${po.id}`,
        docType: "purchase_order",
        label: `${po.number || `PO #${po.id}`}${dateStr}${supStr} (${itemsCount} items, ${unitsCount} units)`,
        po,
      };
    });
  }, [importDocType, purchaseInvoices, purchaseOrders]);

  // Select a PO or Purchase Invoice and initialize its items for import
  const handleSelectPo = (opt) => {
    setSelectedPoOpt(opt);
    if (!opt || !opt.po) {
      setSelectedPoData(null);
      setPoItemSelections([]);
      return;
    }
    const po = opt.po;
    setSelectedPoData(po);
    const activeBrandId = selectedBrandOpt?.value ? Number(selectedBrandOpt.value) : null;

    const items = (po.items || []).map((it) => {
      const p = it.product || {};
      const orderedUnits = Number(it.ordered_quantity ?? it.quantity ?? it.unit_quantity ?? 0) || 1;
      const packSize = Math.max(1, Number(it.pack_size || p.pack_size || 1));
      const orderedPacks = Math.max(1, Number(it.pack_quantity) || Math.round(orderedUnits / packSize));
      const itemBrandId = p.brand_id != null ? Number(p.brand_id) : null;

      return {
        id: it.id,
        product_id: it.product_id,
        product_name: p.name || `Product #${it.product_id}`,
        barcode: p.barcode || p.product_code || "",
        brand_id: itemBrandId,
        brand_name: p.brand?.name || "—",
        batch_number: it.batch || "",
        expiry_date: it.expiry ? String(it.expiry).slice(0, 10) : "",
        pack_size: packSize,
        ordered_units: orderedUnits,
        ordered_packs: orderedPacks,
        import_quantity: poQtyMode === "packs" ? orderedPacks : orderedUnits,
        selected: !activeBrandId || itemBrandId === activeBrandId,
        product: p,
      };
    });

    setPoItemSelections(items);
  };

  // Toggle PO Quantity mode (units vs packs)
  const handleTogglePoQtyMode = (mode) => {
    setPoQtyMode(mode);
    setPoItemSelections((prev) =>
      prev.map((item) => ({
        ...item,
        import_quantity: mode === "packs" ? item.ordered_packs : item.ordered_units,
      }))
    );
  };

  // Import selected PO / GRN items into queue
  const handleImportPoToQueue = () => {
    const selected = poItemSelections.filter((item) => item.selected && item.import_quantity > 0);
    if (selected.length === 0) {
      toast.error("Please select at least one item to import");
      return;
    }

    selected.forEach((item) => {
      addProductToQueue(item.product, item.import_quantity, item.batch_number || null, item.expiry_date || null);
    });

    const docLabel = selectedPoData?.posted_number || selectedPoData?.number || "Document";
    toast.success(`Imported ${selected.length} product(s) from ${docLabel} into queue`);
    setSelectedPoOpt(null);
    setSelectedPoData(null);
    setPoItemSelections([]);
  };

  // React-Select custom styles matching Karobar theme & dark mode
  const batchSelectStyles = useMemo(
    () => ({
      control: (base, state) => ({
        ...base,
        minHeight: "34px",
        borderRadius: "0.55rem",
        backgroundColor: isDark ? "rgba(30, 41, 59, 0.9)" : "#ffffff",
        borderColor: state.isFocused
          ? (theme?.primary_color || "#3b82f6")
          : isDark
          ? "rgba(51, 65, 85, 0.8)"
          : "rgba(209, 213, 219, 0.8)",
        boxShadow: state.isFocused ? `0 0 0 2px ${theme?.primary_color || "#3b82f6"}33` : "none",
        fontSize: "0.72rem",
        color: isDark ? "#f8fafc" : "#1e293b",
        transition: "all 0.15s ease",
        "&:hover": {
          borderColor: theme?.primary_color || "#3b82f6",
        },
      }),
      valueContainer: (base) => ({
        ...base,
        padding: "0 8px",
      }),
      input: (base) => ({
        ...base,
        color: isDark ? "#f8fafc" : "#1e293b",
        margin: 0,
        padding: 0,
        fontSize: "0.72rem",
      }),
      placeholder: (base) => ({
        ...base,
        color: isDark ? "rgba(148, 163, 184, 0.7)" : "rgba(156, 163, 175, 0.8)",
        fontSize: "0.72rem",
      }),
      singleValue: (base) => ({
        ...base,
        color: isDark ? "#f8fafc" : "#1e293b",
        fontSize: "0.72rem",
        fontWeight: "500",
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }),
      dropdownIndicator: (base) => ({
        ...base,
        padding: "2px 6px",
        color: isDark ? "rgba(148, 163, 184, 0.7)" : "rgba(156, 163, 175, 0.8)",
      }),
      indicatorSeparator: () => ({ display: "none" }),
      menuPortal: (base) => ({ ...base, zIndex: 99999 }),
      menu: (base) => ({
        ...base,
        backgroundColor: isDark ? "rgba(15, 23, 42, 0.98)" : "#ffffff",
        border: isDark ? "1px solid rgba(51, 65, 85, 0.8)" : "1px solid rgba(226, 232, 240, 0.9)",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.35), 0 8px 10px -6px rgba(0, 0, 0, 0.3)",
        borderRadius: "0.65rem",
        overflow: "hidden",
        minWidth: "270px",
      }),
      option: (base, state) => ({
        ...base,
        backgroundColor: state.isSelected
          ? (theme?.primary_color || "#3b82f6")
          : state.isFocused
          ? isDark
            ? "rgba(51, 65, 85, 0.7)"
            : "rgba(239, 246, 255, 1)"
          : "transparent",
        color: state.isSelected ? "#ffffff" : isDark ? "#f8fafc" : "#1e293b",
        fontSize: "0.72rem",
        cursor: "pointer",
        padding: "7px 10px",
        transition: "background-color 0.1s ease",
      }),
    }),
    [isDark, theme]
  );

  // Preview & Modal state
  const [previewZoom, setPreviewZoom] = useState(150);
  const [previewItemIndex, setPreviewItemIndex] = useState(0);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  // Load Templates & Store Info
  const fetchTemplates = useCallback(async () => {
    try {
      setLoadingTemplates(true);
      const { data } = await axios.get("/api/barcodes/templates");
      setTemplates(data.templates || []);
      if (data.store_info) {
        setStoreInfo(data.store_info);
      }

      // Select default template if none selected yet
      if (data.templates && data.templates.length > 0) {
        const defaultTpl = data.templates.find((t) => t.is_default) || data.templates[0];
        setSelectedTemplateId(defaultTpl.id);
        applyTemplate(defaultTpl);
      }
    } catch (err) {
      toast.error("Failed to load barcode templates");
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Handle URL query parameters (e.g. ?purchase_invoice_id=3 or ?purchase_order_id=5 or ?product_id=12 or ?product_ids=1,2,3)
  useEffect(() => {
    const productId = searchParams.get("product_id");
    const productIds = searchParams.get("product_ids");
    const poId = searchParams.get("purchase_order_id");
    const piId = searchParams.get("purchase_invoice_id");

    if (piId) {
      axios
        .get("/api/barcodes/purchase-invoices", { params: { id: piId } })
        .then(({ data }) => {
          const pi = data.purchase_invoice;
          if (pi && pi.items && pi.items.length > 0) {
            pi.items.forEach((it) => {
              if (it.product) {
                const qty = Number(it.quantity ?? it.unit_quantity) || 1;
                addProductToQueue(it.product, qty, it.batch || null, it.expiry ? String(it.expiry).slice(0, 10) : null);
              }
            });
            toast.success(`Loaded ${pi.items.length} product(s) from ${pi.posted_number || "Purchase Invoice"} into print queue`);
          }
        })
        .catch(() => {
          toast.error("Failed to load purchase invoice for barcode printing");
        });
    } else if (poId) {
      axios
        .get("/api/barcodes/purchase-orders", { params: { id: poId } })
        .then(({ data }) => {
          const po = data.purchase_order;
          if (po && po.items && po.items.length > 0) {
            po.items.forEach((it) => {
              if (it.product) {
                const qty = Number(it.ordered_quantity) || 1;
                addProductToQueue(it.product, qty);
              }
            });
            toast.success(`Loaded ${po.items.length} product(s) from ${po.number || "Purchase Order"} into print queue`);
          }
        })
        .catch(() => {
          toast.error("Failed to load purchase order for barcode printing");
        });
    } else if (productId || productIds) {
      axios
        .get("/api/barcodes/products-search", {
          params: { product_ids: productIds || productId },
        })
        .then(({ data }) => {
          if (data.products && data.products.length > 0) {
            data.products.forEach((p) => addProductToQueue(p, 1));
            toast.success(`Added ${data.products.length} product(s) to barcode print queue`);
          }
        })
        .catch(() => {});
    }
  }, [searchParams]);

  // Apply template values to state
  const applyTemplate = (tpl) => {
    if (!tpl) return;
    setLayout({
      name: tpl.name,
      paper_type: tpl.paper_type || "roll",
      width_mm: Number(tpl.width_mm) || 50,
      height_mm: Number(tpl.height_mm) || 25,
      orientation: tpl.orientation || "landscape",
      columns: Number(tpl.columns) || 1,
      rows: Number(tpl.rows) || 1,
      gap_x_mm: Number(tpl.gap_x_mm) || 0,
      gap_y_mm: Number(tpl.gap_y_mm) || 0,
      margin_top_mm: Number(tpl.margin_top_mm) || 0,
      margin_left_mm: Number(tpl.margin_left_mm) || 0,
      margin_right_mm: Number(tpl.margin_right_mm) || 0,
      margin_bottom_mm: Number(tpl.margin_bottom_mm) || 0,
      options: {
        show_store_name: tpl.layout_options?.show_store_name ?? true,
        store_name_override: tpl.layout_options?.store_name_override ?? "",
        show_product_name: tpl.layout_options?.show_product_name ?? true,
        name_lines: tpl.layout_options?.name_lines ?? 2,
        show_product_code: tpl.layout_options?.show_product_code ?? false,
        show_barcode: tpl.layout_options?.show_barcode ?? true,
        barcode_height: Number(tpl.layout_options?.barcode_height) || 28,
        bar_width: Number(tpl.layout_options?.bar_width) || 1.3,
        show_barcode_text: tpl.layout_options?.show_barcode_text ?? true,
        show_price: tpl.layout_options?.show_price ?? true,
        price_type: tpl.layout_options?.price_type || "retail",
        price_prefix: tpl.layout_options?.price_prefix ?? "MRP:",
        show_batch: tpl.layout_options?.show_batch ?? true,
        show_expiry: tpl.layout_options?.show_expiry ?? true,
        expiry_format: tpl.layout_options?.expiry_format || "MM/YY",
        custom_footer: tpl.layout_options?.custom_footer ?? "",
        font_scale: Number(tpl.layout_options?.font_scale) || 10,
        text_align: tpl.layout_options?.text_align || "center",
      },
    });
  };

  // Add product to queue and fetch batch options + unassigned quantity
  const addProductToQueue = async (product, initialQty = 1, preferredBatch = null, preferredExpiry = null) => {
    if (!product || !product.id) return;

    // Check if already in queue with same batch
    const existingIndex = printQueue.findIndex(
      (item) => item.product_id === product.id && (!preferredBatch || item.batch_number === preferredBatch)
    );
    if (existingIndex > -1) {
      setPrintQueue((prev) =>
        prev.map((item, idx) =>
          idx === existingIndex
            ? { ...item, print_quantity: item.print_quantity + (initialQty || 1) }
            : item
        )
      );
      toast.success(`Increased print quantity for "${product.name}"`);
      return;
    }

    const itemUid = `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const productStock = Number(product.quantity ?? product.stock ?? 0);

    // Initial placeholder item in queue
    const newItem = {
      uid: itemUid,
      product_id: product.id,
      product_name: product.name,
      barcode: product.barcode || product.product_code || "000000",
      product_code: product.product_code || "",
      retail_price: Number(product.unit_sale_price) || 0,
      wholesale_price: Number(product.whole_sale_unit_price) || 0,
      stock: productStock,
      selected_batch_type: preferredBatch ? "custom" : "unassigned", // "batch" | "unassigned" | "custom"
      selected_batch_id: preferredBatch ? "custom" : null,
      batch_number: preferredBatch || "",
      expiry_date: preferredExpiry || "",
      custom_batch_number: preferredBatch || "",
      custom_expiry_date: preferredExpiry || "",
      print_quantity: Math.max(1, initialQty || 1),
      batches: [],
      unassigned_quantity: productStock,
      loading_batches: true,
    };

    setPrintQueue((prev) => [...prev, newItem]);
    toast.success(`Added "${product.name}" to print queue`);

    // Fetch batches and unassigned quantity from API
    try {
      const { data, headers } = await axios.get(`/api/products/${product.id}/batches`, {
        params: { include_unbatched: 1 },
      });

      const batchList = Array.isArray(data) ? data : [];
      // Real batches (not virtual unbatched)
      const realBatches = batchList.filter((b) => !b.is_unbatched && b.id != null);

      // Unbatched / unassigned quantity
      const unbatchedItem = batchList.find((b) => b.is_unbatched);
      let unassignedUnits = unbatchedItem ? Number(unbatchedItem.quantity || 0) : 0;
      if (!unbatchedItem) {
        if (headers["x-unbatched-units"] !== undefined) {
          unassignedUnits = Number(headers["x-unbatched-units"]) || 0;
        } else {
          const batchedSum = realBatches.reduce((acc, b) => acc + Number(b.quantity || 0), 0);
          unassignedUnits = Math.max(0, productStock - batchedSum);
        }
      }

      // Choose initial batch selection:
      // 1) If preferredBatch was passed from a Purchase Invoice, match it in realBatches or keep it as custom!
      // 2) Otherwise prefer first FEFO batch with stock, else first active batch, else unassigned
      const matchedPreferred = preferredBatch
        ? realBatches.find((b) => String(b.batch_number).toLowerCase() === String(preferredBatch).toLowerCase())
        : null;

      const fefoBatch =
        matchedPreferred ||
        realBatches.find((b) => b.is_fefo_recommended && Number(b.quantity) > 0) ||
        realBatches.find((b) => !b.is_expired && Number(b.quantity) > 0) ||
        realBatches[0];

      let initialType = "unassigned";
      let initialBatchId = null;
      let initialBatchNo = "";
      let initialExp = "";

      if (matchedPreferred) {
        initialType = "batch";
        initialBatchId = matchedPreferred.id;
        initialBatchNo = matchedPreferred.batch_number;
        initialExp = matchedPreferred.expiry_date || preferredExpiry || "";
      } else if (preferredBatch) {
        initialType = "custom";
        initialBatchId = "custom";
        initialBatchNo = preferredBatch;
        initialExp = preferredExpiry || "";
      } else if (fefoBatch) {
        initialType = "batch";
        initialBatchId = fefoBatch.id;
        initialBatchNo = fefoBatch.batch_number;
        initialExp = fefoBatch.expiry_date || "";
      }

      setPrintQueue((prev) =>
        prev.map((item) => {
          if (item.uid !== itemUid) return item;
          return {
            ...item,
            loading_batches: false,
            batches: realBatches,
            unassigned_quantity: unassignedUnits,
            selected_batch_type: initialType,
            selected_batch_id: initialBatchId,
            batch_number: initialBatchNo,
            expiry_date: initialExp,
          };
        })
      );
    } catch (err) {
      setPrintQueue((prev) =>
        prev.map((item) =>
          item.uid === itemUid ? { ...item, loading_batches: false } : item
        )
      );
    }
  };

  // Change batch selection via React-Select
  const handleBatchSelectChange = (itemUid, selectedOption) => {
    if (!selectedOption) return;
    setPrintQueue((prev) =>
      prev.map((item) => {
        if (item.uid !== itemUid) return item;

        if (selectedOption.type === "batch") {
          return {
            ...item,
            selected_batch_type: "batch",
            selected_batch_id: selectedOption.batch_id,
            batch_number: selectedOption.batch_number,
            expiry_date: selectedOption.expiry_date,
          };
        }

        if (selectedOption.type === "unassigned") {
          return {
            ...item,
            selected_batch_type: "unassigned",
            selected_batch_id: null,
            batch_number: "",
            expiry_date: "",
          };
        }

        if (selectedOption.type === "custom") {
          return {
            ...item,
            selected_batch_type: "custom",
            selected_batch_id: "custom",
            batch_number: item.custom_batch_number || "",
            expiry_date: item.custom_expiry_date || "",
          };
        }

        return item;
      })
    );
  };

  // Update custom batch number
  const handleCustomBatchChange = (itemUid, val) => {
    setPrintQueue((prev) =>
      prev.map((item) =>
        item.uid === itemUid
          ? { ...item, custom_batch_number: val, batch_number: val }
          : item
      )
    );
  };

  // Update custom expiry date
  const handleCustomExpiryChange = (itemUid, val) => {
    setPrintQueue((prev) =>
      prev.map((item) =>
        item.uid === itemUid
          ? { ...item, custom_expiry_date: val, expiry_date: val }
          : item
      )
    );
  };

  // Update item quantity
  const handleQtyChange = (itemUid, newQty) => {
    const qty = Math.max(1, parseInt(newQty, 10) || 1);
    setPrintQueue((prev) =>
      prev.map((item) => (item.uid === itemUid ? { ...item, print_quantity: qty } : item))
    );
  };

  // Remove from queue
  const handleRemoveItem = (itemUid) => {
    setPrintQueue((prev) => prev.filter((item) => item.uid !== itemUid));
  };

  // Bulk queue operations
  const handleSetAllToStock = () => {
    if (printQueue.length === 0) return;
    setPrintQueue((prev) =>
      prev.map((item) => ({
        ...item,
        print_quantity: item.stock > 0 ? item.stock : 1,
      }))
    );
    toast.success("Set all print quantities to current stock count");
  };

  const handleSetAllTo1 = () => {
    if (printQueue.length === 0) return;
    setPrintQueue((prev) => prev.map((item) => ({ ...item, print_quantity: 1 })));
    toast.success("Set all quantities to 1");
  };

  const handleClearQueue = () => {
    setPrintQueue([]);
  };

  // Format Expiry Date helper
  const formatExpiryDisplay = (dateStr, format) => {
    if (!dateStr) return "";
    try {
      const parts = dateStr.slice(0, 10).split("-"); // YYYY-MM-DD
      if (parts.length < 2) return dateStr;
      const year = parts[0];
      const month = parts[1];
      const day = parts[2] || "01";

      if (format === "MM/YY") return `${month}/${year.slice(2)}`;
      if (format === "MM/YYYY") return `${month}/${year}`;
      if (format === "DD-MM-YYYY") return `${day}-${month}-${year}`;
      return `${month}/${year.slice(2)}`;
    } catch {
      return dateStr;
    }
  };

  // Calculate total labels in queue
  const totalLabelsToPrint = useMemo(() => {
    return printQueue.reduce((sum, item) => sum + (item.print_quantity || 1), 0);
  }, [printQueue]);

  // Preview Item (fallback sample if queue is empty)
  const currentPreviewItem = useMemo(() => {
    if (printQueue.length > 0) {
      const idx = Math.min(previewItemIndex, printQueue.length - 1);
      return printQueue[idx] || printQueue[0];
    }
    return {
      product_name: "Panadol Extra 500mg Tablets",
      barcode: "PRD1029384",
      product_code: "PND-500",
      retail_price: 185.0,
      wholesale_price: 165.0,
      batch_number: "BN-4029",
      expiry_date: "2027-11-30",
    };
  }, [printQueue, previewItemIndex]);

  // Save Custom Template
  const handleSaveTemplateSubmit = async (e) => {
    e.preventDefault();
    if (!newTemplateName.trim()) {
      toast.error("Please enter a template name");
      return;
    }

    try {
      setSavingTemplate(true);
      const payload = {
        name: newTemplateName.trim(),
        paper_type: layout.paper_type,
        width_mm: layout.width_mm,
        height_mm: layout.height_mm,
        orientation: layout.orientation,
        columns: layout.columns,
        rows: layout.rows,
        gap_x_mm: layout.gap_x_mm,
        gap_y_mm: layout.gap_y_mm,
        margin_top_mm: layout.margin_top_mm,
        margin_left_mm: layout.margin_left_mm,
        margin_right_mm: layout.margin_right_mm,
        margin_bottom_mm: layout.margin_bottom_mm,
        layout_options: layout.options,
        is_default: false,
      };

      const { data } = await axios.post("/api/barcodes/templates", payload);
      toast.success("Barcode template saved!");
      setShowSaveModal(false);
      setNewTemplateName("");
      await fetchTemplates();
      if (data.template) {
        setSelectedTemplateId(data.template.id);
      }
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to save template";
      toast.error(msg);
    } finally {
      setSavingTemplate(false);
    }
  };

  // Update active template in-place
  const handleUpdateActiveTemplate = async () => {
    if (!selectedTemplateId) return;
    try {
      setSavingTemplate(true);
      const payload = {
        name: layout.name || "Custom Label",
        paper_type: layout.paper_type,
        width_mm: layout.width_mm,
        height_mm: layout.height_mm,
        orientation: layout.orientation,
        columns: layout.columns,
        rows: layout.rows,
        gap_x_mm: layout.gap_x_mm,
        gap_y_mm: layout.gap_y_mm,
        margin_top_mm: layout.margin_top_mm,
        margin_left_mm: layout.margin_left_mm,
        margin_right_mm: layout.margin_right_mm,
        margin_bottom_mm: layout.margin_bottom_mm,
        layout_options: layout.options,
      };
      await axios.put(`/api/barcodes/templates/${selectedTemplateId}`, payload);
      toast.success("Template updated!");
      await fetchTemplates();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to update template");
    } finally {
      setSavingTemplate(false);
    }
  };

  // Set active template as default
  const handleSetDefaultTemplate = async () => {
    if (!selectedTemplateId) return;
    try {
      setSavingTemplate(true);
      await axios.put(`/api/barcodes/templates/${selectedTemplateId}`, { is_default: true });
      toast.success("Set as default barcode template!");
      await fetchTemplates();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to set default template");
    } finally {
      setSavingTemplate(false);
    }
  };

  // Delete active template
  const handleDeleteActiveTemplate = async () => {
    if (!selectedTemplateId) return;
    if (templates.length <= 1) {
      toast.error("Cannot delete the only remaining template");
      return;
    }
    const activeTpl = templates.find((t) => t.id === selectedTemplateId);
    if (!window.confirm(`Delete template "${activeTpl?.name || "this template"}"?`)) return;
    try {
      setSavingTemplate(true);
      await axios.delete(`/api/barcodes/templates/${selectedTemplateId}`);
      toast.success("Template deleted");
      await fetchTemplates();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to delete template");
    } finally {
      setSavingTemplate(false);
    }
  };

  // High-Precision Print Handler
  const handlePrint = async () => {
    if (printQueue.length === 0) {
      toast.error("Please add at least one product to the print queue.");
      return;
    }

    setIsPrinting(true);

    try {
      // Build flattened list of individual label objects according to quantities
      const flatLabels = [];

      // Add blanks if skipLabelsCount > 0 (for sheet paper)
      if (layout.paper_type === "sheet" && skipLabelsCount > 0) {
        for (let i = 0; i < skipLabelsCount; i++) {
          flatLabels.push({ isBlank: true });
        }
      }

      printQueue.forEach((item) => {
        const qty = item.print_quantity || 1;
        for (let i = 0; i < qty; i++) {
          flatLabels.push({
            isBlank: false,
            product_name: item.product_name,
            barcode: item.barcode,
            product_code: item.product_code,
            price:
              layout.options.price_type === "wholesale"
                ? item.wholesale_price
                : item.retail_price,
            batch_number: item.batch_number,
            expiry_date: item.expiry_date,
          });
        }
      });

      const storeName =
        layout.options.store_name_override.trim() ||
        storeInfo.store_name ||
        "Karobar Store";

      // Generate HTML content for printing
      const isRoll = layout.paper_type === "roll";
      const wMm = layout.width_mm;
      const hMm = layout.height_mm;
      const fontPt = layout.options.font_scale || 10;
      const textAlign = layout.options.text_align || "center";

      let labelsHtml = "";

      if (isRoll) {
        // Direct thermal roll printing
        labelsHtml = flatLabels
          .map((label) => {
            if (label.isBlank) return "";
            const barcodeSvgStr = generateBarcodeSvgString(label.barcode, {
              height: layout.options.barcode_height,
              barWidth: layout.options.bar_width,
              showText: layout.options.show_barcode_text,
              fontSize: 10,
            });

            const expFormatted = formatExpiryDisplay(
              label.expiry_date,
              layout.options.expiry_format
            );

            return `
              <div class="roll-label" style="width:${wMm}mm; height:${hMm}mm; padding:${layout.margin_top_mm}mm ${layout.margin_right_mm}mm ${layout.margin_bottom_mm}mm ${layout.margin_left_mm}mm;">
                ${
                  layout.options.show_store_name
                    ? `<div class="lbl-store" style="font-size:${fontPt - 1}pt;">${escapeHtml(storeName)}</div>`
                    : ""
                }
                ${
                  layout.options.show_product_name
                    ? `<div class="lbl-name" style="font-size:${fontPt}pt; -webkit-line-clamp:${layout.options.name_lines};">${escapeHtml(label.product_name)}</div>`
                    : ""
                }
                ${
                  layout.options.show_barcode
                    ? `<div class="lbl-barcode">${barcodeSvgStr}</div>`
                    : ""
                }
                <div class="lbl-footer" style="font-size:${fontPt - 2}pt;">
                  ${
                    layout.options.show_batch && label.batch_number
                      ? `<span>B:${escapeHtml(label.batch_number)}</span>`
                      : ""
                  }
                  ${
                    layout.options.show_expiry && expFormatted
                      ? `<span>Exp:${escapeHtml(expFormatted)}</span>`
                      : ""
                  }
                  ${
                    layout.options.show_price
                      ? `<span class="lbl-price">${escapeHtml(layout.options.price_prefix)} ${storeInfo.currency_symbol} ${Number(label.price).toFixed(storeInfo.currency_decimal_places || 2)}</span>`
                      : ""
                  }
                </div>
                ${
                  layout.options.custom_footer
                    ? `<div class="lbl-promo" style="font-size:${fontPt - 3}pt;">${escapeHtml(layout.options.custom_footer)}</div>`
                    : ""
                }
              </div>
            `;
          })
          .join("");
      } else {
        // Multi-label sheet printing (A4 / Letter grid)
        const cols = layout.columns || 3;
        const rows = layout.rows || 10;
        const totalPerSheet = cols * rows;

        // Chunk labels into separate sheets
        const sheets = [];
        for (let i = 0; i < flatLabels.length; i += totalPerSheet) {
          sheets.push(flatLabels.slice(i, i + totalPerSheet));
        }

        labelsHtml = sheets
          .map((sheetItems) => {
            const sheetLabels = sheetItems
              .map((label) => {
                if (label.isBlank) {
                  return `<div class="sheet-label-blank" style="width:${wMm}mm; height:${hMm}mm;"></div>`;
                }

                const barcodeSvgStr = generateBarcodeSvgString(label.barcode, {
                  height: layout.options.barcode_height,
                  barWidth: layout.options.bar_width,
                  showText: layout.options.show_barcode_text,
                  fontSize: 10,
                });

                const expFormatted = formatExpiryDisplay(
                  label.expiry_date,
                  layout.options.expiry_format
                );

                return `
                  <div class="sheet-label" style="width:${wMm}mm; height:${hMm}mm;">
                    ${
                      layout.options.show_store_name
                        ? `<div class="lbl-store" style="font-size:${fontPt - 1}pt;">${escapeHtml(storeName)}</div>`
                        : ""
                    }
                    ${
                      layout.options.show_product_name
                        ? `<div class="lbl-name" style="font-size:${fontPt}pt; -webkit-line-clamp:${layout.options.name_lines};">${escapeHtml(label.product_name)}</div>`
                        : ""
                    }
                    ${
                      layout.options.show_barcode
                        ? `<div class="lbl-barcode">${barcodeSvgStr}</div>`
                        : ""
                    }
                    <div class="lbl-footer" style="font-size:${fontPt - 2}pt;">
                      ${
                        layout.options.show_batch && label.batch_number
                          ? `<span>B:${escapeHtml(label.batch_number)}</span>`
                          : ""
                      }
                      ${
                        layout.options.show_expiry && expFormatted
                          ? `<span>Exp:${escapeHtml(expFormatted)}</span>`
                          : ""
                      }
                      ${
                        layout.options.show_price
                          ? `<span class="lbl-price">${escapeHtml(layout.options.price_prefix)} ${storeInfo.currency_symbol} ${Number(label.price).toFixed(storeInfo.currency_decimal_places || 2)}</span>`
                          : ""
                      }
                    </div>
                  </div>
                `;
              })
              .join("");

            return `
              <div class="sheet-page" style="padding-top:${layout.margin_top_mm}mm; padding-left:${layout.margin_left_mm}mm; padding-right:${layout.margin_right_mm}mm; padding-bottom:${layout.margin_bottom_mm}mm;">
                <div class="sheet-grid" style="grid-template-columns: repeat(${cols}, ${wMm}mm); column-gap:${layout.gap_x_mm}mm; row-gap:${layout.gap_y_mm}mm;">
                  ${sheetLabels}
                </div>
              </div>
            `;
          })
          .join("");
      }

      const pageSizeCss = isRoll
        ? `@page { size: ${wMm}mm ${hMm}mm; margin: 0; }`
        : `@page { size: A4 portrait; margin: 0; }`;

      const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8" />
          <title>Print Barcode Labels - Karobar</title>
          <style>
            ${pageSizeCss}
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #fff; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

            /* Roll container */
            .roll-label {
              page-break-after: always;
              break-after: page;
              overflow: hidden;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              text-align: ${textAlign};
            }

            /* Sheet container */
            .sheet-page {
              page-break-after: always;
              break-after: page;
              width: 210mm;
              height: 297mm;
              overflow: hidden;
            }
            .sheet-grid {
              display: grid;
            }
            .sheet-label {
              overflow: hidden;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              text-align: ${textAlign};
              padding: 1.5mm;
            }
            .sheet-label-blank {
              visibility: hidden;
            }

            .lbl-store {
              font-weight: 700;
              text-transform: uppercase;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              line-height: 1.1;
            }
            .lbl-name {
              font-weight: 600;
              display: -webkit-box;
              -webkit-box-orient: vertical;
              overflow: hidden;
              line-height: 1.15;
            }
            .lbl-barcode {
              display: flex;
              justify-content: ${textAlign === "left" ? "flex-start" : "center"};
              align-items: center;
              margin: 0.5mm 0;
            }
            .lbl-barcode svg {
              max-width: 100%;
              height: auto;
            }
            .lbl-footer {
              display: flex;
              align-items: center;
              justify-content: space-between;
              font-weight: 600;
              line-height: 1.1;
              white-space: nowrap;
            }
            .lbl-price {
              font-weight: 800;
            }
            .lbl-promo {
              font-style: italic;
              color: #444;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
          </style>
        </head>
        <body>
          ${labelsHtml}
        </body>
        </html>
      `;

      await printHtmlViaIframe(fullHtml, {
        loadingMessage: "Printing barcode labels...",
        successMessage: "Barcode labels sent to printer",
      });
    } catch (err) {
      toast.error("Failed to generate print layout");
    } finally {
      setIsPrinting(false);
    }
  };

  // Ctrl+P: direct print barcode labels when queue has items
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.repeat) return;
      if ((e.key || "").toLowerCase() !== "p") return;
      e.preventDefault();
      if (printQueue.length > 0 && !isPrinting) {
        handlePrint();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [printQueue, layout, storeInfo, isPrinting, skipLabelsCount]);

  const escapeHtml = (str) => {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  // React-select options for presets
  const templateOptions = useMemo(() => {
    return templates.map((t) => ({
      value: t.id,
      label: `${t.name} (${t.width_mm}×${t.height_mm}mm)`,
      data: t,
    }));
  }, [templates]);

  // Select Styles matching App Theme
  const selectStyles = useMemo(
    () => ({
      control: (base, state) => ({
        ...base,
        minHeight: "38px",
        borderRadius: "0.75rem",
        backgroundColor: isDark ? "rgba(30, 41, 59, 0.85)" : "#ffffff",
        borderColor: state.isFocused
          ? theme?.primary_color || "#3b82f6"
          : isDark
          ? "rgba(51, 65, 85, 0.8)"
          : "rgba(209, 213, 219, 0.8)",
        boxShadow: state.isFocused ? `0 0 0 2px ${theme?.primary_color || "#3b82f6"}33` : "none",
        fontSize: "0.8125rem",
        color: isDark ? "#f8fafc" : "#1e293b",
        "&:hover": { borderColor: theme?.primary_color || "#3b82f6" },
      }),
      valueContainer: (base) => ({ ...base, padding: "2px 10px" }),
      input: (base) => ({ ...base, color: isDark ? "#f8fafc" : "#1e293b" }),
      singleValue: (base) => ({ ...base, color: isDark ? "#f8fafc" : "#1e293b", fontSize: "0.8125rem" }),
      menuPortal: (base) => ({ ...base, zIndex: 99999 }),
      menu: (base) => ({
        ...base,
        backgroundColor: isDark ? "rgba(15, 23, 42, 0.98)" : "#ffffff",
        border: isDark ? "1px solid rgba(51, 65, 85, 0.8)" : "1px solid rgba(226, 232, 240, 0.9)",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.25)",
        borderRadius: "0.75rem",
        overflow: "hidden",
      }),
      option: (base, state) => ({
        ...base,
        backgroundColor: state.isSelected
          ? theme?.primary_color || "#3b82f6"
          : state.isFocused
          ? isDark
            ? "rgba(51, 65, 85, 0.7)"
            : "rgba(239, 246, 255, 1)"
          : "transparent",
        color: state.isSelected ? "#ffffff" : isDark ? "#f8fafc" : "#1e293b",
        fontSize: "0.8125rem",
        cursor: "pointer",
        padding: "8px 12px",
      }),
    }),
    [isDark, theme]
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* ===== Header & Action Studio Hero ===== */}
      <div className="products-panel bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
              <QrCodeIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  Barcode Label Studio &amp; Printing
                </h1>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  Thermal &amp; Sheet
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Design custom sticker tags, select batches with expiry dates, and print to thermal roll or A4 sticker sheets.
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            {canSaveTemplate && (
              <button
                type="button"
                onClick={() => setShowSaveModal(true)}
                className="products-action theme-btn-secondary"
                title="Save current layout as a reusable preset"
              >
                <BookmarkSquareIcon className="w-4 h-4" />
                <span>Save As Preset</span>
              </button>
            )}

            {canPrintBarcode && (
              <button
                type="button"
                onClick={handlePrint}
                disabled={isPrinting || printQueue.length === 0}
                className="products-action theme-btn-primary"
                title="Print stickers now"
              >
                <PrinterIcon className={`w-4 h-4 ${isPrinting ? "animate-pulse" : ""}`} />
                <span>
                  {isPrinting
                    ? "Generating…"
                    : `Print ${totalLabelsToPrint} Sticker${totalLabelsToPrint === 1 ? "" : "s"}`}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Preset Selector Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-5 border-t border-slate-200/60 dark:border-slate-800/60 items-center">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Active Template Preset:
              </label>
              <div className="flex items-center gap-1">
                {canSaveTemplate && selectedTemplateId && (
                  <>
                    <button
                      type="button"
                      onClick={handleUpdateActiveTemplate}
                      disabled={savingTemplate}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer"
                      title="Save changes to the currently selected template"
                    >
                      Update
                    </button>
                    {!templates.find((t) => t.id === selectedTemplateId)?.is_default && (
                      <button
                        type="button"
                        onClick={handleSetDefaultTemplate}
                        disabled={savingTemplate}
                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                        title="Make this template the default preset"
                      >
                        Set Default
                      </button>
                    )}
                  </>
                )}
                {canDeleteTemplate && selectedTemplateId && templates.length > 1 && (
                  <button
                    type="button"
                    onClick={handleDeleteActiveTemplate}
                    disabled={savingTemplate}
                    className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800 transition-colors cursor-pointer"
                    title="Delete selected template"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
            <Select
              value={templateOptions.find((o) => o.value === selectedTemplateId)}
              onChange={(opt) => {
                if (opt && opt.data) {
                  setSelectedTemplateId(opt.value);
                  applyTemplate(opt.data);
                  toast.success(`Loaded "${opt.data.name}"`);
                }
              }}
              options={templateOptions}
              styles={selectStyles}
              isSearchable={false}
              menuPortalTarget={typeof document !== "undefined" ? document.body : null}
              menuPosition="fixed"
            />
          </div>

          <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 text-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Target Dimensions</span>
              <span className="font-bold text-slate-800 dark:text-slate-100">
                {layout.width_mm}mm × {layout.height_mm}mm ({layout.paper_type === "roll" ? "Thermal Roll" : `Sheet ${layout.columns}×${layout.rows}`})
              </span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              {layout.orientation.toUpperCase()}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 text-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Print Queue Summary</span>
              <span className="font-bold text-slate-800 dark:text-slate-100">
                {printQueue.length} Products ({totalLabelsToPrint} Labels Total)
              </span>
            </div>
            {totalLabelsToPrint > 0 && (
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </div>
        </div>
      </div>

      {/* ===== Modern Segmented Tab Bar ===== */}
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-2 shadow-sm">
        <div role="tablist" className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`barcode-tab-${tab.id}`}
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                style={
                  isActive
                    ? {
                        backgroundColor: theme?.primary_color || "#2563eb",
                        color: "#ffffff",
                      }
                    : undefined
                }
                className={`group relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer ${
                  isActive
                    ? "shadow-md shadow-blue-500/25 dark:shadow-blue-900/40"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/60"
                }`}
              >
                <Icon
                  className={`w-4 h-4 transition-transform duration-200 group-hover:scale-110 ${
                    isActive ? "text-white" : "text-slate-400 dark:text-slate-500 group-hover:text-blue-500"
                  }`}
                />
                <span>{tab.label}</span>

                {tab.id === "queue" && (
                  <span
                    className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                      isActive
                        ? "bg-white/25 text-white"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {printQueue.length}
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => document.getElementById("barcode-live-preview")?.scrollIntoView({ behavior: "smooth" })}
            className="lg:hidden ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200/70 dark:border-blue-800/60 shrink-0"
          >
            <EyeIcon className="w-3.5 h-3.5" />
            <span>Preview ↓</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MAIN STUDIO GRID (Controls + Live Preview)                */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Active Tab Content (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* TAB 1: PRINT QUEUE & ITEMS */}
          {activeTab === "queue" && (
            <div className="products-panel bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-5 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <DocumentDuplicateIcon className="w-4 h-4 text-blue-500" />
                    Products to Print
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Search and select items, pick their batch and expiry date, and specify sticker quantities.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSetAllToStock}
                    disabled={printQueue.length === 0}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-40"
                    title="Set quantity to current stock level for each item"
                  >
                    Fill Stock Qty
                  </button>
                  <button
                    type="button"
                    onClick={handleSetAllTo1}
                    disabled={printQueue.length === 0}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-40"
                  >
                    All to 1
                  </button>
                  <button
                    type="button"
                    onClick={handleClearQueue}
                    disabled={printQueue.length === 0}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/50 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-medium transition-colors disabled:opacity-40"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Find & Load Saved Purchase Invoices (GRN) or Purchase Orders Section */}
              <div className="rounded-2xl border border-blue-200/80 dark:border-blue-900/40 bg-gradient-to-br from-blue-50/60 via-indigo-50/30 to-slate-50/60 dark:from-slate-900/80 dark:via-blue-950/20 dark:to-slate-900/80 p-4 shadow-xs space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
                      <ClipboardDocumentListIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <span>
                          {importDocType === "purchase_invoices"
                            ? "Load from Purchase Invoices (GRN with Batch & Expiry)"
                            : "Load from Saved Purchase Orders"}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                          {importDocType === "purchase_invoices"
                            ? `${purchaseInvoices.length} Invoice${purchaseInvoices.length === 1 ? "" : "s"}`
                            : `${purchaseOrders.length} Order${purchaseOrders.length === 1 ? "" : "s"}`}
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {importDocType === "purchase_invoices"
                          ? "Load received items with their exact GRN batch numbers, expiry dates, and quantities."
                          : "Filter by brand and supplier to quickly load ordered products and quantities into your print queue."}
                      </p>
                    </div>
                  </div>

                  {/* Document Source Switcher */}
                  <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-white/80 dark:bg-slate-800/80 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setImportDocType("purchase_invoices");
                        setSelectedPoOpt(null);
                        setSelectedPoData(null);
                        setPoItemSelections([]);
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                        importDocType === "purchase_invoices"
                          ? "bg-blue-600 text-white shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      Purchase Invoices (GRN)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setImportDocType("purchase_orders");
                        setSelectedPoOpt(null);
                        setSelectedPoData(null);
                        setPoItemSelections([]);
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                        importDocType === "purchase_orders"
                          ? "bg-blue-600 text-white shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      Purchase Orders
                    </button>
                  </div>
                </div>

                {/* Filters: Supplier, Brand, and Purchase Invoice / Order */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Supplier Select */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <BuildingStorefrontIcon className="w-3.5 h-3.5 text-slate-400" />
                      <span>Filter by Supplier</span>
                    </label>
                    <Select
                      value={selectedSupplierOpt}
                      onChange={(opt) => setSelectedSupplierOpt(opt || { value: null, label: "All Suppliers" })}
                      onInputChange={handleSupplierInputChange}
                      options={supplierOptions}
                      styles={batchSelectStyles}
                      isLoading={loadingSuppliers}
                      isSearchable
                      isClearable={Boolean(selectedSupplierOpt?.value)}
                      filterOption={(option, rawInput) => {
                        const q = String(rawInput || "").trim().toLowerCase();
                        if (!q) return true;
                        return String(option?.label || "").toLowerCase().includes(q);
                      }}
                      placeholder="Filter by Supplier…"
                      menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                      menuPosition="fixed"
                    />
                  </div>

                  {/* Brand Select */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <TagIcon className="w-3.5 h-3.5 text-slate-400" />
                      <span>Filter by Brand</span>
                    </label>
                    <Select
                      value={selectedBrandOpt}
                      onChange={(opt) => {
                        const resolved = opt || { value: null, label: "All Brands" };
                        setSelectedBrandOpt(resolved);
                        const activeBrandId = resolved?.value ? Number(resolved.value) : null;
                        setPoItemSelections((prev) =>
                          prev.length > 0
                            ? prev.map((item) => ({
                                ...item,
                                selected: !activeBrandId || Number(item.brand_id) === activeBrandId,
                              }))
                            : prev
                        );
                      }}
                      onInputChange={handleBrandInputChange}
                      options={brandOptions}
                      styles={batchSelectStyles}
                      isLoading={loadingBrands}
                      isSearchable
                      isClearable={Boolean(selectedBrandOpt?.value)}
                      filterOption={(option, rawInput) => {
                        const q = String(rawInput || "").trim().toLowerCase();
                        if (!q) return true;
                        return String(option?.label || "").toLowerCase().includes(q);
                      }}
                      placeholder="Filter by Brand…"
                      menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                      menuPosition="fixed"
                    />
                  </div>

                  {/* Purchase Invoice / Order Select */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <ClipboardDocumentListIcon className="w-3.5 h-3.5 text-emerald-500" />
                      <span>
                        {importDocType === "purchase_invoices"
                          ? "Select Purchase Invoice (GRN)"
                          : "Select Purchase Order"}
                      </span>
                    </label>
                    <Select
                      value={selectedPoOpt}
                      onChange={handleSelectPo}
                      options={poSelectOptions}
                      styles={batchSelectStyles}
                      isLoading={loadingPoList}
                      isSearchable
                      placeholder={
                        loadingPoList
                          ? "Loading documents…"
                          : poSelectOptions.length === 0
                          ? "No documents found"
                          : importDocType === "purchase_invoices"
                          ? "Choose a purchase invoice…"
                          : "Choose a purchase order…"
                      }
                      menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                      menuPosition="fixed"
                      noOptionsMessage={() => "No documents match your filters"}
                    />
                  </div>
                </div>

                {/* Selected Purchase Order Items Preview & Import Box */}
                {selectedPoData && poItemSelections.length > 0 && (
                  <div className="mt-2 p-3.5 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-xs text-slate-800 dark:text-slate-100">
                          {selectedPoData.number || `PO #${selectedPoData.id}`}
                        </span>
                        <span className="text-[11px] text-slate-400">•</span>
                        <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                          {selectedPoData.supplier?.name || "Supplier"}
                        </span>
                        <span className="text-[11px] text-slate-400">•</span>
                        <span className="text-[11px] text-slate-400">{selectedPoData.date}</span>
                        {selectedPoData.reference && (
                          <>
                            <span className="text-[11px] text-slate-400">•</span>
                            <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">
                              Ref: {selectedPoData.reference}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Quantity Mode Switcher: Units vs Packs */}
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                          Quantity:
                        </span>
                        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-900">
                          <button
                            type="button"
                            onClick={() => handleTogglePoQtyMode("units")}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                              poQtyMode === "units"
                                ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                            }`}
                          >
                            Units ({poItemSelections.reduce((sum, it) => sum + it.ordered_units, 0)})
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTogglePoQtyMode("packs")}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                              poQtyMode === "packs"
                                ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                            }`}
                          >
                            Packs ({poItemSelections.reduce((sum, it) => sum + it.ordered_packs, 0)})
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* PO Items Mini Table */}
                    <div className="max-h-56 overflow-y-auto border border-slate-100 dark:border-slate-700/60 rounded-lg">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50/80 dark:bg-slate-900/50 text-slate-500 uppercase text-[10px] font-semibold sticky top-0">
                          <tr>
                            <th className="p-2 w-8 text-center">
                              <input
                                type="checkbox"
                                checked={poItemSelections.length > 0 && poItemSelections.every((i) => i.selected)}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setPoItemSelections((prev) => prev.map((i) => ({ ...i, selected: checked })));
                                }}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </th>
                            <th className="p-2">Product</th>
                            <th className="p-2">Brand</th>
                            <th className="p-2 text-right">Pack Size</th>
                            <th className="p-2 text-right">Ordered</th>
                            <th className="p-2 text-right w-24">Sticker Qty</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {poItemSelections.map((it, idx) => (
                            <tr key={it.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                              <td className="p-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={it.selected}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setPoItemSelections((prev) =>
                                      prev.map((item, i) => (i === idx ? { ...item, selected: checked } : item))
                                    );
                                  }}
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                              </td>
                              <td className="p-2">
                                <div className="font-semibold text-slate-800 dark:text-slate-100">
                                  {it.product_name}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {it.barcode || "No Barcode"}
                                </div>
                              </td>
                              <td className="p-2 text-slate-600 dark:text-slate-300">{it.brand_name}</td>
                              <td className="p-2 text-right text-slate-600 dark:text-slate-300">
                                {it.pack_size}
                              </td>
                              <td className="p-2 text-right font-medium text-slate-700 dark:text-slate-200">
                                {it.ordered_units} units ({it.ordered_packs} packs)
                              </td>
                              <td className="p-2 text-right">
                                <input
                                  type="number"
                                  min="1"
                                  value={it.import_quantity}
                                  onChange={(e) => {
                                    const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                                    setPoItemSelections((prev) =>
                                      prev.map((item, i) =>
                                        i === idx ? { ...item, import_quantity: val } : item
                                      )
                                    );
                                  }}
                                  className="w-16 px-1.5 py-1 text-xs text-right font-bold rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Action Footer */}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Selected: {poItemSelections.filter((i) => i.selected).length} of{" "}
                        {poItemSelections.length} items (
                        {poItemSelections
                          .filter((i) => i.selected)
                          .reduce((sum, i) => sum + (i.import_quantity || 0), 0)}{" "}
                        stickers)
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPoOpt(null);
                            setSelectedPoData(null);
                            setPoItemSelections([]);
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          onClick={handleImportPoToQueue}
                          disabled={poItemSelections.filter((i) => i.selected).length === 0}
                          className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <PlusIcon className="w-3.5 h-3.5" />
                          <span>Add Selected Items to Queue</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Product Search Input using ProductSearchInput component */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <MagnifyingGlassIcon className="w-4 h-4 text-blue-500" />
                    <span>Search &amp; Add Products to Print Queue</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Click to open product picker modal
                  </span>
                </div>
                <ProductSearchInput
                  value={null}
                  onChange={(selected) => {
                    if (selected) {
                      addProductToQueue(selected, 1);
                    }
                  }}
                  products={products}
                  onRefreshProducts={fetchProducts}
                  className="h-10 text-xs px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-inner"
                />
              </div>

              {/* Partial Sheet Reuse (Skip N labels) */}
              {layout.paper_type === "sheet" && (
                <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="font-semibold text-amber-900 dark:text-amber-200 block">
                      Partial Sheet Reuse (Skip Already Used Stickers)
                    </span>
                    <span className="text-amber-700 dark:text-amber-400 text-[11px]">
                      If your sheet already has stickers peeled off, offset printing to start on an empty sticker position.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
                      Skip First:
                    </span>
                    <input
                      type="number"
                      min="0"
                      max={layout.columns * layout.rows - 1}
                      value={skipLabelsCount}
                      onChange={(e) => setSkipLabelsCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-16 px-2 py-1 text-xs rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-center font-bold"
                    />
                  </div>
                </div>
              )}

              {/* Queue Items Table */}
              {printQueue.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  <QrCodeIcon className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Your Print Queue is empty
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                    Use the product picker above to add products, select their batch and expiry dates, and print labels.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-3.5 py-2.5">Item &amp; Barcode</th>
                        <th className="px-3.5 py-2.5 min-w-[280px]">Batch &amp; Expiry Selection</th>
                        <th className="px-3.5 py-2.5 text-right">Price</th>
                        <th className="px-3.5 py-2.5 text-center">Print Qty</th>
                        <th className="px-3.5 py-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {printQueue.map((item, idx) => {
                        // Construct react-select batch options
                        const batchOptions = [];

                        // 1. All real batches
                        if (item.batches && item.batches.length > 0) {
                          item.batches.forEach((b) => {
                            const isFefo = b.is_fefo_recommended;
                            const isExpired = b.is_expired;
                            const expStr = b.expiry_date
                              ? formatExpiryDisplay(b.expiry_date, layout.options.expiry_format || "MM/YY")
                              : "No Exp";
                            batchOptions.push({
                              value: `batch_${b.id}`,
                              type: "batch",
                              batch_id: b.id,
                              batch_number: b.batch_number,
                              expiry_date: b.expiry_date || "",
                              quantity: Number(b.quantity || 0),
                              label: `${b.batch_number || "Batch"} (Exp: ${expStr}) — ${b.quantity} stock${
                                isFefo ? " [FEFO]" : ""
                              }${isExpired ? " [Expired]" : ""}`,
                            });
                          });
                        }

                        // 2. Unassigned Stock
                        const unassignedQty =
                          item.unassigned_quantity !== undefined
                            ? item.unassigned_quantity
                            : Math.max(
                                0,
                                item.stock -
                                  (item.batches || []).reduce(
                                    (sum, b) => sum + Number(b.quantity || 0),
                                    0
                                  )
                              );

                        batchOptions.push({
                          value: "unassigned",
                          type: "unassigned",
                          batch_id: null,
                          batch_number: "",
                          expiry_date: "",
                          quantity: unassignedQty,
                          label: `Unassigned Stock (${unassignedQty} unit${unassignedQty === 1 ? "" : "s"})`,
                        });

                        // 3. Custom Batch & Expiry Entry
                        batchOptions.push({
                          value: "custom",
                          type: "custom",
                          batch_id: "custom",
                          batch_number: item.custom_batch_number || "",
                          expiry_date: item.custom_expiry_date || "",
                          label: "Custom Batch & Expiry Entry…",
                        });

                        // Determine current selected option
                        let selectedOption = null;
                        if (item.selected_batch_type === "custom") {
                          selectedOption = batchOptions.find((o) => o.value === "custom");
                        } else if (item.selected_batch_type === "batch" && item.selected_batch_id) {
                          selectedOption = batchOptions.find(
                            (o) => o.value === `batch_${item.selected_batch_id}`
                          );
                        } else if (item.selected_batch_type === "unassigned") {
                          selectedOption = batchOptions.find((o) => o.value === "unassigned");
                        }

                        if (!selectedOption) {
                          selectedOption = batchOptions[0] || null;
                        }

                        return (
                          <tr
                            key={item.uid}
                            className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                              previewItemIndex === idx ? "bg-blue-50/30 dark:bg-blue-950/20" : ""
                            }`}
                          >
                            <td className="px-3.5 py-3">
                              <div className="font-semibold text-slate-800 dark:text-slate-100 max-w-xs truncate">
                                {item.product_name}
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                                <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.2 rounded text-[10px]">
                                  {item.barcode}
                                </span>
                                <span>•</span>
                                <span>Stock: {item.stock}</span>
                              </div>
                            </td>

                            <td className="px-3.5 py-3 min-w-[280px] max-w-[340px]">
                              <Select
                                value={selectedOption}
                                onChange={(opt) => handleBatchSelectChange(item.uid, opt)}
                                options={batchOptions}
                                styles={batchSelectStyles}
                                isLoading={item.loading_batches}
                                isSearchable={batchOptions.length > 4}
                                menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                                menuPosition="fixed"
                                placeholder={item.loading_batches ? "Loading batches…" : "Select batch or stock…"}
                              />

                              {/* Custom Batch & Expiry Inline Inputs */}
                              {item.selected_batch_type === "custom" && (
                                <div className="flex items-center gap-1.5 mt-1.5">
                                  <input
                                    type="text"
                                    placeholder="Custom Batch No"
                                    value={item.custom_batch_number || ""}
                                    onChange={(e) => handleCustomBatchChange(item.uid, e.target.value)}
                                    className="w-1/2 px-2 py-1 text-[11px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                  <input
                                    type="date"
                                    value={item.custom_expiry_date || ""}
                                    onChange={(e) => handleCustomExpiryChange(item.uid, e.target.value)}
                                    className="w-1/2 px-2 py-1 text-[11px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                </div>
                              )}

                              {/* Subtitle / Stock Info & Quick Print Action */}
                              {item.selected_batch_type === "batch" && selectedOption?.quantity !== undefined && (
                                <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1 px-0.5">
                                  <span>
                                    Batch stock:{" "}
                                    <strong className="text-slate-600 dark:text-slate-300">
                                      {selectedOption.quantity}
                                    </strong>{" "}
                                    units
                                  </span>
                                  {selectedOption.quantity > 0 && selectedOption.quantity !== item.print_quantity && (
                                    <button
                                      type="button"
                                      onClick={() => handleQtyChange(item.uid, selectedOption.quantity)}
                                      className="text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 hover:underline font-medium"
                                    >
                                      Print All ({selectedOption.quantity})
                                    </button>
                                  )}
                                </div>
                              )}

                              {item.selected_batch_type === "unassigned" && (
                                <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1 px-0.5">
                                  <span>
                                    Unassigned stock:{" "}
                                    <strong className="text-slate-600 dark:text-slate-300">
                                      {unassignedQty}
                                    </strong>{" "}
                                    units
                                  </span>
                                  {unassignedQty > 0 && unassignedQty !== item.print_quantity && (
                                    <button
                                      type="button"
                                      onClick={() => handleQtyChange(item.uid, unassignedQty)}
                                      className="text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 hover:underline font-medium"
                                    >
                                      Print All ({unassignedQty})
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>

                          <td className="px-3.5 py-3 text-right font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
                            {storeInfo.currency_symbol}{" "}
                            {Number(
                              layout.options.price_type === "wholesale"
                                ? item.wholesale_price
                                : item.retail_price
                            ).toFixed(2)}
                          </td>

                          <td className="px-3.5 py-3 text-center">
                            <div className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
                              <button
                                type="button"
                                onClick={() => handleQtyChange(item.uid, item.print_quantity - 1)}
                                className="px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min="1"
                                value={item.print_quantity}
                                onChange={(e) => handleQtyChange(item.uid, e.target.value)}
                                className="w-12 text-center text-xs py-1 border-0 focus:outline-none bg-transparent font-bold text-slate-800 dark:text-slate-100"
                              />
                              <button
                                type="button"
                                onClick={() => handleQtyChange(item.uid, item.print_quantity + 1)}
                                className="px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                              >
                                +
                              </button>
                            </div>
                          </td>

                          <td className="px-3.5 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setPreviewItemIndex(idx)}
                                title="Show preview of this label"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors"
                              >
                                <EyeIcon className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(item.uid)}
                                title="Remove from queue"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 transition-colors"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: LABEL CONTENT & STYLING */}
          {activeTab === "designer" && (
            <div className="products-panel bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-5 shadow-sm space-y-5">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <AdjustmentsHorizontalIcon className="w-4 h-4 text-blue-500" />
                  Sticker Field Toggles &amp; Layout
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Select which commercial and pharmaceutical details appear on the physical label.
                </p>
              </div>

              <div className="space-y-4 text-xs">
                {/* Store Header */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2.5">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <BuildingStorefrontIcon className="w-4 h-4 text-slate-400" />
                      Show Business / Store Name
                    </span>
                    <input
                      type="checkbox"
                      checked={layout.options.show_store_name}
                      onChange={(e) =>
                        setLayout({
                          ...layout,
                          options: { ...layout.options, show_store_name: e.target.checked },
                        })
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                  {layout.options.show_store_name && (
                    <input
                      type="text"
                      placeholder={`Default: ${storeInfo.store_name}`}
                      value={layout.options.store_name_override}
                      onChange={(e) =>
                        setLayout({
                          ...layout,
                          options: { ...layout.options, store_name_override: e.target.value },
                        })
                      }
                      className="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  )}
                </div>

                {/* Product Name */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2.5">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <TagIcon className="w-4 h-4 text-slate-400" />
                      Show Product Name
                    </span>
                    <input
                      type="checkbox"
                      checked={layout.options.show_product_name}
                      onChange={(e) =>
                        setLayout({
                          ...layout,
                          options: { ...layout.options, show_product_name: e.target.checked },
                        })
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                  {layout.options.show_product_name && (
                    <div className="flex items-center gap-4 text-[11px] text-slate-500">
                      <span>Max lines:</span>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="name_lines"
                          checked={layout.options.name_lines === 1}
                          onChange={() =>
                            setLayout({
                              ...layout,
                              options: { ...layout.options, name_lines: 1 },
                            })
                          }
                        />
                        <span>1 Line (Truncate)</span>
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="name_lines"
                          checked={layout.options.name_lines === 2}
                          onChange={() =>
                            setLayout({
                              ...layout,
                              options: { ...layout.options, name_lines: 2 },
                            })
                          }
                        />
                        <span>2 Lines (Wrap)</span>
                      </label>
                    </div>
                  )}
                </div>

                {/* Barcode Graphic & Text */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <QrCodeIcon className="w-4 h-4 text-slate-400" />
                      Show Vector Barcode Bars
                    </span>
                    <input
                      type="checkbox"
                      checked={layout.options.show_barcode}
                      onChange={(e) =>
                        setLayout({
                          ...layout,
                          options: { ...layout.options, show_barcode: e.target.checked },
                        })
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>

                  {layout.options.show_barcode && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <span className="text-[11px] text-slate-500 block mb-1">
                          Barcode Height: {layout.options.barcode_height}px
                        </span>
                        <input
                          type="range"
                          min="16"
                          max="50"
                          value={layout.options.barcode_height}
                          onChange={(e) =>
                            setLayout({
                              ...layout,
                              options: {
                                ...layout.options,
                                barcode_height: parseInt(e.target.value, 10),
                              },
                            })
                          }
                          className="w-full accent-blue-600"
                        />
                      </div>
                      <div className="flex items-center">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={layout.options.show_barcode_text}
                            onChange={(e) =>
                              setLayout({
                                ...layout,
                                options: {
                                  ...layout.options,
                                  show_barcode_text: e.target.checked,
                                },
                              })
                            }
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-[11px] text-slate-700 dark:text-slate-300">
                            Show Code Digits Under Bars
                          </span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Price Display */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2.5">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <TagIcon className="w-4 h-4 text-slate-400" />
                      Show Price Tag
                    </span>
                    <input
                      type="checkbox"
                      checked={layout.options.show_price}
                      onChange={(e) =>
                        setLayout({
                          ...layout,
                          options: { ...layout.options, show_price: e.target.checked },
                        })
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                  {layout.options.show_price && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                      <div>
                        <label className="block text-slate-500 mb-1">Price Source</label>
                        <select
                          value={layout.options.price_type}
                          onChange={(e) =>
                            setLayout({
                              ...layout,
                              options: { ...layout.options, price_type: e.target.value },
                            })
                          }
                          className="w-full py-1.5 px-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                        >
                          <option value="retail">Retail (Sale Price)</option>
                          <option value="wholesale">Wholesale Unit Price</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-500 mb-1">Prefix Label</label>
                        <input
                          type="text"
                          value={layout.options.price_prefix}
                          onChange={(e) =>
                            setLayout({
                              ...layout,
                              options: { ...layout.options, price_prefix: e.target.value },
                            })
                          }
                          placeholder="e.g. MRP:"
                          className="w-full py-1.5 px-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Batch & Expiry (Pharmacy Requirement) */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <CalendarDaysIcon className="w-4 h-4 text-emerald-500" />
                      Pharmaceutical Batch &amp; Expiry
                    </span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1 text-[11px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={layout.options.show_batch}
                          onChange={(e) =>
                            setLayout({
                              ...layout,
                              options: { ...layout.options, show_batch: e.target.checked },
                            })
                          }
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Batch No</span>
                      </label>
                      <label className="flex items-center gap-1 text-[11px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={layout.options.show_expiry}
                          onChange={(e) =>
                            setLayout({
                              ...layout,
                              options: { ...layout.options, show_expiry: e.target.checked },
                            })
                          }
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Expiry Date</span>
                      </label>
                    </div>
                  </div>

                  {layout.options.show_expiry && (
                    <div className="flex items-center gap-2 pt-1 text-[11px]">
                      <span className="text-slate-500">Expiry Format:</span>
                      <select
                        value={layout.options.expiry_format}
                        onChange={(e) =>
                          setLayout({
                            ...layout,
                            options: { ...layout.options, expiry_format: e.target.value },
                          })
                        }
                        className="py-1 px-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      >
                        <option value="MM/YY">MM/YY (e.g. 11/27)</option>
                        <option value="MM/YYYY">MM/YYYY (e.g. 11/2027)</option>
                        <option value="DD-MM-YYYY">DD-MM-YYYY (e.g. 30-11-2027)</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* Typography & Alignment */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 mb-1 font-medium">
                      Base Font Scale: {layout.options.font_scale}pt
                    </label>
                    <input
                      type="range"
                      min="8"
                      max="14"
                      value={layout.options.font_scale}
                      onChange={(e) =>
                        setLayout({
                          ...layout,
                          options: {
                            ...layout.options,
                            font_scale: parseInt(e.target.value, 10),
                          },
                        })
                      }
                      className="w-full accent-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 mb-1 font-medium">
                      Text Alignment
                    </label>
                    <div className="flex rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden">
                      <button
                        type="button"
                        onClick={() =>
                          setLayout({
                            ...layout,
                            options: { ...layout.options, text_align: "center" },
                          })
                        }
                        className={`flex-1 py-1.5 text-center font-medium ${
                          layout.options.text_align === "center"
                            ? "bg-blue-600 text-white"
                            : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        Center
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setLayout({
                            ...layout,
                            options: { ...layout.options, text_align: "left" },
                          })
                        }
                        className={`flex-1 py-1.5 text-center font-medium ${
                          layout.options.text_align === "left"
                            ? "bg-blue-600 text-white"
                            : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        Left
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PAPER & GRID SETUP */}
          {activeTab === "paper" && (
            <div className="products-panel bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-5 shadow-sm space-y-5">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Squares2X2Icon className="w-4 h-4 text-blue-500" />
                  Paper Media &amp; Dimension Calibration
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Calibrate exact sticker physical widths, heights, margins, and columns.
                </p>
              </div>

              <div className="space-y-4 text-xs">
                {/* Media Type */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    onClick={() => setLayout({ ...layout, paper_type: "roll" })}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      layout.paper_type === "roll"
                        ? "border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20"
                        : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <div className="font-bold flex items-center gap-2">
                      <PrinterIcon className="w-4 h-4 shrink-0" />
                      <span>Thermal Roll Printer</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Continuous die-cut roll (Xprinter, Zebra, TSC, Rongta, Dymo)
                    </div>
                  </div>

                  <div
                    onClick={() => setLayout({ ...layout, paper_type: "sheet" })}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      layout.paper_type === "sheet"
                        ? "border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20"
                        : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <div className="font-bold flex items-center gap-2">
                      <DocumentDuplicateIcon className="w-4 h-4 shrink-0" />
                      <span>A4 / Letter Sticker Sheet</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Office laser &amp; inkjet printers (Avery 5160, 24-up, 40-up sheets)
                    </div>
                  </div>
                </div>

                {/* Width & Height Dimensions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                      Label Width (mm)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="15"
                      max="200"
                      value={layout.width_mm}
                      onChange={(e) =>
                        setLayout({
                          ...layout,
                          width_mm: parseFloat(e.target.value) || 50,
                        })
                      }
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                      Label Height (mm)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="10"
                      max="200"
                      value={layout.height_mm}
                      onChange={(e) =>
                        setLayout({
                          ...layout,
                          height_mm: parseFloat(e.target.value) || 25,
                        })
                      }
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                </div>

                {/* Sheet Grid Settings (if sheet) */}
                {layout.paper_type === "sheet" && (
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-3">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">
                      Sheet Grid Matrix
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-slate-500 text-[11px] mb-1">Columns</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={layout.columns}
                          onChange={(e) =>
                            setLayout({
                              ...layout,
                              columns: parseInt(e.target.value, 10) || 1,
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 text-[11px] mb-1">Rows</label>
                        <input
                          type="number"
                          min="1"
                          max="30"
                          value={layout.rows}
                          onChange={(e) =>
                            setLayout({
                              ...layout,
                              rows: parseInt(e.target.value, 10) || 1,
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 text-[11px] mb-1">Gap X (mm)</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={layout.gap_x_mm}
                          onChange={(e) =>
                            setLayout({
                              ...layout,
                              gap_x_mm: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 text-[11px] mb-1">Gap Y (mm)</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={layout.gap_y_mm}
                          onChange={(e) =>
                            setLayout({
                              ...layout,
                              gap_y_mm: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Real-Time Calibrated WYSIWYG Live Preview (5 Cols) */}
        <div id="barcode-live-preview" className="lg:col-span-5 sticky top-6 space-y-4">
          <div className="products-panel bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <EyeIcon className="w-4 h-4 text-blue-500" />
                Live Sticker Preview
              </h3>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[11px] text-slate-400">Zoom:</span>
                {[100, 150, 200].map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setPreviewZoom(z)}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                      previewZoom === z
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                    }`}
                  >
                    {z}%
                  </button>
                ))}
              </div>
            </div>

            {/* Simulated Sticker Workspace */}
            <div className="my-5 flex items-center justify-center p-6 bg-slate-100/70 dark:bg-slate-950/60 rounded-xl overflow-x-auto border border-slate-200/60 dark:border-slate-800/60">
              {/* Millimeter Scaled Die-Cut Sticker Card */}
              <div
                style={{
                  // 1mm ~ 3.7795px at 96 DPI screen
                  width: `${(layout.width_mm * 3.78 * (previewZoom / 100)).toFixed(0)}px`,
                  minHeight: `${(layout.height_mm * 3.78 * (previewZoom / 100)).toFixed(0)}px`,
                  fontSize: `${((layout.options.font_scale * 1.3 * previewZoom) / 100).toFixed(1)}px`,
                  padding: `${Math.max(4, (layout.margin_top_mm * 3.78 * (previewZoom / 100)) / 2)}px`,
                }}
                className="bg-white text-slate-900 rounded-lg shadow-xl border border-slate-300 flex flex-col justify-between transition-all select-none overflow-hidden"
              >
                {/* Store Name Header */}
                {layout.options.show_store_name && (
                  <div
                    style={{
                      textAlign: layout.options.text_align,
                      fontSize: `${((layout.options.font_scale * 1.1 * previewZoom) / 100).toFixed(1)}px`,
                    }}
                    className="font-bold tracking-tight uppercase truncate leading-none pb-0.5"
                  >
                    {layout.options.store_name_override.trim() || storeInfo.store_name}
                  </div>
                )}

                {/* Product Name */}
                {layout.options.show_product_name && (
                  <div
                    style={{
                      textAlign: layout.options.text_align,
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: layout.options.name_lines,
                      fontSize: `${((layout.options.font_scale * 1.15 * previewZoom) / 100).toFixed(1)}px`,
                    }}
                    className="font-semibold leading-tight overflow-hidden text-slate-900"
                  >
                    {currentPreviewItem.product_name}
                  </div>
                )}

                {/* Barcode Vector Graphic */}
                {layout.options.show_barcode && (
                  <div
                    className={`py-1 flex ${
                      layout.options.text_align === "left" ? "justify-start" : "justify-center"
                    }`}
                  >
                    <BarcodeSvg
                      value={currentPreviewItem.barcode}
                      height={layout.options.barcode_height * (previewZoom / 100)}
                      barWidth={layout.options.bar_width * (previewZoom / 100)}
                      showText={layout.options.show_barcode_text}
                      fontSize={Math.max(8, (10 * previewZoom) / 100)}
                    />
                  </div>
                )}

                {/* Batch, Expiry, & Price Footer */}
                <div className="flex items-center justify-between font-semibold leading-tight pt-0.5 border-t border-slate-200 text-slate-800">
                  <div className="flex items-center gap-1.5 text-[0.8em]">
                    {layout.options.show_batch && currentPreviewItem.batch_number && (
                      <span>B:{currentPreviewItem.batch_number}</span>
                    )}
                    {layout.options.show_expiry && currentPreviewItem.expiry_date && (
                      <span>
                        Exp:
                        {formatExpiryDisplay(
                          currentPreviewItem.expiry_date,
                          layout.options.expiry_format
                        )}
                      </span>
                    )}
                  </div>

                  {layout.options.show_price && (
                    <div className="font-bold text-[0.9em] whitespace-nowrap">
                      {layout.options.price_prefix} {storeInfo.currency_symbol}{" "}
                      {Number(
                        layout.options.price_type === "wholesale"
                          ? currentPreviewItem.wholesale_price
                          : currentPreviewItem.retail_price
                      ).toFixed(storeInfo.currency_decimal_places || 2)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Calibration Dimensions Footer */}
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Actual Dimensions: {layout.width_mm}mm × {layout.height_mm}mm</span>
              <span>Previewing: {currentPreviewItem.product_name?.slice(0, 18)}…</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== SAVE TEMPLATE MODAL ===== */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <BookmarkSquareIcon className="w-5 h-5 text-blue-500" />
                Save Custom Barcode Template
              </h3>
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveTemplateSubmit} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Template Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Front Shelf Tag 50x25mm"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 text-[11px] text-slate-500 space-y-1">
                <div>Dimensions: {layout.width_mm}mm × {layout.height_mm}mm</div>
                <div>Media Type: {layout.paper_type === "roll" ? "Thermal Roll" : "Sticker Sheet"}</div>
                <div>Elements: Store Name, Product Name, Barcode, Price, Batch/Expiry</div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="products-action theme-btn-tertiary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingTemplate}
                  className="products-action theme-btn-primary"
                >
                  <span>{savingTemplate ? "Saving…" : "Save Preset"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

