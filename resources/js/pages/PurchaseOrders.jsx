import { useCallback, useEffect, useState, useRef } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/api/usePermissions";
import ProductSearchInput from "../components/ProductSearchInput";
import { ClipboardDocumentListIcon, PlusIcon, TrashIcon, EyeIcon, PencilSquareIcon, ArrowDownTrayIcon, DocumentTextIcon, BuildingStorefrontIcon, MagnifyingGlassIcon, ArrowsUpDownIcon, QrCodeIcon, ShareIcon } from "@heroicons/react/24/outline";
import SupplierSearch from "../components/SupplierSearch";
import ShareDocumentModal from "../components/ShareDocumentModal";

const blank = () => ({ date: new Date().toLocaleDateString('en-CA'), expected_received_date: '', notes: '', reference: '', supplier_id: '', items: [] });
const orderRow = (row) => ({ ...row,
  ordered_packs: Number(row.ordered_quantity || row.pack_size || 1) / Math.max(1, Number(row.pack_size || 1)),
  pack_purchase_price: Number(row.unit_purchase_price || 0) * Math.max(1, Number(row.pack_size || 1)),
  unit_bonus: Number(row.unit_bonus || 0),
  pack_bonus: Number(row.unit_bonus || 0) / Math.max(1, Number(row.pack_size || 1)),
});
const entryFields = ['ordered_packs', 'pack_purchase_price', 'pack_bonus', 'unit_bonus', 'item_discount_percentage'];
const newItem = () => ({ product_id: '', ordered_packs: 1, pack_size: 1, pack_purchase_price: 0, pack_bonus: 0, unit_bonus: 0, item_discount_percentage: 0 });
const detailLabels = ['Product', 'Brand', 'Pack Size', 'Order Packs', 'Received Units', 'Remaining Units', 'Pack Purchase Price', 'Pack Bonus', 'Unit Bonus', 'Discount %', 'Total'];
const itemLabels = { pack_size: 'Pack Size', ordered_packs: 'Order Packs', pack_purchase_price: 'Pack Purchase Price', pack_bonus: 'Pack Bonus', unit_bonus: 'Unit Bonus', item_discount_percentage: 'Discount %' };
const statusLabel = (s) => ({ ordered: 'Ordered', partially_received: 'Partially Received', received: 'Received', cancelled: 'Cancelled' }[s] || s);
const sortOptions = [
  ['newest', 'PO Number (Newest first)'], ['oldest', 'PO Number (Oldest first)'],
  ['date_desc', 'Date (Newest first)'], ['date_asc', 'Date (Oldest first)'],
  ['supplier_asc', 'Supplier (A–Z)'], ['supplier_desc', 'Supplier (Z–A)'],
  ['total_desc', 'Total Amount (High–Low)'], ['total_asc', 'Total Amount (Low–High)'],
  ['units_desc', 'Ordered Units (High–Low)'], ['units_asc', 'Ordered Units (Low–High)'],
  ['items_desc', 'Items (High–Low)'], ['items_asc', 'Items (Low–High)'],
  ['status_asc', 'Status (A–Z)'], ['status_desc', 'Status (Z–A)'],
];
const headerSorts = { 'PO Number': ['newest', 'oldest'], Date: ['date_desc', 'date_asc'], Supplier: ['supplier_asc', 'supplier_desc'], Items: ['items_desc', 'items_asc'], 'Ordered Units': ['units_desc', 'units_asc'], 'Total Amount': ['total_desc', 'total_asc'], Status: ['status_asc', 'status_desc'] };
const errorMessage = (e) => Object.values(e.response?.data?.errors || {}).flat().join(' ') || e.response?.data?.message || 'Unable to complete this action. Please try again.';

