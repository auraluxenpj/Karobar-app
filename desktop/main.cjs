const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const net = require("net");
const http = require("http");
const https = require("https");
const { spawn, execFile, execFileSync } = require("child_process");

let mainWindow = null;
let splashWindow = null;
let printWorkerWindow = null;
let tray = null;
let phpServerProcess = null;
let phpWorkerPool = [];
let gatewayServer = null;
let schedulerProcess = null;
let activePort = 18942;
let isQuitting = false;
let rrWorkerIdx = 0;

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

const STATIC_MIME_TYPES = {
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
};

function spawnPhpWorker(phpBin, workerPort, publicDir, routerScript, env) {
  const workerObj = {
    port: workerPort,
    activeRequests: 0,
    proc: null,
  };

  const launch = () => {
    if (isQuitting) return;
    const proc = spawn(
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
        "-d",
        "opcache.enable=1",
        "-d",
        "opcache.enable_cli=1",
        "-d",
        "opcache.memory_consumption=128",
        "-d",
        "opcache.interned_strings_buffer=16",
        "-d",
        "opcache.max_accelerated_files=10000",
        "-d",
        "realpath_cache_size=4096K",
        "-d",
        "realpath_cache_ttl=600",
        "-S",
        `127.0.0.1:${workerPort}`,
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

    proc.on("exit", () => {
      workerObj.activeRequests = 0;
      if (!isQuitting) {
        setTimeout(launch, 250);
      }
    });

    workerObj.proc = proc;
  };

  launch();
  return workerObj;
}

function tryServeStaticAsset(req, res, publicDir, storagePublicDir) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;

  const rawUrl = String(req.url || "/");
  const qIndex = rawUrl.indexOf("?");
  const rawPath = qIndex >= 0 ? rawUrl.slice(0, qIndex) : rawUrl;

  if (
    !rawPath ||
    rawPath === "/" ||
    rawPath.startsWith("/api/") ||
    rawPath.startsWith("/print/") ||
    rawPath.startsWith("/sanctum/") ||
    rawPath.endsWith(".php")
  ) {
    return false;
  }

  let decodedPath = rawPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return false;
  }

  const ext = path.extname(decodedPath).toLowerCase();
  if (!ext || !STATIC_MIME_TYPES[ext]) {
    return false;
  }

  let targetFile = null;
  if (decodedPath.startsWith("/storage/")) {
    const relStorage = decodedPath.slice("/storage/".length).replace(/^[/\\]+/, "");
    if (!relStorage) return false;
    const candidate = path.resolve(storagePublicDir, relStorage);
    if (candidate.startsWith(storagePublicDir)) {
      targetFile = candidate;
    }
  } else {
    const relPublic = decodedPath.replace(/^[/\\]+/, "");
    if (!relPublic) return false;
    const candidate = path.resolve(publicDir, relPublic);
    if (candidate.startsWith(publicDir)) {
      targetFile = candidate;
    }
  }

  if (!targetFile) return false;

  try {
    const stat = fs.statSync(targetFile);
    if (!stat.isFile()) return false;

    const headers = {
      "Content-Type": STATIC_MIME_TYPES[ext] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": decodedPath.startsWith("/build/assets/")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300",
    };

    res.writeHead(200, headers);
    if (req.method === "HEAD") {
      res.end();
      return true;
    }
    const stream = fs.createReadStream(targetFile);
    stream.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(404);
      }
      res.end();
    });
    stream.pipe(res);
    return true;
  } catch {
    return false;
  }
}

function selectLeastBusyWorker() {
  if (phpWorkerPool.length === 0) return null;
  let best = null;
  const len = phpWorkerPool.length;
  for (let i = 0; i < len; i++) {
    const idx = (rrWorkerIdx + i) % len;
    const candidate = phpWorkerPool[idx];
    if (!best || candidate.activeRequests < best.activeRequests) {
      best = candidate;
      if (candidate.activeRequests === 0) {
        rrWorkerIdx = (idx + 1) % len;
        break;
      }
    }
  }
  return best;
}

/**
 * Start the high-speed Node.js static/load-balancer gateway + multi-worker PHP pool
 * (bypasses Windows single-threaded `php -S` bottleneck and Keep-Alive socket stalls).
 */
