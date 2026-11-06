// resources/js/pages/Backups/Index.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import Select from "react-select";
import { FilePond, registerPlugin } from "react-filepond";
import FilePondPluginImagePreview from "filepond-plugin-image-preview";
import "filepond/dist/filepond.min.css";
import { usePermissions, Guard } from "@/api/usePermissions";
import { useTheme } from "@/context/ThemeContext";
import { getThemeButtonClasses } from "@/utils/buttonStyles";
import {
  ServerIcon,
  CloudArrowDownIcon,
  CloudArrowUpIcon,
  ArrowPathIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  CheckCircleIcon,
  XCircleIcon,
  TrashIcon,
  DocumentIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  ShieldCheckIcon,
  ArrowDownTrayIcon,
  PlayIcon,
  InformationCircleIcon,
  CircleStackIcon,
  HomeIcon,
  ComputerDesktopIcon,
  ChevronRightIcon,
  ArrowUpIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@heroicons/react/24/solid";

registerPlugin(FilePondPluginImagePreview);

const BACKUP_STATUS = {
  completed: { icon: CheckCircleIcon, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800" },
  failed: { icon: XCircleIcon, color: "text-rose-500", bg: "bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800" },
  restored: { icon: CheckCircleIcon, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800" },
  pending: { icon: ArrowPathIcon, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800" },
};

const MANUAL_BACKUP_TYPE_OPTIONS = [
  { value: "full", label: "Full Backup (DB + Settings + Files)" },
  { value: "database", label: "Database Only (SQL)" },
  { value: "settings", label: "Settings Only (JSON)" },
];

const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "full", label: "Full Backup" },
  { value: "database", label: "Database Only" },
  { value: "settings", label: "Settings Only" },
];

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily (Every Day)" },
  { value: "weekly", label: "Weekly (Once per week)" },
  { value: "monthly", label: "Monthly (Once per month)" },
];

const DAY_OF_WEEK_OPTIONS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const AUTOMATED_BACKUP_TYPE_OPTIONS = [
  { value: "full", label: "Full Archive (Database + Media + Config)" },
  { value: "database", label: "Database Only (SQL)" },
  { value: "settings", label: "Settings Only (JSON)" },
];

const BACKUP_TABS = [
  { id: "archives", label: "Backup Archives", icon: FolderIcon },
  { id: "schedule", label: "Automated Schedule", icon: ClockIcon },
  { id: "storage", label: "Storage & Select Folder", icon: CircleStackIcon },
  { id: "guide", label: "Disaster Recovery Guide", icon: ShieldCheckIcon },
];

export default function BackupsIndex() {
  const { theme, isDark } = useTheme();
  const { loading: permsLoading, canFor } = usePermissions();

  const can = useMemo(() =>
    typeof canFor === "function" ? canFor("backup") : {
      view: false, create: false, delete: false, upload: false, restore: false
    },
    [canFor]
  );

  const btnPrimary = getThemeButtonClasses(theme, "primary");
  const btnSecondary = getThemeButtonClasses(theme, "secondary");
  const btnDanger = getThemeButtonClasses(theme, "danger");

  // React-Select custom styles matching theme & dark mode
  const selectStyles = useMemo(
    () => ({
      control: (base, state) => ({
        ...base,
        minHeight: "36px",
        borderRadius: "0.75rem",
        backgroundColor: isDark ? "rgba(30, 41, 59, 0.85)" : "#ffffff",
        borderColor: state.isFocused
          ? (theme?.primary_color || "#3b82f6")
          : isDark
          ? "rgba(51, 65, 85, 0.8)"
          : "rgba(209, 213, 219, 0.8)",
        boxShadow: state.isFocused ? `0 0 0 2px ${theme?.primary_color || "#3b82f6"}33` : "none",
        fontSize: "0.75rem",
        color: isDark ? "#f8fafc" : "#1e293b",
        transition: "all 0.15s ease",
        "&:hover": {
          borderColor: theme?.primary_color || "#3b82f6",
        },
      }),
      valueContainer: (base) => ({
        ...base,
        padding: "0 10px",
      }),
      input: (base) => ({
        ...base,
        color: isDark ? "#f8fafc" : "#1e293b",
        margin: 0,
        padding: 0,
      }),
      placeholder: (base) => ({
        ...base,
        color: isDark ? "rgba(148, 163, 184, 0.7)" : "rgba(156, 163, 175, 0.8)",
        fontSize: "0.75rem",
      }),
      singleValue: (base) => ({
        ...base,
        color: isDark ? "#f8fafc" : "#1e293b",
        fontSize: "0.75rem",
        fontWeight: "500",
      }),
      dropdownIndicator: (base) => ({
        ...base,
        padding: "4px 8px",
        color: isDark ? "rgba(148, 163, 184, 0.7)" : "rgba(156, 163, 175, 0.8)",
      }),
      indicatorSeparator: () => ({ display: "none" }),
      menuPortal: (base) => ({ ...base, zIndex: 99999 }),
      menu: (base) => ({
        ...base,
        backgroundColor: isDark ? "rgba(15, 23, 42, 0.98)" : "#ffffff",
        border: isDark ? "1px solid rgba(51, 65, 85, 0.8)" : "1px solid rgba(226, 232, 240, 0.9)",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.25)",
        borderRadius: "0.75rem",
        overflow: "hidden",
      }),
      option: (base, state) => ({
        ...base,
        backgroundColor: state.isSelected
          ? (theme?.primary_color || "#3b82f6")
          : state.isFocused
          ? isDark
            ? "rgba(51, 65, 85, 0.7)"
            : "rgba(239, 246, 255, 1)"
          : "transparent",
        color: state.isSelected ? "#ffffff" : isDark ? "#f8fafc" : "#1e293b",
        fontSize: "0.75rem",
        cursor: "pointer",
        padding: "8px 12px",
        transition: "background-color 0.1s ease",
      }),
    }),
    [isDark, theme]
  );

  // Navigation tabs: "archives", "schedule", "storage", "guide"
  const [activeTab, setActiveTab] = useState("archives");

  // Backup Archives state
  const [backups, setBackups] = useState([]);
  const [backupStats, setBackupStats] = useState(null);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [selectedBackupType, setSelectedBackupType] = useState("full");

  // Filter & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  // Restore Modal State
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [backupToRestore, setBackupToRestore] = useState(null);
  const [restorePassword, setRestorePassword] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [deletingBackupId, setDeletingBackupId] = useState(null);

  // Upload modal state
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Schedule & Storage configuration state
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [testingFolder, setTestingFolder] = useState(false);
  const [folderTestResult, setFolderTestResult] = useState(null);
  const [runningJobNow, setRunningJobNow] = useState(false);
  const [showManualPathInput, setShowManualPathInput] = useState(false);

  // Folder Browser Modal State
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserData, setBrowserData] = useState({
    current_path: "",
    parent_path: null,
    is_writable: true,
    free_space: null,
    shortcuts: [],
    directories: [],
  });
  const [browserSearch, setBrowserSearch] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [showCreateFolderInput, setShowCreateFolderInput] = useState(false);

  const [scheduleForm, setScheduleForm] = useState({
    is_automated: false,
    frequency: "daily",
    time_of_day: "02:00",
    day_of_week: 0,
    day_of_month: 1,
    backup_type: "full",
    retention_days: 30,
    max_backups_keep: 10,
    storage_destination: "local",
    custom_backup_path: "",
    notify_on_failure: true,
    notification_email: "",
  });

  // Fetch backups list
  const fetchBackups = async () => {
    try {
      setBackupsLoading(true);
      const { data } = await axios.get("/api/backups");
      setBackups(data.backups || []);
    } catch (err) {
      if (err.response?.status !== 403) {
        toast.error("Failed to load backups");
      }
    } finally {
      setBackupsLoading(false);
    }
  };

  // Fetch schedule and stats
  const fetchStatsAndSchedule = async () => {
    try {
      setScheduleLoading(true);
      const [statsRes, schedRes] = await Promise.all([
        axios.get("/api/backups/stats").catch(() => ({ data: null })),
        axios.get("/api/backups/schedule").catch(() => ({ data: null })),
      ]);

      if (statsRes?.data) {
        setBackupStats(statsRes.data);
      }

      if (schedRes?.data?.schedule) {
        const s = schedRes.data.schedule;
        setScheduleForm((prev) => ({
          ...prev,
          is_automated: Boolean(s.is_automated),
          frequency: s.frequency || "daily",
          time_of_day: s.time_of_day || "02:00",
          day_of_week: s.day_of_week ?? 0,
          day_of_month: s.day_of_month ?? 1,
          backup_type: s.backup_type || "full",
          retention_days: s.retention_days || 30,
          max_backups_keep: s.max_backups_keep || 10,
          custom_backup_path: s.custom_backup_path || "",
          storage_destination: s.storage_destination || (s.custom_backup_path ? "custom_folder" : "local"),
          notify_on_failure: Boolean(s.notify_on_failure),
          notification_email: s.notification_email || "",
          last_run_at: s.last_run_at,
          last_run_status: s.last_run_status,
          last_error_message: s.last_error_message,
        }));
      }
    } finally {
      setScheduleLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
    fetchStatsAndSchedule();
  }, []);

  // Filtered backups
  const filteredBackups = useMemo(() => {
    return backups.filter((b) => {
      const matchSearch =
        !searchTerm ||
        b.filename?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.type_label?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchType = typeFilter === "all" || b.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [backups, searchTerm, typeFilter]);

  // Create Manual Backup
  const handleCreateBackup = async () => {
    if (!can.create) {
      toast.error("You don't have permission to create backups.");
      return;
    }

    try {
      setCreatingBackup(true);
      const { data } = await axios.post("/api/backups", {
        type: selectedBackupType,
        custom_backup_path: scheduleForm.storage_destination === "custom_folder" ? scheduleForm.custom_backup_path : undefined,
      });

      toast.success(data.message || "Backup created successfully!");
      await fetchBackups();
      await fetchStatsAndSchedule();
    } catch (error) {
      const msg = error.response?.data?.error || error.response?.data?.message || "Failed to create backup";
      toast.error(msg);
    } finally {
      setCreatingBackup(false);
    }
  };

  // Download backup
  const handleDownloadBackup = async (backup) => {
    if (!can.view) {
      toast.error("You don't have permission to download backups.");
      return;
    }

    try {
      const response = await axios.get(`/api/backups/${backup.id}/download`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      const ext = backup.type === "full" ? "zip" : backup.type === "settings" ? "json" : "sql.gz";
      const filename = `${backup.filename}.${ext}`;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Download started");
    } catch (error) {
      toast.error("Failed to download backup");
    }
  };

  // Open Restore Modal
  const openRestoreModal = (backup) => {
    setBackupToRestore(backup);
    setRestorePassword("");
    setShowRestoreModal(true);
  };

  // Restore Execution
  const handleRestoreBackup = async (e) => {
    e.preventDefault();
    if (!backupToRestore) return;

    try {
      setRestoring(true);
      await axios.post(`/api/backups/${backupToRestore.id}/restore`, {
        password: restorePassword,
      });
      toast.success("Backup restored successfully! Please refresh the page.");
      setShowRestoreModal(false);
      setBackupToRestore(null);
      setRestorePassword("");
      await fetchBackups();
      await fetchStatsAndSchedule();
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || "Restore failed. Verify password.";
      toast.error(msg);
    } finally {
      setRestoring(false);
    }
  };

  // Delete Backup
  const handleDeleteBackup = async (backup) => {
    if (!can.delete) {
      toast.error("You don't have permission to delete backups.");
      return;
    }

    if (!confirm(`Are you sure you want to delete "${backup.filename}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingBackupId(backup.id);
      await axios.delete(`/api/backups/${backup.id}`);
      toast.success("Backup deleted successfully");
      await fetchBackups();
      await fetchStatsAndSchedule();
    } catch (error) {
      toast.error("Failed to delete backup");
    } finally {
      setDeletingBackupId(null);
    }
  };

  // Upload Backup
  const handleUploadBackup = async () => {
    if (!can.upload) {
      toast.error("You don't have permission to upload backups.");
      return;
    }

    if (uploadFiles.length === 0 || !uploadFiles[0].file) {
      toast.error("Please select a backup file to upload.");
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", uploadFiles[0].file);

      const { data } = await axios.post("/api/backups/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      toast.success("Backup file uploaded and validated successfully!");
      await fetchBackups();
      await fetchStatsAndSchedule();
      setUploadFiles([]);
      setShowUploadModal(false);
      openRestoreModal(data.backup);
    } catch (error) {
      let msg = error.response?.data?.message;
      if (error.response?.status === 413) {
        msg = "The backup file is too large for the web server (413 Request Entity Too Large).";
      } else if (!msg) {
        msg = "Failed to upload backup";
      }
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  // Save Schedule & Storage Settings
  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    if (!can.create) {
      toast.error("You don't have permission to modify backup settings.");
      return;
    }

    try {
      setSavingSchedule(true);
      const payload = {
        ...scheduleForm,
        storage_destination: scheduleForm.storage_destination === "custom_folder" && scheduleForm.custom_backup_path ? "custom_folder" : "local",
      };
      const { data } = await axios.post("/api/backups/schedule", payload);
      toast.success(data.message || "Backup settings saved successfully!");
      await fetchStatsAndSchedule();
    } catch (error) {
      const msg = error.response?.data?.message || "Failed to save backup schedule";
      toast.error(msg);
    } finally {
      setSavingSchedule(false);
    }
  };

  // Validate & Test Destination Folder
  const handleTestFolder = async (overridePath) => {
    const targetPath = overridePath !== undefined ? overridePath : scheduleForm.custom_backup_path;

    try {
      setTestingFolder(true);
      setFolderTestResult(null);

      const { data } = await axios.post("/api/backups/test-destination", {
        destination: scheduleForm.storage_destination,
        custom_backup_path: targetPath,
      });

      setFolderTestResult({
        success: true,
        message: data.message,
        path: data.path,
        free_space: data.free_space,
      });
      toast.success(data.message);
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || "Folder test failed";
      setFolderTestResult({
        success: false,
        message: msg,
      });
      toast.error(msg);
    } finally {
      setTestingFolder(false);
    }
  };

  // Load directories in Folder Browser
  const loadDirectory = async (path = "") => {
    try {
      setBrowserLoading(true);
      const { data } = await axios.get("/api/backups/browse-directories", {
        params: path ? { path } : {},
      });
      setBrowserData(data);
      setBrowserSearch("");
      setShowCreateFolderInput(false);
      setNewFolderName("");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load directory");
    } finally {
      setBrowserLoading(false);
    }
  };

  // Open Folder Browser Modal
  const openFolderBrowser = () => {
    setShowFolderBrowser(true);
    loadDirectory(scheduleForm.custom_backup_path || "");
  };

  // Select folder from browser
  const handleSelectFolder = (selectedPath) => {
    const target = selectedPath || browserData.current_path;
    setScheduleForm((prev) => ({
      ...prev,
      storage_destination: "custom_folder",
      custom_backup_path: target,
    }));
    setShowFolderBrowser(false);
    toast.success(`Selected folder: ${target}`);
    handleTestFolder(target);
  };

  // Create new folder in current browsed path
  const handleCreateDirectory = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      setCreatingFolder(true);
      const { data } = await axios.post("/api/backups/create-directory", {
        parent_path: browserData.current_path,
        folder_name: newFolderName.trim(),
      });
      toast.success(data.message || "Folder created successfully");
      setNewFolderName("");
      setShowCreateFolderInput(false);
      await loadDirectory(data.path);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to create folder");
    } finally {
      setCreatingFolder(false);
    }
  };

  // Run Scheduled Job Now
  const handleRunScheduledNow = async () => {
    if (!confirm("Execute automated scheduled backup immediately? This will dump current data and copy it to your configured destination.")) {
      return;
    }

    try {
      setRunningJobNow(true);
      const { data } = await axios.post("/api/backups/run-now");
      toast.success(data.message || "Scheduled backup executed successfully!");
      await fetchBackups();
      await fetchStatsAndSchedule();
    } catch (error) {
      const msg = error.response?.data?.message || "Scheduled job failed to run";
      toast.error(msg);
    } finally {
      setRunningJobNow(false);
    }
  };

  // Helper: parse breadcrumbs
  const breadcrumbs = useMemo(() => {
    const current = browserData.current_path;
    if (!current) return [];

    const isWin = current.includes(":\\");
    const sep = isWin ? "\\" : "/";
    const parts = current.split(sep).filter(Boolean);

    let accumulated = isWin ? "" : "";
    const list = [];

    // Root element
    if (!isWin) {
      list.push({ name: "Root (/)", path: "/" });
    }

    parts.forEach((p, idx) => {
      if (isWin && idx === 0) {
        accumulated = p + "\\";
        list.push({ name: p, path: accumulated });
      } else {
        accumulated = isWin
          ? rtrimSep(accumulated, "\\") + "\\" + p
          : "/" + parts.slice(0, idx + 1).join("/");
        list.push({ name: p, path: accumulated });
      }
    });

    return list;
  }, [browserData.current_path]);

  function rtrimSep(str, sep) {
    return str.endsWith(sep) ? str.slice(0, -1) : str;
  }

  // Filtered subdirectories
  const filteredBrowserDirs = useMemo(() => {
    if (!browserData.directories) return [];
    if (!browserSearch) return browserData.directories;
    return browserData.directories.filter((d) =>
      d.name.toLowerCase().includes(browserSearch.toLowerCase())
    );
  }, [browserData.directories, browserSearch]);

  const isScheduleActive = scheduleForm.is_automated;
  const isCustomFolderActive = scheduleForm.storage_destination === "custom_folder" && Boolean(scheduleForm.custom_backup_path);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ===== Header & Status Hero ===== */}
      <div className="products-panel bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
              <ServerIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  Backups &amp; Storage Management
                </h1>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  System Recovery
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Automated database snapshots, custom folder mirroring, and disaster recovery.
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Guard when={can.upload}>
              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                className="products-action theme-btn-secondary"
                title="Upload an existing backup archive from your computer"
              >
                <CloudArrowUpIcon className="w-4 h-4" />
                <span>Upload &amp; Restore</span>
              </button>
            </Guard>

            <Guard when={can.create}>
              <button
                type="button"
                onClick={handleRunScheduledNow}
                disabled={runningJobNow}
                className="products-action theme-btn-secondary"
                title="Test and run the scheduled automated backup pipeline right now"
              >
                <PlayIcon className={`w-4 h-4 text-emerald-500 ${runningJobNow ? "animate-spin" : ""}`} />
                <span>{runningJobNow ? "Running Backup…" : "Run Schedule Now"}</span>
              </button>
            </Guard>

            <button
              type="button"
              onClick={() => {
                fetchBackups();
                fetchStatsAndSchedule();
              }}
              className="products-action theme-btn-tertiary"
              title="Refresh backups list"
            >
              <ArrowPathIcon className={`w-4 h-4 ${backupsLoading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* KPI Status Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-200/60 dark:border-slate-800/60">
          <div className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/50">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Total Backups
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                {backupStats?.total_backups ?? backups.length}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                ({backupStats?.formatted_total_size || "0 B"})
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/50">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Automated Schedule
            </span>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`w-2 h-2 rounded-full ${isScheduleActive ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {isScheduleActive ? `${scheduleForm.frequency.toUpperCase()} at ${scheduleForm.time_of_day}` : "Disabled"}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/50">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Backup Destination
            </span>
            <div className="flex items-center gap-2 mt-1.5" title={scheduleForm.custom_backup_path || "Default server storage"}>
              <FolderIcon className={`w-4 h-4 ${isCustomFolderActive ? "text-emerald-500" : "text-blue-500"}`} />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                {isCustomFolderActive ? "Custom Folder" : "Default Local"}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/50">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Last Backup Completed
            </span>
            <div className="flex items-center gap-1.5 mt-1">
              <ClockIcon className="w-4 h-4 text-indigo-500 shrink-0" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate" title={backupStats?.last_backup_at || "None recorded"}>
                {backupStats?.last_backup_at || "None recorded"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Modern Segmented Tab Bar ===== */}
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-2 shadow-sm">
        <div
          role="tablist"
          aria-label="Backup Management Sections"
          className="flex items-center gap-2 overflow-x-auto no-scrollbar"
        >
          {BACKUP_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`backup-tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`backup-panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                style={
                  isActive
                    ? {
                        backgroundColor: theme?.primary_color || "#2563eb",
                        color: "#ffffff",
                      }
                    : undefined
                }
                className={`group relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer ${
                  isActive
                    ? "shadow-md shadow-blue-500/25 dark:shadow-blue-900/40"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/60"
                }`}
              >
                <Icon
                  className={`w-4 h-4 transition-transform duration-200 group-hover:scale-110 ${
                    isActive ? "text-white" : "text-slate-400 dark:text-slate-500 group-hover:text-blue-500"
                  }`}
                />
                <span>{tab.label}</span>

                {/* Badges / Status Chips */}
                {tab.id === "archives" && (
                  <span
                    className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                      isActive
                        ? "bg-white/25 text-white"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60"
                    }`}
                  >
                    {backups.length}
                  </span>
                )}

                {tab.id === "schedule" && (
                  <span
                    className={`flex items-center gap-1.5 ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                      isActive
                        ? "bg-white/25 text-white"
                        : isScheduleActive
                        ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isActive
                          ? "bg-white"
                          : isScheduleActive
                          ? "bg-emerald-500 animate-pulse"
                          : "bg-slate-400"
                      }`}
                    />
                    {isScheduleActive ? "Active" : "Off"}
                  </span>
                )}

                {tab.id === "storage" && isCustomFolderActive && (
                  <span
                    className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                      isActive
                        ? "bg-white/25 text-white"
                        : "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60"
                    }`}
                  >
                    Custom
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: BACKUP ARCHIVES REGISTER                          */}
      {/* ======================================================== */}
      {activeTab === "archives" && (
        <div id="backup-panel-archives" role="tabpanel" aria-labelledby="backup-tab-archives" className="space-y-6">
          {/* Quick Create Card */}
          <Guard when={can.create}>
            <div className="products-panel bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-5 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <CloudArrowDownIcon className="w-4 h-4 text-blue-500" />
                    Create On-Demand Backup
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Generate an instant snapshot of your database and application assets.
                    {isCustomFolderActive && (
                      <span className="block text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                        Will also copy to: {scheduleForm.custom_backup_path}
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                  <div className="flex items-center gap-2 w-full sm:w-auto sm:min-w-[270px]">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      Type:
                    </label>
                    <div className="flex-1">
                      <Select
                        value={MANUAL_BACKUP_TYPE_OPTIONS.find((o) => o.value === selectedBackupType)}
                        onChange={(opt) => setSelectedBackupType(opt?.value || "full")}
                        options={MANUAL_BACKUP_TYPE_OPTIONS}
                        styles={selectStyles}
                        isSearchable={false}
                        menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                        menuPosition="fixed"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleCreateBackup}
                    disabled={creatingBackup}
                    className="products-action theme-btn-primary"
                  >
                    <CloudArrowDownIcon className={`w-4 h-4 ${creatingBackup ? "animate-bounce" : ""}`} />
                    <span>{creatingBackup ? "Generating Backup…" : "Create Backup Now"}</span>
                  </button>
                </div>
              </div>
            </div>
          </Guard>

          {/* Table Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Search backups by name or type…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-72 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <div className="w-full sm:w-44">
                <Select
                  value={TYPE_FILTER_OPTIONS.find((o) => o.value === typeFilter)}
                  onChange={(opt) => setTypeFilter(opt?.value || "all")}
                  options={TYPE_FILTER_OPTIONS}
                  styles={selectStyles}
                  isSearchable={false}
                  menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                  menuPosition="fixed"
                />
              </div>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400">
              Showing <strong>{filteredBackups.length}</strong> of <strong>{backups.length}</strong> backups
            </div>
          </div>

          {/* Backups Table */}
          <div className="products-panel bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider font-semibold text-[11px]">
                  <tr>
                    <th className="px-4 py-3">Archive Details</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Size</th>
                    <th className="px-4 py-3">Origin</th>
                    <th className="px-4 py-3">Storage Destination</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                  {backupsLoading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                        <ArrowPathIcon className="w-6 h-6 animate-spin mx-auto text-blue-500 mb-2" />
                        <span>Loading backup archives…</span>
                      </td>
                    </tr>
                  ) : filteredBackups.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                        <ServerIcon className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
                        <span className="font-medium text-slate-600 dark:text-slate-400">No backups found</span>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Create an on-demand snapshot or enable automated daily schedules.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredBackups.map((b) => {
                      const statusCfg = BACKUP_STATUS[b.status] || BACKUP_STATUS.pending;
                      const StatusIcon = statusCfg.icon;

                      return (
                        <tr key={b.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                                <DocumentIcon className="w-4 h-4" />
                              </div>
                              <div>
                                <span className="font-semibold text-slate-800 dark:text-slate-100 block">
                                  {b.filename}
                                </span>
                                <span className="text-[11px] text-slate-400 block mt-0.5">
                                  {b.created_at_formatted}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3.5">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              {b.type_label}
                            </span>
                          </td>

                          <td className="px-4 py-3.5 font-medium text-slate-600 dark:text-slate-300">
                            {b.formatted_size}
                          </td>

                          <td className="px-4 py-3.5">
                            {b.is_automated ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                                <ClockIcon className="w-3.5 h-3.5" />
                                Automated
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                Manual Trigger
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3.5">
                            {b.remote_status === "success" ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 cursor-help"
                                title={`Copied to: ${b.remote_path || "Custom Folder"}`}
                              >
                                <CheckCircleIcon className="w-3.5 h-3.5" />
                                Custom Folder
                              </span>
                            ) : b.remote_status === "failed" ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 cursor-help"
                                title={`Folder copy failed: ${b.remote_error || "Check folder permissions"}`}
                              >
                                <XCircleIcon className="w-3.5 h-3.5" />
                                Folder Copy Failed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                                <ServerIcon className="w-3 h-3 text-slate-400" />
                                Default Local
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3.5">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${statusCfg.bg} ${statusCfg.color}`}>
                              <StatusIcon className="w-3 h-3" />
                              <span className="capitalize">{b.status}</span>
                            </span>
                          </td>

                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Download */}
                              <Guard when={can.view}>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadBackup(b)}
                                  disabled={b.status === "failed"}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                                  title="Download archive to your computer"
                                >
                                  <ArrowDownTrayIcon className="w-4 h-4" />
                                </button>
                              </Guard>

                              {/* Restore */}
                              <Guard when={can.restore}>
                                <button
                                  type="button"
                                  onClick={() => openRestoreModal(b)}
                                  disabled={b.status === "failed"}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                                  title="Restore database from this snapshot"
                                >
                                  <ArrowPathIcon className="w-4 h-4" />
                                </button>
                              </Guard>

                              {/* Delete */}
                              <Guard when={can.delete}>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteBackup(b)}
                                  disabled={deletingBackupId === b.id}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                                  title="Delete backup archive"
                                >
                                  <TrashIcon className={`w-4 h-4 ${deletingBackupId === b.id ? "animate-spin" : ""}`} />
                                </button>
                              </Guard>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: AUTOMATED SCHEDULE CONFIGURATION                   */}
      {/* ======================================================== */}
      {activeTab === "schedule" && (
        <form id="backup-panel-schedule" role="tabpanel" aria-labelledby="backup-tab-schedule" onSubmit={handleSaveSchedule} className="products-panel bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-4 sm:p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <ClockIcon className="w-5 h-5 text-blue-500" />
                Automated Schedule Engine
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Configure background schedule to create automated database snapshots and purge old files.
              </p>
            </div>

            {/* Enable Toggle Switch */}
            <label className="flex items-center gap-3 cursor-pointer">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {scheduleForm.is_automated ? "Automated Backups Enabled" : "Automated Backups Disabled"}
              </span>
              <div className="relative inline-block w-11 h-6 align-middle select-none">
                <input
                  type="checkbox"
                  checked={scheduleForm.is_automated}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, is_automated: e.target.checked })}
                  className="sr-only"
                />
                <div className={`block w-11 h-6 rounded-full transition-colors ${scheduleForm.is_automated ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"}`} />
                <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${scheduleForm.is_automated ? "transform translate-x-5" : ""}`} />
              </div>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Frequency */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Backup Frequency
              </label>
              <Select
                value={FREQUENCY_OPTIONS.find((o) => o.value === scheduleForm.frequency)}
                onChange={(opt) => setScheduleForm({ ...scheduleForm, frequency: opt?.value || "daily" })}
                options={FREQUENCY_OPTIONS}
                styles={selectStyles}
                isSearchable={false}
                menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                menuPosition="fixed"
              />
            </div>

            {/* Time of Day */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Execution Time (24h format)
              </label>
              <input
                type="time"
                value={scheduleForm.time_of_day}
                onChange={(e) => setScheduleForm({ ...scheduleForm, time_of_day: e.target.value })}
                className="w-full text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Off-peak hours like 02:00 AM are strongly recommended.
              </span>
            </div>

            {/* Day of Week / Month selector */}
            {scheduleForm.frequency === "weekly" && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Day of Week
                </label>
                <Select
                  value={DAY_OF_WEEK_OPTIONS.find((o) => o.value === Number(scheduleForm.day_of_week))}
                  onChange={(opt) => setScheduleForm({ ...scheduleForm, day_of_week: opt ? Number(opt.value) : 0 })}
                  options={DAY_OF_WEEK_OPTIONS}
                  styles={selectStyles}
                  isSearchable={false}
                  menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                  menuPosition="fixed"
                />
              </div>
            )}

            {scheduleForm.frequency === "monthly" && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Day of Month
                </label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={scheduleForm.day_of_month}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, day_of_month: parseInt(e.target.value) })}
                  className="w-full text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {/* Backup Type */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Automated Backup Type
              </label>
              <Select
                value={AUTOMATED_BACKUP_TYPE_OPTIONS.find((o) => o.value === scheduleForm.backup_type)}
                onChange={(opt) => setScheduleForm({ ...scheduleForm, backup_type: opt?.value || "full" })}
                options={AUTOMATED_BACKUP_TYPE_OPTIONS}
                styles={selectStyles}
                isSearchable={false}
                menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                menuPosition="fixed"
              />
            </div>

            {/* Retention: Max Archives */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Maximum Archives to Retain
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={scheduleForm.max_backups_keep}
                onChange={(e) => setScheduleForm({ ...scheduleForm, max_backups_keep: parseInt(e.target.value) || 10 })}
                className="w-full text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Older backups exceeding this count are automatically purged.
              </span>
            </div>

            {/* Retention Days */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Retention Lifetime (Days)
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={scheduleForm.retention_days}
                onChange={(e) => setScheduleForm({ ...scheduleForm, retention_days: parseInt(e.target.value) || 30 })}
                className="w-full text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Automatically purge archives older than this threshold.
              </span>
            </div>
          </div>

          {/* Failure Notifications */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Failure Alert Notifications
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scheduleForm.notify_on_failure}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, notify_on_failure: e.target.checked })}
                  className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                />
                <span>Log and alert administrator if automated backup fails</span>
              </label>

              <div>
                <input
                  type="email"
                  placeholder="admin-alerts@yourstore.com"
                  value={scheduleForm.notification_email}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, notification_email: e.target.value })}
                  className="w-full text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end">
            <button
              type="submit"
              disabled={savingSchedule}
              className="products-action theme-btn-primary"
            >
              <span>{savingSchedule ? "Saving Settings…" : "Save Schedule Settings"}</span>
            </button>
          </div>
        </form>
      )}

      {/* ======================================================== */}
      {/* TAB 3: BACKUP STORAGE DESTINATION & FOLDER SELECTION     */}
      {/* ======================================================== */}
      {activeTab === "storage" && (
        <form id="backup-panel-storage" role="tabpanel" aria-labelledby="backup-tab-storage" onSubmit={handleSaveSchedule} className="products-panel bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <CircleStackIcon className="w-5 h-5 text-blue-500" />
              Backup Storage Destination &amp; Mirroring
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Select where backups are saved. Store backups on the default server storage or select any folder on your computer, external USB drive, or cloud sync folder.
            </p>
          </div>

          {/* Storage Mode Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
              Storage Destination Mode
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Option 1: Default Local Storage */}
              <button
                type="button"
                onClick={() => {
                  setScheduleForm({ ...scheduleForm, storage_destination: "local" });
                  setFolderTestResult(null);
                }}
                className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  scheduleForm.storage_destination === "local"
                    ? "border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 ring-2 ring-blue-500/30"
                    : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white/50 dark:bg-slate-800/50"
                }`}
              >
                <div className="flex items-center justify-between w-full mb-3">
                  <div className="flex items-center gap-2.5">
                    <ServerIcon className={`w-5 h-5 ${scheduleForm.storage_destination === "local" ? "text-blue-600 dark:text-blue-400" : "text-slate-400"}`} />
                    <span className="font-bold text-sm text-slate-800 dark:text-slate-100">
                      Default Server Storage
                    </span>
                  </div>
                  {scheduleForm.storage_destination === "local" && (
                    <CheckCircleIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Stores backups in the application's built-in <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[11px]">storage/app/backups</code> directory. Zero setup required.
                </p>
              </button>

              {/* Option 2: Custom Folder / External Drive */}
              <button
                type="button"
                onClick={() => {
                  setScheduleForm({ ...scheduleForm, storage_destination: "custom_folder" });
                  setFolderTestResult(null);
                  if (!scheduleForm.custom_backup_path) {
                    openFolderBrowser();
                  }
                }}
                className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  scheduleForm.storage_destination === "custom_folder"
                    ? "border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 ring-2 ring-blue-500/30"
                    : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white/50 dark:bg-slate-800/50"
                }`}
              >
                <div className="flex items-center justify-between w-full mb-3">
                  <div className="flex items-center gap-2.5">
                    <FolderPlusIcon className={`w-5 h-5 ${scheduleForm.storage_destination === "custom_folder" ? "text-blue-600 dark:text-blue-400" : "text-slate-400"}`} />
                    <span className="font-bold text-sm text-slate-800 dark:text-slate-100">
                      Selected Folder / External Drive
                    </span>
                  </div>
                  {scheduleForm.storage_destination === "custom_folder" && (
                    <CheckCircleIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Mirror backups directly to any selected folder on this PC, external USB hard drive, or local desktop Google Drive / Dropbox / OneDrive folder.
                </p>
              </button>
            </div>
          </div>

          {/* Custom Folder Configuration Section */}
          {scheduleForm.storage_destination === "custom_folder" && (
            <div className="p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 space-y-4">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  Chosen Destination Folder
                </label>
                <button
                  type="button"
                  onClick={() => setShowManualPathInput(!showManualPathInput)}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {showManualPathInput ? "Hide manual path" : "Edit path manually"}
                </button>
              </div>

              {/* Folder Selector Interactive Card */}
              {scheduleForm.custom_backup_path ? (
                <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <FolderOpenIcon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">
                        Active Backup Directory:
                      </span>
                      <code className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-100 truncate block mt-0.5" title={scheduleForm.custom_backup_path}>
                        {scheduleForm.custom_backup_path}
                      </code>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={openFolderBrowser}
                      className="products-action theme-btn-secondary"
                    >
                      <FolderIcon className="w-4 h-4 text-blue-500" />
                      <span>Change Folder</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTestFolder()}
                      disabled={testingFolder}
                      className="products-action theme-btn-secondary"
                      title="Test folder write permissions and free space"
                    >
                      <CheckCircleIcon className={`w-4 h-4 ${testingFolder ? "animate-spin text-blue-500" : "text-emerald-500"}`} />
                      <span>{testingFolder ? "Testing…" : "Test Folder"}</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* No folder selected yet prompt */
                <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-700 text-center space-y-3">
                  <FolderPlusIcon className="w-10 h-10 text-blue-500 mx-auto" />
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      No Folder Selected Yet
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                      Click the button below to browse and select any folder on this machine, external USB drive, or cloud sync folder.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openFolderBrowser}
                    className="products-action theme-btn-primary mx-auto"
                  >
                    <FolderIcon className="w-4 h-4" />
                    <span>Browse &amp; Select Folder</span>
                  </button>
                </div>
              )}

              {/* Optional Manual Input Bar */}
              {showManualPathInput && (
                <div className="pt-2">
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Direct Path String:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. D:\KarobarBackups or /Volumes/ExternalDrive/Backups"
                    value={scheduleForm.custom_backup_path}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, custom_backup_path: e.target.value })}
                    className="w-full text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 px-3.5 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* Real-time test result banner */}
              {folderTestResult && (
                <div
                  className={`p-3.5 rounded-xl border text-xs flex items-start gap-3 ${
                    folderTestResult.success
                      ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
                      : "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200"
                  }`}
                >
                  {folderTestResult.success ? (
                    <CheckCircleIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <ExclamationTriangleIcon className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
                  )}
                  <div>
                    <span className="font-bold block">
                      {folderTestResult.success ? "Folder Validated Successfully" : "Folder Validation Error"}
                    </span>
                    <p className="mt-0.5">{folderTestResult.message}</p>
                    {folderTestResult.free_space && (
                      <span className="text-[11px] font-semibold block mt-1">
                        Available Free Space: {folderTestResult.free_space}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Helpful Tips Card */}
              <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/80 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <InformationCircleIcon className="w-4 h-4 text-blue-500" />
                  Cloud &amp; External Drive Tips:
                </h4>
                <p className="leading-relaxed">
                  You can select any local folder, external USB drive, or desktop cloud sync folder without needing any API keys:
                </p>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600 dark:text-slate-300 pl-1">
                  <li>
                    <strong>Google Drive:</strong> Open the folder picker and select your <em>Google Drive for Desktop</em> folder (e.g. <code>My Drive/KarobarBackups</code>).
                  </li>
                  <li>
                    <strong>Dropbox or OneDrive:</strong> Select your local <code>Dropbox</code> or <code>OneDrive</code> synced folder.
                  </li>
                  <li>
                    <strong>External USB Drives:</strong> Plug in your external drive, click <em>Browse &amp; Select Folder</em>, and choose a folder on the drive.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Retention Policy Notice */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between gap-4">
            <div>
              <span className="font-bold text-slate-800 dark:text-slate-100 block">
                Automatic Retention Policy Active
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Karobar automatically keeps the latest <strong>{scheduleForm.max_backups_keep}</strong> backups and purges archives older than <strong>{scheduleForm.retention_days}</strong> days from both default storage and your selected folder.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("schedule")}
              className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline shrink-0"
            >
              Adjust Retention &rarr;
            </button>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end">
            <button
              type="submit"
              disabled={savingSchedule}
              className="products-action theme-btn-primary"
            >
              <span>{savingSchedule ? "Saving Settings…" : "Save Storage Settings"}</span>
            </button>
          </div>
        </form>
      )}

      {/* ======================================================== */}
      {/* TAB 4: DISASTER RECOVERY GUIDE                           */}
      {/* ======================================================== */}
      {activeTab === "guide" && (
        <div id="backup-panel-guide" role="tabpanel" aria-labelledby="backup-tab-guide" className="products-panel bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <ShieldCheckIcon className="w-5 h-5 text-blue-500" />
              Disaster Recovery Protocol &amp; System Integrity
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Follow these recommended operating procedures to guarantee uninterrupted pharmacy &amp; trade operations.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 space-y-2">
              <span className="font-bold text-xs text-blue-800 dark:text-blue-200 uppercase tracking-wider block">
                Rule 1: The 3-2-1 Rule
              </span>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Maintain at least <strong>3 copies</strong> of your data, on <strong>2 different media types</strong>, with at least <strong>1 copy off-site</strong> (e.g. an external USB drive or desktop cloud sync folder).
              </p>
            </div>

            <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-2">
              <span className="font-bold text-xs text-emerald-800 dark:text-emerald-200 uppercase tracking-wider block">
                Rule 2: Periodic Restore Drill
              </span>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                A backup is only as good as its restoration. Test your backup files quarterly on a secondary machine to verify that database tables, customer ledger balances, and batches restore seamlessly.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-amber-50/60 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-2">
              <span className="font-bold text-xs text-amber-800 dark:text-amber-200 uppercase tracking-wider block">
                Rule 3: Protection &amp; Security
              </span>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Backups contain sensitive financial transactions, pricing, and patient ledger histories. Restores require your account password, and external storage drives should be stored securely.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-2 text-xs text-slate-600 dark:text-slate-300">
            <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <InformationCircleIcon className="w-4 h-4 text-blue-500" />
              Manual Database Restoration via Terminal (Advanced)
            </h4>
            <p>
              If web access is unavailable, database dumps (.sql.gz) can be extracted and restored directly via command line:
            </p>
            <div className="bg-slate-900 text-slate-100 p-3 rounded-lg font-mono text-[11px] overflow-x-auto space-y-1">
              <div>gzip -d -c storage/app/backups/backup_database_XXXX.sql.gz | mysql -u root -p karobar_db</div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* FOLDER BROWSER & SELECTOR MODAL                          */}
      {/* ======================================================== */}
      {showFolderBrowser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-4 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <FolderOpenIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    Select Backup Destination Folder
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Navigate through your drives or choose from quick shortcuts
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFolderBrowser(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none p-1"
              >
                &times;
              </button>
            </div>

            {/* Quick Shortcuts Bar */}
            {browserData.shortcuts && browserData.shortcuts.length > 0 && (
              <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center gap-1.5 overflow-x-auto text-xs shrink-0">
                <span className="text-[10px] uppercase font-bold text-slate-400 mr-1 shrink-0">
                  Quick Jumps:
                </span>
                {browserData.shortcuts.map((sc) => {
                  const isCurrent = browserData.current_path === sc.path;
                  return (
                    <button
                      key={sc.path}
                      type="button"
                      onClick={() => loadDirectory(sc.path)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                        isCurrent
                          ? "bg-blue-600 text-white shadow-sm"
                          : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      {sc.type === "home" && <HomeIcon className="w-3.5 h-3.5" />}
                      {sc.type === "desktop" && <ComputerDesktopIcon className="w-3.5 h-3.5" />}
                      {sc.type === "documents" && <DocumentIcon className="w-3.5 h-3.5" />}
                      {sc.type === "downloads" && <ArrowDownTrayIcon className="w-3.5 h-3.5" />}
                      {sc.type === "drive" && <CircleStackIcon className="w-3.5 h-3.5 text-emerald-500" />}
                      {sc.type === "app" && <ServerIcon className="w-3.5 h-3.5 text-indigo-500" />}
                      <span>{sc.name}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Interactive Breadcrumb Bar & Parent Jump */}
            <div className="px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3 text-xs shrink-0">
              <div className="flex items-center gap-1 overflow-x-auto py-0.5 max-w-full">
                {browserData.parent_path && (
                  <button
                    type="button"
                    onClick={() => loadDirectory(browserData.parent_path)}
                    className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 shrink-0"
                    title="Up to parent folder"
                  >
                    <ArrowUpIcon className="w-3.5 h-3.5" />
                  </button>
                )}

                {breadcrumbs.map((crumb, idx) => {
                  const isLast = idx === breadcrumbs.length - 1;
                  return (
                    <React.Fragment key={crumb.path}>
                      {idx > 0 && (
                        <ChevronRightIcon className="w-3 h-3 text-slate-400 shrink-0" />
                      )}
                      <button
                        type="button"
                        onClick={() => !isLast && loadDirectory(crumb.path)}
                        className={`px-1.5 py-0.5 rounded text-xs truncate max-w-[150px] ${
                          isLast
                            ? "font-bold text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 cursor-default"
                            : "text-blue-600 dark:text-blue-400 hover:underline"
                        }`}
                        title={crumb.path}
                      >
                        {crumb.name}
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Free disk space badge */}
              {browserData.free_space && (
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                  {browserData.free_space} free
                </span>
              )}
            </div>

            {/* Subfolders Search & New Folder Action */}
            <div className="px-5 py-2.5 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between gap-3 shrink-0">
              <div className="relative flex-1">
                <MagnifyingGlassIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter folders in this directory…"
                  value={browserSearch}
                  onChange={(e) => setBrowserSearch(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowCreateFolderInput(!showCreateFolderInput)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1.5 shrink-0"
              >
                <PlusIcon className="w-3.5 h-3.5 text-emerald-500" />
                <span>New Folder</span>
              </button>
            </div>

            {/* Inline New Folder Form */}
            {showCreateFolderInput && (
              <form onSubmit={handleCreateDirectory} className="px-5 py-2.5 bg-emerald-50/60 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-800 flex flex-wrap items-center gap-2 shrink-0">
                <input
                  type="text"
                  required
                  placeholder="New folder name (e.g. KarobarBackups)"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="flex-1 min-w-[160px] text-xs px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  disabled={creatingFolder || !newFolderName.trim()}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 shrink-0"
                >
                  {creatingFolder ? "Creating…" : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateFolderInput(false)}
                  className="px-2.5 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400"
                >
                  Cancel
                </button>
              </form>
            )}

            {/* Subfolders Explorer List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1.5 min-h-[220px]">
              {browserLoading ? (
                <div className="py-16 text-center text-slate-400">
                  <ArrowPathIcon className="w-6 h-6 animate-spin mx-auto text-blue-500 mb-2" />
                  <span className="text-xs">Reading folder contents…</span>
                </div>
              ) : filteredBrowserDirs.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <FolderIcon className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400 block">
                    No subdirectories found
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Click "Select This Folder" below to choose this location, or click "New Folder" above to create one.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filteredBrowserDirs.map((dir) => (
                    <div
                      key={dir.path}
                      className="group p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-950/30 transition-all flex items-center justify-between gap-2"
                    >
                      <button
                        type="button"
                        onClick={() => loadDirectory(dir.path)}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                      >
                        <FolderIcon className="w-5 h-5 text-amber-500 shrink-0 group-hover:scale-110 transition-transform" />
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                          {dir.name}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSelectFolder(dir.path)}
                        className="px-2 py-1 rounded text-[10px] font-semibold text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900/40 shrink-0 transition-colors"
                        title={`Select "${dir.name}" directly`}
                      >
                        Choose
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer: Current Selection & Confirm Button */}
            <div className="p-4 px-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Current Location:
                </span>
                <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-100 truncate block">
                  {browserData.current_path || "—"}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowFolderBrowser(false)}
                  className="products-action theme-btn-tertiary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectFolder()}
                  disabled={!browserData.is_writable}
                  className="products-action theme-btn-primary"
                >
                  <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
                  <span>Select This Folder</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* RESTORE PASSWORD MODAL                                   */}
      {/* ======================================================== */}
      {showRestoreModal && backupToRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <ExclamationTriangleIcon className="w-5 h-5 text-amber-500" />
                Confirm Database Restore
              </h3>
              <button
                type="button"
                onClick={() => setShowRestoreModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleRestoreBackup} className="p-5 space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 leading-relaxed">
                <strong>Warning:</strong> Restoring this backup will overwrite current active data with the snapshot taken on <strong>{backupToRestore.created_at_formatted}</strong>. Current unbacked-up changes will be replaced.
              </div>

              <div className="space-y-1 text-slate-600 dark:text-slate-300">
                <div><strong>Archive:</strong> {backupToRestore.filename}</div>
                <div><strong>Type:</strong> {backupToRestore.type_label}</div>
                <div><strong>Size:</strong> {backupToRestore.formatted_size}</div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Confirm Account Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Enter your current login password"
                  value={restorePassword}
                  onChange={(e) => setRestorePassword(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRestoreModal(false)}
                  className="products-action theme-btn-tertiary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={restoring || !restorePassword}
                  className="products-action theme-btn-danger"
                >
                  <span>{restoring ? "Restoring Database…" : "Proceed with Restore"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* UPLOAD BACKUP MODAL                                      */}
      {/* ======================================================== */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <CloudArrowUpIcon className="w-5 h-5 text-blue-500" />
                Upload Backup Archive
              </h3>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                &times;
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-500 dark:text-slate-400">
                Select or drag a previously downloaded backup file (.zip, .sql.gz, or .json) from your computer:
              </p>

              <FilePond
                files={uploadFiles}
                onupdatefiles={setUploadFiles}
                allowMultiple={false}
                maxFiles={1}
                name="file"
                labelIdle='Drag & Drop your backup archive or <span class="filepond--label-action">Browse</span>'
              />

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="products-action theme-btn-tertiary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUploadBackup}
                  disabled={uploading || uploadFiles.length === 0}
                  className="products-action theme-btn-primary"
                >
                  <span>{uploading ? "Uploading & Validating…" : "Upload & Validate"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
