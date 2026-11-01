import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import Select from "react-select";
import toast from "react-hot-toast";
import {
  XMarkIcon,
  ArrowsRightLeftIcon,
  BuildingStorefrontIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { GlassInput } from "@/components/Glass.jsx";

export const LOCATION_TYPE_OPTIONS = [
  { value: "shop", label: "Shop Counter / Retail Shelf (FEFO Priority)" },
  { value: "godown", label: "Main Godown / Backroom Reserve" },
  { value: "cold_storage", label: "Cold Storage / Fridge" },
  { value: "quarantine", label: "Quarantine / Damage Hold" },
  { value: "other", label: "Other Storage Area" },
];

export function getLocationTypeMeta(type) {
  switch (type) {
    case "godown":
      return {
        shortLabel: "Godown",
        badgeClass:
          "bg-amber-100 text-amber-800 border-amber-300/60 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800/60",
      };
    case "cold_storage":
      return {
        shortLabel: "Cold Chain",
        badgeClass:
          "bg-cyan-100 text-cyan-800 border-cyan-300/60 dark:bg-cyan-950/70 dark:text-cyan-300 dark:border-cyan-800/60",
      };
    case "quarantine":
      return {
        shortLabel: "Quarantine",
        badgeClass:
          "bg-rose-100 text-rose-800 border-rose-300/60 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800/60",
      };
    case "shop":
    default:
      return {
        shortLabel: "Shop Floor",
        badgeClass:
          "bg-emerald-100 text-emerald-800 border-emerald-300/60 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800/60",
      };
  }
}

export function MoveBatchLocationModal({
  isOpen,
  onClose,
  batch,
  storageLocations = [],
  onMoved,
  isDark = false,
  selectStyles,
  packSize = 1,
}) {
  const availableQty = Math.max(0, parseInt(batch?.quantity, 10) || 0);
  const currentLocId = batch?.storage_location_id ? Number(batch.storage_location_id) : null;

  const [targetLocId, setTargetLocId] = useState("");
  const [moveQty, setMoveQty] = useState("");
  const [targetRack, setTargetRack] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const locationOptions = useMemo(
    () =>
      (storageLocations || [])
        .filter((l) => l.is_active !== false)
        .map((l) => {
          const meta = getLocationTypeMeta(l.type);
          const isCurrent = Number(l.id) === currentLocId;
          return {
            value: String(l.id),
            label: `${l.name} (${l.code}) — ${meta.shortLabel}${isCurrent ? " [Current]" : ""}`,
            location: l,
          };
        }),
    [storageLocations, currentLocId]
  );

  useEffect(() => {
    if (isOpen && batch) {
      // Pick the first different location by default (e.g. if in Godown, default to Shop Counter)
      const alternate = (storageLocations || []).find(
        (l) => l.is_active !== false && Number(l.id) !== currentLocId
      );
      const initialLoc = alternate || storageLocations[0] || null;
      setTargetLocId(initialLoc ? String(initialLoc.id) : "");
      setMoveQty(String(availableQty));
      setTargetRack(batch.rack || batch.batch_rack || initialLoc?.default_rack || "");
    }
  }, [isOpen, batch, storageLocations, currentLocId, availableQty]);

  if (!isOpen || !batch) return null;

  const parsedMoveQty = Math.max(0, Math.min(availableQty, parseInt(moveQty, 10) || 0));
  const remainingQty = Math.max(0, availableQty - parsedMoveQty);
  const currentLocationObj = (storageLocations || []).find((l) => Number(l.id) === currentLocId);
  const targetLocationObj = (storageLocations || []).find((l) => String(l.id) === String(targetLocId));
  const effPackSize = Math.max(1, parseInt(packSize, 10) || 1);

  const handleMoveSubmit = async (e) => {
    e.preventDefault();
    if (!targetLocId) {
      toast.error("Please select a target storage location");
      return;
    }
    const qtyNum = parseInt(moveQty, 10);
    if (!qtyNum || qtyNum <= 0 || qtyNum > availableQty) {
      toast.error(`Please enter a quantity between 1 and ${availableQty}`);
      return;
    }

    const batchId = batch.id || batch.batch_id;
    setSubmitting(true);
    try {
      const { data } = await axios.post(`/api/batches/${batchId}/move-location`, {
        to_storage_location_id: Number(targetLocId),
        quantity: qtyNum,
        rack: targetRack.trim() || null,
      });
      toast.success(data?.message || "Batch stock moved successfully");
      if (onMoved) await onMoved(data);
      onClose();
    } catch (err) {
      const msg =
        err?.response?.data?.errors?.quantity?.[0] ||
        err?.response?.data?.message ||
        "Failed to move batch stock";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden ${
          isDark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-white border-gray-200 text-gray-900"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-center justify-between px-5 py-4 border-b ${
            isDark ? "border-slate-700 bg-slate-800/90" : "border-gray-200 bg-gray-50/80"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <ArrowsRightLeftIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">Move / Split Batch Location</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Batch <span className="font-mono font-semibold">{batch.batch_number}</span> • Exp:{" "}
                <span className="font-mono">{batch.expiry_date}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleMoveSubmit} className="p-5 space-y-4">
          {/* Source Summary Banner */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between ${
              isDark ? "bg-slate-900/60 border-slate-700" : "bg-slate-50 border-gray-200"
            }`}
          >
            <div>
              <span className="block text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-slate-400">
                Current Location
              </span>
              <span className="text-sm font-semibold">
                {currentLocationObj?.name || batch.storage_location_name || "Shop Counter / Shelf"}
              </span>
              {(batch.rack || batch.batch_rack) && (
                <span className="ml-2 text-xs font-mono text-gray-500 dark:text-slate-400">
                  (Rack: {batch.rack || batch.batch_rack})
                </span>
              )}
            </div>
            <div className="text-right">
              <span className="block text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-slate-400">
                Available in Batch
              </span>
              <span className="text-base font-mono font-bold text-blue-600 dark:text-blue-400">
                {availableQty} Units
              </span>
            </div>
          </div>

          {/* Target Storage Location (React-Select) */}
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-gray-700 dark:text-slate-300">
              Move To Storage Location *
            </label>
            <Select
              options={locationOptions}
              value={locationOptions.find((o) => o.value === String(targetLocId)) || null}
              onChange={(opt) => {
                setTargetLocId(opt?.value || "");
                if (opt?.location?.default_rack && !targetRack) {
                  setTargetRack(opt.location.default_rack);
                }
              }}
              styles={selectStyles}
              classNamePrefix="rs"
              isSearchable
              menuPortalTarget={typeof document !== "undefined" ? document.body : null}
              menuPosition="fixed"
              placeholder="Select destination location..."
            />
          </div>

          {/* Quantity to Move & Target Rack */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300">
                  Quantity to Move (Units) *
                </label>
                <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                  Max: {availableQty}
                </span>
              </div>
              <GlassInput
                type="number"
                min="1"
                max={availableQty}
                value={moveQty}
                onChange={(e) => setMoveQty(e.target.value)}
                className="w-full text-sm font-mono tabular-nums bg-white dark:bg-slate-700"
              />
              {/* Quick Preset Pills */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {effPackSize > 1 && availableQty >= effPackSize && (
                  <button
                    type="button"
                    onClick={() => setMoveQty(String(effPackSize))}
                    className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60 hover:bg-blue-100 cursor-pointer"
                  >
                    1 Pack ({effPackSize})
                  </button>
                )}
                {availableQty >= 2 && (
                  <button
                    type="button"
                    onClick={() => setMoveQty(String(Math.max(1, Math.floor(availableQty / 2))))}
                    className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 cursor-pointer"
                  >
                    Half ({Math.max(1, Math.floor(availableQty / 2))})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setMoveQty(String(availableQty))}
                  className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60 hover:bg-emerald-100 cursor-pointer"
                >
                  All ({availableQty})
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1 text-gray-700 dark:text-slate-300">
                Target Rack / Bin / Shelf
              </label>
              <GlassInput
                type="text"
                placeholder="e.g. Rack A-2 / Shelf 1"
                value={targetRack}
                onChange={(e) => setTargetRack(e.target.value)}
                className="w-full text-sm bg-white dark:bg-slate-700"
              />
              <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1.5">
                Optional shelf or rack code at {targetLocationObj?.name || "destination"}.
              </p>
            </div>
          </div>

          {/* Live Split Preview */}
          <div
            className={`p-3 rounded-xl border text-xs grid grid-cols-2 gap-3 ${
              isDark ? "bg-slate-900/40 border-slate-700/80" : "bg-blue-50/50 border-blue-200/60"
            }`}
          >
            <div>
              <span className="text-gray-500 dark:text-slate-400 block">
                Remaining at {currentLocationObj?.name || "Current"}:
              </span>
              <span className="font-mono font-bold text-sm">
                {remainingQty} units {remainingQty === 0 ? "(Full move)" : "(Split batch)"}
              </span>
            </div>
            <div className="text-right">
              <span className="text-gray-500 dark:text-slate-400 block">
                Moving to {targetLocationObj?.name || "Target"}:
              </span>
              <span className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                +{parsedMoveQty} units
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-200/70 dark:border-slate-700/70">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium border border-gray-300 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || parsedMoveQty <= 0}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <ArrowsRightLeftIcon className="w-4 h-4" />
              <span>{submitting ? "Moving..." : `Move ${parsedMoveQty} Units`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ManageStorageLocationsModal({
  isOpen,
  onClose,
  storageLocations = [],
  onChanged,
  isDark = false,
  selectStyles,
}) {
  const [form, setForm] = useState({
    id: null,
    name: "",
    code: "",
    type: "shop",
    default_rack: "",
    is_default: false,
  });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  if (!isOpen) return null;

  const resetForm = () =>
    setForm({
      id: null,
      name: "",
      code: "",
      type: "shop",
      default_rack: "",
      is_default: false,
    });

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Please enter a location name");
      return;
    }
    setSaving(true);
    try {
      if (form.id) {
        await axios.put(`/api/storage-locations/${form.id}`, {
          name: form.name.trim(),
          code: form.code.trim() || form.name.trim().toUpperCase().slice(0, 10),
          type: form.type,
          default_rack: form.default_rack.trim() || null,
          is_default: form.is_default,
        });
        toast.success("Storage location updated");
      } else {
        await axios.post("/api/storage-locations", {
          name: form.name.trim(),
          code: form.code.trim() || undefined,
          type: form.type,
          default_rack: form.default_rack.trim() || null,
          is_default: form.is_default,
        });
        toast.success("Storage location created");
      }
      resetForm();
      if (onChanged) await onChanged();
    } catch (err) {
      const msg =
        err?.response?.data?.errors?.code?.[0] ||
        err?.response?.data?.errors?.name?.[0] ||
        err?.response?.data?.message ||
        "Failed to save location";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (loc) => {
    if (loc.is_default) {
      toast.error("Cannot delete the default storage location.");
      return;
    }
    if (
      !window.confirm(
        `Delete storage location "${loc.name}"? Any products or batches assigned to it will be moved to your default location.`
      )
    ) {
      return;
    }
    setDeletingId(loc.id);
    try {
      await axios.delete(`/api/storage-locations/${loc.id}`);
      toast.success("Location deleted");
      if (onChanged) await onChanged();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Cannot delete location");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden ${
          isDark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-white border-gray-200 text-gray-900"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-center justify-between px-5 py-4 border-b ${
            isDark ? "border-slate-700 bg-slate-800/90" : "border-gray-200 bg-gray-50/80"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <BuildingStorefrontIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">Manage Storage Locations (Shop, Godown, Fridge)</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Create and organize physical stock areas without complicating your POS or invoices
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-5 max-h-[80dvh] overflow-y-auto">
          {/* Add / Edit Location Form */}
          <form
            onSubmit={handleSave}
            className={`p-4 rounded-xl border space-y-3.5 ${
              isDark ? "bg-slate-900/50 border-slate-700" : "bg-gray-50/80 border-gray-200"
            }`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-slate-300">
                  Location Name *
                </label>
                <GlassInput
                  type="text"
                  placeholder="e.g. Main Godown Floor 1"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full text-sm bg-white dark:bg-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-slate-300">
                  Short Code
                </label>
                <GlassInput
                  type="text"
                  placeholder="e.g. GDN-1"
                  value={form.code}
                  onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                  className="w-full text-sm font-mono bg-white dark:bg-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-slate-300">
                  Default Rack / Zone
                </label>
                <GlassInput
                  type="text"
                  placeholder="e.g. Zone A"
                  value={form.default_rack}
                  onChange={(e) => setForm((p) => ({ ...p, default_rack: e.target.value }))}
                  className="w-full text-sm bg-white dark:bg-slate-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-slate-300">
                  Location Type (React-Select)
                </label>
                <Select
                  options={LOCATION_TYPE_OPTIONS}
                  value={LOCATION_TYPE_OPTIONS.find((o) => o.value === form.type) || LOCATION_TYPE_OPTIONS[0]}
                  onChange={(opt) => setForm((p) => ({ ...p, type: opt?.value || "shop" }))}
                  styles={selectStyles}
                  classNamePrefix="rs"
                  isSearchable={false}
                  menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                  menuPosition="fixed"
                />
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_default}
                    onChange={(e) => setForm((p) => ({ ...p, is_default: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Set as Default Location</span>
                </label>
                <div className="flex items-center gap-2">
                  {form.id && (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="px-3 py-1.5 rounded-lg text-xs border border-gray-300 dark:border-slate-600 cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <PlusIcon className="w-4 h-4" />
                    <span>{saving ? "Saving..." : form.id ? "Update Location" : "Add Location"}</span>
                  </button>
                </div>
              </div>
            </div>
          </form>

          {/* Existing Locations Table */}
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
            <table className="w-full text-xs sm:text-sm text-left">
              <thead className={isDark ? "bg-slate-700/80 text-slate-200" : "bg-gray-50 text-gray-700"}>
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Name & Code</th>
                  <th className="px-4 py-2.5 font-semibold">Type</th>
                  <th className="px-4 py-2.5 font-semibold">Default Rack</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                {(storageLocations || []).map((loc) => {
                  const meta = getLocationTypeMeta(loc.type);
                  return (
                    <tr key={loc.id} className={isDark ? "hover:bg-slate-700/40" : "hover:bg-gray-50"}>
                      <td className="px-4 py-2.5 font-medium">
                        <div className="flex items-center gap-2">
                          <span>{loc.name}</span>
                          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300">
                            {loc.code}
                          </span>
                          {loc.is_default && (
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                              Default
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${meta.badgeClass}`}
                        >
                          {meta.shortLabel}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500 dark:text-slate-400">
                        {loc.default_rack || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setForm({
                                id: loc.id,
                                name: loc.name || "",
                                code: loc.code || "",
                                type: loc.type || "shop",
                                default_rack: loc.default_rack || "",
                                is_default: Boolean(loc.is_default),
                              })
                            }
                            className="p-1.5 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer"
                            title="Edit location"
                          >
                            <PencilSquareIcon className="w-4 h-4" />
                          </button>
                          {!loc.is_default && (
                            <button
                              type="button"
                              onClick={() => handleDelete(loc)}
                              disabled={deletingId === loc.id}
                              className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 cursor-pointer disabled:opacity-50"
                              title="Delete location"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

