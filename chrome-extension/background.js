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
  if (!tab?.id || !isInspectableUrl(url) || isAuthPreviewPath(url) || /\/api\/(screenshot|diff-view)\//.test(url) || /:\d+\/api\//.test(url)) {
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
    const data = await response.json();
    healthState.serverReachable = true;
    healthState.lastError = null;
    healthState.model = data.model || null;
    healthState.requests = data.requests ?? null;
    healthState.sandboxImage = data.sandboxImage || null;
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

// ─── Side Panel + Tab Group ─────────────────────────────────────────
//
// UX contract (revised 2026-04-30 — origin lock, Claude ext style):
//
//   1. First icon click → stores that tab's origin (protocol+host+port)
//      as `activeOrigin` (chrome.storage.local). Panel opens for that tab
//      + it is added to the Moloco Inspect tab group.
//   2. Panel enabled state for every tab is determined by `originMatches(tab.url)`.
//      Panel is active on *all* tabs with the same origin (no manual group add needed).
//   3. Navigate to a different origin → panel collapses automatically.
//   4. Click icon again from a different origin → *switches* activeOrigin. All tabs
//      from the previous origin lose the panel. Only one origin is locked at a time
//      (no multi-origin — simple single-origin).
//   5. Manifest's `side_panel.default_path` is global — we use
//      `sidePanel.setOptions({tabId, enabled})` to override per-tab.

const MOLOCO_GROUP_TITLE = 'Moloco Inspect';
const MOLOCO_GROUP_COLOR = 'cyan'; // chrome.tabGroups Color enum

// Origin lock — module-level cache, synced with chrome.storage.local.
// Loaded on startup via loadActiveOrigin().
let activeOrigin = null;

async function loadActiveOrigin() {
  try {
    const { activeOrigin: stored } = await chrome.storage.local.get(['activeOrigin']);
    activeOrigin = stored || null;
  } catch (err) {
    console.warn('[Moloco Inspect] loadActiveOrigin failed:', err.message);
  }
}

async function setActiveOrigin(origin) {
  activeOrigin = origin;
  try {
    await chrome.storage.local.set({ activeOrigin: origin });
  } catch (err) {
    console.warn('[Moloco Inspect] setActiveOrigin failed:', err.message);
  }
}

function getOrigin(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    // Exclude non-web origins like chrome://, file://, about: — not eligible for locking.
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.origin;
  } catch {
    return null;
  }
}

function originMatches(url) {
  if (!activeOrigin) return false;
  const o = getOrigin(url);
  return o === activeOrigin;
}

// Load on startup (fire-and-forget instead of top-level await — also reloaded
// on onStartup/onInstalled).
void loadActiveOrigin();

