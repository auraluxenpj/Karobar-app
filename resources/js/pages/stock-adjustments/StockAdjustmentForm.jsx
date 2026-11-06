import { useEffect, useRef, useState, useMemo } from "react";
import axios from "axios";
import { PlusIcon, XMarkIcon, ClipboardDocumentListIcon } from "@heroicons/react/24/solid";
import toast from "react-hot-toast";
import ProductSearchInput from "../../components/ProductSearchInput.jsx";
import BatchSearchInput from "../../components/BatchSearchInput.jsx";
import { useTheme } from "@/context/ThemeContext.jsx";
import { getThemeButtonClasses } from "@/utils/buttonStyles";

// Helper to determine text color based on background brightness
const getContrastText = (hexColor) => {
  hexColor = hexColor.replace('#', '');
  const r = parseInt(hexColor.substring(0, 2), 16);
  const g = parseInt(hexColor.substring(2, 4), 16);
  const b = parseInt(hexColor.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
};

const getButtonTextColor = (primaryColor, primaryHoverColor) => {
  return getContrastText(primaryHoverColor || primaryColor);
};

export default function StockAdjustmentForm({ adjustmentId, onSuccess }){
  const { isDark, theme } = useTheme();
  
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
        tertiary: '#06b6d4',
        tertiaryHover: '#0891b2',
        tertiaryLight: '#cffafe',
        danger: '#ef4444',
        dangerHover: '#dc2626',
        dangerLight: '#fee2e2',
      };
    }
    return {
      primary: theme.primary_color || '#3b82f6',
      primaryHover: theme.primary_hover || '#2563eb',
      primaryLight: theme.primary_light || '#dbeafe',
      secondary: theme.secondary_color || '#8b5cf6',
      secondaryHover: theme.secondary_hover || '#7c3aed',
      secondaryLight: theme.secondary_light || '#ede9fe',
      tertiary: theme.tertiary_color || '#06b6d4',
      tertiaryHover: theme.tertiary_hover || '#0891b2',
      tertiaryLight: theme.tertiary_light || '#cffafe',
      danger: theme.danger_color || '#ef4444',
      dangerHover: '#dc2626',
      dangerLight: '#fee2e2',
    };
  }, [theme]);

  // Calculate text colors based on background brightness
  const primaryTextColor = useMemo(() => 
    getButtonTextColor(themeColors.primary, themeColors.primaryHover), 
    [themeColors.primary, themeColors.primaryHover]
  );
  
  const secondaryTextColor = useMemo(() => 
    getButtonTextColor(themeColors.secondary, themeColors.secondaryHover), 
    [themeColors.secondary, themeColors.secondaryHover]
  );
  
  const dangerTextColor = useMemo(() => 
    getButtonTextColor(themeColors.danger, themeColors.dangerHover), 
    [themeColors.danger, themeColors.dangerHover]
  );

  // Get button style from theme
  const buttonStyle = theme?.button_style || 'modern';

  const getButtonClasses = useMemo(
    () => getThemeButtonClasses(buttonStyle, themeColors, isDark, primaryTextColor),
    [buttonStyle, themeColors, isDark, primaryTextColor]
  );

  const btnPrimary = getButtonClasses.primary;
  const btnSecondary = getButtonClasses.secondary;
  const btnDanger = getButtonClasses.danger;
  
  const [products, setProducts] = useState([]);
  const [batchesByProduct, setBatchesByProduct] = useState({}); // { [productId]: [{batch_number, expiry, available_units}, ...] }

  const [form, setForm] = useState({
    posted_number: "",
    posted_date: new Date().toISOString().slice(0,10),
    note: "",
    items: [
      { product_id: "", batch_number: "", expiry: "", pack_size: "", available_qty: "", actual_qty: "", diff_qty: "", unit_purchase_price: "", worth_adjusted: "" }
    ],
    total_worth: 0,
  });

  // row-level error flags for red highlights
  const [rowErrors, setRowErrors] = useState({
    product: [false],
    batch: [false],
  });

  // Refs for keyboard nav
  const noteRef = useRef(null);
  const productCellRefs = useRef([]); // wrapper cells; used to focus inner input
  const actualRefs = useRef([]);      // actual qty inputs
  const batchInputRefs = useRef([]);  // batch input refs

  // ---------- Helpers ----------
  const to2 = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    return n.toFixed(2);
  };

  const mergeProducts = (list) => {
    if (!Array.isArray(list) || list.length === 0) return;
    setProducts(prev => {
      const byId = new Map((prev || []).map(p => [String(p.id), p]));
      for (const p of list) {
        if (p && p.id != null) byId.set(String(p.id), p);
      }
      return Array.from(byId.values());
    });
  };

  const batchesFor = (productId) => {
    const arr = batchesByProduct[String(productId)];
    return Array.isArray(arr) ? arr : [];
  };

  const usedBatchesForProduct = (productId, excludeRowIndex) => {
    return form.items
      .map((r, idx) => (idx === excludeRowIndex ? "" : r.product_id === productId ? r.batch_number : ""))
      .filter(Boolean);
  };

  const isProductDuplicate = (productId, rowIndex) => {
    if (!productId) return false;
    return form.items.some((r, idx) => idx !== rowIndex && r.product_id === productId);
  };

  const isBatchDuplicate = (productId, batchNumber, rowIndex) => {
    if (!productId || !batchNumber) return false;
    return form.items.some(
      (r, idx) =>
        idx !== rowIndex &&
        r.product_id === productId &&
        (r.batch_number || "") === (batchNumber || "")
    );
  };

  const setErrorFlag = (rowIndex, type, value) => {
    setRowErrors(prev => {
      const next = { product: [...(prev.product||[])], batch: [...(prev.batch||[])] };
      if (type === "product") next.product[rowIndex] = !!value;
      if (type === "batch") next.batch[rowIndex] = !!value;
      return next;
    });
  };

  const syncErrorsLength = (len) => {
    setRowErrors(prev => ({
      product: Array.from({ length: len }, (_, i) => prev.product?.[i] ?? false),
      batch: Array.from({ length: len }, (_, i) => prev.batch?.[i] ?? false),
    }));
  };

  const focusProduct = (rowIndex) => {
    const cell = productCellRefs.current[rowIndex];
    if (!cell) return;
    const input = cell.querySelector("input");
    input?.focus();
    input?.select?.();
  };

  const focusActual = (rowIndex) => {
    const el = actualRefs.current[rowIndex];
    el?.focus();
    el?.select?.();
  };

  const focusBatch = (rowIndex) => {
    const el = batchInputRefs.current[rowIndex];
    if (el) {
      el.focus();
      el.select?.();
    }
  };

  const recalc = (state)=>{
    const items = (state.items||[]).map(it=>{
      const av = Number(it.available_qty||0);
      const ac = Number(it.actual_qty||0);
      const diff = ac - av;
      const unit = Number(it.unit_purchase_price||0);
      const worth = Math.abs(diff) * unit;
      return { ...it, diff_qty: Number.isFinite(diff)?diff:"", worth_adjusted: Number.isFinite(worth)?worth:"" };
    });
    const total = items.reduce((s,it)=> s + Number(it.worth_adjusted||0), 0);
    return { ...state, items, total_worth: total };
  };

  // ---------- Effects ----------
  useEffect(()=>{ (async()=>{
    // 1) load a default search list (for new rows / user search)
    await fetchProducts("");

    // 2) load the record OR code
    if(adjustmentId){
      await fetchOne(); // this will hydrate missing pack_size from product master
    } else {
      await fetchNewCode();
    }
    setTimeout(()=>noteRef.current?.focus(), 80);
  })(); }, [adjustmentId]);

  // Ctrl+S / Ctrl+Enter / F9 save
  useEffect(() => {
    const onKey = (e) => {
      const hasCtrl = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
      const key = (e.key || "").toLowerCase();
      if ((hasCtrl && (key === "s" || e.key === "Enter")) || e.key === "F9") {
        e.preventDefault();
        handleSubmit(new Event("submit"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [form, adjustmentId]);

  // ---------- Data fetchers ----------
  const fetchProducts = async(q="")=>{
    const { data } = await axios.get('/api/products/search', { params: { q, limit: 30 } });
    const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    setProducts(list);
  };

  const fetchProductById = async (id) => {
    try {
      const { data } = await axios.get(`/api/products/${id}`);
      const p = data?.data ?? data;
      return p && p.id != null ? p : null;
    } catch {
      return null;
    }
  };

  // Return fetched products so caller can hydrate rows immediately
  const ensureProductsLoaded = async (ids=[]) => {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const existingIds = new Set((products || []).map(p => String(p.id)));
    const toFetch = ids.filter(id => !existingIds.has(String(id)));
    if (toFetch.length === 0) return [];
    const fetched = (await Promise.all(toFetch.map(id => fetchProductById(id)))).filter(Boolean);
    mergeProducts(fetched);
    return fetched; // <— allow caller to use them right away
  };

  const fetchBatches = async(productId)=>{
    const key = String(productId||"");
    if(!key) return [];
    if(Array.isArray(batchesByProduct[key])) return batchesByProduct[key];
    try {
      const { data } = await axios.get(`/api/products/${productId}/batches`);
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      setBatchesByProduct(prev => ({ ...prev, [key]: list }));
      return list;
    } catch {
      setBatchesByProduct(prev => ({ ...prev, [key]: [] }));
      return [];
    }
  };

  const fetchOne = async()=>{
    const { data } = await axios.get(`/api/stock-adjustments/${adjustmentId}`);
    const record = data?.data ?? data;

    // basic map from API
    let mapped = {
      posted_number: record.posted_number,
      posted_date: record.posted_date,
      note: record.note,
      items: (record.items||[]).map(it=>({
        product_id: it.product_id,
        batch_number: it.batch_number || "",
        expiry: it.expiry || "",
        pack_size: it.pack_size || "",            // might be empty in DB — we'll hydrate below
        available_qty: it.previous_qty,
        actual_qty: it.actual_qty,
        diff_qty: it.diff_qty,
        unit_purchase_price: it.unit_purchase_price,
        worth_adjusted: it.worth_adjusted,
      })),
      total_worth: record.total_worth,
    };

    setForm(mapped);
    syncErrorsLength((record.items||[]).length || 1);

    // ensure product options exist for each used product so ProductSearchInput can display them
    const uniquePids = Array.from(new Set((record.items||[]).map(it=>it.product_id))).filter(Boolean);

    // fetch any missing product masters and also build a byId map
    const fetched = await ensureProductsLoaded(uniquePids);
    const all = [...products, ...fetched];
    const byId = new Map(all.map(p => [String(p.id), p]));

    // preload batch options too (optional)
    await Promise.all(uniquePids.map(pid => fetchBatches(pid)));

    // HYDRATE missing fields (esp. pack_size) from product master
    mapped = recalc({
      ...mapped,
      items: mapped.items.map(row => {
        const p = byId.get(String(row.product_id)) || {};
        const packFromProd = p.pack_size ?? p.packSize ?? "";
        const unitFromProd = p.unit_purchase_price ?? p.unitPurchasePrice ?? "";
        const availFromProd = p.available_units ?? p.available_quantity ?? p.quantity_on_hand ?? p.quantity ?? "";

        return {
          ...row,
          pack_size: row.pack_size || (packFromProd ?? ""),
          unit_purchase_price: row.unit_purchase_price ?? unitFromProd ?? "",
          available_qty: row.available_qty ?? availFromProd ?? "",
        };
      }),
    });

    setForm(mapped);
  };

  const fetchNewCode = async()=>{
    const { data } = await axios.get('/api/stock-adjustments/new-code');
    setForm(prev=>({ ...prev, posted_number: (data?.data?.posted_number ?? data.posted_number) }));
  };

  // ---------- Row actions ----------
  const onSelectProduct = async (rowIndex, selected)=>{
    const list = Array.isArray(products) ? products : (Array.isArray(products?.data) ? products.data : []);
    const p = (selected && typeof selected === 'object') ? selected : list.find(x=>x?.id===selected);
    if(!p) return;

    // Check uniqueness across rows
    if (isProductDuplicate(p.id, rowIndex)) {
      setErrorFlag(rowIndex, "product", true);
      toast.error(`Row ${rowIndex+1}: product already selected in another row`);
      setTimeout(()=>focusProduct(rowIndex), 0);
      return;
    }
    setErrorFlag(rowIndex, "product", false);
    setErrorFlag(rowIndex, "batch", false);

    const get = (obj, keys, d="") => { for(const k of keys){ const v=obj?.[k]; if(v!==undefined && v!==null && v!=="") return v; } return d; };
    const toNum = (x)=>{ const n=Number(x); return Number.isFinite(n)?n:null; };

    const available = toNum(get(p, ['available_units','available_quantity','quantity_on_hand','quantity'], 0)) ?? 0;
    const unitCost = toNum(get(p, ['unit_purchase_price','unitPurchasePrice'], 0)) ?? 0;
    const packSize = toNum(get(p, ['pack_size','packSize'], ""));

    const items=[...form.items];
    items[rowIndex] = {
      ...items[rowIndex],
      product_id: p.id,
      available_qty: available,
      unit_purchase_price: unitCost ?? "",
      pack_size: packSize ?? "",
      batch_number: "",
      expiry: "",
      actual_qty: "",
      diff_qty: "",
      worth_adjusted: "",
    };
    setForm(prev=> recalc({ ...prev, items }));

    const batches = await fetchBatches(p.id);
    
    // If product has batches, focus batch field; otherwise focus actual qty
    if (Array.isArray(batches) && batches.length > 0) {
      setTimeout(()=>focusBatch(rowIndex), 0);
    } else {
      setTimeout(()=>focusActual(rowIndex), 0);
    }
  };

  const onItemChange = (i, field, raw)=>{
    let value = raw;
    if(['actual_qty','unit_purchase_price'].includes(field)){
      if(!/^\d*\.?\d*$/.test(value)) return; // numeric while typing
    }
    const items=[...form.items];
    items[i] = { ...items[i], [field]: value };
    setForm(prev=> recalc({ ...prev, items }));
  };

  const onUnitCostBlur = (i) => {
    const items=[...form.items];
    const val = items[i]?.unit_purchase_price;
    if (val === "" || val === null || val === undefined) return;
    items[i] = { ...items[i], unit_purchase_price: to2(val) };
    setForm(prev=> recalc({ ...prev, items }));
  };

  const onBatchChange = (i, batchNumber)=>{
    const row = form.items[i];
    const productId = row.product_id;

    if (!batchNumber || batchNumber.trim() === "") {
      // Clear batch fields when batch is cleared
      const items=[...form.items];
      items[i] = {
        ...row,
        batch_number: "",
        expiry: "",
        available_qty: row.available_qty ?? "",
      };
      setForm(prev=> recalc({ ...prev, items }));
      setErrorFlag(i, "batch", false);
      return;
    }

    if (isBatchDuplicate(productId, batchNumber, i)) {
      setErrorFlag(i, "batch", true);
      toast.error(`Row ${i+1}: this batch is already used for the selected product`);
      return;
    }
    setErrorFlag(i, "batch", false);

    const list = batchesFor(productId);
    const selected = list.find(b => b.batch_number === batchNumber);

    // If batch not found in list (manually typed), don't save it yet - let user select from list
    if (!selected) {
      setErrorFlag(i, "batch", true);
      toast.error(`Row ${i+1}: please select a batch from the dropdown list`);
      const items=[...form.items];
      items[i] = {
        ...row,
        batch_number: "",
        expiry: "",
      };
      setForm(prev=> recalc({ ...prev, items }));
      return;
    }

    // Format expiry date if it exists (ensure YYYY-MM-DD format for date input)
    let expiryValue = selected?.expiry_date || "";
    if (expiryValue) {
      // If expiry is a date string, ensure it's in YYYY-MM-DD format
      try {
        const date = new Date(expiryValue);
        if (!isNaN(date.getTime())) {
          expiryValue = date.toISOString().slice(0, 10);
        }
      } catch (e) {
        expiryValue = "";
      }
    }

    const items=[...form.items];
    items[i] = {
      ...row,
      batch_number: batchNumber || "",
      expiry: expiryValue,
      available_qty: (selected?.quantity ?? row.available_qty) ?? "",
    };
    setForm(prev=> recalc({ ...prev, items }));

    // Focus actual quantity field after selecting batch for better UX
    setTimeout(()=>focusActual(i), 0);
  };

  const addRow = ()=> {
    setForm(prev=>({
      ...prev,
      items: [...prev.items, {
        product_id:"", batch_number:"", expiry:"", pack_size:"",
        available_qty:"", actual_qty:"", diff_qty:"",
        unit_purchase_price:"", worth_adjusted:""
      }]
    }));
    setRowErrors(prev => ({
      product: [...prev.product, false],
      batch: [...prev.batch, false],
    }));
  };

  const removeRow = (i)=> {
    setForm(prev=>{
      if (prev.items.length <= 1) return prev;
      const nextItems = prev.items.filter((_,idx)=>idx!==i);
      setRowErrors(curr => ({
        product: curr.product.filter((_,idx)=>idx!==i),
        batch: curr.batch.filter((_,idx)=>idx!==i),
      }));
      return { ...prev, items: nextItems };
    });
  };

  // ---------- Keyboard handlers ----------
  const onNoteKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      focusProduct(0);
    }
  };

  const onActualKeyDown = (rowIndex) => (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (rowIndex === form.items.length - 1) {
        addRow();
        setTimeout(()=>focusProduct(rowIndex + 1), 0);
      } else {
        focusProduct(rowIndex + 1);
      }
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (rowIndex === form.items.length - 1) {
        addRow();
        setTimeout(()=>focusProduct(rowIndex + 1), 0);
      } else {
        focusActual(rowIndex + 1);
      }
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (rowIndex > 0) focusActual(rowIndex - 1);
    }
  };

  // ---------- Submit ----------
  const handleSubmit = async(e)=>{
    if (e && typeof e.preventDefault === "function") e.preventDefault();

    for (const [idx, it] of form.items.entries()) {
      if (!it.product_id) { toast.error(`Row ${idx+1}: select product`); setErrorFlag(idx,"product",true); return; }
      if (isProductDuplicate(it.product_id, idx)) { toast.error(`Row ${idx+1}: duplicate product`); setErrorFlag(idx,"product",true); return; }
      if (it.actual_qty === "" || isNaN(Number(it.actual_qty))) { toast.error(`Row ${idx+1}: enter Actual Qty`); return; }

      const bArr = batchesFor(it.product_id);
      if (Array.isArray(bArr) && bArr.length > 0 && !it.batch_number) { toast.error(`Row ${idx+1}: select batch`); setErrorFlag(idx,"batch",true); return; }

      if (it.batch_number && isBatchDuplicate(it.product_id, it.batch_number, idx)) {
        toast.error(`Row ${idx+1}: duplicate batch for this product`);
        setErrorFlag(idx,"batch",true);
        return;
      }

      // Validate expiry is set when batch is required
      if (it.batch_number && (!it.expiry || it.expiry.trim() === "")) {
        toast.error(`Row ${idx+1}: expiry date is required for batch ${it.batch_number}`);
        return;
      }
    }

    const payload = {
      posted_number: form.posted_number,
      posted_date: form.posted_date,
      note: form.note,
      items: form.items
        .filter(it=> it.product_id && it.actual_qty !== "")
        .map(it=>({
          product_id: it.product_id,
          actual_qty: Number(it.actual_qty||0),
          unit_purchase_price: Number(it.unit_purchase_price||0),
          batch_number: it.batch_number || null,
          expiry: it.expiry || null,
          pack_size: it.pack_size || null,
        })),
    };

    try{
      if(adjustmentId){
        await axios.put(`/api/stock-adjustments/${adjustmentId}`, payload);
        toast.success('Stock adjustment updated');
      }else{
        await axios.post('/api/stock-adjustments', payload);
        toast.success('Stock adjustment created');
      }
      onSuccess?.();
    }catch(err){
      console.error('Save error:', err.response?.data);
      toast.error(err?.response?.data?.message || 'Save failed - check console for details');
    }
  };

  // ---------- Render ----------
  return (
    <form className="stock-adjustment-form products-panel">
      {/* Header */}
      <div className="stock-adjustment-header">
        <div className="flex items-center gap-3 mb-4">
          <div className="products-identity-icon"><ClipboardDocumentListIcon className="w-6 h-6" /></div>
          <div>
            <h1 className="products-title">{adjustmentId ? "Edit stock adjustment" : "Stock adjustment"}</h1>
            <p className="products-subtitle">Record actual stock and review the quantity and worth differences.</p>
          </div>
        </div>
        <table className="w-full border-collapse text-xs">
          <tbody>
            <tr>
              <td className={`border p-1 w-1/6 ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                <label className={`block text-[10px] ${isDark ? "text-slate-400" : "text-gray-600"}`}>Posted Number</label>
                <input 
                  type="text" 
                  readOnly 
                  aria-label="Posted number"
                  value={form.posted_number||""} 
                  className={`border rounded w-full p-1 h-7 text-xs ${
                    isDark 
                      ? "border-slate-600 bg-slate-700 text-slate-300" 
                      : "border-gray-300 bg-gray-100 text-gray-700"
                  }`} 
                />
              </td>
              <td className={`border p-1 w-1/6 ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                <label className={`block text-[10px] ${isDark ? "text-slate-400" : "text-gray-600"}`}>Posted Date</label>
                <input 
                  type="date" 
                  aria-label="Posted date"
                  value={form.posted_date} 
                  onChange={e=>setForm(prev=>({ ...prev, posted_date: e.target.value }))} 
                  className={`border rounded w-full p-1 h-7 text-xs ${
                    isDark 
                      ? "border-slate-600 bg-slate-700 text-slate-200" 
                      : "border-gray-300 text-gray-800"
                  }`} 
                />
              </td>
              <td className={`border p-1 ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                <label className={`block text-[10px] ${isDark ? "text-slate-400" : "text-gray-600"}`}>Note (Reason) *</label>
                <input
                  ref={noteRef}
                  aria-label="Adjustment reason"
                  type="text"
                  value={form.note}
                  onChange={e=>setForm(prev=>({ ...prev, note: e.target.value }))}
                  onKeyDown={onNoteKeyDown}
                  className={`border rounded w-full p-1 h-7 text-xs ${
                    isDark 
                      ? "border-slate-600 bg-slate-700 text-slate-200" 
                      : "border-gray-300 text-gray-800"
                  }`}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Items */}
      <div className="stock-adjustment-items" role="region" aria-label="Adjustment items" tabIndex={0}>
        <h2 className={`text-xs font-bold mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>Items</h2>
        <table className={`w-full border-collapse text-[11px] ${isDark ? "bg-slate-800" : "bg-white"}`}>
          <thead className={`sticky top-0 z-5 ${isDark ? "bg-slate-700" : "bg-gray-100"}`}>
            <tr>
              <th className={`border ${isDark ? "border-slate-600" : "border-gray-200"} w-6`}>#</th>
              <th className={`border ${isDark ? "border-slate-600" : "border-gray-200"} w-[220px] text-left`}>Product</th>
              <th className={`border ${isDark ? "border-slate-600" : "border-gray-200"} w-28`}>Batch</th>
              <th className={`border ${isDark ? "border-slate-600" : "border-gray-200"} w-24`}>Expiry</th>
              <th className={`border ${isDark ? "border-slate-600" : "border-gray-200"} w-24`}>Pack Size</th>
              <th className={`border ${isDark ? "border-slate-600" : "border-gray-200"} w-24`}>Available Qty</th>
              <th className={`border ${isDark ? "border-slate-600" : "border-gray-200"} w-24`}>Actual Qty *</th>
              <th className={`border ${isDark ? "border-slate-600" : "border-gray-200"} w-24`}>Diff</th>
              <th className={`border ${isDark ? "border-slate-600" : "border-gray-200"} w-28`}>Unit Cost</th>
              <th className={`border ${isDark ? "border-slate-600" : "border-gray-200"} w-28`}>Worth Adjusted</th>
              <th className={`border ${isDark ? "border-slate-600" : "border-gray-200"} w-6`}>+</th>
            </tr>
          </thead>
          <tbody>
            {form.items.map((it,i)=> {
              const productId = it.product_id;
              const batchList = batchesFor(productId);
              const usedForThisProduct = usedBatchesForProduct(productId, i);

              const productCellError = rowErrors.product?.[i];
              const batchCellError = rowErrors.batch?.[i];

              return (
              <tr key={i} className={`text-center ${isDark ? "hover:bg-slate-700/50" : "hover:bg-gray-50"}`}>
                <td data-label="Remove" className={`border ${isDark ? "border-slate-600" : "border-gray-200"}`}>
                  <button 
                    type="button" 
                    onClick={()=>removeRow(i)} 
                    className="products-row-action stock-adjustment-remove"
                    aria-label={`Remove item ${i + 1}`} title="Remove item"
                  ><XMarkIcon className="w-5 h-5" aria-hidden="true" /></button>
                </td>

                {/* PRODUCT */}
                <td data-label="Product"
                  className={`border text-left ${productCellError ? "ring-2 ring-red-500" : ""} ${isDark ? "border-slate-600" : "border-gray-200"}`}
                  ref={el => (productCellRefs.current[i] = el)}
                  title={productCellError ? "Duplicate product not allowed" : ""}
                >
                  <ProductSearchInput
                    value={products.find(p=>p.id===productId) || productId}
                    onChange={(val)=> onSelectProduct(i, val)}
                    products={products}
                    onRefreshProducts={fetchProducts}
                  />
                </td>

                {/* BATCH */}
                <td data-label="Batch"
                  className={`border ${batchCellError ? "ring-2 ring-red-500" : ""} ${isDark ? "border-slate-600" : "border-gray-200"}`}
                  title={batchCellError ? "Duplicate batch for this product not allowed" : ""}
                >
                  <BatchSearchInput
                    ref={el => (batchInputRefs.current[i] = el)}
                    value={it.batch_number}
                    onChange={(bn)=> onBatchChange(i, bn)}
                    batches={batchList}
                    usedBatches={usedForThisProduct}
                  />
                </td>

                <td data-label="Expiry" className={`border ${isDark ? "border-slate-600" : "border-gray-200"}`}>
                  <input
                    type="date"
                    aria-label={`Expiry for item ${i + 1}`}
                    value={it.expiry ?? ''}
                    onChange={e=>onItemChange(i,'expiry',e.target.value)}
                    className={`border w-full h-6 text-[11px] px-1 ${
                      isDark 
                        ? "border-slate-600 bg-slate-700 text-slate-200" 
                        : "border-gray-300 bg-white text-gray-800"
                    }`}
                  />
                </td>
                <td data-label="Pack size" className={`border ${isDark ? "border-slate-600" : "border-gray-200"}`}>
                  <input
                    aria-label={`Pack size for item ${i + 1}`}
                    value={it.pack_size ?? ''}
                    readOnly
                    className={`border w-full h-6 text-[11px] px-1 ${
                      isDark 
                        ? "border-slate-600 bg-slate-700 text-slate-300" 
                        : "border-gray-200 bg-gray-100 text-gray-700"
                    }`}
                  />
                </td>
                <td data-label="Available quantity" className={`border ${isDark ? "border-slate-600" : "border-gray-200"}`}>
                  <input
                    readOnly
                    aria-label={`Available quantity for item ${i + 1}`}
                    value={it.available_qty ?? ''}
                    className={`border w-full h-6 text-[11px] px-1 ${
                      isDark 
                        ? "border-slate-600 bg-slate-700 text-slate-300" 
                        : "border-gray-200 bg-gray-100 text-gray-700"
                    }`}
                  />
                </td>
                <td data-label="Actual quantity" className={`border ${isDark ? "border-slate-600" : "border-gray-200"}`}>
                  <input
                    id={`actual-${i}`}
                    ref={el => (actualRefs.current[i] = el)}
                    aria-label={`Actual quantity for item ${i + 1}`}
                    value={it.actual_qty ?? ''}
                    onChange={e=>onItemChange(i,'actual_qty', e.target.value)}
                    onKeyDown={onActualKeyDown(i)}
                    className={`border w-full h-6 text-[11px] px-1 ${
                      isDark 
                        ? "border-slate-600 bg-slate-700 text-slate-200" 
                        : "border-gray-300 bg-white text-gray-800"
                    }`}
                  />
                </td>
                <td data-label="Difference" className={`border ${isDark ? "border-slate-600" : "border-gray-200"}`}>
                  <input
                    readOnly
                    aria-label={`Quantity difference for item ${i + 1}`}
                    value={it.diff_qty ?? ''}
                    className={`border w-full h-6 text-[11px] px-1 ${
                      isDark 
                        ? "border-slate-600 bg-slate-700 text-slate-300" 
                        : "border-gray-200 bg-gray-100 text-gray-700"
                    }`}
                  />
                </td>
                <td data-label="Unit cost" className={`border ${isDark ? "border-slate-600" : "border-gray-200"}`}>
                  <input
                    aria-label={`Unit cost for item ${i + 1}`}
                    value={to2(it.unit_purchase_price ?? '')}
                    readOnly
                    onChange={e=>onItemChange(i,'unit_purchase_price', e.target.value)}
                    onBlur={()=>onUnitCostBlur(i)}
                    className={`border w-full h-6 text-[11px] px-1 ${
                      isDark 
                        ? "border-slate-600 bg-slate-700 text-slate-300" 
                        : "border-gray-300 bg-white text-gray-800"
                    }`}
                  />
                </td>
                <td data-label="Worth adjusted" className={`border ${isDark ? "border-slate-600" : "border-gray-200"}`}>
                  <input
                    readOnly
                    aria-label={`Worth adjusted for item ${i + 1}`}
                    value={to2(it.worth_adjusted)}
                    className={`border w-full h-6 text-[11px] px-1 ${
                      isDark 
                        ? "border-slate-600 bg-slate-700 text-slate-300" 
                        : "border-gray-200 bg-gray-100 text-gray-700"
                    }`}
                  />
                </td>
                <td data-label="Add item" className={`border ${isDark ? "border-slate-600" : "border-gray-200"}`}>
                  <button 
                    type="button" 
                    onClick={()=>{ addRow(); setTimeout(()=>focusProduct(i+1),0); }} 
                    className="products-row-action stock-adjustment-add"
                    aria-label={`Add item after row ${i + 1}`} title="Add item"
                  ><PlusIcon className="w-5 h-5" aria-hidden="true" /></button>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="stock-adjustment-footer">
        <table className="w-full border-collapse text-xs">
          <tbody>
            <tr>
              <td className={`border p-1 w-1/6 ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                <label className={`block text-[10px] ${isDark ? "text-slate-400" : "text-gray-600"}`}>Total Worth Adjusted</label>
                <input 
                  readOnly 
                  aria-label="Total worth adjusted"
                  value={to2(form.total_worth)} 
                  className={`border rounded w-full p-1 h-7 text-xs ${
                    isDark 
                      ? "border-slate-600 bg-slate-700 text-slate-300" 
                      : "border-gray-300 bg-gray-100 text-gray-700"
                  }`} 
                />
              </td>
              <td className={`border p-1 text-right align-middle ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="products-action products-action-primary theme-btn-primary"
                  title="Save (Ctrl+S)"
                >
                  <span>{adjustmentId ? 'Update Adjustment' : 'Create Adjustment'}</span>
                  <span className="ml-2 hidden sm:inline text-[10px] opacity-80 border rounded-sm px-1 py-0.5">Ctrl+S</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </form>
  );
}

