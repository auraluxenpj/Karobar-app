import { useState, useRef, useMemo } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import Select from "react-select";
import { useTheme } from "@/context/ThemeContext.jsx";
import {
  CircleStackIcon,
  ShieldCheckIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  AdjustmentsHorizontalIcon,
  TableCellsIcon,
  ArrowPathIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SparklesIcon,
  LockClosedIcon,
  FolderOpenIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
} from "@heroicons/react/24/solid";

const CONFLICT_POLICY_OPTIONS = [
  {
    value: "upsert",
    label: "Update existing records with imported values (Upsert)",
  },
  {
    value: "skip",
    label: "Keep existing records unchanged and skip duplicates",
  },
];

const TABLE_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Source Tables" },
  { value: "enabled", label: "Selected / Enabled Only" },
  { value: "unmapped", label: "Unmapped Tables Only" },
  { value: "drift", label: "Tables with Synthesized Columns" },
];

export default function SqliteImportSetting({
  themeColors,
  unlockToken,
  onSoftwareAdminLocked,
}) {
  const { isDark, theme } = useTheme();
  const fileInputRef = useRef(null);
  const confirmDialogRef = useRef(null);

  const getSwAdminHeaders = (extra = {}) => {
    let token = unlockToken || "";
    if (!token && typeof sessionStorage !== "undefined") {
      try {
        token = sessionStorage.getItem("karobar_sw_admin_sqlite_token") || "";
      } catch {
        token = "";
      }
    }
    return {
      ...(token ? { "X-Software-Admin-Token": token } : {}),
      ...extra,
    };
  };

  const handleLockedResponse = (err) => {
    if (
      err?.response?.status === 403 &&
      err?.response?.data?.software_admin_locked &&
      typeof onSoftwareAdminLocked === "function"
    ) {
      onSoftwareAdminLocked(
        err?.response?.data?.message ||
          "Software Admin authorization required."
      );
      return true;
    }
    return false;
  };

  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Inspection session state returned from /api/settings/sqlite-import/upload
  const [session, setSession] = useState(null);
  // Editable table configs keyed by source_table
  const [tableConfigs, setTableConfigs] = useState({});
  // Currently expanded source_table for column mapping & sample preview
  const [expandedTable, setExpandedTable] = useState(null);
  const [previewLoadingTable, setPreviewLoadingTable] = useState(null);
  const [tableSearch, setTableSearch] = useState("");
  const [tableStatusFilter, setTableStatusFilter] = useState("all");
  const [showProtectedDetails, setShowProtectedDetails] = useState(false);

  // Import execution options
  const [importOptions, setImportOptions] = useState({
    mode: "merge", // 'merge' | 'replace'
    conflict_policy: "upsert", // 'upsert' | 'skip'
    create_backup: true,
    reconcile_batches: true,
  });

  // Password confirmation state inside native <dialog>
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Completed import report
  const [importResult, setImportResult] = useState(null);

  const primaryColor =
    themeColors?.primary || theme?.primary_color || "#2563eb";

  const portalTarget =
    typeof document !== "undefined" ? document.body : null;

  // React-Select custom styles matching theme & dark mode
  const selectStyles = useMemo(
    () => ({
      control: (base, state) => ({
        ...base,
        minHeight: "36px",
        borderRadius: "0.75rem",
        backgroundColor: isDark ? "rgba(30, 41, 59, 0.9)" : "#ffffff",
        borderColor: state.isFocused
          ? primaryColor
          : isDark
          ? "rgba(71, 85, 105, 0.85)"
          : "rgba(209, 213, 219, 0.9)",
        boxShadow: state.isFocused ? `0 0 0 2px ${primaryColor}33` : "none",
        fontSize: "0.75rem",
        color: isDark ? "#f8fafc" : "#0f172a",
        cursor: "pointer",
        transition: "all 0.15s ease",
        "&:hover": {
          borderColor: primaryColor,
        },
      }),
      valueContainer: (base) => ({
        ...base,
        padding: "0 10px",
      }),
      input: (base) => ({
        ...base,
        color: isDark ? "#f8fafc" : "#0f172a",
        margin: 0,
        padding: 0,
      }),
      placeholder: (base) => ({
        ...base,
        color: isDark ? "rgba(148, 163, 184, 0.75)" : "rgba(107, 114, 128, 0.85)",
        fontSize: "0.75rem",
      }),
      singleValue: (base) => ({
        ...base,
        color: isDark ? "#f8fafc" : "#0f172a",
        fontSize: "0.75rem",
        fontWeight: "600",
      }),
      clearIndicator: (base) => ({
        ...base,
        padding: "4px",
        color: isDark ? "rgba(148, 163, 184, 0.75)" : "rgba(107, 114, 128, 0.8)",
        "&:hover": {
          color: "#ef4444",
        },
      }),
      dropdownIndicator: (base) => ({
        ...base,
        padding: "4px 8px",
        color: isDark ? "rgba(148, 163, 184, 0.75)" : "rgba(107, 114, 128, 0.8)",
      }),
      indicatorSeparator: () => ({ display: "none" }),
      menuPortal: (base) => ({ ...base, zIndex: 99999 }),
      menu: (base) => ({
        ...base,
        backgroundColor: isDark ? "rgba(15, 23, 42, 0.98)" : "#ffffff",
        border: isDark
          ? "1px solid rgba(51, 65, 85, 0.85)"
          : "1px solid rgba(226, 232, 240, 0.95)",
        boxShadow:
          "0 12px 28px -5px rgba(0, 0, 0, 0.28), 0 8px 12px -6px rgba(0, 0, 0, 0.22)",
        borderRadius: "0.75rem",
        overflow: "hidden",
      }),
      option: (base, state) => ({
        ...base,
        backgroundColor: state.isSelected
          ? primaryColor
          : state.isFocused
          ? isDark
            ? "rgba(51, 65, 85, 0.75)"
            : "rgba(239, 246, 255, 1)"
          : "transparent",
        color: state.isSelected ? "#ffffff" : isDark ? "#f8fafc" : "#0f172a",
        fontSize: "0.75rem",
        cursor: "pointer",
        padding: "8px 12px",
        transition: "background-color 0.1s ease",
      }),
    }),
    [isDark, primaryColor]
  );

  // Target Table Options for React-Select
  const targetTableOptions = useMemo(() => {
    const baseOpts = [{ value: "", label: "-- Do Not Import --" }];
    (session?.available_target_tables || []).forEach((tOpt) => {
      baseOpts.push({
        value: tOpt.table,
        label: `${tOpt.table} (Stage ${tOpt.stage})`,
      });
    });
    return baseOpts;
  }, [session?.available_target_tables]);

  const initializeSessionState = (data) => {
    setSession(data);
    setImportResult(null);
    setExpandedTable(null);

    const initialConfigs = {};
    (data.importable_tables || []).forEach((tbl) => {
      const colMap = {};
      const defaultsMap = {};
      (tbl.column_mappings || []).forEach((cm) => {
        colMap[cm.target_column] = cm.source_column || "";
        if (cm.static_value !== undefined && cm.static_value !== null) {
          defaultsMap[cm.target_column] = String(cm.static_value);
        }
      });

      initialConfigs[tbl.source_table] = {
        source_table: tbl.source_table,
        target_table: tbl.target_table || "",
        enabled: Boolean(tbl.enabled && tbl.target_table),
        row_count: tbl.row_count || 0,
        match_type: tbl.match_type || "unmapped",
        confidence: tbl.confidence || 0,
        stage: tbl.stage ?? 6,
        source_columns: tbl.source_columns || [],
        column_mappings: tbl.column_mappings || [],
        unmapped_source_columns: tbl.unmapped_source_columns || [],
        sample_rows: tbl.sample_rows || [],
        stats: tbl.stats || {},
        columns: colMap,
        defaults: defaultsMap,
      };
    });

    setTableConfigs(initialConfigs);
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("database_file", file);
      const { data } = await axios.post("/api/settings/sqlite-import/upload", fd, {
        headers: getSwAdminHeaders({ "Content-Type": "multipart/form-data" }),
      });
      initializeSessionState(data);
      toast.success(data.message || "Database analyzed successfully.");
    } catch (err) {
      if (handleLockedResponse(err)) return;
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.errors?.database_file?.[0] ||
        "Failed to inspect SQLite database file.";
      toast.error(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDesktopSelectFile = async () => {
    if (!window.karobarDesktop?.selectSqliteFile) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const res = await window.karobarDesktop.selectSqliteFile();
      if (res?.canceled || !res?.filePath) return;

      setUploading(true);
      setImportResult(null);
      const { data } = await axios.post(
        "/api/settings/sqlite-import/upload",
        {
          local_file_path: res.filePath,
        },
        {
          headers: getSwAdminHeaders(),
        }
      );
      initializeSessionState(data);
      toast.success(data.message || "Database analyzed successfully.");
    } catch (err) {
      if (handleLockedResponse(err)) return;
      const msg =
        err?.response?.data?.message ||
        "Failed to inspect selected SQLite database file.";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleCancelSession = async () => {
    if (session?.session_token) {
      try {
        await axios.delete(`/api/settings/sqlite-import/${session.session_token}`, {
          headers: getSwAdminHeaders(),
        });
      } catch {
        // Ignore cleanup errors
      }
    }
    setSession(null);
    setTableConfigs({});
    setExpandedTable(null);
    setImportResult(null);
  };

  const handleToggleTable = (sourceTable, enabled) => {
    setTableConfigs((prev) => {
      const current = prev[sourceTable];
      if (!current) return prev;
      return {
        ...prev,
        [sourceTable]: {
          ...current,
          enabled: Boolean(enabled && current.target_table),
        },
      };
    });
  };

  const handleTargetTableChange = async (sourceTable, newTargetTable) => {
    if (!session?.session_token) return;

    if (!newTargetTable) {
      setTableConfigs((prev) => ({
        ...prev,
        [sourceTable]: {
          ...prev[sourceTable],
          target_table: "",
          enabled: false,
          match_type: "unmapped",
          column_mappings: [],
          sample_rows: [],
        },
      }));
      return;
    }

    setPreviewLoadingTable(sourceTable);
    try {
      const { data } = await axios.post(
        "/api/settings/sqlite-import/preview-table",
        {
          session_token: session.session_token,
          source_table: sourceTable,
          target_table: newTargetTable,
        },
        {
          headers: getSwAdminHeaders(),
        }
      );

      const colMap = {};
      const defaultsMap = {};
      (data.column_mappings || []).forEach((cm) => {
        colMap[cm.target_column] = cm.source_column || "";
        if (cm.static_value !== undefined && cm.static_value !== null) {
          defaultsMap[cm.target_column] = String(cm.static_value);
        }
      });

      setTableConfigs((prev) => ({
        ...prev,
        [sourceTable]: {
          ...prev[sourceTable],
          target_table: newTargetTable,
          enabled: true,
          match_type:
            sourceTable.toLowerCase() === newTargetTable.toLowerCase()
              ? "exact"
              : "manual",
          confidence: 100,
          column_mappings: data.column_mappings || [],
          unmapped_source_columns: data.unmapped_source_columns || [],
          sample_rows: data.sample_rows || [],
          stats: data.stats || {},
          columns: colMap,
          defaults: defaultsMap,
        },
      }));

      setExpandedTable(sourceTable);
      toast.success(`Mapped "${sourceTable}" → "${newTargetTable}"`);
    } catch (err) {
      if (handleLockedResponse(err)) return;
      toast.error(
        err?.response?.data?.message || "Failed to preview target table mapping."
      );
    } finally {
      setPreviewLoadingTable(null);
    }
  };

  const handleColumnSourceChange = (sourceTable, targetCol, newSourceCol) => {
    setTableConfigs((prev) => {
      const tbl = prev[sourceTable];
      if (!tbl) return prev;
      return {
        ...prev,
        [sourceTable]: {
          ...tbl,
          columns: {
            ...tbl.columns,
            [targetCol]: newSourceCol,
          },
        },
      };
    });
  };

  const handleColumnDefaultChange = (sourceTable, targetCol, fallbackVal) => {
    setTableConfigs((prev) => {
      const tbl = prev[sourceTable];
      if (!tbl) return prev;
      return {
        ...prev,
        [sourceTable]: {
          ...tbl,
          defaults: {
            ...tbl.defaults,
            [targetCol]: fallbackVal,
          },
        },
      };
    });
  };

  const handleRefreshTablePreview = async (sourceTable) => {
    const tbl = tableConfigs[sourceTable];
    if (!tbl || !tbl.target_table || !session?.session_token) return;

    setPreviewLoadingTable(sourceTable);
    try {
      const cleanDefaults = {};
      Object.entries(tbl.defaults || {}).forEach(([k, v]) => {
        if (v !== "" && v !== undefined && v !== null) {
          cleanDefaults[k] = v;
        }
      });

      const { data } = await axios.post(
        "/api/settings/sqlite-import/preview-table",
        {
          session_token: session.session_token,
          source_table: sourceTable,
          target_table: tbl.target_table,
          custom_columns: tbl.columns,
          custom_defaults: cleanDefaults,
        },
        {
          headers: getSwAdminHeaders(),
        }
      );

      setTableConfigs((prev) => ({
        ...prev,
        [sourceTable]: {
          ...prev[sourceTable],
          column_mappings: data.column_mappings || [],
          unmapped_source_columns: data.unmapped_source_columns || [],
          sample_rows: data.sample_rows || [],
          stats: data.stats || {},
        },
      }));
      toast.success(`Updated synthesized preview for "${sourceTable}"`);
    } catch (err) {
      if (handleLockedResponse(err)) return;
      toast.error(
        err?.response?.data?.message || "Failed to refresh table preview."
      );
    } finally {
      setPreviewLoadingTable(null);
    }
  };

  const enabledTablesList = useMemo(() => {
    return Object.values(tableConfigs).filter(
      (t) => t.enabled && t.target_table
    );
  }, [tableConfigs]);

  const totalRowsToImport = useMemo(() => {
    return enabledTablesList.reduce((acc, t) => acc + (t.row_count || 0), 0);
  }, [enabledTablesList]);

  const filteredTables = useMemo(() => {
    let list = Object.values(tableConfigs);

    if (tableStatusFilter === "enabled") {
      list = list.filter((t) => t.enabled && t.target_table);
    } else if (tableStatusFilter === "unmapped") {
      list = list.filter((t) => !t.target_table);
    } else if (tableStatusFilter === "drift") {
      list = list.filter((t) =>
        (t.column_mappings || []).some(
          (cm) => !t.columns?.[cm.target_column] && cm.required
        )
      );
    }

    const q = tableSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (t) =>
        t.source_table.toLowerCase().includes(q) ||
        (t.target_table || "").toLowerCase().includes(q)
    );
  }, [tableConfigs, tableSearch, tableStatusFilter]);

  const openConfirmModal = () => {
    if (enabledTablesList.length === 0) {
      toast.error("Please enable at least one table to import.");
      return;
    }
    setPassword("");
    setPasswordError("");
    if (confirmDialogRef.current && !confirmDialogRef.current.open) {
      confirmDialogRef.current.showModal();
    }
  };

  const closeConfirmModal = () => {
    if (confirmDialogRef.current && confirmDialogRef.current.open) {
      confirmDialogRef.current.close();
    }
  };

  const handleExecuteImport = async (e) => {
    e.preventDefault();
    if (importOptions.mode === "replace" && !password.trim()) {
      setPasswordError("Please enter your current account password to authorize Replace mode import.");
      return;
    }

    setCommitting(true);
    setPasswordError("");
    try {
      const payloadTables = {};
      Object.values(tableConfigs).forEach((tbl) => {
        const cleanDefaults = {};
        Object.entries(tbl.defaults || {}).forEach(([k, v]) => {
          if (v !== "" && v !== undefined && v !== null) {
            cleanDefaults[k] = v;
          }
        });

        payloadTables[tbl.source_table] = {
          enabled: Boolean(tbl.enabled && tbl.target_table),
          target_table: tbl.target_table,
          columns: tbl.columns || {},
          defaults: cleanDefaults,
        };
      });

      const { data } = await axios.post(
        "/api/settings/sqlite-import/commit",
        {
          session_token: session.session_token,
          password,
          options: {
            ...importOptions,
            tables: payloadTables,
          },
        },
        {
          headers: getSwAdminHeaders(),
        }
      );

      closeConfirmModal();
      setImportResult(data);
      setSession(null);
      toast.success(data.message || "Database imported successfully!");
      window.dispatchEvent(new CustomEvent("settingsChanged"));
    } catch (err) {
      if (handleLockedResponse(err)) {
        closeConfirmModal();
        return;
      }
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.errors?.password?.[0] ||
        "Database import failed.";
      setPasswordError(msg);
      toast.error(msg);
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="w-full max-w-none space-y-5">
      {/* ===== Top Security & Architecture Banner ===== */}
      <div
        className={`rounded-2xl border p-4 sm:p-5 ${
          isDark
            ? "bg-slate-800/80 border-slate-700/80 text-slate-100"
            : "bg-white/95 border-gray-200/80 text-gray-900"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className="p-2.5 rounded-xl shrink-0 mt-0.5"
              style={{
                backgroundColor: isDark
                  ? "rgba(16, 185, 129, 0.16)"
                  : "#d1fae5",
                color: "#059669",
              }}
            >
              <ShieldCheckIcon className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold">
                  Intelligent SQLite Database Import &amp; Schema Adapter
                </h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                  <LockClosedIcon className="w-3 h-3" />
                  Users &amp; License Protected
                </span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-300 leading-relaxed">
                Import legacy Karobar databases or external SQLite files even when tables have{" "}
                <strong>missing columns</strong>, <strong>renamed/aliased columns</strong>, or{" "}
                <strong>different table structures</strong>. The{" "}
                <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 font-mono text-xs">
                  users
                </code>{" "}
                and{" "}
                <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 font-mono text-xs">
                  licenses
                </code>{" "}
                tables (along with roles, permissions, and active sessions) are strictly isolated and{" "}
                <strong>never overwritten</strong>.
              </p>
            </div>
          </div>

          {session && (
            <button
              type="button"
              onClick={handleCancelSession}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition shrink-0 self-start cursor-pointer"
            >
              <TrashIcon className="w-4 h-4" />
              <span>Discard Staged File</span>
            </button>
          )}
        </div>
      </div>

      {/* ===== Step 1: Upload / Select SQLite File (when no active session) ===== */}
      {!session && !importResult && (
        <div
          className={`rounded-2xl border p-6 sm:p-10 text-center transition-all ${
            dragActive
              ? "border-blue-500 bg-blue-50/40 dark:bg-blue-950/20"
              : isDark
              ? "bg-slate-800/70 border-slate-700/80"
              : "bg-white/90 border-gray-200/80"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragActive(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragActive(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleFileUpload(e.dataTransfer.files[0]);
            }
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".sqlite,.sqlite3,.db,.db3,.zip,.gz,.sql"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) {
                handleFileUpload(e.target.files[0]);
              }
            }}
          />

          <div
            className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{
              backgroundColor: isDark
                ? "rgba(59, 130, 246, 0.16)"
                : themeColors?.primaryLight || "#dbeafe",
              color: primaryColor,
            }}
          >
            {uploading ? (
              <ArrowPathIcon className="w-7 h-7 animate-spin" />
            ) : (
              <CircleStackIcon className="w-7 h-7" />
            )}
          </div>

          <h4 className="text-base sm:text-lg font-bold text-gray-900 dark:text-slate-100">
            {uploading
              ? "Inspecting Database Schema & Synthesizing Column Mappings…"
              : "Select or Drag & Drop an SQLite Database File"}
          </h4>
          <p className="mt-1.5 text-xs sm:text-sm text-gray-500 dark:text-slate-400 max-w-2xl mx-auto">
            Supports raw SQLite databases (<code>.sqlite</code>, <code>.sqlite3</code>,{" "}
            <code>.db</code>, <code>.db3</code>), compressed backup archives (<code>.zip</code>,{" "}
            <code>.sql.gz</code>), and SQL dumps (<code>.sql</code>).
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm transition cursor-pointer disabled:opacity-60"
              style={{ backgroundColor: primaryColor }}
            >
              <ArrowUpTrayIcon className="w-4 h-4" />
              <span>{uploading ? "Analyzing Database…" : "Choose Database File"}</span>
            </button>

            {typeof window !== "undefined" &&
              window.karobarDesktop?.selectSqliteFile && (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={handleDesktopSelectFile}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition cursor-pointer disabled:opacity-60 ${
                    isDark
                      ? "bg-slate-700/80 border-slate-600 text-slate-100 hover:bg-slate-700"
                      : "bg-gray-50 border-gray-300 text-gray-800 hover:bg-gray-100"
                  }`}
                >
                  <FolderOpenIcon className="w-4 h-4" />
                  <span>Browse Local Disk (Desktop)</span>
                </button>
              )}
          </div>

          <div className="mt-8 pt-6 border-t border-gray-200/70 dark:border-slate-700/70 grid grid-cols-1 md:grid-cols-3 gap-4 text-left max-w-5xl mx-auto">
            <div className="p-4 rounded-xl bg-gray-50/80 dark:bg-slate-900/50 border border-gray-200/60 dark:border-slate-700/60">
              <div className="text-xs font-bold text-gray-800 dark:text-slate-200 flex items-center gap-1.5">
                <SparklesIcon className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Smart Missing-Column Synthesis</span>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                Automatically generates missing barcodes, product codes, pack sizes, margins, and opening stock batches.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-gray-50/80 dark:bg-slate-900/50 border border-gray-200/60 dark:border-slate-700/60">
              <div className="text-xs font-bold text-gray-800 dark:text-slate-200 flex items-center gap-1.5">
                <AdjustmentsHorizontalIcon className="w-4 h-4 text-blue-500 shrink-0" />
                <span>Interactive Column Mapper</span>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                Map any legacy table or custom column name to Karobar v2 columns and preview live synthesized rows.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-gray-50/80 dark:bg-slate-900/50 border border-gray-200/60 dark:border-slate-700/60">
              <div className="text-xs font-bold text-gray-800 dark:text-slate-200 flex items-center gap-1.5">
                <ShieldCheckIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Pre-Import Safety Snapshot</span>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                Creates a full backup of your current database before importing and runs inside an atomic transaction.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ===== Step 2 & 3: Active Schema Inspection & Mapping Workspace ===== */}
      {session && (
        <div className="space-y-5">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div
              className={`p-4 rounded-2xl border ${
                isDark
                  ? "bg-slate-800/70 border-slate-700/80"
                  : "bg-white/90 border-gray-200/80"
              }`}
            >
              <div className="text-xs font-medium text-gray-500 dark:text-slate-400">
                Source File
              </div>
              <div
                className="mt-1 text-sm sm:text-base font-bold truncate"
                title={session.file_name}
              >
                {session.file_name}
              </div>
              <div className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">
                {session.summary?.total_source_tables || 0} total tables detected
              </div>
            </div>

            <div
              className={`p-4 rounded-2xl border ${
                isDark
                  ? "bg-slate-800/70 border-slate-700/80"
                  : "bg-white/90 border-gray-200/80"
              }`}
            >
              <div className="text-xs font-medium text-gray-500 dark:text-slate-400">
                Selected to Import
              </div>
              <div className="mt-1 text-lg sm:text-xl font-extrabold text-blue-600 dark:text-blue-400">
                {enabledTablesList.length} Tables
              </div>
              <div className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">
                {totalRowsToImport.toLocaleString()} total records queued
              </div>
            </div>

            <div
              className={`p-4 rounded-2xl border ${
                isDark
                  ? "bg-slate-800/70 border-slate-700/80"
                  : "bg-white/90 border-gray-200/80"
              }`}
            >
              <div className="text-xs font-medium text-gray-500 dark:text-slate-400">
                Protected &amp; Skipped
              </div>
              <div className="mt-1 text-lg sm:text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                {session.protected_tables?.length || 0} Tables
              </div>
              <div className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">
                Includes <code className="font-mono">users</code> &amp;{" "}
                <code className="font-mono">licenses</code>
              </div>
            </div>

            <div
              className={`p-4 rounded-2xl border ${
                isDark
                  ? "bg-slate-800/70 border-slate-700/80"
                  : "bg-white/90 border-gray-200/80"
              }`}
            >
              <div className="text-xs font-medium text-gray-500 dark:text-slate-400">
                User FK Remapping
              </div>
              <div className="mt-1 text-sm sm:text-base font-bold text-amber-600 dark:text-amber-400">
                {session.user_remapping?.source_users_count || 0} Legacy Users
              </div>
              <div className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">
                Auto-mapped to active accounts
              </div>
            </div>
          </div>

          {/* Import Strategy & Safety Configuration */}
          <div
            className={`rounded-2xl border p-4 sm:p-5 space-y-4 ${
              isDark
                ? "bg-slate-800/70 border-slate-700/80"
                : "bg-white/90 border-gray-200/80"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <AdjustmentsHorizontalIcon className="w-4 h-4 text-blue-500" />
                <span>Import Strategy &amp; Safety Controls</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowProtectedDetails((v) => !v)}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <ShieldCheckIcon className="w-3.5 h-3.5" />
                <span>
                  {showProtectedDetails
                    ? "Hide Protected Tables & User Remapping"
                    : "View Protected Tables & User Remapping"}
                </span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Mode Selection */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300">
                  Import Mode
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      setImportOptions((o) => ({ ...o, mode: "merge" }))
                    }
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      importOptions.mode === "merge"
                        ? "border-blue-500 bg-blue-50/60 dark:bg-blue-950/30 ring-1 ring-blue-500/40"
                        : isDark
                        ? "border-slate-700 bg-slate-900/40 hover:bg-slate-900/70"
                        : "border-gray-200 bg-gray-50/60 hover:bg-gray-100/70"
                    }`}
                  >
                    <div className="text-xs font-bold flex items-center justify-between">
                      <span>Smart Merge (Recommended)</span>
                      {importOptions.mode === "merge" && (
                        <CheckCircleIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">
                      Preserves current records, deduplicates by natural keys, and translates foreign key IDs across tables.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setImportOptions((o) => ({ ...o, mode: "replace" }))
                    }
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      importOptions.mode === "replace"
                        ? "border-amber-500 bg-amber-50/60 dark:bg-amber-950/30 ring-1 ring-amber-500/40"
                        : isDark
                        ? "border-slate-700 bg-slate-900/40 hover:bg-slate-900/70"
                        : "border-gray-200 bg-gray-50/60 hover:bg-gray-100/70"
                    }`}
                  >
                    <div className="text-xs font-bold flex items-center justify-between">
                      <span>Clean Replace</span>
                      {importOptions.mode === "replace" && (
                        <ExclamationTriangleIcon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">
                      Clears existing operational records in enabled tables first. Users &amp; licenses remain untouched.
                    </p>
                  </button>
                </div>
              </div>

              {/* Conflict Policy (React-Select) & Safety Checkboxes */}
              <div className="space-y-3">
                {importOptions.mode === "merge" && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                      Duplicate Record Policy (Smart Merge)
                    </label>
                    <Select
                      inputId="sqlite-conflict-policy"
                      options={CONFLICT_POLICY_OPTIONS}
                      value={
                        CONFLICT_POLICY_OPTIONS.find(
                          (opt) => opt.value === importOptions.conflict_policy
                        ) || CONFLICT_POLICY_OPTIONS[0]
                      }
                      onChange={(opt) =>
                        setImportOptions((o) => ({
                          ...o,
                          conflict_policy: opt?.value || "upsert",
                        }))
                      }
                      isSearchable={false}
                      styles={selectStyles}
                      menuPortalTarget={portalTarget}
                      menuPosition="fixed"
                    />
                  </div>
                )}

                <div className="space-y-2 pt-1">
                  <label className="flex items-start gap-2.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importOptions.create_backup}
                      onChange={(e) =>
                        setImportOptions((o) => ({
                          ...o,
                          create_backup: e.target.checked,
                        }))
                      }
                      className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>
                      <strong>Create automatic database safety backup</strong> before executing import
                    </span>
                  </label>

                  <label className="flex items-start gap-2.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importOptions.reconcile_batches}
                      onChange={(e) =>
                        setImportOptions((o) => ({
                          ...o,
                          reconcile_batches: e.target.checked,
                        }))
                      }
                      className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>
                      <strong>Synthesize opening stock batches</strong> for legacy products with stock quantity but no batch rows
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Expandable Protected Tables & User Remapping Details */}
            {showProtectedDetails && (
              <div className="pt-3 border-t border-gray-200/70 dark:border-slate-700/70 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                  <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                    <LockClosedIcon className="w-4 h-4" />
                    <span>Hard-Protected System Tables (Never Imported)</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(session.protected_tables || []).map((pt) => (
                      <span
                        key={pt.source_table}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border border-emerald-500/20"
                      >
                        <span>{pt.source_table}</span>
                        <span className="opacity-70">({pt.row_count})</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2">
                  <div className="text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                    <UserGroupIcon className="w-4 h-4" />
                    <span>Legacy User Foreign Key Remapping Preview</span>
                  </div>
                  <p className="text-[11px] text-gray-600 dark:text-slate-300">
                    Since <code className="font-mono">users</code> is skipped, historical{" "}
                    <code className="font-mono">user_id</code> columns on invoices are mapped by email/name or fallback to your current Admin account:
                  </p>
                  <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                    {(session.user_remapping?.preview || []).length === 0 ? (
                      <div className="text-[11px] text-gray-500">
                        No legacy user rows detected; all user_id references will map to your active user account.
                      </div>
                    ) : (
                      session.user_remapping.preview.map((u) => (
                        <div
                          key={u.old_user_id}
                          className="text-[11px] flex items-center justify-between gap-2 py-0.5 border-b border-amber-500/10 last:border-0"
                        >
                          <span className="truncate">
                            Old User #{u.old_user_id}: <strong>{u.old_name}</strong>{" "}
                            {u.old_email ? `(${u.old_email})` : ""}
                          </span>
                          <span className="shrink-0 font-mono text-amber-700 dark:text-amber-300">
                            → User #{u.mapped_to_user_id} ({u.strategy})
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Table Selection & Interactive Column Mapping List */}
          <div
            className={`rounded-2xl border p-4 sm:p-5 space-y-4 ${
              isDark
                ? "bg-slate-800/70 border-slate-700/80"
                : "bg-white/90 border-gray-200/80"
            }`}
          >
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <TableCellsIcon className="w-4 h-4 text-blue-500" />
                  <span>Source Tables &amp; Intelligent Column Mapping</span>
                </h4>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                  Toggle tables to import, reassign target tables using searchable dropdowns, or expand any table to customize column mappings &amp; defaults.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="w-52">
                  <Select
                    aria-label="Filter tables by status"
                    options={TABLE_STATUS_FILTER_OPTIONS}
                    value={
                      TABLE_STATUS_FILTER_OPTIONS.find(
                        (o) => o.value === tableStatusFilter
                      ) || TABLE_STATUS_FILTER_OPTIONS[0]
                    }
                    onChange={(opt) => setTableStatusFilter(opt?.value || "all")}
                    isSearchable={false}
                    styles={selectStyles}
                    menuPortalTarget={portalTarget}
                    menuPosition="fixed"
                  />
                </div>

                <div className="relative">
                  <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    placeholder="Search table name…"
                    className="h-9 pl-8 pr-3 rounded-xl text-xs border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setTableConfigs((prev) => {
                      const next = { ...prev };
                      Object.keys(next).forEach((k) => {
                        if (next[k].target_table && next[k].row_count > 0) {
                          next[k] = { ...next[k], enabled: true };
                        }
                      });
                      return next;
                    });
                  }}
                  className="h-9 px-3 rounded-xl text-xs font-semibold border border-gray-200 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Select All Matched
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTableConfigs((prev) => {
                      const next = { ...prev };
                      Object.keys(next).forEach((k) => {
                        next[k] = { ...next[k], enabled: false };
                      });
                      return next;
                    });
                  }}
                  className="h-9 px-3 rounded-xl text-xs font-semibold border border-gray-200 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* Table Cards */}
            <div className="space-y-2.5">
              {filteredTables.map((tbl) => {
                const isExpanded = expandedTable === tbl.source_table;
                const isRefreshing = previewLoadingTable === tbl.source_table;
                const mappedCount = Object.values(tbl.columns || {}).filter(
                  Boolean
                ).length;
                const synthesizedCount = (tbl.column_mappings || []).filter(
                  (cm) => !tbl.columns?.[cm.target_column] && cm.required
                ).length;

                const selectedTargetOption =
                  targetTableOptions.find(
                    (opt) => opt.value === (tbl.target_table || "")
                  ) || targetTableOptions[0];

                const sourceColumnOptions = [
                  { value: "", label: "-- Auto-Synthesize / Default --" },
                  ...(tbl.source_columns || []).map((sc) => ({
                    value: sc,
                    label: sc,
                  })),
                ];

                return (
                  <div
                    key={tbl.source_table}
                    className={`rounded-xl border transition ${
                      tbl.enabled
                        ? isDark
                          ? "border-slate-600 bg-slate-900/50"
                          : "border-blue-200/80 bg-blue-50/20"
                        : isDark
                        ? "border-slate-700/60 bg-slate-900/20 opacity-75"
                        : "border-gray-200/70 bg-gray-50/40 opacity-80"
                    }`}
                  >
                    {/* Table Row Header */}
                    <div className="p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={Boolean(tbl.enabled)}
                          disabled={!tbl.target_table}
                          onChange={(e) =>
                            handleToggleTable(tbl.source_table, e.target.checked)
                          }
                          aria-label={`Enable import for ${tbl.source_table}`}
                          className="mt-1 sm:mt-0 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs sm:text-sm font-bold text-gray-900 dark:text-slate-100">
                              {tbl.source_table}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-200/70 dark:bg-slate-700 text-gray-700 dark:text-slate-200">
                              {tbl.row_count.toLocaleString()} rows
                            </span>

                            {tbl.match_type === "exact" && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                Exact Schema Match
                              </span>
                            )}
                            {tbl.match_type === "alias" && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-400">
                                Intelligent Synonym Match
                              </span>
                            )}
                            {tbl.match_type === "manual" && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/15 text-purple-600 dark:text-purple-400">
                                Custom Target Mapped
                              </span>
                            )}
                            {!tbl.target_table && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                Unmapped Table (Select Target)
                              </span>
                            )}
                          </div>

                          {tbl.target_table && (
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-gray-500 dark:text-slate-400">
                              <span>
                                <strong>{mappedCount}</strong> columns mapped
                              </span>
                              {synthesizedCount > 0 && (
                                <span className="text-amber-600 dark:text-amber-400 font-medium">
                                  • <strong>{synthesizedCount}</strong> missing required columns auto-synthesized
                                </span>
                              )}
                              {(tbl.unmapped_source_columns || []).length > 0 && (
                                <span>
                                  • <strong>{tbl.unmapped_source_columns.length}</strong> extra legacy columns ignored
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Target Table React-Select + Expand Button */}
                      <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-gray-500 dark:text-slate-400">
                            Target Table:
                          </span>
                          <div className="w-64 sm:w-72">
                            <Select
                              aria-label={`Target table for ${tbl.source_table}`}
                              options={targetTableOptions}
                              value={selectedTargetOption}
                              onChange={(opt) =>
                                handleTargetTableChange(
                                  tbl.source_table,
                                  opt?.value || ""
                                )
                              }
                              isClearable={Boolean(tbl.target_table)}
                              isSearchable={true}
                              placeholder="-- Do Not Import --"
                              styles={selectStyles}
                              menuPortalTarget={portalTarget}
                              menuPosition="fixed"
                            />
                          </div>
                        </div>

                        {tbl.target_table && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedTable(
                                isExpanded ? null : tbl.source_table
                              )
                            }
                            className={`h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                              isExpanded
                                ? "bg-blue-600 text-white border-blue-600"
                                : isDark
                                ? "border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700"
                                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-100"
                            }`}
                          >
                            <span>
                              {isExpanded ? "Hide Mapper" : "Map Columns & Preview"}
                            </span>
                            {isExpanded ? (
                              <ChevronUpIcon className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDownIcon className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded Interactive Column Mapper & Synthesized Row Preview */}
                    {isExpanded && tbl.target_table && (
                      <div className="p-4 sm:p-5 border-t border-gray-200/70 dark:border-slate-700/70 space-y-4 bg-white/60 dark:bg-slate-900/60 rounded-b-xl">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h5
                              id={`col-map-heading-${tbl.source_table}`}
                              className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300"
                            >
                              Column Mapping &amp; Missing Value Synthesis ({tbl.source_table} → {tbl.target_table})
                            </h5>
                            <p className="text-[11px] text-gray-500 dark:text-slate-400">
                              Map source columns to target columns using searchable dropdowns or provide a custom fallback value when a column does not exist in the old database.
                            </p>
                          </div>

                          <button
                            type="button"
                            disabled={isRefreshing}
                            onClick={() =>
                              handleRefreshTablePreview(tbl.source_table)
                            }
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition cursor-pointer disabled:opacity-60"
                          >
                            <ArrowPathIcon
                              className={`w-3.5 h-3.5 ${
                                isRefreshing ? "animate-spin" : ""
                              }`}
                            />
                            <span>Refresh Synthesized Preview</span>
                          </button>
                        </div>

                        {/* Responsive Column Mapping Table */}
                        <div
                          tabIndex={0}
                          role="region"
                          aria-labelledby={`col-map-heading-${tbl.source_table}`}
                          className="sqlite-import-table-region border border-gray-200/80 dark:border-slate-700/80 max-h-[480px]"
                        >
                          <table className="sqlite-import-table sqlite-import-stackable text-xs">
                            <thead>
                              <tr className="border-b border-gray-200 dark:border-slate-700 text-left">
                                <th className="py-2.5 px-3 font-bold">
                                  Karobar v2 Column
                                </th>
                                <th className="py-2.5 px-3 font-bold min-w-[260px]">
                                  Source DB Column
                                </th>
                                <th className="py-2.5 px-3 font-bold">
                                  Resolution Strategy
                                </th>
                                <th className="py-2.5 px-3 font-bold">
                                  Fallback / Synthesized Rule
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200/60 dark:divide-slate-700/60">
                              {(tbl.column_mappings || []).map((cm) => {
                                const selectedSource =
                                  tbl.columns?.[cm.target_column] ?? "";
                                const customDefault =
                                  tbl.defaults?.[cm.target_column] ?? "";

                                const selectedSourceOpt =
                                  sourceColumnOptions.find(
                                    (o) => o.value === selectedSource
                                  ) || sourceColumnOptions[0];

                                return (
                                  <tr key={cm.target_column}>
                                    <th
                                      scope="row"
                                      className="py-2.5 px-3 font-mono font-semibold whitespace-nowrap"
                                    >
                                      <div className="flex items-center gap-1.5">
                                        <span>{cm.target_column}</span>
                                        {cm.required ? (
                                          <span className="px-1.5 py-0.2 rounded text-[9px] font-sans font-bold bg-red-500/15 text-red-600 dark:text-red-400">
                                            REQ
                                          </span>
                                        ) : (
                                          <span className="px-1.5 py-0.2 rounded text-[9px] font-sans text-gray-400">
                                            OPT
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[10px] font-sans font-normal text-gray-400">
                                        {cm.target_type || "TEXT"}
                                      </div>
                                    </th>

                                    <td
                                      data-label="Source DB Column"
                                      className="py-2 px-3 min-w-[260px]"
                                    >
                                      <div className="w-full max-w-[280px]">
                                        <Select
                                          aria-label={`Source column for ${cm.target_column}`}
                                          options={sourceColumnOptions}
                                          value={selectedSourceOpt}
                                          onChange={(opt) =>
                                            handleColumnSourceChange(
                                              tbl.source_table,
                                              cm.target_column,
                                              opt?.value || ""
                                            )
                                          }
                                          isClearable={Boolean(selectedSource)}
                                          isSearchable={true}
                                          placeholder="-- Auto-Synthesize / Default --"
                                          styles={selectStyles}
                                          menuPortalTarget={portalTarget}
                                          menuPosition="fixed"
                                        />
                                      </div>
                                    </td>

                                    <td
                                      data-label="Resolution Strategy"
                                      className="py-2 px-3 whitespace-nowrap"
                                    >
                                      {selectedSource ? (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                          Mapped ({cm.strategy})
                                        </span>
                                      ) : cm.required ? (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                          Smart Synthesis
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-gray-500/15 text-gray-600 dark:text-slate-400">
                                          Nullable / Default
                                        </span>
                                      )}
                                    </td>

                                    <td
                                      data-label="Fallback / Synthesized Rule"
                                      className="py-2 px-3"
                                    >
                                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                        <input
                                          type="text"
                                          value={customDefault}
                                          onChange={(e) =>
                                            handleColumnDefaultChange(
                                              tbl.source_table,
                                              cm.target_column,
                                              e.target.value
                                            )
                                          }
                                          placeholder={
                                            cm.fallback_description ||
                                            "Auto-synthesized"
                                          }
                                          className="h-8 px-2.5 rounded-lg text-xs border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 w-full sm:w-56"
                                        />
                                        <span
                                          className="text-[11px] text-gray-500 dark:text-slate-400 truncate max-w-[320px]"
                                          title={cm.fallback_description}
                                        >
                                          {cm.fallback_description}
                                        </span>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Unmapped Extra Source Columns Notice */}
                        {(tbl.unmapped_source_columns || []).length > 0 && (
                          <div className="p-2.5 rounded-xl bg-gray-100/80 dark:bg-slate-800/80 text-[11px] text-gray-600 dark:text-slate-300 flex flex-wrap items-center gap-1.5">
                            <InformationCircleIcon className="w-4 h-4 text-gray-400 shrink-0" />
                            <span>
                              Extra source columns not in <code className="font-mono">{tbl.target_table}</code> (safely ignored unless mapped above):
                            </span>
                            {tbl.unmapped_source_columns.map((uc) => (
                              <code
                                key={uc}
                                className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-700 font-mono text-[10px]"
                              >
                                {uc}
                              </code>
                            ))}
                          </div>
                        )}

                        {/* Live Synthesized Row Preview */}
                        {(tbl.sample_rows || []).length > 0 && (
                          <div className="space-y-1.5">
                            <h6
                              id={`sample-preview-heading-${tbl.source_table}`}
                              className="text-xs font-bold text-gray-700 dark:text-slate-300"
                            >
                              Live Synthesized Row Preview (First{" "}
                              {tbl.sample_rows.length} Rows Ready for{" "}
                              <code className="font-mono">{tbl.target_table}</code>)
                            </h6>
                            <div
                              tabIndex={0}
                              role="region"
                              aria-labelledby={`sample-preview-heading-${tbl.source_table}`}
                              className="sqlite-import-table-region border border-gray-200/80 dark:border-slate-700/80"
                            >
                              <table className="sqlite-import-table text-[11px]">
                                <thead>
                                  <tr className="border-b border-gray-200 dark:border-slate-700 text-left">
                                    {Object.keys(tbl.sample_rows[0] || {}).map(
                                      (colKey) => (
                                        <th
                                          key={colKey}
                                          className="py-2 px-2.5 font-mono font-semibold whitespace-nowrap"
                                        >
                                          {colKey}
                                        </th>
                                      )
                                    )}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200/60 dark:divide-slate-700/60">
                                  {tbl.sample_rows.map((row, idx) => (
                                    <tr key={idx}>
                                      {Object.entries(row).map(([k, val], cIdx) =>
                                        cIdx === 0 ? (
                                          <th
                                            key={k}
                                            scope="row"
                                            className="py-1.5 px-2.5 font-mono whitespace-nowrap"
                                          >
                                            {val === null || val === undefined
                                              ? "NULL"
                                              : String(val)}
                                          </th>
                                        ) : (
                                          <td
                                            key={k}
                                            className="py-1.5 px-2.5 font-mono whitespace-nowrap max-w-[200px] truncate"
                                            title={
                                              val !== null && val !== undefined
                                                ? String(val)
                                                : "NULL"
                                            }
                                          >
                                            {val === null || val === undefined ? (
                                              <span className="text-gray-400 italic">
                                                null
                                              </span>
                                            ) : (
                                              String(val)
                                            )}
                                          </td>
                                        )
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom Action Bar */}
            <div className="pt-4 border-t border-gray-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-gray-600 dark:text-slate-300">
                Ready to import{" "}
                <strong>{enabledTablesList.length} tables</strong> (
                <strong>{totalRowsToImport.toLocaleString()} rows</strong>) in{" "}
                <strong className="uppercase">{importOptions.mode}</strong> mode.
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleCancelSession}
                  className="px-4 py-2 rounded-xl text-xs font-semibold border border-gray-300 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={openConfirmModal}
                  disabled={enabledTablesList.length === 0}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white shadow-sm transition cursor-pointer disabled:opacity-50"
                  style={{ backgroundColor: primaryColor }}
                >
                  <CircleStackIcon className="w-4 h-4" />
                  <span>Execute Database Import…</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Step 4: Post-Import Detailed Audit Report ===== */}
      {importResult && (
        <div
          className={`rounded-2xl border p-5 sm:p-6 space-y-5 ${
            isDark
              ? "bg-slate-800/80 border-emerald-500/40"
              : "bg-white/95 border-emerald-500/40"
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                <CheckCircleIcon className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-base sm:text-lg font-bold text-gray-900 dark:text-slate-100">
                  {importResult.message || "SQLite Database Import Completed"}
                </h4>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                  All selected tables were migrated in topological order while keeping{" "}
                  <code className="font-mono">users</code> and{" "}
                  <code className="font-mono">licenses</code> strictly protected.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setImportResult(null)}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition shrink-0 self-start cursor-pointer"
            >
              Import Another Database
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                Rows Inserted
              </div>
              <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-0.5">
                {(importResult.stats?.total_inserted || 0).toLocaleString()}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <div className="text-[11px] text-blue-700 dark:text-blue-300 font-medium">
                Rows Updated
              </div>
              <div className="text-xl font-extrabold text-blue-700 dark:text-blue-300 mt-0.5">
                {(importResult.stats?.total_updated || 0).toLocaleString()}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <div className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                Opening Batches Synthesized
              </div>
              <div className="text-xl font-extrabold text-amber-700 dark:text-amber-300 mt-0.5">
                {(
                  importResult.stats?.reconciliation
                    ?.opening_batches_created || 0
                ).toLocaleString()}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <div className="text-[11px] text-purple-700 dark:text-purple-300 font-medium">
                Safety Backup Created
              </div>
              <div
                className="text-xs font-mono font-bold text-purple-700 dark:text-purple-300 mt-1 truncate"
                title={importResult.stats?.safety_backup || "None"}
              >
                {importResult.stats?.safety_backup || "Skipped"}
              </div>
            </div>
          </div>

          {/* Per-Table Breakdown Table */}
          {importResult.stats?.tables && (
            <div className="space-y-2">
              <h5
                id="import-audit-table-heading"
                className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-slate-300"
              >
                Per-Table Import Audit Breakdown
              </h5>
              <div
                tabIndex={0}
                role="region"
                aria-labelledby="import-audit-table-heading"
                className="sqlite-import-table-region border border-gray-200 dark:border-slate-700"
              >
                <table className="sqlite-import-table sqlite-import-stackable text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-700 text-left">
                      <th className="py-2.5 px-3 font-bold">Source Table</th>
                      <th className="py-2.5 px-3 font-bold">Target Table</th>
                      <th className="py-2.5 px-3 font-bold">Source Rows</th>
                      <th className="py-2.5 px-3 font-bold">Inserted</th>
                      <th className="py-2.5 px-3 font-bold">Updated</th>
                      <th className="py-2.5 px-3 font-bold">Skipped</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200/60 dark:divide-slate-700/60">
                    {Object.entries(importResult.stats.tables).map(
                      ([srcTbl, st]) => (
                        <tr key={srcTbl}>
                          <th
                            scope="row"
                            className="py-2 px-3 font-mono font-semibold"
                          >
                            {srcTbl}
                          </th>
                          <td
                            data-label="Target Table"
                            className="py-2 px-3 font-mono"
                          >
                            {st.target_table}
                          </td>
                          <td data-label="Source Rows" className="py-2 px-3">
                            {(st.source_rows || 0).toLocaleString()}
                          </td>
                          <td
                            data-label="Inserted"
                            className="py-2 px-3 font-semibold text-emerald-600 dark:text-emerald-400"
                          >
                            {(st.inserted || 0).toLocaleString()}
                          </td>
                          <td
                            data-label="Updated"
                            className="py-2 px-3 font-semibold text-blue-600 dark:text-blue-400"
                          >
                            {(st.updated || 0).toLocaleString()}
                          </td>
                          <td data-label="Skipped" className="py-2 px-3">
                            {(st.skipped || 0).toLocaleString()}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== Native <dialog> Password Authorization Modal ===== */}
      <dialog
        ref={confirmDialogRef}
        aria-labelledby="sqlite-import-confirm-title"
        className="sqlite-import-dialog"
        onClick={(e) => {
          if (e.target === confirmDialogRef.current && !committing) {
            closeConfirmModal();
          }
        }}
      >
        <form onSubmit={handleExecuteImport} className="p-5 sm:p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 shrink-0">
              <LockClosedIcon className="w-6 h-6" />
            </div>
            <div>
              <h3
                id="sqlite-import-confirm-title"
                className="text-base font-bold"
              >
                Confirm SQLite Database Import
              </h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                Ready to import{" "}
                <strong>{enabledTablesList.length} tables</strong> (
                <strong>{totalRowsToImport.toLocaleString()} rows</strong>).
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-gray-100/80 dark:bg-slate-800/80 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400">Import Mode:</span>
              <strong className="uppercase">{importOptions.mode}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400">
                Protected Tables Skipped:
              </span>
              <strong className="text-emerald-600 dark:text-emerald-400">
                users, licenses, roles &amp; permissions
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400">
                Pre-Import Safety Backup:
              </span>
              <strong>{importOptions.create_backup ? "Enabled" : "Disabled"}</strong>
            </div>
          </div>

          {importOptions.mode === "replace" && (
            <div>
              <label
                htmlFor="sqlite-import-password"
                className="block text-xs font-semibold mb-1.5"
              >
                Current Account Password (Required for Replace Mode)
              </label>
              <input
                id="sqlite-import-password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError("");
                }}
                autoComplete="current-password"
                placeholder="Enter your password…"
                className="w-full h-10 px-3 rounded-xl text-sm border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                disabled={committing}
              />
            </div>
          )}
          {passwordError && (
            <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
              {passwordError}
            </p>
          )}

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              autoFocus
              disabled={committing}
              onClick={closeConfirmModal}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-gray-300 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={committing}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition cursor-pointer disabled:opacity-60"
              style={{ backgroundColor: primaryColor }}
            >
              {committing ? (
                <>
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  <span>Importing Database…</span>
                </>
              ) : (
                <>
                  <CheckCircleIcon className="w-4 h-4" />
                  <span>Confirm &amp; Start Import</span>
                </>
              )}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
