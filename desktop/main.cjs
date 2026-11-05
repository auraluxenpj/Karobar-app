const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const net = require("net");
const http = require("http");
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
          accelerator: "Alt+D",
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
          accelerator: "CmdOrCtrl+R",
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.reload();
            }
          },
        },
        { type: "separator" },
        {
          label: "Exit Karobar ERP",
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

function createMainWindow() {
  const iconPath = resolveIconPath();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: "Karobar App ERP",
    icon: iconPath,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  createApplicationMenu();

  // Handle print preview windows and external links gracefully
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://127.0.0.1:${activePort}`)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 980,
          height: 760,
          autoHideMenuBar: true,
          title: "Karobar ERP — Print / Document Preview",
        },
      };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

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
        label: "Open Karobar ERP",
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
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
        label: "Quit Karobar ERP",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);
    tray.setToolTip("Karobar App ERP v2");
    tray.setContextMenu(contextMenu);
  } catch {
    // Ignore tray icon errors if format is unsupported on platform
  }
}

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
  if (!mainWindow) return [];
  try {
    return await mainWindow.webContents.getPrintersAsync();
  } catch {
    return [];
  }
});

ipcMain.handle("karobar:silent-print", async (_event, options = {}) => {
  if (!mainWindow) return { ok: false };
  return new Promise((resolve) => {
    mainWindow.webContents.print(
      {
        silent: options.silent !== false,
        printBackground: true,
        deviceName: options.deviceName || undefined,
      },
      (success, errorType) => {
        resolve({ ok: success, error: errorType || null });
      }
    );
  });
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

app.on("before-quit", () => {
  isQuitting = true;
  stopBackendServices();
});

app.on("window-all-closed", () => {
  stopBackendServices();
  app.quit();
});

