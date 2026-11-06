const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const net = require("net");
const http = require("http");
const https = require("https");
const { spawn, execFileSync } = require("child_process");

let mainWindow = null;
let splashWindow = null;
let tray = null;
let phpServerProcess = null;
let schedulerProcess = null;
let activePort = 18942;
let isQuitting = false;

/**
 * Resolve the root Laravel application directory whether running unpacked in an
 * Inno Setup installation folder or directly from the repository during development.
 */
function resolveAppRoot() {
  const candidates = [
    process.env.KAROBAR_APP_ROOT,
    path.resolve(path.dirname(process.execPath), "app"),
    path.resolve(path.dirname(process.execPath), ".."),
    path.resolve(__dirname, ".."),
  ].filter(Boolean);

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "artisan")) && fs.existsSync(path.join(dir, "public", "index.php"))) {
      return dir;
    }
  }
  return path.resolve(__dirname, "..");
}

const APP_ROOT = resolveAppRoot();

/**
 * Resolve bundled portable PHP binary (runtime/php/php.exe) or system fallback.
 */
function resolvePhpBinary() {
  const winCandidates = [
    path.join(APP_ROOT, "runtime", "php", "php.exe"),
    path.join(path.dirname(process.execPath), "runtime", "php", "php.exe"),
  ];
  for (const c of winCandidates) {
    if (fs.existsSync(c)) return c;
  }
  return process.platform === "win32" ? "php.exe" : "php";
}

/**
 * Resolve bundled portable Node.js binary (runtime/node/node.exe) for the Local WhatsApp Agent.
 */
function resolveNodeBinary() {
  const winCandidates = [
    path.join(APP_ROOT, "runtime", "node", "node.exe"),
    path.join(path.dirname(process.execPath), "runtime", "node", "node.exe"),
  ];
  for (const c of winCandidates) {
    if (fs.existsSync(c)) return c;
  }
  return process.platform === "win32" ? "node.exe" : "node";
}

/**
 * Find an available localhost TCP port starting from preferredPort.
 */
function findFreePort(preferredPort = 18942) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => {
      resolve(findFreePort(preferredPort + 1));
    });
    server.listen(preferredPort, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/**
 * Build the child process environment with bundled PHP & Node paths injected.
 */
function buildRuntimeEnv(port) {
  const phpBin = resolvePhpBinary();
  const nodeBin = resolveNodeBinary();
  const sep = process.platform === "win32" ? ";" : ":";
  const extraPaths = [path.dirname(phpBin), path.dirname(nodeBin)].filter(
    (p) => p && p !== "."
  );

  return {
    ...process.env,
    APP_URL: `http://127.0.0.1:${port}`,
    PHP_CLI_SERVER_WORKERS: "4",
    WHATSAPP_NODE_BINARY: nodeBin,
    NODE_BINARY: nodeBin,
    PATH: [...extraPaths, process.env.PATH || ""].join(sep),
  };
}

/**
 * Start the embedded PHP HTTP server and Laravel Scheduler background process.
 */
async function startBackendServices() {
  activePort = await findFreePort(18942);
  const phpBin = resolvePhpBinary();
  const routerScript = path.join(APP_ROOT, "desktop", "router.php");
  const publicDir = path.join(APP_ROOT, "public");
  const env = buildRuntimeEnv(activePort);

  // Prevent stale public/hot dev marker from hijacking asset URLs in packaged desktop builds
  const hotFile = path.join(publicDir, "hot");
  const manifestFile = path.join(publicDir, "build", "manifest.json");
  if (fs.existsSync(manifestFile) && fs.existsSync(hotFile) && !process.env.KAROBAR_DEV_HMR) {
    try {
      fs.unlinkSync(hotFile);
    } catch {
      // ignore
    }
  }

  phpServerProcess = spawn(
    phpBin,
    [
      "-d",
      "variables_order=EGPCS",
      "-d",
      "memory_limit=512M",
      "-d",
      "upload_max_filesize=64M",
      "-d",
      "post_max_size=64M",
      "-S",
      `127.0.0.1:${activePort}`,
      "-t",
      publicDir,
      routerScript,
    ],
    {
      cwd: APP_ROOT,
      env,
      windowsHide: true,
      stdio: "ignore",
    }
  );

  // Start Laravel Scheduler worker (`php artisan schedule:work`) for automated backups & recurring expenses
  schedulerProcess = spawn(phpBin, ["artisan", "schedule:work"], {
    cwd: APP_ROOT,
    env,
    windowsHide: true,
    stdio: "ignore",
  });

  await waitForServerReady(`http://127.0.0.1:${activePort}/up`, 15000);
}

function waitForServerReady(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(true);
      });
      req.on("error", () => {
        if (Date.now() - start >= timeoutMs) {
          resolve(false);
        } else {
          setTimeout(check, 200);
        }
      });
      req.setTimeout(1000, () => {
        req.destroy();
      });
    };
    check();
  });
}

