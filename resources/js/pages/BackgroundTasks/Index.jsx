// resources/js/pages/BackgroundTasks/Index.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useTheme } from "@/context/ThemeContext.jsx";

function stripLeadingEmoji(text) {
  if (!text) return "";
  return String(text)
    .replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\s]+/u, "")
    .trim();
}

export const BG_TASK_STORAGE_KEY = "karobar_cube_bg_task_state_v1";
const LANG_STORAGE_KEY = "karobar_guide_bot_lang";

export function loadPersistedBgTask() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BG_TASK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function savePersistedBgTask(state) {
  if (typeof window === "undefined") return;
  try {
    if (!state) {
      window.localStorage.removeItem(BG_TASK_STORAGE_KEY);
    } else {
      const compact = {
        ...state,
        updatedAt: new Date().toISOString(),
        updatedProducts: Array.isArray(state.updatedProducts)
          ? state.updatedProducts.slice(0, 2500)
          : [],
        skippedProducts: Array.isArray(state.skippedProducts)
          ? state.skippedProducts.slice(0, 2500)
          : [],
      };
      window.localStorage.setItem(BG_TASK_STORAGE_KEY, JSON.stringify(compact));
    }
    window.dispatchEvent(
      new CustomEvent("karobar:bg-task-updated", { detail: state })
    );
  } catch {
    /* ignore storage quota */
  }
}

