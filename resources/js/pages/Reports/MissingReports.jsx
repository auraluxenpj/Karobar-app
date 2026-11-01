import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import {
  ArrowDownOnSquareIcon,
  ArrowPathIcon,
  DocumentChartBarIcon,
  PhoneIcon,
  ExclamationCircleIcon,
  PrinterIcon,
  ShareIcon,
} from "@heroicons/react/24/solid";
import { usePermissions } from "@/api/usePermissions";
import SupplierSearch from "@/components/SupplierSearch.jsx";
import ShareDocumentModal from "@/components/ShareDocumentModal.jsx";

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;
const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const money = (value) => number(value).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const REPORTS = {
  "purchase-returns": {
    title: "Purchase Returns Report",
    endpoint: "/api/reports/purchase-returns",
    permission: "report.purchase-returns.view",
    exportPermission: "report.purchase-returns.export",
    dated: true,
    summary: [
      ["return_count", "Returns"],
      ["item_count", "Item lines"],
      ["quantity", "Units returned"],
      ["total", "Return value", true],
    ],
    columns: [
      ["posted_number", "Return #"],
      ["date", "Date"],
      ["supplier_name", "Supplier"],
      ["invoice_number", "Purchase invoice"],
      ["item_count", "Lines"],
      ["quantity", "Units"],
      ["total", "Return total", true],
    ],
  },
  "sale-returns": {
    title: "Sale Returns Report",
    endpoint: "/api/reports/sale-returns",
    permission: "report.sale-returns.view",
    exportPermission: "report.sale-returns.export",
    dated: true,
    summary: [
      ["return_count", "Returns"],
      ["item_count", "Item lines"],
      ["quantity", "Units returned"],
      ["total", "Return value", true],
    ],
    columns: [
      ["posted_number", "Return #"],
      ["date", "Date"],
      ["customer_name", "Customer"],
      ["invoice_number", "Sale invoice"],
      ["item_count", "Lines"],
      ["quantity", "Units"],
      ["total", "Return total", true],
    ],
  },
  "purchase-summary": {
    title: "Purchase Summary Report",
    endpoint: "/api/reports/purchase-summary",
    permission: "report.purchase-summary.view",
    exportPermission: "report.purchase-summary.export",
    dated: true,
    summary: [
      ["invoice_count", "Invoices"],
      ["item_count", "Item lines"],
      ["quantity", "Units purchased"],
      ["items_value", "Item purchase value", true],
      ["invoice_total", "Invoice total", true],
      ["total_paid", "Paid", true],
    ],
    columns: [
      ["posted_number", "Posted #"],
      ["date", "Date"],
      ["invoice_number", "Invoice #"],
      ["supplier_name", "Supplier"],
      ["item_count", "Lines"],
      ["quantity", "Quantity"],
      ["items_value", "Item value", true],
      ["invoice_total", "Invoice total", true],
      ["total_paid", "Paid", true],
    ],
  },
  "outstanding-aging": {
    title: "Outstanding Aging Report",
    endpoint: "/api/reports/outstanding-aging",
    permission: "report.outstanding-aging.view",
    exportPermission: "report.outstanding-aging.export",
    dated: false,
  },
  reorder: {
    title: "Low Stock & Reorder Report",
    endpoint: "/api/reports/reorder",
    permission: "report.reorder.view",
    exportPermission: "report.reorder.export",
    dated: false,
  },
};

