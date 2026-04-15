/**
 * Moloco Inspect Side Panel
 *
 * Chat-like UI for inspecting elements and sending edit requests.
 * Supports HTTP mode (Orchestration Server) and Native mode (local file).
 */

(function () {
  'use strict';

  // ─── DOM refs ───────────────────────────────────────────────────────
  const messagesEl = document.getElementById('messages');
  const promptInput = document.getElementById('promptInput');
  const selectionChipRow = document.getElementById('selectionChipRow');
  const sendBtn = document.getElementById('sendBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const closeBtn = document.getElementById('closeBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const modeSelect = document.getElementById('modeSelect');
  const serverUrlInput = document.getElementById('serverUrl');
  const projectRootInput = document.getElementById('projectRoot');
  const elementCard = document.getElementById('elementCard');
  const elementName = document.getElementById('elementName');
  const elementFile = document.getElementById('elementFile');
  const elementTestId = document.getElementById('elementTestId');
  const elementStyles = document.getElementById('elementStyles');
  const clearElementBtn = document.getElementById('clearElement');
  const screenshotBtn = document.getElementById('screenshotBtn');
  const inputStatus = document.getElementById('inputStatus');
  const inspectToggleBtn = document.getElementById('inspectToggleBtn');
  const captureCard = document.getElementById('captureCard');
  const capturePreviewImage = document.getElementById('capturePreviewImage');
  const captureMeta = document.getElementById('captureMeta');
  const clearCaptureBtn = document.getElementById('clearCapture');
  const prdCard = document.getElementById('prdCard');
  const prdToggleBtn = document.getElementById('prdToggleBtn');
  const clearPrdBtn = document.getElementById('clearPrd');
  const prdUrlInput = document.getElementById('prdUrlInput');
  const prdNotesInput = document.getElementById('prdNotesInput');
  const prdReadBtn = document.getElementById('prdReadBtn');
  const prdInlineStatus = document.getElementById('prdInlineStatus');
  const prdSummary = document.getElementById('prdSummary');
  const prdSummaryTitle = document.getElementById('prdSummaryTitle');
  const prdSummaryBody = document.getElementById('prdSummaryBody');
  const prdCandidateSection = document.getElementById('prdCandidateSection');
  const prdCandidateList = document.getElementById('prdCandidateList');
  const prdQuestionSection = document.getElementById('prdQuestionSection');
  const prdQuestionList = document.getElementById('prdQuestionList');
  const headerStatusBadge = document.getElementById('headerStatusBadge');
  const contextPrimary = document.getElementById('contextPrimary');
  const contextSecondary = document.getElementById('contextSecondary');
  const requestContractHint = document.getElementById('requestContractHint');
  const intentSelect = document.getElementById('intentSelect');
  const goalInput = document.getElementById('goalInput');
  const successCriteriaInput = document.getElementById('successCriteriaInput');
  const constraintsInput = document.getElementById('constraintsInput');

  // ─── Theme ────────────────────────────────────────────────────────
  const themeToggle = document.getElementById('themeToggle');
  const savedTheme = localStorage.getItem('moloco-inspect-theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('moloco-inspect-theme', next);
    updateThemeIcon(next);
  });

  function updateThemeIcon(theme) {
    const lightIcon = themeToggle.querySelector('.theme-icon-light');
    const darkIcon = themeToggle.querySelector('.theme-icon-dark');
    if (theme === 'dark') {
      lightIcon.style.display = 'none';
      darkIcon.style.display = 'block';
    } else {
      lightIcon.style.display = 'block';
      darkIcon.style.display = 'none';
    }
  }

  // ─── State ──────────────────────────────────────────────────────────
  let currentElement = null;
  let selectedElements = [];
  let currentRequestId = null; // HTTP mode: orchestrator request ID
  let pollingTimer = null;
  let pollCount = 0;
  const MAX_POLL = 300; // 10 minutes for HTTP mode (sandbox agent needs time)
  let welcomeVisible = true;
  let inspectActive = false;
  let isSubmitting = false;
  let isComposing = false;
  let lastSubmitSignature = null;
  let lastSubmitAt = 0;
  let selectedCapture = null;
  let healthState = null;
  let requestSchema = null;
  let pendingClarification = null;
  let pendingExecutionPlan = null;
  let activeProgressCard = null;
  let prdContext = null;
  let isPrdLoading = false;

  // ─── Error Humanization ─────────────────────────────────────────────
  function humanizeError(rawError) {
    const text = String(rawError || '').trim();
    const map = [
      [/ECONNREFUSED|Failed to fetch|fetch failed/i, 'Cannot connect to the server. Please check if the Orchestrator is running.'],
      [/timeout|timed out|aborted due to timeout/i, 'The operation timed out. Try sending the request again or be more specific.'],
      [/Pipeline error/i, 'Something went wrong during processing. Please try again shortly.'],
      [/Agent error|Agent:/i, 'The AI agent could not process the request. Try being more specific.'],
      [/credit balance|quota/i, 'API usage limit reached. Please contact your administrator.'],
      [/Extension context invalidated/i, 'The extension has been updated. Please refresh the page.'],
    ];
    for (const [pattern, message] of map) {
      if (pattern.test(text)) return message;
    }
    return `An error occurred: ${text.slice(0, 100)}`;
  }

  // ─── Progress Stepper State ────────────────────────────────────────
  let progressTimerId = null;

  const PHASE_TO_STEP = {
    creating_sandbox: 0,
    syncing_source: 0,
    queued: 0,
    creating_worktree: 0,
    running_agent: 1,
    running_codex: 1,
    validating: 2,
    collecting_diff: 2,
    preview_ready: 3,
    capturing_screenshot: 3,
    no_change_needed: 3,
    applying_local_patch: 3,
    pipeline_error: -1,
  };

  const STEP_LABELS = ['Setup', 'Working', 'Verify', 'Done'];

  function createStepperElement() {
    const wrapper = document.createElement('div');
    const stepper = document.createElement('div');
    stepper.className = 'progress-stepper';
    STEP_LABELS.forEach((label, i) => {
      const step = document.createElement('div');
      step.className = 'step';
      step.dataset.stepIndex = i;
      step.textContent = label;
      stepper.appendChild(step);
    });
    wrapper.appendChild(stepper);
    // Progress bar
    const barTrack = document.createElement('div');
    barTrack.className = 'progress-bar-track';
    const barFill = document.createElement('div');
    barFill.className = 'progress-bar-fill animating';
    barFill.style.width = '0%';
    barTrack.appendChild(barFill);
    wrapper.appendChild(barTrack);
    wrapper._barFill = barFill;
    wrapper._stepper = stepper;
    return wrapper;
  }

  function updateStepperForPhase(stepperWrapper, phase) {
    if (!stepperWrapper) return;
    const stepperEl = stepperWrapper._stepper || stepperWrapper;
    const barFill = stepperWrapper._barFill;
    const activeIdx = PHASE_TO_STEP[phase] != null ? PHASE_TO_STEP[phase] : 0;
    const totalSteps = STEP_LABELS.length;
    const successPhases = ['preview_ready', 'no_change_needed', 'applying_local_patch'];
    const errorPhases = ['pipeline_error'];
    const isSuccess = successPhases.includes(phase);
    const isError = errorPhases.includes(phase);
    const isComplete = isSuccess || isError;
    stepperEl.querySelectorAll('.step').forEach((step) => {
      const idx = parseInt(step.dataset.stepIndex, 10);
      step.classList.remove('active', 'done', 'complete', 'error');
      // Restore original label if it was overwritten
      if (step.dataset.originalLabel) {
        step.textContent = step.dataset.originalLabel;
      }
      if (isSuccess) {
        step.classList.add('done');
        if (idx === totalSteps - 1) {
          step.classList.add('complete');
          step.dataset.originalLabel = step.textContent;
          step.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="vertical-align:-1px;margin-right:3px"><path d="M3.5 8.5l3 3 6-7"/></svg>Done';
        }
      } else if (isError) {
        if (idx <= activeIdx) step.classList.add('done');
        if (idx === activeIdx) step.classList.add('error');
      } else if (activeIdx >= 0) {
        if (idx < activeIdx) step.classList.add('done');
        else if (idx === activeIdx) step.classList.add('active');
      }
    });
    // Update progress bar
    if (barFill) {
      const pct = totalSteps > 0 ? Math.round(((activeIdx + 0.5) / totalSteps) * 100) : 0;
      barFill.style.width = `${pct}%`;
      if (isComplete) {
        barFill.style.width = '100%';
        barFill.classList.remove('animating');
      }
    }
  }

  function startProgressTimer(timerEl) {
    if (progressTimerId) {
      clearInterval(progressTimerId);
      progressTimerId = null;
    }
    if (!timerEl) return;
    const startTime = Date.now();
    timerEl.textContent = '0:00 elapsed';
    progressTimerId = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = String(elapsed % 60).padStart(2, '0');
      timerEl.textContent = `${mins}:${secs} elapsed`;
    }, 1000);
  }

  function stopProgressTimer() {
    if (progressTimerId) {
      clearInterval(progressTimerId);
      progressTimerId = null;
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function truncateText(value, maxLength = 36) {
    if (!value) return '';
    if (value.length <= maxLength) return value;
    return value.slice(0, maxLength - 1) + '…';
  }

  function buildFallbackSelectionChips(elementData) {
    if (!elementData) return [];

    const chips = [];
    const domTag = elementData.semantics && elementData.semantics.domTag
      ? `<${elementData.semantics.domTag}>`
      : null;

    if (domTag) {
      chips.push(domTag);
    } else if (elementData.component) {
      chips.push(`<${String(elementData.component).toLowerCase()}>`);
    }

    if (elementData.testId) {
      chips.push(`testId: ${truncateText(elementData.testId, 18)}`);
    } else if (elementData.semantics && elementData.semantics.labelText) {
      chips.push(truncateText(elementData.semantics.labelText, 20));
    } else if (elementData.semantics && elementData.semantics.placeholder) {
      chips.push(truncateText(elementData.semantics.placeholder, 20));
    }

    return chips.slice(0, 3);
  }

  function renderSelectionChips() {
    if (!selectionChipRow) return;

    const chips = [];

    if (selectedElements.length) {
      selectedElements.forEach((elementData) => {
        const elementChips = buildFallbackSelectionChips(elementData);
        if (elementChips.length) {
          chips.push(elementChips.join(' · '));
        }
      });
    } else if (currentElement) {
      const elementChips = buildFallbackSelectionChips(currentElement);
      if (elementChips.length) {
        chips.push(elementChips.join(' · '));
      }
    }

    if (selectedCapture) {
      chips.push('Captured area');
    }

    if (!chips.length) {
      selectionChipRow.innerHTML = '';
      selectionChipRow.style.display = 'none';
      return;
    }

    selectionChipRow.innerHTML = '';
    selectionChipRow.style.display = 'flex';

    chips.forEach((chipLabel) => {
      const chip = document.createElement('div');
      chip.className = 'selection-chip';

      const icon = document.createElement('span');
      icon.className = 'selection-chip-icon';
      icon.innerHTML = `
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14" aria-hidden="true">
          <path d="M4 4h6v6H4z"></path>
          <path d="M7 7l8 8"></path>
          <path d="M12 15h3v-3"></path>
        </svg>
      `;

      const text = document.createElement('span');
      text.className = 'selection-chip-text';
      text.textContent = chipLabel;

      chip.appendChild(icon);
      chip.appendChild(text);
      selectionChipRow.appendChild(chip);
    });
  }

  function removeWelcome() {
    if (welcomeVisible) {
      const w = messagesEl.querySelector('.welcome-message');
      if (w) w.remove();
      welcomeVisible = false;
    }
  }

  function setPrdInlineStatus(text) {
    if (!prdInlineStatus) return;
    prdInlineStatus.textContent = text || '';
  }

  function renderPrdSummary(context) {
    prdContext = context || null;

    if (!prdSummary || !prdSummaryTitle || !prdSummaryBody) {
      return;
    }

    if (!prdContext) {
      prdSummary.style.display = 'none';
      prdSummaryTitle.textContent = '';
      prdSummaryBody.textContent = '';
      prdCandidateList.innerHTML = '';
      prdQuestionList.innerHTML = '';
      prdCandidateSection.style.display = 'none';
      prdQuestionSection.style.display = 'none';
      updateContextStrip();
      return;
    }

    prdSummary.style.display = 'flex';
    prdSummaryTitle.textContent = prdContext.title || 'Key requirements extracted from the PRD';
    prdSummaryBody.textContent = prdContext.summary || 'Change candidates mapped to the current page have been organized.';

    prdCandidateList.innerHTML = '';
    const candidates = Array.isArray(prdContext.changeCandidates) ? prdContext.changeCandidates.slice(0, 4) : [];
    if (candidates.length) {
      prdCandidateSection.style.display = 'flex';
      candidates.forEach((candidate) => {
        const item = document.createElement('div');
        item.className = 'prd-summary-item';
        item.textContent = `• ${candidate}`;
        prdCandidateList.appendChild(item);
      });
    } else {
      prdCandidateSection.style.display = 'none';
    }

    prdQuestionList.innerHTML = '';
    const questions = Array.isArray(prdContext.openQuestions) ? prdContext.openQuestions.slice(0, 3) : [];
    if (questions.length) {
      prdQuestionSection.style.display = 'flex';
      questions.forEach((question) => {
        const item = document.createElement('div');
        item.className = 'prd-summary-item';
        item.textContent = `• ${question}`;
        prdQuestionList.appendChild(item);
      });
    } else {
      prdQuestionSection.style.display = 'none';
    }

    updateContextStrip();
  }

  function clearPrdContext() {
    prdContext = null;
    if (prdUrlInput) prdUrlInput.value = '';
    if (prdNotesInput) prdNotesInput.value = '';
    setPrdInlineStatus('');
    renderPrdSummary(null);
  }

  function togglePrdCard(forceOpen) {
    if (!prdCard) return;
    const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : prdCard.style.display === 'none';
    prdCard.style.display = shouldOpen ? 'block' : 'none';
    if (shouldOpen && prdUrlInput) {
      prdUrlInput.focus();
    }
  }

  function ingestPrd() {
    if (isPrdLoading) return;
    const url = prdUrlInput ? prdUrlInput.value.trim() : '';
    const pastedText = prdNotesInput ? prdNotesInput.value.trim() : '';

    if (!url && !pastedText) {
      setPrdInlineStatus('Please provide either a PRD link or key requirements.');
      return;
    }

    isPrdLoading = true;
    if (prdReadBtn) prdReadBtn.disabled = true;
    setPrdInlineStatus('Reading and organizing the document for the current page...');

    getLivePageContext().then((livePageContext) => {
      chrome.runtime.sendMessage({
        type: 'inspect-prd-ingest',
        payload: {
          url,
          pastedText,
          pageUrl: livePageContext?.pageUrl || currentElement?.pageUrl || null,
          pagePath: livePageContext?.pagePath || currentElement?.pagePath || null,
          client: livePageContext?.client || currentElement?.client || null,
          language: livePageContext?.language || currentElement?.language || null,
        },
      }, (response) => {
        isPrdLoading = false;
        if (prdReadBtn) prdReadBtn.disabled = false;

        if (chrome.runtime.lastError || !response || response.ok === false) {
          setPrdInlineStatus(response?.error || chrome.runtime.lastError?.message || 'Failed to read the document.');
          return;
        }

        renderPrdSummary(response.result || null);
        setPrdInlineStatus('Change candidates for the current page are ready.');
      });
    });
  }

  function addAssistantMessage(title, lines = []) {
    removeWelcome();
    const msg = document.createElement('div');
    msg.className = 'msg msg-system';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    const titleEl = document.createElement('div');
    titleEl.className = 'assistant-question-title';
    titleEl.textContent = title;
    bubble.appendChild(titleEl);

    if (lines.length) {
      const list = document.createElement('div');
      list.className = 'assistant-question-list';
      lines.forEach((line) => {
        const item = document.createElement('div');
        item.className = 'assistant-question-item';
        item.textContent = line;
        list.appendChild(item);
      });
      bubble.appendChild(list);
    }

    msg.appendChild(bubble);
    messagesEl.appendChild(msg);
    scrollToBottom();
    return msg;
  }

  function addClarificationMessage(config) {
    removeWelcome();

    const msg = document.createElement('div');
    msg.className = 'msg msg-system';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble clarification-card';

    const titleEl = document.createElement('div');
    titleEl.className = 'assistant-question-title';
    titleEl.textContent = config.title;
    bubble.appendChild(titleEl);

    if (config.helper) {
      const helperEl = document.createElement('div');
      helperEl.className = 'assistant-question-helper';
      helperEl.textContent = config.helper;
      bubble.appendChild(helperEl);
    }

    let selectedOption = '';

    if (config.options.length) {
      const optionsEl = document.createElement('div');
      optionsEl.className = 'clarification-options';

      config.options.forEach((option, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'clarification-option';
        btn.textContent = option.label;
        btn.dataset.value = option.value;
        btn.addEventListener('click', () => {
          selectedOption = option.value;
          optionsEl.querySelectorAll('.clarification-option').forEach((node) => {
            node.classList.toggle('selected', node === btn);
          });
          updateContinueState();
        });
        optionsEl.appendChild(btn);
      });

      bubble.appendChild(optionsEl);
    }

    const inputWrap = document.createElement('div');
    inputWrap.className = 'clarification-input-wrap';

    const freeform = document.createElement('textarea');
    freeform.className = 'clarification-input';
    freeform.rows = 3;
    freeform.placeholder = config.placeholder || 'Describe the change you want in your own words.';
    inputWrap.appendChild(freeform);

    const footer = document.createElement('div');
    footer.className = 'clarification-footer';

    const hint = document.createElement('div');
    hint.className = 'clarification-hint';
    hint.textContent = 'Pick an option or type your own details — both work.';
    footer.appendChild(hint);

    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'clarification-submit';
    submitBtn.textContent = 'Proceed with this';
    footer.appendChild(submitBtn);

    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'clarification-skip';
    skipBtn.textContent = 'Skip & proceed';
    skipBtn.addEventListener('click', () => {
      promptInput.value = pendingClarification.initialPrompt;
      pendingClarification = null;
      bubble.classList.add('clarification-complete');
      bubble.querySelectorAll('button, textarea').forEach((node) => {
        node.disabled = true;
      });
      submit();
    });
    footer.appendChild(skipBtn);
    inputWrap.appendChild(footer);

    bubble.appendChild(inputWrap);
    msg.appendChild(bubble);
    messagesEl.appendChild(msg);
    scrollToBottom();

    function updateContinueState() {
      submitBtn.disabled = !(selectedOption || freeform.value.trim());
    }

    function finalizeClarification() {
      const parts = [];
      if (selectedOption) {
        parts.push(`Selected approach: ${selectedOption}`);
      }
      if (freeform.value.trim()) {
        parts.push(freeform.value.trim());
      }
      const answer = parts.join('\n');
      if (!answer) return;

      promptInput.value = answer;
      inputStatus.textContent = 'Got it. I\'ll build a preview based on this.';

      bubble.classList.add('clarification-complete');
      bubble.querySelectorAll('button, textarea').forEach((node) => {
        node.disabled = true;
      });

      submit();
    }

    freeform.addEventListener('input', updateContinueState);
    freeform.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        finalizeClarification();
      }
    });
    submitBtn.addEventListener('click', finalizeClarification);
    updateContinueState();

    return msg;
  }

  function describeIntent(intent) {
    const map = {
      copy_update: 'Updates the copy/text',
      spacing_adjustment: 'Adjusts spacing or margins',
      token_alignment: 'Aligns to design token standards',
      component_swap: 'Swaps to a more appropriate component',
      layout_adjustment: 'Adjusts layout or alignment',
      state_handling: 'Modifies behavior or state flow',
      accessibility_improvement: 'Improves accessibility',
    };
    return map[intent] || 'Modifies the page in the requested direction';
  }

  function describeTargetInNaturalLanguage(payload) {
    if (Array.isArray(payload.selectedElements) && payload.selectedElements.length > 1) {
      const labels = payload.selectedElements
        .slice(0, 2)
        .map((item) =>
          item.testId ||
          item.component ||
          item.semantics?.labelText ||
          item.semantics?.placeholder ||
          item.semantics?.domTag ||
          'element',
        )
        .filter(Boolean);
      const suffix = payload.selectedElements.length > 2 ? ` and ${payload.selectedElements.length - 2} more elements` : ' elements';
      return `${labels.join(', ')}${suffix}`;
    }

    return (
      payload.testId ||
      payload.component ||
      (payload.selectedElements && payload.selectedElements[0] && (
        payload.selectedElements[0].testId ||
        payload.selectedElements[0].component ||
        payload.selectedElements[0].semantics?.labelText ||
        payload.selectedElements[0].semantics?.placeholder ||
        payload.selectedElements[0].semantics?.domTag
      )) ||
      'selected element'
    );
  }

  function describePlanApproach(intent, payload) {
    const routeHint = payload.pagePath ? `Within the current ${payload.pagePath} page` : 'Within the current page';
    const map = {
      copy_update: `${routeHint}, I'll first locate the exact copy that needs changing, then update it while preserving the language and context.`,
      spacing_adjustment: `${routeHint}, I'll make a small spacing adjustment to the selected area while keeping the layout structure intact.`,
      token_alignment: `${routeHint}, I'll align to design tokens while keeping the visual appearance the same.`,
      component_swap: `${routeHint}, I'll swap to a more appropriate component while preserving the existing behavior.`,
      layout_adjustment: `${routeHint}, I'll refine layout and alignment without affecting the user flow.`,
      state_handling: `${routeHint}, I'll focus on functional changes like click behavior, enabled/disabled states, and error/loading flows.`,
      accessibility_improvement: `${routeHint}, I'll improve keyboard access, labels, and focus flow.`,
    };
    return map[intent] || `${routeHint}, I'll start with the smallest change that makes the requested improvement visible.`;
  }

  function describePlanVerification(intent, payload) {
    const localeLabel = payload.language || 'current language';
    if (intent === 'copy_update') {
      return `I'll verify the copy is visible in the preview under ${localeLabel} before showing you.`;
    }
    if (intent === 'state_handling') {
      return 'After the behavior change, I\'ll run validate, typecheck, and preview checks before showing you.';
    }
    if (intent === 'spacing_adjustment' || intent === 'layout_adjustment') {
      return 'I\'ll run validate, typecheck, and screenshot to verify the change is actually visible on screen.';
    }
    return 'I\'ll run validate, typecheck, and preview checks, then show you the result.';
  }

  function buildPlanTargetLabel(payload) {
    if (Array.isArray(payload.selectedElements) && payload.selectedElements.length > 1) {
      const labels = payload.selectedElements
        .slice(0, 2)
        .map((item) => item.testId || item.component || item.semantics?.labelText || item.semantics?.domTag || 'element')
        .filter(Boolean);
      const suffix = payload.selectedElements.length > 2 ? ` + ${payload.selectedElements.length - 2} more` : '';
      return `${labels.join(', ')}${suffix}`;
    }

    return (
      payload.testId ||
      payload.component ||
      (payload.selectedElements && payload.selectedElements[0] && (
        payload.selectedElements[0].testId ||
        payload.selectedElements[0].component ||
        payload.selectedElements[0].semantics?.labelText ||
        payload.selectedElements[0].semantics?.domTag
      )) ||
      'selected element'
    );
  }

  async function fetchAiAnalysis(payload) {
    const { serverUrl } = await new Promise((resolve) => {
      chrome.storage.local.get(['serverUrl'], (result) => {
        resolve({ serverUrl: result.serverUrl || 'http://localhost:3847' });
      });
    });

    const response = await fetch(`${serverUrl}/api/analyze-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userPrompt: payload.userPrompt || '',
        component: payload.component || null,
        pagePath: payload.pagePath || '/',
        client: payload.client || 'msm-default',
        testId: payload.testId || null,
        language: payload.language || null,
      }),
    });

    if (!response.ok) return null;
    const result = await response.json();
    return result.ok ? result.analysis : null;
  }

  function addThinkingMessage() {
    removeWelcome();
    const msg = document.createElement('div');
    msg.className = 'msg msg-system';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.innerHTML = `
      <div class="plan-ai-header">
        <div class="plan-ai-avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18">
            <circle cx="12" cy="12" r="7"/><line x1="12" y1="1" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="1" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="23" y2="12"/>
          </svg>
        </div>
        <span class="plan-ai-name">Inspect Agent</span>
        <span class="plan-thinking-badge">Analyzing request...</span>
      </div>
      <div class="plan-thinking-dots"><span></span><span></span><span></span></div>
    `;

    msg.appendChild(bubble);
    messagesEl.appendChild(msg);
    scrollToBottom();
    return msg;
  }

  function buildConversationalPlan(plan) {
    const payload = plan.payload;
    const contract = plan.requestContract;
    const intent = contract?.change_intent || 'layout_adjustment';
    const targetLabel = describeTargetInNaturalLanguage(payload);
    const routeLabel = payload.pagePath || contract?.target?.route_or_page || '/';
    const language = payload.language || null;
    const prd = plan.prdContext;

    // Build a natural, conversational paragraph — like an AI thinking out loud
    const opening = buildConversationalOpening(intent, targetLabel, payload);
    const approach = buildConversationalApproach(intent, payload, routeLabel);
    const safeguards = buildConversationalSafeguards(intent, language);
    const prdNote = prd?.title
      ? `I'll also incorporate context from the "${prd.title}" PRD document.`
      : null;

    return { opening, approach, safeguards, prdNote, targetLabel, routeLabel, intent };
  }

  function buildConversationalOpening(intent, targetLabel, payload) {
    const prompt = String(payload.userPrompt || '').trim();
    const shortPrompt = prompt.length > 40 ? prompt.slice(0, 40) + '…' : prompt;

    const openings = {
      copy_update: `"${shortPrompt}" — You want to change the copy around ${targetLabel}. I'll first trace where the text is rendered.`,
      spacing_adjustment: `The spacing around ${targetLabel} caught your eye. I'll check the current values and adjust one step using design tokens.`,
      token_alignment: `You'd like to align ${targetLabel} with design system tokens. I'll first check for any hardcoded values.`,
      component_swap: `Swapping ${targetLabel} to a better-fit component. I'll check whether this can be done without breaking existing behavior.`,
      layout_adjustment: `You'd like to refine the layout/alignment of ${targetLabel}. I'll make minimal adjustments while considering surrounding elements.`,
      state_handling: `You want to change the behavior or state flow of ${targetLabel}. I'll first read the code to understand which conditions need updating.`,
      accessibility_improvement: `Improving accessibility for ${targetLabel}. I'll focus on keyboard access, labels, and focus flow.`,
    };

    return openings[intent] || `"${shortPrompt}" — Modifying ${targetLabel}. I'll look at the code and start with the smallest possible change.`;
  }

  function buildConversationalApproach(intent, payload, routeLabel) {
    const approaches = {
      copy_update: `I'll check the translation namespace used by the component on the ${routeLabel} page, then update only the correct key in the locale file. Copy on other pages won't be touched.`,
      spacing_adjustment: `I'll check the current spacing values, then swap them with appropriate design system spacing tokens. The layout structure itself won't change.`,
      token_alignment: `I'll find hardcoded color or size values and replace them with design system tokens. The visual result will stay as close to the original as possible.`,
      component_swap: `I'll analyze the existing component's props and behavior, then verify nothing is lost when migrating to the new component.`,
      layout_adjustment: `I'll analyze the Flex/Grid structure and apply only the minimal CSS or attribute changes in the requested direction.`,
      state_handling: `I'll read the relevant event handlers and state logic, then apply the requested behavior change. The UI appearance stays the same.`,
      accessibility_improvement: `I'll review ARIA attributes, roles, tabIndex, and focus order, then add what's needed.`,
    };

    return approaches[intent] || `I'll read the relevant code on the ${routeLabel} page and apply minimal changes in the requested direction.`;
  }

  function buildConversationalSafeguards(intent, language) {
    const base = 'After editing, I\'ll run design-system validation and typecheck to make sure nothing is broken.';
    if (language) {
      return `${base} The ${language === 'ko' ? 'Korean' : language} language setting will be preserved.`;
    }
    return base;
  }

  function addExecutionPlanMessage(plan) {
    removeWelcome();

    const ai = plan.aiAnalysis || null;
    const conv = buildConversationalPlan(plan);
    const msg = document.createElement('div');
    msg.className = 'msg msg-system';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble execution-plan-card';

    // AI avatar + badge
    const header = document.createElement('div');
    header.className = 'plan-ai-header';
    header.innerHTML = `
      <div class="plan-ai-avatar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18">
          <circle cx="12" cy="12" r="7"/>
          <line x1="12" y1="1" x2="12" y2="5"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="1" y1="12" x2="5" y2="12"/>
          <line x1="19" y1="12" x2="23" y2="12"/>
        </svg>
      </div>
      <span class="plan-ai-name">Inspect Agent</span>
      <span class="plan-ai-badge">${ai ? 'Request analyzed' : 'Execution plan'}</span>
    `;
    bubble.appendChild(header);

    if (ai) {
      // AI understanding
      const understandingEl = document.createElement('div');
      understandingEl.className = 'plan-conversation';
      understandingEl.textContent = ai.understanding || conv.opening;
      bubble.appendChild(understandingEl);

      // Collapsible analysis section
      if (ai.analysis) {
        const analysisSection = document.createElement('div');
        analysisSection.className = 'plan-section';
        analysisSection.innerHTML = `<div class="plan-section-header"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><circle cx="8" cy="8" r="6"/><line x1="8" y1="5" x2="8" y2="8.5"/><line x1="8" y1="8.5" x2="10.5" y2="10"/></svg><span class="plan-section-label">Approach</span></div>`;
        const analysisBody = document.createElement('div');
        analysisBody.className = 'plan-approach';
        analysisBody.textContent = ai.analysis;
        analysisSection.appendChild(analysisBody);
        bubble.appendChild(analysisSection);
      }

      // Steps with section header and file highlighting
      if (Array.isArray(ai.steps) && ai.steps.length) {
        const stepsSection = document.createElement('div');
        stepsSection.className = 'plan-section';
        stepsSection.innerHTML = `<div class="plan-section-header"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><path d="M3 3h10v10H3z"/><path d="M6 6h4"/><path d="M6 8.5h4"/><path d="M6 11h2.5"/></svg><span class="plan-section-label">Steps</span><span class="plan-step-count">${ai.steps.length} steps</span></div>`;
        const stepsEl = document.createElement('div');
        stepsEl.className = 'plan-steps';
        ai.steps.forEach((step, idx) => {
          const stepEl = document.createElement('div');
          stepEl.className = 'plan-step-item';
          // Highlight file paths in backticks or .tsx/.ts/.jsx/.js extensions
          // Highlight backtick-wrapped text, then bare filenames not already inside <code>
          const highlighted = escapeHtml(step).replace(/`([^`]+)`/g, '<code class="plan-code">$1</code>').replace(/(?!<code[^>]*>)(?<![/\w])(\S+\.(tsx?|jsx?|json|css))(?![^<]*<\/code>)/g, '<code class="plan-code">$1</code>');
          stepEl.innerHTML = `<span class="plan-step-num">${idx + 1}</span><span class="plan-step-text">${highlighted}</span>`;
          stepsEl.appendChild(stepEl);
        });
        stepsSection.appendChild(stepsEl);
        bubble.appendChild(stepsSection);
      }

      // Risks with warning card style
      if (ai.risks) {
        const riskSection = document.createElement('div');
        riskSection.className = 'plan-section plan-risk-card';
        riskSection.innerHTML = `<div class="plan-section-header plan-risk-header"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><path d="M8 1L1 14h14L8 1z"/><line x1="8" y1="6" x2="8" y2="9"/><circle cx="8" cy="11.5" r="0.5" fill="currentColor"/></svg><span class="plan-section-label">Risks</span></div><div class="plan-risk-body">${escapeHtml(ai.risks)}</div>`;
        bubble.appendChild(riskSection);
      }

      // Verification as checklist
      if (ai.verification) {
        const verifySection = document.createElement('div');
        verifySection.className = 'plan-section plan-verify-card';
        // Split by period or newline for multiple items
        const items = ai.verification.split(/[.\n]/).map(s => s.trim()).filter(Boolean);
        let verifyHtml = `<div class="plan-section-header plan-verify-header"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><path d="M8 1.5l5.5 3v4c0 3.5-2.5 5.5-5.5 7-3-1.5-5.5-3.5-5.5-7v-4L8 1.5z"/><path d="M6 8l1.5 1.5L10.5 6"/></svg><span class="plan-section-label">Verification</span></div>`;
        if (items.length > 1) {
          verifyHtml += '<div class="plan-verify-list">';
          items.forEach(item => {
            verifyHtml += `<div class="plan-verify-item"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="11" height="11"><rect x="2" y="2" width="12" height="12" rx="2"/></svg><span>${escapeHtml(item)}</span></div>`;
          });
          verifyHtml += '</div>';
        } else {
          verifyHtml += `<div class="plan-verify-body">${escapeHtml(ai.verification)}</div>`;
        }
        verifySection.innerHTML = verifyHtml;
        bubble.appendChild(verifySection);
      }
    } else {
      // Fallback: template-based plan
      const openingEl = document.createElement('div');
      openingEl.className = 'plan-conversation';
      openingEl.textContent = conv.opening;
      bubble.appendChild(openingEl);

      const approachEl = document.createElement('div');
      approachEl.className = 'plan-approach';
      approachEl.textContent = conv.approach;
      bubble.appendChild(approachEl);

      const safeguardEl = document.createElement('div');
      safeguardEl.className = 'plan-safeguard';
      safeguardEl.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M8 1.5l5.5 3v4c0 3.5-2.5 5.5-5.5 7-3-1.5-5.5-3.5-5.5-7v-4L8 1.5z"/><path d="M6 8l1.5 1.5L10.5 6"/></svg> ${escapeHtml(conv.safeguards)}`;
      bubble.appendChild(safeguardEl);
    }

    // PRD note
    if (conv.prdNote) {
      const prdEl = document.createElement('div');
      prdEl.className = 'plan-prd-note';
      prdEl.textContent = conv.prdNote;
      bubble.appendChild(prdEl);
    }

    // Scope tag
    const scopeEl = document.createElement('div');
    scopeEl.className = 'plan-scope';
    scopeEl.textContent = `${conv.targetLabel} · ${conv.routeLabel}`;
    bubble.appendChild(scopeEl);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'execution-plan-actions';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'execution-plan-confirm';
    confirmBtn.textContent = 'Proceed with this plan';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'execution-plan-edit';
    editBtn.textContent = 'Adjust the plan';

    actions.appendChild(confirmBtn);
    actions.appendChild(editBtn);
    bubble.appendChild(actions);
    msg.appendChild(bubble);
    messagesEl.appendChild(msg);
    scrollToBottom();

    confirmBtn.addEventListener('click', () => {
      confirmBtn.disabled = true;
      editBtn.disabled = true;
      bubble.classList.add('clarification-complete');
      pendingExecutionPlan = null;
      inputStatus.textContent = 'Got it. Starting work on this plan.';
      performSubmit(plan);
    });

    editBtn.addEventListener('click', () => {
      pendingExecutionPlan = null;
      bubble.classList.add('clarification-complete');
      inputStatus.textContent = 'Got it. Add a bit more detail and I\'ll revise the plan.';
      promptInput.focus();
    });
  }

  function splitListInput(value) {
    return String(value || '')
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function inferIntentFromPrompt(prompt) {
    const text = String(prompt || '').trim();
    if (!text) return 'layout_adjustment';
    if (/\b(click|submit|open|close|toggle|disable|disabled|enable|enabled|validation|validate|error|loading|navigate|redirect|filter|sort|search|selection|select|동작|기능|작동|클릭|제출|열기|닫기|토글|비활성|활성|검증|에러|로딩|이동|리다이렉트|필터|정렬|검색|선택)\b/i.test(text)) {
      return 'state_handling';
    }
    if (/\b(text|copy|label|placeholder|title|subtitle|description|message|번역|문구|텍스트|설명|타이틀|레이블|플레이스홀더)\b/i.test(text)) {
      return 'copy_update';
    }
    if (/\b(spacing|padding|margin|gap|간격|여백|패딩|마진)\b/i.test(text)) {
      return 'spacing_adjustment';
    }
    if (/\b(token|semantic|palette|color|색상|토큰)\b/i.test(text)) {
      return 'token_alignment';
    }
    if (/\b(accessibility|a11y|focus|keyboard|aria|접근성)\b/i.test(text)) {
      return 'accessibility_improvement';
    }
    if (/\b(component|swap|replace|교체)\b/i.test(text)) {
      return 'component_swap';
    }
    return 'layout_adjustment';
  }

  function inferTargetKind(context) {
    const component = String(context?.component || '').toLowerCase();
    const testId = String(context?.testId || '').toLowerCase();
    const semantics = context?.semantics || {};
    const tag = String(semantics.domTag || '').toLowerCase();
    const role = String(semantics.role || '').toLowerCase();
    const inputType = String(semantics.inputType || '').toLowerCase();
    const text = String(semantics.text || '').toLowerCase();

    if (role === 'button' || tag === 'button' || /button|btn|submit|cta|login/.test([component, testId, text].join(' '))) {
      return 'button';
    }

    if (
      tag === 'input' ||
      tag === 'textarea' ||
      /input|field|checkbox|radio|switch|select|picker|form/.test([component, testId, inputType].join(' '))
    ) {
      return 'input';
    }

    if (/title|heading|subtitle|label|text|typography|description|copy/.test([component, testId, role].join(' '))) {
      return 'text';
    }

    if (/table|list|row|cell|column/.test([component, testId].join(' '))) {
      return 'list';
    }

    if (selectedCapture && !context?.component) {
      return 'capture';
    }

    return 'layout';
  }

  function inferPromptSpecificity(prompt) {
    const text = String(prompt || '').trim();
    if (!text) return 'low';
    if (/["'“”].+["'“”]/.test(text)) return 'high';
    if (/\d+\s?px/.test(text)) return 'high';
    if (text.length > 28) return 'medium';
    if (/조금|좀|좋게|예쁘게|자연스럽게|명확하게/.test(text)) return 'low';
    return 'medium';
  }

  function inferClarificationDepth(prompt, context) {
    const intent = inferIntentFromPrompt(prompt);
    const kind = inferTargetKind(context);
    const specificity = inferPromptSpecificity(prompt);
    let score = 0;

    if (!context?.component && !selectedCapture) score += 2;
    if (specificity === 'low') score += 2;
    if (specificity === 'medium') score += 1;

    if (intent === 'component_swap' || intent === 'accessibility_improvement' || intent === 'state_handling') score += 2;
    if (intent === 'layout_adjustment' && kind === 'layout') score += 1;
    if (intent === 'copy_update' && kind === 'button' && specificity !== 'high') score += 1;

    if (score >= 4) return 2;
    if (score >= 2) return 1;
    return 0;
  }

  function getContextLabel(context) {
    const semantics = context?.semantics || {};
    return (
      semantics.labelText ||
      semantics.ariaLabel ||
      semantics.placeholder ||
      semantics.text ||
      context?.testId ||
      context?.component ||
      'selected element'
    );
  }

  function buildClarificationConfig(prompt, context) {
    const intent = inferIntentFromPrompt(prompt);
    const kind = inferTargetKind(context);
    const targetLabel = getContextLabel(context);
    if (intent === 'state_handling') {
      if (kind === 'button') {
        return {
          intent,
          title: `What behavior change do you want for the "${targetLabel}" button?`,
          helper: 'This looks more like a behavior change than a visual one, so let me first understand what should happen after the click.',
          options: [
            { label: 'Change click behavior', value: 'Change the action that happens after button click' },
            { label: 'Enable/disable conditions', value: 'Adjust button enable/disable conditions' },
            { label: 'Loading/double-click prevention', value: 'Improve loading state or prevent double-click during submission' },
            { label: 'Change error handling', value: 'Adjust error handling and recovery flow on failure' },
          ],
          placeholder: 'e.g. Disable before required fields are filled; show loading state during submission.',
        };
      }

      if (kind === 'input') {
        return {
          intent,
          title: `What would you like to change about the "${targetLabel}" input behavior?`,
          helper: 'For input behavior changes, timing of validation, error display, and focus movement are the key aspects.',
          options: [
            { label: 'Adjust validation timing', value: 'Adjust when input validation fires' },
            { label: 'Improve error state', value: 'Improve error messages and error state display' },
            { label: 'Change input rules', value: 'Change allowed values or input rules' },
            { label: 'Focus/navigation flow', value: 'Improve focus movement or next-input flow' },
          ],
          placeholder: 'e.g. Only show errors on blur; don\'t flash red immediately while typing.',
        };
      }

      if (kind === 'list') {
        return {
          intent,
          title: `What behavior do you want for the "${targetLabel}" list?`,
          helper: 'Lists have many axes — filter, sort, selection, empty state — so it helps to narrow down first.',
          options: [
            { label: 'Filter/search', value: 'Modify filter or search behavior' },
            { label: 'Change sorting', value: 'Change sort method or default sort order' },
            { label: 'Row selection/actions', value: 'Modify row selection or action behavior' },
            { label: 'Empty/error state', value: 'Improve empty state or failure state behavior' },
          ],
          placeholder: 'e.g. Show a clearer empty state when there are no search results.',
        };
      }

      return {
        intent,
        title: `What's the goal for the "${targetLabel}" behavior change?`,
        helper: 'This looks like a behavior-focused request, so it\'s important to clarify what should change first.',
        options: [
          { label: 'Change post-action result', value: 'Change the resulting behavior after user action' },
          { label: 'Improve state flow', value: 'Improve loading / error / success state flow' },
          { label: 'Change validation/constraints', value: 'Change input validation or conditional logic' },
          { label: 'Keep current UI', value: 'Keep the UI appearance and only change functionality' },
        ],
        placeholder: 'e.g. Clicking should open a modal; on failure, show an inline error.',
      };
    }

    if (intent === 'copy_update') {
      if (kind === 'button') {
        return {
          intent,
          title: `Let's decide how to change the "${targetLabel}" button text.`,
          helper: 'Button copy affects both meaning and button width depending on length and tone.',
          options: [
            { label: 'Replace with exact text', value: 'Replace button text with the exact specified text' },
            { label: 'Make it clearer', value: 'Make the button text clearer and easier to understand' },
            { label: 'Make it shorter', value: 'Keep button size and shorten the text' },
            { label: 'Keep current tone', value: 'Keep the current language and tone while improving the copy' },
          ],
          placeholder: 'e.g. Change "Login" to "Sign in" and keep button size and position.',
        };
      }

      if (kind === 'input') {
        return {
          intent,
          title: `How should we change the copy for the "${targetLabel}" input?`,
          helper: 'Knowing whether it\'s a placeholder, label, or helper text helps me make a more precise edit.',
          options: [
            { label: 'Change placeholder', value: 'Change only the placeholder text' },
            { label: 'Change label', value: 'Change the input label text' },
            { label: 'Enhance description', value: 'Make the helper/description text friendlier' },
            { label: 'Keep structure', value: 'Keep the input structure and only change the text' },
          ],
          placeholder: 'e.g. Keep the input field as-is and just make the placeholder friendlier.',
        };
      }

      return {
        intent,
        title: `Tell me a bit more about how you'd like to change the "${targetLabel}" text.`,
        helper: 'The more I know about the current visible text and the desired result, the more accurate the preview.',
        options: [
          { label: 'Change text only', value: 'Change only the text, keep the layout' },
          { label: 'Refine for clarity', value: 'Keep the meaning but refine to clearer copy' },
          { label: 'Make it concise', value: 'Shorten and tighten the copy' },
          { label: 'Keep language & tone', value: 'Edit while keeping the current language and tone' },
        ],
        placeholder: 'Describe the desired final text, any constraints, and what must not change.',
      };
    }

    if (intent === 'spacing_adjustment') {
      if (kind === 'button') {
        return {
          intent,
          title: `How should we adjust the spacing around the "${targetLabel}" button?`,
          helper: 'Changing button spacing also affects its relationship with nearby inputs, so it helps to set the criteria first.',
          options: [
            { label: 'Top/bottom only', value: 'Adjust only top/bottom spacing, keep button size' },
            { label: 'Gap from inputs', value: 'Adjust spacing between button and input fields' },
            { label: 'A bit more spacious', value: 'Increase spacing for a more airy feel' },
            { label: 'Keep current density', value: 'Keep overall density, only fix awkward spots' },
          ],
          placeholder: 'e.g. The button below the input looks too cramped — add one more spacing step.',
        };
      }

      if (kind === 'text') {
        return {
          intent,
          title: `How does the spacing around the "${targetLabel}" text feel?`,
          helper: 'For headings and descriptions, the distance to elements below matters — knowing which side feels cramped helps.',
          options: [
            { label: 'More space below', value: 'Add a bit more spacing below the text' },
            { label: 'Less space below', value: 'Reduce spacing below the text slightly' },
            { label: 'Balance top/bottom', value: 'Only balance the top and bottom spacing' },
            { label: 'Keep structure', value: 'Keep layout structure and only adjust spacing' },
          ],
          placeholder: 'e.g. The spacing below the login title feels cramped — I\'d like just a bit more room.',
        };
      }

      return {
        intent,
        title: `Tell me a bit more about the spacing goal around "${targetLabel}".`,
        helper: 'Even with “spacing adjustment,” the direction can vary — wider, tighter, or just rebalancing.',
        options: [
          { label: 'A bit wider', value: 'Add a bit more spacing around the target element' },
          { label: 'A bit tighter', value: 'Reduce spacing around the target element slightly' },
          { label: 'Visual balance only', value: 'Keep the overall layout and only rebalance visually' },
          { label: 'Keep other elements', value: 'Keep surrounding button sizes and positions as-is' },
        ],
        placeholder: 'e.g. The spacing below the title feels cramped — I\'d like just a bit more room.',
      };
    }

    if (intent === 'token_alignment') {
      return {
        intent,
        title: `What standards should "${targetLabel}" be aligned to?`,
        helper: 'Deciding whether to align colors, spacing, or typography helps make the edit more precise.',
        options: [
          { label: 'Align color tokens', value: 'Align colors to semantic token standards' },
          { label: 'Align spacing tokens', value: 'Align spacing and margins to design token standards' },
          { label: 'Align typography', value: 'Align font sizes and weights to design system standards' },
          { label: 'Align everything', value: 'Align this element overall to design system standards' },
        ],
        placeholder: 'Describe the standards to follow or what currently looks off.',
      };
    }

    if (!context?.component && !selectedCapture) {
      return {
        intent,
        title: 'Let me narrow down what you\'d like to change.',
        helper: 'The scope is still broad — picking the type of change first will help me be more precise.',
        options: [
          { label: 'Change copy/text', value: 'Copy-focused change' },
          { label: 'Change spacing or alignment', value: 'Spacing/layout-focused change' },
          { label: 'Change colors or styles', value: 'Style-focused change' },
          { label: 'Change component behavior', value: 'Component/state-focused change' },
        ],
        placeholder: 'e.g. Make the login button text clearer while keeping the layout.',
      };
    }

    return {
      intent,
      title: `Tell me a bit more about the goal for the "${targetLabel}" change.`,
      helper: 'A quick selection plus one line of detail makes the preview much more accurate.',
      options: [
        { label: 'Make it clearer', value: 'Edit so users understand it more easily' },
        { label: 'Make it stand out', value: 'Edit so the importance is more visible' },
        { label: 'Make it tidier', value: 'Edit for a more visually organized look' },
        { label: 'Keep current structure', value: 'Edit while preserving the current structure and flow' },
      ],
      placeholder: 'Describe what must not change, or the desired final look.',
    };
  }

  function buildFollowupClarificationConfig(prompt, context, pending) {
    const intent = pending?.inferredIntent || inferIntentFromPrompt(prompt);
    const targetLabel = getContextLabel(context);
    const kind = inferTargetKind(context);

    if (intent === 'state_handling') {
      return {
        intent,
        title: `One last thing to confirm for the "${targetLabel}" behavior change.`,
        helper: 'For behavior changes, setting the scope and success criteria prevents touching unrelated parts.',
        options: [
          { label: 'This element only', value: 'Only change behavior directly connected to the selected element' },
          { label: 'Keep current UI', value: 'Keep the visual UI and only change functionality' },
          { label: 'Verify in preview', value: 'The requested state change should be visible in the preview' },
          { label: 'Check failure flow too', value: 'Verify not just success but also failure/error flows' },
        ],
        placeholder: kind === 'button'
          ? 'e.g. Only change the submit behavior tied to the login button — don\'t touch other buttons.'
          : 'e.g. Only modify the selected input/list flow — keep the rest of the page structure as-is.',
      };
    }

    if (intent === 'copy_update') {
      return {
        intent,
        title: `One last thing to confirm for the "${targetLabel}" text change.`,
        helper: 'Even if the text is right, locking down layout, language, and scope keeps the preview stable.',
        options: [
          { label: 'Keep current language', value: 'Keep the current language as-is' },
          { label: 'This element only', value: 'Only change the selected element, keep other text' },
          { label: 'Keep layout', value: 'Only change the text, keep layout and button sizes' },
          { label: 'Verify in preview', value: 'Verify the updated text is actually visible in the preview' },
        ],
        placeholder: 'e.g. Only change the login button — don\'t touch text elsewhere on the page.',
      };
    }

    if (intent === 'spacing_adjustment') {
      return {
        intent,
        title: `One last thing to confirm for the "${targetLabel}" spacing adjustment.`,
        helper: 'Narrowing the scope of spacing changes reduces unexpected layout shifts.',
        options: [
          { label: 'This element only', value: 'Only adjust around the selected element, keep overall layout' },
          { label: 'Keep current density', value: 'Keep current page density, only ease cramped spots' },
          { label: 'Keep button sizes', value: 'Don\'t touch button or input sizes' },
          { label: 'Verify in preview', value: 'The spacing change should be visible in the preview screenshot' },
        ],
        placeholder: 'e.g. Only adjust below the title — keep the entire form structure below.',
      };
    }

    return {
      intent,
      title: `One last thing to confirm for the "${targetLabel}" change.`,
      helper: 'Just one more constraint and I can start building the preview.',
      options: [
        { label: 'Keep current structure', value: 'Preserve the current structure and flow' },
        { label: 'Focus on this element', value: 'Only modify around the selected element' },
        { label: 'Visual stability first', value: 'Make stable edits without major layout changes' },
        { label: 'Preview verification first', value: 'The requested change should be immediately visible in the preview' },
      ],
      placeholder: kind === 'capture'
        ? 'e.g. Only edit within the captured area — don\'t touch anything else.'
        : 'e.g. Only modify around the selected element and keep the surrounding structure.',
    };
  }

  function shouldStartClarification(prompt, context) {
    if (pendingClarification) return false;
    const trimmed = String(prompt || '').trim();
    if (!trimmed) return false;
    return inferClarificationDepth(trimmed, context) > 0;
  }

  function buildClarifiedPrompt(initialPrompt, clarificationAnswer) {
    return `${initialPrompt}\n\nAdditional details:\n${clarificationAnswer}`.trim();
  }

  function getValidationExpectations(intent, language) {
    const defaults = requestSchema?.ui_form_spec?.recommended_defaults?.validation_expectations || [
      'design_system_validate',
      'typecheck',
      'preview_screenshot',
    ];
    const expectations = [...defaults];
    if (language && !expectations.includes('language_match')) {
      expectations.push('language_match');
    }
    if (intent === 'copy_update' && !expectations.includes('copy_visible_on_route')) {
      expectations.push('copy_visible_on_route');
    }
    if (intent === 'spacing_adjustment' && !expectations.includes('spacing_visible_on_route')) {
      expectations.push('spacing_visible_on_route');
    }
    return expectations;
  }

  function populateIntentOptions(schema) {
    if (!intentSelect) return;
    const options = schema?.schema?.properties?.change_intent?.enum || ['layout_adjustment'];
    intentSelect.innerHTML = '';
    options.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      intentSelect.appendChild(option);
    });
  }

  function applyRequestSchema(schema) {
    requestSchema = schema || null;
    populateIntentOptions(schema);

    const recommendedDefaults = schema?.ui_form_spec?.recommended_defaults || {};
    if (requestContractHint) {
      requestContractHint.textContent = schema
        ? 'Connected to PM/SA request schema.'
        : 'Using default request schema.';
    }

    if (goalInput && !goalInput.placeholder && schema?.schema?.properties?.goal?.description) {
      goalInput.placeholder = schema.schema.properties.goal.description;
    }

    if (intentSelect && !intentSelect.value) {
      intentSelect.value = 'layout_adjustment';
    }

    if (successCriteriaInput && !successCriteriaInput.value && Array.isArray(recommendedDefaults.validation_expectations)) {
      successCriteriaInput.placeholder = 'e.g. The requested change is visible in preview; language is preserved';
    }
  }

  function loadRequestSchema() {
    chrome.runtime.sendMessage({ type: 'inspect-get-request-schema' }, (response) => {
      if (chrome.runtime.lastError || !response || response.ok === false) {
        applyRequestSchema(null);
        return;
      }
      applyRequestSchema(response.schema);
    });
  }

  function getActiveContext() {
    if (selectedCapture && selectedCapture.rect) {
      return {
        source: 'capture',
        client: selectedCapture.rect.client || null,
        language: selectedCapture.rect.language || null,
        pagePath: selectedCapture.rect.pagePath || null,
      };
    }

    if (currentElement) {
      return {
        source: 'element',
        client: currentElement.client || null,
        language: currentElement.language || null,
        pagePath: currentElement.pagePath || null,
        component: currentElement.component || null,
        testId: currentElement.testId || null,
        semantics: currentElement.semantics || null,
        selectionCount: selectedElements.length || 1,
      };
    }

    return null;
  }

  function updateContextStrip() {
    const activeContext = getActiveContext();
    const modeLabel = healthState && healthState.mode === 'native' ? 'Native mode' : 'HTTP orchestrator';

    if (!activeContext) {
      contextPrimary.textContent = healthState && healthState.serverReachable
        ? `${modeLabel} ready`
        : `${modeLabel} needs check`;
      contextSecondary.textContent = prdContext?.title
        ? `PRD "${prdContext.title}" has been read and is ready to inform the current page.`
        : 'Select an element or capture an area to display the current page, language, and target component here.';
      return;
    }

    const contextBits = [
      activeContext.client || 'unknown client',
      activeContext.language || 'unknown language',
      activeContext.pagePath || '/',
    ].filter(Boolean);

    contextPrimary.textContent = activeContext.source === 'capture'
      ? `Requesting based on capture · ${contextBits.join(' · ')}`
      : `Requesting based on selected element · ${contextBits.join(' · ')}`;

    if (activeContext.source === 'capture') {
      contextSecondary.textContent = prdContext?.title
        ? `This request references both the captured area and PRD "${prdContext.title}".`
        : 'This request uses the captured area and page context as primary inputs.';
      return;
    }

    contextSecondary.textContent = activeContext.component
      ? `${activeContext.component} component.${activeContext.selectionCount > 1 ? ` ${activeContext.selectionCount} elements are currently selected.` : ''}${prdContext?.title ? ` PRD "${prdContext.title}" is also referenced.` : ' A capture can override this context if needed.'}`
      : (prdContext?.title
        ? `Requesting based on the selected element and PRD "${prdContext.title}".`
        : 'Requesting based on the selected element.');
  }

  function updateHeaderHealth(health) {
    healthState = health || null;
    headerStatusBadge.classList.remove('connected', 'disconnected', 'native');

    if (!healthState) {
      headerStatusBadge.textContent = 'Checking';
      updateContextStrip();
      return;
    }

    if (healthState.mode === 'native') {
      headerStatusBadge.classList.add('native');
      headerStatusBadge.textContent = 'Native';
      updateContextStrip();
      return;
    }

    if (healthState.serverReachable) {
      headerStatusBadge.classList.add('connected');
      headerStatusBadge.textContent = 'Connected';
    } else {
      headerStatusBadge.classList.add('disconnected');
      headerStatusBadge.textContent = 'Disconnected';
    }

    updateContextStrip();
  }

  function refreshHealth() {
    chrome.runtime.sendMessage({ type: 'popup-get-health' }, (response) => {
      if (chrome.runtime.lastError) {
        updateHeaderHealth(null);
        return;
      }
      updateHeaderHealth(response && response.health ? response.health : null);
    });
  }

  function getLivePageContext() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'popup-get-page-context' }, (response) => {
        if (chrome.runtime.lastError || !response || response.ok === false) {
          resolve(null);
          return;
        }
        resolve(response.context || null);
      });
    });
  }

  // ─── Settings ───────────────────────────────────────────────────────
  chrome.storage.local.get(['projectRoot', 'serverUrl', 'mode'], (result) => {
    if (result.projectRoot) projectRootInput.value = result.projectRoot;
    if (serverUrlInput && result.serverUrl) serverUrlInput.value = result.serverUrl;
    if (modeSelect && result.mode) modeSelect.value = result.mode;
  });

  settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.toggle('open');
    if (settingsPanel.classList.contains('open')) {
      loadSystemInfo();
    }
  });

  function loadSystemInfo() {
    chrome.runtime.sendMessage({ type: 'popup-get-health' }, (response) => {
      if (chrome.runtime.lastError || !response || !response.health) return;
      const h = response.health;
      const infoAgent = document.getElementById('infoAgent');
      const infoSandbox = document.getElementById('infoSandbox');
      const infoRequests = document.getElementById('infoRequests');
      if (infoAgent) infoAgent.textContent = h.model || 'unknown';
      if (infoSandbox) infoSandbox.textContent = h.sandboxImage || (h.serverReachable ? 'Connected' : 'Disconnected');
      if (infoRequests) infoRequests.textContent = typeof h.requests === 'number' ? `${h.requests} active` : '-';
    });
  }

  const openDashboard = document.getElementById('openDashboard');
  const openDesignSystem = document.getElementById('openDesignSystem');
  if (openDashboard) {
    openDashboard.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: 'inspect-open-url', url: 'http://127.0.0.1:4174/' });
    });
  }
  if (openDesignSystem) {
    openDesignSystem.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: 'inspect-open-url', url: 'http://127.0.0.1:4174/design-system' });
    });
  }

  closeBtn.addEventListener('click', () => {
    settingsPanel.classList.remove('open');
    clearElementCard();
    clearCaptureCard();
    clearPrdContext();
    togglePrdCard(false);
    pendingClarification = null;
    pendingExecutionPlan = null;
    inputStatus.textContent = '';
    updateContextStrip();
    updateSendState();
  });

  projectRootInput.addEventListener('change', () => {
    const value = projectRootInput.value.trim();
    chrome.storage.local.set({ projectRoot: value });
    chrome.runtime.sendMessage({ type: 'set-project-root', path: value });
  });

  if (serverUrlInput) {
    serverUrlInput.addEventListener('change', () => {
      const value = serverUrlInput.value.trim();
      chrome.storage.local.set({ serverUrl: value });
      chrome.runtime.sendMessage({ type: 'set-server-url', url: value });
    });
  }

  if (modeSelect) {
    modeSelect.addEventListener('change', () => {
      const value = modeSelect.value;
      chrome.storage.local.set({ mode: value });
      chrome.runtime.sendMessage({ type: 'set-mode', mode: value });
    });
  }

  // ─── Element Card ───────────────────────────────────────────────────
  function showElementCard(data, append = false) {
    currentElement = data;
    if (append) {
      const key = [data.component || '', data.file || '', data.line || '', data.testId || ''].join('::');
      if (!selectedElements.some((item) => [item.component || '', item.file || '', item.line || '', item.testId || ''].join('::') === key)) {
        selectedElements.push(data);
      }
    } else {
      selectedElements = [data];
    }
    elementCard.style.display = 'block';
    elementName.textContent = data.component || 'Unknown';
    elementFile.textContent = data.file ? `${data.file}:${data.line || ''}` : '';
    elementFile.style.display = data.file ? 'block' : 'none';
    elementTestId.textContent = data.testId ? `testId: ${data.testId}` : '';
    elementTestId.style.display = data.testId ? 'block' : 'none';

    if (data.styles) {
      const s = data.styles;
      elementStyles.textContent =
        `font: ${s.fontSize}/${s.fontWeight}  color: ${s.color}\npadding: ${s.padding}  size: ${s.width} × ${s.height}`;
    } else {
      elementStyles.textContent = '';
    }

    updateSendState();
    renderSelectionChips();
    promptInput.focus();
    updateContextStrip();
  }

  function clearElementCard() {
    currentElement = null;
    selectedElements = [];
    elementCard.style.display = 'none';
    chrome.runtime.sendMessage({ type: 'inspect-clear-selection' }, () => {
      if (chrome.runtime.lastError) {
        return;
      }
    });
    updateSendState();
    renderSelectionChips();
    updateContextStrip();
  }

  function showCaptureCard(data) {
    selectedCapture = data;
    captureCard.style.display = 'block';
    capturePreviewImage.src = data.imageDataUrl;
    captureMeta.textContent = `${Math.round(data.rect.width)} × ${Math.round(data.rect.height)} area selected. It will be included with the request.`;
    renderSelectionChips();
    updateContextStrip();
  }

  function clearCaptureCard() {
    selectedCapture = null;
    captureCard.style.display = 'none';
    capturePreviewImage.removeAttribute('src');
    captureMeta.textContent = '';
    renderSelectionChips();
    updateContextStrip();
  }

  clearElementBtn.addEventListener('click', clearElementCard);
  clearCaptureBtn.addEventListener('click', clearCaptureCard);
  if (clearPrdBtn) clearPrdBtn.addEventListener('click', clearPrdContext);
  if (prdToggleBtn) prdToggleBtn.addEventListener('click', () => togglePrdCard());
  if (prdReadBtn) prdReadBtn.addEventListener('click', ingestPrd);

  // ─── Messages ───────────────────────────────────────────────────────
  function addUserMessage(text, elementData, captureData) {
    removeWelcome();
    const msg = document.createElement('div');
    msg.className = 'msg msg-user';
    let tagHtml = '';
    if (elementData) {
      tagHtml = `<div class="msg-element-tag">&lt;${escapeHtml(elementData.component)}&gt;</div>`;
    }
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.innerHTML = tagHtml;

    if (captureData && captureData.imageDataUrl) {
      const thumb = document.createElement('img');
      thumb.className = 'msg-attachment-thumb';
      thumb.src = captureData.imageDataUrl;
      thumb.alt = 'Attached screenshot';
      thumb.title = 'Attached screenshot';
      bubble.appendChild(thumb);
    }

    const textEl = document.createElement('div');
    textEl.textContent = text;
    bubble.appendChild(textEl);
    msg.appendChild(bubble);
    messagesEl.appendChild(msg);
    scrollToBottom();
    return msg;
  }

  function addSystemMessage(text, statusType) {
    removeWelcome();
    const msg = document.createElement('div');
    msg.className = 'msg msg-system';
    msg.id = 'sys-' + Date.now();
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = text;
    if (statusType) {
      const status = document.createElement('div');
      status.className = 'msg-status';
      status.innerHTML = `<span class="dot dot-${statusType}"></span> ${escapeHtml(statusType)}`;
      bubble.appendChild(status);
    }
    msg.appendChild(bubble);
    messagesEl.appendChild(msg);
    scrollToBottom();
    return msg;
  }

  function getProgressPhaseCopy(phase, latestLog, payload) {
    const targetLabel = describeTargetInNaturalLanguage(payload);
    const routeLabel = payload?.pagePath || payload?.requestContract?.target?.route_or_page || 'current page';

    const phaseCopyMap = {
      queued: `Agent is scoping the work for ${routeLabel}.`,
      creating_worktree: `Agent is preparing a safe workspace.`,
      running_codex: `Agent is editing the code around ${targetLabel}.`,
      collecting_diff: `Agent is collecting changed files and summarizing the diff.`,
      validating: `Agent is running validate and typecheck to ensure safety.`,
      capturing_screenshot: `Agent is capturing the preview screen so you can review right away.`,
      preview_ready: `Preview is ready. You can review the changes now.`,
      no_change_needed: `No changes to apply for this request based on the current page.`,
      applying_local_patch: `Applying the approved changes to your local workspace.`,
      queued_for_retry: `Incorporating feedback and preparing another revision.`,
      pipeline_error: `Something went wrong during processing — diagnosing the cause.`,
    };

    const base = phaseCopyMap[phase] || `Agent is processing the ${targetLabel} request.`;
    if (!latestLog) return base;
    return `${base} ${latestLog}`;
  }

  function addProgressMessage(requestId, payload) {
    removeWelcome();

    const msg = document.createElement('div');
    msg.className = 'msg msg-system';
    msg.dataset.requestId = requestId;

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble progress-card';

    const title = document.createElement('div');
    title.className = 'progress-card-title';
    title.textContent = 'Agent has started working';

    const body = document.createElement('div');
    body.className = 'progress-card-body';
    body.textContent = getProgressPhaseCopy('queued', '', payload);

    const meta = document.createElement('div');
    meta.className = 'progress-card-meta';
    meta.textContent = `${payload?.client || 'current client'} · ${payload?.pagePath || '/'}`;

    const status = document.createElement('div');
    status.className = 'msg-status';
    status.innerHTML = '<span class="dot dot-waiting"></span> waiting';

    const stepper = createStepperElement();
    updateStepperForPhase(stepper, 'queued');

    const timer = document.createElement('div');
    timer.className = 'progress-timer';
    timer.textContent = '0:00 elapsed';

    const dashLink = document.createElement('a');
    dashLink.className = 'progress-dashboard-link';
    dashLink.textContent = 'View details in dashboard →';
    dashLink.href = '#';
    dashLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: 'inspect-open-url', url: `http://127.0.0.1:4174/requests/${requestId}` });
    });

    bubble.appendChild(title);
    bubble.appendChild(stepper);
    bubble.appendChild(timer);
    bubble.appendChild(body);
    bubble.appendChild(meta);
    bubble.appendChild(dashLink);
    bubble.appendChild(status);
    msg.appendChild(bubble);
    messagesEl.appendChild(msg);
    scrollToBottom();

    startProgressTimer(timer);

    activeProgressCard = {
      requestId,
      root: msg,
      title,
      body,
      meta,
      status,
      stepper,
      timer,
      payload,
    };

    return activeProgressCard;
  }

  function updateProgressMessage({ requestId, phase, latestLog, statusType, statusLabel, title, previewUrl }) {
    if (!activeProgressCard || activeProgressCard.requestId !== requestId) {
      return;
    }

    if (title) {
      activeProgressCard.title.textContent = title;
    }

    updateStepperForPhase(activeProgressCard.stepper, phase);

    // Stop timer on terminal phases
    const terminalPhases = ['preview_ready', 'no_change_needed', 'pipeline_error', 'applying_local_patch'];
    if (terminalPhases.includes(phase)) {
      stopProgressTimer();
    }

    activeProgressCard.body.textContent = getProgressPhaseCopy(phase, latestLog, activeProgressCard.payload);
    const isWorking = statusType === 'sent' || statusType === 'waiting';
    activeProgressCard.status.innerHTML = `<span class="dot dot-${statusType}${isWorking ? ' dot-working' : ''}"></span> ${escapeHtml(statusLabel)}`;

    // Show preview URL link when available
    if (previewUrl && !activeProgressCard.previewLink) {
      const link = document.createElement('a');
      link.className = 'progress-dashboard-link';
      link.textContent = 'View changes →';
      link.href = '#';
      link.style.color = 'var(--accent)';
      link.addEventListener('click', (e) => {
        e.preventDefault();
        openExternalUrl(previewUrl);
      });
      activeProgressCard.root.querySelector('.msg-bubble').insertBefore(link, activeProgressCard.status);
      activeProgressCard.previewLink = link;
    }

    scrollToBottom();
  }

  function clearActiveProgressCard() {
    stopProgressTimer();
    activeProgressCard = null;
  }

  function phaseLabel(phase) {
    const map = {
      queued: 'Queued',
      creating_worktree: 'Preparing worktree',
      running_codex: 'Agent is editing',
      collecting_diff: 'Collecting diff',
      validating: 'Running validation',
      capturing_screenshot: 'Capturing screenshot',
      preview_ready: 'Preview ready',
      no_change_needed: 'No change needed',
      applying_local_patch: 'Applying locally',
      queued_for_retry: 'Queued for retry',
      pipeline_error: 'Pipeline error',
    };
    return map[phase] || phase || 'Working';
  }

  function openExternalUrl(url) {
    if (!url) return;
    chrome.runtime.sendMessage({ type: 'inspect-open-url', url }, (response) => {
      if (chrome.runtime.lastError || !response || response.ok === false) {
        addSystemMessage('Failed to open a new tab.', 'error');
      }
    });
  }

  function summarizeDiff(diff, changedFiles) {
    const files = Array.isArray(changedFiles) && changedFiles.length
      ? changedFiles
      : Array.from(
          new Set(
            String(diff || '')
              .split('\n')
              .filter((line) => line.startsWith('+++ b/'))
              .map((line) => line.replace('+++ b/', '').trim())
              .filter(Boolean),
          ),
        );

    const added = [];
    const removed = [];
    String(diff || '')
      .split('\n')
      .forEach((line) => {
        if (!line || line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) return;
        if (line.startsWith('+')) added.push(line.slice(1).trim());
        if (line.startsWith('-')) removed.push(line.slice(1).trim());
      });

    const highlights = [];
    const normalizedPrompt = (currentElement && currentElement.component ? currentElement.component : '').trim();
    if (files.length) {
      highlights.push(`${files.length} files changed`);
    }
    if (normalizedPrompt) {
      highlights.push(`${normalizedPrompt}-related changes`);
    }

    const meaningfulAdded = added.filter((line) => line && !/^[{}[\],;]+$/.test(line)).slice(0, 2);
    const meaningfulRemoved = removed.filter((line) => line && !/^[{}[\],;]+$/.test(line)).slice(0, 2);

    const bullets = [];
    const primaryFile = files[0] ? files[0].split('/').pop() : '';
    const addedLine = meaningfulAdded[0] || '';
    const removedLine = meaningfulRemoved[0] || '';

    const marginMatchAdded = addedLine.match(/\$marginBottom=\{(\d+)\}/);
    const marginMatchRemoved = removedLine.match(/\$marginBottom=\{(\d+)\}/);
    if (marginMatchAdded && marginMatchRemoved) {
      const targetLabel = /Title/.test(addedLine) ? 'title bottom spacing' : 'spacing';
      bullets.push(`Adjusted ${targetLabel} from ${marginMatchRemoved[1]}px to ${marginMatchAdded[1]}px.`);
    } else if (
      addedLine &&
      removedLine &&
      /t\('/.test(addedLine) &&
      /t\('/.test(removedLine)
    ) {
      bullets.push('Copy or translation key was changed.');
    } else if (meaningfulAdded.length) {
      bullets.push(`Changes: ${meaningfulAdded.join(' / ')}`);
    }

    if (meaningfulRemoved.length && !(marginMatchAdded && marginMatchRemoved)) {
      bullets.push(`Previous: ${meaningfulRemoved.join(' / ')}`);
    }

    if (!bullets.length && files.length) {
      bullets.push(`Target files: ${files.map((file) => file.split('/').pop()).join(', ')}`);
    }

    if (primaryFile) {
      bullets.push(`Modified file: ${primaryFile}`);
    }

    return {
      files,
      highlights,
      bullets,
    };
  }

  function addPreviewCard(diff, screenshotUrl, requestId, changedFiles, previewUrl) {
    removeWelcome();
    const msg = document.createElement('div');
    msg.className = 'msg msg-system';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble preview-card';

    const summary = summarizeDiff(diff, changedFiles);

    // Screenshot (if available)
    if (screenshotUrl) {
      const screenshotSection = document.createElement('div');
      screenshotSection.className = 'preview-screenshot-section';

      const img = document.createElement('img');
      img.className = 'preview-screenshot';
      img.alt = 'Preview';
      img.loading = 'lazy';
      img.title = 'Open full size in new tab';
      img.addEventListener('click', () => {
        openExternalUrl(screenshotUrl || img.src);
      });
      img.addEventListener('error', () => {
        const errorNote = document.createElement('div');
        errorNote.className = 'preview-image-error';
        errorNote.textContent = 'Preview image failed to load';
        bubble.insertBefore(errorNote, summarySection);
        img.remove();
      });
      chrome.runtime.sendMessage({ type: 'inspect-get-screenshot-data', url: screenshotUrl }, (response) => {
        if (chrome.runtime.lastError || !response || response.ok === false) {
          img.dispatchEvent(new Event('error'));
          return;
        }
        img.src = response.dataUrl;
      });
      screenshotSection.appendChild(img);

      const screenshotActions = document.createElement('div');
      screenshotActions.className = 'preview-screenshot-actions';

      const openFullBtn = document.createElement('button');
      openFullBtn.className = 'preview-open-full-btn';
      openFullBtn.textContent = 'View full screenshot';
      openFullBtn.addEventListener('click', () => {
        if (img.src) {
          openExternalUrl(screenshotUrl || img.src);
        }
      });
      screenshotActions.appendChild(openFullBtn);

      if (previewUrl) {
        const openPageBtn = document.createElement('button');
        openPageBtn.className = 'preview-open-full-btn preview-open-page-btn';
        openPageBtn.textContent = 'View changes';
        openPageBtn.addEventListener('click', () => {
          openExternalUrl(previewUrl);
        });
        screenshotActions.appendChild(openPageBtn);
      }

      screenshotSection.appendChild(screenshotActions);
      bubble.appendChild(screenshotSection);
    }

    const summarySection = document.createElement('div');
    summarySection.className = 'preview-summary';

    const summaryTitle = document.createElement('div');
    summaryTitle.className = 'preview-summary-title';
    summaryTitle.textContent = 'Change summary';
    summarySection.appendChild(summaryTitle);

    if (summary.highlights.length) {
      const chips = document.createElement('div');
      chips.className = 'preview-summary-chips';
      summary.highlights.forEach((item) => {
        const chip = document.createElement('span');
        chip.className = 'preview-summary-chip';
        chip.textContent = item;
        chips.appendChild(chip);
      });
      summarySection.appendChild(chips);
    }

    const summaryList = document.createElement('ul');
    summaryList.className = 'preview-summary-list';
    summary.bullets.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      summaryList.appendChild(li);
    });
    summarySection.appendChild(summaryList);
    bubble.appendChild(summarySection);

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'preview-actions';

    const approveBtn = document.createElement('button');
    approveBtn.className = 'preview-btn approve-btn';
    approveBtn.textContent = 'Approve & Apply';
    approveBtn.addEventListener('click', () => handleApprove(requestId, actions));

    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'preview-btn reject-btn';
    rejectBtn.textContent = 'Request Changes';
    rejectBtn.addEventListener('click', () => handleReject(requestId, actions));

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'preview-btn cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => handleCancelReview(msg));

    actions.appendChild(approveBtn);
    actions.appendChild(rejectBtn);
    actions.appendChild(cancelBtn);
    bubble.appendChild(actions);

    msg.appendChild(bubble);
    messagesEl.appendChild(msg);
    scrollToBottom();
    return msg;
  }

  function addNoChangeCard(requestId, latestLog) {
    removeWelcome();

    const msg = document.createElement('div');
    msg.className = 'msg msg-system';
    msg.dataset.requestId = requestId;

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble preview-card';

    const title = document.createElement('div');
    title.className = 'preview-summary-title';
    title.textContent = 'No changes needed';

    const note = document.createElement('div');
    note.className = 'preview-empty-note';
    note.textContent = latestLog || 'After comparing the current code with the request, there are no app changes to apply right now.';

    const actionBtn = document.createElement('button');
    actionBtn.className = 'preview-open-full-btn preview-open-page-btn';
    actionBtn.textContent = 'Refine your request';
    actionBtn.addEventListener('click', () => {
      promptInput.focus();
    });

    bubble.appendChild(title);
    bubble.appendChild(note);
    bubble.appendChild(actionBtn);
    msg.appendChild(bubble);
    messagesEl.appendChild(msg);
    scrollToBottom();
    return msg;
  }

  function handleApprove(requestId, actionsEl) {
    actionsEl.innerHTML = '<div class="msg-status"><span class="dot dot-waiting"></span> Applying locally...</div>';
    chrome.runtime.sendMessage({ type: 'inspect-approve', requestId }, (response) => {
      if (chrome.runtime.lastError || !response) {
        actionsEl.innerHTML = '<div class="msg-status"><span class="dot dot-error"></span> Failed</div>';
        return;
      }
      if (response.error) {
        actionsEl.innerHTML = `<div class="msg-status"><span class="dot dot-error"></span> ${escapeHtml(response.error)}</div>`;
      } else {
        const appliedText = response.reloaded
          ? 'Applied locally and refreshed page'
          : 'Applied locally';
        actionsEl.innerHTML = `<div class="msg-status"><span class="dot dot-applied"></span> ${appliedText}</div>`;
      }
    });
  }

  function handleReject(requestId, actionsEl) {
    actionsEl.innerHTML = `
      <div class="reject-feedback">
        <input type="text" class="reject-input" placeholder="What should be different?" />
        <button class="preview-btn reject-send-btn">Send</button>
      </div>
    `;
    const input = actionsEl.querySelector('.reject-input');
    const btn = actionsEl.querySelector('.reject-send-btn');
    input.focus();

    const doReject = () => {
      const feedback = input.value.trim();
      if (!feedback) return;
      actionsEl.innerHTML = '<div class="msg-status"><span class="dot dot-waiting"></span> Iterating...</div>';
      addUserMessage(feedback);
      chrome.runtime.sendMessage({ type: 'inspect-reject', requestId, feedback }, (response) => {
        if (response && response.id) {
          startHttpPolling(response.id);
        }
      });
    };

    btn.addEventListener('click', doReject);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doReject(); }
    });
  }

  function handleCancelReview(messageEl) {
    if (messageEl && messageEl.parentNode) {
      messageEl.parentNode.removeChild(messageEl);
    }
    inputStatus.textContent = 'Review card dismissed. You can send your next request now.';
    scrollToBottom();
  }

  // ─── Send / Submit ──────────────────────────────────────────────────
  function updateSendState() {
    const hasText = promptInput.value.trim().length > 0;
    sendBtn.disabled = !hasText || isSubmitting || !!pendingExecutionPlan;
  }

  function buildStructuredRequest({
    prompt,
    resolvedClient,
    resolvedPagePath,
    resolvedComponent,
    resolvedFile,
    resolvedTestId,
    resolvedLanguage,
  }) {
    const intent = (intentSelect && intentSelect.value) || inferIntentFromPrompt(prompt);
    const constraints = splitListInput(constraintsInput ? constraintsInput.value : '');
    const successCriteria = splitListInput(successCriteriaInput ? successCriteriaInput.value : '');
    const goal = (goalInput && goalInput.value.trim()) || prompt;

    return {
      goal,
      target: {
        client: resolvedClient || 'msm-default',
        route_or_page: resolvedPagePath || '/',
        component_name: resolvedComponent || null,
        element_label: resolvedTestId || resolvedComponent || null,
        selection_context: {
          test_id: resolvedTestId || null,
          source_file: resolvedFile || null,
          language: resolvedLanguage || null,
          selected_elements: selectedElements.map((item) => ({
            component: item.component || null,
            file: item.file || null,
            line: item.line || null,
            test_id: item.testId || null,
          })),
        },
      },
      change_intent: intent,
      requested_change: prompt,
      constraints,
      success_criteria: successCriteria.length
        ? successCriteria
        : [
          'The requested change is visible in the preview.',
          ...(resolvedLanguage ? [`Preview and screenshot maintain the ${resolvedLanguage} language.`] : []),
        ],
      validation_expectations: getValidationExpectations(intent, resolvedLanguage),
      source_documents: prdContext
        ? [{
          type: prdContext.sourceType || 'prd_link',
          title: prdContext.title || null,
          url: prdContext.url || null,
          summary: prdContext.summary || null,
        }]
        : [],
    };
  }

  promptInput.addEventListener('compositionstart', () => {
    isComposing = true;
  });

  promptInput.addEventListener('compositionend', () => {
    isComposing = false;
  });

  promptInput.addEventListener('input', () => {
    updateSendState();
    promptInput.style.height = 'auto';
    promptInput.style.height = Math.min(promptInput.scrollHeight, 120) + 'px';
    if (intentSelect && !intentSelect.dataset.userTouched) {
      intentSelect.value = inferIntentFromPrompt(promptInput.value);
    }
    if (goalInput && !goalInput.value.trim()) {
      goalInput.placeholder = promptInput.value.trim()
        ? `e.g. ${promptInput.value.trim()}`
        : 'e.g. Make the login CTA clearer.';
    }
  });

  intentSelect.addEventListener('change', () => {
    intentSelect.dataset.userTouched = 'true';
  });

  promptInput.addEventListener('keydown', (e) => {
    if (e.isComposing || isComposing || e.keyCode === 229) {
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });

  sendBtn.addEventListener('click', submit);

  function performSubmit(plan) {
    const payload = plan.payload;
    // Attach AI analysis to payload so orchestrator can store it
    if (plan.aiAnalysis) {
      payload.aiAnalysis = {
        understanding: plan.aiAnalysis.understanding || null,
        analysis: plan.aiAnalysis.analysis || null,
        steps: plan.aiAnalysis.steps || [],
        warnings: plan.aiAnalysis.warnings || [],
        successCriteria: plan.aiAnalysis.successCriteria || [],
      };
    }
    isSubmitting = true;
    updateSendState();

    chrome.runtime.sendMessage(
      { type: 'inspect-submit', payload },
      (response) => {
        isSubmitting = false;
        updateSendState();

        if (chrome.runtime.lastError) {
          addSystemMessage(humanizeError(chrome.runtime.lastError.message), 'error');
          return;
        }
        if (response && response.ok) {
          clearElementCard();
          clearCaptureCard();
          pendingClarification = null;
          inputStatus.textContent = '';

          if (response.mode === 'http' && response.requestId) {
            // HTTP mode: poll orchestrator for progress
            currentRequestId = response.requestId;
            addProgressMessage(response.requestId, payload);
            inputStatus.textContent = '';
            startHttpPolling(response.requestId);
          } else {
            // Native mode: simple file-based polling
            addSystemMessage('Sent to Agent', 'sent');
            inputStatus.textContent = '';
            setTimeout(() => {
              inputStatus.textContent = '';
              startNativePolling();
            }, 1200);
          }
        } else {
          addSystemMessage(humanizeError(response ? response.error : 'Unknown'), 'error');
        }
      }
    );
  }

  async function submit() {
    const text = promptInput.value.trim();
    if (!text) return;
    if (isSubmitting || pendingExecutionPlan) return;

    const activeContext = getActiveContext();
    if (shouldStartClarification(text, activeContext)) {
      const clarification = buildClarificationConfig(text, activeContext);
      pendingClarification = {
        initialPrompt: text,
        inferredIntent: clarification.intent,
        requestedDepth: inferClarificationDepth(text, activeContext),
        turns: 1,
      };
      addUserMessage(text, currentElement, selectedCapture);
      addClarificationMessage(clarification);
      promptInput.value = '';
      promptInput.style.height = 'auto';
      inputStatus.textContent = 'Pick an option or type your own — work starts as soon as you do.';
      if (intentSelect) {
        intentSelect.value = clarification.intent;
        intentSelect.dataset.userTouched = 'auto';
      }
      updateSendState();
      return;
    }

    const finalText = pendingClarification
      ? buildClarifiedPrompt(pendingClarification.initialPrompt, text)
      : text;

    if (pendingClarification) {
      const needsOneMoreTurn =
        pendingClarification.requestedDepth > pendingClarification.turns &&
        inferPromptSpecificity(text) === 'low';

      if (needsOneMoreTurn) {
        const followup = buildFollowupClarificationConfig(finalText, activeContext, pendingClarification);
        pendingClarification = {
          ...pendingClarification,
          initialPrompt: finalText,
          turns: pendingClarification.turns + 1,
        };
        addClarificationMessage(followup);
        promptInput.value = '';
        promptInput.style.height = 'auto';
        inputStatus.textContent = 'Got it. Just one more thing to confirm.';
        updateSendState();
        return;
      }
    }

    const now = Date.now();
    const signature = JSON.stringify({
      text: finalText,
      component: currentElement ? currentElement.component : null,
      file: currentElement ? currentElement.file : null,
      line: currentElement ? currentElement.line : null,
      selectionCount: selectedElements.length,
    });
    if (lastSubmitSignature === signature && now - lastSubmitAt < 1500) {
      return;
    }
    lastSubmitSignature = signature;
    lastSubmitAt = now;

    const livePageContext = await getLivePageContext();
    const capturePageUrl = selectedCapture && selectedCapture.rect ? selectedCapture.rect.pageUrl : null;
    const shouldPreferCaptureContext =
      !!capturePageUrl &&
      !!currentElement &&
      !!currentElement.pageUrl &&
      capturePageUrl !== currentElement.pageUrl;

    const shouldPreferLivePageContext =
      !!livePageContext &&
      !!livePageContext.pagePath &&
      !shouldPreferCaptureContext &&
      (
        !currentElement ||
        !currentElement.pagePath ||
        livePageContext.pagePath !== currentElement.pagePath
      );

    const resolvedPageUrl = shouldPreferCaptureContext
      ? capturePageUrl
      : shouldPreferLivePageContext
        ? livePageContext.pageUrl || null
      : (currentElement && currentElement.pageUrl) ||
        (livePageContext && livePageContext.pageUrl) ||
        capturePageUrl ||
        null;
    const resolvedPagePath = shouldPreferCaptureContext
      ? (selectedCapture && selectedCapture.rect ? selectedCapture.rect.pagePath : null)
      : shouldPreferLivePageContext
        ? livePageContext.pagePath || null
      : (currentElement && currentElement.pagePath) ||
        (livePageContext && livePageContext.pagePath) ||
        (selectedCapture && selectedCapture.rect ? selectedCapture.rect.pagePath : null) ||
        null;
    const resolvedClient = shouldPreferCaptureContext
      ? (selectedCapture && selectedCapture.rect ? selectedCapture.rect.client : null)
      : shouldPreferLivePageContext
        ? livePageContext.client || null
      : (currentElement && currentElement.client) ||
        (livePageContext && livePageContext.client) ||
        (selectedCapture && selectedCapture.rect ? selectedCapture.rect.client : null) ||
        null;
    const resolvedLanguage = shouldPreferCaptureContext
      ? (selectedCapture && selectedCapture.rect ? selectedCapture.rect.language : null)
      : shouldPreferLivePageContext
        ? livePageContext.language || null
      : (currentElement && currentElement.language) ||
        (livePageContext && livePageContext.language) ||
        (selectedCapture && selectedCapture.rect ? selectedCapture.rect.language : null) ||
        null;
    const resolvedComponent = shouldPreferCaptureContext ? null : (currentElement ? currentElement.component : null);
    const resolvedFile = shouldPreferCaptureContext ? null : (currentElement ? currentElement.file : null);
    const resolvedLine = shouldPreferCaptureContext ? null : (currentElement ? currentElement.line : null);
    const resolvedTestId = shouldPreferCaptureContext ? null : (currentElement ? currentElement.testId : null);
    const resolvedStyles = shouldPreferCaptureContext ? null : (currentElement ? currentElement.styles : null);
    const requestContract = buildStructuredRequest({
      prompt: finalText,
      resolvedClient,
      resolvedPagePath,
      resolvedComponent,
      resolvedFile,
      resolvedTestId,
      resolvedLanguage,
    });

    const payload = {
      component: resolvedComponent,
      file: resolvedFile,
      line: resolvedLine,
      testId: resolvedTestId,
      styles: resolvedStyles,
      selectedElements: selectedElements.map((item) => ({
        component: item.component || null,
        file: item.file || null,
        line: item.line || null,
        testId: item.testId || null,
        semantics: item.semantics || null,
      })),
      pageUrl: resolvedPageUrl,
      pagePath: resolvedPagePath,
      client: resolvedClient,
      language: resolvedLanguage,
      selectionScreenshotDataUrl: selectedCapture ? selectedCapture.imageDataUrl : null,
      selectionRect: selectedCapture ? selectedCapture.rect : null,
      goal: requestContract.goal,
      requested_change: requestContract.requested_change,
      requestContract,
      prdContext: prdContext
        ? {
          title: prdContext.title || null,
          summary: prdContext.summary || null,
          changeCandidates: prdContext.changeCandidates || [],
          openQuestions: prdContext.openQuestions || [],
          url: prdContext.url || null,
          sourceType: prdContext.sourceType || null,
        }
        : null,
      userPrompt: finalText,
      timestamp: new Date().toISOString(),
    };

    addUserMessage(text, currentElement, selectedCapture);
    promptInput.value = '';
    promptInput.style.height = 'auto';
    updateSendState();

    pendingExecutionPlan = {
      payload,
      requestContract,
      prdContext,
      originalPrompt: text,
      finalPrompt: finalText,
    };
    pendingClarification = null;
    inputStatus.textContent = 'Analyzing your request...';

    // Show thinking indicator immediately
    const thinkingMsg = addThinkingMessage();

    // Call AI analysis API
    fetchAiAnalysis(payload).then((analysis) => {
      // Remove thinking indicator
      if (thinkingMsg && thinkingMsg.parentNode) thinkingMsg.remove();
      pendingExecutionPlan.aiAnalysis = analysis;
      inputStatus.textContent = 'Review the plan to start editing and preview generation.';
      addExecutionPlanMessage(pendingExecutionPlan);
    }).catch(() => {
      // Fallback: show plan without AI analysis
      if (thinkingMsg && thinkingMsg.parentNode) thinkingMsg.remove();
      inputStatus.textContent = 'Review the plan to start editing and preview generation.';
      addExecutionPlanMessage(pendingExecutionPlan);
    });
  }

  // ─── HTTP Polling (Orchestrator) ────────────────────────────────────
  function startHttpPolling(requestId) {
    stopPolling();
    pollCount = 0;

    pollingTimer = setInterval(() => {
      pollCount++;
      if (pollCount >= MAX_POLL) {
        stopPolling();
        addSystemMessage('Timed out waiting for changes', 'timeout');
        inputStatus.textContent = '';
        return;
      }

      chrome.runtime.sendMessage({ type: 'inspect-poll', requestId }, (response) => {
        if (chrome.runtime.lastError || !response) return;

        if (response.status === 'preview') {
          stopPolling();
          inputStatus.textContent = '';
          updateProgressMessage({
            requestId,
            phase: response.phase || 'preview_ready',
            latestLog: response.latestLog || '',
            statusType: 'applied',
            statusLabel: 'preview ready',
            title: 'Agent has prepared the preview',
            previewUrl: response.previewUrl || null,
          });
          addPreviewCard(
            response.diff,
            response.screenshotUrl,
            requestId,
            response.changedFiles || [],
            response.previewUrl || null,
          );
        } else if (response.status === 'no_change_needed') {
          stopPolling();
          inputStatus.textContent = '';
          updateProgressMessage({
            requestId,
            phase: response.phase || 'no_change_needed',
            latestLog: response.latestLog || '',
            statusType: 'waiting',
            statusLabel: 'no change',
            title: 'Agent determined no changes are needed for this request',
          });
          addNoChangeCard(requestId, response.latestLog || response.error || '');
        } else if (response.status === 'approved') {
          stopPolling();
          inputStatus.textContent = '';
          updateProgressMessage({
            requestId,
            phase: response.phase || 'applying_local_patch',
            latestLog: response.latestLog || '',
            statusType: 'applied',
            statusLabel: 'applied',
            title: 'Agent has applied the changes',
          });
        } else if (response.status === 'error') {
          stopPolling();
          inputStatus.textContent = '';
          updateProgressMessage({
            requestId,
            phase: response.phase || 'pipeline_error',
            latestLog: response.error || response.latestLog || '',
            statusType: 'error',
            statusLabel: 'error',
            title: 'Something went wrong during Agent processing',
          });
          addSystemMessage(humanizeError(response.error || 'Unknown'), 'error');
        } else if (response.status === 'processing' || response.status === 'pending') {
          inputStatus.textContent = '';
          updateProgressMessage({
            requestId,
            phase: response.phase || 'queued',
            latestLog: response.latestLog || '',
            statusType: response.status === 'pending' ? 'waiting' : 'sent',
            statusLabel: response.status === 'pending' ? 'waiting' : 'working',
            previewUrl: response.previewUrl || null,
          });
        }
        // 'pending' and 'processing' — keep polling
      });
    }, 2000); // poll every 2s for HTTP mode
  }

  // ─── Native Polling (file-based) ───────────────────────────────────
  function startNativePolling() {
    stopPolling();
    pollCount = 0;

    pollingTimer = setInterval(() => {
      pollCount++;
      if (pollCount >= 60) {
        stopPolling();
        addSystemMessage('Agent response timed out', 'timeout');
        return;
      }
      chrome.runtime.sendMessage({ type: 'inspect-status' }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response && response.status === 'consumed') {
          stopPolling();
          addSystemMessage('Changes applied!', 'applied');
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

  // ─── Inspector Toggle ──────────────────────────────────────────────
  inspectToggleBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'popup-toggle' }, (response) => {
      if (chrome.runtime.lastError) {
        addSystemMessage(`Inspector toggle failed: ${chrome.runtime.lastError.message}`, 'error');
        return;
      }
      if (response && response.ok === false) {
        addSystemMessage(`Inspector toggle failed: ${response.error || 'Unknown error'}`, 'error');
        return;
      }
      if (response && response.active != null) {
        inspectActive = response.active;
      } else {
        inspectActive = !inspectActive;
      }
      updateInspectToggle();
    });
  });

  screenshotBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'start-region-capture' }, (response) => {
      if (chrome.runtime.lastError) {
        addSystemMessage(`Could not start region selection: ${chrome.runtime.lastError.message}`, 'error');
        return;
      }
      if (!response || response.ok === false) {
        addSystemMessage(`Could not start region selection: ${response?.error || 'Unknown error'}`, 'error');
        return;
      }
      inputStatus.textContent = 'Drag to select the area you want to capture.';
    });
  });

  function updateInspectToggle() {
    inspectToggleBtn.classList.toggle('active', inspectActive);
  }

  chrome.runtime.sendMessage({ type: 'popup-get-state' }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response && response.active != null) {
      inspectActive = response.active;
      updateInspectToggle();
    }
  });

  loadRequestSchema();
  refreshHealth();
  setInterval(refreshHealth, 15000);

  // ─── Listen for element selection from content-script ───────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'element-selected') {
      showElementCard(msg.data, !!msg.data?.additive);
      inspectActive = !!msg.data?.additive;
      updateInspectToggle();
    }
    if (msg.type === 'selection-cleared') {
      currentElement = null;
      selectedElements = [];
      elementCard.style.display = 'none';
      renderSelectionChips();
      updateContextStrip();
    }
    if (msg.type === 'inspect-state') {
      inspectActive = msg.active;
      updateInspectToggle();
    }
    if (msg.type === 'capture-region-ready') {
      showCaptureCard(msg.data);
      inputStatus.textContent = 'The selected screenshot will be included with the request.';
    }
  });

  updateContextStrip();

  // Infra status polling
  async function getServerUrl() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['serverUrl'], (result) => {
        resolve(result.serverUrl || 'http://localhost:3847');
      });
    });
  }

  async function updateInfraStatus() {
    const orcDot = document.getElementById('infraOrcDot');
    const orcLabel = document.getElementById('infraOrcLabel');
    const sandboxCount = document.getElementById('infraSandboxCount');
    const modelLabel = document.getElementById('infraModel');
    if (!orcDot) return;
    const baseUrl = await getServerUrl();
    try {
      const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        orcDot.className = 'infra-dot up';
        orcLabel.textContent = 'Online';
        modelLabel.textContent = data.model || '?';
      } else {
        orcDot.className = 'infra-dot down';
        orcLabel.textContent = 'Error';
      }
    } catch {
      orcDot.className = 'infra-dot down';
      orcLabel.textContent = 'Offline';
    }
    try {
      const res = await fetch(`${baseUrl}/api/sandboxes`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        sandboxCount.textContent = String((data.sandboxes || []).length);
      }
    } catch {}
  }
  updateInfraStatus();
  setInterval(updateInfraStatus, 10000);

  window.__CLICK_TO_INSPECT_TEST_API = {
    renderPreviewCard(args = {}) {
      addPreviewCard(
        args.diff || '',
        args.screenshotUrl || null,
        args.requestId || 'test-preview',
        args.changedFiles || [],
        args.previewUrl || null,
      );
    },
    clearMessages() {
      messagesEl.innerHTML = '';
      clearActiveProgressCard();
    },
  };

})();
