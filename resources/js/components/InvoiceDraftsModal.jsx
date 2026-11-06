import React, { useState, useEffect, useRef, useMemo } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import {
  XMarkIcon,
  TrashIcon,
  ClockIcon,
  UserIcon,
  CurrencyDollarIcon,
  DocumentPlusIcon,
  MagnifyingGlassIcon,
  CubeIcon,
  ShareIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "@/context/ThemeContext.jsx";
import ShareDocumentModal from "./ShareDocumentModal.jsx";

export default function InvoiceDraftsModal({
  isOpen,
  onClose,
  drafts = [],
  activeDraftId = null,
  onResumeDraft,
  onDiscardDraft,
  onStartBlank,
  type = "sale_retail",
}) {
  const { isDark } = useTheme();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [discardingId, setDiscardingId] = useState(null);
  const [confirmingDiscardId, setConfirmingDiscardId] = useState(null);
  const [shareQuotationId, setShareQuotationId] = useState(null);
  const [postingId, setPostingId] = useState(null);

  const searchInputRef = useRef(null);
  const itemsContainerRef = useRef(null);
  const mouseDownTargetRef = useRef(null);

  const getTypeName = (t) => {
    switch (t) {
      case "sale_retail":
        return "Retail Sale / Quotation";
      case "sale_wholesale":
        return "Wholesale Sale / Quotation";
      case "quotation":
        return "Price Quotation";
      case "purchase":
        return "Purchase Invoice";
      default:
        return "Draft";
    }
  };

  const formatDateTime = (isoString) => {
    if (!isoString) return "";
    const d = new Date(isoString);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };

  // Filter drafts based on search term
  const filteredDrafts = useMemo(() => {
    if (!searchTerm.trim()) return drafts;
    const q = searchTerm.toLowerCase();
    return drafts.filter((d) => {
      const title = (d.title || "").toLowerCase();
      const party = (d.party_name || "").toLowerCase();
      const amount = String(d.total_amount || "");
      const count = String(d.items_count || "");
      const productMatches = Array.isArray(d.items_summary) && d.items_summary.some((p) => (p.name || "").toLowerCase().includes(q));
      return title.includes(q) || party.includes(q) || amount.includes(q) || count.includes(q) || productMatches;
    });
  }, [drafts, searchTerm]);

  // Reset selected index when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchTerm("");
      setSelectedIndex(0);
      setConfirmingDiscardId(null);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Keyboard navigation within modal (Up/Down/Enter/Escape/Ctrl+N)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key || "").toLowerCase() === "n") {
        e.preventDefault();
        onStartBlank && onStartBlank();
        onClose();
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = prev + 1 >= filteredDrafts.length ? 0 : prev + 1;
          scrollToItem(next);
          return next;
        });
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = prev - 1 < 0 ? Math.max(filteredDrafts.length - 1, 0) : prev - 1;
          scrollToItem(next);
          return next;
        });
        return;
      }

      if (e.key === "Enter") {
        const target = e.target;
        if (target && target.tagName === "BUTTON") {
          return;
        }

        if (filteredDrafts.length > 0 && filteredDrafts[selectedIndex]) {
          e.preventDefault();
          onResumeDraft(filteredDrafts[selectedIndex].id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filteredDrafts, selectedIndex, onClose, onResumeDraft, onStartBlank]);

  const scrollToItem = (index) => {
    const container = itemsContainerRef.current;
    if (!container) return;
    const item = container.children[index];
    if (item) {
      item.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  };

  const handleDiscard = async (draftId) => {
    setDiscardingId(draftId);
    try {
      await onDiscardDraft(draftId);
      setConfirmingDiscardId(null);
    } finally {
      setDiscardingId(null);
    }
  };

  const handleMouseDown = (e) => {
    mouseDownTargetRef.current = e.target;
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && mouseDownTargetRef.current === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onMouseDown={handleMouseDown}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn cursor-default"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-2xl max-h-[85dvh] flex flex-col rounded-2xl shadow-2xl overflow-hidden border transition-colors ${
          isDark
            ? "bg-slate-900 border-slate-700/80 text-slate-100"
            : "bg-white border-gray-200 text-gray-900"
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            isDark ? "border-slate-800 bg-slate-800/50" : "border-gray-100 bg-gray-50/80"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl border ${
                isDark
                  ? "bg-blue-600/20 text-blue-400 border-blue-500/20"
                  : "bg-blue-50 text-blue-600 border-blue-200"
              }`}
            >
              <ClockIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`text-base font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                Held Invoices &amp; Drafts ({getTypeName(type)})
              </h2>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                Search, resume, or discard held orders without affecting stock
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              isDark
                ? "text-slate-400 hover:text-white hover:bg-slate-800"
                : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            }`}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar & Actions */}
        <div
          className={`p-4 border-b flex flex-wrap items-center gap-3 ${
            isDark ? "bg-slate-800/30 border-slate-800/60" : "bg-gray-50/50 border-gray-100"
          }`}
        >
          <div className="relative flex-1">
            <MagnifyingGlassIcon
              className={`absolute left-3 top-2.5 w-4 h-4 pointer-events-none ${
                isDark ? "text-slate-400" : "text-gray-400"
              }`}
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search held drafts by customer, item, or amount… (↑/↓ to navigate)"
              className={`w-full pl-9 pr-3 py-2 text-xs rounded-lg border transition-colors focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${
                isDark
                  ? "bg-slate-800 border-slate-700 text-white placeholder-slate-400"
                  : "bg-white border-gray-300 text-gray-900 placeholder-gray-400"
              }`}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              onStartBlank && onStartBlank();
              onClose();
            }}
            title="Create fresh new blank invoice (Ctrl+N)"
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors shrink-0 shadow-xs ${
              isDark
                ? "text-slate-200 bg-slate-800 hover:bg-slate-700 border-slate-700"
                : "text-gray-700 bg-white hover:bg-gray-50 border-gray-300 active:bg-gray-100"
            }`}
          >
            <DocumentPlusIcon className="w-4 h-4 text-emerald-500" />
            <span>New Blank (Ctrl+N)</span>
          </button>
        </div>

        {/* Drafts List */}
        <div ref={itemsContainerRef} className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredDrafts.length === 0 ? (
            <div className={`py-12 text-center ${isDark ? "text-slate-400" : "text-gray-500"}`}>
              <ClockIcon className={`w-12 h-12 mx-auto mb-3 stroke-1 ${isDark ? "text-slate-600" : "text-gray-300"}`} />
              <p className="text-sm font-medium">
                {searchTerm ? `No held drafts match "${searchTerm}"` : "No held drafts found for this document type."}
              </p>
              <p className={`text-xs mt-1 ${isDark ? "text-slate-500" : "text-gray-400"}`}>
                Press <kbd className={`px-1 py-0.5 rounded border ${isDark ? "bg-slate-800 border-slate-700" : "bg-gray-100 border-gray-200"}`}>Ctrl+H</kbd> while entering an invoice to hold it.
              </p>
            </div>
          ) : (
            filteredDrafts.map((d, index) => {
              const isSelected = selectedIndex === index;
              const isActive = activeDraftId === d.id;
              const isConfirming = confirmingDiscardId === d.id;
              const isDeleting = discardingId === d.id;

              return (
                <div
                  key={d.id}
                  onClick={() => setSelectedIndex(index)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? (isDark
                          ? "bg-blue-950/40 border-blue-500/80 ring-1 ring-blue-500/40 shadow-md"
                          : "bg-blue-50/80 border-blue-400 ring-1 ring-blue-400/40 shadow-xs")
                      : (isDark
                          ? "bg-slate-800/40 hover:bg-slate-800/70 border-slate-700/60"
                          : "bg-white hover:bg-gray-50 border-gray-200 shadow-xs")
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold text-sm truncate ${isDark ? "text-white" : "text-gray-900"}`}>
                          {d.title || "Untitled Draft"}
                        </span>
                        {isActive && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              isDark
                                ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                                : "bg-blue-50 text-blue-700 border-blue-200"
                            }`}
                          >
                            Currently Open
                          </span>
                        )}
                        {isSelected && (
                          <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-mono bg-blue-600 text-white font-medium">
                            Press Enter
                          </span>
                        )}
                      </div>

                      <div className={`mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${isDark ? "text-slate-300" : "text-gray-600"}`}>
                        {d.party_name && (
                          <span className="flex items-center gap-1">
                            <UserIcon className={`w-3.5 h-3.5 ${isDark ? "text-slate-400" : "text-gray-400"}`} />
                            <span className="font-medium">{d.party_name}</span>
                          </span>
                        )}
                        <span className={`flex items-center gap-1 font-bold ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
                          <CurrencyDollarIcon className="w-3.5 h-3.5" />
                          {Number(d.total_amount || 0).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                        <span className={isDark ? "text-slate-400" : "text-gray-500"}>
                          {d.items_count || 0} items
                        </span>
                        <span className={`text-[11px] ${isDark ? "text-slate-500" : "text-gray-400"}`}>
                          Updated {formatDateTime(d.updated_at)}
                        </span>
                      </div>

                      {/* Brief Product Details */}
                      {Array.isArray(d.items_summary) && d.items_summary.length > 0 && (
                        <div
                          className={`mt-2.5 pt-2 border-t flex flex-wrap items-center gap-1.5 ${
                            isDark ? "border-slate-700/60" : "border-gray-100"
                          }`}
                        >
                          <span className={`text-[11px] font-medium mr-1 flex items-center gap-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                            <CubeIcon className={`w-3.5 h-3.5 shrink-0 ${isDark ? "text-slate-400" : "text-gray-400"}`} />
                            Items:
                          </span>
                          {d.items_summary.slice(0, 4).map((item, idx) => (
                            <span
                              key={idx}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border shadow-xs ${
                                isDark
                                  ? "bg-slate-700/70 text-slate-200 border-slate-600/60"
                                  : "bg-gray-100 text-gray-700 border-gray-200"
                              }`}
                            >
                              <span className="truncate max-w-[160px] font-medium">{item.name}</span>
                              <span className={isDark ? "text-amber-400 font-bold" : "text-amber-600 font-bold"}>
                                ×{item.quantity}
                              </span>
                            </span>
                          ))}
                          {d.items_summary.length > 4 && (
                            <span className={`text-[11px] font-medium italic pl-0.5 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                              +{d.items_summary.length - 4} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {isConfirming ? (
                        <div className={`flex items-center gap-1 p-1 rounded-lg border ${
                          isDark ? "bg-red-950/80 border-red-800" : "bg-red-50 border-red-200"
                        }`}>
                          <span className={`text-[11px] px-1 font-medium ${isDark ? "text-red-200" : "text-red-700"}`}>
                            Discard?
                          </span>
                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDiscard(d.id);
                            }}
                            className="px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
                          >
                            {isDeleting ? "…" : "Yes"}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmingDiscardId(null);
                            }}
                            className={`px-2 py-1 rounded text-xs ${
                              isDark
                                ? "bg-slate-700 hover:bg-slate-600 text-slate-200"
                                : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                            }`}
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <>
                          {d.type !== "purchase" && (
                            <>
                              <button
                                type="button"
                                title="Print or Share Price Quotation / Estimate PDF"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShareQuotationId(d.id);
                                }}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 border transition-colors ${
                                  isDark
                                    ? "bg-emerald-900/30 border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/50"
                                    : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                                }`}
                              >
                                <ShareIcon className="w-3.5 h-3.5" />
                                <span>Quote PDF</span>
                              </button>
                              <button
                                type="button"
                                disabled={postingId === d.id}
                                title="One-click convert this Quotation / Draft into a Posted Sale Invoice"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    setPostingId(d.id);
                                    const { data } = await axios.post(`/api/invoice-drafts/${d.id}/post`);
                                    toast.success(`Converted to Sale Invoice ${data?.posted_number || `#${data?.id}`}`);
                                    onClose();
                                    if (data?.id) {
                                      window.location.href = `/sale-invoices/${data.id}`;
                                    }
                                  } catch (err) {
                                    toast.error(err?.response?.data?.message || "Failed to convert quotation to invoice");
                                  } finally {
                                    setPostingId(null);
                                  }
                                }}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 border transition-colors ${
                                  isDark
                                    ? "bg-indigo-900/40 border-indigo-700/60 text-indigo-300 hover:bg-indigo-900/60"
                                    : "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100"
                                }`}
                              >
                                <CheckCircleIcon className="w-3.5 h-3.5" />
                                <span>{postingId === d.id ? "Posting…" : "Post Invoice"}</span>
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            title="Discard draft permanently"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmingDiscardId(d.id);
                            }}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isDark
                                ? "text-slate-400 hover:text-red-400 hover:bg-red-950/30"
                                : "text-gray-400 hover:text-red-600 hover:bg-red-50"
                            }`}
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onResumeDraft(d.id);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs ${
                              isSelected
                                ? "bg-blue-600 hover:bg-blue-500 text-white"
                                : (isDark
                                    ? "bg-slate-700 hover:bg-slate-600 text-white"
                                    : "bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-200")
                            }`}
                          >
                            {isActive ? "Re-load" : "Resume"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer with keyboard shortcuts legend */}
        <div
          className={`flex items-center justify-between px-6 py-2.5 border-t text-xs ${
            isDark ? "border-slate-800 bg-slate-800/40 text-slate-400" : "border-gray-100 bg-gray-50 text-gray-500"
          }`}
        >
          <div className="hidden sm:flex items-center gap-3 text-[11px]">
            <span>
              <kbd className={`px-1 py-0.5 rounded border font-mono ${isDark ? "bg-slate-800 border-slate-700" : "bg-gray-200/80 border-gray-300 text-gray-700"}`}>↑</kbd>{" "}
              <kbd className={`px-1 py-0.5 rounded border font-mono ${isDark ? "bg-slate-800 border-slate-700" : "bg-gray-200/80 border-gray-300 text-gray-700"}`}>↓</kbd> navigate
            </span>
            <span>
              <kbd className={`px-1 py-0.5 rounded border font-mono ${isDark ? "bg-slate-800 border-slate-700" : "bg-gray-200/80 border-gray-300 text-gray-700"}`}>Enter</kbd> resume
            </span>
            <span>
              <kbd className={`px-1 py-0.5 rounded border font-mono ${isDark ? "bg-slate-800 border-slate-700" : "bg-gray-200/80 border-gray-300 text-gray-700"}`}>Ctrl+N</kbd> blank
            </span>
            <span>
              <kbd className={`px-1 py-0.5 rounded border font-mono ${isDark ? "bg-slate-800 border-slate-700" : "bg-gray-200/80 border-gray-300 text-gray-700"}`}>Esc</kbd> close
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`ml-auto px-4 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              isDark
                ? "text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border-slate-700"
                : "text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-100 border-gray-300"
            }`}
          >
            Close
          </button>
        </div>
      </div>

      <ShareDocumentModal
        isOpen={Boolean(shareQuotationId)}
        onClose={() => setShareQuotationId(null)}
        documentType="quotation"
        documentId={shareQuotationId}
      />
    </div>
  );
}
