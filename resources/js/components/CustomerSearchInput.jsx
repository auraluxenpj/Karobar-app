// resources/js/components/CustomerSearchInput.jsx
import React, {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { createPortal } from "react-dom";

const CustomerSearchInput = forwardRef(
  ({ value, onChange, customers = [], autoFocus = false, menuPortalTarget, menuPosition, styles }, ref) => {
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
      const selected = customers.find((c) => String(c.id) === String(value));
      if (selected) setQuery(selected.name);
    }, [value, customers]);

    const filtered = customers.filter((c) =>
      c.name.toLowerCase().includes(query.toLowerCase())
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

    const handleSelect = (customer) => {
      setQuery(customer.name);
      onChange?.(customer.id);
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

    // Merge custom styles
    const getStyles = () => {
      const baseStyles = {
        control: {
          minHeight: '38px',
          borderRadius: '0.5rem',
          border: '1px solid rgb(229 231 235)',
          backgroundColor: 'white',
          fontSize: '14px',
        },
        menuPortal: {
          zIndex: 9999,
        },
      };

      if (styles) {
        if (styles.control) {
          baseStyles.control = { ...baseStyles.control, ...styles.control };
        }
        if (styles.menuPortal) {
          baseStyles.menuPortal = { ...baseStyles.menuPortal, ...styles.menuPortal };
        }
      }

      return baseStyles;
    };

    const customStyles = getStyles();

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
          style={customStyles.control}
          className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-hidden focus:ring-2 focus:ring-blue-400/40 dark:focus:ring-indigo-400/40"
          placeholder="Search customer..."
        />
        {showDropdown && filtered.length > 0 && createPortal(
          <div
            className="fixed max-h-60 overflow-auto border bg-white dark:bg-slate-800 shadow-xl react-select__menu-portal text-sm rounded-lg border-gray-200 dark:border-slate-600"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
              ...customStyles.menuPortal,
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <ul>
              {filtered.map((c, idx) => (
                <li
                  key={c.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelect(c);
                  }}
                  className={`px-3 py-2 cursor-pointer ${
                    idx === highlightIndex ? "bg-blue-100 dark:bg-slate-600" : "hover:bg-gray-100 dark:hover:bg-slate-700"
                  }`}
                >
                  <span className="text-gray-900 dark:text-gray-100 font-medium">{c.name}</span>
                </li>
              ))}
            </ul>
          </div>,
          menuPortalTarget || document.body
        )}
      </div>
    );

  }
);

export default CustomerSearchInput;

