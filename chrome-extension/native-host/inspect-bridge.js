#!/usr/local/bin/node

/**
 * Native Messaging Host for Click-to-Inspect
 *
 * Protocol: Chrome sends 4-byte little-endian length prefix + JSON via stdin.
 * We respond with the same format on stdout.
 *
 * Messages:
 *   { type: 'submit', payload: {...} } → write .omc/inspect-prompt.json
 *   { type: 'status' }                → check if file exists (pending) or consumed
 *   { type: 'set-project-root', path } → update project root config
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Debug log for troubleshooting Chrome launch issues
const LOG_PATH = path.join(os.homedir(), '.click-to-inspect-debug.log');
function debugLog(msg) {
  try {
    fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

debugLog('Native host started, pid=' + process.pid);

process.on('uncaughtException', (err) => {
  debugLog('UNCAUGHT: ' + err.stack);
  process.exit(1);
});

const CONFIG_PATH = path.join(os.homedir(), '.click-to-inspect-config.json');

function getProjectRoot() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    if (config.projectRoot) return config.projectRoot;
  } catch {
    // no config yet
  }
  return path.join(os.homedir(), 'Documents/Agent-Design-System');
}

function getInspectPath() {
  return path.join(getProjectRoot(), '.omc', 'inspect-prompt.json');
}

// ─── Native Messaging I/O ─────────────────────────────────────────────

function sendMessage(msg) {
  const json = JSON.stringify(msg);
  debugLog('Sending: ' + json);
  const buf = Buffer.alloc(4 + Buffer.byteLength(json, 'utf-8'));
  buf.writeUInt32LE(Buffer.byteLength(json, 'utf-8'), 0);
  buf.write(json, 4, 'utf-8');
  process.stdout.write(buf);
  debugLog('Sent OK');
}

let inputBuffer = Buffer.alloc(0);

process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);

  while (inputBuffer.length >= 4) {
    const msgLen = inputBuffer.readUInt32LE(0);
    if (inputBuffer.length < 4 + msgLen) break;

    const jsonStr = inputBuffer.slice(4, 4 + msgLen).toString('utf-8');
    inputBuffer = inputBuffer.slice(4 + msgLen);

    try {
      const msg = JSON.parse(jsonStr);
      debugLog('Received: ' + JSON.stringify(msg));
      handleMessage(msg);
      debugLog('Handled: ' + msg.type);
    } catch (e) {
      debugLog('Parse error: ' + e.message);
      sendMessage({ ok: false, error: 'Invalid JSON: ' + e.message });
    }
  }
});

process.stdin.on('end', () => {
  // Give stdout time to flush before exiting
  debugLog('stdin ended, flushing stdout...');
  process.stdout.write('', () => {
    debugLog('stdout flushed, exiting');
    process.exit(0);
  });
  // Fallback exit after 500ms
  setTimeout(() => process.exit(0), 500);
});

// ─── Message Handler ──────────────────────────────────────────────────

function handleMessage(msg) {
  // Preserve _msgId for response matching in persistent connections
  const msgId = msg._msgId;

  if (msg.type === 'submit') {
    try {
      const filePath = getInspectPath();
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(msg.payload, null, 2), 'utf-8');
      sendMessage({ ok: true, path: filePath, _msgId: msgId });
    } catch (e) {
      sendMessage({ ok: false, error: e.message, _msgId: msgId });
    }
    return;
  }

  if (msg.type === 'status') {
    const filePath = getInspectPath();
    const exists = fs.existsSync(filePath);
    sendMessage({ status: exists ? 'pending' : 'consumed', _msgId: msgId });
    return;
  }

  if (msg.type === 'set-project-root') {
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify({ projectRoot: msg.path }, null, 2), 'utf-8');
      sendMessage({ ok: true, _msgId: msgId });
    } catch (e) {
      sendMessage({ ok: false, error: e.message, _msgId: msgId });
    }
    return;
  }

  sendMessage({ ok: false, error: 'Unknown message type: ' + msg.type, _msgId: msgId });
}
