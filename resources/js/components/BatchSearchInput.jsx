// resources/js/components/BatchSearchInput.jsx
import React, {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";

const BatchSearchInput = forwardRef(
  (
    {
      value,
      onChange,
      batches = [],
      usedBatches = [],
      onKeyDown,
      placeholder,
      mode = "sale", // 'sale' or 'purchase'
      allowNew = false,
    },
    ref
  ) => {
    const isPurchase = mode === "purchase" || allowNew;
    const defaultPlaceholder = isPurchase
      ? "New batch, existing batch, or unassigned..."
      : "Select batch or unbatched...";

    const [query, setQuery] = useState("");
    const [showDropdown, setShowDropdown] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(0);
    const wrapperRef = useRef(null);
    const inputRef = useRef(null);

    // ✅ Expose API to parent
    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      select: () => inputRef.current?.select?.(),
      openMenu: () => setShowDropdown(true),
      closeMenu: () => setShowDropdown(false),
    }));

    // Close dropdown on outside click
    useEffect(() => {
      function handleClickOutside(event) {
        if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
          setShowDropdown(false);
        }
      }
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Update query if value changes externally
    useEffect(() => {
      if (value) {
        setQuery(value);
      } else {
        setQuery("");
      }
    }, [value]);

    // Separate regular batches and unbatched option
    const unbatchedOption = (batches || []).find((b) => b.is_unbatched);
    const regularBatches = (batches || []).filter((b) => !b.is_unbatched);

    const isUnbatchedUsed = usedBatches.includes("__unbatched__");

    // When the input has the currently selected batch or unbatched label, treat effective search query as empty
    // so clicking or focusing into the input shows ALL available batches plus unbatched stock
    const isExistingValue =
      !query ||
      query === (value || "") ||
      query === "[Unbatched Stock]" ||
      query === "Unbatched Stock" ||
      query === "[Unassigned Stock]" ||
      query === "Unassigned Stock";
    const effectiveQuery = isExistingValue ? "" : query.trim().toLowerCase();

    const filteredRegular = regularBatches
      .filter((b) => !usedBatches.includes(b.batch_number))
      .filter((b) =>
        !effectiveQuery ||
        (b.batch_number || "").toLowerCase().includes(effectiveQuery) ||
        (b.expiry || b.expiry_date || "").includes(effectiveQuery)
      );

    const effectiveUnbatched =
      unbatchedOption ||
      (isPurchase
        ? {
            id: null,
            batch_number: "",
            expiry: "",
            expiry_date: "",
            available_units: 0,
            is_unbatched: true,
          }
        : null);

    // Build options list
    const filtered = [];

    // In purchase mode, if query is non-empty and doesn't exactly match an existing batch, offer "+ Add new batch"
    const trimmedQuery = query.trim();
    const exactMatch = regularBatches.some(
      (b) => (b.batch_number || "").trim().toLowerCase() === trimmedQuery.toLowerCase()
    );

    if (
      isPurchase &&
      trimmedQuery &&
      !isExistingValue &&
      !exactMatch
    ) {
      filtered.push({
        is_new: true,
        batch_number: trimmedQuery,
        expiry: "",
        expiry_date: "",
        available_units: 0,
      });
    }

    filtered.push(...filteredRegular);

    // Always include unbatched/unassigned stock option below batches unless already used on another row
    if (effectiveUnbatched && !isUnbatchedUsed) {
      filtered.push(effectiveUnbatched);
    }

    const handleSelect = (batch) => {
      if (batch.is_unbatched) {
        const label = isPurchase ? "[Unassigned Stock]" : "[Unbatched Stock]";
        setQuery(label);
        if (onChange) onChange("", batch);
      } else if (batch.is_new) {
        setQuery(batch.batch_number);
        if (onChange) onChange(batch.batch_number, batch);
      } else {
        setQuery(batch.batch_number);
        if (onChange) onChange(batch.batch_number, batch);
      }
      setShowDropdown(false);
    };

    const handleBlur = (e) => {
      if (wrapperRef.current && wrapperRef.current.contains(e.relatedTarget)) {
        return;
      }
      if (isPurchase) {
        const trimmed = query.trim();
        const currentVal = (value || "").trim();
        if (
          trimmed &&
          trimmed !== "[Unbatched Stock]" &&
          trimmed !== "[Unassigned Stock]"
        ) {
          if (trimmed === currentVal) {
            return;
          }
          const matching = regularBatches.find(
            (b) => (b.batch_number || "").trim().toLowerCase() === trimmed.toLowerCase()
          );
          if (matching) {
            if (onChange) onChange(matching.batch_number, { ...matching, fromBlur: true });
          } else {
            if (onChange) onChange(trimmed, { batch_number: trimmed, is_new: true, fromBlur: true });
          }
        } else if (
          trimmed === "[Unbatched Stock]" ||
          trimmed === "[Unassigned Stock]" ||
          trimmed === ""
        ) {
          const alreadyUnbatched =
            !currentVal ||
            currentVal === "[Unbatched Stock]" ||
            currentVal === "[Unassigned Stock]";
          if (!alreadyUnbatched && onChange) {
            onChange("", { is_unbatched: true, fromBlur: true });
          }
        }
      }
    };

    // Keyboard navigation
    const handleKeyDown = (e) => {
      if (!showDropdown) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          setShowDropdown(true);
          setHighlightIndex(0);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          if (isPurchase && query.trim() && !isExistingValue) {
            const trimmed = query.trim();
            const matching = regularBatches.find(
              (b) => (b.batch_number || "").trim().toLowerCase() === trimmed.toLowerCase()
            );
            handleSelect(matching || { is_new: true, batch_number: trimmed });
            return;
          }
          if (onChange) onChange(value);
        }
        if (onKeyDown) onKeyDown(e);
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((prev) =>
          prev < filtered.length - 1 ? prev + 1 : prev
        );
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : 0));
        return;
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[highlightIndex]) {
          handleSelect(filtered[highlightIndex]);
        } else if (isPurchase && query.trim() && !isExistingValue) {
          handleSelect({ is_new: true, batch_number: query.trim() });
        }
        return;
      } else if (e.key === "Escape") {
        e.preventDefault();
        setShowDropdown(false);
        return;
      }

      if (onKeyDown) onKeyDown(e);
    };

    return (
      <div ref={wrapperRef} className="batch-search-trigger relative w-full min-w-0">
        <input
          ref={inputRef}
          type="text"
          size={1}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowDropdown(true);
            setHighlightIndex(0);
          }}
          onFocus={(e) => {
            e.target?.select?.();
            setShowDropdown(true);
          }}
          onClick={() => setShowDropdown(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          title={query || undefined}
          className="border w-full min-w-0 h-7 text-[11px] px-1.5 truncate rounded-md bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-hidden focus:ring-2 focus:ring-blue-400/40 dark:focus:ring-indigo-400/40"
          placeholder={placeholder || defaultPlaceholder}
        />
        {showDropdown && filtered.length > 0 && (
          <div
            className="absolute left-0 min-w-[240px] max-w-[320px] max-h-52 overflow-auto 
                       border bg-white/95 dark:bg-slate-800/95 shadow-xl z-30 text-[11px] rounded-lg border-gray-200 dark:border-slate-600 backdrop-blur-md"
          >
            <ul className="divide-y divide-gray-100 dark:divide-slate-700/60">
              {filtered.map((b, idx) => {
                if (b.is_new) {
                  return (
                    <li
                      key="new-batch-option"
                      onClick={() => handleSelect(b)}
                      className={`px-2.5 py-2 cursor-pointer flex items-center justify-between gap-1 transition-colors bg-emerald-50/70 dark:bg-emerald-950/40 hover:bg-emerald-100/70 dark:hover:bg-emerald-900/60 ${
                        idx === highlightIndex
                          ? "bg-emerald-100 dark:bg-emerald-900/70"
                          : ""
                      }`}
                    >
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-emerald-700 dark:text-emerald-300 truncate">
                            + Add New Batch: &quot;{b.batch_number}&quot;
                          </span>
                          <span className="px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-900/80 text-emerald-700 dark:text-emerald-300 text-[9px] font-bold rounded-sm uppercase tracking-wide">
                            New Batch
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-500 dark:text-slate-400">
                          Create and receive into this new batch
                        </span>
                      </div>
                    </li>
                  );
                }

                if (b.is_unbatched) {
                  const title = isPurchase
                    ? "[Unassigned Stock]"
                    : "[Unbatched Stock]";
                  const subtitle = isPurchase
                    ? "Receive into general on-hand stock pool without batch"
                    : "Sell from general on-hand stock pool";
                  return (
                    <li
                      key="unbatched-option"
                      onClick={() => handleSelect(b)}
                      className={`px-2.5 py-2 cursor-pointer flex items-center justify-between gap-1 transition-colors border-t border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/40 ${
                        idx === highlightIndex
                          ? "bg-indigo-100 dark:bg-indigo-900/70"
                          : "hover:bg-indigo-100/70 dark:hover:bg-indigo-900/50"
                      }`}
                    >
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-indigo-700 dark:text-indigo-300 truncate">
                            {title}
                          </span>
                          <span className="px-1.5 py-0.2 bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 text-[9px] font-bold rounded-sm uppercase tracking-wide">
                            Unassigned
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-500 dark:text-slate-400">
                          {subtitle}
                        </span>
                      </div>
                      {Number(b.available_units ?? b.quantity ?? 0) > 0 && (
                        <div className="text-right shrink-0">
                          <span className="text-xs font-mono font-bold text-indigo-700 dark:text-indigo-300">
                            {b.available_units ?? b.quantity ?? 0}
                          </span>
                          <span className="text-[9px] text-gray-500 dark:text-slate-400 block -mt-0.5">
                            units
                          </span>
                        </div>
                      )}
                    </li>
                  );
                }

                const isExpired =
                  b.is_expired ||
                  (b.expiry_date &&
                    b.expiry_date < new Date().toISOString().slice(0, 10));
                const isFefo = b.is_fefo_recommended;

                return (
                  <li
                    key={
                      b.id
                        ? `batch-${b.id}`
                        : `${b.batch_number}-${b.expiry || idx}`
                    }
                    onClick={() => handleSelect(b)}
                    className={`px-2 py-1.5 cursor-pointer flex items-center justify-between gap-1 transition-colors ${
                      idx === highlightIndex
                        ? "bg-blue-100/80 dark:bg-slate-600"
                        : "hover:bg-gray-100 dark:hover:bg-slate-700/80"
                    } ${
                      isExpired
                        ? "opacity-75 bg-red-50/50 dark:bg-red-950/20"
                        : ""
                    }`}
                  >
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {b.batch_number}
                        </span>
                        {isPurchase ? (
                          <span className="px-1 py-0.2 bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[9px] font-bold rounded-sm tracking-wide">
                            Add to existing
                          </span>
                        ) : (
                          isFefo && (
                            <span className="px-1 py-0.2 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-[9px] font-bold rounded-sm uppercase tracking-wide">
                              FEFO
                            </span>
                          )
                        )}
                        {isExpired && (
                          <span className="px-1 py-0.2 bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300 text-[9px] font-bold rounded-sm uppercase tracking-wide">
                            Expired
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-500 dark:text-slate-400">
                        Exp: {b.expiry || b.expiry_date || "N/A"}
                      </span>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono font-medium text-gray-700 dark:text-slate-200">
                        {b.available_units ?? b.quantity ?? 0}
                      </span>
                      <span className="text-[9px] text-gray-400 block -mt-0.5">
                        units
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    );
  }
);

BatchSearchInput.displayName = "BatchSearchInput";
export default BatchSearchInput;