export function exportBgTaskReportCsv(report) {
  if (!report || typeof document === "undefined") return;
  const filled = Array.isArray(report.updatedProducts)
    ? report.updatedProducts
    : [];
  const skipped = Array.isArray(report.skippedProducts)
    ? report.skippedProducts
    : [];

  const escapeCsv = (val) => {
    const str = String(val ?? "").replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = [
    [
      "Status",
      "Product ID",
      "Product Code",
      "Product Name",
      "Formulation (Generic Salt)",
      "Verification Source / Skip Reason",
      "Google Search Query",
    ]
      .map(escapeCsv)
      .join(","),
  ];

  filled.forEach((item) => {
    rows.push(
      [
        "FILLED",
        item.id || "",
        item.product_code || "",
        item.name || "",
        item.formulation || "",
        item.source_en || "Google Search & DRAP Pharmacopoeia Verified",
        item.search_query || "",
      ]
        .map(escapeCsv)
        .join(",")
    );
  });

  skipped.forEach((item) => {
    rows.push(
      [
        "SKIPPED",
        item.id || "",
        item.product_code || "",
        item.name || "",
        "",
        item.reason_en || "No verified formulation found on Google Search — skipped",
        item.search_query || "",
      ]
        .map(escapeCsv)
        .join(",")
    );
  });

  const csvContent = "\uFEFF" + rows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute(
    "download",
    `karobar-autofill-formulation-report-${new Date().toISOString().slice(0, 10)}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Reusable Detailed View for the Background Formulation Auto-Fill Task.
 * Used inside both the Popup Modal (`<dialog closedby="any">`) and the Separate Page (`/background-tasks`).
 */
export function BackgroundTaskDetailView({
  bgTask,
  isUr = false,
  isDark = false,
  isPopup = false,
  onClosePopup = null,
  onOpenSeparatePage = null,
  filterQuery = "",
  onFilterQueryChange = null,
  onPreviewStart = null,
  onDirectStart = null,
  onStopTask = null,
  onClearReport = null,
  previewLoading = false,
  awaitingPermission = false,
  previewData = null,
  onConfirmPermission = null,
  onCancelPermission = null,
  onNavigateProduct = null,
}) {
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'filled' | 'skipped'
  const [searchTerm, setSearchTerm] = useState("");
  const [pageSize, setPageSize] = useState(100);

  const filledList = Array.isArray(bgTask?.updatedProducts)
    ? bgTask.updatedProducts
    : [];
  const skippedList = Array.isArray(bgTask?.skippedProducts)
    ? bgTask.skippedProducts
    : [];
  const processedCount =
    Number(bgTask?.processedCount || 0) ||
    filledList.length + skippedList.length;
  const updatedCount = Number(bgTask?.updatedCount ?? filledList.length);
  const skippedCount = Number(bgTask?.skippedCount ?? skippedList.length);
  const remainingCount = Number(bgTask?.remainingCount || 0);
  const isRunning = Boolean(bgTask?.running);
  const totalScope = Math.max(1, processedCount + remainingCount);
  const progressPct = bgTask
    ? Math.min(100, Math.round((processedCount / totalScope) * 100))
    : 0;
  const fillRatePct =
    processedCount > 0 ? Math.round((updatedCount / processedCount) * 100) : 0;

  const q = searchTerm.trim().toLowerCase();
  const matchesRow = (item) => {
    if (!q) return true;
    return (
      String(item.name || "")
        .toLowerCase()
        .includes(q) ||
      String(item.product_code || "")
        .toLowerCase()
        .includes(q) ||
      String(item.formulation || "")
        .toLowerCase()
        .includes(q) ||
      String(item.reason_en || item.source_en || "")
        .toLowerCase()
        .includes(q) ||
      String(item.search_query || "")
        .toLowerCase()
        .includes(q)
    );
  };

  const rows = [];
  if (activeTab === "all" || activeTab === "filled") {
    filledList.forEach((item) => {
      if (matchesRow(item)) {
        rows.push({ ...item, _type: "filled" });
      }
    });
  }
  if (activeTab === "all" || activeTab === "skipped") {
    skippedList.forEach((item) => {
      if (matchesRow(item)) {
        rows.push({ ...item, _type: "skipped" });
      }
    });
  }

  const visibleRows = rows.slice(0, pageSize);

  return (
    <div
      dir={isUr ? "rtl" : "ltr"}
      lang={isUr ? "ur" : "en"}
      className="space-y-4"
    >
      {/* Top Action & Filter Bar */}
      <div
        className={`p-4 rounded-2xl border shadow-2xs space-y-3 ${
          isDark
            ? "bg-slate-900 border-slate-800 text-slate-100"
            : "bg-white border-slate-200/90 text-slate-800"
        }`}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <h2 className="text-sm sm:text-base font-black tracking-tight text-slate-900 dark:text-white">
              {isUr
                ? "بیک گراؤنڈ آٹو فل فارمولیشن — تفصیلی مانیٹر اور رپورٹ"
                : "Background Formulation Auto-Fill — Detailed Monitor & Report"}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isUr
                ? "گوگل سرچ + ڈریپ فارماکوپیا تصدیق: نتیجہ ملنے پر فارمولیشن لگتی ہے، نہ ملنے پر پروڈکٹ محفوظ طریقے سے چھوڑی (Skip) جاتی ہے۔"
                : "Iron-Clad Google Search + DRAP Pharmacopoeia Pipeline: Searches Google first, fills verified salts, and safely skips unfound or non-medicine items."}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isPopup && onOpenSeparatePage && (
              <button
                type="button"
                onClick={onOpenSeparatePage}
                className={`inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                  isDark
                    ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-indigo-300"
                    : "bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-700"
                }`}
              >
                <span>
                  {isUr ? "الگ صفحے میں کھولیں" : "Open Separate Page"}
                </span>
              </button>
            )}

            {bgTask && (filledList.length > 0 || skippedList.length > 0) && (
              <button
                type="button"
                onClick={() => exportBgTaskReportCsv(bgTask)}
                className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs transition-all cursor-pointer"
              >
                <span>
                  {isUr ? "مکمل رپورٹ ڈاؤن لوڈ (CSV)" : "Export Full Report (CSV)"}
                </span>
              </button>
            )}

            {isPopup && onClosePopup && (
              <button
                type="button"
                onClick={onClosePopup}
                className={`inline-flex items-center px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  isDark
                    ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300"
                    : "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700"
                }`}
              >
                <span>{isUr ? "بند کریں" : "Close"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter & Task Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
          <div className="relative flex-1">
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => onFilterQueryChange?.(e.target.value)}
              disabled={isRunning}
              placeholder={
                isUr
                  ? "مخصوص پروڈکٹ فلٹر (خالی چھوڑیں تاکہ تمام پروڈکٹس چیک ہوں)..."
                  : "Optional product filter (leave blank to scan all products missing formulations)..."
              }
              className={`w-full px-3.5 py-2 rounded-xl text-xs font-semibold border outline-hidden transition-colors ${
                isDark
                  ? "bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500"
                  : "bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-indigo-500"
              }`}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {!isRunning ? (
              <>
                {onPreviewStart && (
                  <button
                    type="button"
                    onClick={onPreviewStart}
                    disabled={previewLoading}
                    className="inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-extrabold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white shadow-2xs transition-all cursor-pointer active:scale-95"
                  >
                    <span>
                      {isUr
                        ? "گوگل پری ویو چیک کریں اور شروع کریں"
                        : "Preview Google Results & Start"}
                    </span>
                  </button>
                )}
                {onDirectStart && (
                  <button
                    type="button"
                    onClick={onDirectStart}
                    className="inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs transition-all cursor-pointer active:scale-95"
                  >
                    <span>
                      {isUr
                        ? "ابھی آٹو فل شروع کریں"
                        : "Run Auto-Fill Now"}
                    </span>
                  </button>
                )}
              </>
            ) : (
              onStopTask && (
                <button
                  type="button"
                  onClick={onStopTask}
                  className="inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-extrabold bg-rose-600 hover:bg-rose-500 text-white shadow-2xs transition-all cursor-pointer active:scale-95"
                >
                  <span>
                    {isUr ? "بیک گراؤنڈ ٹاسک روکیں" : "Stop Background Task"}
                  </span>
                </button>
              )
            )}

            {bgTask && !isRunning && onClearReport && (
              <button
                type="button"
                onClick={onClearReport}
                className={`inline-flex items-center px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  isDark
                    ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300"
                    : "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-600"
                }`}
              >
                <span>{isUr ? "ری سیٹ" : "Reset Report"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Staged Preview & Permission Confirmation Banner */}
        {awaitingPermission && !isRunning && (
          <div
            className={`p-3.5 rounded-xl border space-y-2.5 ${
              isDark
                ? "bg-amber-950/35 border-amber-500/50 text-amber-100"
                : "bg-amber-50/95 border-amber-300 text-slate-900"
            }`}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-extrabold text-amber-700 dark:text-amber-300">
                  {isUr
                    ? "ڈیٹا بیس میں محفوظ کرنے سے پہلے گوگل سرچ پری ویو چیک کریں"
                    : "Review Google Search Preview Before Posting to Database"}
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-500/20 text-amber-700 dark:text-amber-300">
                {isUr ? "ابھی محفوظ نہیں ہوا" : "STAGED PREVIEW"}
              </span>
            </div>

            {previewLoading ? (
              <div className="py-2 flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-300">
                <span>
                  {isUr
                    ? "گوگل پر پروڈکٹس کی فارمولیشن تلاش کی جا رہی ہے..."
                    : "Searching Google & verifying formulations for preview batch..."}
                </span>
              </div>
            ) : previewData ? (
              <div className="space-y-2">
                <div className="flex items-center flex-wrap gap-2 text-[11px] font-bold">
                  <span className="px-2 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800">
                    {isUr
                      ? `کل خالی فارمولیشنز: ${previewData.total_missing ?? 0}`
                      : `Total Missing Formulations: ${previewData.total_missing ?? 0}`}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                    {isUr
                      ? `پہلے بیچ میں تصدیق شدہ: ${previewData.resolvable_in_preview ?? 0}`
                      : `Verified in Batch 1: ${previewData.resolvable_in_preview ?? 0}`}
                  </span>
                </div>

                {Array.isArray(previewData.records) &&
                  previewData.records.length > 0 && (
                    <div
                      className={`max-h-40 overflow-y-auto rounded-lg border divide-y ${
                        isDark
                          ? "bg-slate-950/75 border-slate-800 divide-slate-800"
                          : "bg-white border-slate-200 divide-slate-100"
                      }`}
                    >
                      {previewData.records.map((rec, idx) => (
                        <div
                          key={idx}
                          className="px-3 py-1.5 text-xs flex items-center justify-between gap-2"
                        >
                          <span className="font-bold truncate">
                            {rec.title}{" "}
                            {rec.code_preview ? `(${rec.code_preview})` : ""}
                          </span>
                          <span className="px-2 py-0.5 rounded font-extrabold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0">
                            {rec.fields?.[0]?.after || ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            ) : null}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={previewLoading}
                onClick={onConfirmPermission}
                className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white cursor-pointer"
              >
                <span>
                  {isUr
                    ? "اجازت دیں اور آٹو فل شروع کریں"
                    : "Approve & Start Auto-Fill"}
                </span>
              </button>
              <button
                type="button"
                onClick={onCancelPermission}
                className="inline-flex items-center px-2.5 py-1.5 rounded-xl text-xs font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-500/30 cursor-pointer"
              >
                <span>{isUr ? "منسوخ کریں" : "Cancel"}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Live Progress & 4 KPI Summary Cards */}
      <div
        className={`p-4 rounded-2xl border shadow-2xs space-y-3.5 ${
          isDark
            ? "bg-slate-900 border-slate-800 text-slate-100"
            : "bg-white border-slate-200/90 text-slate-800"
        }`}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                isRunning
                  ? "bg-indigo-500 animate-pulse"
                  : bgTask
                  ? "bg-emerald-500"
                  : "bg-slate-400"
              }`}
            />
            <span className="text-xs sm:text-sm font-extrabold">
              {isRunning
                ? isUr
                  ? "گوگل پر سرچ جاری ہے اور فارمولیشنز خودکار طریقے سے محفوظ ہو رہی ہیں..."
                  : "Live: Searching Google & Filling Verified Product Formulations..."
                : bgTask?.status === "stopped"
                ? isUr
                  ? "صارف نے بیک گراؤنڈ ٹاسک روک دیا — نیچے مکمل رپورٹ دیکھیں"
                  : "Background Task Stopped by User — Detailed Report Below"
                : bgTask
                ? isUr
                  ? "بیک گراؤنڈ فارمولیشن ٹاسک مکمل — نیچے تفصیلی رپورٹ دیکھیں"
                  : "Background Auto-Fill Completed — Full Detailed Report Below"
                : isUr
                ? "ابھی کوئی بیک گراؤنڈ ٹاسک نہیں چلایا گیا"
                : "Ready to Scan & Auto-Fill Missing Product Formulations"}
            </span>
          </div>

          {bgTask && (
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">
                {progressPct}% {isUr ? "مکمل" : "Complete"}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
                {fillRatePct}% {isUr ? "کامیابی" : "Match Rate"}
              </span>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isRunning
                ? "bg-gradient-to-r from-indigo-500 via-blue-500 to-emerald-500"
                : "bg-emerald-500"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* 4 KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div
            className={`p-3 rounded-xl border ${
              isDark
                ? "bg-slate-800/70 border-slate-700"
                : "bg-slate-50 border-slate-200/80"
            }`}
          >
            <p className="text-[11px] font-bold text-slate-400 uppercase">
              {isUr ? "کل چیک شدہ پروڈکٹس" : "Total Products Scanned"}
            </p>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
              {processedCount.toLocaleString()}
            </p>
          </div>

          <div
            className={`p-3 rounded-xl border ${
              isDark
                ? "bg-emerald-950/35 border-emerald-700/50"
                : "bg-emerald-50/80 border-emerald-200"
            }`}
          >
            <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">
              {isUr ? "فارمولیشن لگائی گئی" : "Filled (Google Verified)"}
            </p>
            <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
              {updatedCount.toLocaleString()}
            </p>
          </div>

          <div
            className={`p-3 rounded-xl border ${
              isDark
                ? "bg-amber-950/30 border-amber-700/50"
                : "bg-amber-50/80 border-amber-200"
            }`}
          >
            <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase">
              {isUr
                ? "چھوڑی گئیں (Skipped)"
                : "Skipped (Unfound / Non-Med)"}
            </p>
            <p className="text-xl font-black text-amber-700 dark:text-amber-300 mt-0.5">
              {skippedCount.toLocaleString()}
            </p>
          </div>

          <div
            className={`p-3 rounded-xl border ${
              isDark
                ? "bg-indigo-950/30 border-indigo-700/50"
                : "bg-indigo-50/80 border-indigo-200"
            }`}
          >
            <p className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">
              {isUr ? "باقی پروڈکٹس" : "Remaining in Queue"}
            </p>
            <p className="text-xl font-black text-indigo-700 dark:text-indigo-300 mt-0.5">
              {remainingCount.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Detailed Report Table Card */}
      <div
        className={`p-4 rounded-2xl border shadow-2xs space-y-3 ${
          isDark
            ? "bg-slate-900 border-slate-800 text-slate-100"
            : "bg-white border-slate-200/90 text-slate-800"
        }`}
      >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              {
                id: "all",
                en: `All Scanned (${filledList.length + skippedList.length})`,
                ur: `تمام چیک شدہ (${filledList.length + skippedList.length})`,
              },
              {
                id: "filled",
                en: `Filled Formulations (${filledList.length})`,
                ur: `فارمولیشن لگائی گئی (${filledList.length})`,
              },
              {
                id: "skipped",
                en: `Skipped Products (${skippedList.length})`,
                ur: `چھوڑی گئی پروڈکٹس (${skippedList.length})`,
              },
            ].map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                    active
                      ? "bg-indigo-600 text-white shadow-2xs"
                      : isDark
                      ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {isUr ? tab.ur : tab.en}
                </button>
              );
            })}
          </div>

          {/* Search inside Report */}
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                isUr
                  ? "پروڈکٹ، کوڈ، سالٹ یا وجہ تلاش کریں..."
                  : "Search product, code, salt, or reason..."
              }
              className={`w-full px-3 py-1.5 rounded-xl text-xs font-semibold border outline-hidden ${
                isDark
                  ? "bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500"
                  : "bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-indigo-500"
              }`}
            />
          </div>
        </div>

        {/* Semantic Responsive Table with Sticky Headers */}
        <div
          className={`overflow-auto max-w-full max-h-[min(560px,68vh)] rounded-xl border ${
            isDark ? "border-slate-800" : "border-slate-200"
          }`}
          style={{ containerType: "inline-size" }}
        >
          <table className="w-full text-left border-collapse text-xs">
            <thead
              className={`sticky top-0 z-10 text-[11px] font-extrabold uppercase tracking-wider border-b ${
                isDark
                  ? "bg-slate-950 text-slate-300 border-slate-800"
                  : "bg-slate-100 text-slate-600 border-slate-200"
              }`}
            >
              <tr>
                <th className="py-2.5 px-3"># / Status</th>
                <th className="py-2.5 px-3">
                  {isUr ? "پروڈکٹ اور کوڈ" : "Product Name & Code"}
                </th>
                <th className="py-2.5 px-3">
                  {isUr
                    ? "فارمولیشن (Generic Salt)"
                    : "Formulation (Generic Salt)"}
                </th>
                <th className="py-2.5 px-3">
                  {isUr
                    ? "گوگل سرچ / تصدیق یا چھوڑنے کی وجہ"
                    : "Verification Source / Skip Reason"}
                </th>
                <th className="py-2.5 px-3">
                  {isUr ? "گوگل سرچ کیوری" : "Google Search Query"}
                </th>
                <th className="py-2.5 px-3 text-right">
                  {isUr ? "عمل" : "Action"}
                </th>
              </tr>
            </thead>
            <tbody
              className={`divide-y ${
                isDark ? "divide-slate-800" : "divide-slate-200/70"
              }`}
            >
              {visibleRows.length > 0 ? (
                visibleRows.map((row, idx) => {
                  const isFilled = row._type === "filled";
                  const googleQuery =
                    row.search_query ||
                    `${row.name || ""} medicine generic salt formulation composition`;
                  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(
                    googleQuery
                  )}`;

                  return (
                    <tr
                      key={`${row._type}-${row.id || idx}-${row.product_code || idx}`}
                      className={
                        isDark
                          ? "hover:bg-slate-800/45 transition-colors"
                          : "hover:bg-slate-50/90 transition-colors"
                      }
                    >
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10.5px] font-mono text-slate-400">
                            {idx + 1}.
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                              isFilled
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                            }`}
                          >
                            {isFilled
                              ? isUr
                                ? "اپڈیٹ شدہ"
                                : "Filled"
                              : isUr
                              ? "چھوڑی گئی"
                              : "Skipped"}
                          </span>
                        </div>
                      </td>

                      <th
                        scope="row"
                        className="py-2.5 px-3 font-bold text-slate-900 dark:text-white"
                      >
                        <div className="space-y-0.5">
                          <span className="block">{row.name}</span>
                          {row.product_code && (
                            <span className="text-[10.5px] font-mono text-slate-400 block">
                              {row.product_code}
                            </span>
                          )}
                        </div>
                      </th>

                      <td className="py-2.5 px-3">
                        {isFilled ? (
                          <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-extrabold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                            {row.formulation}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono">—</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3">
                        {isFilled ? (
                          <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-300">
                            {stripLeadingEmoji(
                              isUr
                                ? row.source_ur ||
                                    "گوگل سرچ اور فارماکوپیا سے تصدیق شدہ"
                                : row.source_en ||
                                    "Google Search & DRAP Pharmacopoeia Verified"
                            )}
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                            {stripLeadingEmoji(
                              isUr
                                ? row.reason_ur ||
                                    "گوگل سرچ پر کوئی تصدیق شدہ فارمولیشن نہیں ملی — چھوڑ دیا گیا"
                                : row.reason_en ||
                                    "No verified formulation found on Google Search — skipped"
                            )}
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3">
                        <a
                          href={googleUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline max-w-[220px] truncate"
                          title={`Check on Google: ${googleQuery}`}
                        >
                          <span className="truncate">{googleQuery}</span>
                        </a>
                      </td>

                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {row.id && onNavigateProduct && (
                          <button
                            type="button"
                            onClick={() =>
                              onNavigateProduct(
                                row.edit_path || `/products/${row.id}/edit`
                              )
                            }
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                              isDark
                                ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200"
                                : "bg-white hover:bg-slate-100 border-slate-200 text-slate-700"
                            }`}
                          >
                            {isUr ? "پروڈکٹ کھولیں" : "Edit Product"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 px-4 text-center text-xs text-slate-400"
                  >
                    {bgTask
                      ? isUr
                        ? "اس فلٹر میں کوئی پروڈکٹ نہیں ملی۔"
                        : "No products match the selected filter or search query."
                      : isUr
                      ? "رپورٹ دیکھنے کے لیے اوپر 'Preview Google Results & Start' یا 'Run Auto-Fill Now' بٹن پر کلک کریں۔"
                      : "Click 'Preview Google Results & Start' or 'Run Auto-Fill Now' above to scan your products and view the detailed report."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Load More pagination if rows exceed pageSize */}
        {rows.length > pageSize && (
          <div className="flex items-center justify-between pt-2 text-xs">
            <span className="text-slate-500">
              Showing {visibleRows.length} of {rows.length} items
            </span>
            <button
              type="button"
              onClick={() => setPageSize((prev) => prev + 200)}
              className="px-3 py-1.5 rounded-xl font-extrabold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
            >
              {isUr ? "مزید دکھائیں (+200)" : "Show More (+200)"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Standalone Page (`/background-tasks`) for monitoring & inspecting Background Formulation Auto-Fill in detail.
 */
export default function BackgroundTasksPage() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [isUr, setIsUr] = useState(() => {
    try {
      return localStorage.getItem(LANG_STORAGE_KEY) === "ur";
    } catch {
      return false;
    }
  });

  const [bgTask, setBgTask] = useState(() => loadPersistedBgTask());
  const [filterQuery, setFilterQuery] = useState(
    () => loadPersistedBgTask()?.filterQuery || ""
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [awaitingPermission, setAwaitingPermission] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const localCancelRef = useRef(false);

  // Sync with live updates broadcast from FeatureGuideBot or other tabs
  useEffect(() => {
    const onTaskUpdated = (e) => {
      if (e?.detail !== undefined) {
        setBgTask(e.detail);
      } else {
        setBgTask(loadPersistedBgTask());
      }
    };
    const onLangChanged = (e) => {
      if (e?.detail) setIsUr(e.detail === "ur");
    };
    window.addEventListener("karobar:bg-task-updated", onTaskUpdated);
    window.addEventListener("guide-bot-lang-changed", onLangChanged);
    return () => {
      window.removeEventListener("karobar:bg-task-updated", onTaskUpdated);
      window.removeEventListener("guide-bot-lang-changed", onLangChanged);
    };
  }, []);

  const handlePreviewStart = useCallback(async () => {
    if (bgTask?.running || previewLoading) return;
    setPreviewLoading(true);
    setAwaitingPermission(true);
    try {
      const res = await axios.post("/api/cube/execute-task", {
        task_type: "bulk_autofill_missing_formulations",
        batch_size: 20,
        after_id: 0,
        filter_query: filterQuery.trim(),
        preview_only: true,
      });
      setPreviewData(res?.data?.task_meta?.preview_result || null);
    } catch {
      setPreviewData(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [bgTask?.running, filterQuery, previewLoading]);

  const handleDirectStart = useCallback(async () => {
    if (bgTask?.running) return;
    setAwaitingPermission(false);
    setPreviewData(null);
    localCancelRef.current = false;

    const cleanFilter = filterQuery.trim();
    const initialSnap = {
      running: true,
      status: "running",
      processedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      remainingCount: 0,
      updatedProducts: [],
      skippedProducts: [],
      filterQuery: cleanFilter,
    };
    setBgTask(initialSnap);
    savePersistedBgTask(initialSnap);

    let afterId = 0;
    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let accumulatedUpdated = [];
    let accumulatedSkipped = [];

    while (!localCancelRef.current) {
      try {
        const res = await axios.post("/api/cube/execute-task", {
          task_type: "bulk_autofill_missing_formulations",
          batch_size: 20,
          after_id: afterId,
          filter_query: cleanFilter,
        });

        const data = res?.data || {};
        const meta = data.task_meta || {};
        const nextBg = data.background_task || meta.background_task || {};
        const batchUpdated = Number(meta.updated_count || 0);
        const batchProcessed = Number(nextBg.processed_in_batch || 0);
        const newUpdated = Array.isArray(meta.updated_products)
          ? meta.updated_products
          : [];
        const newSkipped = Array.isArray(meta.skipped_products)
          ? meta.skipped_products
          : [];
        const remaining = Number(nextBg.remaining_count || 0);
        const hasMore = Boolean(nextBg.has_more);

        totalUpdated += batchUpdated;
        totalProcessed += batchProcessed;
        totalSkipped += newSkipped.length;
        afterId = Number(nextBg.last_processed_id || afterId);

        if (newUpdated.length > 0) {
          accumulatedUpdated = [...accumulatedUpdated, ...newUpdated].slice(
            0,
            5000
          );
        }
        if (newSkipped.length > 0) {
          accumulatedSkipped = [...accumulatedSkipped, ...newSkipped].slice(
            0,
            5000
          );
        }

        const stillRunning = hasMore && !localCancelRef.current;
        const snap = {
          running: stillRunning,
          status: stillRunning
            ? "running"
            : localCancelRef.current
            ? "stopped"
            : "completed",
          processedCount: totalProcessed,
          updatedCount: totalUpdated,
          skippedCount: totalSkipped,
          remainingCount: remaining,
          updatedProducts: accumulatedUpdated,
          skippedProducts: accumulatedSkipped,
          filterQuery: cleanFilter,
        };
        setBgTask(snap);
        savePersistedBgTask(snap);

        if (!stillRunning) break;
        await new Promise((r) => window.setTimeout(r, 400));
      } catch {
        const errSnap = {
          ...(loadPersistedBgTask() || initialSnap),
          running: false,
          status: "error",
        };
        setBgTask(errSnap);
        savePersistedBgTask(errSnap);
        break;
      }
    }
  }, [bgTask?.running, filterQuery]);

  const handleStopTask = useCallback(() => {
    localCancelRef.current = true;
    window.dispatchEvent(new CustomEvent("karobar:bg-task-stop"));
    const cur = loadPersistedBgTask() || bgTask;
    if (cur) {
      const next = { ...cur, running: false, status: "stopped" };
      setBgTask(next);
      savePersistedBgTask(next);
    }
  }, [bgTask]);

  const handleClearReport = useCallback(() => {
    setBgTask(null);
    savePersistedBgTask(null);
  }, []);

  return (
    <div className="workspace-page max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
      <BackgroundTaskDetailView
        bgTask={bgTask}
        isUr={isUr}
        isDark={isDark}
        isPopup={false}
        filterQuery={filterQuery}
        onFilterQueryChange={setFilterQuery}
        onPreviewStart={handlePreviewStart}
        onDirectStart={handleDirectStart}
        onStopTask={handleStopTask}
        onClearReport={handleClearReport}
        previewLoading={previewLoading}
        awaitingPermission={awaitingPermission}
        previewData={previewData}
        onConfirmPermission={handleDirectStart}
        onCancelPermission={() => {
          setAwaitingPermission(false);
          setPreviewData(null);
        }}
        onNavigateProduct={(path) => navigate(path)}
      />
    </div>
  );
}