export default function PurchaseOrders() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { loading: permissionsLoading, has } = usePermissions();
  const creating = location.pathname.endsWith('/create');
  const editing = location.pathname.endsWith('/edit');
  const [form, setForm] = useState(blank);
  const [order, setOrder] = useState(null);
  const [listing, setListing] = useState(null);
  const [page, setPage] = useState(1);
  const [supplierQuery, setSupplierQuery] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [sort, setSort] = useState('newest');
  const [products, setProducts] = useState([]);
  const [supplier, setSupplier] = useState(null);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [sharingPoId, setSharingPoId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const fieldRefs = useRef({});
  const productRefs = useRef({});
  const itemRowRefs = useRef({});
  const itemsContainerRef = useRef(null);
  const scrollToItem = (index) => {
    const row = itemRowRefs.current[index];
    const container = itemsContainerRef.current;
    if (!row || !container) return;
    if (container.scrollHeight <= container.clientHeight) {
      row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return;
    }
    const bounds = container.getBoundingClientRect();
    const rowBounds = row.getBoundingClientRect();
    const headerHeight = container.querySelector('thead')?.getBoundingClientRect().height || 0;
    const top = bounds.top + headerHeight + 4;
    const bottom = bounds.bottom - 4;
    if (rowBounds.top < top) container.scrollTop += rowBounds.top - top;
    else if (rowBounds.bottom > bottom) container.scrollTop += rowBounds.bottom - bottom;
  };
  const [pendingFocus, setPendingFocus] = useState(null);
  const entryMode = creating || editing;
  useEffect(() => {
    const timer = setTimeout(() => {
      setSupplierFilter(prev => {
        const next = supplierQuery.trim();
        if (prev !== next) setPage(1);
        return next;
      });
    }, supplierQuery.trim() ? 250 : 0);
    return () => clearTimeout(timer);
  }, [supplierQuery]);
  useEffect(() => {
    if (!pendingFocus || loading) return;
    const { index, field } = pendingFocus;
    if (field === 'product') productRefs.current[index]?.focus();
    else {
      const input = fieldRefs.current[`${index}:${field}`];
      input?.focus({ preventScroll: true }); input?.select();
    }
    scrollToItem(index);
    setPendingFocus(null);
  }, [pendingFocus, loading, form.items.length]);
  const addItem = () => {
    if (inFlight.current) return;
    setForm(prev => ({ ...prev, items: [...prev.items, newItem()] }));
    setPendingFocus({ index: form.items.length, field: 'product' });
  };
  const navigateItem = (event, index, field) => {
    if (!['Enter', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    if (event.repeat) { event.preventDefault(); return; }
    event.preventDefault(); event.stopPropagation();
    if (event.key === 'Enter') {
      const nextField = field === 'product' ? entryFields[0] : entryFields[entryFields.indexOf(field) + 1];
      if (nextField) setPendingFocus({ index, field: nextField });
      else if (index < form.items.length - 1) setPendingFocus({ index: index + 1, field: 'product' });
      else addItem();
    } else if (event.key === 'ArrowUp' && index > 0) setPendingFocus({ index: index - 1, field });
    else if (event.key === 'ArrowDown') {
      if (index < form.items.length - 1) setPendingFocus({ index: index + 1, field });
      else addItem();
    }
  };

  useEffect(() => {
    if (permissionsLoading || !has('purchase-order.view')) return;
    let alive = true;
    setLoading(true); setError(''); setOrder(null);
    (async () => {
      try {
        if (creating) {
          setForm({ ...blank(), items: location.state?.items?.length ? location.state.items.map(orderRow) : [newItem()] }); setSupplier(null);
          setProducts((location.state?.items || []).map(item => item.product).filter(Boolean));
        } else if (id) {
          const { data } = await axios.get(`/api/purchase-orders/${id}`);
          if (!alive) return;
          setOrder(data); setForm({ ...data, items: data.items.map(orderRow) }); setSupplier(data.supplier);
          setProducts(data.items.map(i => i.product));
        } else {
          const { data } = await axios.get('/api/purchase-orders', { params: { page, supplier: supplierFilter || undefined, sort } });
          if (alive) setListing(data);
        }
      } catch (e) { if (alive) setError(errorMessage(e)); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [id, creating, editing, page, supplierFilter, sort, permissionsLoading, has]);

  useEffect(() => {
    if (permissionsLoading || !has('purchase-order.generate')) return;
    const onShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        if (!inFlight.current) navigate('/purchase-orders/forecast');
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [permissionsLoading, has, navigate]);

  const deleteOrder = async (po) => {
    if (inFlight.current || !window.confirm(`Delete Purchase Order ${po.number}? This cannot be undone.`)) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      await axios.delete(`/api/purchase-orders/${po.id}`);
      toast.success(`Purchase Order ${po.number} deleted`);
      const nextPage = listing.data.length === 1 && page > 1 ? page - 1 : page;
      if (nextPage !== page) setPage(nextPage);
      else {
        const { data } = await axios.get('/api/purchase-orders', { params: { page, supplier: supplierFilter || undefined, sort } });
        setListing(data);
      }
    } catch (e) { setError(errorMessage(e)); }
    finally { inFlight.current = false; setBusy(false); }
  };

  const refreshProducts = useCallback(async (q = "") => {
    try {
    const { data } = await axios.get('/api/products/search', { params: { q, limit: 30 } });
    setProducts(prev => [...new Map([...prev, ...data].map(p => [p.id, p])).values()]);
    } catch (e) { setError(errorMessage(e)); }
  }, []);
  const changeItem = (index, field, value) => setForm(prev => ({ ...prev, items: prev.items.map((row, i) => {
    if (i !== index) return row;
    const next = { ...row, [field]: value };
    if (field === 'pack_bonus') next.unit_bonus = Number(value || 0) * row.pack_size;
    if (field === 'unit_bonus') next.pack_bonus = Number(value || 0) / row.pack_size;
    return next;
  }) }));
  // Arrange lines in the order last saved on this supplier's Purchase Order based invoice.
  const applySupplierOrder = async (chosen = supplier, { quiet = false } = {}) => {
    if (!chosen?.id) return;
    try {
      const { data } = await axios.get(`/api/purchase-orders/supplier-sort-order/${chosen.id}`);
      const rank = new Map((data?.product_ids || []).map((productId, position) => [String(productId), position]));
      if (!rank.size) { if (!quiet) toast(`No saved product order for ${chosen.name} yet. Save a Purchase Invoice from one of its orders first.`); return; }
      const position = (row, index) => (row.product_id && rank.has(String(row.product_id)) ? rank.get(String(row.product_id)) : rank.size + index);
      setForm(prev => ({ ...prev, items: prev.items.map((row, index) => ({ row, key: position(row, index) })).sort((a, b) => a.key - b.key).map(entry => entry.row) }));
      toast.success(`Products arranged in ${chosen.name}'s saved order`);
    } catch { /* sorting is a convenience; never block order entry */ }
  };
  const save = async (chosen = supplier) => {
    if (inFlight.current) return;
    if (!form.expected_received_date || form.expected_received_date < form.date) {
      setError('Please select an expected receiving date on or after the order date.'); return;
    }
    if (!form.items.length || form.items.some(i => !i.product_id || (!Number.isInteger(Number(i.ordered_packs)) || Number(i.ordered_packs) <= 0))) {
      setError('Add at least one product and enter a positive whole-pack quantity for every item.'); return;
    }
    if (form.items.some(row => !Number.isInteger(Number(row.unit_bonus || 0)) || Number(row.unit_bonus || 0) < 0)) {
      setError('Bonus must equal a nonnegative whole number of units.'); return;
    }
    if (!chosen?.id) { setError('Please select a supplier before saving the Purchase Order.'); return; }
    inFlight.current = true; setBusy(true); setError('');
    try {
      const payload = { ...form, supplier_id: chosen.id, items: form.items.map(row => ({
        product_id: row.product_id, pack_size: row.pack_size, ordered_packs: row.ordered_packs,
        pack_purchase_price: row.pack_purchase_price, unit_bonus: row.unit_bonus,
        item_discount_percentage: row.item_discount_percentage,
      })) };
      const { data } = editing ? await axios.put(`/api/purchase-orders/${id}`, payload) : await axios.post('/api/purchase-orders', payload);
      toast.success(`Purchase Order ${data.number} saved`);
      navigate(`/purchase-orders/${data.id}`);
    } catch (e) { setError(errorMessage(e)); }
    finally { inFlight.current = false; setBusy(false); }
  };
  useEffect(() => {
    if (!entryMode || permissionsLoading || !has(creating ? 'purchase-order.create' : 'purchase-order.update')) return;
    const onSaveShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && (event.key.toLowerCase() === 's' || event.key === 'Enter')) {
        event.preventDefault();
        if (!supplierOpen && !inFlight.current) save();
      }
    };
    window.addEventListener('keydown', onSaveShortcut);
    return () => window.removeEventListener('keydown', onSaveShortcut);
  }, [entryMode, permissionsLoading, has, creating, supplierOpen, form, supplier]);

  const receive = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const { data } = await axios.post(`/api/purchase-orders/${id}/receive`);
      navigate(`/purchase-invoices/create?purchase_order_id=${id}`, { state: { purchaseOrderReceipt: data } });
    } catch (e) { setError(errorMessage(e)); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const cancel = async () => {
    if (inFlight.current || !window.confirm(`Cancel Purchase Order ${order.number}?`)) return;
    inFlight.current = true; setBusy(true);
    try { const { data } = await axios.post(`/api/purchase-orders/${id}/cancel`); setOrder(prev => ({ ...prev, ...data })); }
    catch (e) { setError(errorMessage(e)); }
    finally { inFlight.current = false; setBusy(false); }
  };
  if (permissionsLoading) return <div className="p-6">Loading permissions…</div>;
  if (!has('purchase-order.view') || (creating && !has('purchase-order.create')) || (editing && !has('purchase-order.update'))) return <div className="p-6">You don’t have permission to access this Purchase Order action.</div>;
  const rows = creating || editing ? form.items : order?.items || [];
  const visibleOrders = (listing?.data || []).filter(po => !['received', 'partially_received'].includes(po.status));
  const total = rows.reduce((s, i) => s + (creating || editing ? Number(i.ordered_packs || 0) * Number(i.pack_purchase_price || 0) : Number(i.ordered_quantity || 0) * Number(i.unit_purchase_price || 0)) * (1 - Number(i.item_discount_percentage || 0) / 100), 0);
  return <div className="purchase-entry-page space-y-4 purchase-order-documents">
    <div className={`purchase-entry g-card overflow-hidden space-y-4 ${order && !editing ? "purchase-order-show" : entryMode ? "purchase-order-entry" : ""}`}>
      <div className="purchase-entry-header purchase-entry-banner flex flex-wrap justify-between gap-3 items-center px-5 py-4">
        <div className="flex items-center gap-3"><div className="purchase-entry-icon p-2.5 rounded-xl"><ClipboardDocumentListIcon className="h-6 w-6" /></div><h1 className="purchase-entry-title text-xl font-semibold">{creating ? 'New Purchase Order' : editing ? `Edit ${order?.number || 'Purchase Order'}` : order?.number || 'Purchase Orders'}</h1></div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {has('purchase-order.generate') && <Link className="g-btn-secondary theme-btn-secondary inline-flex items-center justify-center gap-2 disabled:opacity-50" to="/purchase-orders/forecast" title="New Forecast (Ctrl+N)"><span>New Forecast</span> <kbd className="text-[10px] opacity-70">Ctrl+N</kbd></Link>}
          {order && !editing && order.status === 'ordered' && has('purchase-invoice.create') && <button className="g-btn-primary theme-btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-50" disabled={busy} onClick={receive}><ArrowDownTrayIcon className="w-4 h-4" /><span>{busy ? 'Preparing…' : 'Receive Delivery'}</span></button>}
          {entryMode && <button className="purchase-entry-add-product theme-btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg" disabled={busy} onClick={addItem}><PlusIcon className="h-4 w-4" /><span>Add Product</span></button>}
          {(id || creating) && <Link className="g-btn-ghost theme-btn-tertiary inline-flex items-center justify-center gap-2 disabled:opacity-50" to="/purchase-orders">All Orders</Link>}
          {!id && !creating && has('purchase-order.create') && <Link className="g-btn-primary theme-btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-50" to="/purchase-orders/create">New Purchase Order</Link>}
        </div>
      </div>
      {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
      {loading && (id || creating || !listing) ? <p>Loading Purchase Orders…</p> : creating || editing ? <>
        <div className="purchase-entry-details grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 px-3 py-2.5">
          <label>Date<input className="w-full h-8 border rounded-md px-2 text-xs" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
          <label>Expected Receiving Date *<input required className="w-full h-8 border rounded-md px-2 text-xs" type="date" min={form.date} value={form.expected_received_date || ''} onChange={e => setForm({ ...form, expected_received_date: e.target.value })} /></label>
          <label>Reference<input className="w-full h-8 border rounded-md px-2 text-xs" value={form.reference || ''} onChange={e => setForm({ ...form, reference: e.target.value })} /></label>
          <label>Supplier *
            <button type="button" disabled={busy} onClick={() => setSupplierOpen(true)}
              className="w-full h-8 border rounded-md px-2 text-xs text-left flex items-center gap-2 disabled:opacity-70"
              title="Select supplier"
              aria-label={supplier ? `Supplier: ${supplier.name}` : 'Select supplier'}>
              <BuildingStorefrontIcon aria-hidden="true" className="w-4 h-4 shrink-0" />
              <span className="truncate">{supplier?.name || 'Click to search supplier…'}</span>
            </button>
          </label>
          <label>Notes<input className="w-full h-8 border rounded-md px-2 text-xs" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
        </div>
        <p className="text-sm px-5 text-[var(--workspace-muted)]">Enter: next field / new row · ↑↓: move between rows · Ctrl+S: save. Order whole packs; one supplier applies to all brands.</p>
        <div ref={itemsContainerRef} className="purchase-entry-items purchase-order-form-items px-1 py-2"><table className="purchase-order-form-table w-full border-collapse text-[11px]"><colgroup>{[3, 26, 12, 6, 8, 12, 7, 7, 7, 12].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup><thead><tr><th rowSpan={2} aria-label="Remove item" />{['Product', 'Brand', 'Pack Size', 'Order Packs', 'Pack Purchase Price'].map(label => <th rowSpan={2} key={label}>{label}</th>)}<th colSpan={2}>Bonus Quantity</th><th rowSpan={2}>Discount %</th><th rowSpan={2}>Total</th></tr><tr><th>Pack Bonus</th><th>Unit Bonus</th></tr></thead><tbody>
          {rows.map((row, i) => <tr key={i} ref={ref => { itemRowRefs.current[i] = ref; }} onFocusCapture={event => { if (event.currentTarget.contains(event.target)) scrollToItem(i); }}>
            <td data-label="Remove"><button className="products-row-action products-row-delete" title="Remove item" aria-label={`Remove row ${i + 1}`} onClick={() => setForm({ ...form, items: rows.filter((_, n) => i !== n) })}><TrashIcon className="h-4 w-4 text-red-500" /></button></td>
            <td data-label="Product" className="text-left min-w-0" onKeyDownCapture={event => {
              if (event.target.matches('.product-search-trigger input') && (event.key === 'ArrowUp' || event.key === 'ArrowDown' || (event.key === 'Enter' && row.product_id))) navigateItem(event, i, 'product');
            }}><ProductSearchInput ref={ref => { productRefs.current[i] = ref; }} value={row.product_id} products={products} onRefreshProducts={refreshProducts} onChange={product => {
              const value = product.id;
              setForm(prev => ({ ...prev, items: prev.items.map((r, index) => index === i ? { ...r, product_id: value, pack_size: Math.max(1, Number(product?.pack_size || 1)), pack_purchase_price: product?.pack_purchase_price || Number(product?.unit_purchase_price || 0) * Math.max(1, Number(product?.pack_size || 1)), unit_bonus: 0, pack_bonus: 0, product } : r) }));
              setPendingFocus({ index: i, field: 'ordered_packs' });
            }} /></td>
            <td data-label="Brand" className="text-left break-words">{row.product?.brand?.name || row.product?.brand_name || '—'}</td>
            {['pack_size', 'ordered_packs', 'pack_purchase_price', 'pack_bonus', 'unit_bonus', 'item_discount_percentage'].map(field => <td data-label={itemLabels[field]} key={field}><input ref={ref => { fieldRefs.current[`${i}:${field}`] = ref; }} onKeyDown={event => { if (field !== "pack_size") navigateItem(event, i, field); }} aria-label={`${itemLabels[field]} row ${i + 1}`} className="w-full min-w-0 h-7 rounded-md border px-1 text-right text-xs" type="number" readOnly={field === "pack_size"} tabIndex={field === "pack_size" ? -1 : undefined} min={field === "pack_size" || field === "ordered_packs" ? 1 : 0} max={field === "item_discount_percentage" ? 100 : undefined} step={field === "pack_size" || field === "ordered_packs" || field === "unit_bonus" ? 1 : "any"} value={row[field]} onChange={e => changeItem(i, field, e.target.value)} /></td>)}
            <td data-label="Total" className="text-right font-semibold break-words">{(Number(row.ordered_packs || 0) * Number(row.pack_purchase_price || 0) * (1 - Number(row.item_discount_percentage || 0) / 100)).toFixed(2)}</td>
          </tr>)}
        </tbody></table></div>
        <div className="purchase-entry-footer flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div className="flex flex-wrap gap-2"><button className="g-btn-secondary theme-btn-secondary inline-flex items-center justify-center gap-2 disabled:opacity-50" onClick={addItem}><PlusIcon className="h-4 w-4" /><span>Add Product</span></button>{supplier?.id && <button className="g-btn-ghost theme-btn-tertiary inline-flex items-center justify-center gap-2 disabled:opacity-50" disabled={busy} title={`Arrange products in ${supplier.name}'s remembered order`} onClick={() => applySupplierOrder()}>Apply Saved Order</button>}</div><div className="text-right text-xs"><p>{rows.length} items · {rows.reduce((sum, row) => sum + Number(row.ordered_packs || 0), 0)} packs</p><p className="font-semibold text-lg">Total: {total.toFixed(2)}</p></div><button className="g-btn-primary theme-btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-50" disabled={busy} onClick={() => save()}>{busy ? 'Saving Purchase Order…' : 'Save Purchase Order (Ctrl+S)'}</button></div>
        <SupplierSearch title="Select Supplier" isOpen={supplierOpen} onClose={() => setSupplierOpen(false)} onSelect={chosen => { setSupplier(chosen); setSupplierOpen(false); setError(''); applySupplierOrder(chosen, { quiet: true }); }} />
      </> : order ? <>
        <div className="purchase-entry-details grid gap-2 sm:grid-cols-4 px-3 py-2 text-xs"><p>Date: {order.date}</p><p>Expected Receiving: {order.expected_received_date || "Not scheduled"}</p><p>Supplier: {order.supplier?.name}</p><p>Status: {statusLabel(order.status)}</p><p>Reference: {order.reference || '—'}</p></div>
        {order.notes && <p>{order.notes}</p>}
        <div className="purchase-entry-items purchase-order-form-items px-1 py-1"><table className="purchase-order-form-table purchase-order-detail-table w-full border-collapse text-[11px]"><colgroup>{[23, 12, 5, 7, 8, 8, 10, 6, 6, 6, 9].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup><thead><tr>{detailLabels.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id}>{[row.product?.name, row.product?.brand?.name || '—', row.pack_size, row.ordered_quantity / row.pack_size, row.received_quantity, row.remaining_quantity, Number(row.unit_purchase_price * row.pack_size).toFixed(2), Number(row.unit_bonus || 0) / row.pack_size, row.unit_bonus || 0, row.item_discount_percentage, (row.ordered_quantity * row.unit_purchase_price * (1-row.item_discount_percentage/100)).toFixed(2)].map((v, i) => <td data-label={detailLabels[i]} className={i < 2 ? "text-left" : "text-right tabular-nums"} key={i}>{v}</td>)}</tr>)}</tbody></table></div>
        <p className="text-xs font-medium">{rows.length} items · {rows.reduce((s, r) => s + Number(r.ordered_quantity), 0)} ordered units · Total: {total.toFixed(2)}</p>
        <section className="px-3 py-3 space-y-3" aria-label="Purchase order receiving">
          <div className="flex flex-wrap gap-6 text-xs">
            <p><span className="block opacity-70">Deliveries received</span><strong className="text-lg">{order.invoices?.length || 0}</strong></p>
            <p><span className="block opacity-70">Paid units received</span><strong className="text-lg">{rows.reduce((sum, row) => sum + Number(row.received_quantity || 0), 0)}</strong></p>
            <p><span className="block opacity-70">Paid units remaining</span><strong className="text-lg">{rows.reduce((sum, row) => sum + Number(row.remaining_quantity || 0), 0)}</strong></p>
          </div>
          <h3 className="font-semibold text-sm">Receipt History</h3>
          {order.invoices?.length ? <div className="overflow-x-auto"><table className="w-full text-xs text-left"><thead><tr>{['Purchase Invoice', 'Received Date', 'Supplier Invoice', 'Amount', 'Action'].map(label => <th key={label} className="px-3 py-2 border-b">{label}</th>)}</tr></thead><tbody>{order.invoices.map(invoice => <tr key={invoice.id}><td className="px-3 py-2 border-b font-medium">{invoice.posted_number}</td><td className="px-3 py-2 border-b">{invoice.posted_date}</td><td className="px-3 py-2 border-b">{invoice.invoice_number}</td><td className="px-3 py-2 border-b tabular-nums">{Number(invoice.total_amount).toFixed(2)}</td><td className="px-3 py-2 border-b">{has('purchase-invoice.view') && <Link className="underline" to={`/purchase-invoices/${invoice.id}`}>View Invoice</Link>}</td></tr>)}</tbody></table></div> : <p className="text-xs opacity-70">No deliveries received yet. Use Receive Delivery to record the first delivery.</p>}
        </section>
        <div className="purchase-entry-footer flex flex-wrap gap-2 px-3 py-2 print:hidden">
          {order.status === 'ordered' && !order.invoices?.length && <>
            {has('purchase-order.update') && <Link className="g-btn-secondary theme-btn-secondary inline-flex items-center justify-center gap-2" to={`/purchase-orders/${id}/edit`}>Edit</Link>}
            {has('purchase-order.cancel') && <button className="g-btn-ghost theme-btn-danger inline-flex items-center justify-center gap-2" disabled={busy} onClick={cancel}>Cancel Order</button>}
          </>}
          {order.status === 'ordered' && has('purchase-invoice.create') && <button className="g-btn-primary theme-btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-50" disabled={busy} onClick={receive}>{busy ? 'Preparing Purchase Invoice…' : 'Receive Order'}</button>}
          {(has('barcode.view') || has('barcode.print')) && <Link className="g-btn-ghost theme-btn-secondary inline-flex items-center justify-center gap-2 disabled:opacity-50" to={`/barcode-labels?purchase_order_id=${order.id}`} title="Print Barcode Labels for this order"><QrCodeIcon className="w-4 h-4" /><span>Print Barcodes</span></Link>}
          <button type="button" className="g-btn-secondary theme-btn-secondary inline-flex items-center justify-center gap-2 disabled:opacity-50" onClick={() => setSharingPoId(order.id)}><ShareIcon className="w-4 h-4" /><span>Share / Email PDF</span></button>
          <button className="g-btn-ghost theme-btn-tertiary inline-flex items-center justify-center gap-2 disabled:opacity-50" onClick={() => window.print()}>Print Order</button>
        </div>
      </> : listing && <>
        <div className="px-3 flex flex-wrap items-end gap-3 print:hidden">
          <label className="flex-1 min-w-[220px] text-xs font-medium space-y-1">
            <span className="block text-[var(--workspace-muted)]">Supplier</span>
            <div className="relative flex items-center">
              <MagnifyingGlassIcon aria-hidden="true" className="w-4 h-4 absolute left-2.5 pointer-events-none opacity-60" />
              <input type="search" value={supplierQuery} onChange={e => setSupplierQuery(e.target.value)} placeholder="Search by supplier name…" aria-label="Search purchase orders by supplier name" className="w-full h-9 pl-8 pr-3 rounded-lg border border-[var(--workspace-border)] bg-[var(--workspace-reading-fill)] text-xs" />
            </div>
          </label>
          <label className="min-w-[210px] text-xs font-medium space-y-1">
            <span className="inline-flex items-center gap-1 text-[var(--workspace-muted)]"><ArrowsUpDownIcon aria-hidden="true" className="w-3.5 h-3.5" />Sort by</span>
            <select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }} aria-label="Sort purchase orders" className="w-full h-9 px-2.5 rounded-lg border border-[var(--workspace-border)] bg-[var(--workspace-reading-fill)] text-xs">
              {sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <div className="products-panel purchase-invoice-catalog purchase-order-catalog">
          <div className="purchase-invoice-table-scroll" tabIndex={0} role="region" aria-label="Purchase order list" aria-busy={busy || loading}>
            <table className="w-full text-xs"><colgroup>{[10, 9, 16, 5, 8, 10, 6, 11, 25].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
              <thead className="sticky top-0 z-10 shadow-xs"><tr>
                {['PO Number', 'Date', 'Supplier', 'Items', 'Ordered Units', 'Total Amount', 'Receipts', 'Status', 'Actions'].map(h => {
                  const pair = headerSorts[h];
                  const active = pair && pair.includes(sort);
                  const dir = active ? (sort === pair[0] ? '↓' : '↑') : '';
                  const align = h === 'Actions' ? 'text-center' : h === 'Total Amount' ? 'text-right' : 'text-left';
                  return <th className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider ${align}`} key={h} aria-sort={active ? (sort.endsWith('_asc') || sort === 'oldest' ? 'ascending' : 'descending') : undefined}>
                    {pair ? <button type="button" onClick={() => { setSort(sort === pair[0] ? pair[1] : pair[0]); setPage(1); }} className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wider cursor-pointer hover:text-[var(--workspace-accent)] ${h === 'Total Amount' ? 'ml-auto' : ''}`}>{h}{dir && <span aria-hidden="true">{dir}</span>}</button> : h}
                  </th>;
                })}
              </tr></thead>
              <tbody>{visibleOrders.map(po => <tr key={po.id}>
                <td data-label="PO Number" className="px-3 py-2.5 font-semibold">{po.number}</td>
                <td data-label="Date" className="px-3 py-2.5 whitespace-nowrap">{po.date}</td>
                <td data-label="Supplier" className="px-3 py-2.5">{po.supplier?.name}</td>
                <td data-label="Items" className="px-3 py-2.5 tabular-nums">{po.items_count}</td>
                <td data-label="Ordered Units" className="px-3 py-2.5 tabular-nums">{po.items_sum_ordered_quantity}</td>
                <td data-label="Total Amount" className="px-3 py-2.5 text-right tabular-nums font-semibold">{Number(po.total_amount || 0).toFixed(2)}</td>
                <td data-label="Receipts" className="px-3 py-2.5 tabular-nums">{po.invoices?.length || 0}</td>
                <td data-label="Status" className="px-3 py-2.5"><span className="purchase-order-status" data-status={po.status}>{statusLabel(po.status)}</span></td>
                <td data-label="Actions" className="px-3 py-2.5"><div className="purchase-order-index-actions">
                  <Link className="purchase-order-action theme-btn-tertiary" to={`/purchase-orders/${po.id}`} title={`View / Print ${po.number}`} aria-label={`View Purchase Order ${po.number}`}><EyeIcon aria-hidden="true" className="w-4 h-4" /><span>View / Print</span></Link>
                  <button type="button" className="purchase-order-action theme-btn-secondary" onClick={() => setSharingPoId(po.id)} title={`Share ${po.number} via WhatsApp or Email PDF`} aria-label={`Share Purchase Order ${po.number}`}><ShareIcon aria-hidden="true" className="w-4 h-4" /><span>Share / PDF</span></button>
                  {(has('barcode.view') || has('barcode.print')) && <Link className="purchase-order-action theme-btn-tertiary" to={`/barcode-labels?purchase_order_id=${po.id}`} title={`Print Barcodes for ${po.number}`} aria-label={`Print Barcodes for ${po.number}`}><QrCodeIcon aria-hidden="true" className="w-4 h-4" /><span>Barcodes</span></Link>}
                  {po.status === 'ordered' && !po.invoices?.length && <>
                    {has('purchase-order.update') && <Link className="purchase-order-action theme-btn-secondary" to={`/purchase-orders/${po.id}/edit`} title={`Edit ${po.number}`} aria-label={`Edit Purchase Order ${po.number}`}><PencilSquareIcon aria-hidden="true" className="w-4 h-4" /><span>Edit</span></Link>}
                  </>}
                  {po.status === 'ordered' && has('purchase-invoice.create') && <Link className="purchase-order-action purchase-order-action-primary theme-btn-primary" to={`/purchase-invoices/create?purchase_order_id=${po.id}`} title={`Receive ${po.number}`} aria-label={`Receive Purchase Order ${po.number}`}><ArrowDownTrayIcon aria-hidden="true" className="w-4 h-4" /><span>Receive Delivery</span></Link>}
                  {!po.invoices?.length && ['ordered', 'cancelled'].includes(po.status) && has('purchase-order.delete') && <button className="purchase-order-action purchase-order-action-danger theme-btn-danger" disabled={busy} onClick={() => deleteOrder(po)} title={`Delete ${po.number}`} aria-label={`Delete Purchase Order ${po.number}`}><TrashIcon aria-hidden="true" className="w-4 h-4" /><span>Delete</span></button>}
                  {!!po.invoices?.length && has('purchase-invoice.view') && <Link className="purchase-order-action theme-btn-tertiary" to={`/purchase-orders/${po.id}`} title={`View receipts for ${po.number}`} aria-label={`View receipt history for ${po.number}`}><DocumentTextIcon aria-hidden="true" className="w-4 h-4" /><span>Receipts</span></Link>}
                </div></td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>
        {!visibleOrders.length && <p className="px-5 text-sm text-[var(--workspace-muted)]">{supplierFilter ? `No Purchase Orders found for supplier "${supplierFilter}".` : 'No Purchase Orders yet. Create an order or start from a forecast.'}</p>}
        <div className="purchase-entry-footer flex gap-3 items-center px-5 py-4"><button className="g-btn-ghost theme-btn-tertiary inline-flex items-center justify-center gap-2 disabled:opacity-50" disabled={page <= 1} onClick={() => setPage(page-1)}>Previous</button><span>Page {listing.current_page} of {listing.last_page}</span><button className="g-btn-ghost theme-btn-tertiary inline-flex items-center justify-center gap-2 disabled:opacity-50" disabled={page >= listing.last_page} onClick={() => setPage(page+1)}>Next</button></div>
      </>}
    </div>
    <ShareDocumentModal
      isOpen={Boolean(sharingPoId)}
      onClose={() => setSharingPoId(null)}
      documentType="purchase_order"
      documentId={sharingPoId}
    />
    <style>{`@media print { body * { visibility: hidden; } .purchase-order-documents, .purchase-order-documents * { visibility: visible; } .purchase-order-documents { position: absolute; left: 0; top: 0; width: 100%; color: black; background: white; } .purchase-order-documents .print\\:hidden, .purchase-order-documents .print\\:hidden * { display: none; } .purchase-order-documents .g-card { background: white; box-shadow: none; backdrop-filter: none; } }`}</style>
  </div>;
}