function stopBackendServices() {
  for (const proc of [phpServerProcess, schedulerProcess]) {
    if (proc && !proc.killed) {
      try {
        proc.kill();
      } catch {
        // ignore
      }
    }
  }
  phpServerProcess = null;
  schedulerProcess = null;
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 310,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    show: true,
    backgroundColor: "#0f172a",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  splashWindow.loadFile(path.join(__dirname, "splash.html"));
}

function resolveIconPath() {
  const candidates = [
    path.join(__dirname, "icon.ico"),
    path.join(__dirname, "icon.png"),
    path.join(APP_ROOT, "desktop", "icon.ico"),
    path.join(APP_ROOT, "public", "logo.png"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

let openMenuClicksInSubWindow = false;

function sendNavigate(routePath, title) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (openMenuClicksInSubWindow) {
    mainWindow.webContents.send("karobar:open-subwindow", { path: routePath, title });
  } else {
    mainWindow.webContents.send("karobar:navigate", { path: routePath, title });
  }
}

function sendOpenSubWindow(routePath, title) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("karobar:open-subwindow", { path: routePath, title });
}

function sendWindowCommand(command, payload = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("karobar:window-command", { command, ...payload });
}

function buildSectionMenu(sectionLabel, items) {
  return {
    label: sectionLabel,
    submenu: [
      ...items.map((item) => ({
        label: item.label,
        accelerator: item.accelerator || undefined,
        click: () => sendNavigate(item.path, item.label),
      })),
      { type: "separator" },
      {
        label: "Open in Sub-Window ▸",
        submenu: items.map((item) => ({
          label: `⧉ ${item.label}`,
          click: () => sendOpenSubWindow(item.path, item.label),
        })),
      },
    ],
  };
}

function createApplicationMenu() {
  const menuTemplate = [
    {
      label: "File & Workspace",
      submenu: [
        {
          label: "Dashboard (Main View)",
          accelerator: "CmdOrCtrl+Shift+H",
          click: () => sendNavigate("/dashboard", "Dashboard"),
        },
        {
          label: "Open Current Page in Sub-Window",
          accelerator: "CmdOrCtrl+Shift+N",
          click: () => sendWindowCommand("open-current"),
        },
        { type: "separator" },
        {
          label: "Quick Sub-Window: Barcode POS",
          accelerator: "CmdOrCtrl+Shift+P",
          click: () => sendOpenSubWindow("/sale-invoices/pos", "Barcode POS"),
        },
        {
          label: "Quick Sub-Window: Retail Sale Invoice",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => sendOpenSubWindow("/sale-invoices/create/retail", "Create Retail Sale"),
        },
        {
          label: "Quick Sub-Window: Wholesale Invoice",
          accelerator: "CmdOrCtrl+Shift+W",
          click: () => sendOpenSubWindow("/sale-invoices/create/wholesale", "Create Wholesale Sale"),
        },
        {
          label: "Quick Sub-Window: Purchase Invoice",
          accelerator: "CmdOrCtrl+Shift+U",
          click: () => sendOpenSubWindow("/purchase-invoices/create", "Create Purchase Invoice"),
        },
        {
          label: "Quick Sub-Window: Customer Ledger",
          accelerator: "CmdOrCtrl+Shift+L",
          click: () => sendOpenSubWindow("/customer-ledger", "Customer Ledger"),
        },
        { type: "separator" },
        {
          label: "Check for Software Updates…",
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("karobar:trigger-update-check", { manual: true });
            }
          },
        },
        {
          label: "Run Database Backup Now",
          click: () => {
            try {
              execFileSync(resolvePhpBinary(), ["artisan", "backup:run-scheduled", "--force"], {
                cwd: APP_ROOT,
                windowsHide: true,
              });
            } catch {
              // ignore
            }
          },
        },
        {
          label: "Reload Application",
          accelerator: "CmdOrCtrl+Shift+R",
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.reload();
            }
          },
        },
        { type: "separator" },
        {
          label: "Exit Karobar-App",
          accelerator: "Alt+F4",
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ],
    },
    buildSectionMenu("Items & Masters", [
      { label: "Products", path: "/products" },
      { label: "Add Product", path: "/products/create" },
      { label: "Product Batches", path: "/product-batches" },
      { label: "Categories", path: "/categories" },
      { label: "Brands", path: "/brands" },
      { label: "Add Brand", path: "/brands/create" },
      { label: "Suppliers", path: "/suppliers" },
      { label: "Add Supplier", path: "/suppliers/create" },
      { label: "Customers", path: "/customers" },
      { label: "Add Customer", path: "/customers/create" },
      { label: "Barcode Studio", path: "/barcode-labels" },
    ]),
    buildSectionMenu("Invoices & POS", [
      { label: "Barcode POS Terminal", path: "/sale-invoices/pos" },
      { label: "Sale Invoices", path: "/sale-invoices" },
      { label: "Create Retail Sale Invoice", path: "/sale-invoices/create/retail" },
      { label: "Wholesale Invoices", path: "/wholesale-invoices" },
      { label: "Create Wholesale Invoice", path: "/sale-invoices/create/wholesale" },
      { label: "Purchase Invoices", path: "/purchase-invoices" },
      { label: "Create Purchase Invoice", path: "/purchase-invoices/create" },
      { label: "Purchase Orders", path: "/purchase-orders" },
      { label: "Create Purchase Order", path: "/purchase-orders/create" },
      { label: "Smart Reorder Forecast", path: "/smart-reorder" },
    ]),
    buildSectionMenu("Returns", [
      { label: "Sale Returns", path: "/sale-returns" },
      { label: "Create Sale Return", path: "/sale-returns/create" },
      { label: "Purchase Returns", path: "/purchase-returns" },
      { label: "Create Purchase Return", path: "/purchase-returns/create" },
    ]),
    buildSectionMenu("Stock & Inventory", [
      { label: "Batch & Expiry", path: "/batch-expiry" },
      { label: "User Demands", path: "/user-demands" },
      { label: "Request Product", path: "/user-demands/create" },
      { label: "Stock Adjustments", path: "/stock-adjustments" },
      { label: "Add Stock Adjustment", path: "/stock-adjustments/create" },
      { label: "Stocktake Sessions", path: "/stocktake-sessions" },
      { label: "New Stocktake Session", path: "/stocktake-sessions/create" },
      { label: "Quarantine & Disposal", path: "/stock-disposals" },
      { label: "New Disposal", path: "/stock-disposals/create" },
    ]),
    buildSectionMenu("Finance & Ledgers", [
      { label: "Customer Ledger", path: "/customer-ledger" },
      { label: "Supplier Ledger", path: "/supplier-ledger" },
      { label: "Payment Vouchers", path: "/payments" },
      { label: "Cash Drawer", path: "/cash-drawer" },
      { label: "Financial Accounts", path: "/accounts" },
      { label: "Operating Expenses", path: "/expenses" },
      { label: "Double-Entry & GL", path: "/accounting" },
      { label: "HR, Payroll & Commissions", path: "/hr-payroll" },
    ]),
    buildSectionMenu("Reports", [
      { label: "Net Profit (P&L)", path: "/reports/net-profit" },
      { label: "Statutory Tax Return", path: "/reports/tax-return" },
      { label: "Cost of Sale", path: "/reports/cost-of-sale" },
      { label: "Cost of Sale Detail", path: "/reports/cost-of-sale-detail" },
      { label: "Outstanding Aging", path: "/reports/outstanding-aging" },
      { label: "Sale Detail", path: "/reports/sale-detail" },
      { label: "Purchase Detail", path: "/reports/purchase-detail" },
      { label: "Purchase Summary", path: "/reports/purchase-summary" },
      { label: "Sale Returns Report", path: "/reports/sale-returns" },
      { label: "Purchase Returns Report", path: "/reports/purchase-returns" },
      { label: "Current Stock", path: "/reports/current-stock" },
      { label: "Low Stock & Reorder", path: "/reports/reorder" },
      { label: "Product Comprehensive", path: "/reports/product-comprehensive" },
      { label: "Near Expiry Product", path: "/reports/near-expiry-product" },
      { label: "Stock Adjustment Report", path: "/reports/stock-adjustment" },
    ]),
    buildSectionMenu("System & Settings", [
      { label: "Settings", path: "/settings" },
      { label: "Users", path: "/users" },
      { label: "Add User", path: "/users/create" },
      { label: "Roles", path: "/roles" },
      { label: "Create Role", path: "/roles/create" },
      { label: "Backups & Storage", path: "/backups" },
      { label: "Setup Genie Wizard", path: "/setup" },
      { label: "License Activation", path: "/license-activation" },
    ]),
    {
      label: "Sub-Windows (MDI)",
      submenu: [
        {
          label: "Always Open Top Menu Clicks in Sub-Window",
          type: "checkbox",
          checked: openMenuClicksInSubWindow,
          click: (menuItem) => {
            openMenuClicksInSubWindow = Boolean(menuItem.checked);
            sendWindowCommand("set-menu-subwindow-mode", { enabled: openMenuClicksInSubWindow });
          },
        },
        { type: "separator" },
        {
          label: "+ New Sub-Window (Current Page)",
          accelerator: "CmdOrCtrl+Shift+N",
          click: () => sendWindowCommand("open-current"),
        },
        {
          label: "+ Sale & Purchase Split Workspace (Dual Sub-Windows)",
          accelerator: "CmdOrCtrl+Shift+D",
          click: () => sendWindowCommand("preset-sale-purchase"),
        },
        { type: "separator" },
        {
          label: "Tile Sub-Windows Side-by-Side (2 Columns)",
          accelerator: "CmdOrCtrl+Shift+T",
          click: () => sendWindowCommand("tile"),
        },
        {
          label: "Grid Sub-Windows (2x2 Quad View)",
          accelerator: "CmdOrCtrl+Shift+G",
          click: () => sendWindowCommand("grid"),
        },
        {
          label: "Cascade Sub-Windows",
          accelerator: "CmdOrCtrl+Shift+C",
          click: () => sendWindowCommand("cascade"),
        },
        {
          label: "Minimize All Sub-Windows",
          accelerator: "CmdOrCtrl+Shift+M",
          click: () => sendWindowCommand("minimize-all"),
        },
        {
          label: "Restore All Sub-Windows",
          click: () => sendWindowCommand("restore-all"),
        },
        {
          label: "Close All Sub-Windows",
          accelerator: "CmdOrCtrl+Shift+X",
          click: () => sendWindowCommand("close-all"),
        },
        { type: "separator" },
        { role: "togglefullscreen" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { role: "resetZoom" },
      ],
    },
  ];

  const appMenu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(appMenu);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setMenu(appMenu);
    mainWindow.setMenuBarVisibility(true);
  }
}

