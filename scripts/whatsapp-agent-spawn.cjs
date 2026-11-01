#!/usr/bin/env node
/**
 * Cross-platform detached daemon launcher for Karobar Local WhatsApp Agent.
 * Uses only Node.js built-in modules so it exits in <30ms without holding
 * any PHP-FPM / PHP-CGI / Laravel Herd stdio pipes open on Windows or macOS.
 */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const agentScript = process.argv[2] || path.join(__dirname, "whatsapp-agent.mjs");
const logFile =
  process.argv[3] || path.join(__dirname, "..", "storage", "logs", "whatsapp-agent.log");
const rootDir = path.resolve(__dirname, "..");

try {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const logFd = fs.openSync(logFile, "a");

  const child = spawn(process.execPath, [agentScript], {
    cwd: rootDir,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      NODE_NO_WARNINGS: "1",
    },
  });

  child.unref();
  try {
    fs.closeSync(logFd);
  } catch {
    // ignore
  }
  process.exit(0);
} catch (err) {
  try {
    fs.appendFileSync(
      logFile,
      `[${new Date().toISOString()}] Spawner error: ${err?.stack || err}\n`
    );
  } catch {
    // ignore
  }
  console.error(err?.message || String(err));
  process.exit(1);
}

