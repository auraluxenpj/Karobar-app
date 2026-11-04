// resources/js/components/settings/BackupRestoreSetting.jsx
import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { FilePond, registerPlugin } from "react-filepond";
import FilePondPluginImagePreview from "filepond-plugin-image-preview";
import "filepond/dist/filepond.min.css";
import { usePermissions, Guard } from "@/api/usePermissions";
import {
  CloudArrowDownIcon,
  CloudArrowUpIcon,
  ArrowPathIcon,
  ServerIcon,
  FolderIcon,
  CogIcon,
  CheckCircleIcon,
  XCircleIcon,
  TrashIcon,
  DocumentIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/solid";

registerPlugin(FilePondPluginImagePreview);

// Backup status -> chip accent + icon
const BACKUP_STATUS = {
  completed: { icon: CheckCircleIcon, chip: "var(--color-success, #15803d)" },
  failed: { icon: XCircleIcon, chip: "var(--color-danger, #dc2626)" },
  restored: { icon: CheckCircleIcon, chip: "var(--color-primary, #2563eb)" },
};

export default function BackupRestoreSetting() {
  const { loading: permsLoading, canFor } = usePermissions();

  const can = useMemo(
    () =>
      typeof canFor === "function"
        ? canFor("backup")
        : {
            view: false,
            create: false,
            delete: false,
            upload: false,
            restore: false,
          },
    [canFor]
  );

  // Backup management state
  const [backups, setBackups] = useState([]);
  const [backupStats, setBackupStats] = useState(null);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [selectedBackupType, setSelectedBackupType] = useState("full");
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [backupToRestore, setBackupToRestore] = useState(null);
  const [restorePassword, setRestorePassword] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [deletingBackupId, setDeletingBackupId] = useState(null);

  // Upload backup state
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Backup types
  const backupTypes = [
    { id: 'full', name: 'Full Backup', description: 'Complete backup including database, settings, and files', icon: ServerIcon },
    { id: 'database', name: 'Database Only', description: 'Database tables and data only', icon: FolderIcon },
    { id: 'settings', name: 'Settings Only', description: 'Application settings and configuration', icon: CogIcon },
  ];

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

  // Fetch backup statistics
  const fetchBackupStats = async () => {
    try {
      const { data } = await axios.get("/api/backups/stats");
      setBackupStats(data);
    } catch (err) {
      // Silently fail - stats are optional
    }
  };

  // Create new backup
  const handleCreateBackup = async () => {
    if (!can.create) {
      toast.error("You don't have permission to create backups.");
      return;
    }

    try {
      setCreatingBackup(true);
      const { data } = await axios.post("/api/backups", {
        type: selectedBackupType,
      });
      toast.success("Backup created successfully!");
      await fetchBackups();
      await fetchBackupStats();
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
      toast.error("You don't have permission to view backups.");
      return;
    }

    try {
      const response = await axios.get(`/api/backups/${backup.id}/download`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const ext = backup.type === 'full' ? 'zip' : backup.type === 'settings' ? 'json' : 'sql.gz';
      const filename = `${backup.filename}.${ext}`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Backup download started");
    } catch (error) {
      toast.error("Failed to download backup");
    }
  };

  // Open restore modal
  const openRestoreModal = (backup) => {
    setBackupToRestore(backup);
    setRestorePassword("");
    setShowRestoreModal(true);
  };

  // Close restore modal
  const closeRestoreModal = () => {
    setShowRestoreModal(false);
    setBackupToRestore(null);
    setRestorePassword("");
  };

  // Restore from backup
  const handleRestoreBackup = async (e) => {
    e.preventDefault();
    if (!backupToRestore) return;

    try {
      setRestoring(true);
      await axios.post(`/api/backups/${backupToRestore.id}/restore`, {
        password: restorePassword,
      });
      toast.success("Backup restored successfully! Please refresh the page.");
      closeRestoreModal();
      await fetchBackups();
      await fetchBackupStats();
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || "Restore failed. Check your password.";
      toast.error(msg);
    } finally {
      setRestoring(false);
    }
  };

  // Delete backup
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
      await fetchBackupStats();
    } catch (error) {
      const msg = error.response?.data?.message || "Failed to delete backup";
      toast.error(msg);
    } finally {
      setDeletingBackupId(null);
    }
  };

  // Upload backup file
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
      formData.append('file', uploadFiles[0].file);

      const { data } = await axios.post('/api/backups/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast.success("Backup uploaded successfully!");
      await fetchBackups();
      await fetchBackupStats();
      setUploadFiles([]);
      setShowUploadModal(false);
      openRestoreModal(data.backup);
    } catch (error) {
      const errors = error.response?.data?.errors;
      const msg = error.response?.data?.message || error.response?.data?.error || "Failed to upload backup";
      if (errors && Array.isArray(errors) && errors.length > 0) {
        errors.forEach((err) => toast.error(err));
      } else {
        toast.error(msg);
      }
    } finally {
      setUploading(false);
    }
  };

  // Status chip config for a backup
  const getBackupStatus = (status) =>
    BACKUP_STATUS[status] || { icon: ArrowPathIcon, chip: "var(--color-warning, #b45309)" };

  // Load data on mount
  useEffect(() => {
    fetchBackups();
    fetchBackupStats();
  }, []);

  if (permsLoading) {
    return (
      <div className="settings-block">
        <div className="settings-body">
          <p className="settings-hint">Checking permissions…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ===== Backup statistics ===== */}
      <div className="settings-block">
        <div className="settings-block-heading">
          <div className="flex items-center gap-3 min-w-0">
            <div className="settings-block-icon">
              <CloudArrowDownIcon />
            </div>
            <div className="min-w-0">
              <h2 className="settings-block-title">Backup &amp; Recovery</h2>
              <p className="settings-block-note">{backups.length} backups stored</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => { fetchBackups(); fetchBackupStats(); }}
            className="products-action theme-btn-tertiary"
            title="Refresh backups"
            aria-label="Refresh backups"
          >
            <ArrowPathIcon className={`w-4 h-4 ${backupsLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="settings-body">
          <div className="settings-stats">
            <div className="settings-stat">
              <div className="settings-stat-label">Total backups</div>
              <div className="settings-stat-value">{backupStats?.total_backups || 0}</div>
            </div>
            <div className="settings-stat">
              <div className="settings-stat-label">Completed</div>
              <div className="settings-stat-value" style={{ color: "var(--color-success, #15803d)" }}>
                {backupStats?.completed_backups || 0}
              </div>
            </div>
            <div className="settings-stat">
              <div className="settings-stat-label">Failed</div>
              <div className="settings-stat-value" style={{ color: "var(--color-danger, #dc2626)" }}>
                {backupStats?.failed_backups || 0}
              </div>
            </div>
            <div className="settings-stat">
              <div className="settings-stat-label">Storage used</div>
              <div className="settings-stat-value">{backupStats?.formatted_total_size || '0 B'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Create backup ===== */}
      <div className="settings-block">
        <div className="settings-block-heading">
          <div className="flex items-center gap-3 min-w-0">
            <div className="settings-block-icon">
              <CloudArrowUpIcon />
            </div>
            <div className="min-w-0">
              <h2 className="settings-block-title">Create New Backup</h2>
              <p className="settings-block-note">Choose a backup type and create it now</p>
            </div>
          </div>
        </div>

        <div className="settings-body">
          <div className="settings-options settings-options-3">
            {backupTypes.map((type) => {
              const IconComponent = type.icon;
              const isSelected = selectedBackupType === type.id;

              return (
                <div
                  key={type.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  className={`settings-option ${isSelected ? "is-active" : ""}`}
                  onClick={() => setSelectedBackupType(type.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedBackupType(type.id);
                    }
                  }}
                >
                  <span className="settings-option-head">
                    <IconComponent aria-hidden="true" />
                    <span className="settings-option-title">{type.name}</span>
                  </span>
                  <span className="settings-option-tagline">{type.description}</span>
                </div>
              );
            })}
          </div>

          <div className="settings-actions settings-actions-between">
            <span className="settings-hint">Backups are stored on the server and cleaned up automatically.</span>
            <Guard when={can.create}>
              <button
                type="button"
                onClick={handleCreateBackup}
                disabled={creatingBackup || !can.create}
                className="products-action products-action-primary theme-btn-primary"
              >
                {creatingBackup ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <CloudArrowUpIcon className="w-4 h-4" />
                )}
                <span>{creatingBackup ? "Creating…" : "Create backup"}</span>
              </button>
            </Guard>
          </div>
        </div>
      </div>

      {/* ===== Upload backup ===== */}
      <div className="settings-block">
        <div className="settings-block-heading">
          <div className="flex items-center gap-3 min-w-0">
            <div className="settings-block-icon">
              <DocumentTextIcon />
            </div>
            <div className="min-w-0">
              <h2 className="settings-block-title">Upload Backup</h2>
              <p className="settings-block-note">Restore from a backup file</p>
            </div>
          </div>
        </div>

        <div className="settings-body">
          <div className="settings-note">
            <CloudArrowDownIcon aria-hidden="true" />
            <div>
              <span className="settings-note-title">Restore from a backup file</span>
              Upload a backup file (.zip, .sql.gz) that was previously downloaded.
            </div>
          </div>

          <div className="settings-field">
            <span className="settings-label">Backup file</span>
            <FilePond
              files={uploadFiles}
              onupdatefiles={(fl) => {
                if (!can.upload) {
                  toast.error("No permission to upload backups.");
                  setUploadFiles([]);
                  return;
                }
                setUploadFiles(fl);
              }}
              allowMultiple={false}
              acceptedFileTypes={['application/zip', 'application/x-zip-compressed', 'application/gzip', 'application/x-gzip', 'application/octet-stream']}
              disabled={!can.upload || uploading}
              labelIdle='Drag & Drop backup file or <span class="filepond--label-action">Browse</span>'
              labelFileTypeNotAllowed='Only .zip, .sql.gz, .gz files are allowed'
              credits={false}
              maxFileSize="500MB"
            />
            <p className="settings-hint">Supported formats: .zip, .sql.gz, .gz. Max size: 500MB</p>
          </div>

          {uploadFiles.length > 0 && uploadFiles[0] && (
            <div className="settings-tile">
              <div className="settings-tile-title">
                <DocumentIcon aria-hidden="true" />
                <span className="truncate">
                  {uploadFiles[0].file?.name || uploadFiles[0].filename}
                </span>
                <button
                  type="button"
                  onClick={() => setUploadFiles([])}
                  disabled={uploading}
                  className="products-action"
                  style={{ marginLeft: "auto" }}
                  aria-label="Remove selected backup file"
                >
                  <XCircleIcon className="w-4 h-4" />
                </button>
              </div>
              <p className="settings-hint">
                {uploadFiles[0].file?.size
                  ? `${(uploadFiles[0].file.size / 1024 / 1024).toFixed(2)} MB`
                  : "Ready to upload"}
              </p>
            </div>
          )}

          <div className="settings-actions">
            <Guard when={can.upload}>
              <button
                type="button"
                onClick={handleUploadBackup}
                disabled={uploadFiles.length === 0 || uploading || !can.upload}
                className="products-action products-action-primary theme-btn-primary"
              >
                {uploading ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <CloudArrowUpIcon className="w-4 h-4" />
                )}
                <span>{uploading ? "Uploading…" : "Upload & preview"}</span>
              </button>
            </Guard>
          </div>
        </div>
      </div>

      {/* ===== Backup history ===== */}
      <div className="settings-block">
        <div className="settings-block-heading">
          <div className="flex items-center gap-3 min-w-0">
            <div className="settings-block-icon">
              <ServerIcon />
            </div>
            <div className="min-w-0">
              <h2 className="settings-block-title">Backup History</h2>
              <p className="settings-block-note">{backups.length} entries</p>
            </div>
          </div>
        </div>

        {backupsLoading ? (
          <div className="settings-body">
            <p className="settings-hint">Loading backups…</p>
          </div>
        ) : backups.length === 0 ? (
          <div className="people-empty">
            <CloudArrowDownIcon aria-hidden="true" />
            <div>
              <p className="people-cell-strong">No backups found</p>
              <p className="settings-hint">Create your first backup above.</p>
            </div>
          </div>
        ) : (
          <div className="settings-table-scroll" tabIndex={0} role="region" aria-label="Backup history">
            <table className="settings-table">
              <thead>
                <tr className="text-left">
                  <th scope="col">Status</th>
                  <th scope="col">Type</th>
                  <th scope="col">Created</th>
                  <th scope="col">Size</th>
                  <th scope="col" className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((backup) => {
                  const status = getBackupStatus(backup.status);
                  const StatusIcon = status.icon;

                  return (
                    <tr key={backup.id}>
                      <td>
                        <span className="settings-chip" style={{ "--settings-chip": status.chip }}>
                          <StatusIcon
                            className={backup.status === 'pending' || backup.status === 'processing' ? "animate-spin" : undefined}
                            aria-hidden="true"
                          />
                          <span className="capitalize">{backup.status}</span>
                        </span>
                        {backup.status === 'failed' && backup.error_message && (
                          <p className="settings-hint settings-text-danger">{backup.error_message}</p>
                        )}
                      </td>
                      <td>
                        <span className="settings-chip" style={{ "--settings-chip": "var(--color-primary, #2563eb)" }}>
                          {backup.type_label}
                        </span>
                      </td>
                      <td className="settings-hint">{backup.created_at_formatted}</td>
                      <td className="settings-hint">{backup.formatted_size}</td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleDownloadBackup(backup)}
                            disabled={backup.status !== 'completed' || !can.view}
                            className="products-row-action"
                            title="Download"
                            aria-label={`Download ${backup.filename}`}
                          >
                            <CloudArrowDownIcon className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openRestoreModal(backup)}
                            disabled={backup.status !== 'completed' || !can.restore}
                            className="products-row-action"
                            title="Restore"
                            aria-label={`Restore ${backup.filename}`}
                          >
                            <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteBackup(backup)}
                            disabled={deletingBackupId === backup.id || !can.delete}
                            className="products-row-action products-row-delete"
                            title="Delete"
                            aria-label={`Delete ${backup.filename}`}
                          >
                            {deletingBackupId === backup.id ? (
                              <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : (
                              <TrashIcon className="h-4 w-4" aria-hidden="true" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== Important notice ===== */}
      <div className="settings-note settings-note-warning">
        <ExclamationTriangleIcon aria-hidden="true" />
        <div>
          <span className="settings-note-title">Important: Backup &amp; Recovery</span>
          <ul className="settings-bullets">
            <li><span>Restoring a backup will overwrite current data. Create a backup first if needed.</span></li>
            <li><span>Password confirmation is required for restore operations.</span></li>
            <li><span>Database backups are compressed with gzip to save space.</span></li>
            <li><span>Old backups are automatically cleaned up (max 10 backups, 30 days retention).</span></li>
          </ul>
        </div>
      </div>

      {/* ===== Restore confirmation modal ===== */}
      {showRestoreModal && backupToRestore && (
        <div
          className="settings-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="restore-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !restoring) closeRestoreModal();
          }}
        >
          <div className="settings-modal-card">
            <div className="settings-modal-heading">
              <div className="settings-block-icon">
                <ArrowPathIcon />
              </div>
              <div className="min-w-0">
                <h3 id="restore-modal-title" className="settings-block-title">Restore Backup</h3>
                <p className="settings-block-note">This action cannot be undone</p>
              </div>
            </div>

            <form onSubmit={handleRestoreBackup} className="settings-modal-body">
              <div className="settings-note settings-note-warning">
                <ExclamationTriangleIcon aria-hidden="true" />
                <div>
                  <span className="settings-note-title">You are about to restore from backup</span>
                  <div className="settings-detail-list">
                    <div><strong>File:</strong> {backupToRestore.filename}</div>
                    <div><strong>Type:</strong> {backupToRestore.type_label}</div>
                    <div><strong>Created:</strong> {backupToRestore.created_at_formatted}</div>
                  </div>
                </div>
              </div>

              <div className="settings-field">
                <label className="settings-label" htmlFor="restore-password">
                  Enter your password to confirm
                </label>
                <input
                  id="restore-password"
                  className="g-input w-full"
                  type="password"
                  value={restorePassword}
                  onChange={(e) => setRestorePassword(e.target.value)}
                  placeholder="Enter your password"
                  autoFocus
                  required
                />
                <p className="settings-hint">This ensures only authorized users can restore backups.</p>
              </div>

              <div className="settings-actions">
                <button
                  type="button"
                  onClick={closeRestoreModal}
                  disabled={restoring}
                  className="products-action theme-btn-tertiary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={restoring || !restorePassword}
                  className="products-action products-action-danger theme-btn-danger"
                >
                  {restoring && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
                  <span>{restoring ? "Restoring…" : "Restore backup"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