function isInternalOrPrintPopupUrl(rawUrl) {
  const u = String(rawUrl || "").trim();
  if (
    !u ||
    u === "about:blank" ||
    u.startsWith("about:") ||
    u.startsWith("blob:") ||
    u.startsWith("data:") ||
    u.startsWith("/") ||
    u.startsWith("http://127.0.0.1") ||
    u.startsWith("http://localhost")
  ) {
    return true;
  }
  return false;
}

function configurePopupAndPrintHandler(contents) {
  if (!contents || typeof contents.setWindowOpenHandler !== "function") return;

  contents.setWindowOpenHandler(({ url }) => {
    if (isInternalOrPrintPopupUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 980,
          height: 760,
          autoHideMenuBar: true,
          title: "Karobar-App — Print / Document Preview",
          icon: resolveIconPath(),
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
          },
        },
      };
    }

    if (/^(https?:|mailto:|whatsapp:|tel:)/i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
}

function createMainWindow() {
  const iconPath = resolveIconPath();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: "Karobar-App",
    icon: iconPath,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  createApplicationMenu();

  // Allow print popups (about:blank, blob:, local print routes) and open external web links in default browser
  configurePopupAndPrintHandler(mainWindow.webContents);

  mainWindow.loadURL(`http://127.0.0.1:${activePort}/`);

  mainWindow.once("ready-to-show", () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.maximize();
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on("close", () => {
    isQuitting = true;
  });
}

function createSystemTray() {
  const iconPath = resolveIconPath();
  if (!iconPath) return;

  try {
    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Open Karobar-App",
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      {
        label: "Check for Updates…",
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send("karobar:trigger-update-check", { manual: true });
          }
        },
      },
      {
        label: "Run Backup Now",
        click: () => {
          try {
            execFileSync(resolvePhpBinary(), ["artisan", "backup:run-scheduled", "--force"], {
              cwd: APP_ROOT,
              windowsHide: true,
            });
          } catch {
            // ignore
          }
        },
      },
      { type: "separator" },
      {
        label: "Quit Karobar-App",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);
    tray.setToolTip("Karobar-App");
    tray.setContextMenu(contextMenu);
  } catch {
    // Ignore tray icon errors if format is unsupported on platform
  }
}