async function startBackendServices() {
  activePort = await findFreePort(18942);
  const phpBin = resolvePhpBinary();
  const routerScript = path.join(APP_ROOT, "desktop", "router.php");
  const publicDir = path.resolve(APP_ROOT, "public");
  const storagePublicDir = path.resolve(APP_ROOT, "storage", "app", "public");
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

  // Spawn 4 parallel PHP workers on internal ports so concurrent API requests never serialize on Windows
  const WORKER_COUNT = 4;
  phpWorkerPool = [];
  let nextPortCandidate = activePort + 1;
  for (let i = 0; i < WORKER_COUNT; i++) {
    const wPort = await findFreePort(nextPortCandidate);
    nextPortCandidate = wPort + 1;
    const worker = spawnPhpWorker(phpBin, wPort, publicDir, routerScript, env);
    phpWorkerPool.push(worker);
  }
  phpServerProcess = phpWorkerPool[0]?.proc || null;

  // Start Node.js front gateway on 127.0.0.1:activePort
  await new Promise((resolve) => {
    gatewayServer = http.createServer((req, res) => {
      if (req.url === "/up") {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("OK");
        return;
      }

      if (tryServeStaticAsset(req, res, publicDir, storagePublicDir)) {
        return;
      }

      const worker = selectLeastBusyWorker();
      if (!worker) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Backend worker unavailable" }));
        return;
      }

      worker.activeRequests++;
      let decremented = false;
      const done = () => {
        if (!decremented) {
          decremented = true;
          worker.activeRequests = Math.max(0, worker.activeRequests - 1);
        }
      };

      const proxyHeaders = {
        ...req.headers,
        host: req.headers.host || `127.0.0.1:${activePort}`,
        connection: "close",
      };

      const proxyReq = http.request(
        {
          hostname: "127.0.0.1",
          port: worker.port,
          path: req.url,
          method: req.method,
          headers: proxyHeaders,
          agent: false,
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
          proxyRes.pipe(res);
          proxyRes.on("end", done);
          proxyRes.on("close", done);
          proxyRes.on("error", done);
        }
      );

      proxyReq.on("error", () => {
        done();
        if (!res.headersSent) {
          res.writeHead(502, { "Content-Type": "application/json" });
        }
        res.end(JSON.stringify({ message: "Local PHP worker busy, retrying..." }));
      });

      req.pipe(proxyReq);
      req.on("aborted", () => {
        done();
        proxyReq.destroy();
      });
    });

    gatewayServer.listen(activePort, "127.0.0.1", () => resolve());
  });

  // Precompile Blade templates in the background so print views never compile on first click
  try {
    spawn(phpBin, ["artisan", "view:cache"], {
      cwd: APP_ROOT,
      env,
      windowsHide: true,
      stdio: "ignore",
    });
  } catch {
    // ignore
  }

  // Start Laravel Scheduler worker (`php artisan schedule:work`) for automated backups & recurring expenses
  schedulerProcess = spawn(phpBin, ["artisan", "schedule:work"], {
    cwd: APP_ROOT,
    env,
    windowsHide: true,
    stdio: "ignore",
  });

  if (phpWorkerPool.length > 0) {
    await waitForServerReady(`http://127.0.0.1:${phpWorkerPool[0].port}/up`, 15000);
  }
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
          setTimeout(check, 120);
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
  if (gatewayServer) {
    try {
      gatewayServer.close();
    } catch {
      // ignore
    }
    gatewayServer = null;
  }
  for (const w of phpWorkerPool) {
    if (w?.proc && !w.proc.killed) {
      try {
        w.proc.kill();
      } catch {
        // ignore
      }
    }
  }
  phpWorkerPool = [];
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
  if (printWorkerWindow && !printWorkerWindow.isDestroyed()) {
    try {
      printWorkerWindow.destroy();
    } catch {
      // ignore
    }
  }
  printWorkerWindow = null;
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

function isLocalPrintRouteUrl(rawUrl) {
  const u = String(rawUrl || "").trim();
  if (!u) return false;
  return /\/(print|customer-ledger\/print|supplier-ledger\/print)(\/|\?|$)/i.test(u) || /[?&]silent_print=/i.test(u);
}