async function findMolocoGroup(windowId) {
  try {
    const groups = await chrome.tabGroups.query({
      windowId,
      title: MOLOCO_GROUP_TITLE,
    });
    return groups[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function addTabToMolocoGroup(tab) {
  if (!tab?.id) return null;
  try {
    const existingGroupId = await findMolocoGroup(tab.windowId);
    if (existingGroupId != null) {
      // Already in this group? No-op.
      if (tab.groupId === existingGroupId) return existingGroupId;
      await chrome.tabs.group({
        tabIds: [tab.id],
        groupId: existingGroupId,
      });
      return existingGroupId;
    }
    const newGroupId = await chrome.tabs.group({ tabIds: [tab.id] });
    await chrome.tabGroups.update(newGroupId, {
      title: MOLOCO_GROUP_TITLE,
      color: MOLOCO_GROUP_COLOR,
    });
    return newGroupId;
  } catch (err) {
    console.warn('[Moloco Inspect] addTabToMolocoGroup failed:', err.message);
    return null;
  }
}

async function isTabInMolocoGroup(tab) {
  // chrome.tabs.TAB_ID_NONE === -1, ungrouped tabs report groupId = -1.
  if (!tab || tab.groupId == null || tab.groupId === -1) return false;
  try {
    const group = await chrome.tabGroups.get(tab.groupId);
    return group?.title === MOLOCO_GROUP_TITLE;
  } catch {
    return false;
  }
}

async function updateSidePanelForTab(tabId) {
  if (tabId == null) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    // Origin lock — only tabs matching activeOrigin are enabled. Group membership
    // is a visual marker only (not used for panel state decisions).
    const ok = originMatches(tab.url);
    await chrome.sidePanel.setOptions({
      tabId,
      path: 'sidepanel.html',
      enabled: ok,
    });
  } catch (err) {
    // Tab may have been closed mid-flight; harmless.
    if (!/No tab with id/i.test(err.message ?? '')) {
      console.warn('[Moloco Inspect] updateSidePanelForTab failed:', err.message);
    }
  }
}

async function syncAllTabsSidePanel() {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.map((t) => updateSidePanelForTab(t.id)));
  } catch (err) {
    console.warn('[Moloco Inspect] syncAllTabsSidePanel failed:', err.message);
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id || !tab?.url) return;
  const origin = getOrigin(tab.url);
  if (!origin) {
    console.warn('[Moloco Inspect] cannot lock to non-http(s) URL:', tab.url);
    return;
  }
  // CRITICAL: chrome.sidePanel.open() requires a user gesture and the
  // gesture token expires across awaits. Do NOT await anything before
  // calling open — otherwise the panel fails to open silently.
  //
  // 1. Origin lock — switch if different origin; no change if same origin
  //    (storage write is idempotent — noop for the same value). Update cache
  //    immediately so syncAllTabsSidePanel evaluates against the new origin.
  const switched = activeOrigin !== origin;
  activeOrigin = origin;
  void chrome.storage.local.set({ activeOrigin: origin });
  // 2. Enable the panel for this tab (fire-and-forget; the request is
  //    dispatched to the browser before open() reaches it).
  chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: 'sidepanel.html',
    enabled: true,
  });
  // 3. Open synchronously off the same gesture.
  chrome.sidePanel.open({ tabId: tab.id }).catch((err) => {
    console.warn('[Moloco Inspect] sidePanel.open failed:', err.message);
  });
  // 4. Group + sync. Group is a visual marker only; sync updates other tabs'
  //    panel enable/disable state (deactivates previous origin tabs on switch).
  void addTabToMolocoGroup(tab);
  if (switched) {
    void syncAllTabsSidePanel();
  }
});

// Tab switched → enable tabs matching the origin, disable all others.
chrome.tabs.onActivated.addListener(({ tabId }) => {
  void updateSidePanelForTab(tabId);
});

// Re-evaluate panel state when tab URL or group changes.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.groupId !== undefined) {
    void updateSidePanelForTab(tabId);
  }
});

// On extension startup / fresh install: load activeOrigin + sync all tabs.
chrome.runtime.onStartup.addListener(() => {
  void loadActiveOrigin().then(() => syncAllTabsSidePanel());
});
chrome.runtime.onInstalled.addListener(() => {
  void loadActiveOrigin().then(() => syncAllTabsSidePanel());
});

// ─── Job pipeline helpers (Phase 2 / B Step 1) ───────────────────

/**
 * Compose a PRD-shaped text from the Chrome ext's selection-driven
 * payload so the orchestrator's decomposer + reviewer get the same
 * context the chat-style PRD flow gets in Slack/Playground.
 */
