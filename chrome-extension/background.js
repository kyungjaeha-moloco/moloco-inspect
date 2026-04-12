/**
 * Moloco Inspect Background Service Worker
 *
 * Dual mode:
 * - HTTP mode (default): sends requests to Orchestration Server
 * - Native mode (fallback): sends to local Native Messaging Host
 *
 * Also manages extension icon state and side panel.
 */

const NATIVE_HOST = 'com.claudecode.inspect';
const DEFAULT_SERVER_URL = 'http://localhost:3847';
const HEALTH_ALARM = 'orchestrator-health-check';
const PREVIEW_BOOTSTRAP_PATH = '/__codex/preview-bootstrap';
const healthState = {
  serverReachable: false,
  mode: 'http',
  serverUrl: DEFAULT_SERVER_URL,
  lastCheckedAt: null,
  lastError: null,
};

function isInspectableUrl(url) {
  return (
    typeof url === 'string' &&
    (url.startsWith('http://localhost:') || url.startsWith('http://127.0.0.1:'))
  );
}

function normalizePreviewLanguage(language) {
  const normalized = String(language || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith('ko')) return 'ko';
  if (normalized.startsWith('en')) return 'en';
  return normalized;
}

function isAuthPreviewPath(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return (
      pathname.includes('/sign-in') ||
      pathname.includes('/forgot-password') ||
      pathname.includes('/workplace')
    );
  } catch {
    return false;
  }
}

function extractWorkplaceIdFromPreviewUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\/v1\/p\/([^/]+)/);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

function getLanguageFromPreviewUrl(url) {
  try {
    return normalizePreviewLanguage(new URL(url).searchParams.get('lng'));
  } catch {
    return null;
  }
}

async function bootstrapPreviewAuthSession(tabId, url) {
  const workplaceId = extractWorkplaceIdFromPreviewUrl(url);
  const language = getLanguageFromPreviewUrl(url);
  const expireTime = new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString();

  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: ({ workplaceId: targetWorkplaceId, language: targetLanguage, expireTime: targetExpireTime }) => {
      window.sessionStorage.setItem(
        'MSM_AUTH',
        JSON.stringify({
          token: 'mock-id-token',
          expireTime: targetExpireTime,
        }),
      );

      if (targetWorkplaceId) {
        window.sessionStorage.setItem(
          'MSM_AUTH_WORKPLACE',
          JSON.stringify({
            workplaceId: targetWorkplaceId,
            token: `mock-workplace-token:${targetWorkplaceId}`,
            expireTime: targetExpireTime,
          }),
        );
      }

      if (targetLanguage) {
        window.localStorage.setItem('i18nextLng', targetLanguage);
        window.sessionStorage.setItem('i18nextLng', targetLanguage);
      }
    },
    args: [{ workplaceId, language, expireTime }],
  });
}

async function seedPreviewSessionAndRecover(tabId, url) {
  const workplaceId = extractWorkplaceIdFromPreviewUrl(url);
  const language = getLanguageFromPreviewUrl(url);
  const expireTime = new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString();

  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: ({ workplaceId: targetWorkplaceId, language: targetLanguage, expireTime: targetExpireTime, targetUrl }) => {
      window.sessionStorage.setItem(
        'MSM_AUTH',
        JSON.stringify({
          token: 'mock-id-token',
          expireTime: targetExpireTime,
        }),
      );

      if (targetWorkplaceId) {
        window.sessionStorage.setItem(
          'MSM_AUTH_WORKPLACE',
          JSON.stringify({
            workplaceId: targetWorkplaceId,
            token: `mock-workplace-token:${targetWorkplaceId}`,
            expireTime: targetExpireTime,
          }),
        );
      }

      if (targetLanguage) {
        window.localStorage.setItem('i18nextLng', targetLanguage);
        window.sessionStorage.setItem('i18nextLng', targetLanguage);
      }

      const pathname = window.location.pathname.toLowerCase();
      const inAuthFlow =
        pathname.includes('/sign-in') ||
        pathname.includes('/forgot-password') ||
        pathname.includes('/workplace');

      if (inAuthFlow) {
        window.location.replace(targetUrl);
        return;
      }

      const currentUrl = window.location.href;
      if (currentUrl !== targetUrl) {
        window.location.replace(targetUrl);
        return;
      }

      window.location.reload();
    },
    args: [{ workplaceId, language, expireTime, targetUrl: url }],
  });
}