function configurePopupAndPrintHandler(contents) {
  if (!contents || typeof contents.setWindowOpenHandler !== "function") return;

  contents.setWindowOpenHandler(({ url, frameName }) => {
    const rawUrl = String(url || "").trim();
    const rawFrame = String(frameName || "").trim();

    // Never allow print popup windows: intercept print routes and spool silently in background
    if (isLocalPrintRouteUrl(rawUrl)) {
      let resolvedUrl =
        rawUrl.startsWith("http://") || rawUrl.startsWith("https://")
          ? rawUrl
          : `http://127.0.0.1:${activePort}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;
      if (!/[?&]silent_print=/i.test(resolvedUrl)) {
        resolvedUrl += (resolvedUrl.includes("?") ? "&" : "?") + "silent_print=1";
      }
      runOffscreenPrintJob((printWin) => printWin.loadURL(resolvedUrl), { silent: true }).catch(() => {});
      return { action: "deny" };
    }

    // Block about:blank or named print popups (e.g. salePrintWin) so no blank/print popup window ever appears
    if (
      !rawUrl ||
      rawUrl === "about:blank" ||
      rawUrl.startsWith("about:") ||
      /print/i.test(rawFrame)
    ) {
      return { action: "deny" };
    }

    // Allow blob:/data: document previews (such as "Open PDF" in ShareDocumentModal) with preload attached
    if (rawUrl.startsWith("blob:") || rawUrl.startsWith("data:")) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 980,
          height: 760,
          autoHideMenuBar: true,
          title: "Karobar-App — Document Preview",
          icon: resolveIconPath(),
          webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
          },
        },
      };
    }

    if (/^(https?:|mailto:|whatsapp:|tel:)/i.test(rawUrl)) {
      shell.openExternal(rawUrl);
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

    // Pre-warm the offscreen print worker window and printer list cache so the first print is instantaneous
    setTimeout(() => {
      try {
        ensurePrintWorkerWindow();
        getCachedPrinters(mainWindow.webContents).catch(() => {});
      } catch {
        // ignore
      }
    }, 600);
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
    if (process.platform === "win32") {
      refreshWindowsWmiPrinters().catch(() => {});
    }
    await startBackendServices();
    createSystemTray();
    createMainWindow();
    setTimeout(() => {
      try {
        prewarmPrintWindow();
      } catch {
        // ignore
      }
    }, 600);
  });
}

// Native Desktop IPC Handlers
ipcMain.handle("karobar:app-info", () => ({
  version: app.getVersion(),
  appRoot: APP_ROOT,
  port: activePort,
  platform: process.platform,
}));

// ============================================================================
// KAROBAR WINDOWS DIRECT HARDWARE PRINT ENGINE (SumatraPDF + Chromium Dual-Engine)
// ============================================================================

let cachedPrintersList = null;
let cachedPrintersAt = 0;
let cachedWmiPrintersMap = new Map();
let cachedWmiPrintersAt = 0;
let wmiRefreshInFlight = null;

const VIRTUAL_PRINTER_NAME_OR_DRIVER_RE =
  /(microsoft print to pdf|microsoft xps|xps document writer|onenote|send to onenote|fax|anydesk|teamviewer|adobe pdf|foxit|cutepdf|dopdf|bullzip|nitro pdf|pdfcreator|pdffactory|clawpdf|pdf24|wondershare|wps pdf|fineprint|snagit|paperport|priprinter|universal document|canva|save as pdf)/i;

const VIRTUAL_PRINTER_PORT_RE =
  /^(portprompt:|file:|nul:|xpsport:|shrfax:|microsoft\.office\.onenote|anydesk|pdf)/i;

const THERMAL_POS_PRINTER_RE =
  /(pos|thermal|receipt|58mm|80mm|78mm|72mm|xprinter|xp-|black\s*copper|bc-|epson.*tm|tm-t|tm-u|bixolon|star\s*tsp|citizen|rongta|rp58|rp80|birch|sewoo|gainscha|hprt|deli|zywell|munbyn|netum|goojprt|milestone|gp-)/i;

function getPrinterConfigFilePath() {
  try {
    return path.join(app.getPath("userData"), "printer-config.json");
  } catch {
    return path.join(os.tmpdir(), "karobar-printer-config.json");
  }
}

function readPreferredPrinterConfig() {
  try {
    const file = getPrinterConfigFilePath();
    if (!fs.existsSync(file)) return "";
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const name = String(parsed?.preferredPrinter || "").trim();
    if (!name || name === "default" || name === "system_default") return "";
    return name;
  } catch {
    return "";
  }
}

function writePreferredPrinterConfig(deviceName) {
  try {
    const clean = String(deviceName || "").trim();
    const normalized =
      !clean || clean === "default" || clean === "system_default" ? "" : clean;
    const file = getPrinterConfigFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({ preferredPrinter: normalized, updatedAt: new Date().toISOString() }, null, 2),
      "utf8"
    );
    return normalized;
  } catch {
    return "";
  }
}

/**
 * Read the last physical printer the user selected in Chromium's print dialog
 * from Electron's userData/Preferences (`printing.print_preview_sticky_settings.appState`).
 */
function getLastUsedChromiumPrinter() {
  try {
    const prefsPath = path.join(app.getPath("userData"), "Preferences");
    if (!fs.existsSync(prefsPath)) return "";
    const prefs = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
    const rawAppState = prefs?.printing?.print_preview_sticky_settings?.appState;
    if (!rawAppState || typeof rawAppState !== "string") return "";
    const appState = JSON.parse(rawAppState);
    const recent = Array.isArray(appState?.recentDestinations) ? appState.recentDestinations : [];
    for (const dest of recent) {
      const id = String(dest?.id || "").trim();
      if (id && id !== "Save as PDF" && !VIRTUAL_PRINTER_NAME_OR_DRIVER_RE.test(id)) {
        return id;
      }
    }
  } catch {
    // ignore
  }
  return "";
}

/**
 * Resolve bundled SumatraPDF CLI binary for direct Win32 GDI silent printing on Windows.
 */
function resolveSumatraPdfBinary() {
  if (process.platform !== "win32") return null;

  const candidates = [
    path.join(APP_ROOT, "desktop", "SumatraPDF.exe"),
    path.join(APP_ROOT, "desktop", "SumatraPDF-3.4.6-32.exe"),
    path.join(__dirname, "SumatraPDF.exe").replace("app.asar", "app.asar.unpacked"),
    path
      .join(__dirname, "node_modules", "pdf-to-printer", "dist", "SumatraPDF-3.4.6-32.exe")
      .replace("app.asar", "app.asar.unpacked"),
    path.join(
      path.dirname(process.execPath),
      "resources",
      "app.asar.unpacked",
      "node_modules",
      "pdf-to-printer",
      "dist",
      "SumatraPDF-3.4.6-32.exe"
    ),
    path.join(
      APP_ROOT,
      "desktop",
      "node_modules",
      "pdf-to-printer",
      "dist",
      "SumatraPDF-3.4.6-32.exe"
    ),
    path.join(__dirname, "node_modules", "pdf-to-printer", "dist", "SumatraPDF-3.4.6-32.exe"),
  ];

  for (const candidate of candidates) {
    try {
      if (candidate && !candidate.includes("app.asar" + path.sep) && fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Query Windows WMI Win32_Printer asynchronously to detect PortName, DriverName, and WorkOffline
 * (which Electron's getPrintersAsync() does not expose when a USB printer is unplugged).
 */
function refreshWindowsWmiPrinters(force = false) {
  if (process.platform !== "win32") return Promise.resolve(cachedWmiPrintersMap);
  const now = Date.now();
  if (!force && cachedWmiPrintersMap.size > 0 && now - cachedWmiPrintersAt < 20000) {
    return Promise.resolve(cachedWmiPrintersMap);
  }
  if (wmiRefreshInFlight) return wmiRefreshInFlight;

  wmiRefreshInFlight = new Promise((resolve) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-Command",
        "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Get-CimInstance -ClassName Win32_Printer -Property Name,Default,WorkOffline,PrinterStatus,PortName,DriverName | Select-Object Name,Default,WorkOffline,PrinterStatus,PortName,DriverName | ConvertTo-Json -Compress",
      ],
      { windowsHide: true, timeout: 4500 },
      (err, stdout) => {
        wmiRefreshInFlight = null;
        if (!err && stdout && String(stdout).trim()) {
          try {
            const parsed = JSON.parse(String(stdout).trim());
            const rows = Array.isArray(parsed) ? parsed : [parsed];
            const nextMap = new Map();
            for (const row of rows) {
              const pName = String(row?.Name || "").trim();
              if (!pName) continue;
              nextMap.set(pName.toLowerCase(), {
                name: pName,
                isDefault: Boolean(row?.Default),
                workOffline: Boolean(row?.WorkOffline),
                printerStatus: Number(row?.PrinterStatus || 0),
                portName: String(row?.PortName || "").trim(),
                driverName: String(row?.DriverName || "").trim(),
              });
            }
            if (nextMap.size > 0) {
              cachedWmiPrintersMap = nextMap;
              cachedWmiPrintersAt = Date.now();
            }
          } catch {
            // ignore JSON parse errors
          }
        }
        resolve(cachedWmiPrintersMap);
      }
    );
  });

  return wmiRefreshInFlight;
}

function classifyPrinterInfo(rawPrinter, wmiMap, preferredName, lastChromiumName) {
  const name = String(rawPrinter?.name || "").trim();
  const displayName = String(rawPrinter?.displayName || name).trim();
  const wmi = wmiMap.get(name.toLowerCase()) || null;
  const driverName = String(
    wmi?.driverName ||
      rawPrinter?.options?.["system_driverinfo"] ||
      rawPrinter?.options?.["printer-make-and-model"] ||
      rawPrinter?.description ||
      ""
  ).trim();
  const portName = String(wmi?.portName || "").trim();
  const statusMask = Number(rawPrinter?.status || 0);
  const wmiPrinterStatus = Number(wmi?.printerStatus || 0);

  const isVirtual =
    VIRTUAL_PRINTER_NAME_OR_DRIVER_RE.test(name) ||
    VIRTUAL_PRINTER_NAME_OR_DRIVER_RE.test(displayName) ||
    VIRTUAL_PRINTER_NAME_OR_DRIVER_RE.test(driverName) ||
    VIRTUAL_PRINTER_PORT_RE.test(portName);

  // Win32 status flags: 0x80 = OFFLINE, 0x02 = ERROR, 0x04 = PENDING_DELETION, 0x1000 = NOT_AVAILABLE
  // WMI PrinterStatus: 7 = Offline
  const workOffline =
    Boolean(wmi?.workOffline) ||
    wmiPrinterStatus === 7 ||
    (statusMask & (0x00000080 | 0x00001000)) !== 0;

  const hasHardwareError = (statusMask & (0x00000002 | 0x00000004)) !== 0;
  const isOnline = !isVirtual && !workOffline && !hasHardwareError;
  const isThermalPos =
    !isVirtual &&
    (THERMAL_POS_PRINTER_RE.test(name) ||
      THERMAL_POS_PRINTER_RE.test(displayName) ||
      THERMAL_POS_PRINTER_RE.test(driverName));

  const isDefault = Boolean(rawPrinter?.isDefault || wmi?.isDefault);
  const isPreferred =
    Boolean(preferredName) && name.toLowerCase() === String(preferredName).toLowerCase();
  const isLastUsedInChromium =
    Boolean(lastChromiumName) && name.toLowerCase() === String(lastChromiumName).toLowerCase();

  return {
    ...rawPrinter,
    name,
    displayName,
    driverName,
    portName,
    isDefault,
    isVirtual,
    workOffline,
    isOnline,
    isThermalPos,
    isPreferred,
    isLastUsedInChromium,
  };
}

async function getCachedPrinters(contents, forceRefresh = false) {
  const now = Date.now();
  if (process.platform === "win32") {
    if (forceRefresh || cachedWmiPrintersMap.size === 0) {
      await Promise.race([
        refreshWindowsWmiPrinters(forceRefresh),
        new Promise((r) => setTimeout(r, 800)),
      ]);
    } else if (now - cachedWmiPrintersAt >= 20000) {
      refreshWindowsWmiPrinters(false).catch(() => {});
    }
  }

  let rawList = cachedPrintersList;
  if (forceRefresh || !Array.isArray(rawList) || now - cachedPrintersAt >= 15000) {
    const target =
      contents && !contents.isDestroyed()
        ? contents
        : mainWindow && !mainWindow.isDestroyed()
        ? mainWindow.webContents
        : null;
    if (target) {
      try {
        const fetched = await target.getPrintersAsync();
        if (Array.isArray(fetched)) {
          rawList = fetched;
          cachedPrintersList = fetched;
          cachedPrintersAt = Date.now();
        }
      } catch {
        // ignore
      }
    }
  }

  const list = Array.isArray(rawList) ? rawList : [];
  const preferredName = readPreferredPrinterConfig();
  const lastChromiumName = getLastUsedChromiumPrinter();

  return list.map((p) =>
    classifyPrinterInfo(p, cachedWmiPrintersMap, preferredName, lastChromiumName)
  );
}

ipcMain.handle("karobar:get-printers", async () => {
  return getCachedPrinters(mainWindow?.webContents, true);
});

ipcMain.handle("karobar:get-preferred-printer", async () => {
  const saved = readPreferredPrinterConfig();
  const strategy = await resolvePrinterStrategy(mainWindow?.webContents, saved, false);
  return {
    preferredPrinter: saved,
    resolvedPrinter: strategy?.deviceName || "",
    mode: strategy?.mode || "no-printer",
  };
});

ipcMain.handle("karobar:set-preferred-printer", async (_event, payload = {}) => {
  const saved = writePreferredPrinterConfig(payload?.deviceName);
  const strategy = await resolvePrinterStrategy(mainWindow?.webContents, saved, false);
  return {
    ok: true,
    preferredPrinter: saved,
    resolvedPrinter: strategy?.deviceName || "",
  };
});

/**
 * Resolve the exact target hardware printer on Windows:
 * 1. Explicit printer requested in options.deviceName or saved in printer-config.json
 * 2. Last-used physical printer from Chromium's PrintPreviewStickySettings (if online)
 * 3. Connected/online physical printer (matching thermal vs A4 when applicable, or OS default if physical & online)
 * 4. Any installed physical printer (if WMI status reports offline for all)
 * 5. Returns { mode: "no-printer" } if zero physical printers exist (never lies with a fake "Sent to printer"!)
 */
async function resolvePrinterStrategy(contents, requestedDeviceName, isThermalDoc = false) {
  const explicitRequest = String(
    requestedDeviceName || readPreferredPrinterConfig() || ""
  ).trim();
  const printers = await getCachedPrinters(contents);

  if (!Array.isArray(printers) || printers.length === 0) {
    return {
      mode: "no-printer",
      deviceName: undefined,
      error: "No printers found on Windows. Please connect and install a printer.",
    };
  }

  // 1. User explicitly chose a target printer in Karobar Settings
  if (
    explicitRequest &&
    explicitRequest !== "default" &&
    explicitRequest !== "system_default"
  ) {
    const matched =
      printers.find((p) => p && p.name === explicitRequest) ||
      printers.find(
        (p) => p && String(p.name || "").toLowerCase() === explicitRequest.toLowerCase()
      );
    if (matched && !matched.isVirtual) {
      // If the user's configured printer is currently unplugged/offline (workOffline === true),
      // check whether another physical printer is online; if not, still attempt the configured printer.
      if (matched.workOffline) {
        const onlineAlternative = printers.find((p) => !p.isVirtual && p.isOnline);
        if (onlineAlternative) {
          return {
            mode: "spooler",
            deviceName: onlineAlternative.name,
            printerInfo: onlineAlternative,
          };
        }
      }
      return { mode: "spooler", deviceName: matched.name, printerInfo: matched };
    }
  }

  // 2. Filter out virtual/file-prompting printers (Microsoft Print to PDF, OneNote, XPS, AnyDesk, Fax, PORTPROMPT:)
  const physicalPrinters = printers.filter((p) => p && p.name && !p.isVirtual);
  if (physicalPrinters.length === 0) {
    return {
      mode: "no-printer",
      deviceName: undefined,
      error:
        "No physical hardware printer connected (only virtual PDF/OneNote printers detected). Please connect your printer or select it in Settings → Print & Receipt Layouts.",
    };
  }

  // Prefer online (connected & ready) physical printers over unplugged USB printer drivers
  const onlinePhysical = physicalPrinters.filter((p) => p.isOnline);
  const candidatePool = onlinePhysical.length > 0 ? onlinePhysical : physicalPrinters;

  // 2A. Check Chromium's last-used printer from native print dialog history
  const lastChromium = candidatePool.find((p) => p.isLastUsedInChromium);
  if (lastChromium) {
    return { mode: "spooler", deviceName: lastChromium.name, printerInfo: lastChromium };
  }

  // 2B. If printing a thermal receipt and an online thermal POS printer exists, prefer it
  if (isThermalDoc) {
    const thermalMatch = candidatePool.find((p) => p.isThermalPos);
    if (thermalMatch) {
      return { mode: "spooler", deviceName: thermalMatch.name, printerInfo: thermalMatch };
    }
  }

  // 2C. If OS Default Printer is in the online physical pool, use it
  const osDefaultPhysical = candidatePool.find((p) => p.isDefault);
  if (osDefaultPhysical) {
    return { mode: "spooler", deviceName: osDefaultPhysical.name, printerInfo: osDefaultPhysical };
  }

  // 2D. Otherwise pick the first online physical printer
  const chosen = candidatePool[0];
  return { mode: "spooler", deviceName: chosen.name, printerInfo: chosen };
}

/**
 * Prepare the loaded document inside the offscreen print window:
 * - Waits for any <img> elements to decode
 * - Detects whether the document is a Thermal receipt (58mm / 72mm / 78mm / 80mm) or A4 document
 * - Injects @media print normalization so invalid `@page { size: 78mm auto }` or `.receipt { margin: 0 auto }`
 *   never misalign or shrink thermal receipts
 * - Measures exact rendered pixel height for continuous-roll thermal PDF generation
 */
async function prepareDocumentForPrint(contents) {
  const fallbackLayout = { isThermal: false, widthMm: 210, heightPx: 1122 };
  try {
    const layout = await Promise.race([
      contents.executeJavaScript(
        `
        (async () => {
          try { window.print = () => {}; window.close = () => {}; } catch {}
          const imgs = Array.from(document.images || []);
          if (imgs.length > 0) {
            await Promise.all(
              imgs.map((img) =>
                img.complete
                  ? Promise.resolve()
                  : new Promise((res) => {
                      img.addEventListener("load", res, { once: true });
                      img.addEventListener("error", res, { once: true });
                      setTimeout(res, 350);
                    })
              )
            );
          }

          const metaEl = document.querySelector('meta[name="karobar-print-config"]');
          let calConfig = {};
          if (metaEl && metaEl.content) {
            try {
              calConfig = JSON.parse(metaEl.content) || {};
            } catch {}
          }

          const styleText = Array.from(document.querySelectorAll("style"))
            .map((s) => s.textContent || "")
            .join("\\n");
          const titleText = String(document.title || "");
          const receiptEl = document.querySelector(".receipt");

          const is58mm = /58mm/i.test(styleText);
          const isThermal =
            Boolean(receiptEl) ||
            is58mm ||
            /(48mm|58mm|68mm|72mm|76mm|78mm|80mm)/i.test(styleText) ||
            /thermal/i.test(titleText);

          const customWidthMm = Number(calConfig.paperWidthMm || 0);
          const widthMm =
            customWidthMm >= 40 && customWidthMm <= 240
              ? customWidthMm
              : is58mm
              ? 58
              : isThermal
              ? 80
              : 210;

          const scaleMode = String(calConfig.scaleMode || "auto");
          const marginBottomMm = Number(calConfig.marginBottomMm ?? 4);

          if (isThermal) {
            const fixStyle = document.createElement("style");
            fixStyle.textContent = \`
              @page { margin: 0 !important; }
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                width: \${widthMm}mm !important;
                max-width: \${widthMm}mm !important;
                background: #ffffff !important;
              }
              .print-actions, .no-print { display: none !important; }
              .receipt {
                margin: 0 !important;
                width: 100% !important;
                max-width: 100% !important;
              }
            \`;
            document.head.appendChild(fixStyle);
          }

          const body = document.body;
          const docEl = document.documentElement;
          const heightPx = Math.max(
            receiptEl ? receiptEl.scrollHeight : 0,
            receiptEl ? receiptEl.offsetHeight : 0,
            body ? body.scrollHeight : 0,
            body ? body.offsetHeight : 0,
            docEl ? docEl.scrollHeight : 0,
            180
          );

          return { isThermal, widthMm, heightPx, scaleMode, marginBottomMm };
        })()
        `,
        true
      ),
      new Promise((resolve) => setTimeout(() => resolve(fallbackLayout), 600)),
    ]);
    return layout && typeof layout === "object" ? layout : fallbackLayout;
  } catch {
    return fallbackLayout;
  }
}

/**
 * Spool a generated PDF file directly to a Windows hardware printer using SumatraPDF CLI (`pdf-to-printer`).
 */
function spoolPdfViaSumatra(sumatraExe, pdfFilePath, deviceName, isThermal, scaleMode = "auto") {
  return new Promise((resolve) => {
    const args = [];
    if (deviceName) {
      args.push("-print-to", deviceName);
    } else {
      args.push("-print-to-default");
    }
    args.push("-silent");
    const effectiveScale =
      scaleMode === "noscale" || scaleMode === "fit" || scaleMode === "shrink"
        ? scaleMode
        : isThermal
        ? "noscale"
        : "fit";
    args.push("-print-settings", effectiveScale);
    args.push(pdfFilePath);

    execFile(
      sumatraExe,
      args,
      { windowsHide: true, timeout: 15000 },
      (err, _stdout, stderr) => {
        if (err) {
          resolve({
            ok: false,
            error: String(stderr || err.message || "SumatraPDF spooler failed").trim(),
          });
          return;
        }
        resolve({ ok: true });
      }
    );
  });
}

/**
 * Fallback direct spooler using Chromium's webContents.print() WITHOUT `margins: { marginType: "none" }`
 * (which causes Windows thermal and laser printer drivers to reject the DEVMODE with InvalidPrinterSettings).
 */
function spoolViaWebContentsPrint(contents, deviceName, silent = true) {
  return new Promise((resolve) => {
    let settled = false;
    const printOptions = {
      silent: silent !== false,
      printBackground: true,
    };
    if (deviceName) {
      printOptions.deviceName = deviceName;
    }

    const safetyTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({
        ok: false,
        error: `Printer "${deviceName || "Default"}" did not respond in time. Please verify the printer is powered on and connected.`,
      });
    }, 9000);

    try {
      contents.print(printOptions, (success, errorType) => {
        if (settled) return;
        settled = true;
        clearTimeout(safetyTimer);
        if (success) {
          resolve({ ok: true, printer: deviceName, engine: "chromium" });
        } else {
          resolve({
            ok: false,
            error: errorType || `Printer "${deviceName || "Default"}" rejected the print job.`,
            printer: deviceName,
          });
        }
      });
    } catch (err) {
      if (settled) return;
      settled = true;
      clearTimeout(safetyTimer);
      resolve({
        ok: false,
        error: err?.message || "Failed to invoke Windows print spooler",
        printer: deviceName,
      });
    }
  });
}