// Ensure sub-window iframes and child windows also allow print popups
app.on("web-contents-created", (_event, contents) => {
  configurePopupAndPrintHandler(contents);
});

// Single-Instance Lock: prevent multiple conflicting instances on the same PC
const gotSingleLock = app.requestSingleInstanceLock();
if (!gotSingleLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    createSplashWindow();
    await startBackendServices();
    createSystemTray();
    createMainWindow();
  });
}

// Native Desktop IPC Handlers
ipcMain.handle("karobar:app-info", () => ({
  version: app.getVersion(),
  appRoot: APP_ROOT,
  port: activePort,
  platform: process.platform,
}));

ipcMain.handle("karobar:get-printers", async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return [];
  try {
    return await mainWindow.webContents.getPrintersAsync();
  } catch {
    return [];
  }
});

/**
 * Resolve a requested Windows printer deviceName against currently installed printers.
 * Falls back to undefined (Windows system default printer) if not specified or no longer present.
 */
async function resolveTargetPrinterName(contents, requestedDeviceName) {
  const requested = String(requestedDeviceName || "").trim();
  if (!requested || requested === "default" || requested === "system_default") {
    return undefined;
  }
  try {
    const printers = await contents.getPrintersAsync();
    if (!Array.isArray(printers) || printers.length === 0) return undefined;
    const exact = printers.find((p) => p && p.name === requested);
    if (exact) return exact.name;
    const caseInsensitive = printers.find(
      (p) => p && String(p.name || "").toLowerCase() === requested.toLowerCase()
    );
    return caseInsensitive ? caseInsensitive.name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Wait for all images, SVGs, and fonts inside an offscreen print window to finish rendering.
 */
async function waitForPrintResources(contents) {
  try {
    await Promise.race([
      contents.executeJavaScript(
        `
        (async () => {
          try { window.print = () => {}; } catch {}
          if (document.fonts && document.fonts.ready) {
            try { await document.fonts.ready; } catch {}
          }
          const imgs = Array.from(document.images || []);
          await Promise.all(
            imgs.map((img) =>
              img.complete
                ? Promise.resolve()
                : new Promise((res) => {
                    img.addEventListener("load", res, { once: true });
                    img.addEventListener("error", res, { once: true });
                    setTimeout(res, 2500);
                  })
            )
          );
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          return true;
        })()
        `,
        true
      ),
      new Promise((resolve) => setTimeout(resolve, 3500)),
    ]);
  } catch {
    // Proceed even if script evaluation fails
  }
}

/**
 * Run a silent print job on a hidden offscreen BrowserWindow and clean up afterwards.
 */
async function runOffscreenPrintJob(loadTargetFn, options = {}) {
  let printWin = null;
  try {
    const sessionToUse =
      mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents.session : undefined;

    printWin = new BrowserWindow({
      width: 820,
      height: 900,
      show: false,
      skipTaskbar: true,
      frame: false,
      transparent: false,
      backgroundColor: "#ffffff",
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        session: sessionToUse,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // Ensure window.print() inside the loaded template never triggers the native dialog
    printWin.webContents.on("dom-ready", () => {
      if (printWin && !printWin.isDestroyed()) {
        printWin.webContents.executeJavaScript("window.print = () => {};").catch(() => {});
      }
    });

    await loadTargetFn(printWin);
    await waitForPrintResources(printWin.webContents);

    const resolvedDeviceName = await resolveTargetPrinterName(
      printWin.webContents,
      options.deviceName
    );

    const printOptions = {
      silent: options.silent !== false,
      printBackground: true,
      margins: { marginType: "none" },
    };
    if (resolvedDeviceName) {
      printOptions.deviceName = resolvedDeviceName;
    }

    const result = await new Promise((resolve) => {
      const safetyTimer = setTimeout(() => {
        resolve({ ok: false, error: "Print spooler timed out" });
      }, 20000);

      printWin.webContents.print(printOptions, (success, errorType) => {
        clearTimeout(safetyTimer);
        resolve({ ok: Boolean(success), error: errorType || null });
      });
    });

    return result;
  } catch (err) {
    return { ok: false, error: err?.message || "Failed to print slip" };
  } finally {
    if (printWin && !printWin.isDestroyed()) {
      try {
        printWin.close();
        printWin.destroy();
      } catch {
        // ignore
      }
    }
  }
}

ipcMain.handle("karobar:silent-print", async (event, options = {}) => {
  const targetContents =
    event?.sender && !event.sender.isDestroyed()
      ? event.sender
      : mainWindow && !mainWindow.isDestroyed()
      ? mainWindow.webContents
      : null;

  if (!targetContents) return { ok: false, error: "No active window to print" };

  const resolvedDeviceName = await resolveTargetPrinterName(targetContents, options.deviceName);
  const printOptions = {
    silent: options.silent !== false,
    printBackground: true,
  };
  if (resolvedDeviceName) {
    printOptions.deviceName = resolvedDeviceName;
  }

  return new Promise((resolve) => {
    targetContents.print(printOptions, (success, errorType) => {
      resolve({ ok: Boolean(success), error: errorType || null });
    });
  });
});

ipcMain.handle("karobar:print-url", async (_event, payload = {}) => {
  const rawUrl = String(payload?.url || "").trim();
  if (!rawUrl) {
    return { ok: false, error: "Missing print URL" };
  }

  const resolvedUrl = rawUrl.startsWith("http://") || rawUrl.startsWith("https://")
    ? rawUrl
    : `http://127.0.0.1:${activePort}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;

  return runOffscreenPrintJob(
    async (printWin) => {
      await printWin.loadURL(resolvedUrl);
    },
    payload
  );
});

ipcMain.handle("karobar:print-html", async (_event, payload = {}) => {
  const rawHtml = String(payload?.html || "");
  if (!rawHtml.trim()) {
    return { ok: false, error: "Missing print HTML content" };
  }

  // Neutralize any inline window.print() / window.close() calls inside the HTML
  const sanitizedHtml = rawHtml
    .replace(/window\.print\s*\(\s*\)/g, "void(0)")
    .replace(/window\.close\s*\(\s*\)/g, "void(0)");

  const tempFilePath = path.join(
    os.tmpdir(),
    `karobar-print-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`
  );

  try {
    fs.writeFileSync(tempFilePath, sanitizedHtml, "utf8");
    return await runOffscreenPrintJob(
      async (printWin) => {
        await printWin.loadFile(tempFilePath);
      },
      payload
    );
  } finally {
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch {
      // ignore temp file cleanup errors
    }
  }
});

ipcMain.handle("karobar:select-directory", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select Backup Folder",
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || !result.filePaths?.length) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle("karobar:run-backup-now", async () => {
  try {
    execFileSync(resolvePhpBinary(), ["artisan", "backup:run-scheduled", "--force"], {
      cwd: APP_ROOT,
      windowsHide: true,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err?.message || "Backup failed" };
  }
});

ipcMain.handle("karobar:open-external-url", async (_event, url) => {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) {
    await shell.openExternal(url);
    return { ok: true };
  }
  return { ok: false };
});

function fetchJsonUrl(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 6) {
      return reject(new Error("Too many redirects"));
    }
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(
      url,
      {
        rejectUnauthorized: false,
        headers: {
          "User-Agent": "Karobar-App-Desktop-Updater/2.0",
          Accept: "application/json",
        },
        timeout: 8000,
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          const nextUrl = new URL(res.headers.location, url).toString();
          return resolve(fetchJsonUrl(nextUrl, redirectCount + 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("Request timed out"));
    });
  });
}

function readLocalVersionMeta() {
  const defaults = {
    app_name: "Karobar-App",
    version: "2.0.1",
    build_number: 1,
    commit_sha: "local",
    repository: "shzdasim/Karobar-App",
  };
  try {
    const versionFile = path.join(APP_ROOT, "public", "version.json");
    if (fs.existsSync(versionFile)) {
      const parsed = JSON.parse(fs.readFileSync(versionFile, "utf8"));
      return {
        app_name: parsed.app_name || defaults.app_name,
        version: String(parsed.version || defaults.version).replace(/^[vV]/, ""),
        build_number: Number(parsed.build_number || defaults.build_number),
        commit_sha: String(parsed.commit_sha || defaults.commit_sha),
        repository: String(parsed.repository || defaults.repository),
      };
    }
  } catch {
    // ignore
  }
  return defaults;
}

function compareSemverNewer(remoteVer, localVer) {
  const rParts = String(remoteVer || "0.0.0")
    .replace(/^[vV]/, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const lParts = String(localVer || "0.0.0")
    .replace(/^[vV]/, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(rParts.length, lParts.length); i++) {
    const r = rParts[i] || 0;
    const l = lParts[i] || 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}

ipcMain.handle("karobar:check-for-updates", async () => {
  const local = readLocalVersionMeta();
  const repo = local.repository || "shzdasim/Karobar-App";

  try {
    // 1. Fetch latest-release.json directly via Node/Electron HTTPS (uses built-in Root CA bundle)
    const manifestUrl = `https://github.com/${repo}/releases/latest/download/latest-release.json`;
    const remote = await fetchJsonUrl(manifestUrl);
    if (remote && remote.version) {
      const remoteVer = String(remote.version).replace(/^[vV]/, "");
      const remoteBuild = Number(remote.build_number || 0);
      const isNewer =
        remoteBuild > 0 && local.build_number > 0 && remoteBuild !== local.build_number
          ? remoteBuild > local.build_number
          : compareSemverNewer(remoteVer, local.version);

      return {
        ok: true,
        update_available: isNewer,
        app_name: "Karobar-App",
        current_version: local.version,
        current_build: local.build_number,
        latest_version: remoteVer,
        latest_build: remoteBuild,
        release_name: remote.release_name || `Karobar-App v${remoteVer}`,
        released_at: remote.released_at || "",
        notes: remote.notes || "Performance improvements, bug fixes, and new features.",
        download_url:
          remote.download_url ||
          `https://github.com/${repo}/releases/latest/download/Karobar-App-Setup.exe`,
        bundle_url:
          remote.bundle_url ||
          `https://github.com/${repo}/releases/latest/download/Karobar-App-Setup-Bundle.zip`,
        release_url: remote.release_url || `https://github.com/${repo}/releases/latest`,
        zero_data_loss: true,
      };
    }
  } catch {
    // Fall through to GitHub REST API
  }

  try {
    // 2. Fallback to GitHub REST API
    const apiData = await fetchJsonUrl(`https://api.github.com/repos/${repo}/releases/latest`);
    if (apiData && apiData.tag_name) {
      const remoteVer = String(apiData.tag_name).replace(/^[vV]/, "");
      const m = remoteVer.match(/^2\.0\.(\d+)$/);
      const remoteBuild = m ? parseInt(m[1], 10) : 0;
      const isNewer =
        remoteBuild > 0 && local.build_number > 0 && remoteBuild !== local.build_number
          ? remoteBuild > local.build_number
          : compareSemverNewer(remoteVer, local.version);

      return {
        ok: true,
        update_available: isNewer,
        app_name: "Karobar-App",
        current_version: local.version,
        current_build: local.build_number,
        latest_version: remoteVer,
        latest_build: remoteBuild,
        release_name: apiData.name || `Karobar-App v${remoteVer}`,
        released_at: apiData.published_at || "",
        notes: apiData.body || "New Karobar-App release available.",
        download_url: `https://github.com/${repo}/releases/latest/download/Karobar-App-Setup.exe`,
        bundle_url: `https://github.com/${repo}/releases/latest/download/Karobar-App-Setup-Bundle.zip`,
        release_url: apiData.html_url || `https://github.com/${repo}/releases/latest`,
        zero_data_loss: true,
      };
    }
  } catch (err) {
    return {
      ok: false,
      update_available: false,
      current_version: local.version,
      current_build: local.build_number,
      message: err?.message || "Unable to reach GitHub Releases right now.",
    };
  }

  return {
    ok: false,
    update_available: false,
    current_version: local.version,
    current_build: local.build_number,
    message: "Unable to reach GitHub Releases right now.",
  };
});

function downloadFileWithProgress(url, destPath, onProgress, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 10) {
      return reject(new Error("Too many redirects while downloading update."));
    }
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(
      url,
      {
        rejectUnauthorized: false,
        headers: {
          "User-Agent": "Karobar-App-Desktop-Updater/2.0",
          Accept: "application/octet-stream,*/*",
        },
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          const nextUrl = new URL(res.headers.location, url).toString();
          return resolve(
            downloadFileWithProgress(nextUrl, destPath, onProgress, redirectCount + 1)
          );
        }

        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`Download failed with HTTP status ${res.statusCode}`));
        }

        const totalBytes = parseInt(res.headers["content-length"] || "0", 10);
        let downloadedBytes = 0;
        const fileStream = fs.createWriteStream(destPath);

        res.on("data", (chunk) => {
          downloadedBytes += chunk.length;
          if (typeof onProgress === "function") {
            const percent =
              totalBytes > 0
                ? Math.min(99, Math.round((downloadedBytes / totalBytes) * 100))
                : 50;
            onProgress({
              status: "downloading",
              percent,
              downloadedMB: (downloadedBytes / (1024 * 1024)).toFixed(1),
              totalMB: totalBytes > 0 ? (totalBytes / (1024 * 1024)).toFixed(1) : null,
            });
          }
        });

        res.pipe(fileStream);

        fileStream.on("finish", () => {
          fileStream.close(() => resolve(destPath));
        });

        fileStream.on("error", (err) => {
          try {
            fs.unlinkSync(destPath);
          } catch {
            // ignore
          }
          reject(err);
        });
      }
    );

    req.on("error", (err) => {
      try {
        fs.unlinkSync(destPath);
      } catch {
        // ignore
      }
      reject(err);
    });
  });
}

function sendUpdateProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("karobar:update-progress", payload);
  }
}

ipcMain.handle("karobar:download-and-install-update", async (_event, payload = {}) => {
  const downloadUrl =
    payload.downloadUrl ||
    "https://github.com/shzdasim/Karobar-App/releases/latest/download/Karobar-App-Setup.exe";
  const versionLabel = String(payload.version || "latest").replace(/[^a-zA-Z0-9._-]/g, "");
  let tempInstallerPath = path.join(
    os.tmpdir(),
    `Karobar-App-Update-${versionLabel}.exe`
  );

  // If a previous file exists at tempInstallerPath and cannot be overwritten, use a unique filename
  if (fs.existsSync(tempInstallerPath)) {
    try {
      fs.unlinkSync(tempInstallerPath);
    } catch {
      tempInstallerPath = path.join(
        os.tmpdir(),
        `Karobar-App-Update-${versionLabel}-${Date.now()}.exe`
      );
    }
  }

  try {
    sendUpdateProgress({
      status: "starting",
      percent: 2,
      message: "Preparing zero-data-loss update download…",
    });

    try {
      await downloadFileWithProgress(downloadUrl, tempInstallerPath, (progress) => {
        sendUpdateProgress({
          ...progress,
          message: progress.totalMB
            ? `Downloading update (${progress.downloadedMB} MB / ${progress.totalMB} MB)…`
            : `Downloading update (${progress.downloadedMB} MB)…`,
        });
      });
    } catch (primaryErr) {
      // Fallback to Windows built-in curl.exe -L -k if Node stream encountered a network/proxy issue
      sendUpdateProgress({
        status: "downloading",
        percent: 25,
        message: "Downloading update package via system downloader…",
      });
      execFileSync(
        "curl.exe",
        ["-L", "-k", "--fail", "--silent", "--show-error", "-o", tempInstallerPath, downloadUrl],
        { windowsHide: true, timeout: 10 * 60 * 1000 }
      );
    }

    sendUpdateProgress({
      status: "backing-up",
      percent: 99,
      message: "Creating safety database snapshot before applying update…",
    });

    try {
      execFileSync(resolvePhpBinary(), ["artisan", "backup:run-scheduled", "--force"], {
        cwd: APP_ROOT,
        windowsHide: true,
      });
    } catch {
      // Best-effort backup; karobar:install --upgrade-only also creates pre-upgrade-YYYYmmdd.sqlite
    }

    // Verify the downloaded installer file exists and is a complete binary (> 5 MB)
    const stat = fs.existsSync(tempInstallerPath) ? fs.statSync(tempInstallerPath) : null;
    if (!stat || stat.size < 5 * 1024 * 1024) {
      throw new Error("Downloaded update file is incomplete. Please try again.");
    }

    sendUpdateProgress({
      status: "installing",
      percent: 100,
      message: "Launching Karobar-App updater & restarting…",
    });

    if (process.platform === "win32") {
      const installDir = path.dirname(process.execPath);
      const otaFlagPath = path.join(os.tmpdir(), "karobar-ota-upgrade.flag");

      try {
        fs.writeFileSync(otaFlagPath, installDir, "utf8");
      } catch {
        // ignore flag write error; filename Karobar-App-Update-*.exe also triggers auto-upgrade mode
      }

      // Stop PHP server & scheduler first so no files inside the installation directory are locked
      isQuitting = true;
      stopBackendServices();

      // Launch the installer directly via Electron's native Win32 ShellExecuteExW (shell.openPath),
      // which immediately displays the Windows UAC elevation prompt while the app window is still active
      // and resolves ONLY AFTER the elevated installer process has started.
      const openError = await shell.openPath(tempInstallerPath);

      if (openError) {
        // Fallback: synchronous PowerShell Start-Process -Verb RunAs so it completes before app.quit()
        const escapedExe = tempInstallerPath.replace(/'/g, "''");
        const escapedDir = installDir.replace(/'/g, "''");
        execFileSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            `Start-Process -FilePath '${escapedExe}' -ArgumentList '/SILENT','/SUPPRESSMSGBOXES','/NORESTART','/CLOSEAPPLICATIONS','/FORCECLOSEAPPLICATIONS','/UPGRADE=1','/DIR=${escapedDir}' -Verb RunAs`,
          ],
          { windowsHide: true, timeout: 60000 }
        );
      }

      setTimeout(() => {
        app.quit();
      }, 500);

      return { ok: true, installing: true };
    } else {
      await shell.showItemInFolder(tempInstallerPath);
      return {
        ok: true,
        installing: false,
        message: `Downloaded installer to ${tempInstallerPath}`,
      };
    }
  } catch (err) {
    return {
      ok: false,
      message: err?.message || "Failed to download update.",
    };
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  stopBackendServices();
});

app.on("window-all-closed", () => {
  stopBackendServices();
  app.quit();
});