async function openPreviewUrlWithBootstrap(url) {
  try {
    const pathname = new URL(url).pathname;
    if (pathname === PREVIEW_BOOTSTRAP_PATH) {
      const tab = await chrome.tabs.create({ url });
      return { ok: true, tabId: tab?.id || null };
    }
  } catch {
    // fall through to legacy recovery for non-standard URLs
  }

  const tab = await chrome.tabs.create({ url });
  if (!tab?.id || !isInspectableUrl(url) || isAuthPreviewPath(url) || /\/api\/screenshot\//.test(url)) {
    return { ok: true, tabId: tab?.id || null };
  }

  await new Promise((resolve, reject) => {
    let bootstrapAttempts = 0;
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Timed out while preparing preview tab'));
    }, 15000);

    const listener = async (updatedTabId, changeInfo) => {
      if (updatedTabId !== tab.id || changeInfo.status !== 'complete') {
        return;
      }

      try {
        const currentTab = await chrome.tabs.get(tab.id);
        const currentUrl = currentTab.url || '';
        const needsRecovery = isAuthPreviewPath(currentUrl) || bootstrapAttempts === 0;

        if (needsRecovery && bootstrapAttempts < 3) {
          bootstrapAttempts += 1;
          await seedPreviewSessionAndRecover(tab.id, url);
          return;
        }

        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      } catch (error) {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        reject(error);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });

  return { ok: true, tabId: tab.id };
}

// ─── Config ───────────────────────────────────────────────────────────

async function getConfig() {
  const result = await chrome.storage.local.get(['serverUrl', 'mode']);
  return {
    serverUrl: result.serverUrl || DEFAULT_SERVER_URL,
    mode: result.mode || 'http', // 'http' or 'native'
  };
}

