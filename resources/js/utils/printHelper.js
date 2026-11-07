import toast from "react-hot-toast";

/**
 * Universal Direct & Silent Print Engine for Karobar-App.
 *
 * - In Windows Desktop (.exe via Electron): Sends slips/receipts/documents directly
 *   and silently to the configured or default Windows printer via offscreen worker
 *   IPC (`karobar:print-url`, `karobar:print-html`, `karobar:silent-print`) with
 *   ZERO popup windows and ZERO Windows print dialogs.
 * - In Web Browser: Uses an invisible in-page <iframe> so no popup tabs/windows open.
 */

export const PREFERRED_PRINTER_STORAGE_KEY = "karobar_preferred_printer";

export function getDesktopPrintBridge() {
  if (typeof window === "undefined") return null;
  try {
    if (window.karobarDesktop?.isDesktop) return window.karobarDesktop;
    if (window.parent && window.parent !== window && window.parent.karobarDesktop?.isDesktop) {
      return window.parent.karobarDesktop;
    }
    if (window.top && window.top !== window && window.top.karobarDesktop?.isDesktop) {
      return window.top.karobarDesktop;
    }
  } catch {
    // Ignore cross-origin frame access errors if any
  }
  return null;
}

export function getPreferredPrinter() {
  if (typeof window === "undefined") return "";
  try {
    return String(window.localStorage.getItem(PREFERRED_PRINTER_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function setPreferredPrinter(deviceName) {
  if (typeof window === "undefined") return;
  try {
    const clean = String(deviceName || "").trim();
    if (!clean || clean === "default" || clean === "system_default") {
      window.localStorage.removeItem(PREFERRED_PRINTER_STORAGE_KEY);
    } else {
      window.localStorage.setItem(PREFERRED_PRINTER_STORAGE_KEY, clean);
    }
  } catch {
    // ignore storage errors
  }
}

function runIframeUrlPrint(url) {
  return new Promise((resolve) => {
    try {
      const existing = document.getElementById("karobar-hidden-print-iframe");
      if (existing) {
        existing.remove();
      }

      const iframe = document.createElement("iframe");
      iframe.id = "karobar-hidden-print-iframe";
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.opacity = "0";
      iframe.style.pointerEvents = "none";

      let printed = false;
      const triggerPrint = () => {
        if (printed) return;
        printed = true;
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          // ignore
        }
        setTimeout(() => {
          try {
            iframe.remove();
          } catch {
            // ignore
          }
        }, 60000);
        resolve(true);
      };

      iframe.onload = () => {
        setTimeout(triggerPrint, 250);
      };

      iframe.src = url;
      document.body.appendChild(iframe);
    } catch {
      resolve(false);
    }
  });
}

function runIframeHtmlPrint(html) {
  return new Promise((resolve) => {
    try {
      const existing = document.getElementById("karobar-hidden-print-iframe");
      if (existing) {
        existing.remove();
      }

      const iframe = document.createElement("iframe");
      iframe.id = "karobar-hidden-print-iframe";
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.opacity = "0";
      iframe.style.pointerEvents = "none";

      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!doc) {
        resolve(false);
        return;
      }

      doc.open();
      doc.write(html);
      doc.close();

      let printed = false;
      const triggerPrint = () => {
        if (printed) return;
        printed = true;
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          // ignore
        }
        setTimeout(() => {
          try {
            iframe.remove();
          } catch {
            // ignore
          }
        }, 60000);
        resolve(true);
      };

      iframe.onload = () => {
        setTimeout(triggerPrint, 250);
      };
      setTimeout(triggerPrint, 500);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Directly print a slip/receipt/ledger URL (or `{ url, html }` response payload)
 * without any popup window or system print dialog in Desktop .exe.
 */
export async function printSlipUrl(urlOrPayload, options = {}) {
  const isObj = urlOrPayload && typeof urlOrPayload === "object";
  const url = isObj ? String(urlOrPayload.url || "").trim() : String(urlOrPayload || "").trim();
  const inlineHtml = isObj
    ? String(urlOrPayload.html || "").trim()
    : String(options.html || "").trim();

  // Fast-path: if the server already returned the rendered HTML alongside the signed URL,
  // print the HTML directly to avoid a second HTTP round-trip!
  if (inlineHtml) {
    return printSlipHtml(inlineHtml, options);
  }

  const desktop = getDesktopPrintBridge();
  const deviceName = options.deviceName ?? getPreferredPrinter();

  if (desktop && typeof desktop.printUrl === "function") {
    const toastId = options.toastId || "karobar-direct-print";
    if (!options.quiet) {
      toast.loading(options.loadingMessage || "Printing slip...", { id: toastId });
    }
    try {
      const res = await desktop.printUrl(url, {
        silent: options.silent !== false,
        deviceName: deviceName || undefined,
      });
      if (res?.ok) {
        if (!options.quiet) {
          toast.success(options.successMessage || "Slip sent to printer", { id: toastId });
        }
        return true;
      }
      if (!options.quiet) {
        toast.error(
          res?.error ? `Printer error: ${res.error}` : "Could not print slip. Check printer connection.",
          { id: toastId }
        );
      }
      return false;
    } catch (err) {
      if (!options.quiet) {
        toast.error(err?.message || "Failed to send slip to printer", { id: toastId });
      }
      return false;
    }
  }

  return runIframeUrlPrint(url);
}

/**
 * Directly print raw HTML (e.g. Purchase Order forecast, Cash Drawer shift report, Barcode labels)
 * without any popup window or system print dialog in Desktop .exe.
 */
export async function printSlipHtml(html, options = {}) {
  const desktop = getDesktopPrintBridge();
  const deviceName = options.deviceName ?? getPreferredPrinter();

  if (desktop && typeof desktop.printHtml === "function") {
    const toastId = options.toastId || "karobar-direct-print";
    if (!options.quiet) {
      toast.loading(options.loadingMessage || "Printing slip...", { id: toastId });
    }
    try {
      const res = await desktop.printHtml(html, {
        silent: options.silent !== false,
        deviceName: deviceName || undefined,
      });
      if (res?.ok) {
        if (!options.quiet) {
          toast.success(options.successMessage || "Sent to printer", { id: toastId });
        }
        return true;
      }
      if (!options.quiet) {
        toast.error(
          res?.error ? `Printer error: ${res.error}` : "Could not print. Check printer connection.",
          { id: toastId }
        );
      }
      return false;
    } catch (err) {
      if (!options.quiet) {
        toast.error(err?.message || "Failed to send document to printer", { id: toastId });
      }
      return false;
    }
  }

  return runIframeHtmlPrint(html);
}

/**
 * Directly print the current page's @media print view silently in Desktop .exe,
 * or via window.print() in a standard web browser.
 */
export async function printCurrentView(options = {}) {
  const desktop = getDesktopPrintBridge();
  const deviceName = options.deviceName ?? getPreferredPrinter();

  if (desktop && typeof desktop.silentPrint === "function") {
    const toastId = options.toastId || "karobar-direct-print";
    if (!options.quiet) {
      toast.loading(options.loadingMessage || "Printing document...", { id: toastId });
    }
    try {
      const res = await desktop.silentPrint({
        silent: options.silent !== false,
        deviceName: deviceName || undefined,
      });
      if (res?.ok) {
        if (!options.quiet) {
          toast.success(options.successMessage || "Document sent to printer", { id: toastId });
        }
        return true;
      }
      if (!options.quiet) {
        toast.error(
          res?.error ? `Printer error: ${res.error}` : "Could not print document. Check printer connection.",
          { id: toastId }
        );
      }
      return false;
    } catch (err) {
      if (!options.quiet) {
        toast.error(err?.message || "Failed to print document", { id: toastId });
      }
      return false;
    }
  }

  if (typeof window !== "undefined" && typeof window.print === "function") {
    window.print();
    return true;
  }
  return false;
}

export const printUrlViaIframe = printSlipUrl;
export const printHtmlViaIframe = printSlipHtml;

// Ensure window.print() in both the main window and any MDI sub-window <iframe>
// routes through silent desktop printing when running inside the Windows Desktop .exe
if (typeof window !== "undefined") {
  try {
    const desktop = getDesktopPrintBridge();
    if (desktop) {
      if (!window.karobarDesktop) {
        window.karobarDesktop = desktop;
      }
      window.print = () => {
        printCurrentView();
      };
    }
  } catch {
    // ignore
  }
}