/**
 * Execute silent hardware printing using:
 * - Engine 1 (Windows Primary): Chromium `printToPDF` (~40ms) + `SumatraPDF.exe -print-to "<deviceName>" -silent`
 *   (100% immune to Electron 35's `webContents.print({ silent: true })` spooler hang).
 * - Engine 2 (Fallback): `webContents.print({ silent: true, printBackground: true, deviceName })`
 *   with driver-compatible default margins.
 */
async function executeSilentSpoolOrPdf(contents, options = {}, layout = null) {
  const docLayout = layout || (await prepareDocumentForPrint(contents));
  const strategy = await resolvePrinterStrategy(
    contents,
    options.deviceName,
    Boolean(docLayout?.isThermal)
  );

  if (strategy.mode === "no-printer" || !strategy.deviceName) {
    return {
      ok: false,
      noPhysicalPrinter: true,
      error:
        strategy.error ||
        "No physical hardware printer detected on Windows. Please connect a printer or select one in Settings → Print & Receipt Layouts.",
    };
  }

  const targetPrinter = strategy.deviceName;
  const sumatraExe = resolveSumatraPdfBinary();

  // Primary Engine on Windows: printToPDF + SumatraPDF direct Win32 spooling
  if (process.platform === "win32" && sumatraExe) {
    const tempPdfPath = path.join(
      os.tmpdir(),
      `karobar-spool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`
    );
    try {
      const pdfOptions = {
        printBackground: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      };

      if (docLayout?.isThermal) {
        const rawMm = Number(docLayout.widthMm || 80);
        const widthIn = Math.max(1.5, Math.min(8.5, Number((rawMm / 25.4).toFixed(3))));
        const extraBottomIn = Math.max(0, Number(docLayout.marginBottomMm || 4)) / 25.4;
        const heightIn = Math.max(
          Number(docLayout.heightPx || 400) / 96 + 0.2 + extraBottomIn,
          2.2
        );
        pdfOptions.pageSize = { width: widthIn, height: heightIn };
        pdfOptions.preferCSSPageSize = false;
      } else {
        pdfOptions.pageSize = "A4";
        pdfOptions.preferCSSPageSize = true;
      }

      const pdfBuffer = await contents.printToPDF(pdfOptions);
      fs.writeFileSync(tempPdfPath, pdfBuffer);

      const sumatraResult = await spoolPdfViaSumatra(
        sumatraExe,
        tempPdfPath,
        targetPrinter,
        Boolean(docLayout?.isThermal),
        String(docLayout?.scaleMode || options.scaleMode || "auto")
      );

      setTimeout(() => {
        try {
          if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
        } catch {
          // ignore
        }
      }, 15000);

      if (sumatraResult.ok) {
        return {
          ok: true,
          printer: targetPrinter,
          engine: "sumatra-win32",
        };
      }
    } catch {
      setTimeout(() => {
        try {
          if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
        } catch {
          // ignore
        }
      }, 5000);
    }
  }

  // Fallback Engine: Chromium webContents.print() with driver-safe default margins
  return spoolViaWebContentsPrint(contents, targetPrinter, options.silent !== false);
}