function downloadCsv(filename, headers, rows) {
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const content = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function MissingReports({ type }) {
  const report = REPORTS[type];
  const { loading: permissionsLoading, has } = usePermissions();
  const permitted = report?.permission ? has(report.permission) : false;
  const canExport = report?.exportPermission ? has(report.exportPermission) : permitted;
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [asOf, setAsOf] = useState(today());
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [partyType, setPartyType] = useState("customers");
  const [supplier, setSupplier] = useState(null);
  const [supplierSearchOpen, setSupplierSearchOpen] = useState(false);

  // New Credit & Aging controls
  const [agingBy, setAgingBy] = useState("due_date"); // "due_date" or "invoice_date"
  const [agingTab, setAgingTab] = useState("aging"); // "aging" or "work_queue"
  const [workQueuePayload, setWorkQueuePayload] = useState(null);
  const [workQueueSearch, setWorkQueueSearch] = useState("");
  const [workQueueMinOverdue, setWorkQueueMinOverdue] = useState("");
  const [shareParty, setShareParty] = useState(null); // { type: 'customers'|'suppliers', id: number }

  useEffect(() => {
    setPayload(null);
    setWorkQueuePayload(null);
  }, [type]);

  const selectedPartyType = partyType;
  const rows = useMemo(() => {
    if (type === "outstanding-aging") {
      if (agingTab === "work_queue") {
        return workQueuePayload?.parties || [];
      }
      return payload?.[selectedPartyType] || [];
    }
    return payload?.rows || [];
  }, [payload, workQueuePayload, selectedPartyType, type, agingTab]);

  // Compute work queue summary KPIs (must be before any early return to follow Rules of Hooks)
  const workQueueKPIs = useMemo(() => {
    if (type !== "outstanding-aging" || agingTab !== "work_queue") return {};
    const parties = workQueuePayload?.parties || [];
    const critical = parties.filter((p) => (p.max_days_overdue || 0) > 60).length;
    const maxDays = parties.reduce((m, p) => Math.max(m, p.max_days_overdue || 0), 0);
    return {
      total_overdue_sum: workQueuePayload?.total_overdue_sum || 0,
      total_parties: workQueuePayload?.total_parties || parties.length,
      critical_count: critical,
      max_overdue_days: maxDays,
    };
  }, [type, agingTab, workQueuePayload]);

  if (!report) return <div className="report-page"><section className="products-panel"><p className="report-state">Unknown report.</p></section></div>;

  const loadReport = async () => {
    if (!permitted) return toast.error("You don't have permission to view this report.");
    if (report.dated && (!from || !to || from > to)) return toast.error("Choose a valid date range.");
    if (type === "reorder" && !supplier?.id) return toast.error("Select a supplier to run the reorder report.");
    setLoading(true);
    try {
      if (type === "outstanding-aging" && agingTab === "work_queue") {
        const { data } = await axios.get("/api/reports/overdue-work-queue", {
          params: {
            as_of: asOf,
            party_type: selectedPartyType,
            min_overdue: workQueueMinOverdue || 0,
            q: workQueueSearch || undefined,
          },
        });
        setWorkQueuePayload(data);
        if (!data?.parties?.length) {
          toast("No overdue balances found matching criteria.", { icon: "ℹ️" });
        }
      } else {
        const { data } = await axios.get(report.endpoint, {
          params: report.dated
            ? { from, to }
            : type === "outstanding-aging"
              ? { as_of: asOf, aging_by: agingBy }
              : type === "reorder"
                ? { supplier_id: supplier.id }
                : undefined,
        });
        setPayload(data);
        if (!(data?.rows?.length || data?.customers?.length || data?.suppliers?.length)) {
          toast("No data found for the selected report.", { icon: "ℹ️" });
        }
      }
    } catch (error) {
      console.error(error);
      toast.error(`Failed to load ${report.title}.`);
      if (agingTab === "work_queue") setWorkQueuePayload(null);
      else setPayload(null);
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    if (!rows.length) return;
    if (type === "outstanding-aging") {
      if (agingTab === "work_queue") {
        downloadCsv(
          "overdue-work-queue.csv",
          [
            "Party type",
            "Party",
            "Phone",
            "Credit limit",
            "Credit days",
            "Status",
            "Total overdue",
            "Max days overdue",
            "Reference",
            "Entry type",
            "Invoice date",
            "Due date",
            "Invoice amount",
            "Paid on invoice",
            "Outstanding",
            "Days overdue",
          ],
          rows.flatMap((party) =>
            (party.overdue_entries || []).map((entry) => [
              selectedPartyType === "customers" ? "Customer" : "Supplier",
              party.party_name,
              party.party_phone || "",
              party.credit_limit ?? "",
              party.credit_days ?? "",
              party.credit_status || "active",
              party.total_overdue,
              party.max_days_overdue ?? 0,
              entry.reference,
              entry.entry_type,
              entry.date,
              entry.due_date,
              entry.invoice_amount,
              entry.paid_on_invoice,
              entry.outstanding,
              entry.days_overdue ?? 0,
            ])
          )
        );
        return;
      }

      downloadCsv(
        "outstanding-aging.csv",
        [
          "Party type",
          "Party",
          "Phone",
          "Credit limit",
          "Credit days",
          "Status",
          "Total outstanding",
          "Total overdue",
          "Reference",
          "Entry type",
          "Invoice date",
          "Due date",
          "Invoice amount",
          "Paid on invoice",
          "Payments allocated",
          "Outstanding",
          "Age (days)",
          "Days overdue",
          "Aging bucket",
        ],
        rows.flatMap((party) =>
          party.entries.map((entry) => [
            selectedPartyType === "customers" ? "Customer" : "Supplier",
            party.party_name,
            party.party_phone || "",
            party.credit_limit ?? "",
            party.credit_days ?? "",
            party.credit_status || "active",
            party.total,
            party.total_overdue ?? 0,
            entry.reference,
            entry.entry_type,
            entry.date,
            entry.due_date,
            entry.invoice_amount,
            entry.paid_on_invoice,
            entry.payments_applied,
            entry.outstanding,
            entry.age_days,
            entry.days_overdue ?? 0,
            (entry.aging_bucket || "").replaceAll("_", "-"),
          ])
        )
      );
      return;
    }
    if (type === "reorder") {
      const fields = ["product_code", "name", "category_name", "brand_name", "supplier_name", "quantity", "pack_size", "suggested_reorder_quantity", "unit_purchase_price", "estimated_reorder_value"];
      downloadCsv("low-stock-reorder.csv", ["Code", "Product", "Category", "Brand", "Supplier", "On hand", "Pack size", "Suggested reorder", "Unit cost", "Estimated value"],
        rows.map((row) => fields.map((field) => row[field])));
      return;
    }
    const getValue = (row, field) => {
      if (field === "item_count") return row.item_count ?? row.items?.length ?? 0;
      if (field === "quantity") return row.quantity ?? row.items?.reduce(
        (sum, item) => sum + number(item.quantity ?? item.return_unit_quantity),
        0
      ) ?? 0;
      return row[field] ?? "";
    };
    downloadCsv(`${type}.csv`, report.columns.map(([, label]) => label),
      rows.map((row) => report.columns.map(([field]) => getValue(row, field))));
  };

  const [exportingPdf, setExportingPdf] = useState(false);

  const exportPdf = async () => {
    if (!rows.length) return;
    if (type === "reorder" && !supplier?.id) {
      return toast.error("Select a supplier first.");
    }
    setExportingPdf(true);
    try {
      const pdfEndpoint =
        type === "outstanding-aging" && agingTab === "work_queue"
          ? "/api/reports/overdue-work-queue/pdf"
          : `${report.endpoint}/pdf`;
      const params =
        type === "outstanding-aging" && agingTab === "work_queue"
          ? {
              as_of: asOf,
              party_type: selectedPartyType,
              min_overdue: workQueueMinOverdue || 0,
              q: workQueueSearch || undefined,
              download: 1,
            }
          : report.dated
            ? { from, to, download: 1 }
            : type === "outstanding-aging"
              ? { as_of: asOf, aging_by: agingBy, download: 1 }
              : type === "reorder"
                ? { supplier_id: supplier.id, download: 1 }
                : { download: 1 };

      const res = await axios.get(pdfEndpoint, {
        params,
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type === "outstanding-aging" && agingTab === "work_queue" ? "overdue-work-queue" : type}-report.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("PDF report downloaded");
    } catch (err) {
      toast.error("Failed to generate PDF report");
    } finally {
      setExportingPdf(false);
    }
  };

  if (permissionsLoading) {
    return <div className="report-page"><section className="products-panel"><p className="report-state">Checking permissions…</p></section></div>;
  }
  if (!permitted) {
    return <div className="report-page"><section className="products-panel"><p className="report-state">You don't have permission to view this report.</p></section></div>;
  }

  const summary = payload?.summary || {};
  const selectedAgingSummary = summary[selectedPartyType] || {};
  const summaryCards = report.summary || (type === "outstanding-aging"
    ? agingTab === "work_queue"
      ? [
          ["total_overdue_sum", "Total Overdue Debt", true],
          ["total_parties", selectedPartyType === "customers" ? "Overdue Debtors" : "Overdue Creditors"],
          ["critical_count", "Critical (>60d) Accounts"],
          ["max_overdue_days", "Oldest Overdue (days)"],
        ]
      : agingBy === "due_date"
      ? [
          ["total", "Total Outstanding", true],
          ["total_overdue", "Total Overdue", true],
          ["current", "Current (Not Due)", true],
          ["over_90", "Over 90 Days Overdue", true],
        ]
      : [
          ["total", "Total Outstanding", true],
          ["party_count", selectedPartyType === "customers" ? "Customers with balance" : "Suppliers with balance"],
          ["open_entry_count", "Open invoices / entries"],
          ["over_90", "Over 90 Days", true],
        ]
    : type === "reorder"
      ? [
          ["product_count", "Products below threshold"],
          ["total_quantity", "Units on hand"],
          ["suggested_quantity", "Suggested reorder units"],
          ["estimated_reorder_value", "Estimated reorder value", true],
        ]
      : []);

  return (
    <div id="missing-report-printable" className="report-page">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #missing-report-printable, #missing-report-printable * { visibility: visible; }
          #missing-report-printable { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 12px; background: #fff !important; color: #000 !important; }
          .no-print, .products-filter-panel { display: none !important; }
        }
      `}</style>
      <section className="products-panel">
        <div className="products-heading">
          <div className="flex items-center gap-3 min-w-0">
            <div className="products-identity-icon"><DocumentChartBarIcon className="w-6 h-6" /></div>
            <div className="min-w-0">
              <h1 className="products-title">
                {type === "outstanding-aging" && agingTab === "work_queue"
                  ? "Overdue Collections Work Queue"
                  : report.title}
              </h1>
              <p className="products-subtitle">
                {type === "reorder" && supplier
                  ? `${supplier.name} · ${rows.length} products`
                  : type === "outstanding-aging" && agingTab === "work_queue"
                  ? `${rows.length} overdue accounts · prioritized by highest debt`
                  : `${rows.length} records · live database results`}
              </p>
            </div>
          </div>

          {type === "outstanding-aging" && (
            <div className="flex items-center gap-1 p-1 rounded-lg bg-gray-100 dark:bg-slate-700/60 border border-gray-200 dark:border-slate-600">
              <button
                type="button"
                onClick={() => { setAgingTab("aging"); setPayload(null); }}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  agingTab === "aging"
                    ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-300 shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
                }`}
              >
                Aging Matrix
              </button>
              <button
                type="button"
                onClick={() => { setAgingTab("work_queue"); setWorkQueuePayload(null); }}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                  agingTab === "work_queue"
                    ? "bg-white dark:bg-slate-800 text-red-600 dark:text-red-300 shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
                }`}
              >
                <ExclamationCircleIcon className="w-3.5 h-3.5 text-red-500" />
                Collections Work Queue
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 no-print">
            {canExport && (
              <>
                <button type="button" onClick={exportCsv} disabled={!rows.length} className="products-action theme-btn-secondary">
                  <ArrowDownOnSquareIcon className="w-4 h-4" /> Export CSV
                </button>
                <button type="button" onClick={exportPdf} disabled={!rows.length || exportingPdf} className="products-action theme-btn-secondary">
                  <ArrowDownOnSquareIcon className={`w-4 h-4 ${exportingPdf ? "animate-bounce" : ""}`} />
                  {exportingPdf ? "Building PDF…" : "Export PDF"}
                </button>
                <button type="button" onClick={() => window.print()} disabled={!rows.length} className="products-action theme-btn-secondary">
                  <PrinterIcon className="w-4 h-4" /> Print
                </button>
              </>
            )}
            <button type="button" onClick={() => { setPayload(null); setWorkQueuePayload(null); setAsOf(today()); setSupplier(null); }} className="products-action theme-btn-tertiary">
              Reset
            </button>
            <button type="button" onClick={loadReport} disabled={loading || (type === "reorder" && !supplier)} className="products-action products-action-primary theme-btn-primary">
              <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Load Report"}
            </button>
          </div>
        </div>
        <div className="products-filter-panel">
          <div className="report-filters">
            {report.dated && <>
              <label className="products-filter">
                <span className="products-filter-label">From Date</span>
                <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="report-input" />
              </label>
              <label className="products-filter">
                <span className="products-filter-label">To Date</span>
                <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="report-input" />
              </label>
            </>}
            {type === "outstanding-aging" && (
              <label className="products-filter">
                <span className="products-filter-label">As of Date</span>
                <input type="date" value={asOf} max={today()} onChange={(event) => setAsOf(event.target.value)} className="report-input" />
              </label>
            )}
            {type === "outstanding-aging" && (
              <label className="products-filter">
                <span className="products-filter-label">Party Type</span>
                <select value={selectedPartyType} onChange={(event) => setPartyType(event.target.value)} className="report-input">
                  {has("customer-ledger.view") && <option value="customers">Customers</option>}
                  {has("supplier-ledger.view") && <option value="suppliers">Suppliers</option>}
                </select>
              </label>
            )}
            {type === "outstanding-aging" && agingTab === "aging" && (
              <label className="products-filter">
                <span className="products-filter-label">Aging Basis</span>
                <select value={agingBy} onChange={(event) => setAgingBy(event.target.value)} className="report-input">
                  <option value="due_date">Due Date (Terms-Based)</option>
                  <option value="invoice_date">Invoice Date (Calendar Age)</option>
                </select>
              </label>
            )}
            {type === "outstanding-aging" && agingTab === "work_queue" && (
              <>
                <label className="products-filter">
                  <span className="products-filter-label">Min Overdue (Rs.)</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 500"
                    value={workQueueMinOverdue}
                    onChange={(event) => setWorkQueueMinOverdue(event.target.value)}
                    className="report-input"
                  />
                </label>
                <label className="products-filter">
                  <span className="products-filter-label">Search Debtor / Phone</span>
                  <input
                    type="text"
                    placeholder="Search name or phone..."
                    value={workQueueSearch}
                    onChange={(event) => setWorkQueueSearch(event.target.value)}
                    className="report-input"
                  />
                </label>
              </>
            )}
            {type === "reorder" && (
              <>
                <label className="products-filter">
                  <span className="products-filter-label">Supplier (required)</span>
                  <button
                    type="button"
                    onClick={() => setSupplierSearchOpen(true)}
                    className="report-input flex items-center text-left cursor-pointer"
                  >
                    {supplier?.name || "Search and select a supplier…"}
                  </button>
                </label>
                <p className="report-muted self-center">Shows this supplier’s products below one pack in stock.</p>
              </>
            )}
          </div>
        </div>
      </section>

      {summaryCards.length > 0 && (
        <div className="report-kpis report-kpis-4">
          {summaryCards.map(([field, label, isMoney]) => {
            const val =
              type === "outstanding-aging"
                ? agingTab === "work_queue"
                  ? workQueueKPIs[field]
                  : selectedAgingSummary[field]
                : summary[field];
            return (
              <article key={field} className="report-kpi">
                <span className="report-kpi-head">{label}</span>
                <strong className="report-kpi-value">
                  {isMoney ? money(val) : number(val).toLocaleString()}
                </strong>
              </article>
            );
          })}
        </div>
      )}
      {type === "outstanding-aging" && agingTab === "aging" && payload?.summary && (
        <p className="report-muted px-2">
          {agingBy === "due_date"
            ? `Balances are aged by Due Date (Invoice Date + Party Credit Terms) as of ${payload.as_of}. 'Current' represents invoices not yet due.`
            : `Balances are aged by Entry Date as of ${payload.as_of}. FIFO payments apply to oldest open invoices.`}
        </p>
      )}
      {type === "outstanding-aging" && agingTab === "work_queue" && (
        <p className="report-muted px-2">
          Showing accounts ranked by highest overdue debt past agreed credit terms. Click phone number to call or message directly via WhatsApp.
        </p>
      )}

      <section className="products-panel products-catalog">
        <div className="products-catalog-heading">
          <div>
            <h2 className="products-section-title">
              {type === "outstanding-aging" && agingTab === "work_queue"
                ? "Collections Work Queue"
                : `${report.title} Details`}
            </h2>
            <p className="products-subtitle">{loading ? "Loading live data…" : type === "reorder" && supplier ? `Supplier: ${supplier.name} · ${rows.length} products` : `${rows.length} records`}</p>
          </div>
        </div>
        <div className="report-table-scroll" tabIndex={0} role="region" aria-label={`${report.title} data`} aria-busy={loading}>
          {type === "outstanding-aging" ? (
            agingTab === "work_queue" ? (
              <table className="report-table report-table-medium">
                <thead>
                  <tr>
                    <th>{selectedPartyType === "customers" ? "Customer" : "Supplier"}</th>
                    <th>Contact</th>
                    <th className="report-num">Credit Limit</th>
                    <th>Terms</th>
                    <th>Status</th>
                    <th className="report-num">Overdue Days</th>
                    <th className="report-num">Total Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? (
                    rows.map((row) => {
                      const phoneClean = (row.party_phone || "").replace(/[^0-9]/g, "");
                      return (
                        <tr key={row.party_id} className={row.is_limit_exceeded ? "bg-red-50/50 dark:bg-red-950/20" : ""}>
                          <td>
                            <details>
                              <summary className="cursor-pointer font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                                {row.party_name}
                                {row.is_limit_exceeded && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-normal">Limit Exceeded</span>
                                )}
                              </summary>
                              <div className="mt-2 max-w-[calc(100vw-4rem)] sm:max-w-none overflow-x-auto p-2 bg-gray-50 dark:bg-slate-800 rounded border border-gray-200 dark:border-slate-700">
                                <h4 className="text-xs font-semibold mb-1 text-gray-700 dark:text-gray-300">Overdue Unpaid Invoices:</h4>
                                <table className="report-table">
                                  <thead>
                                    <tr>
                                      <th>Reference</th>
                                      <th>Type</th>
                                      <th>Invoice Date</th>
                                      <th>Due Date</th>
                                      <th className="report-num">Invoice Amount</th>
                                      <th className="report-num">Paid</th>
                                      <th className="report-num">Overdue Balance</th>
                                      <th className="report-num">Days Overdue</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(row.overdue_entries || []).map((entry) => (
                                      <tr key={entry.ledger_id}>
                                        <td className="font-mono text-xs">{entry.reference}</td>
                                        <td>{entry.entry_type === "manual" ? "Manual" : "Invoice"}</td>
                                        <td>{entry.date}</td>
                                        <td className="font-medium text-amber-700 dark:text-amber-400">{entry.due_date}</td>
                                        <td className="report-num">{money(entry.invoice_amount)}</td>
                                        <td className="report-num">{money(entry.paid_on_invoice)}</td>
                                        <td className="report-num font-bold text-red-600 dark:text-red-400">{money(entry.outstanding)}</td>
                                        <td className="report-num font-semibold text-red-600 dark:text-red-400">
                                          {entry.days_overdue} days
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </details>
                          </td>
                          <td>
                            <div className="flex items-center gap-2 flex-wrap">
                              {row.party_phone ? (
                                <>
                                  <a
                                    href={`tel:${row.party_phone}`}
                                    className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                                    title="Click to call"
                                  >
                                    <PhoneIcon className="w-3.5 h-3.5" />
                                    {row.party_phone}
                                  </a>
                                  {phoneClean && (
                                    <a
                                      href={`https://wa.me/${phoneClean.startsWith("0") ? "92" + phoneClean.slice(1) : phoneClean}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-semibold hover:bg-emerald-200"
                                      title="Chat on WhatsApp"
                                    >
                                      WhatsApp
                                    </a>
                                  )}
                                </>
                              ) : (
                                <span className="text-gray-400 text-xs">—</span>
                              )}
                              <button
                                type="button"
                                onClick={() => setShareParty({ type: selectedPartyType, id: row.party_id })}
                                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 font-semibold hover:bg-blue-200 cursor-pointer"
                                title="Share Official Ledger Statement PDF via WhatsApp / Email"
                              >
                                <ShareIcon className="w-3 h-3" />
                                Share Statement PDF
                              </button>
                            </div>
                          </td>
                          <td className="report-num">
                            {Number(row.credit_limit) > 0 ? `Rs. ${money(row.credit_limit)}` : "Unlimited"}
                          </td>
                          <td>{row.credit_days ? `${row.credit_days}d` : "Immediate"}</td>
                          <td>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                row.credit_status === "blocked"
                                  ? "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300"
                                  : row.credit_status === "on_hold"
                                  ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/60 dark:text-yellow-300"
                                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300"
                              }`}
                            >
                              {row.credit_status || "active"}
                            </span>
                          </td>
                          <td className="report-num">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                              row.max_days_overdue > 60
                                ? "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300"
                                : row.max_days_overdue > 30
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300"
                                : "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300"
                            }`}>
                              {row.max_days_overdue || 0} days
                            </span>
                          </td>
                          <td className="report-num font-extrabold text-red-600 dark:text-red-400 text-sm">
                            {money(row.total_overdue)}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="report-muted text-center py-6">
                        {loading ? "Loading work queue…" : "No overdue accounts found."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="report-table report-table-medium">
                <thead>
                  <tr>
                    <th>{selectedPartyType === "customers" ? "Customer" : "Supplier"}</th>
                    <th className="report-num">Limit</th>
                    <th>Terms</th>
                    <th>Status</th>
                    <th className="report-num">Open</th>
                    {agingBy === "due_date" ? (
                      <>
                        <th className="report-num text-emerald-600 dark:text-emerald-400">Current</th>
                        <th className="report-num">1–30 days</th>
                        <th className="report-num">31–60 days</th>
                        <th className="report-num">61–90 days</th>
                        <th className="report-num">Over 90d</th>
                        <th className="report-num font-bold">Total</th>
                        <th className="report-num font-bold text-red-600 dark:text-red-400">Overdue</th>
                      </>
                    ) : (
                      <>
                        <th className="report-num">0–30 days</th>
                        <th className="report-num">31–60 days</th>
                        <th className="report-num">61–90 days</th>
                        <th className="report-num">Over 90d</th>
                        <th className="report-num font-bold">Total</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? (
                    rows.map((row) => (
                      <tr key={row.party_id} className={row.is_limit_exceeded ? "bg-red-50/40 dark:bg-red-950/20" : ""}>
                        <td>
                          <details>
                            <summary className="cursor-pointer font-medium flex items-center gap-1.5">
                              {row.party_name}
                              {row.is_limit_exceeded && (
                                <span className="text-[10px] px-1 py-0.2 rounded bg-red-100 text-red-700 font-normal">Limit Exceeded</span>
                              )}
                            </summary>
                            <div className="mt-2 max-w-[calc(100vw-4rem)] sm:max-w-none overflow-x-auto p-2 bg-gray-50 dark:bg-slate-800 rounded border border-gray-200 dark:border-slate-700">
                              <table className="report-table">
                                <thead>
                                  <tr>
                                    <th>Reference</th>
                                    <th>Type</th>
                                    <th>Date</th>
                                    <th>Due Date</th>
                                    <th className="report-num">Original</th>
                                    <th className="report-num">Paid</th>
                                    <th className="report-num">Allocated</th>
                                    <th className="report-num">Outstanding</th>
                                    <th className="report-num">Age</th>
                                    <th className="report-num">Overdue</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {row.entries.map((entry) => (
                                    <tr key={entry.ledger_id}>
                                      <td>{entry.reference}</td>
                                      <td>{entry.entry_type === "manual" ? "Manual" : "Invoice"}</td>
                                      <td>{entry.date}</td>
                                      <td className={entry.is_overdue ? "text-red-600 font-medium" : "text-gray-600"}>{entry.due_date}</td>
                                      <td className="report-num">{money(entry.invoice_amount)}</td>
                                      <td className="report-num">{money(entry.paid_on_invoice)}</td>
                                      <td className="report-num">{money(entry.payments_applied)}</td>
                                      <td className="report-num report-strong">{money(entry.outstanding)}</td>
                                      <td className="report-num">{entry.age_days}d</td>
                                      <td className={`report-num ${entry.is_overdue ? "font-bold text-red-600" : "text-emerald-600"}`}>
                                        {entry.is_overdue ? `${entry.days_overdue}d` : "Not due"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        </td>
                        <td className="report-num text-xs font-mono">
                          {Number(row.credit_limit) > 0 ? `Rs. ${money(row.credit_limit)}` : "—"}
                        </td>
                        <td className="text-xs">{row.credit_days ? `${row.credit_days}d` : "Immediate"}</td>
                        <td>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              row.credit_status === "blocked"
                                ? "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300"
                                : row.credit_status === "on_hold"
                                ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/60 dark:text-yellow-300"
                                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300"
                            }`}
                          >
                            {row.credit_status || "active"}
                          </span>
                        </td>
                        <td className="report-num">{number(row.open_entry_count).toLocaleString()}</td>
                        {agingBy === "due_date" ? (
                          <>
                            <td className="report-num text-emerald-600 dark:text-emerald-400 font-medium">{money(row.current)}</td>
                            <td className="report-num">{money(row.days_1_30)}</td>
                            <td className="report-num">{money(row.days_31_60)}</td>
                            <td className="report-num">{money(row.days_61_90)}</td>
                            <td className="report-num">{money(row.over_90)}</td>
                            <td className="report-num report-strong">{money(row.total)}</td>
                            <td className="report-num font-bold text-red-600 dark:text-red-400">{money(row.total_overdue)}</td>
                          </>
                        ) : (
                          <>
                            <td className="report-num">{money(row.days_0_30)}</td>
                            <td className="report-num">{money(row.days_31_60)}</td>
                            <td className="report-num">{money(row.days_61_90)}</td>
                            <td className="report-num">{money(row.over_90)}</td>
                            <td className="report-num report-strong">{money(row.total)}</td>
                          </>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={agingBy === "due_date" ? 12 : 10} className="report-muted text-center py-6">
                        Load the report to view data.
                      </td>
                    </tr>
                  )}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr className="report-total-row">
                      <td>Totals</td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td className="report-num">{number(selectedAgingSummary.open_entry_count).toLocaleString()}</td>
                      {agingBy === "due_date" ? (
                        <>
                          <td className="report-num text-emerald-600 dark:text-emerald-400 font-bold">{money(selectedAgingSummary.current)}</td>
                          <td className="report-num">{money(selectedAgingSummary.days_1_30)}</td>
                          <td className="report-num">{money(selectedAgingSummary.days_31_60)}</td>
                          <td className="report-num">{money(selectedAgingSummary.days_61_90)}</td>
                          <td className="report-num">{money(selectedAgingSummary.over_90)}</td>
                          <td className="report-num report-strong">{money(selectedAgingSummary.total)}</td>
                          <td className="report-num font-bold text-red-600 dark:text-red-400">{money(selectedAgingSummary.total_overdue)}</td>
                        </>
                      ) : (
                        <>
                          <td className="report-num">{money(selectedAgingSummary.days_0_30)}</td>
                          <td className="report-num">{money(selectedAgingSummary.days_31_60)}</td>
                          <td className="report-num">{money(selectedAgingSummary.days_61_90)}</td>
                          <td className="report-num">{money(selectedAgingSummary.over_90)}</td>
                          <td className="report-num report-strong">{money(selectedAgingSummary.total)}</td>
                        </>
                      )}
                    </tr>
                  </tfoot>
                )}
              </table>
            )
          ) : type === "reorder" ? (
            <table className="report-table report-table-medium">
              <thead><tr><th>Product</th><th>Category</th><th>Brand</th><th className="report-num">On hand</th><th className="report-num">Pack size</th><th className="report-num">Suggested reorder</th><th className="report-num">Unit cost</th><th className="report-num">Estimated value</th></tr></thead>
              <tbody>{rows.length ? rows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><span className="block text-xs opacity-70">{row.product_code}</span></td><td>{row.category_name || "—"}</td><td>{row.brand_name || "—"}</td><td className="report-num">{number(row.quantity).toLocaleString()}</td><td className="report-num">{number(row.pack_size).toLocaleString()}</td><td className="report-num report-strong">{number(row.suggested_reorder_quantity).toLocaleString()}</td><td className="report-num">{money(row.unit_purchase_price)}</td><td className="report-num">{money(row.estimated_reorder_value)}</td></tr>) : <tr><td colSpan={8} className="report-muted">{supplier ? "No products for this supplier are currently below the reorder threshold." : "Select a supplier, then load the report."}</td></tr>}</tbody>
            </table>
          ) : (
            <table className="report-table report-table-medium">
              <thead><tr>{report.columns.map(([, label]) => <th key={label}>{label}</th>)}<th>Items</th></tr></thead>
              <tbody>{rows.length ? rows.map((row) => (
                <tr key={row.id}>
                  {report.columns.map(([field, , isMoney]) => <td key={field} className={isMoney ? "report-num" : ""}>{isMoney ? money(row[field]) : field === "item_count" ? row.item_count ?? row.items?.length ?? 0 : field === "quantity" ? row.quantity ?? row.items?.reduce((sum, item) => sum + number(item.quantity ?? item.return_unit_quantity), 0) ?? 0 : row[field] || "—"}</td>)}
                  <td><details><summary className="cursor-pointer">View items ({row.items?.length || 0})</summary>
                    <div className="mt-2 max-w-[calc(100vw-4rem)] sm:max-w-none overflow-x-auto">
                      <table className="report-table"><thead><tr><th>Product</th><th>Batch</th><th className="report-num">Qty</th><th className="report-num">Unit price</th><th className="report-num">Line total</th></tr></thead>
                        <tbody>{(row.items || []).map((item) => <tr key={item.id}><td>{item.product_name || "—"}<span className="block text-xs opacity-70">{item.product_code}</span></td><td>{item.batch || "—"}</td><td className="report-num">{number(item.quantity ?? item.return_unit_quantity).toLocaleString()}</td><td className="report-num">{money(item.sale_price ?? item.unit_purchase_price)}</td><td className="report-num">{money(item.sub_total)}</td></tr>)}</tbody>
                      </table>
                    </div>
                  </details></td>
                </tr>
              )) : <tr><td colSpan={report.columns.length + 1} className="report-muted">Load the report to view data.</td></tr>}</tbody>
            </table>
          )}
        </div>
      </section>
      {type === "reorder" && (
        <SupplierSearch
          isOpen={supplierSearchOpen}
          onClose={() => setSupplierSearchOpen(false)}
          onSelect={(selected) => {
            if (!selected?.id) return;
            setSupplier(selected);
            setPayload(null);
            setSupplierSearchOpen(false);
          }}
        />
      )}
      <ShareDocumentModal
        isOpen={Boolean(shareParty?.id)}
        onClose={() => setShareParty(null)}
        documentType={shareParty?.type === "customers" ? "customer_ledger" : "supplier_ledger"}
        queryParams={
          shareParty?.type === "customers"
            ? { customer_id: shareParty?.id }
            : { supplier_id: shareParty?.id }
        }
      />
    </div>
  );
}