async function refreshHealthState() {
  const config = await getConfig();
  healthState.mode = config.mode;
  healthState.serverUrl = config.serverUrl;
  healthState.lastCheckedAt = new Date().toISOString();

  if (config.mode !== 'http') {
    healthState.serverReachable = true;
    healthState.lastError = null;
    setIconState('connected');
    return { ...healthState };
  }

  try {
    const response = await fetch(`${config.serverUrl}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) {
      throw new Error(`Health check returned ${response.status}`);
    }
    healthState.serverReachable = true;
    healthState.lastError = null;
    setIconState('connected');
  } catch (error) {
    healthState.serverReachable = false;
    healthState.lastError = error.message;
    setIconState('disconnected');
  }

  return { ...healthState };
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        const rawMessage = chrome.runtime.lastError.message || 'Unknown tab messaging error';
        if (rawMessage.includes('Extension context invalidated')) {
          reject(new Error('Extension context invalidated'));
          return;
        }
        reject(new Error(rawMessage));
        return;
      }
      resolve(response);
    });
  });
}

function executeScript(tabId, files) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files,
      },
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      },
    );
  });
}

function insertCss(tabId, files) {
  return new Promise((resolve, reject) => {
    chrome.scripting.insertCSS(
      {
        target: { tabId },
        files,
      },
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      },
    );
  });
}

async function ensureInspectorReady(tab) {
  if (!tab || !tab.id || !tab.url) {
    throw new Error('No active tab available');
  }

  if (!isInspectableUrl(tab.url)) {
    throw new Error('Inspector only works on localhost or 127.0.0.1 pages');
  }

  try {
    await sendTabMessage(tab.id, { type: 'get-inspect-state' });
    return;
  } catch {
    await insertCss(tab.id, ['content-style.css']);
    await executeScript(tab.id, ['content-script.js']);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await sendTabMessage(tab.id, { type: 'get-inspect-state' });
  }
}

// ─── Icon state management ────────────────────────────────────────────

const ICON_COLORS = {
  disconnected: [128, 128, 128, 255],
  inactive: [128, 128, 128, 255],
  connected: [52, 107, 234, 255],
  active: [52, 107, 234, 255],
  sent: [255, 167, 38, 255],
  applied: [102, 187, 106, 255],
};

function drawIcon(size, color) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `rgba(${color.join(',')})`;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = size > 32 ? 2 : 1.5;
  const cx = size / 2, cy = size / 2, r = size * 0.25;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - r - size * 0.1);
  ctx.lineTo(cx, cy + r + size * 0.1);
  ctx.moveTo(cx - r - size * 0.1, cy);
  ctx.lineTo(cx + r + size * 0.1, cy);
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

function setIconState(state) {
  const color = ICON_COLORS[state] || ICON_COLORS.inactive;
  chrome.action.setIcon({
    imageData: { 16: drawIcon(16, color), 32: drawIcon(32, color), 48: drawIcon(48, color) },
  });
}

function restoreBaseIconState() {
  setIconState(healthState.serverReachable ? 'connected' : 'disconnected');
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(HEALTH_ALARM, { periodInMinutes: 1 });
  void refreshHealthState();
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id && isInspectableUrl(tab.url)) {
        chrome.tabs.reload(tab.id);
      }
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(HEALTH_ALARM, { periodInMinutes: 1 });
  void refreshHealthState();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEALTH_ALARM) {
    void refreshHealthState();
  }
});

void refreshHealthState();

// ─── Side Panel ───────────────────────────────────────────────────────

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// ─── HTTP Transport ───────────────────────────────────────────────────

async function sendHttp(endpoint, body) {
  const { serverUrl } = await getConfig();
  const res = await fetch(`${serverUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function fetchStatus(requestId) {
  const { serverUrl } = await getConfig();
  const res = await fetch(`${serverUrl}/api/status/${requestId}`);
  const result = await res.json();
  if (result && result.screenshotUrl && result.screenshotUrl.startsWith('/')) {
    result.screenshotUrl = `${serverUrl}${result.screenshotUrl}`;
  }
  return result;
}

async function fetchRequestSchema() {
  const { serverUrl } = await getConfig();
  const res = await fetch(`${serverUrl}/api/request-schema`);
  if (!res.ok) {
    throw new Error(`Request schema fetch returned ${res.status}`);
  }
  return res.json();
}

async function ingestPrd(payload) {
  const { serverUrl } = await getConfig();
  const res = await fetch(`${serverUrl}/api/prd/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(errorText || `PRD ingest returned ${res.status}`);
  }
  return res.json();
}

async function fetchScreenshotDataUrl(url) {
  const response = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Screenshot fetch returned ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || 'image/png';
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

async function reloadActiveInspectableTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.id || !isInspectableUrl(tab.url)) {
    return false;
  }
  await chrome.tabs.reload(tab.id);
  return true;
}

async function getActiveInspectableTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.id || !isInspectableUrl(tab.url)) {
    throw new Error('No active localhost tab found');
  }
  return tab;
}

async function getInspectableTabByUrl(urlIncludes = '') {
  const tabs = await chrome.tabs.query({});
  const inspectableTabs = tabs.filter((tab) => tab.id && isInspectableUrl(tab.url));
  if (!inspectableTabs.length) {
    throw new Error('No localhost tab found for extension test');
  }

  if (!urlIncludes) {
    return inspectableTabs[0];
  }

  const matched = inspectableTabs.find((tab) => String(tab.url || '').includes(urlIncludes));
  if (!matched) {
    throw new Error(`No localhost tab matched ${urlIncludes}`);
  }
  return matched;
}

async function cropCapturedImage(dataUrl, rect) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const dpr = rect.devicePixelRatio || 1;
  const sx = Math.max(0, Math.round(rect.left * dpr));
  const sy = Math.max(0, Math.round(rect.top * dpr));
  const sw = Math.min(bitmap.width - sx, Math.max(1, Math.round(rect.width * dpr)));
  const sh = Math.min(bitmap.height - sy, Math.max(1, Math.round(rect.height * dpr)));
  const canvas = new OffscreenCanvas(sw, sh);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await croppedBlob.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

// ─── Native Transport (fallback) ──────────────────────────────────────

function sendNative(msg, callback) {
  chrome.runtime.sendNativeMessage(NATIVE_HOST, msg, (response) => {
    if (chrome.runtime.lastError) {
      const err = chrome.runtime.lastError.message;
      if (!err.includes('exited')) {
        console.error('[Moloco Inspect] Native messaging error:', err);
      }
      if (callback) callback(response || { ok: false, status: 'error', error: err });
      return;
    }
    if (callback) callback(response);
  });
}

// ─── Message routing ──────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // Submit change request
  if (msg.type === 'inspect-submit') {
    (async () => {
      const config = await getConfig();
      if (config.mode === 'http') {
        try {
          const result = await sendHttp('/api/change-request', msg.payload);
          setIconState('sent');
          sendResponse({ ok: true, requestId: result.id, mode: 'http' });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
      } else {
        sendNative({ type: 'submit', payload: msg.payload }, (response) => {
          if (response && response.ok) setIconState('sent');
          sendResponse(response || { ok: true, mode: 'native' });
        });
      }
    })();
    return true;
  }

  // Poll status (HTTP mode only — returns full state)
  if (msg.type === 'inspect-poll') {
    (async () => {
      try {
        const result = await fetchStatus(msg.requestId);
        if (result.status === 'preview' || result.status === 'approved') {
          setIconState('applied');
          setTimeout(() => restoreBaseIconState(), 3000);
        }
        sendResponse(result);
      } catch (e) {
        sendResponse({ status: 'error', error: e.message });
      }
    })();
    return true;
  }

  // Approve (HTTP mode)
  if (msg.type === 'inspect-approve') {
    (async () => {
      try {
        const result = await sendHttp(`/api/approve/${msg.requestId}`, {});
        const reloaded = await reloadActiveInspectableTab().catch(() => false);
        result.reloaded = reloaded;
        sendResponse(result);
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  // Reject with feedback (HTTP mode)
  if (msg.type === 'inspect-reject') {
    (async () => {
      try {
        const result = await sendHttp(`/api/reject/${msg.requestId}`, { feedback: msg.feedback });
        sendResponse(result);
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  if (msg.type === 'inspect-open-url') {
    (async () => {
      try {
        const result = await openPreviewUrlWithBootstrap(msg.url);
        sendResponse(result);
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }

  if (msg.type === 'start-region-capture') {
    (async () => {
      try {
        const tab = await getActiveInspectableTab();
        await ensureInspectorReady(tab);
        await sendTabMessage(tab.id, { type: 'start-region-capture' });
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }

  if (msg.type === 'capture-region-selected') {
    (async () => {
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(undefined, { format: 'png' });
        const croppedDataUrl = await cropCapturedImage(dataUrl, msg.rect);
        chrome.runtime.sendMessage({
          type: 'capture-region-ready',
          data: {
            imageDataUrl: croppedDataUrl,
            rect: msg.rect,
          },
        });
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }

  // Native mode: check status
  if (msg.type === 'inspect-status') {
    sendNative({ type: 'status' }, (response) => {
      if (response && response.status === 'consumed') {
        setIconState('applied');
        setTimeout(() => restoreBaseIconState(), 3000);
      }
      sendResponse(response || { status: 'unknown' });
    });
    return true;
  }

  // Content-script inspect state
  if (msg.type === 'inspect-state') {
    if (msg.active && (healthState.mode !== 'http' || healthState.serverReachable)) {
      setIconState('active');
    } else {
      restoreBaseIconState();
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'element-selected') {
    return false;
  }

  if (msg.type === 'popup-toggle') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) {
        sendResponse({ ok: false, error: 'No active tab found' });
        return;
      }

      ensureInspectorReady(tab)
        .then(() => sendTabMessage(tab.id, { type: 'toggle-inspect' }))
        .then((result) => sendResponse({ ok: true, active: result && result.active != null ? result.active : null }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
    });
    return true;
  }

  if (msg.type === 'inspect-clear-selection') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) {
        sendResponse({ ok: false, error: 'No active tab found' });
        return;
      }

      ensureInspectorReady(tab)
        .then(() => sendTabMessage(tab.id, { type: 'clear-selected-element' }))
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
    });
    return true;
  }

  if (msg.type === 'set-server-url') {
    chrome.storage.local.set({ serverUrl: msg.url });
    refreshHealthState()
      .then((state) => sendResponse({ ok: true, health: state }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (msg.type === 'set-mode') {
    chrome.storage.local.set({ mode: msg.mode });
    refreshHealthState()
      .then((state) => sendResponse({ ok: true, health: state }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (msg.type === 'set-project-root') {
    sendNative({ type: 'set-project-root', path: msg.path }, (response) => {
      sendResponse(response || { ok: true });
    });
    return true;
  }

  if (msg.type === 'popup-get-state') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) {
        sendResponse({ active: false });
        return;
      }

      ensureInspectorReady(tab)
        .then(() => sendTabMessage(tab.id, { type: 'get-inspect-state' }))
        .then((response) => sendResponse(response || { active: false }))
        .catch(() => sendResponse({ active: false }));
    });
    return true;
  }

  if (msg.type === 'popup-get-page-context') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) {
        sendResponse({ ok: false, error: 'No active tab found' });
        return;
      }

      ensureInspectorReady(tab)
        .then(() => sendTabMessage(tab.id, { type: 'get-page-context' }))
        .then((response) => sendResponse({ ok: true, context: response || null }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
    });
    return true;
  }

  if (msg.type === 'popup-get-health') {
    refreshHealthState()
      .then((state) => sendResponse({ ok: true, health: state }))
      .catch((error) => sendResponse({ ok: false, error: error.message, health: { ...healthState } }));
    return true;
  }

  if (msg.type === 'inspect-get-request-schema') {
    fetchRequestSchema()
      .then((schema) => sendResponse({ ok: true, schema }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (msg.type === 'inspect-prd-ingest') {
    ingestPrd(msg.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (msg.type === 'inspect-get-screenshot-data') {
    fetchScreenshotDataUrl(msg.url)
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (msg.type === 'inspect-test-toggle-inspector') {
    (async () => {
      try {
        const tab = await getInspectableTabByUrl(msg.urlIncludes || '');
        await ensureInspectorReady(tab);
        const response = await sendTabMessage(tab.id, { type: 'toggle-inspect' });
        sendResponse({ ok: true, active: response?.active ?? null, tabId: tab.id });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }

  if (msg.type === 'inspect-test-start-region-capture') {
    (async () => {
      try {
        const tab = await getInspectableTabByUrl(msg.urlIncludes || '');
        await ensureInspectorReady(tab);
        await sendTabMessage(tab.id, { type: 'start-region-capture' });
        sendResponse({ ok: true, tabId: tab.id });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }

  return false;
});