function createHiddenPrintWindow() {
  const sessionToUse =
    mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents.session : undefined;

  const win = new BrowserWindow({
    width: 820,
    height: 900,
    show: false,
    paintWhenInitiallyHidden: true,
    skipTaskbar: true,
    frame: false,
    transparent: false,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      session: sessionToUse,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      additionalArguments: ["--karobar-offscreen-print=1"],
    },
  });

  win.webContents.on("dom-ready", () => {
    if (!win.isDestroyed()) {
      win.webContents
        .executeJavaScript("window.print = () => {}; window.close = () => {};")
        .catch(() => {});
    }
  });

  return win;
}

function prewarmPrintWindow() {
  if (!printWorkerWindow || printWorkerWindow.isDestroyed()) {
    printWorkerWindow = createHiddenPrintWindow();
    printWorkerWindow.on("closed", () => {
      if (printWorkerWindow === winRef) {
        printWorkerWindow = null;
      }
    });
    const winRef = printWorkerWindow;
  }
  return printWorkerWindow;
}

function acquirePrintWindow() {
  let win = printWorkerWindow;
  printWorkerWindow = null;
  if (!win || win.isDestroyed()) {
    win = createHiddenPrintWindow();
  }
  // Pre-warm the next isolated print window in the background for zero-latency subsequent prints
  setTimeout(() => {
    try {
      if (!isQuitting) prewarmPrintWindow();
    } catch {
      // ignore
    }
  }, 50);
  return win;
}

