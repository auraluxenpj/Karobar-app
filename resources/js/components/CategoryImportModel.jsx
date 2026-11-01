import { useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTheme } from "@/context/ThemeContext.jsx";

// Helper to determine text color based on background brightness
const getContrastText = (hexColor) => {
  hexColor = hexColor.replace('#', '');
  const r = parseInt(hexColor.substring(0, 2), 16);
  const g = parseInt(hexColor.substring(2, 4), 16);
  const b = parseInt(hexColor.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
};

export default function CategoryImportModal({ open, onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [delimiter, setDelimiter] = useState(",");
  const [validating, setValidating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [res, setRes] = useState(null);

  const { theme } = useTheme();

  // Memoize theme colors for performance
  const themeColors = useMemo(() => {
    if (!theme) {
      return {
        primary: '#3b82f6',
        primaryHover: '#2563eb',
        success: '#10b981',
        successHover: '#059669',
        danger: '#ef4444',
        dangerHover: '#dc2626',
      };
    }
    return {
      primary: theme.primary_color || '#3b82f6',
      primaryHover: theme.primary_hover || '#2563eb',
      success: '#10b981',
      successHover: '#059669',
      danger: '#ef4444',
      dangerHover: '#dc2626',
    };
  }, [theme]);

  // Calculate text colors based on background brightness
  const primaryTextColor = useMemo(() => 
    getContrastText(themeColors.primaryHover || themeColors.primary), 
    [themeColors.primary, themeColors.primaryHover]
  );
  
  const successTextColor = useMemo(() => 
    getContrastText(themeColors.successHover || themeColors.success), 
    [themeColors.success, themeColors.successHover]
  );
  
  const dangerTextColor = useMemo(() => 
    getContrastText(themeColors.dangerHover || themeColors.danger), 
    [themeColors.danger, themeColors.dangerHover]
  );

  const canValidate = useMemo(() => !!file && !validating, [file, validating]);

  const reset = () => {
    setFile(null); setDelimiter(","); setValidating(false); setCommitting(false); setRes(null);
  };

  const handleValidate = async () => {
    if (!file) return;
    try {
      setValidating(true);
      const form = new FormData();
      form.append("file", file);
      form.append("delimiter", delimiter);
      const { data } = await axios.post("/api/categories/import/validate", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setRes(data);
      if (data.invalid > 0) toast.error(`Found ${data.invalid} invalid row(s).`);
      else toast.success(`All ${data.valid} row(s) are valid.`);
    } catch (e) {
      const d = e?.response?.data;
      toast.error(d?.message || "Validation failed");
    } finally {
      setValidating(false);
    }
  };

  const handleCommit = async (insertValidOnly = true) => {
    if (!res?.token) return;
    try {
      setCommitting(true);
      const { data } = await axios.post("/api/categories/import/commit", {
        token: res.token,
        insert_valid_only: insertValidOnly,
        delimiter,
      });
      toast.success(data?.message || "Import complete");
      onImported?.();
      reset(); onClose?.();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Import failed");
    } finally {
      setCommitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
      <div className="bg-white dark:bg-slate-800 w-[min(1000px,95vw)] max-h-[92dvh] flex flex-col rounded-2xl shadow-xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b flex items-center justify-between shrink-0 dark:border-slate-600">
          <h2 className="text-xl font-semibold dark:text-white">Import Categories (CSV)</h2>
          <button 
            className="px-3 py-1 rounded-sm border hover:bg-gray-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            onClick={() => { reset(); onClose?.(); }}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-6">
          {!res ? (
            <div className="space-y-3">
              <label className="block text-sm font-medium dark:text-slate-200">
                Choose CSV file <span className="text-gray-500 dark:text-slate-400">(header: name)</span>
              </label>
              <input 
                type="file" 
                accept=".csv,text/csv"
                onChange={(e)=>setFile(e.target.files?.[0]||null)}
                className="block w-full border rounded-sm p-2 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200" 
              />
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-700 dark:text-slate-300">Delimiter</label>
                <select 
                  value={delimiter} 
                  onChange={(e)=>setDelimiter(e.target.value)}
                  className="border rounded-sm h-9 px-2 text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200"
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
                  href="/api/categories/import/template" 
                  className="underline"
                  style={{ color: themeColors.primary }}
                >
                  Download CSV template
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <Badge label={`Total: ${res.total}`} variant="gray" />
                <Badge label={`Valid: ${res.valid}`} variant="green" />
                <Badge label={`Invalid: ${res.invalid}`} variant={res.invalid ? "red" : "green"} />
              </div>

              {res.invalid_samples?.length > 0 && (
                <div>
                  <h3 className="font-medium mb-2 dark:text-slate-200">Invalid sample rows:</h3>
                  <div className="max-h-56 overflow-auto border rounded-sm dark:border-slate-600">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0 dark:bg-slate-700">
                        <tr>
                          <Th>Row#</Th><Th>Name</Th><Th>Errors</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {res.invalid_samples.map((r,i)=>(
                          <tr key={i} className="odd:bg-white even:bg-gray-50 dark:odd:bg-slate-700/40 dark:even:bg-slate-800/40">
                            <Td>{r.row}</Td><Td>{r.data?.name}</Td>
                            <Td>
                              <ul className="list-disc ml-6 dark:text-slate-300">
                                {Object.values(r.errors||{}).map((e,j)=><li key={j}>{e}</li>)}
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
                  <h3 className="font-medium mb-2 dark:text-slate-200">Valid sample rows:</h3>
                  <div className="max-h-48 overflow-auto border rounded-sm dark:border-slate-600">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0 dark:bg-slate-700">
                        <tr><Th>Row#</Th><Th>Name</Th></tr>
                      </thead>
                      <tbody>
                        {res.valid_samples.map((r,i)=>(
                          <tr key={i} className="odd:bg-white even:bg-gray-50 dark:odd:bg-slate-700/40 dark:even:bg-slate-800/40">
                            <Td>{r.row}</Td><Td>{r.data?.name}</Td>
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

        <div className="px-4 sm:px-6 py-4 border-t flex flex-wrap gap-3 items-center justify-between shrink-0 dark:border-slate-600">
          {!res ? (
            <>
              <div className="text-sm text-gray-600 dark:text-slate-400">
                CSV header: <code className="dark:text-slate-300">name</code>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  className="theme-btn theme-btn-tertiary"
                  onClick={()=>{reset(); onClose?.();}}
                >
                  Cancel
                </button>
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
                onClick={reset}
              >
                Start Over
              </button>
              <div className="flex items-center gap-2">
                <button 
                  disabled={committing} 
                  onClick={()=>handleCommit(true)}
                  className="theme-btn theme-btn-success"
                >
                  {committing ? 'Importing…' : `Import ${res.invalid ? 'Valid Rows Only' : 'All'}`}
                </button>
                {res.invalid > 0 && (
                  <button 
                    disabled={committing} 
                    onClick={()=>handleCommit(false)}
                    className="theme-btn theme-btn-danger"
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

function Badge({ label, variant="gray" }) {
  const colorMap = {
    gray: { bg: '#f3f4f6', text: '#374151', darkBg: '#374151', darkText: '#e5e7eb' },
    green: { bg: '#dcfce7', text: '#16a34a', darkBg: '#166534', darkText: '#bbf7d0' },
    red: { bg: '#fee2e2', text: '#dc2626', darkBg: '#991b1b', darkText: '#fecaca' },
  };
  const colors = colorMap[variant] || colorMap.gray;
  
  return (
    <span 
      className="inline-flex items-center px-2 py-1 rounded-sm text-sm"
      style={{ 
        backgroundColor: colors.bg, 
        color: colors.text 
      }}
    >
      {label}
    </span>
  );
}

function Th({children}){ 
  return (
    <th className="border p-2 text-left dark:border-slate-600 dark:text-slate-300">
      {children}
    </th>
  ); 
}

function Td({children}){ 
  return (
    <td className="border p-2 dark:border-slate-600 dark:text-slate-200">
      {children}
    </td>
  ); 
}

