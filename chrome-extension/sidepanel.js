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
  // Phase 3 Task 3.1 sub-phase D — molly chat history. submit/performSubmit
  // 의 /api/intake 호출 시 동봉 → server 의 dispatcher 가 prev kind 보고
  // multi-turn (clarification + plan) 라우팅. session 단위 (sidepanel
  // reload 시 초기화) — 길어지면 메모리 부담이라 last N=10 만 유지.
  let mollyChatHistory = [];
  function pushMollyHistory(role, content, kind) {
    mollyChatHistory.push({ role, content: String(content || '').slice(0, 1000), kind: kind || undefined });
    if (mollyChatHistory.length > 10) mollyChatHistory.shift();
  }
  let currentRequestId = null; // HTTP mode: orchestrator request ID
  let currentJobId = null; // Phase 2: job pipeline mode
  let currentJobInProgress = false; // blocks send while a job is active on the same playground
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
      // Selected playground has a Job in flight — orchestrator blocks
      // ad-hoc requests so they can't interleave with the job's
      // serial task stream against the same git tree.
      [/job_active/i, '선택한 Playground 에 진행 중인 Job 이 있어서 지금은 요청을 받을 수 없습니다. Inspect Console 의 Jobs 탭에서 해당 Job 을 끝내거나 취소한 뒤 다시 시도하세요.'],
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
  const userNameInput = document.getElementById('userName');
  chrome.storage.local.get(['projectRoot', 'serverUrl', 'mode', 'userName'], (result) => {
    if (result.projectRoot) projectRootInput.value = result.projectRoot;
    if (serverUrlInput && result.serverUrl) serverUrlInput.value = result.serverUrl;
    if (modeSelect && result.mode) modeSelect.value = result.mode;
    if (userNameInput && result.userName) userNameInput.value = result.userName;
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

  if (userNameInput) {
    userNameInput.addEventListener('change', () => {
      chrome.storage.local.set({ userName: userNameInput.value.trim() });
    });
  }

  // ─── Playground selector (M4) ───────────────────────────────────────
  // Lets the user pick which playground /api/change-request writes to,
  // or spin up a fresh one without leaving the extension. Selection is
  // persisted in chrome.storage.local.selectedPlaygroundId; background.js
  // reads it and injects `playgroundId` into the change-request payload.
  //
  // UI is intentionally small — one select + "new" + "open in browser"
  // + a refresh glyph. No inline list of requests yet; that's Step B.
  const playgroundSelect = document.getElementById('playgroundSelect');
  const playgroundMeta = document.getElementById('playgroundMeta');
  const playgroundNewBtn = document.getElementById('playgroundNewBtn');
  const playgroundRefreshBtn = document.getElementById('playgroundRefreshBtn');
  const playgroundOpenBtn = document.getElementById('playgroundOpenBtn');

  // Playground-app dev server URL. Keeps the sidepanel honest about
  // where "open in browser" actually points — could become a setting
  // later if someone runs playground-app on a non-default port.
  const PLAYGROUND_APP_URL = 'http://localhost:4180';
  // Shared projectId for ext-created playgrounds. Consistent tag lets
  // teammates filter later; per-tab derivation is not worth it at MVP.
  const EXT_PROJECT_ID = 'chrome-ext';
  // Sentinel for "create a fresh playground on next send" mode. The
  // default conversation experience: no manual playground picking,
  // each new chat session gets its own isolated sandbox.
  const AUTO_PLAYGROUND_SENTINEL = '__auto__';

  /** Format a playground option label — `title · by kyungjae · 2h`. */
  function labelPlayground(pg) {
    const parts = [pg.title];
    if (pg.createdBy) parts.push(`by ${pg.createdBy}`);
    const diff = Date.now() - (pg.createdAt || 0);
    const min = Math.round(diff / 60_000);
    const rel =
      diff < 45_000 ? 'now' :
      min < 60 ? `${min}m` :
      min < 1440 ? `${Math.round(min / 60)}h` :
      `${Math.round(min / 1440)}d`;
    parts.push(rel);
    return parts.join(' · ');
  }

  async function loadPlaygrounds() {
    if (!playgroundSelect) return;
    const baseUrl = await getServerUrl();
    let pgs = [];
    try {
      const res = await fetch(`${baseUrl}/api/playground?status=active`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        pgs = Array.isArray(data.playgrounds) ? data.playgrounds : [];
      }
    } catch (err) {
      console.warn('[Moloco Inspect] loadPlaygrounds failed:', err);
    }

    const { selectedPlaygroundId, lastPlaygroundId } = await new Promise((resolve) =>
      chrome.storage.local.get(['selectedPlaygroundId', 'lastPlaygroundId'], resolve),
    );

    // Repaint <select>. New default order:
    //   1) 🆕 새 작업 (auto-create on next send)  ← default when no lastPlaygroundId
    //   2) optgroup "Existing playgrounds" — pick to attach to one
    //   3) optgroup "Advanced" — stateless escape hatch
    playgroundSelect.innerHTML = '';
    const auto = document.createElement('option');
    auto.value = AUTO_PLAYGROUND_SENTINEL;
    auto.textContent = '🆕 새 작업 (자동 생성)';
    playgroundSelect.appendChild(auto);

    if (pgs.length > 0) {
      const grpExisting = document.createElement('optgroup');
      grpExisting.label = 'Existing playgrounds';
      for (const pg of pgs) {
        const opt = document.createElement('option');
        opt.value = pg.id;
        opt.textContent = labelPlayground(pg);
        opt.dataset.client = pg.client || '';
        grpExisting.appendChild(opt);
      }
      playgroundSelect.appendChild(grpExisting);
    }

    const grpAdvanced = document.createElement('optgroup');
    grpAdvanced.label = 'Advanced';
    const stateless = document.createElement('option');
    stateless.value = '';
    stateless.textContent = 'Stateless (no playground)';
    grpAdvanced.appendChild(stateless);
    playgroundSelect.appendChild(grpAdvanced);

    // Default selection priority:
    //   1) selectedPlaygroundId (explicit user selection in this session)
    //   2) lastPlaygroundId (last playground used for a Job) — reuse if still active
    //   3) AUTO_PLAYGROUND_SENTINEL (new task, auto-create on next send)
    let next;
    if (selectedPlaygroundId === AUTO_PLAYGROUND_SENTINEL) {
      next = AUTO_PLAYGROUND_SENTINEL;
    } else if (selectedPlaygroundId === '') {
      next = ''; // user explicitly chose stateless
    } else if (selectedPlaygroundId && pgs.some((p) => p.id === selectedPlaygroundId)) {
      next = selectedPlaygroundId;
    } else if (lastPlaygroundId && pgs.some((p) => p.id === lastPlaygroundId)) {
      // Reuse last-used playground as default (Slack thread parity)
      next = lastPlaygroundId;
    } else {
      next = AUTO_PLAYGROUND_SENTINEL;
    }
    playgroundSelect.value = next;
    updatePlaygroundMeta();
  }

  function updatePlaygroundMeta() {
    if (!playgroundSelect || !playgroundMeta || !playgroundOpenBtn) return;
    const id = playgroundSelect.value;
    if (id === AUTO_PLAYGROUND_SENTINEL) {
      playgroundMeta.textContent =
        '메시지 보낼 때 새 Playground 가 자동으로 만들어집니다 (~30초).';
      playgroundOpenBtn.disabled = true;
      return;
    }
    if (!id) {
      playgroundMeta.textContent =
        'Stateless — change-request 가 격리되지 않은 상태로 실행됩니다.';
      playgroundOpenBtn.disabled = true;
      return;
    }
    const opt = playgroundSelect.options[playgroundSelect.selectedIndex];
    const client = opt?.dataset?.client ? ` · client=${opt.dataset.client}` : '';
    playgroundMeta.textContent = `${id}${client}`;
    playgroundOpenBtn.disabled = false;
  }

  /**
   * If the selector is in auto-create mode (the default), spin up a
   * new playground and switch the selector to point at it before the
   * change-request goes out. Subsequent messages in the same session
   * reuse this playground until the user explicitly picks "🆕 New" or
   * a different one.
   *
   * Returns the effective playgroundId (newly-created or existing).
   * Returns null on stateless. Throws on creation failure so the
   * submit path can surface the error.
   */
  async function ensureEffectivePlayground() {
    const value = playgroundSelect?.value ?? AUTO_PLAYGROUND_SENTINEL;
    if (value !== AUTO_PLAYGROUND_SENTINEL) {
      return value || null; // existing id or '' (stateless)
    }
    // Auto-create flow.
    const baseUrl = await getServerUrl();
    const { userName } = await new Promise((resolve) =>
      chrome.storage.local.get(['userName'], resolve),
    );
    // Title is throwaway-ish — first ~28 chars of the prompt + time
    // so the user can spot the playground later in Inspect Console.
    const promptText = (promptInput?.value || '').trim();
    const stamp = new Date().toTimeString().slice(0, 5); // HH:MM
    const titleHead = promptText.slice(0, 28).replace(/\s+/g, ' ');
    const title = titleHead
      ? `${titleHead}${promptText.length > 28 ? '…' : ''} · ${stamp}`
      : `Chrome ext · ${stamp}`;

    const prevStatus = inputStatus.textContent;
    inputStatus.textContent = '🛠️ Playground 부팅 중… (~30초)';

    let newId = null;
    try {
      const res = await fetch(`${baseUrl}/api/playground`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: EXT_PROJECT_ID,
          title,
          createdBy: (userName || '').trim() || undefined,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${errBody.slice(0, 200)}`);
      }
      const data = await res.json();
      newId = data?.playground?.id;
      if (!newId) throw new Error('orchestrator returned no playground id');
    } finally {
      inputStatus.textContent = prevStatus || '';
    }

    // Persist the new id and refresh the dropdown so the user sees the
    // selector now points to the just-created playground (no longer in
    // auto-create mode for the next message).
    // Also save as lastPlaygroundId so future sessions default to reuse
    // (Slack thread parity: same task = same playground).
    await new Promise((resolve) =>
      chrome.storage.local.set({ selectedPlaygroundId: newId, lastPlaygroundId: newId }, resolve),
    );
    await loadPlaygrounds();
    return newId;
  }

  if (playgroundSelect) {
    playgroundSelect.addEventListener('change', () => {
      // Persist the literal value (including the AUTO sentinel and ''
      // for stateless) so loadPlaygrounds can re-pick exactly what
      // the user chose. Previously '' coerced to null which conflated
      // "no choice" with "explicit stateless".
      chrome.storage.local.set({
        selectedPlaygroundId: playgroundSelect.value,
      });
      updatePlaygroundMeta();
    });
  }

  const newTaskBtn = document.getElementById('newTaskBtn');
  if (newTaskBtn) {
    newTaskBtn.addEventListener('click', () => {
      // Clear lastPlaygroundId so the next send boots a fresh playground.
      // Also reset selectedPlaygroundId to AUTO so loadPlaygrounds picks it up.
      chrome.storage.local.remove(['lastPlaygroundId', 'selectedPlaygroundId'], () => {
        playgroundSelect.value = AUTO_PLAYGROUND_SENTINEL;
        chrome.storage.local.set({ selectedPlaygroundId: AUTO_PLAYGROUND_SENTINEL });
        updatePlaygroundMeta();
        if (inputStatus) {
          inputStatus.textContent = '새 작업 시작 — 다음 메시지가 새 playground 를 부팅합니다.';
          setTimeout(() => {
            if (inputStatus.textContent.startsWith('새 작업 시작')) {
              inputStatus.textContent = '';
            }
          }, 4000);
        }
      });
    });
  }

  if (playgroundRefreshBtn) {
    playgroundRefreshBtn.addEventListener('click', () => loadPlaygrounds());
  }

  if (playgroundOpenBtn) {
    playgroundOpenBtn.addEventListener('click', () => {
      const id = playgroundSelect?.value;
      if (!id) return;
      chrome.runtime.sendMessage({
        type: 'inspect-open-url',
        url: `${PLAYGROUND_APP_URL}/p/${id}`,
      });
    });
  }

  if (playgroundNewBtn) {
    playgroundNewBtn.addEventListener('click', async () => {
      const title = window.prompt('새 Playground 제목');
      if (!title || !title.trim()) return;
      const { userName } = await new Promise((resolve) =>
        chrome.storage.local.get(['userName'], resolve),
      );
      const baseUrl = await getServerUrl();
      try {
        const res = await fetch(`${baseUrl}/api/playground`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: EXT_PROJECT_ID,
            title: title.trim(),
            createdBy: (userName || '').trim() || undefined,
          }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) {
          const err = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status} ${err}`);
        }
        const data = await res.json();
        const newId = data?.playground?.id;
        if (newId) {
          chrome.storage.local.set({ selectedPlaygroundId: newId });
        }
        await loadPlaygrounds();
      } catch (err) {
        console.error('[Moloco Inspect] create playground failed', err);
        window.alert(`Playground 생성 실패: ${err.message}`);
      }
    });
  }

  // Initial fetch + periodic refresh so newly-created playgrounds from
  // other surfaces (playground-app) show up without a manual click.
  loadPlaygrounds();
  setInterval(loadPlaygrounds, 30_000);

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

  /**
   * Marks the chat as "started" so the CSS layer can collapse the
   * playground picker + selected-element card. Idempotent — safe to
   * call from every addUserMessage.
   */
  function markChatStarted() {
    document.body.classList.add('chat-active');
  }

  function addUserMessage(text, elementData, captureData) {
    removeWelcome();
    markChatStarted();
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
    // Sub-phase D — molly intake history 에 user turn 기록. element/
    // capture 컨텍스트는 텍스트엔 안 합쳐 — 서버 dispatcher 는 텍스트만
    // 보고 routing.
    pushMollyHistory('user', text);
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

  /**
   * Phase 2 follow-up: molly chat 모드 응답 카드. text 또는 status
   * templated 응답을 사용자에게 보여줌. progress card 와 다르게
   * lifecycle 없음 — pure 답변.
   */
  /**
   * Phase 3 Task 3.2 follow-up — molly 가 처리 중일 때 사용자가 뭘 기다
   * 리고 있는지 보여주는 thinking indicator. 단순 "잠깐만요…" 가 아니라
   * 시간이 흐르면서 phase 별 안내로 업데이트:
   *   0s   "🤔 의도 분석 중..."           classifier (~0.5s)
   *   2s   "📋 PRD 명확도 검토 중..."      analyzer (~3-10s, thinking ON)
   *   8s   "🛠️ 계획 만드는 중..."          plan emit (~15-25s, DS context)
   *   20s  "⌛ 조금만 더 기다려 주세요..."  timeout 가까워졌을 때
   *
   * 반환: { dismiss() } — 응답 도착하면 호출. setTimeout 들 정리 + node 제거.
   */
  function showMollyThinking(messagesEl) {
    const wrap = document.createElement('div');
    wrap.className = 'msg msg-system molly-thinking';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble molly-chat-card';
    bubble.textContent = '🤔 의도 분석 중...';
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    const timers = [];
    timers.push(setTimeout(() => { bubble.textContent = '📋 PRD 명확도 검토 중...'; }, 2000));
    timers.push(setTimeout(() => { bubble.textContent = '🛠️ 계획 만드는 중... (10-20초)'; }, 8000));
    timers.push(setTimeout(() => { bubble.textContent = '⌛ 조금만 더 기다려 주세요...'; }, 20000));

    return {
      dismiss() {
        for (const t of timers) clearTimeout(t);
        if (wrap.parentNode) wrap.remove();
      },
    };
  }

  function addMollyChatMessage(text, kind) {
    removeWelcome();
    const wrap = document.createElement('div');
    wrap.className = 'msg msg-system';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble molly-chat-card';
    const header = document.createElement('div');
    header.className = 'molly-chat-header';
    header.textContent = kind === 'status_query' ? '📊 molly status' : '💬 molly';
    const body = document.createElement('div');
    body.className = 'molly-chat-body';
    // text 는 server 가 신뢰 — 다만 textContent 로 안전하게.
    body.textContent = text;
    bubble.appendChild(header);
    bubble.appendChild(body);
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    // Sub-phase D — history 에 assistant turn 기록. 'clarify' kind 는
    // server 의 'code_change_ambiguous' 와 매핑 — dispatcher 가 다음
    // 사용자 입력을 follow-up answer 로 라우팅.
    const intakeKind = kind === 'clarify' ? 'code_change_ambiguous' : (kind || 'chat');
    pushMollyHistory('assistant', text, intakeKind);
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

  /**
   * Phase 2 / B Step 1: progress card for the unified Job pipeline.
   * Less detailed than the request-level card (no per-tool stepper)
   * — the Job pipeline already surfaces task-level progress in
   * Inspect Console + (in later steps) Slack/Playground threads.
   * Step 2 will replace this with a fuller plan + tasks UI.
   */
  function addJobProgressMessage(jobId, playgroundId, payload) {
    removeWelcome();

    const msg = document.createElement('div');
    msg.className = 'msg msg-system';
    msg.dataset.jobId = jobId;

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble progress-card';

    const title = document.createElement('div');
    title.className = 'progress-card-title';
    title.textContent = '🛠️ Job started';

    const body = document.createElement('div');
    body.className = 'progress-card-body';
    body.textContent = '계획을 세우고, 단계별로 작업을 시작합니다…';

    const meta = document.createElement('div');
    meta.className = 'progress-card-meta';
    meta.textContent = `job ${jobId.slice(0, 8)} · playground ${playgroundId?.slice(0, 8) ?? '?'} · ${payload?.client || 'current client'}`;

    const status = document.createElement('div');
    status.className = 'msg-status';
    status.innerHTML = '<span class="dot dot-waiting"></span> queued';

    const timer = document.createElement('div');
    timer.className = 'progress-timer';
    timer.textContent = '0:00 elapsed';

    const consoleLink = document.createElement('a');
    consoleLink.className = 'progress-dashboard-link';
    consoleLink.textContent = '📊 View in Inspect Console →';
    consoleLink.href = '#';
    consoleLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({
        type: 'inspect-open-url',
        url: `http://127.0.0.1:4174/jobs/${jobId}`,
      });
    });

    bubble.appendChild(title);
    bubble.appendChild(timer);
    bubble.appendChild(body);
    bubble.appendChild(meta);
    bubble.appendChild(consoleLink);
    bubble.appendChild(status);

    msg.appendChild(bubble);
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return msg;
  }

  function startHttpJobPolling(jobId) {
    // Reset the legacy currentRequestId so older flows don't race.
    currentRequestId = null;
    const startedAt = Date.now();
    const POLL_MS = 3000;
    const TIMEOUT_MS = 30 * 60 * 1000;
    // 'complete' 는 announce 후 즉시 finishLoop — Promote 클릭은 user
    // 가 직접 fetch 호출이라 polling 이 더 봐줄 필요 없음. (Slack 의
    // pollJobUntilDoneInner 와 동일 정책: molly.js:1424 의 return.)
    const TERMINAL = new Set(['complete', 'cancelled']);
    let planCardShown = false;
    /** @type {Map<string, string>} taskId → last announced status */
    const announcedTaskState = new Map();
    /** @type {Set<string>} job-level state announcements (qa-landed, completed, paused) */
    const announcedJobStates = new Set();

    // Reload sniff: sidepanel 새로고침 후 같은 jobId 가 다시 폴링될 때
    // chat 에 이미 들어가 있는 카드를 다시 만들지 않게 dedupe Set 을 prefill.
    if (messagesEl.querySelector(`.msg-system[data-qa-card-job-id="${CSS.escape(jobId)}"]`)) {
      announcedJobStates.add('qa-landed');
    }
    if (messagesEl.querySelector(`.msg-system[data-promote-card-job-id="${CSS.escape(jobId)}"]`)) {
      announcedJobStates.add('completed');
    }
    if (messagesEl.querySelector(`.msg-system[data-paused-card-job-id="${CSS.escape(jobId)}"]`)) {
      announcedJobStates.add('paused');
    }
    if (messagesEl.querySelector(`.msg-system[data-cancelled-card-job-id="${CSS.escape(jobId)}"]`)) {
      announcedJobStates.add('cancelled');
    }
    messagesEl
      .querySelectorAll(`.msg-system[data-task-transition-id]`)
      .forEach((el) => {
        const tid = el.dataset.taskTransitionId;
        const status = el.dataset.taskTransitionStatus;
        if (tid && status) announcedTaskState.set(tid, status);
      });

    const finishLoop = () => {
      currentJobInProgress = false;
      currentJobId = null;
      updateSendState();
    };

    const poll = async () => {
      if (Date.now() - startedAt > TIMEOUT_MS) {
        finishLoop();
        return;
      }
      const baseUrl = await getServerUrl();
      let job = null;
      try {
        const res = await fetch(`${baseUrl}/api/job/${encodeURIComponent(jobId)}`);
        if (res.ok) {
          const data = await res.json();
          job = data?.job ?? null;
        }
      } catch {
        /* network glitch — retry next tick */
      }
      const card = messagesEl.querySelector(
        `.msg-system[data-job-id="${CSS.escape(jobId)}"] .progress-card`,
      );
      if (job && card) {
        const body = card.querySelector('.progress-card-body');
        const status = card.querySelector('.msg-status');
        const timer = card.querySelector('.progress-timer');
        const reviewed = (job.tasks || []).filter((t) => t.status === 'reviewed').length;
        const total = (job.tasks || []).length;
        const cur = (job.tasks || []).find((t) => t.id === job.currentTaskId);
        const phaseCopy = jobStatusToCopy(job, cur, reviewed, total);
        if (body) body.textContent = phaseCopy;
        if (status) {
          status.innerHTML = `<span class="dot ${jobStatusDotClass(job.status)}"></span> ${job.status}`;
        }
        if (timer) {
          const elapsed = Date.now() - startedAt;
          const min = Math.floor(elapsed / 60_000);
          const sec = Math.floor((elapsed % 60_000) / 1000);
          timer.textContent = `${min}:${String(sec).padStart(2, '0')} elapsed · ${reviewed}/${total} reviewed`;
        }
      }
      // Phase 2 Step 2: when the decomposer lands a plan, append a
      // plan-approval card with [✅ 승인] / [✏️ 다시 계획] / [❌ 취소]
      // buttons. Same shape as molly's Slack plan, scaled to the
      // sidepanel's narrower column.
      if (job && job.status === 'planning' && !planCardShown) {
        planCardShown = true;
        addPlanApprovalCard(job);
      }
      // Per-task transitions — Slack 의 pollJobUntilDoneInner 미러.
      // 통과/실패/건너뜀이 발생할 때마다 chat 에 카드를 띄우고, 같은
      // task의 후속 트랜지션은 in-place 업데이트.
      const ANNOUNCEABLE = new Set(['running', 'committed', 'reviewed', 'failed', 'skipped']);
      if (job && Array.isArray(job.tasks)) {
        for (let i = 0; i < job.tasks.length; i++) {
          const t = job.tasks[i];
          if (!t?.id) continue;
          if (!ANNOUNCEABLE.has(t.status)) continue;
          if (announcedTaskState.get(t.id) === t.status) continue;
          const existed = announcedTaskState.has(t.id);
          if (existed) {
            updateTaskTransitionMessage(t, i, job.tasks.length, jobId);
          } else {
            addTaskTransitionMessage(t, i, job.tasks.length, jobId);
          }
          announcedTaskState.set(t.id, t.status);
        }
      }

      // Paused state — Slack 의 paused 처리 미러 (molly.js:1373-1398).
      // pausedReason 을 surface 하고 dedupe. 재개되면 set 에서 제거해
      // 다음에 paused 진입 시 다시 announce.
      if (job && job.status === 'paused' && !announcedJobStates.has('paused')) {
        announcedJobStates.add('paused');
        addPausedMessage(job);
      }
      if (job && job.status !== 'paused' && announcedJobStates.has('paused')) {
        announcedJobStates.delete('paused');
      }

      // Task 3: cancelled 카드 — 외부 cancel (Playground UI / curl) 시 사용자에게 명시.
      if (job && job.status === 'cancelled' && !announcedJobStates.has('cancelled')) {
        announcedJobStates.add('cancelled');
        addCancelledMessage(job);
      }

      if (job && job.status === 'qa') {
        if (!announcedJobStates.has('qa-landed')) {
          announcedJobStates.add('qa-landed');
          addQaCompletionMessage(job);
        } else {
          // 이미 카드는 떠 있음. rerun 후 qaAutoResult 가 placeholder
          // ('재실행 중…') → 실 결과로 교체될 때 카드를 in-place update.
          updateQaCompletionMessage(job);
        }
      }

      if (job && job.status === 'complete' && !announcedJobStates.has('completed')) {
        announcedJobStates.add('completed');
        addCompletePromoteMessage(job);
      }

      if (job && TERMINAL.has(job.status)) {
        if (card) {
          const status = card.querySelector('.msg-status');
          if (status) {
            const ok = job.status === 'complete';
            status.innerHTML = `<span class="dot ${ok ? 'dot-success' : 'dot-error'}"></span> ${ok ? 'complete' : 'cancelled'}`;
          }
        }
        finishLoop();
        return;
      }
      setTimeout(poll, POLL_MS);
    };
    setTimeout(poll, 1500);
  }

  /**
   * Plan card rendered when a job hits status=planning. Mirrors the
   * Slack molly plan blocks: tasks list + risks + qa strategy +
   * action buttons. The buttons hit the orchestrator API directly so
   * we don't need a round-trip through background.js.
   */
  function addPlanApprovalCard(job) {
    const baseUrlPromise = getServerUrl();
    const wrap = document.createElement('div');
    wrap.className = 'msg msg-system';
    wrap.dataset.jobPlanId = job.id;

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble plan-card';

    const title = document.createElement('div');
    title.className = 'progress-card-title';
    title.textContent = `📋 작업 계획 (${(job.tasks || []).length} tasks)`;
    bubble.appendChild(title);

    const taskList = document.createElement('ol');
    taskList.style.margin = '8px 0 8px 0';
    taskList.style.paddingLeft = '20px';
    taskList.style.fontSize = '12px';
    for (const t of job.tasks || []) {
      const li = document.createElement('li');
      li.style.marginBottom = '6px';
      const titleEl = document.createElement('strong');
      titleEl.textContent = t.title || '(no title)';
      const desc = document.createElement('div');
      desc.style.color = 'var(--text-muted, #888)';
      desc.style.marginTop = '2px';
      desc.textContent = (t.description || '').split('\n')[0]?.slice(0, 200) ?? '';
      li.appendChild(titleEl);
      li.appendChild(desc);
      taskList.appendChild(li);
    }
    bubble.appendChild(taskList);

    if (Array.isArray(job.risksKo) && job.risksKo.length > 0) {
      const risks = document.createElement('div');
      risks.style.padding = '6px 8px';
      risks.style.background = 'rgba(245, 194, 107, 0.10)';
      risks.style.border = '1px solid rgba(245, 194, 107, 0.45)';
      risks.style.borderRadius = '4px';
      risks.style.fontSize = '11px';
      risks.style.color = 'var(--text-warn, #8a5a00)';
      const head = document.createElement('strong');
      head.textContent = '⚠️ 주의사항';
      risks.appendChild(head);
      const ol = document.createElement('ol');
      ol.style.margin = '4px 0 0';
      ol.style.paddingLeft = '20px';
      for (const r of job.risksKo) {
        const li = document.createElement('li');
        li.textContent = r;
        ol.appendChild(li);
      }
      risks.appendChild(ol);
      bubble.appendChild(risks);
    }

    if (job.qaStrategy) {
      const qa = document.createElement('div');
      qa.style.marginTop = '8px';
      qa.style.padding = '6px 8px';
      qa.style.background = 'rgba(20, 83, 182, 0.06)';
      qa.style.border = '1px solid rgba(20, 83, 182, 0.18)';
      qa.style.borderRadius = '4px';
      qa.style.fontSize = '11px';
      qa.style.color = 'var(--text-info, #1453b6)';
      qa.innerHTML = `<strong>🧪 검증 단계:</strong> ${job.qaStrategy}`;
      if (job.qaRationaleKo) {
        const r = document.createElement('div');
        r.style.color = 'var(--text-muted, #888)';
        r.style.marginTop = '2px';
        r.textContent = job.qaRationaleKo;
        qa.appendChild(r);
      }
      bubble.appendChild(qa);
    }

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '6px';
    actions.style.marginTop = '10px';
    actions.style.flexWrap = 'wrap';

    const approveBtn = document.createElement('button');
    approveBtn.type = 'button';
    approveBtn.textContent = '✅ 승인하고 시작';
    approveBtn.className = 'plan-btn plan-btn-primary';

    const redecBtn = document.createElement('button');
    redecBtn.type = 'button';
    redecBtn.textContent = '✏️ 다시 계획';
    redecBtn.className = 'plan-btn';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = '❌ 취소';
    cancelBtn.className = 'plan-btn plan-btn-danger';

    const lockButtons = (note) => {
      approveBtn.disabled = true;
      redecBtn.disabled = true;
      cancelBtn.disabled = true;
      if (note) {
        const stamp = document.createElement('div');
        stamp.style.marginTop = '6px';
        stamp.style.fontSize = '11px';
        stamp.style.color = 'var(--text-muted, #888)';
        stamp.textContent = note;
        bubble.appendChild(stamp);
      }
    };

    approveBtn.addEventListener('click', async () => {
      lockButtons('✅ 승인 처리 중…');
      try {
        const baseUrl = await baseUrlPromise;
        await fetch(
          `${baseUrl}/api/job/${encodeURIComponent(job.id)}/approve-plan`,
          { method: 'POST' },
        );
      } catch (err) {
        addSystemMessage(`승인 실패: ${err.message}`, 'error');
      }
    });

    redecBtn.addEventListener('click', async () => {
      const feedback = window.prompt(
        '재계획 피드백 (선택). 비워두고 OK 누르면 자유롭게 다시 나눕니다.',
        '',
      );
      if (feedback === null) return; // user cancelled prompt
      lockButtons('🔁 재계획 진행 중…');
      try {
        const baseUrl = await baseUrlPromise;
        await fetch(
          `${baseUrl}/api/job/${encodeURIComponent(job.id)}/decompose`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(feedback ? { feedback } : {}),
          },
        );
      } catch (err) {
        addSystemMessage(`재계획 실패: ${err.message}`, 'error');
      }
    });

    cancelBtn.addEventListener('click', async () => {
      if (!window.confirm('이 작업을 취소할까요?')) return;
      lockButtons('❌ 취소 처리 중…');
      try {
        const baseUrl = await baseUrlPromise;
        await fetch(
          `${baseUrl}/api/job/${encodeURIComponent(job.id)}/cancel`,
          { method: 'POST' },
        );
      } catch (err) {
        addSystemMessage(`취소 실패: ${err.message}`, 'error');
      }
    });

    actions.appendChild(approveBtn);
    actions.appendChild(redecBtn);
    actions.appendChild(cancelBtn);
    bubble.appendChild(actions);

    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  /**
   * Phase 2 Step 3: per-task transition card. Slack의 taskTransitionPayload
   * 미러. 같은 task의 후속 트랜지션은 updateTaskTransitionMessage 가
   * 같은 카드를 in-place 업데이트.
   */
  // Task 1: dirty-check helper — QA card 의 computeQaCardHash 패턴 mirror.
  function computeTaskTransitionHash(task, idx, total) {
    return JSON.stringify({
      title: task.title ?? null,
      status: task.status ?? null,
      idx,
      total,
      notes: task.status === 'failed' ? (task.review?.notes ?? null) : null,
    });
  }

  function addTaskTransitionMessage(task, idx, total, jobId) {
    const wrap = document.createElement('div');
    wrap.className = 'msg msg-system';
    wrap.dataset.taskTransitionId = task.id;
    wrap.dataset.taskTransitionStatus = task.status;

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble task-transition-card';
    bubble.dataset.taskTransitionStatus = task.status;
    renderTaskTransitionBody(bubble, task, idx, total, jobId);
    // 첫 렌더 후 hash 저장 — 후속 polling 이 즉시 재렌더하지 않게.
    wrap.dataset.lastHash = computeTaskTransitionHash(task, idx, total);

    // Task 4: reviewed/skipped 카드는 처음부터 collapsed 상태로 추가.
    if (task.status === 'reviewed' || task.status === 'skipped') {
      wrap.dataset.collapsed = 'true';
    }
    // Task 4: click toggle collapse/expand.
    wrap.addEventListener('click', () => {
      if (wrap.dataset.collapsed === 'true') {
        delete wrap.dataset.collapsed;
      } else if (
        wrap.querySelector('.task-transition-card')?.dataset.taskTransitionStatus === 'reviewed' ||
        wrap.querySelector('.task-transition-card')?.dataset.taskTransitionStatus === 'skipped'
      ) {
        wrap.dataset.collapsed = 'true';
      }
    });

    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function updateTaskTransitionMessage(task, idx, total, jobId) {
    const wrapSel = `.msg-system[data-task-transition-id="${CSS.escape(task.id)}"]`;
    const wrap = messagesEl.querySelector(wrapSel);
    if (!wrap) {
      addTaskTransitionMessage(task, idx, total, jobId);
      return;
    }
    // Task 1: dirty-check — 변동 없으면 재렌더 skip (race + closure leak 방지).
    const hash = computeTaskTransitionHash(task, idx, total);
    if (wrap.dataset.lastHash === hash) return;
    wrap.dataset.lastHash = hash;
    wrap.dataset.taskTransitionStatus = task.status;
    const bubble = wrap.querySelector('.task-transition-card');
    if (!bubble) {
      addTaskTransitionMessage(task, idx, total, jobId);
      return;
    }
    bubble.dataset.taskTransitionStatus = task.status;
    // Task 4: reviewed 상태로 전환 시 collapsed 표시 (클릭으로 toggle).
    if (task.status === 'reviewed' || task.status === 'skipped') {
      if (!wrap.dataset.collapsed) {
        wrap.dataset.collapsed = 'true';
      }
    }
    bubble.innerHTML = '';
    renderTaskTransitionBody(bubble, task, idx, total, jobId);
  }

  /**
   * Phase 2 Step 3 (paused): job.status=paused 진입 시 1회. Slack 의
   * paused 처리 미러. 재개되면 announcedJobStates 에서 'paused' 가
   * 빠지므로 다음에 다시 paused 되면 또 한 번 카드 노출.
   */
  function addPausedMessage(job) {
    const wrap = document.createElement('div');
    wrap.className = 'msg msg-system';
    wrap.dataset.pausedCardJobId = job.id;
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble task-transition-card';
    const line = document.createElement('div');
    line.className = 'task-transition-line';
    line.textContent = `⏸️ 작업 일시정지: ${job.pausedReason || '(원인 없음)'}`;
    bubble.appendChild(line);
    const hint = document.createElement('div');
    hint.className = 'task-transition-stamp';
    hint.textContent = 'Playground 또는 Inspect Console 에서 확인 후 resume / cancel 가능합니다.';
    bubble.appendChild(hint);
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  /**
   * Task 3: job.status=cancelled 진입 시 1회. 외부 cancel (Playground UI /
   * curl) 시 사이드패널 chat 에 명시. addPausedMessage 와 동일 패턴.
   */
  function addCancelledMessage(job) {
    const wrap = document.createElement('div');
    wrap.className = 'msg msg-system';
    wrap.dataset.cancelledCardJobId = job.id;
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble task-transition-card';
    const line = document.createElement('div');
    line.className = 'task-transition-line';
    line.textContent = `❌ 작업이 취소되었습니다 (job: ${job.id?.slice(0, 8) ?? '?'})`;
    bubble.appendChild(line);
    if (job.cancelMeta?.reasonText) {
      const reason = document.createElement('div');
      reason.className = 'task-transition-notes';
      reason.textContent = job.cancelMeta.reasonText.slice(0, 240);
      bubble.appendChild(reason);
    }
    const hint = document.createElement('div');
    hint.className = 'task-transition-stamp';
    hint.textContent = 'Playground 에서 새 작업을 시작하거나 취소 사유를 확인하세요.';
    bubble.appendChild(hint);
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  /**
   * Phase 2 Step 4 (1/2): job.status=qa 진입 시 1회. QA 결과 요약 +
   * [QA 통과] (+ 실패 시 [자동 QA 재실행]) 버튼.
   */
  function computeQaCardHash(job) {
    const reviewedCount = (job.tasks || []).filter((t) => t.status === 'reviewed').length;
    const skippedCount = (job.tasks || []).filter((t) => t.status === 'skipped').length;
    const total = (job.tasks || []).length;
    return JSON.stringify({
      reviewedCount,
      skippedCount,
      total,
      qaResult: job.qaAutoResult ?? null,
      targetRoute: job.targetRoute ?? null,
      qaStrategy: job.qaStrategy ?? null,
    });
  }

  function addQaCompletionMessage(job) {
    const wrap = document.createElement('div');
    wrap.className = 'msg msg-system';
    wrap.dataset.qaCardJobId = job.id;
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble qa-card';
    renderQaCompletionBody(bubble, job);
    // 첫 렌더 후 hash 저장 — 첫 polling 이 즉시 재렌더하지 않게.
    bubble.dataset.lastHash = computeQaCardHash(job);
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function updateQaCompletionMessage(job) {
    const sel = `.msg-system[data-qa-card-job-id="${CSS.escape(job.id)}"] .qa-card`;
    const bubble = messagesEl.querySelector(sel);
    if (!bubble) {
      addQaCompletionMessage(job);
      return;
    }
    // Dirty check — 폴링이 매 3초 호출해도 입력이 변하지 않으면 skip.
    // 매번 무조건 innerHTML='' 하면 사용자 버튼 클릭 race + stale closure
    // pendingStamp leak 발생.
    const hash = computeQaCardHash(job);
    if (bubble.dataset.lastHash === hash) return;
    bubble.dataset.lastHash = hash;
    bubble.innerHTML = '';
    renderQaCompletionBody(bubble, job);
  }

  function renderQaCompletionBody(bubble, job) {
    const reviewedCount = (job.tasks || []).filter((t) => t.status === 'reviewed').length;
    const skippedCount = (job.tasks || []).filter((t) => t.status === 'skipped').length;
    const total = (job.tasks || []).length;
    const qaResult = job.qaAutoResult;
    const qaPassed = qaResult?.passed === true;
    const isRerunning = qaResult?.notes === '재실행 중…';

    const summary = document.createElement('div');
    summary.className = 'qa-summary';
    const lines = [];
    lines.push(`🎉 작업 완료! (job: ${job.id?.slice(0, 8) ?? '?'})`);
    lines.push(
      `• 완료 task: ${reviewedCount}/${total}` +
        (skippedCount > 0 ? ` (스킵 ${skippedCount})` : ''),
    );
    if (isRerunning) {
      lines.push(`• 자동 QA: 🔁 재실행 중…`);
    } else if (qaResult) {
      const verdictClass = qaPassed ? 'qa-result-pass' : 'qa-result-fail';
      lines.push(
        `• 자동 QA: ${qaPassed ? '✅ 통과' : '⚠️ 실패'} — ${(qaResult.notes || '').slice(0, 120)}`,
      );
      summary.classList.add(verdictClass);
    } else if (job.qaStrategy) {
      lines.push(`• 자동 QA: ${job.qaStrategy} (실행 대기 중)`);
    }
    if (job.targetRoute) lines.push(`• 결과 페이지: ${job.targetRoute}`);
    summary.textContent = lines.join('\n');
    bubble.appendChild(summary);

    const hint = document.createElement('div');
    hint.className = 'task-transition-stamp';
    hint.textContent = '✅ QA 통과 를 누르면 작업이 complete 으로 넘어가고 Promote 버튼이 보입니다.';
    bubble.appendChild(hint);

    const actions = document.createElement('div');
    actions.className = 'qa-actions';

    const passBtn = document.createElement('button');
    passBtn.type = 'button';
    passBtn.textContent = '✅ QA 통과';
    passBtn.className = 'plan-btn plan-btn-primary';

    const showRerun = qaResult && !qaPassed && !isRerunning;
    const rerunBtn = showRerun ? document.createElement('button') : null;
    if (rerunBtn) {
      rerunBtn.type = 'button';
      rerunBtn.textContent = '🔁 자동 QA 재실행';
      rerunBtn.className = 'plan-btn';
    }

    let pendingStamp = null;
    const lock = (note) => {
      passBtn.disabled = true;
      if (rerunBtn) rerunBtn.disabled = true;
      pendingStamp = document.createElement('div');
      pendingStamp.className = 'task-transition-stamp';
      pendingStamp.textContent = note;
      bubble.appendChild(pendingStamp);
    };
    const unlockOnError = () => {
      passBtn.disabled = false;
      if (rerunBtn) rerunBtn.disabled = false;
      if (pendingStamp && pendingStamp.parentNode) {
        pendingStamp.parentNode.removeChild(pendingStamp);
      }
      pendingStamp = null;
    };

    passBtn.addEventListener('click', async () => {
      lock('✅ QA 통과 처리 중…');
      try {
        const baseUrl = await getServerUrl();
        const res = await fetch(
          `${baseUrl}/api/job/${encodeURIComponent(job.id)}/mark-qa-pass`,
          { method: 'POST' },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          addSystemMessage(`QA 통과 실패: ${res.status} ${text.slice(0, 120)}`, 'error');
          unlockOnError();
        } else {
          // status qa→complete 으로 넘어가면 qa-update 분기가 더 안 타서
          // bubble 이 재렌더 안 됨. 15s 후 fallback unlock.
          setTimeout(() => {
            if (pendingStamp && pendingStamp.parentNode === bubble) unlockOnError();
          }, 15000);
        }
      } catch (err) {
        addSystemMessage(`QA 통과 실패: ${err.message}`, 'error');
        unlockOnError();
      }
    });

    if (rerunBtn) {
      rerunBtn.addEventListener('click', async () => {
        lock('🔁 자동 QA 재실행 중…');
        try {
          const baseUrl = await getServerUrl();
          const res = await fetch(
            `${baseUrl}/api/job/${encodeURIComponent(job.id)}/rerun-qa`,
            { method: 'POST' },
          );
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            addSystemMessage(`QA 재실행 실패: ${res.status} ${text.slice(0, 120)}`, 'error');
            unlockOnError();
          } else {
            // 서버 idempotent no-op / 폴링 stale 시 placeholder 가 안 찍히면
            // updateQaCompletionMessage 가 안 불려 영구 잠금. 15s fallback.
            setTimeout(() => {
              if (pendingStamp && pendingStamp.parentNode === bubble) unlockOnError();
            }, 15000);
          }
          // 성공 시 폴링이 placeholder 결과를 잡아 updateQaCompletionMessage
          // 가 실행돼 카드 전체가 갈림.
        } catch (err) {
          addSystemMessage(`QA 재실행 실패: ${err.message}`, 'error');
          unlockOnError();
        }
      });
    }

    actions.appendChild(passBtn);
    if (rerunBtn) actions.appendChild(rerunBtn);
    bubble.appendChild(actions);
  }

  /**
   * Phase 2 Step 4 (2/2): job.status=complete 진입 시 1회. Promote
   * 버튼 + Playground 링크. PR 생성 성공 시 같은 카드를 PR URL 로
   * in-place 업데이트하고 finishLoop() 호출.
   */
  function addCompletePromoteMessage(job) {
    const wrap = document.createElement('div');
    wrap.className = 'msg msg-system';
    wrap.dataset.promoteCardJobId = job.id;
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble promote-card';

    const headline = document.createElement('div');
    headline.className = 'promote-summary';
    headline.textContent = `🎉 ${job.id?.slice(0, 8) ?? '?'} 완료 처리됨 — Promote 하시겠어요?`;
    bubble.appendChild(headline);

    const note = document.createElement('div');
    note.className = 'task-transition-stamp';
    note.textContent = `Promote 하면 Playground (${job.playgroundId?.slice(0, 8) ?? '?'}) 의 모든 commit 이 prod repo 의 새 PR 로 올라갑니다. 머지는 GitHub 에서 직접.`;
    bubble.appendChild(note);

    const actions = document.createElement('div');
    actions.className = 'promote-actions';

    const promoteBtn = document.createElement('button');
    promoteBtn.type = 'button';
    promoteBtn.textContent = '🚀 Promote (PR 생성)';
    promoteBtn.className = 'plan-btn plan-btn-primary';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.textContent = '📺 Playground 보기';
    openBtn.className = 'plan-btn';

    let pendingStamp = null;
    const lock = (text) => {
      promoteBtn.disabled = true;
      pendingStamp = document.createElement('div');
      pendingStamp.className = 'task-transition-stamp';
      pendingStamp.textContent = text;
      bubble.appendChild(pendingStamp);
    };
    const unlockOnError = () => {
      promoteBtn.disabled = false;
      if (pendingStamp && pendingStamp.parentNode) {
        pendingStamp.parentNode.removeChild(pendingStamp);
      }
      pendingStamp = null;
    };

    promoteBtn.addEventListener('click', async () => {
      if (!job.playgroundId) {
        addSystemMessage('Promote 실패: playground id 없음', 'error');
        return;
      }
      lock('🚀 Promote 진행 중 — PR 생성 중…');
      try {
        const baseUrl = await getServerUrl();
        const res = await fetch(
          `${baseUrl}/api/playground/${encodeURIComponent(job.playgroundId)}/promote`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          addSystemMessage(`Promote 실패: ${res.status} ${text.slice(0, 200)}`, 'error');
          unlockOnError();
          return;
        }
        // server.js:2969-2985 의 promote 핸들러 응답: top-level prUrl
        // (정확히는 spread of promotePlayground 결과 — {ok, playground,
        // patches, ..., prUrl, dryRun}). prUrl 평면 위치라 result.prUrl
        // 분기 불필요.
        const data = await res.json().catch(() => ({}));
        const prUrl = data?.prUrl;
        // pendingStamp 를 결과 메시지로 갈음 — lock 상태 유지 (성공 시
        // 두 번째 클릭 시도 시 또 PR 생성하면 안 됨). polling 은 이미
        // finishLoop 됐으므로 카드 in-place update 도 없음.
        if (pendingStamp && pendingStamp.parentNode) {
          pendingStamp.parentNode.removeChild(pendingStamp);
        }
        pendingStamp = null;
        const result = document.createElement('div');
        result.className = 'task-transition-stamp';
        if (prUrl) {
          result.appendChild(document.createTextNode('✅ Promote 완료! 🔗 '));
          const a = document.createElement('a');
          a.href = prUrl;
          a.textContent = prUrl;
          a.target = '_blank';
          a.rel = 'noreferrer';
          result.appendChild(a);
          result.appendChild(document.createTextNode(' — GitHub 에서 머지하면 끝.'));
          bubble.appendChild(result);
          // Task 2: PR URL 있음 → 영구 lock (concurrent click = 다중 PR 방지).
          promoteBtn.disabled = true;
        } else {
          result.textContent = '✅ Promote 완료 (PR URL 못 받음 — Playground 헤더에서 확인하세요).';
          bubble.appendChild(result);
          // Task 2: PR URL 못 받음 → 30s safety unlock. idempotent 응답
          // 또는 stale 케이스에서 사용자 복구 경로를 열어 둠.
          setTimeout(() => {
            if (promoteBtn.disabled) {
              promoteBtn.disabled = false;
              const note = document.createElement('div');
              note.className = 'task-transition-stamp';
              note.textContent = '복구: PR URL 못 받아 다시 시도 가능합니다.';
              bubble.appendChild(note);
            }
          }, 30000);
        }
      } catch (err) {
        addSystemMessage(`Promote 실패: ${err.message}`, 'error');
        unlockOnError();
      }
    });

    openBtn.addEventListener('click', () => {
      const url = `http://localhost:4180/p/${encodeURIComponent(job.playgroundId)}`;
      chrome.runtime.sendMessage({ type: 'inspect-open-url', url });
    });

    actions.appendChild(promoteBtn);
    actions.appendChild(openBtn);
    bubble.appendChild(actions);

    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderTaskTransitionBody(bubble, task, idx, total, jobId) {
    const num = `${idx + 1}/${total}`;
    const title = task.title || '(no title)';
    const line = document.createElement('div');
    line.className = 'task-transition-line';
    switch (task.status) {
      case 'running':
        line.textContent = `🔧 ${num} ${title} — 작업 중…`;
        break;
      case 'committed':
        line.textContent = `🔍 ${num} ${title} — 검토 중…`;
        break;
      case 'reviewed':
        line.textContent = `✅ ${num} ${title} — 통과`;
        break;
      case 'skipped':
        line.textContent = `⏭ ${num} ${title} — 건너뜀`;
        break;
      case 'failed': {
        line.textContent = `❌ ${num} ${title} — 검토 실패`;
        const notesEl = document.createElement('div');
        notesEl.className = 'task-transition-notes';
        notesEl.textContent = task.review?.notes?.slice(0, 240) || '(원인 없음)';
        bubble.appendChild(line);
        bubble.appendChild(notesEl);
        appendTaskFailActions(bubble, task, jobId);
        return;
      }
      default:
        line.textContent = `${task.status} ${num} ${title}`;
    }
    bubble.appendChild(line);
  }

  function appendTaskFailActions(bubble, task, jobId) {
    // Action reason picker — Slice 3 Task 2. 액션 사유를 enum 으로
    // capture 하기 위해 인라인 select. 강제 X (인지 부담 줄임), 미선택
    // 시 reason undefined 로 server 가 normalizeReason → null 처리.
    const pickerWrap = document.createElement('div');
    pickerWrap.className = 'task-fail-reason-picker';
    const pickerLabel = document.createElement('span');
    pickerLabel.className = 'task-fail-reason-label';
    pickerLabel.textContent = '사유:';
    pickerWrap.appendChild(pickerLabel);
    const picker = document.createElement('select');
    picker.className = 'task-fail-reason-select';
    const reasonOptions = [
      ['', '(선택 안 함)'],
      ['syntax_error', '문법/타입 에러'],
      ['logic_error', '논리/구현 오류'],
      ['scope_creep', '범위 벗어남'],
      ['partial', '부분 구현'],
      ['wrong_target', '잘못된 파일'],
      ['over_delivered', '오버 딜리버'],
      ['other', '기타'],
    ];
    for (const [v, label] of reasonOptions) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = label;
      picker.appendChild(opt);
    }
    pickerWrap.appendChild(picker);
    bubble.appendChild(pickerWrap);

    const actions = document.createElement('div');
    actions.className = 'task-fail-actions';

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.textContent = '🔁 재시도';
    retryBtn.className = 'plan-btn plan-btn-primary';

    const acceptBtn = document.createElement('button');
    acceptBtn.type = 'button';
    acceptBtn.textContent = '✅ 그대로 통과';
    acceptBtn.className = 'plan-btn';

    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.textContent = '⏭ 건너뛰기';
    skipBtn.className = 'plan-btn plan-btn-danger';

    let pendingStamp = null;
    const lock = (note) => {
      retryBtn.disabled = true;
      acceptBtn.disabled = true;
      skipBtn.disabled = true;
      pendingStamp = document.createElement('div');
      pendingStamp.className = 'task-transition-stamp';
      pendingStamp.textContent = note;
      bubble.appendChild(pendingStamp);
    };
    const unlockOnError = () => {
      retryBtn.disabled = false;
      acceptBtn.disabled = false;
      skipBtn.disabled = false;
      if (pendingStamp && pendingStamp.parentNode) {
        pendingStamp.parentNode.removeChild(pendingStamp);
      }
      pendingStamp = null;
    };

    const post = async (path, label) => {
      lock(`${label} 처리 중…`);
      try {
        const baseUrl = await getServerUrl();
        const reason = picker.value || undefined;
        const res = await fetch(
          `${baseUrl}/api/job/${encodeURIComponent(jobId)}/${path}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId: task.id, reason }),
          },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          addSystemMessage(`${label} 실패: ${res.status} ${text.slice(0, 120)}`, 'error');
          unlockOnError();
        }
        // 성공 시 폴링이 새 status 를 잡아 카드를 in-place update 하면
        // bubble.innerHTML = '' 로 stamp/buttons 가 통째로 갈리며 자동
        // 회수됨. 다만 서버가 idempotent no-op 응답을 주거나 폴링이
        // stale 한 edge case 에서는 영구 잠금이 될 수 있어 15s safety
        // timer 로 fallback 복구.
        setTimeout(() => {
          if (pendingStamp && pendingStamp.parentNode === bubble) {
            unlockOnError();
          }
        }, 15000);
      } catch (err) {
        addSystemMessage(`${label} 실패: ${err.message}`, 'error');
        unlockOnError();
      }
    };

    retryBtn.addEventListener('click', () => void post('retry-task', '🔁 재시도'));
    acceptBtn.addEventListener('click', () => void post('accept-task', '✅ 그대로 통과'));
    skipBtn.addEventListener('click', () => void post('skip-task', '⏭ 건너뛰기'));

    actions.appendChild(retryBtn);
    actions.appendChild(acceptBtn);
    actions.appendChild(skipBtn);
    bubble.appendChild(actions);
  }

  function jobStatusToCopy(job, currentTask, reviewed, total) {
    switch (job.status) {
      case 'decomposing':
        return '계획을 세우는 중…';
      case 'planning':
        return '계획이 도착했어요. 곧 자동 승인됩니다.';
      case 'delegating':
        return currentTask
          ? `🔧 ${currentTask.title} (작업 중)`
          : `${reviewed}/${total} 작업 완료`;
      case 'reviewing':
        return currentTask
          ? `🔍 ${currentTask.title} (검토 중)`
          : '검토 중…';
      case 'qa':
        return job.qaAutoResult
          ? `🧪 자동 QA: ${job.qaAutoResult.passed ? '✅ 통과' : '⚠️ 실패'} — ${(job.qaAutoResult.notes || '').slice(0, 80)}`
          : '🧪 자동 QA 실행 중…';
      case 'complete':
        return '🎉 작업 완료';
      case 'cancelled':
        return '❌ 취소됨';
      case 'paused':
        return `⏸️ ${job.pausedReason || '일시정지'}`;
      default:
        return job.status;
    }
  }

  function jobStatusDotClass(status) {
    switch (status) {
      case 'complete':
        return 'dot-success';
      case 'cancelled':
      case 'paused':
        return 'dot-error';
      default:
        return 'dot-waiting';
    }
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
    dashLink.textContent = '📊 View in Inspect Console →';
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
    approveBtn.textContent = '✓ Approve & Create PR';
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
    // Block send while a Job pipeline run is in flight on the current
    // playground — the orchestrator would 409 anyway, and submitting
    // again here just creates UI noise.
    sendBtn.disabled =
      !hasText || isSubmitting || !!pendingExecutionPlan || currentJobInProgress;
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

  async function performSubmit(plan) {
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

    // 분류 게이트 — Job 모드든 stateless 든 사용자 입력이 일반 대화일
    // 가능성. classifier 가 chat/status_query 로 분류하면 잡/change-request
    // 안 만들고 답만 surface. classifier 실패 시 안전 폴백 = code_change
    // (사용자가 PRD 던졌는데 네트워크 에러로 chat 응답 받으면 더 이상함).
    const userInput = String(payload.userInput || payload.text || '').trim();
    if (userInput) {
      // Typing indicator — classifier + LLM 1-1.5s 동안 UX 신호.
      const thinking = showMollyThinking(messagesEl);

      try {
        const baseUrl = await getServerUrl();
        // Phase 3 Task 3.2 — /api/molly/respond → /api/intake.
        // 응답 shape: kind ∈ chat / status_query / code_change_clear /
        // code_change_ambiguous (4 종). code_change 분기는 _clear / _ambiguous
        // 로 명시화 — 기존 clarity 필드 검사 불필요.
        const r = await fetch(`${baseUrl}/api/intake`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: userInput, surface: 'chrome-ext', history: mollyChatHistory.slice() }),
        });
        thinking.dismiss();
        if (r.ok) {
          const data = await r.json();
          const kind = data?.kind;
          if (kind === 'chat' || kind === 'status_query') {
            addMollyChatMessage(data.response || '(빈 응답)', kind);
            return; // 잡/change-request 안 만듦
          }
          // code_change_ambiguous → clarifying Q 만 surface, 잡 안 만듦
          if (kind === 'code_change_ambiguous' && data?.clarifyingQuestion) {
            addMollyChatMessage(`🤔 ${data.clarifyingQuestion}`, 'clarify');
            return;
          }
          // code_change_clear → 기존 흐름 (job 생성). fall through.
        }
        // r.ok=false 면 fallback: code_change 진행 (사용자 의도 보호)
      } catch (err) {
        thinking.dismiss();
        console.warn('[molly] intake fetch failed, falling back to code_change:', err.message);
      }
    }

    isSubmitting = true;
    updateSendState();

    // Auto-create-on-send: if the selector is in auto mode, spin up
    // a fresh playground first so background.js doesn't fall through
    // to stateless. Failure here cancels the submit with an inline
    // error.
    try {
      await ensureEffectivePlayground();
    } catch (err) {
      isSubmitting = false;
      updateSendState();
      addSystemMessage(
        `Playground 자동 생성 실패: ${err.message?.slice(0, 200) ?? err}`,
        'error',
      );
      return;
    }

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

          if (response.mode === 'http-job' && response.jobId) {
            // Phase 2 / B Step 1+2: Chrome ext routes through the
            // unified Job pipeline. Sidepanel surfaces plan + buttons
            // (Step 2) instead of auto-approving.
            currentJobId = response.jobId;
            currentJobInProgress = true;
            addJobProgressMessage(response.jobId, response.playgroundId, payload);
            inputStatus.textContent = '';
            startHttpJobPolling(response.jobId);
            // Save lastPlaygroundId so next session defaults to reuse
            // (Slack thread parity: same task = same playground).
            if (response.playgroundId) {
              chrome.storage.local.set({ lastPlaygroundId: response.playgroundId });
            }
          } else if (response.mode === 'http' && response.requestId) {
            // Stateless / legacy path — single change-request, no Job.
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

  /**
   * True when the next submit will go through the unified Job pipeline
   * (decomposer + reviewer + QA) instead of the legacy single-shot
   * change-request. Decision: any non-stateless playground choice
   * (existing id or auto-create sentinel). The Job pipeline already
   * runs its own decomposer + risks + qaStrategy, so the legacy
   * clarification ceremony (Proceed / Adjust the plan) becomes
   * redundant — we skip it for job-mode submits.
   */
  function isJobModeSubmit() {
    const v = playgroundSelect?.value ?? '';
    return v !== ''; // '' = stateless; '__auto__' or real id = job mode
  }

  async function submit() {
    const text = promptInput.value.trim();
    if (!text) return;
    if (isSubmitting || pendingExecutionPlan) return;
    // Block submit while a job is still in flight on this playground;
    // the orchestrator would 409 with `job_active` anyway, but blocking
    // here keeps the UX clean.
    if (currentJobInProgress) {
      addSystemMessage(
        '현재 진행 중인 Job 이 있습니다. 끝나거나 취소될 때까지 기다려주세요.',
        'error',
      );
      return;
    }

    // Phase 3 Task 3.2 — intake 게이트 (element-selected 모드 포함).
    // submit() 의 진짜 entry point 에 게이트 — element 선택 상태에서 chat/
    // status 입력해도 plan 생성 흐름으로 안 빠지게. performSubmit 의
    // 게이트 (line ~3705) 는 plan 카드 *수락 후* 라 너무 늦음 (사용자가
    // 인사만 했는데 plan 부터 봐야 했던 버그). pendingClarification 중
    // 에는 우회 — 진행 중인 clarification 흐름 끊지 않게.
    //
    // UX (2026-04-30 피드백): 사용자 버블이 fetch 응답 후에야 그려져
    // "내 메시지가 전달됐나?" 헷갈림. intake 게이트 진입 즉시 사용자
    // 버블 + input 비우기 → thinking indicator → fetch 응답. 아래 분기
    // 와 plan 생성 흐름의 중복 addUserMessage 는 userMessageRendered
    // 플래그로 skip.
    let userMessageRendered = false;
    if (!pendingClarification) {
      addUserMessage(text, currentElement, selectedCapture);
      promptInput.value = '';
      promptInput.style.height = 'auto';
      userMessageRendered = true;

      const thinking = showMollyThinking(messagesEl);
      try {
        const baseUrl = await getServerUrl();
        const r = await fetch(`${baseUrl}/api/intake`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, surface: 'chrome-ext', history: mollyChatHistory.slice() }),
        });
        thinking.dismiss();
        if (r.ok) {
          const data = await r.json();
          const kind = data?.kind;
          if (kind === 'chat' || kind === 'status_query') {
            addMollyChatMessage(data.response || '(빈 응답)', kind);
            updateSendState();
            return;
          }
          if (kind === 'code_change_ambiguous' && data?.clarifyingQuestion) {
            addMollyChatMessage(`🤔 ${data.clarifyingQuestion}`, 'clarify');
            updateSendState();
            return;
          }
          // code_change_clear → fall through (기존 plan 생성 흐름)
        }
        // r.ok=false 면 fallback: plan 생성 (사용자 의도 보호)
      } catch (err) {
        thinking.dismiss();
        console.warn('[molly] intake gate failed in submit(), falling back to plan generation:', err.message);
      }
    }

    const activeContext = getActiveContext();
    if (!isJobModeSubmit() && shouldStartClarification(text, activeContext)) {
      const clarification = buildClarificationConfig(text, activeContext);
      pendingClarification = {
        initialPrompt: text,
        inferredIntent: clarification.intent,
        requestedDepth: inferClarificationDepth(text, activeContext),
        turns: 1,
      };
      if (!userMessageRendered) {
        addUserMessage(text, currentElement, selectedCapture);
        promptInput.value = '';
        promptInput.style.height = 'auto';
        userMessageRendered = true;
      }
      addClarificationMessage(clarification);
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

    if (!userMessageRendered) {
      addUserMessage(text, currentElement, selectedCapture);
      promptInput.value = '';
      promptInput.style.height = 'auto';
      userMessageRendered = true;
    }
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