function releasePrintWindow(win) {
  if (!win) return;
  setTimeout(() => {
    try {
      if (!win.isDestroyed()) {
        win.destroy();
      }
    } catch {
      // ignore
    }
  }, 5000);
}

let printJobChain = Promise.resolve();

/**
 * Run a silent print job on a dedicated pre-warmed offscreen BrowserWindow.
 * Each print job gets a clean BrowserWindow instance that is destroyed 5s after spooling
 * so Chromium's PrintViewManager never locks up across jobs.
 */
function runOffscreenPrintJob(loadTargetFn, options = {}) {
  const job = printJobChain.then(async () => {
    const printWin = acquirePrintWindow();
    try {
      await loadTargetFn(printWin);
      const layout = await prepareDocumentForPrint(printWin.webContents);
      return await executeSilentSpoolOrPdf(printWin.webContents, options, layout);
    } catch (err) {
      return { ok: false, error: err?.message || "Failed to print slip" };
    } finally {
      releasePrintWindow(printWin);
    }
  });
  printJobChain = job.catch(() => {});
  return job;
}

ipcMain.handle("karobar:silent-print", async (event, options = {}) => {
  const targetContents =
    event?.sender && !event.sender.isDestroyed()
      ? event.sender
      : mainWindow && !mainWindow.isDestroyed()
      ? mainWindow.webContents
      : null;

  if (!targetContents) return { ok: false, error: "No active window to print" };
  return executeSilentSpoolOrPdf(targetContents, options, {
    isThermal: false,
    widthMm: 210,
    heightPx: 1122,
  });
});

ipcMain.handle("karobar:print-url", async (_event, payload = {}) => {
  const rawUrl = String(payload?.url || "").trim();
  if (!rawUrl) {
    return { ok: false, error: "Missing print URL" };
  }

  let resolvedUrl =
    rawUrl.startsWith("http://") || rawUrl.startsWith("https://")
      ? rawUrl
      : `http://127.0.0.1:${activePort}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;
  if (!/[?&]silent_print=/i.test(resolvedUrl)) {
    resolvedUrl += (resolvedUrl.includes("?") ? "&" : "?") + "silent_print=1";
  }

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
    // Delay temp HTML file removal by 15s so Chromium's compositor & Windows spooler never lose the file mid-job
    setTimeout(() => {
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch {
        // ignore temp file cleanup errors
      }
    }, 15000);
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

