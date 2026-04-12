/**
 * Moloco Inspect Popup Script
 */

const toggleBtn = document.getElementById('toggleBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const serverDot = document.getElementById('serverDot');
const serverText = document.getElementById('serverText');
const serverMeta = document.getElementById('serverMeta');
const refreshHealthBtn = document.getElementById('refreshHealthBtn');
const projectRootInput = document.getElementById('projectRoot');

let isActive = false;
let serverHealth = null;

// Load saved project root
chrome.storage.local.get(['projectRoot'], (result) => {
  if (result.projectRoot) {
    projectRootInput.value = result.projectRoot;
  }
});

chrome.storage.local.get(['serverUrl'], (result) => {
  if (result.serverUrl) {
    serverMeta.textContent = `Server URL: ${result.serverUrl}`;
  }
});

// M4 fix: Query current inspect state from content script on popup open
chrome.runtime.sendMessage({ type: 'popup-get-state' }, (response) => {
  if (response && response.active != null) {
    isActive = response.active;
    updateUI();
  }
});

refreshHealth();

// Save project root on change
projectRootInput.addEventListener('change', () => {
  const value = projectRootInput.value.trim();
  chrome.storage.local.set({ projectRoot: value });
  // C2 fix: Notify native host of path change via background
  chrome.runtime.sendMessage({ type: 'set-project-root', path: value });
});

refreshHealthBtn.addEventListener('click', refreshHealth);

// Toggle button
toggleBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];

    chrome.runtime.sendMessage({ type: 'popup-toggle' }, (response) => {
      if (chrome.runtime.lastError) {
        statusText.textContent = `Toggle failed: ${chrome.runtime.lastError.message}`;
        return;
      }

      if (response && response.ok === false) {
        const errorMessage = response.error || 'Unknown error';
        if (tab?.id && errorMessage.includes('Extension context invalidated')) {
          handleStaleContext(tab.id);
          return;
        }
        statusText.textContent = `Toggle failed: ${errorMessage}`;
        return;
      }

      if (response && response.active != null) {
        isActive = response.active;
      } else {
        isActive = !isActive;
      }
      updateUI();
    });
  });
});

function updateUI() {
  if (isActive) {
    toggleBtn.textContent = 'Deactivate Inspector';
    toggleBtn.classList.add('active');
    statusDot.classList.add('active');
    statusDot.classList.remove('inactive');
    statusText.textContent = 'Active — click any element';
  } else {
    toggleBtn.textContent = 'Activate Inspector';
    toggleBtn.classList.remove('active');
    statusDot.classList.remove('active');
    statusDot.classList.add('inactive');
    statusText.textContent = 'Inactive';
  }
}

function updateHealthUI() {
  serverDot.classList.remove('connected', 'inactive', 'error', 'active');

  if (!serverHealth) {
    serverDot.classList.add('inactive');
    serverText.textContent = 'Checking server...';
    return;
  }

  const mode = serverHealth.mode || 'http';
  if (mode !== 'http') {
    serverDot.classList.add('connected');
    serverText.textContent = 'Native mode';
    serverMeta.textContent = 'Server check is skipped in native mode';
    return;
  }

  serverMeta.textContent = `Server URL: ${serverHealth.serverUrl || 'http://localhost:3847'}`;

  if (serverHealth.serverReachable) {
    serverDot.classList.add('connected');
    serverText.textContent = 'Orchestrator connected';
  } else {
    serverDot.classList.add('error');
    serverText.textContent = 'Orchestrator disconnected';
  }

  if (serverHealth.lastError) {
    serverMeta.textContent += `\nLast error: ${serverHealth.lastError}`;
  }
}

function refreshHealth() {
  serverText.textContent = 'Checking server...';
  serverDot.classList.remove('connected', 'inactive', 'error', 'active');
  serverDot.classList.add('inactive');

  chrome.runtime.sendMessage({ type: 'popup-get-health' }, (response) => {
    if (chrome.runtime.lastError) {
      serverHealth = {
        mode: 'http',
        serverReachable: false,
        serverUrl: 'http://localhost:3847',
        lastError: chrome.runtime.lastError.message,
      };
      updateHealthUI();
      return;
    }

    if (!response || response.ok === false) {
      serverHealth = {
        mode: 'http',
        serverReachable: false,
        serverUrl: 'http://localhost:3847',
        lastError: response?.error || 'Unknown error',
      };
      updateHealthUI();
      return;
    }

    serverHealth = response.health;
    updateHealthUI();
  });
}

function handleStaleContext(tabId) {
  statusText.textContent = 'Refreshing page to load the latest inspector...';
  chrome.tabs.reload(tabId, {}, () => {
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'popup-get-state' }, (response) => {
        if (response && response.active != null) {
          isActive = response.active;
          updateUI();
        } else {
          statusText.textContent = 'Page refreshed. Try Activate Inspector again.';
        }
      });
    }, 1200);
  });
}

updateUI();
