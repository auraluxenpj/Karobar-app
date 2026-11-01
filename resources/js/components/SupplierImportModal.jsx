// src/components/SupplierImportModal.jsx
import { useState, useMemo } from "react";
import axios from "axios";
import toast from "react-hot-toast";

export default function SupplierImportModal({ open, onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [delimiter, setDelimiter] = useState(",");
  const [validating, setValidating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [res, setRes] = useState(null); // server validate response with token

  const canValidate = useMemo(() => !!file && !validating, [file, validating]);

  const reset = () => {
    setFile(null);
    setRes(null);
    setValidating(false);
    setCommitting(false);
    setDelimiter(",");
  };

  const handleValidate = async () => {
    if (!file) return;
    try {
      setValidating(true);
      const form = new FormData();
      form.append("file", file);
      form.append("delimiter", delimiter);

      const { data } = await axios.post("/api/suppliers/import/validate", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setRes(data);
      if (data.invalid > 0) {
        toast.error(`Found ${data.invalid} invalid row(s). You can still import valid rows.`);
      } else {
        toast.success(`All ${data.valid} row(s) are valid.`);
      }
    } catch (e) {
      const msg = e?.response?.data?.message || "Validation failed";
      toast.error(msg);
    } finally {
      setValidating(false);
    }
  };

  const handleCommit = async (insertValidOnly = true) => {
    if (!res?.token) return;
    try {
      setCommitting(true);
      const { data } = await axios.post("/api/suppliers/import/commit", {
        token: res.token,
        insert_valid_only: insertValidOnly,
        delimiter,
      });
      toast.success(data?.message || "Import complete");
      onImported?.(); // refresh suppliers list
      reset();
      onClose?.();
    } catch (e) {
      const msg = e?.response?.data?.message || "Import failed";
      toast.error(msg);
    } finally {
      setCommitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
      <div className="bg-white dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700 border border-transparent w-[min(1000px,95vw)] max-h-[92dvh] flex flex-col rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b dark:border-slate-700 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-semibold dark:text-slate-100">Import Suppliers (CSV)</h2>
          <button
            className="px-3 py-1 rounded-sm border hover:bg-gray-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={() => { reset(); onClose?.(); }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Step 1: Select file */}
          {!res && (
            <>
              <div className="space-y-3">
                <label className="block text-sm font-medium dark:text-slate-200">
                  Choose CSV file <span className="text-gray-500 dark:text-slate-400">(header required: name,address,phone)</span>
                </label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="block w-full border rounded-sm p-2 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-700 dark:text-slate-300">Delimiter</label>
                  <select
                    value={delimiter}
                    onChange={(e) => setDelimiter(e.target.value)}
                    className="border rounded-sm h-9 px-2 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                  >
                    <option value=",">Comma (,)</option>
                    <option value=";">Semicolon (;)</option>
                    <option value="\t">Tab</option>
                    <option value="|">Pipe (|)</option>
                  </select>
                </div>
                <div className="text-sm text-gray-600 dark:text-slate-400">
                  Need a sample?{" "}
                  <a
                    href="/api/suppliers/import/template"
                    className="text-blue-600 dark:text-blue-400 underline"
                  >
                    Download CSV template
                  </a>
                </div>
              </div>
            </>
          )}

          {/* Step 2: Review */}
          {res && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <Badge label={`Total: ${res.total}`} />
                <Badge label={`Valid: ${res.valid}`} variant="green" />
                <Badge label={`Invalid: ${res.invalid}`} variant={res.invalid ? "red" : "green"} />
              </div>

              {res.invalid_samples?.length > 0 && (
                <div>
                  <h3 className="font-medium mb-2 dark:text-slate-200">Invalid sample rows (first {res.invalid_samples.length}):</h3>
                  <div className="max-h-64 overflow-auto border rounded-sm dark:border-slate-700">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-slate-800 sticky top-0">
                        <tr>
                          <Th>Row#</Th><Th>Name</Th><Th>Address</Th><Th>Phone</Th><Th>Errors</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {res.invalid_samples.map((r, idx) => (
                          <tr key={idx} className="odd:bg-white even:bg-gray-50 dark:odd:bg-slate-800/40 dark:even:bg-slate-900/40">
                            <Td>{r.row}</Td>
                            <Td>{r.data?.name}</Td>
                            <Td>{r.data?.address}</Td>
                            <Td>{r.data?.phone}</Td>
                            <Td>
                              <ul className="list-disc ml-6">
                                {Object.values(r.errors || {}).map((e, i) => <li key={i}>{e}</li>)}
                              </ul>
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {res.valid_samples?.length > 0 && (
                <div>
                  <h3 className="font-medium mb-2 dark:text-slate-200">Valid sample rows (first {res.valid_samples.length}):</h3>
                  <div className="max-h-48 overflow-auto border rounded-sm dark:border-slate-700">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-slate-800 sticky top-0">
                        <tr>
                          <Th>Row#</Th><Th>Name</Th><Th>Address</Th><Th>Phone</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {res.valid_samples.map((r, idx) => (
                          <tr key={idx} className="odd:bg-white even:bg-gray-50 dark:odd:bg-slate-800/40 dark:even:bg-slate-900/40">
                            <Td>{r.row}</Td>
                            <Td>{r.data?.name}</Td>
                            <Td>{r.data?.address}</Td>
                            <Td>{r.data?.phone}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {res.invalid > 0 && (
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Tip: Fix your CSV to reduce invalid rows, or continue and we’ll import only the valid ones.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-4 border-t dark:border-slate-700 flex flex-wrap gap-3 items-center justify-between shrink-0">
          {!res ? (
            <>
              <div className="text-sm text-gray-600 dark:text-slate-400">CSV with header: <code>name,address,phone</code></div>
              <div className="flex items-center gap-2">
                <button
                  className="theme-btn theme-btn-tertiary"
                  onClick={() => { reset(); onClose?.(); }}
                >Cancel</button>
                <button
                  disabled={!canValidate}
                  onClick={handleValidate}
                  className="theme-btn theme-btn-primary"
                >
                  {validating ? 'Validating…' : 'Validate'}
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                className="theme-btn theme-btn-tertiary"
                onClick={() => { reset(); }}
              >Start Over</button>
              <div className="flex items-center gap-2">
                <button
                  disabled={committing}
                  onClick={() => handleCommit(true)}
                  className="theme-btn theme-btn-success"
                  title="Insert/Update only valid rows"
                >
                  {committing ? 'Importing…' : `Import ${res.invalid ? 'Valid Rows Only' : 'All'}`}
                </button>
                {res.invalid > 0 && (
                  <button
                    disabled={committing}
                    onClick={() => handleCommit(false)}
                    className="theme-btn theme-btn-danger"
                    title="Abort on error"
                  >
                    Import (Abort on Error)
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Badge({ label, variant = "gray" }) {
  const map = {
    gray:  "bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-200",
    green: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    red:   "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    blue:  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  };
  return <span className={`inline-flex items-center px-2 py-1 rounded-sm text-sm ${map[variant]}`}>{label}</span>;
}

function Th({ children }) { return <th className="border dark:border-slate-700 p-2 text-left dark:text-slate-200">{children}</th>; }
function Td({ children }) { return <td className="border dark:border-slate-700 p-2 dark:text-slate-200">{children}</td>; }
