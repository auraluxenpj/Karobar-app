import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import toast from "react-hot-toast";

// Immediately flag draft resumption if ?draft_id is in URL so search modals don't pop open on mount
if (typeof window !== "undefined") {
  try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("draft_id") || sp.get("regular_customer_id")) {
      window.__isResumingInvoiceDraft = true;
    }
  } catch {}
}

const generateUUID = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/**
 * Custom hook to manage recoverable invoice drafts and held sales.
 *
 * @param {Object} options
 * @param {'sale_retail'|'sale_wholesale'|'purchase'} options.type - Invoice draft type
 * @param {Object} options.form - Current form state
 * @param {Function} options.setForm - State setter for form
 * @param {boolean} options.enabled - Whether drafting is enabled (e.g. false in edit mode)
 * @param {Function} [options.onDraftLoaded] - Callback with loaded draft and annotations
 * @param {Function} [options.onStartBlank] - Callback to reset form to blank invoice
 */
export function useInvoiceDraft({ type, form, setForm, enabled = true, onDraftLoaded, onStartBlank }) {
  const [activeDraft, setActiveDraft] = useState(null);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | conflict | error
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [draftsList, setDraftsList] = useState([]);
  const [isDraftsModalOpen, setIsDraftsModalOpen] = useState(false);
  const [draftAnnotations, setDraftAnnotations] = useState(null);

  const activeDraftRef = useRef(null);
  const isSavingRef = useRef(false);
  const saveTimeoutRef = useRef(null);
  const latestFormRef = useRef(form);
  const isResumingRef = useRef(false);

  useEffect(() => {
    latestFormRef.current = form;
  }, [form]);

  // Determine if form has business data worth saving (must have at least one product selected)
  const hasMeaningfulData = useCallback((formData) => {
    if (!formData) return false;
    return Array.isArray(formData.items) && formData.items.some((it) => Boolean(it?.product_id));
  }, []);

  // Refresh active drafts list from API
  const refreshDrafts = useCallback(async () => {
    if (!enabled) return;
    try {
      const { data } = await axios.get("/api/invoice-drafts", { params: { type, status: "draft" } });
      setDraftsList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn("Failed to fetch drafts list", err);
    }
  }, [enabled, type]);

  // Load initial drafts count on mount
  useEffect(() => {
    if (enabled) {
      refreshDrafts();
    }
  }, [enabled, refreshDrafts]);

  // Core save routine (supports create and update with optimistic versioning)
  const performSave = useCallback(
    async (formData, customTitle = null) => {
      if (!enabled || isSavingRef.current || isResumingRef.current) return null;
      if (!hasMeaningfulData(formData)) return null;

      isSavingRef.current = true;
      setSaveStatus("saving");
      setSaveError(null);

      try {
        let savedDraft = null;
        if (!activeDraftRef.current) {
          // Create new draft
          const newUuid = generateUUID();
          const { data } = await axios.post("/api/invoice-drafts", {
            uuid: newUuid,
            type,
            title: customTitle,
            payload: formData,
          });
          savedDraft = data;
        } else {
          // Update existing draft with expected version
          const current = activeDraftRef.current;
          const { data } = await axios.put(`/api/invoice-drafts/${current.id}`, {
            expected_version: current.version,
            title: customTitle ?? current.title,
            payload: formData,
          });
          savedDraft = data;
        }

        activeDraftRef.current = {
          id: savedDraft.id,
          uuid: savedDraft.uuid,
          version: savedDraft.version,
          title: savedDraft.title,
        };
        setActiveDraft(savedDraft);
        setSaveStatus("saved");
        setLastSavedAt(new Date());
        refreshDrafts();
        return savedDraft;
      } catch (err) {
        if (err?.response?.status === 409) {
          setSaveStatus("conflict");
          setSaveError("This draft was modified in another tab or session.");
          toast.error("Draft conflict: modified elsewhere. Please refresh.", { id: "draft-conflict" });
        } else {
          setSaveStatus("error");
          const msg = err?.response?.data?.message || "Failed to save draft";
          setSaveError(msg);
        }
        return null;
      } finally {
        isSavingRef.current = false;
      }
    },
    [enabled, hasMeaningfulData, type, refreshDrafts]
  );

  // Clear current active draft (e.g. to start a clean new bill)
  const resetToNew = useCallback(() => {
    activeDraftRef.current = null;
    setActiveDraft(null);
    setSaveStatus("idle");
    setSaveError(null);
    setDraftAnnotations(null);
  }, []);

  // Manual explicit "Save Draft"
  const saveDraft = useCallback(
    async (title = null) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (!hasMeaningfulData(latestFormRef.current)) {
        toast.error("Cannot hold invoice with zero products selected. Please add at least one product.", { icon: "⚠️" });
        return null;
      }
      const res = await performSave(latestFormRef.current, title);
      if (res) {
        toast.success(`Saved as held draft: "${res.title || "Draft"}"`);
      }
      return res;
    },
    [performSave, hasMeaningfulData]
  );

  // Hold current invoice and reset to clean blank form for next customer (Alt+H or Hold button)
  const holdAndNew = useCallback(
    async (title = null) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (!hasMeaningfulData(latestFormRef.current)) {
        toast.error("Cannot hold invoice with zero products selected. Please add at least one product.", { icon: "⚠️" });
        return null;
      }
      const res = await performSave(latestFormRef.current, title);
      if (res) {
        toast.success(`Invoice held: "${res.title || "Draft"}". Opened fresh invoice.`);
        if (typeof onStartBlank === "function") {
          onStartBlank();
        } else {
          resetToNew();
        }
      }
      return res;
    },
    [performSave, hasMeaningfulData, onStartBlank, resetToNew]
  );

  // NOTE: Automatic background holding is disabled per user workflow.
  // Invoices are only held when the user explicitly clicks the Hold button or presses Alt+H.

  // Resume / Load a saved draft into the form
  const loadDraft = useCallback(
    async (draftId) => {
      try {
        isResumingRef.current = true;
        if (typeof window !== "undefined") {
          window.__isResumingInvoiceDraft = true;
          window.dispatchEvent(new CustomEvent("product-search:close"));
        }
        setSaveStatus("saving");
        const { data } = await axios.get(`/api/invoice-drafts/${draftId}`);
        const draft = data.draft;
        const annotations = data.annotations || {};

        activeDraftRef.current = {
          id: draft.id,
          uuid: draft.uuid,
          version: draft.version,
          title: draft.title,
        };
        setActiveDraft(draft);
        setDraftAnnotations(annotations);

        if (typeof onDraftLoaded === "function") {
          await onDraftLoaded(draft.payload, draft, data);
        } else if (draft.payload) {
          setForm(draft.payload);
        }

        setSaveStatus("saved");
        setLastSavedAt(new Date(draft.updated_at));
        setIsDraftsModalOpen(false);

        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("product-search:close"));
        }

        // Inform user of any issues (depleted products, missing customer/supplier)
        if (!annotations.party_valid && annotations.party_warning) {
          toast.error(annotations.party_warning, { duration: 5000 });
        }
        const issuesCount = Object.keys(annotations.item_issues || {}).length;
        if (issuesCount > 0) {
          toast(
            `Draft resumed. Note: ${issuesCount} item(s) have stock or batch availability changes.`,
            { icon: "⚠️", duration: 5000 }
          );
        } else {
          toast.success(`Resumed draft: "${draft.title || "Draft"}"`);
        }
      } catch (err) {
        toast.error(err?.response?.data?.message || "Failed to resume draft");
      } finally {
        setTimeout(() => {
          isResumingRef.current = false;
          if (typeof window !== "undefined") {
            window.__isResumingInvoiceDraft = false;
          }
        }, 600);
      }
    },
    [setForm, onDraftLoaded]
  );

  // Check URL query parameters for ?draft_id=... on mount
  useEffect(() => {
    if (!enabled) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const urlDraftId = params.get("draft_id");
      if (urlDraftId && !activeDraftRef.current) {
        if (typeof window !== "undefined") {
          window.__isResumingInvoiceDraft = true;
          window.dispatchEvent(new CustomEvent("product-search:close"));
        }
        loadDraft(urlDraftId);
      }
    } catch {}
  }, [enabled, loadDraft]);

  // Global Keyboard Shortcuts (Alt+H: Hold & New, Alt+D: Open Drafts Modal, Alt+N: New Blank)
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      if (!e.altKey) return;
      const key = (e.key || "").toLowerCase();

      // Alt+H: Hold current invoice and clear for next
      if (key === "h") {
        e.preventDefault();
        holdAndNew();
      }
      // Alt+D: Open Held Invoices & Drafts Modal
      else if (key === "d") {
        e.preventDefault();
        setIsDraftsModalOpen(true);
      }
      // Alt+N: New Blank Invoice
      else if (key === "n") {
        e.preventDefault();
        if (typeof onStartBlank === "function") {
          onStartBlank();
          toast.success("New blank invoice ready");
        } else {
          resetToNew();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, holdAndNew, onStartBlank, resetToNew]);

  // Discard a draft permanently
  const discardDraft = useCallback(
    async (draftId) => {
      try {
        await axios.delete(`/api/invoice-drafts/${draftId}`);
        toast.success("Draft discarded");
        if (activeDraftRef.current?.id === draftId) {
          activeDraftRef.current = null;
          setActiveDraft(null);
          setSaveStatus("idle");
          setDraftAnnotations(null);
        }
        refreshDrafts();
      } catch (err) {
        toast.error(err?.response?.data?.message || "Failed to discard draft");
      }
    },
    [refreshDrafts]
  );

  return {
    activeDraft,
    activeDraftId: activeDraftRef.current?.id || null,
    saveStatus,
    lastSavedAt,
    saveError,
    draftsList,
    draftAnnotations,
    isDraftsModalOpen,
    setIsDraftsModalOpen,
    saveDraft,
    holdAndNew,
    loadDraft,
    discardDraft,
    resetToNew,
    refreshDrafts,
  };
}
