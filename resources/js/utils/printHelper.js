/**
 * Universal print helper that prints a URL or raw HTML via a popup window when allowed,
 * and seamlessly falls back to an in-page hidden <iframe> if popups are blocked.
 */

export function printUrlViaIframe(url) {
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

export function printHtmlViaIframe(html) {
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
