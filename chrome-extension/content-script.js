/**
 * Click-to-Inspect Content Script
 *
 * Injected into localhost pages. Provides:
 * - Alt+Shift+X toggle for inspect mode
 * - Hover overlay highlighting
 * - Click to select element → React fiber + source info
 * - Prompt input → sends to background.js → Native Messaging → .omc/inspect-prompt.json
 */

(function () {
  'use strict';

  if (window.__codexClickToInspectLoaded) {
    return;
  }
  window.__codexClickToInspectLoaded = true;

  // ─── State ──────────────────────────────────────────────────────────
  let active = false;
  let selectedData = null;
  let overlayEl = null;
  let selectedVisuals = [];
  let selectedEntries = [];
  let tooltipEl = null;
  let toastEl = null;
  let captureMaskEl = null;
  let captureSelectionEl = null;
  let captureHelpEl = null;
  let pollingTimer = null;
  let pollCount = 0;
  let captureActive = false;
  let captureStartPoint = null;
  const MAX_POLL_COUNT = 60; // M1 fix: timeout after 60 seconds

  // ─── Helpers (ported from MCClickToInspect.tsx) ─────────────────────

  // M5 fix: HTML escape to prevent XSS from component names / testIds
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function safeSendMessage(message, callback) {
    try {
      chrome.runtime.sendMessage(message, (...args) => {
        if (chrome.runtime.lastError) {
          return;
        }
        if (typeof callback === 'function') {
          callback(...args);
        }
      });
    } catch (error) {
      if (!String(error?.message || error).includes('Extension context invalidated')) {
        console.warn('[Click-to-Inspect] sendMessage failed:', error);
      }
    }
  }

  function findFiber(dom) {
    const keys = Object.keys(dom);
    for (const key of keys) {
      if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
        return dom[key];
      }
    }
    return null;
  }

  function getComponentInfo(fiber) {
    let current = fiber;
    while (current) {
      if (current.type && typeof current.type === 'function') {
        const name = current.type.displayName || current.type.name || 'Anonymous';
        return { name, source: current._debugSource ?? null };
      }
      if (current.type && typeof current.type === 'object' && current.type.$$typeof) {
        let rName = 'ForwardRef';
        if (current.type.displayName) rName = current.type.displayName;
        else if (current.type.render)
          rName = current.type.render.displayName || current.type.render.name || 'ForwardRef';
        return { name: rName, source: current._debugSource ?? null };
      }
      current = current.return;
    }
    return null;
  }

  function getPreferredComponentInfo(element) {
    let currentElement = element;

    while (currentElement) {
      const fiber = findFiber(currentElement);
      if (fiber) {
        const info = getComponentInfo(fiber);
        if (info && info.source && info.source.fileName) {
          return info;
        }
        if (info) {
          return info;
        }
      }
      currentElement = currentElement.parentElement;
    }

    return null;
  }

  function getStyleInfo(el) {
    const cs = getComputedStyle(el);
    return {
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      padding: cs.padding,
      margin: cs.margin,
      width: cs.width,
      height: cs.height,
    };
  }

  function shortenPath(p) {
    const idx = p.indexOf('/src/');
    return idx >= 0 ? p.substring(idx + 1) : p;
  }

  function getTestId(el) {
    return (
      el.getAttribute('data-testid') ||
      (el.closest('[data-testid]')
        ? el.closest('[data-testid]').getAttribute('data-testid')
        : '')
    );
  }

  function getElementSemantics(el) {
    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    const placeholder = el.getAttribute('placeholder') || '';
    const ariaLabel = el.getAttribute('aria-label') || '';
    const role = el.getAttribute('role') || '';
    const tagName = el.tagName ? el.tagName.toLowerCase() : '';
    const inputType = el.getAttribute('type') || '';
    const labelText = el.labels && el.labels.length
      ? Array.from(el.labels)
          .map((label) => (label.innerText || label.textContent || '').replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .join(' / ')
      : '';

    return {
      domTag: tagName || null,
      role: role || null,
      text: text ? text.slice(0, 120) : null,
      placeholder: placeholder || null,
      ariaLabel: ariaLabel || null,
      inputType: inputType || null,
      labelText: labelText || null,
    };
  }

  function getElementPathChips(el) {
    const chips = [];
    let current = el;

    while (current && current.nodeType === Node.ELEMENT_NODE && chips.length < 3) {
      const tagName = current.tagName ? current.tagName.toLowerCase() : '';
      if (tagName && tagName !== 'html' && tagName !== 'body') {
        chips.unshift(`<${tagName}>`);
      }
      current = current.parentElement;
    }

    return chips;
  }

  function inferClientHint() {
    const title = (document.title || '').toLowerCase();
    const faviconHref =
      document.querySelector('link[rel~="icon"]')?.getAttribute('href')?.toLowerCase() || '';

    if (title.includes('tas') || title.includes('tving') || faviconHref.includes('tving')) {
      return 'tving';
    }
    if (title.includes('shortmax')) {
      return 'shortmax';
    }
    if (title.includes('onboard')) {
      return 'onboard-demo';
    }
    if (title.includes('msm portal')) {
      return 'msm-default';
    }

    return null;
  }

  function inferLanguageHint() {
    try {
      const queryLanguage = new URL(window.location.href).searchParams.get('lng');
      if (queryLanguage) {
        return queryLanguage;
      }
    } catch {
      // ignore URL parse failures
    }

    try {
      const storedLanguage = window.localStorage.getItem('i18nextLng');
      if (storedLanguage) {
        return storedLanguage;
      }
    } catch {
      // ignore storage access failures
    }

    const htmlLanguage = document.documentElement?.lang?.trim();
    if (htmlLanguage) {
      return htmlLanguage;
    }

    return navigator.language || null;
  }

  // ─── DOM Creation ───────────────────────────────────────────────────

  function ensureOverlay() {
    if (!overlayEl) {
      overlayEl = document.createElement('div');
      overlayEl.id = '__inspect-overlay';
      document.body.appendChild(overlayEl);
    }
    return overlayEl;
  }

  function removeOverlay() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  }

  function clearSelectedVisuals() {
    selectedVisuals.forEach(({ overlay, badge }) => {
      if (overlay) overlay.remove();
      if (badge) badge.remove();
    });
    selectedVisuals = [];
  }

  function renderSelectedVisuals() {
    clearSelectedVisuals();

    selectedEntries.forEach((entry, index) => {
      const rect = entry.rect;
      if (!rect) return;

      const overlay = document.createElement('div');
      overlay.className = '__inspect-selected-overlay';
      overlay.style.left = rect.left + 'px';
      overlay.style.top = rect.top + 'px';
      overlay.style.width = rect.width + 'px';
      overlay.style.height = rect.height + 'px';

      const badge = document.createElement('div');
      badge.className = '__inspect-selected-badge';
      badge.textContent = index === selectedEntries.length - 1 ? 'Selected' : `Selected ${index + 1}`;

      const badgeWidth = index === selectedEntries.length - 1 ? 88 : 104;
      const preferredLeft = rect.left;
      const boundedLeft = Math.min(
        Math.max(8, preferredLeft),
        Math.max(8, window.innerWidth - badgeWidth - 8),
      );
      const preferredTop = rect.top - 34;
      const fallbackTop = rect.bottom + 10;
      const finalTop = preferredTop >= 8 ? preferredTop : Math.min(fallbackTop, window.innerHeight - 32);

      badge.style.left = `${boundedLeft}px`;
      badge.style.top = `${finalTop}px`;

      document.body.appendChild(overlay);
      document.body.appendChild(badge);
      selectedVisuals.push({ overlay, badge });
    });
  }

  function clearSelectedOverlay() {
    clearSelectedVisuals();
    selectedEntries = [];
  }

  function removeTooltip() {
    if (tooltipEl) {
      tooltipEl.remove();
      tooltipEl = null;
    }
    selectedData = null;
  }

  function showTooltip(data) {
    removeTooltip();
    selectedData = data;
    const { info, styles, testId, rect } = data;

    tooltipEl = document.createElement('div');
    tooltipEl.id = '__inspect-tooltip';

    // Position: right of element, or left if no space
    let x = rect.right + 12;
    let y = rect.top;
    if (x + 430 > window.innerWidth) x = Math.max(12, rect.left - 440);
    if (y + 280 > window.innerHeight) y = Math.max(12, window.innerHeight - 290);
    tooltipEl.style.left = x + 'px';
    tooltipEl.style.top = y + 'px';

    // M5 fix: escape all dynamic values to prevent XSS
    const escapedName = escapeHtml(info.name);
    const sourceStr = info.source
      ? `<div class="__inspect-file-path">${escapeHtml(shortenPath(info.source.fileName))}:${info.source.lineNumber}</div>`
      : '';
    const testIdStr = testId
      ? `<div class="__inspect-test-id">testId: ${escapeHtml(testId)}</div>`
      : '';
    const escapedStyles = {
      fontSize: escapeHtml(styles.fontSize),
      fontWeight: escapeHtml(styles.fontWeight),
      color: escapeHtml(styles.color),
      padding: escapeHtml(styles.padding),
      width: escapeHtml(styles.width),
      height: escapeHtml(styles.height),
    };

    tooltipEl.innerHTML = `
      <div style="margin-bottom:8px">
        <div class="__inspect-component-name">${escapedName}</div>
        ${sourceStr}
        ${testIdStr}
      </div>
      <div class="__inspect-style-info">
        font: ${escapedStyles.fontSize}/${escapedStyles.fontWeight} &nbsp; color: ${escapedStyles.color}<br>
        padding: ${escapedStyles.padding} &nbsp; size: ${escapedStyles.width} x ${escapedStyles.height}
      </div>
      <div class="__inspect-hint" style="margin-top:6px">Describe changes in the side panel</div>
    `;

    document.body.appendChild(tooltipEl);
  }

  // ─── Toast ──────────────────────────────────────────────────────────

  const TOAST_MESSAGES = {
    sent: 'Sent to Codex',
    waiting: 'Waiting for Codex to apply...',
    applied: 'Changes applied!',
    error: 'Failed to send',
    timeout: 'Timed out waiting for Claude Code',
  };

  function showToast(status, extra) {
    removeToast();

    toastEl = document.createElement('div');
    toastEl.id = '__inspect-toast';
    toastEl.setAttribute('data-status', status === 'timeout' ? 'error' : status);

    let icon = '';
    if (status === 'waiting') icon = '<div class="__inspect-spinner"></div>';
    else if (status === 'applied') icon = '<span>\u2713</span>';
    else if (status === 'sent') icon = '<span>\u2794</span>';
    else if (status === 'error' || status === 'timeout') icon = '<span>\u2717</span>';

    const subtext =
      status === 'sent'
        ? '<div style="font-size:10px;color:#aaa;margin-top:2px">Switch to Codex and press Enter</div>'
        : '';

    const msg = TOAST_MESSAGES[status] || status;
    const extraStr = extra ? ' — ' + escapeHtml(extra) : '';

    toastEl.innerHTML = `${icon}<div><div>${escapeHtml(msg)}${extraStr}</div>${subtext}</div>`;
    document.body.appendChild(toastEl);
  }

  function removeToast() {
    if (toastEl) {
      toastEl.remove();
      toastEl = null;
    }
  }

  function ensureCaptureUi() {
    if (!captureMaskEl) {
      captureMaskEl = document.createElement('div');
      captureMaskEl.id = '__capture-mask';
      document.body.appendChild(captureMaskEl);
    }
    if (!captureSelectionEl) {
      captureSelectionEl = document.createElement('div');
      captureSelectionEl.id = '__capture-selection';
      document.body.appendChild(captureSelectionEl);
    }
    if (!captureHelpEl) {
      captureHelpEl = document.createElement('div');
      captureHelpEl.id = '__capture-help';
      captureHelpEl.textContent = '드래그해서 캡처할 영역을 선택하세요. Esc로 취소할 수 있습니다.';
      document.body.appendChild(captureHelpEl);
    }
  }

  function removeCaptureUi() {
    if (captureMaskEl) {
      captureMaskEl.remove();
      captureMaskEl = null;
    }
    if (captureSelectionEl) {
      captureSelectionEl.remove();
      captureSelectionEl = null;
    }
    if (captureHelpEl) {
      captureHelpEl.remove();
      captureHelpEl = null;
    }
  }

  function updateCaptureSelection(start, current) {
    if (!captureSelectionEl) return;
    const left = Math.min(start.x, current.x);
    const top = Math.min(start.y, current.y);
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);
    captureSelectionEl.style.left = `${left}px`;
    captureSelectionEl.style.top = `${top}px`;
    captureSelectionEl.style.width = `${width}px`;
    captureSelectionEl.style.height = `${height}px`;
  }

  function startCaptureMode() {
    deactivate();
    captureActive = true;
    captureStartPoint = null;
    document.body.classList.add('__capture-active');
    ensureCaptureUi();
  }

  function finishCaptureMode() {
    captureActive = false;
    captureStartPoint = null;
    document.body.classList.remove('__capture-active');
    removeCaptureUi();
  }

  function hideToast() {
    if (toastEl) {
      toastEl.classList.add('hiding');
      setTimeout(removeToast, 300);
    }
  }

  // ─── Submit ─────────────────────────────────────────────────────────

  function submitPrompt(inputEl) {
    if (!inputEl || !selectedData) return;
    const prompt = inputEl.value.trim();
    if (!prompt) return;

    const payload = {
      component: selectedData.info.name,
      file: selectedData.info.source ? shortenPath(selectedData.info.source.fileName) : null,
      line: selectedData.info.source ? selectedData.info.source.lineNumber : null,
      testId: selectedData.testId || null,
      styles: selectedData.styles,
      pageUrl: window.location.href,
      pagePath: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      userPrompt: prompt,
      timestamp: new Date().toISOString(),
    };

    safeSendMessage(
      { type: 'inspect-submit', payload },
      (response) => {
        if (response && response.ok) {
          deactivate();
          showToast('sent');
          setTimeout(() => startPolling(), 1200);
        } else {
          showToast('error', response ? response.error : 'Unknown error');
          setTimeout(hideToast, 3000);
        }
      }
    );
  }

  // ─── Polling (M1 fix: timeout after MAX_POLL_COUNT) ─────────────────

  function startPolling() {
    stopPolling();
    pollCount = 0;
    showToast('waiting');

    pollingTimer = setInterval(() => {
      pollCount++;
      if (pollCount >= MAX_POLL_COUNT) {
        stopPolling();
        showToast('timeout');
        setTimeout(hideToast, 5000);
        return;
      }
      safeSendMessage({ type: 'inspect-status' }, (response) => {
        if (response && response.status === 'consumed') {
          stopPolling();
          showToast('applied');
          setTimeout(hideToast, 3000);
        }
      });
    }, 1000);
  }

  function stopPolling() {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
    pollCount = 0;
  }

  // ─── Activate / Deactivate ─────────────────────────────────────────

  function activate() {
    clearSelectedOverlay();
    removeTooltip();
    active = true;
    document.body.classList.add('__inspect-active');
    safeSendMessage({ type: 'selection-cleared' });
    safeSendMessage({ type: 'inspect-state', active: true });
  }

  function deactivate() {
    active = false;
    document.body.classList.remove('__inspect-active');
    removeOverlay();
    clearSelectedOverlay();
    removeTooltip();
    safeSendMessage({ type: 'inspect-state', active: false });
  }

  function exitInspectModeKeepSelection() {
    active = false;
    document.body.classList.remove('__inspect-active');
    removeOverlay();
    safeSendMessage({ type: 'inspect-state', active: false });
  }

  function toggle() {
    if (active) deactivate();
    else activate();
  }

  // ─── Event Handlers ────────────────────────────────────────────────

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.altKey && e.shiftKey && (e.key === 'x' || e.key === 'X')) {
        e.preventDefault();
        toggle();
        return;
      }
      if (e.key === 'Escape' && active) {
        if (selectedEntries.length) {
          exitInspectModeKeepSelection();
        } else {
          deactivate();
        }
        return;
      }
      if (e.key === 'Escape' && captureActive) {
        finishCaptureMode();
        return;
      }
      const input = document.querySelector('.__inspect-prompt-input');
      if (e.key === 'Enter' && document.activeElement === input) {
        e.preventDefault();
        e.stopPropagation();
        submitPrompt(input);
      }
    },
    true
  );

  document.addEventListener(
    'mousemove',
    (e) => {
      if (!active) return;
      const el = e.target;
      if (el.closest && (el.closest('#__inspect-tooltip') || el.id === '__inspect-overlay'))
        return;

      const overlay = ensureOverlay();
      const rect = el.getBoundingClientRect();
      overlay.style.left = rect.left + 'px';
      overlay.style.top = rect.top + 'px';
      overlay.style.width = rect.width + 'px';
      overlay.style.height = rect.height + 'px';
    },
    true
  );

  document.addEventListener(
    'mousedown',
    (e) => {
      if (!captureActive) return;
      e.preventDefault();
      e.stopPropagation();
      captureStartPoint = { x: e.clientX, y: e.clientY };
      ensureCaptureUi();
      updateCaptureSelection(captureStartPoint, captureStartPoint);
    },
    true
  );

  document.addEventListener(
    'mousemove',
    (e) => {
      if (!captureActive || !captureStartPoint) return;
      e.preventDefault();
      e.stopPropagation();
      updateCaptureSelection(captureStartPoint, { x: e.clientX, y: e.clientY });
    },
    true
  );

  document.addEventListener(
    'mouseup',
    (e) => {
      if (!captureActive || !captureStartPoint) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = {
        left: Math.min(captureStartPoint.x, e.clientX),
        top: Math.min(captureStartPoint.y, e.clientY),
        width: Math.abs(e.clientX - captureStartPoint.x),
        height: Math.abs(e.clientY - captureStartPoint.y),
        devicePixelRatio: window.devicePixelRatio || 1,
        pageUrl: window.location.href,
        pagePath: `${window.location.pathname}${window.location.search}${window.location.hash}`,
        client: inferClientHint(),
        language: inferLanguageHint(),
      };
      finishCaptureMode();
      if (rect.width < 8 || rect.height < 8) {
        showToast('error', 'Selection too small');
        setTimeout(hideToast, 2500);
        return;
      }
      safeSendMessage({ type: 'capture-region-selected', rect });
    },
    true
  );

  document.addEventListener(
    'click',
    (e) => {
      if (!active) return;
      const target = e.target;
      if (target.closest && target.closest('#__inspect-tooltip')) return;

      e.preventDefault();
      e.stopPropagation();

      let el = target;
      const info = getPreferredComponentInfo(el);
      const componentInfo = info || { name: el.tagName.toLowerCase(), source: null };
      const additive = e.shiftKey;
      const selectionData = {
        info: componentInfo,
        styles: getStyleInfo(el),
        testId: getTestId(el),
        rect: el.getBoundingClientRect(),
        element: el,
      };

      showTooltip(selectionData);

      const selectionKey = [
        selectionData.info.name,
        selectionData.testId || '',
        selectionData.info.source ? shortenPath(selectionData.info.source.fileName) : '',
        selectionData.info.source ? selectionData.info.source.lineNumber : '',
      ].join('::');

      if (additive) {
        if (!selectedEntries.some((entry) => entry.key === selectionKey)) {
          selectedEntries.push({ ...selectionData, key: selectionKey });
        }
      } else {
        selectedEntries = [{ ...selectionData, key: selectionKey }];
      }

      renderSelectedVisuals();
      safeSendMessage({
        type: 'element-selected',
        data: {
          component: componentInfo.name,
          file: componentInfo.source ? shortenPath(componentInfo.source.fileName) : null,
          line: componentInfo.source ? componentInfo.source.lineNumber : null,
          testId: selectionData.testId || null,
          styles: selectionData.styles,
          pageUrl: window.location.href,
          pagePath: `${window.location.pathname}${window.location.search}${window.location.hash}`,
          client: inferClientHint(),
          language: inferLanguageHint(),
          semantics: getElementSemantics(selectionData.element || document.body),
          pathChips: getElementPathChips(selectionData.element || document.body),
          additive,
        },
      });

      if (!additive) {
        exitInspectModeKeepSelection();
      }
    },
    true
  );

  // M4 fix: respond to state queries from popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'toggle-inspect') {
      toggle();
      sendResponse({ ok: true, active });
      return true;
    }
    if (msg.type === 'activate-inspect') {
      activate();
      sendResponse({ ok: true, active });
      return true;
    }
    if (msg.type === 'deactivate-inspect') {
      deactivate();
      sendResponse({ ok: true, active });
      return true;
    }
    if (msg.type === 'clear-selected-element') {
      clearSelectedOverlay();
      removeTooltip();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'get-inspect-state') {
      sendResponse({ active });
      return true;
    }
    if (msg.type === 'get-page-context') {
      sendResponse({
        pageUrl: window.location.href,
        pagePath: `${window.location.pathname}${window.location.search}${window.location.hash}`,
        client: inferClientHint(),
        language: inferLanguageHint(),
      });
      return true;
    }
    if (msg.type === 'start-region-capture') {
      startCaptureMode();
      sendResponse({ ok: true });
      return true;
    }
  });

  console.log('[Click-to-Inspect] Content script loaded. Press Alt+Shift+X to activate.');
})();
