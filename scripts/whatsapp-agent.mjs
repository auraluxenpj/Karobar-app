#!/usr/bin/env node
/**
 * Karobar App ERP — Built-in 100% Free Local WhatsApp Multi-Device Agent
 * Powered by @whiskeysockets/baileys (Open-Source MIT, Zero Monthly Fees, No Chrome Required)
 *
 * Endpoints (127.0.0.1:3001 by default):
 *   GET  /status         -> Live connection state, QR code Data URL, pairing code, connected phone
 *   POST /pair-code      -> Request 8-digit phone number pairing code { phone: "923001234567" }
 *   POST /send-document  -> Send actual PDF Buffer + caption { phone, filename, document_base64, caption }
 *   POST /logout         -> Unlink current WhatsApp device & clear auth state
 *   POST /restart        -> Restart WhatsApp socket & refresh QR code
 *   POST /shutdown       -> Stop the background agent process
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestWaWebVersion,
  Browsers,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const PORT = Number(process.env.WHATSAPP_AGENT_PORT || 3001);
const HOST = process.env.WHATSAPP_AGENT_HOST || "127.0.0.1";
const API_KEY = (process.env.WHATSAPP_AGENT_API_KEY || "").trim();

const BASE_STORAGE_DIR =
  process.env.WHATSAPP_AGENT_STORAGE_DIR ||
  path.join(ROOT_DIR, "storage", "app", "whatsapp-agent");
const AUTH_DIR = path.join(BASE_STORAGE_DIR, "auth");
const META_FILE = path.join(BASE_STORAGE_DIR, "agent-runtime.json");

fs.mkdirSync(AUTH_DIR, { recursive: true });

const logger = pino({ level: "silent" });
const startedAt = Date.now();

let sock = null;
let connectionStatus = "starting"; // 'starting' | 'connecting' | 'qr_ready' | 'connected' | 'disconnected' | 'error'
let qrRaw = null;
let qrDataUrl = null;
let qrUpdatedAt = null;
let pairingCode = null;
let connectedUser = null;
let lastError = null;
let reconnectTimer = null;
let isStartingSocket = false;

function writeRuntimeMeta() {
  try {
    fs.mkdirSync(BASE_STORAGE_DIR, { recursive: true });
    fs.writeFileSync(
      META_FILE,
      JSON.stringify(
        {
          pid: process.pid,
          host: HOST,
          port: PORT,
          status: connectionStatus,
          user: connectedUser,
          updated_at: new Date().toISOString(),
        },
        null,
        2
      )
    );
  } catch {
    // ignore file write errors
  }
}

function extractPhoneFromJid(jid) {
  if (!jid) return "";
  const part = String(jid).split("@")[0] || "";
  return part.split(":")[0].replace(/\D+/g, "");
}

function clearAuthDirectory() {
  try {
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  } catch (err) {
    lastError = `Failed to reset auth folder: ${err?.message || err}`;
  }
}

async function initWhatsAppSocket() {
  if (isStartingSocket) return;
  isStartingSocket = true;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  try {
    if (sock) {
      try {
        sock.ev.removeAllListeners("connection.update");
        sock.ev.removeAllListeners("creds.update");
        sock.end(undefined);
      } catch {
        // ignore cleanup error
      }
      sock = null;
    }

    connectionStatus = "connecting";
    writeRuntimeMeta();

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    let versionOption = {};
    try {
      const latest = await Promise.race([
        fetchLatestWaWebVersion(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("version_fetch_timeout")), 2500)
        ),
      ]);
      if (latest?.version && latest.isLatest) {
        versionOption = { version: latest.version };
      }
    } catch {
      // Use Baileys built-in default version when slow or offline
    }

    sock = makeWASocket({
      ...versionOption,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: Browsers.macOS("Chrome"),
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 30000,
      defaultQueryTimeoutMs: 30000,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        qrRaw = qr;
        qrUpdatedAt = new Date().toISOString();
        try {
          qrDataUrl = await QRCode.toDataURL(qr, {
            errorCorrectionLevel: "M",
            margin: 2,
            width: 280,
            color: {
              dark: "#0f172a",
              light: "#ffffff",
            },
          });
          console.log(`[WhatsApp Agent] QR code ready at ${qrUpdatedAt}`);
        } catch (qrErr) {
          lastError = `QR generation error: ${qrErr?.message || qrErr}`;
          console.error(`[WhatsApp Agent] ${lastError}`);
        }
        connectionStatus = "qr_ready";
        lastError = null;
        writeRuntimeMeta();
      }

      if (connection === "open") {
        qrRaw = null;
        qrDataUrl = null;
        pairingCode = null;
        lastError = null;
        connectionStatus = "connected";

        const rawId = sock?.user?.id || "";
        connectedUser = {
          id: rawId,
          phone: extractPhoneFromJid(rawId),
          name:
            sock?.user?.name ||
            sock?.user?.verifiedName ||
            "Linked WhatsApp Business",
        };
        console.log(
          `[WhatsApp Agent] Connected as +${connectedUser.phone} (${connectedUser.name})`
        );
        writeRuntimeMeta();
      }

      if (connection === "close") {
        const statusCode =
          lastDisconnect?.error?.output?.statusCode ??
          lastDisconnect?.error?.statusCode ??
          null;
        const reasonMsg =
          lastDisconnect?.error?.message || "Connection closed";

        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

        if (isLoggedOut) {
          connectedUser = null;
          qrRaw = null;
          qrDataUrl = null;
          pairingCode = null;
          connectionStatus = "disconnected";
          lastError = "Device was unlinked from WhatsApp. Generating a fresh QR code...";
          clearAuthDirectory();
          writeRuntimeMeta();
          reconnectTimer = setTimeout(() => {
            initWhatsAppSocket();
          }, 1500);
        } else {
          connectionStatus = "connecting";
          lastError = reasonMsg;
          writeRuntimeMeta();
          reconnectTimer = setTimeout(() => {
            initWhatsAppSocket();
          }, 2500);
        }
      }
    });
  } catch (err) {
    connectionStatus = "error";
    lastError = err?.message || String(err);
    writeRuntimeMeta();
    reconnectTimer = setTimeout(() => {
      initWhatsAppSocket();
    }, 5000);
  } finally {
    isStartingSocket = false;
  }
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    const maxBytes = 35 * 1024 * 1024; // 35 MB max for PDF base64

    req.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error("Invalid JSON payload"));
      }
    });

    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function isAuthorized(req) {
  const remote = req.socket?.remoteAddress || "";
  const isLoopback =
    remote === "127.0.0.1" ||
    remote === "::1" ||
    remote === "::ffff:127.0.0.1";

  if (!API_KEY) {
    return isLoopback;
  }

  const headerKey = (req.headers["x-api-key"] || "").toString().trim();
  const authHeader = (req.headers["authorization"] || "").toString().trim();
  const bearerKey = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : authHeader;

  return headerKey === API_KEY || bearerKey === API_KEY;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  const parsedUrl = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  const pathname = parsedUrl.pathname;

  if (!isAuthorized(req)) {
    sendJson(res, 401, {
      ok: false,
      message: "Unauthorized: Invalid Local WhatsApp Agent API Key.",
    });
    return;
  }

  // Health & Status endpoint
  if (req.method === "GET" && (pathname === "/status" || pathname === "/")) {
    sendJson(res, 200, {
      ok: true,
      status: connectionStatus,
      qr_data_url: qrDataUrl,
      qr_updated_at: qrUpdatedAt,
      pairing_code: pairingCode,
      user: connectedUser,
      last_error: lastError,
      uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
      pid: process.pid,
      port: PORT,
    });
    return;
  }

  // Request 8-digit phone pairing code
  if (req.method === "POST" && pathname === "/pair-code") {
    try {
      const body = await parseJsonBody(req);
      const rawPhone = String(body.phone || "").replace(/\D+/g, "");
      if (!rawPhone || rawPhone.length < 8) {
        sendJson(res, 422, {
          ok: false,
          message:
            "Please enter a valid WhatsApp phone number with country code (e.g. 923001234567).",
        });
        return;
      }

      if (connectionStatus === "connected") {
        sendJson(res, 200, {
          ok: true,
          status: "connected",
          message: "WhatsApp is already connected.",
          user: connectedUser,
        });
        return;
      }

      if (!sock) {
        await initWhatsAppSocket();
      }

      if (!sock || typeof sock.requestPairingCode !== "function") {
        sendJson(res, 422, {
          ok: false,
          message: "WhatsApp socket is still initializing. Please try again in a moment.",
        });
        return;
      }

      const code = await sock.requestPairingCode(rawPhone);
      const formatted =
        code && code.length === 8
          ? `${code.slice(0, 4)}-${code.slice(4)}`
          : code;
      pairingCode = formatted;

      sendJson(res, 200, {
        ok: true,
        pairing_code: formatted,
        phone: rawPhone,
        message:
          "Open WhatsApp on your phone -> Linked Devices -> Link a Device -> Link with phone number instead, then enter this 8-digit code.",
      });
    } catch (err) {
      sendJson(res, 422, {
        ok: false,
        message: `Could not generate pairing code: ${err?.message || err}`,
      });
    }
    return;
  }

  // Send PDF Document
  if (req.method === "POST" && pathname === "/send-document") {
    try {
      const body = await parseJsonBody(req);
      const rawPhone = String(body.phone || body.to || "").replace(/\D+/g, "");
      const filename = String(body.filename || "Invoice.pdf").trim();
      const caption = String(body.caption || body.message || "").trim();
      let base64Data = String(body.document_base64 || body.document || body.media || "").trim();

      if (!rawPhone) {
        sendJson(res, 422, {
          ok: false,
          message: "Recipient phone number is required.",
        });
        return;
      }

      if (!base64Data) {
        sendJson(res, 422, {
          ok: false,
          message: "PDF document base64 content is required.",
        });
        return;
      }

      if (connectionStatus !== "connected" || !sock) {
        sendJson(res, 422, {
          ok: false,
          status: connectionStatus,
          message:
            "Built-in Free WhatsApp Agent is not linked yet. Open Settings -> WhatsApp API and scan the QR code with your phone.",
        });
        return;
      }

      if (base64Data.includes(",")) {
        base64Data = base64Data.split(",").pop();
      }

      const pdfBuffer = Buffer.from(base64Data, "base64");
      let targetJid = `${rawPhone}@s.whatsapp.net`;

      try {
        const [lookup] = await sock.onWhatsApp(rawPhone);
        if (lookup?.exists && lookup?.jid) {
          targetJid = lookup.jid;
        }
      } catch {
        // Proceed with standard JID if lookup times out
      }

      const sentMsg = await sock.sendMessage(targetJid, {
        document: pdfBuffer,
        mimetype: "application/pdf",
        fileName: filename,
        caption: caption,
      });

      sendJson(res, 200, {
        ok: true,
        sent: true,
        message_id: sentMsg?.key?.id || null,
        recipient: targetJid,
        filename,
      });
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        message: `Failed to send PDF via Local WhatsApp Agent: ${err?.message || err}`,
      });
    }
    return;
  }

  // Send Text Message (Refill Reminders, Notifications, etc.)
  if (req.method === "POST" && pathname === "/send-text") {
    try {
      const body = await parseJsonBody(req);
      const rawPhone = String(body.phone || body.to || "").replace(/\D+/g, "");
      const text = String(body.text || body.message || "").trim();

      if (!rawPhone) {
        sendJson(res, 422, {
          ok: false,
          message: "Recipient phone number is required.",
        });
        return;
      }

      if (!text) {
        sendJson(res, 422, {
          ok: false,
          message: "Message text is required.",
        });
        return;
      }

      if (connectionStatus !== "connected" || !sock) {
        sendJson(res, 422, {
          ok: false,
          status: connectionStatus,
          message:
            "Built-in Free WhatsApp Agent is not linked yet. Open Settings -> WhatsApp API and scan the QR code with your phone.",
        });
        return;
      }

      let targetJid = `${rawPhone}@s.whatsapp.net`;

      try {
        const [lookup] = await sock.onWhatsApp(rawPhone);
        if (lookup?.exists && lookup?.jid) {
          targetJid = lookup.jid;
        }
      } catch {
        // Proceed with standard JID if lookup times out
      }

      const sentMsg = await sock.sendMessage(targetJid, {
        text,
      });

      sendJson(res, 200, {
        ok: true,
        sent: true,
        message_id: sentMsg?.key?.id || null,
        recipient: targetJid,
      });
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        message: `Failed to send text via Local WhatsApp Agent: ${err?.message || err}`,
      });
    }
    return;
  }

  // Logout & unlink current WhatsApp session
  if (req.method === "POST" && pathname === "/logout") {
    try {
      if (sock) {
        try {
          await sock.logout();
        } catch {
          // ignore if already disconnected
        }
      }
      connectedUser = null;
      qrRaw = null;
      qrDataUrl = null;
      pairingCode = null;
      connectionStatus = "disconnected";
      isStartingSocket = false;
      clearAuthDirectory();
      writeRuntimeMeta();

      setTimeout(() => {
        initWhatsAppSocket();
      }, 500);

      sendJson(res, 200, {
        ok: true,
        status: "disconnected",
        message: "WhatsApp session unlinked. Generating a fresh QR code...",
      });
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        message: err?.message || "Failed to logout",
      });
    }
    return;
  }

  // Restart socket & refresh QR code
  if (req.method === "POST" && pathname === "/restart") {
    qrRaw = null;
    qrDataUrl = null;
    pairingCode = null;
    isStartingSocket = false;
    initWhatsAppSocket();
    sendJson(res, 200, {
      ok: true,
      status: connectionStatus,
      message: "Refreshing WhatsApp connection...",
    });
    return;
  }

  // Graceful shutdown
  if (req.method === "POST" && pathname === "/shutdown") {
    sendJson(res, 200, {
      ok: true,
      status: "stopped",
      message: "Stopping Local WhatsApp Agent...",
    });
    setTimeout(() => {
      process.exit(0);
    }, 150);
    return;
  }

  sendJson(res, 404, { ok: false, message: "Not found" });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    // Another instance is already running on this port
    process.exit(0);
  }
  console.error("WhatsApp Agent Server Error:", err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(
    `[WhatsApp Agent] Listening on http://${HOST}:${PORT} (PID: ${process.pid})`
  );
  writeRuntimeMeta();
  initWhatsAppSocket();
});

process.on("uncaughtException", (err) => {
  lastError = err?.message || String(err);
  console.error("[WhatsApp Agent] Uncaught exception:", err);
  writeRuntimeMeta();
});

process.on("unhandledRejection", (reason) => {
  lastError = reason?.message || String(reason);
  console.error("[WhatsApp Agent] Unhandled rejection:", reason);
  writeRuntimeMeta();
});
