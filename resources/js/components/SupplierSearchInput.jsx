// resources/js/components/SupplierSearchInput.jsx
import React, {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { createPortal } from "react-dom";

const SupplierSearchInput = forwardRef(
  ({ value, onChange, suppliers, autoFocus = false }, ref) => {
    const [query, setQuery] = useState("");
    const [showDropdown, setShowDropdown] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(0);
    const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
    const wrapperRef = useRef(null);
    const inputRef = useRef(null);

    // Expose functions to parent
    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      openMenu: () => setShowDropdown(true),
      closeMenu: () => setShowDropdown(false),
    }));

    // Parent-controlled autofocus
    useEffect(() => {
      if (autoFocus) inputRef.current?.focus();
    }, [autoFocus]);

    // Update query if external value changes
    useEffect(() => {
      const selected = suppliers.find((s) => String(s.id) === String(value));
      if (selected) setQuery(selected.name);
    }, [value, suppliers]);

    const filtered = suppliers.filter((s) =>
      s.name.toLowerCase().includes(query.toLowerCase())
    );

    const updatePosition = () => {
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    };

    const handleSelect = (supplier) => {
      setQuery(supplier.name);
      onChange?.(supplier.id);
      setShowDropdown(false);
    };

    const handleKeyDown = (e) => {
      if (!showDropdown) {
        if (e.key === "Enter") {
          e.preventDefault();
          onChange?.(value); // commit current selection (or empty)
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((prev) =>
          prev < filtered.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[highlightIndex]) handleSelect(filtered[highlightIndex]);
      } else if (e.key === "Escape") {
        setShowDropdown(false);
      }
    };

    const handleFocus = () => {
      setShowDropdown(true);
      updatePosition();
    };

    // Update position on scroll/resize when dropdown is open
    useEffect(() => {
      if (showDropdown) {
        updatePosition();
        window.addEventListener("scroll", updatePosition, true);
        window.addEventListener("resize", updatePosition);
      }
      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }, [showDropdown]);

    // Close dropdown on click outside
    useEffect(() => {
      const handleClickOutside = (e) => {
        if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
          setShowDropdown(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
      <div ref={wrapperRef} className="relative w-full">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowDropdown(true);
            setHighlightIndex(0);
          }}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          className="border w-full h-6 text-[11px] px-1 rounded-lg bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-hidden focus:ring-2 focus:ring-blue-400/40 dark:focus:ring-indigo-400/40"
          placeholder="Search supplier..."
        />
        {showDropdown && filtered.length > 0 && createPortal(
          <div
            className="fixed max-h-60 overflow-auto border bg-white dark:bg-slate-800 shadow-xl react-select__menu-portal text-[11px] rounded-lg border-gray-200 dark:border-slate-600"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <ul>
              {filtered.map((s, idx) => (
                <li
                  key={s.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelect(s);
                  }}
                  className={`px-2 py-1 cursor-pointer ${
                    idx === highlightIndex ? "bg-blue-100 dark:bg-slate-600" : "hover:bg-gray-100 dark:hover:bg-slate-700"
                  }`}
                >
                  <span className="text-gray-900 dark:text-gray-100">{s.name}</span>
                </li>
              ))}
            </ul>
          </div>,
          document.body
        )}
      </div>
    );

  }
);

export default SupplierSearchInput;

