import React from "react";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  BookmarkSquareIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "@/context/ThemeContext.jsx";

export default function InvoiceDraftIndicator({
  saveStatus,
  lastSavedAt,
  saveError,
  draftsCount = 0,
  activeDraftTitle = null,
  onOpenDrafts,
  onSaveDraft,
}) {
  const { isDark } = useTheme();

  const formatTime = (date) => {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const showStatusBadge =
    saveStatus === "saving" ||
    saveStatus === "conflict" ||
    saveStatus === "error" ||
    Boolean(activeDraftTitle);

  return (
    <div className="flex items-center gap-1.5 text-xs select-none shrink-0">
      {/* Active Resumed Draft / Hold Status Indicator */}
      {showStatusBadge && (
        <div
          className={`hidden lg:flex items-center h-8 px-2.5 rounded-lg border gap-1.5 shrink-0 transition-colors ${
            isDark
              ? "bg-slate-800/80 border-slate-700 text-slate-300"
              : "bg-gray-100/90 border-gray-200 text-gray-700"
          }`}
        >
          {saveStatus === "saving" && (
            <>
              <ArrowPathIcon className={`w-3.5 h-3.5 animate-spin shrink-0 ${isDark ? "text-blue-400" : "text-blue-600"}`} />
              <span className={`font-medium whitespace-nowrap ${isDark ? "text-blue-300" : "text-blue-700"}`}>Holding…</span>
            </>
          )}
          {saveStatus === "conflict" && (
            <>
              <ExclamationCircleIcon className={`w-3.5 h-3.5 shrink-0 ${isDark ? "text-amber-400" : "text-amber-600"}`} />
              <span className={`font-medium whitespace-nowrap ${isDark ? "text-amber-300" : "text-amber-700"}`}>Conflict</span>
            </>
          )}
          {saveStatus === "error" && (
            <>
              <ExclamationCircleIcon className={`w-3.5 h-3.5 shrink-0 ${isDark ? "text-rose-400" : "text-rose-600"}`} />
              <span className={`font-medium whitespace-nowrap ${isDark ? "text-rose-300" : "text-rose-700"}`} title={saveError || "Hold failed"}>
                Hold failed
              </span>
            </>
          )}
          {(saveStatus === "idle" || saveStatus === "saved") && activeDraftTitle && (
            <>
              <CheckCircleIcon className={`w-3.5 h-3.5 shrink-0 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
              <span className={`font-medium whitespace-nowrap ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>
                Resumed: {activeDraftTitle} {lastSavedAt ? `(${formatTime(lastSavedAt)})` : ""}
              </span>
            </>
          )}
        </div>
      )}

      {/* Manual Hold/Save Draft Button (Ctrl+H) */}
      <button
        type="button"
        onClick={() => onSaveDraft && onSaveDraft()}
        title="Hold / Save Draft (Shortcut: Ctrl+H)"
        className={`inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold border transition-all shrink-0 shadow-xs ${
          isDark
            ? "text-slate-200 bg-slate-800 hover:bg-slate-700 border-slate-600"
            : "text-gray-700 bg-white hover:bg-gray-50 border-gray-300 shadow-xs active:bg-gray-100"
        }`}
      >
        <BookmarkSquareIcon className={`w-3.5 h-3.5 shrink-0 ${isDark ? "text-amber-400" : "text-amber-500"}`} />
        <span className="whitespace-nowrap">Hold</span>
        <kbd
          className={`hidden sm:inline-block px-1 py-0.5 text-[9px] font-mono rounded border leading-none ${
            isDark
              ? "bg-slate-700 text-slate-300 border-slate-600"
              : "bg-gray-100 text-gray-500 border-gray-200"
          }`}
        >
          Ctrl+H
        </kbd>
      </button>

      {/* Held Drafts Modal Toggle with Count Badge (Ctrl+D) */}
      <button
        type="button"
        onClick={() => onOpenDrafts && onOpenDrafts()}
        title="View Held Invoices & Drafts (Shortcut: Ctrl+D)"
        className={`inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold border transition-all shrink-0 shadow-xs ${
          isDark
            ? "text-white bg-blue-700 hover:bg-blue-600 border-blue-600"
            : "text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200 active:bg-blue-200/80"
        }`}
      >
        <ClockIcon className="w-3.5 h-3.5 shrink-0" />
        <span className="whitespace-nowrap">Held Drafts</span>
        {draftsCount > 0 && (
          <span
            className={`h-4 min-w-[16px] px-1 flex items-center justify-center rounded-full text-[10px] font-bold shrink-0 leading-none ${
              isDark ? "bg-amber-400 text-slate-900" : "bg-blue-600 text-white shadow-xs"
            }`}
          >
            {draftsCount}
          </span>
        )}
        <kbd
          className={`hidden sm:inline-block px-1 py-0.5 text-[9px] font-mono rounded border leading-none ${
            isDark
              ? "bg-blue-800 text-blue-200 border-blue-600"
              : "bg-blue-100 text-blue-700 border-blue-200"
          }`}
        >
          Ctrl+D
        </kbd>
      </button>
    </div>
  );
}