function buildJobPrdText(payload) {
  const lines = [];
  lines.push(payload?.userPrompt || '(no prompt)');

  const ctx = [];
  if (payload?.pagePath) ctx.push(`- Target page: ${payload.pagePath}`);
  if (payload?.client) ctx.push(`- Client: ${payload.client}`);
  if (payload?.component) ctx.push(`- Component: ${payload.component}`);
  if (payload?.file) {
    ctx.push(
      `- File: ${payload.file}${payload.line ? ':' + payload.line : ''}`,
    );
  }
  if (payload?.testId) ctx.push(`- testId: ${payload.testId}`);
  if (Array.isArray(payload?.selectedElements) && payload.selectedElements.length) {
    const labels = payload.selectedElements
      .map(
        (e) =>
          e.testId ||
          e.component ||
          e.semantics?.labelText ||
          e.semantics?.domTag ||
          'element',
      )
      .filter(Boolean)
      .slice(0, 5)
      .join(', ');
    if (labels) ctx.push(`- Selected element: ${labels}`);
  }
  if (ctx.length) {
    lines.push('');
    lines.push('Context:');
    lines.push(...ctx);
  }
  return lines.join('\n');
}

/**
 * Poll the job's status until it transitions out of `decomposing`,
 * then auto-approve. Skipping the human approval step is the Phase 2
 * Step 1 simplification — Step 2 will add a plan-approval card to
 * the sidepanel and remove this auto-approve.
 */
async function autoApproveJobInBackground(jobId) {
  const { serverUrl } = await getConfig();
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const res = await fetch(`${serverUrl}/api/job/${encodeURIComponent(jobId)}`);
      if (!res.ok) continue;
      const data = await res.json();
      const status = data?.job?.status;
      if (status === 'planning') {
        await fetch(
          `${serverUrl}/api/job/${encodeURIComponent(jobId)}/approve-plan`,
          { method: 'POST' },
        );
        return;
      }
      if (status === 'paused') {
        // Decompose failed (paused with reason). Sidepanel polling
        // will surface this; nothing to auto-do.
        return;
      }
      // Otherwise still decomposing → keep polling.
    } catch (err) {
      console.warn('[Moloco Inspect] auto-approve poll failed:', err.message);
    }
  }
}

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
          // M4: when the user has picked a playground in the sidepanel,
          // route the request into that playground's queue. The payload
          // shape otherwise matches the pre-M4 stateless path — the
          // orchestrator's /api/change-request handler branches on the
          // presence of `playgroundId`.
          const { selectedPlaygroundId } = await new Promise((resolve) =>
            chrome.storage.local.get(['selectedPlaygroundId'], resolve),
          );
          // Sidepanel uses the literal '__auto__' sentinel to mean
          // "create a new playground on send". By this point the
          // sidepanel's ensureEffectivePlayground() should have
          // already replaced the sentinel with a real playground id;
          // if the sentinel ever leaks through, treat it as stateless.
          const realPgId =
            selectedPlaygroundId && selectedPlaygroundId !== '__auto__'
              ? selectedPlaygroundId
              : null;

          // Phase 2 (B Step 1): when the user has a real playground
          // attached, route the request through the unified PRD/job
          // pipeline (decomposer → tasks → reviewer → QA) so Chrome
          // ext gets the same shape as Playground/molly. Stateless
          // (no playground) still uses the legacy single-shot
          // /api/change-request path — there's no Job concept without
          // a playground to attach to.
          if (realPgId) {
            const prdText = buildJobPrdText(msg.payload);
            const jobRes = await sendHttp(
              `/api/playground/${encodeURIComponent(realPgId)}/job`,
              { prdText },
            );
            const jobId = jobRes?.job?.id;
            if (!jobId) {
              throw new Error(
                `job creation returned no id: ${JSON.stringify(jobRes).slice(0, 200)}`,
              );
            }
            setIconState('sent');
            sendResponse({
              ok: true,
              jobId,
              mode: 'http-job',
              playgroundId: realPgId,
            });
            // Step 2: NO auto-approve. The sidepanel shows a plan
            // card with ✅ Approve / ✏️ Replan / ❌ Cancel buttons (same
            // shape as molly Slack), and the user explicitly approves
            // before the runner kicks off.
            return;
          }

          // Stateless (no playground) → legacy path.
          const payload = msg.payload;
          const result = await sendHttp('/api/change-request', payload);
          setIconState('sent');
          sendResponse({
            ok: true,
            requestId: result.id,
            mode: 'http',
            playgroundId: null,
          });
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
