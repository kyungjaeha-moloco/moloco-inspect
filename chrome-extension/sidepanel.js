/**
 * Click-to-Inspect Side Panel
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
      chips.push('캡처 영역');
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
    prdSummaryTitle.textContent = prdContext.title || 'PRD에서 핵심 요구사항을 읽었어요';
    prdSummaryBody.textContent = prdContext.summary || '현재 페이지에 연결할 수 있는 변경 후보를 정리했습니다.';

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
      setPrdInlineStatus('PRD 링크나 핵심 요구사항 중 하나는 필요해요.');
      return;
    }

    isPrdLoading = true;
    if (prdReadBtn) prdReadBtn.disabled = true;
    setPrdInlineStatus('문서를 읽고 현재 페이지 기준으로 정리하는 중입니다...');

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
          setPrdInlineStatus(response?.error || chrome.runtime.lastError?.message || '문서를 읽는 데 실패했어요.');
          return;
        }

        renderPrdSummary(response.result || null);
        setPrdInlineStatus('현재 페이지에 맞는 변경 후보를 정리했어요.');
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
    freeform.placeholder = config.placeholder || '원하는 변경 방향을 직접 적어주세요.';
    inputWrap.appendChild(freeform);

    const footer = document.createElement('div');
    footer.className = 'clarification-footer';

    const hint = document.createElement('div');
    hint.className = 'clarification-hint';
    hint.textContent = '선택지만 골라도 되고, 직접 자세히 적어도 됩니다.';
    footer.appendChild(hint);

    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'clarification-submit';
    submitBtn.textContent = '이 기준으로 진행';
    footer.appendChild(submitBtn);
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
        parts.push(`선택한 방향: ${selectedOption}`);
      }
      if (freeform.value.trim()) {
        parts.push(freeform.value.trim());
      }
      const answer = parts.join('\n');
      if (!answer) return;

      promptInput.value = answer;
      inputStatus.textContent = '좋아요. 이 기준으로 preview를 만들어볼게요.';

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
      copy_update: '문구를 수정합니다',
      spacing_adjustment: '간격이나 여백을 조정합니다',
      token_alignment: '디자인 토큰 기준으로 정렬합니다',
      component_swap: '더 적절한 컴포넌트로 교체합니다',
      layout_adjustment: '배치나 정렬을 조정합니다',
      state_handling: '동작이나 상태 흐름을 수정합니다',
      accessibility_improvement: '접근성을 개선합니다',
    };
    return map[intent] || '요청한 방향으로 화면을 수정합니다';
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
          '요소',
        )
        .filter(Boolean);
      const suffix = payload.selectedElements.length > 2 ? ` 외 ${payload.selectedElements.length - 2}개 요소` : ' 요소';
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
      '선택한 요소'
    );
  }

  function describePlanApproach(intent, payload) {
    const routeHint = payload.pagePath ? `현재 보고 있는 ${payload.pagePath} 화면 안에서` : '현재 화면 안에서';
    const map = {
      copy_update: `${routeHint} 바뀌어야 하는 문구를 먼저 정확히 찾고, 같은 언어와 맥락을 유지한 채 수정하겠습니다.`,
      spacing_adjustment: `${routeHint} 선택한 영역의 간격만 작게 조정하고, 레이아웃 구조는 최대한 그대로 두겠습니다.`,
      token_alignment: `${routeHint} 눈에 보이는 스타일은 유지하면서 토큰 기준으로 정리하겠습니다.`,
      component_swap: `${routeHint} 기존 역할은 유지하면서 더 적절한 컴포넌트로 바꾸겠습니다.`,
      layout_adjustment: `${routeHint} 배치와 정렬을 다듬되, 사용 흐름은 건드리지 않겠습니다.`,
      state_handling: `${routeHint} 눌렀을 때 동작, 활성/비활성, 에러/로딩 흐름처럼 기능 쪽을 우선 수정하겠습니다.`,
      accessibility_improvement: `${routeHint} 키보드 접근, 라벨, 포커스 흐름을 중심으로 개선하겠습니다.`,
    };
    return map[intent] || `${routeHint} 요청하신 방향이 보이도록 가장 작은 변경부터 시도하겠습니다.`;
  }

  function describePlanVerification(intent, payload) {
    const localeLabel = payload.language || '현재 언어';
    if (intent === 'copy_update') {
      return `${localeLabel} 기준으로 문구가 실제 preview 화면에 보이는지 확인한 뒤 보여드리겠습니다.`;
    }
    if (intent === 'state_handling') {
      return '동작이 바뀐 뒤 validate, typecheck, preview 확인까지 거친 다음 보여드리겠습니다.';
    }
    if (intent === 'spacing_adjustment' || intent === 'layout_adjustment') {
      return 'validate, typecheck, screenshot을 돌려서 화면에서 변경이 실제로 보이는지 확인하겠습니다.';
    }
    return 'validate, typecheck, preview 확인까지 돌린 뒤 결과를 보여드리겠습니다.';
  }

  function buildPlanTargetLabel(payload) {
    if (Array.isArray(payload.selectedElements) && payload.selectedElements.length > 1) {
      const labels = payload.selectedElements
        .slice(0, 2)
        .map((item) => item.testId || item.component || item.semantics?.labelText || item.semantics?.domTag || '요소')
        .filter(Boolean);
      const suffix = payload.selectedElements.length > 2 ? ` 외 ${payload.selectedElements.length - 2}개` : '';
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
      '선택한 요소'
    );
  }

  function buildExecutionPlanPreview(plan) {
    const payload = plan.payload;
    const contract = plan.requestContract;
    const targetLabel = describeTargetInNaturalLanguage(payload);
    const routeLabel = payload.pagePath || contract?.target?.route_or_page || '/';
    const clientLabel = payload.client ? `${payload.client}` : '현재 클라이언트';
    const intentLabel = describeIntent(contract?.change_intent);
    const prdLine = plan.prdContext?.title
      ? `PRD 근거: ${plan.prdContext.title} · ${plan.prdContext.summary || '현재 페이지와 관련된 변경 후보를 참고합니다.'}`
      : null;

    return {
      title: '제가 이해한 요청과 진행 계획',
      lines: [
        `이해한 요청: ${targetLabel} 쪽에서 ${intentLabel}`,
        `진행 방식: ${describePlanApproach(contract?.change_intent, payload)}`,
        `검증 방식: ${describePlanVerification(contract?.change_intent, payload)}`,
        `작업 범위: ${clientLabel} · ${routeLabel}`,
      ].concat(prdLine ? [prdLine] : []),
    };
  }

  function addExecutionPlanMessage(plan) {
    removeWelcome();

    const preview = buildExecutionPlanPreview(plan);
    const msg = document.createElement('div');
    msg.className = 'msg msg-system';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble execution-plan-card';

    const titleEl = document.createElement('div');
    titleEl.className = 'assistant-question-title';
    titleEl.textContent = preview.title;
    bubble.appendChild(titleEl);

    const helperEl = document.createElement('div');
    helperEl.className = 'assistant-question-helper';
    helperEl.textContent = '제가 이해한 방향이 맞으면 진행을 눌러주세요. 다르면 바로 요청을 더 다듬을 수 있습니다.';
    bubble.appendChild(helperEl);

    const list = document.createElement('div');
    list.className = 'assistant-question-list';
    preview.lines.forEach((line) => {
      const item = document.createElement('div');
      item.className = 'assistant-question-item';
      item.textContent = line;
      list.appendChild(item);
    });
    bubble.appendChild(list);

    const actions = document.createElement('div');
    actions.className = 'execution-plan-actions';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'execution-plan-confirm';
    confirmBtn.textContent = '이 계획으로 진행';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'execution-plan-edit';
    editBtn.textContent = '요청 더 다듬기';

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
      inputStatus.textContent = '좋아요. 이 계획대로 작업을 시작할게요.';
      performSubmit(plan);
    });

    editBtn.addEventListener('click', () => {
      pendingExecutionPlan = null;
      bubble.classList.add('clarification-complete');
      inputStatus.textContent = '좋아요. 요청을 조금 더 적어주시면 그 기준으로 다시 계획을 세울게요.';
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
      '선택한 요소'
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
          title: `"${targetLabel}" 버튼에서 어떤 기능 변화를 원하세요?`,
          helper: '이 요청은 시각 수정보다 동작 수정에 가까워 보여서, 클릭 후 무엇이 달라져야 하는지 먼저 맞추겠습니다.',
          options: [
            { label: '클릭 후 동작 변경', value: '버튼 클릭 후 일어나는 동작을 변경' },
            { label: '활성/비활성 조건', value: '버튼 활성/비활성 조건을 조정' },
            { label: '로딩/중복 클릭 방지', value: '제출 중 로딩 상태나 중복 클릭 방지를 개선' },
            { label: '에러 처리 변경', value: '실패 시 에러 처리와 복구 흐름을 조정' },
          ],
          placeholder: '예: 필수 입력 전에는 비활성화하고, 제출 중에는 로딩 상태가 보여야 해요.',
        };
      }

      if (kind === 'input') {
        return {
          intent,
          title: `"${targetLabel}" 입력 동작에서 무엇을 바꾸고 싶나요?`,
          helper: '입력 관련 기능 요청은 검증 시점, 에러 표시, 포커스 이동 같은 동작 기준이 중요합니다.',
          options: [
            { label: '검증 타이밍 조정', value: '입력 검증 시점을 조정' },
            { label: '에러 상태 개선', value: '에러 메시지와 에러 상태 표시를 개선' },
            { label: '입력 규칙 변경', value: '허용 값이나 입력 규칙을 변경' },
            { label: '포커스/이동 흐름', value: '포커스 이동이나 다음 입력 흐름을 개선' },
          ],
          placeholder: '예: blur 시에만 에러를 보이고, 입력 중에는 즉시 빨간색이 뜨지 않게 하고 싶어요.',
        };
      }

      if (kind === 'list') {
        return {
          intent,
          title: `"${targetLabel}" 리스트 동작에서 어떤 기능을 원하세요?`,
          helper: '리스트는 필터, 정렬, 선택, 빈 상태 등 기능 축이 달라서 먼저 좁히는 편이 좋습니다.',
          options: [
            { label: '필터/검색', value: '필터나 검색 동작을 수정' },
            { label: '정렬 변경', value: '정렬 방식이나 기본 정렬을 변경' },
            { label: '행 선택/액션', value: '행 선택이나 액션 동작을 수정' },
            { label: '빈 상태/에러', value: '빈 상태나 실패 상태 동작을 개선' },
          ],
          placeholder: '예: 검색 결과가 없을 때 더 명확한 빈 상태를 보여주고 싶어요.',
        };
      }

      return {
        intent,
        title: `"${targetLabel}" 기능 변경 목표를 알려주세요.`,
        helper: '이 요청은 기능 중심으로 보여서, 무엇이 달라져야 하는지 먼저 확인하는 게 중요합니다.',
        options: [
          { label: '액션 후 결과 변경', value: '사용자 액션 뒤 결과 동작을 변경' },
          { label: '상태 흐름 개선', value: 'loading / error / success 상태 흐름을 개선' },
          { label: '검증/제약 변경', value: '입력 검증이나 조건 분기를 변경' },
          { label: '현재 UI는 유지', value: 'UI 모양은 유지하고 기능만 수정' },
        ],
        placeholder: '예: 클릭하면 모달이 열려야 하고, 실패하면 인라인 에러가 보여야 해요.',
      };
    }

    if (intent === 'copy_update') {
      if (kind === 'button') {
        return {
          intent,
          title: `"${targetLabel}" 버튼 문구를 어떻게 바꿀지 정해볼게요.`,
          helper: '버튼 문구는 길이와 톤에 따라 의미 전달과 버튼 폭이 같이 달라집니다.',
          options: [
            { label: '정확한 문구로 교체', value: '버튼 문구를 지정한 문구로 정확히 교체' },
            { label: '더 명확하게', value: '버튼 문구를 더 명확하고 이해하기 쉽게 수정' },
            { label: '더 짧게', value: '버튼 크기는 유지하고 문구만 더 짧게 정리' },
            { label: '현재 톤 유지', value: '현재 언어와 톤은 유지하면서 문구만 개선' },
          ],
          placeholder: '예: "로그인"을 "로그인 하기"로 바꾸고 버튼 크기와 위치는 유지해주세요.',
        };
      }

      if (kind === 'input') {
        return {
          intent,
          title: `"${targetLabel}" 입력 관련 문구를 어떻게 바꿀까요?`,
          helper: 'placeholder, label, helper text 중 어느 문구인지 알면 더 정확하게 수정할 수 있어요.',
          options: [
            { label: 'placeholder 변경', value: 'placeholder 문구만 변경' },
            { label: 'label 변경', value: '입력 라벨 문구를 변경' },
            { label: '설명 문구 보강', value: 'helper/description 문구를 더 친절하게 보강' },
            { label: '구조는 유지', value: '입력 구조는 유지하고 문구만 수정' },
          ],
          placeholder: '예: 입력 필드 자체는 유지하고 placeholder만 더 친절하게 바꾸고 싶어요.',
        };
      }

      return {
        intent,
        title: `"${targetLabel}" 문구를 어떻게 바꿀지 조금만 더 알려주세요.`,
        helper: '현재 화면에서 실제로 보이는 문구와 바뀐 뒤의 목표를 알수록 preview가 더 정확합니다.',
        options: [
          { label: '문구만 정확히 변경', value: '문구만 정확히 바꾸고, 레이아웃은 유지' },
          { label: '더 명확하게 다듬기', value: '의미는 유지하되 더 명확한 문구로 다듬기' },
          { label: '더 짧고 간결하게', value: '더 짧고 간결한 문구로 정리' },
          { label: '언어와 톤 유지', value: '현재 언어와 톤은 유지하면서 수정' },
        ],
        placeholder: '원하는 최종 문구, 유지해야 할 조건, 바꾸면 안 되는 점을 자유롭게 적어주세요.',
      };
    }

    if (intent === 'spacing_adjustment') {
      if (kind === 'button') {
        return {
          intent,
          title: `"${targetLabel}" 버튼 주변 간격을 어떻게 조정할까요?`,
          helper: '버튼은 간격을 바꾸면 주변 입력창과의 관계가 같이 달라져서 기준을 먼저 잡는 편이 좋습니다.',
          options: [
            { label: '위아래 간격만', value: '버튼 위아래 간격만 조정하고 버튼 크기는 유지' },
            { label: '입력창과의 간격', value: '버튼과 입력창 사이 간격을 조정' },
            { label: '조금 더 넓게', value: '더 여유 있어 보이도록 간격 확대' },
            { label: '현재 밀도 유지', value: '전체 밀도는 유지하고 어색한 부분만 조정' },
          ],
          placeholder: '예: 입력창 아래 버튼이 너무 붙어 보여서 한 단계만 더 띄워주세요.',
        };
      }

      if (kind === 'text') {
        return {
          intent,
          title: `"${targetLabel}" 텍스트 주변 간격을 어떻게 느끼세요?`,
          helper: '제목이나 설명 텍스트는 아래 요소와의 거리감이 중요해서 어느 쪽이 답답한지 알면 좋습니다.',
          options: [
            { label: '아래 간격 늘리기', value: '텍스트 아래 간격을 조금 더 넓게' },
            { label: '아래 간격 줄이기', value: '텍스트 아래 간격을 조금 더 좁게' },
            { label: '위아래 균형 맞추기', value: '텍스트 위아래 간격 균형만 맞추기' },
            { label: '현재 구조 유지', value: '레이아웃 구조는 유지하고 간격만 조정' },
          ],
          placeholder: '예: 로그인 제목 아래 간격이 답답해서 조금만 더 띄우고 싶어요.',
        };
      }

      return {
        intent,
        title: `"${targetLabel}" 주변 간격 목표를 조금만 더 알려주세요.`,
        helper: '같은 “간격 조정”이어도 더 넓게, 더 좁게, 균형만 맞추기처럼 방향이 다를 수 있어요.',
        options: [
          { label: '조금 더 넓게', value: '대상 요소 주변 간격을 조금 더 넓게' },
          { label: '조금 더 좁게', value: '대상 요소 주변 간격을 조금 더 좁게' },
          { label: '시각 균형만 맞추기', value: '전체 레이아웃은 유지하고 시각 균형만 맞추기' },
          { label: '다른 요소는 유지', value: '주변 버튼 크기와 배치는 그대로 유지' },
        ],
        placeholder: '예: 제목 아래 간격이 답답해서 조금만 더 띄우고 싶어요.',
      };
    }

    if (intent === 'token_alignment') {
      return {
        intent,
        title: `"${targetLabel}"를 어떤 기준에 맞출지 알려주세요.`,
        helper: '색상, 여백, 타이포 중 어디를 기준에 맞출지 정하면 수정이 더 정확해집니다.',
        options: [
          { label: '색상 토큰 정리', value: '색상을 semantic token 기준으로 정리' },
          { label: '간격 토큰 정리', value: '간격과 여백을 디자인 토큰 기준으로 정리' },
          { label: '타이포 정리', value: '폰트 크기와 weight를 디자인 시스템 기준으로 정리' },
          { label: '전체적으로 정리', value: '이 요소 전반을 디자인 시스템 기준으로 정리' },
        ],
        placeholder: '지켜야 할 기준이나 현재 어색한 점을 자유롭게 적어주세요.',
      };
    }

    if (!context?.component && !selectedCapture) {
      return {
        intent,
        title: '무엇을 바꾸고 싶은지 한 번만 더 좁혀볼게요.',
        helper: '대상이 아직 넓어서, 어떤 종류의 변경인지 먼저 정하면 더 정확하게 작업할 수 있어요.',
        options: [
          { label: '문구를 바꾸고 싶어요', value: '문구 중심 변경' },
          { label: '간격이나 정렬을 바꾸고 싶어요', value: '간격/레이아웃 중심 변경' },
          { label: '색상이나 스타일을 바꾸고 싶어요', value: '스타일 중심 변경' },
          { label: '컴포넌트 동작을 바꾸고 싶어요', value: '컴포넌트/상태 중심 변경' },
        ],
        placeholder: '예: 로그인 버튼 문구를 더 명확하게 바꾸고, 레이아웃은 유지하고 싶어요.',
      };
    }

    return {
      intent,
      title: `"${targetLabel}" 변경 목표를 조금만 더 알려주세요.`,
      helper: '짧은 선택과 한 줄 설명만 있으면, preview가 훨씬 정확해집니다.',
      options: [
        { label: '더 명확하게', value: '사용자가 더 쉽게 이해되게 수정' },
        { label: '더 눈에 띄게', value: '중요도가 더 잘 보이게 수정' },
        { label: '더 정돈되게', value: '시각적으로 더 정돈되게 수정' },
        { label: '현재 구조는 유지', value: '현재 구조와 흐름은 유지하면서 수정' },
      ],
      placeholder: '절대 바뀌면 안 되는 점이나 원하는 최종 느낌을 적어주세요.',
    };
  }

  function buildFollowupClarificationConfig(prompt, context, pending) {
    const intent = pending?.inferredIntent || inferIntentFromPrompt(prompt);
    const targetLabel = getContextLabel(context);
    const kind = inferTargetKind(context);

    if (intent === 'state_handling') {
      return {
        intent,
        title: `"${targetLabel}" 기능 변경에서 마지막으로 확인할게요.`,
        helper: '기능 요청은 적용 범위와 성공 기준을 정해야 엉뚱한 부분을 건드리지 않습니다.',
        options: [
          { label: '이 요소만 변경', value: '선택한 요소와 직접 연결된 동작만 변경' },
          { label: '현재 UI는 유지', value: '시각 UI는 유지하고 기능만 수정' },
          { label: 'preview에서 결과 확인', value: 'preview에서 요청한 상태 변화가 보여야 함' },
          { label: '실패 흐름도 확인', value: '성공뿐 아니라 실패/에러 흐름도 검증' },
        ],
        placeholder: kind === 'button'
          ? '예: 로그인 버튼과 직접 연결된 제출 동작만 바꾸고, 다른 버튼은 건드리지 말아주세요.'
          : '예: 선택한 입력/리스트 흐름만 수정하고 다른 화면 구조는 그대로 유지해주세요.',
      };
    }

    if (intent === 'copy_update') {
      return {
        intent,
        title: `"${targetLabel}" 문구 변경에서 마지막으로 확인할게요.`,
        helper: '문구는 맞더라도 레이아웃, 언어, 적용 범위를 함께 정해야 preview가 덜 흔들립니다.',
        options: [
          { label: '현재 한국어 유지', value: '현재 언어는 그대로 유지' },
          { label: '이 요소만 변경', value: '선택한 요소만 바꾸고 다른 문구는 유지' },
          { label: '레이아웃 유지', value: '문구만 바꾸고 레이아웃과 버튼 크기는 유지' },
          { label: 'preview에서 바로 확인', value: 'preview에서 바뀐 문구가 실제로 보이게 검증' },
        ],
        placeholder: '예: 로그인 버튼만 바꾸고, 다른 화면 문구는 건드리지 않았으면 좋겠어요.',
      };
    }

    if (intent === 'spacing_adjustment') {
      return {
        intent,
        title: `"${targetLabel}" 간격 조정에서 마지막으로 확인할게요.`,
        helper: '간격 변경은 적용 범위를 좁혀두면 예상치 못한 레이아웃 흔들림을 줄일 수 있어요.',
        options: [
          { label: '이 요소만 조정', value: '선택한 요소 주변만 조정하고 전체 레이아웃은 유지' },
          { label: '현재 밀도 유지', value: '현재 화면 밀도는 유지하고 답답한 부분만 완화' },
          { label: '버튼 크기 유지', value: '버튼이나 입력 크기는 건드리지 않기' },
          { label: 'preview에서 확인', value: 'preview screenshot에서 간격 변화가 보여야 함' },
        ],
        placeholder: '예: 제목 아래만 손보고 아래 폼 전체 구조는 유지해주세요.',
      };
    }

    return {
      intent,
      title: `"${targetLabel}" 변경에서 마지막으로 확인할게요.`,
      helper: '마지막 제약 하나만 정하면 바로 preview를 만들 수 있습니다.',
      options: [
        { label: '현재 구조 유지', value: '현재 구조와 흐름은 유지' },
        { label: '이 요소 중심', value: '선택한 요소 중심으로만 수정' },
        { label: '시각적 안정성 우선', value: '큰 레이아웃 변화 없이 안정적으로 수정' },
        { label: 'preview 검증 우선', value: 'preview에서 요청한 변화가 바로 보여야 함' },
      ],
      placeholder: kind === 'capture'
        ? '예: 캡처한 영역 안에서만 수정하고 다른 부분은 건드리지 않았으면 좋겠어요.'
        : '예: 선택한 요소 중심으로만 수정하고 주변 구조는 유지해주세요.',
    };
  }

  function shouldStartClarification(prompt, context) {
    if (pendingClarification) return false;
    const trimmed = String(prompt || '').trim();
    if (!trimmed) return false;
    return inferClarificationDepth(trimmed, context) > 0;
  }

  function buildClarifiedPrompt(initialPrompt, clarificationAnswer) {
    return `${initialPrompt}\n\n추가 설명:\n${clarificationAnswer}`.trim();
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
        ? 'PM/SA 요청 규격과 연결되어 있습니다.'
        : '기본 요청 규격으로 동작합니다.';
    }

    if (goalInput && !goalInput.placeholder && schema?.schema?.properties?.goal?.description) {
      goalInput.placeholder = schema.schema.properties.goal.description;
    }

    if (intentSelect && !intentSelect.value) {
      intentSelect.value = 'layout_adjustment';
    }

    if (successCriteriaInput && !successCriteriaInput.value && Array.isArray(recommendedDefaults.validation_expectations)) {
      successCriteriaInput.placeholder = '예: preview에서 요청한 변경이 보인다; 한국어가 유지된다';
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
        ? `${modeLabel} 준비됨`
        : `${modeLabel} 확인 필요`;
      contextSecondary.textContent = prdContext?.title
        ? `PRD "${prdContext.title}" 를 읽어 현재 페이지 작업에 연결할 준비가 되어 있습니다.`
        : '요소를 선택하거나 영역을 캡처하면 현재 페이지, 언어, 대상 컴포넌트가 여기에 표시됩니다.';
      return;
    }

    const contextBits = [
      activeContext.client || 'unknown client',
      activeContext.language || 'unknown language',
      activeContext.pagePath || '/',
    ].filter(Boolean);

    contextPrimary.textContent = activeContext.source === 'capture'
      ? `캡처 기준으로 요청합니다 · ${contextBits.join(' · ')}`
      : `선택한 요소 기준으로 요청합니다 · ${contextBits.join(' · ')}`;

    if (activeContext.source === 'capture') {
      contextSecondary.textContent = prdContext?.title
        ? `이 요청은 현재 캡처한 영역과 PRD "${prdContext.title}"를 함께 참고합니다.`
        : '이 요청은 현재 캡처한 영역과 페이지 컨텍스트를 우선 사용합니다.';
      return;
    }

    contextSecondary.textContent = activeContext.component
      ? `${activeContext.component} 컴포넌트를 기준으로 요청합니다.${activeContext.selectionCount > 1 ? ` 현재 ${activeContext.selectionCount}개 요소가 함께 선택되어 있습니다.` : ''}${prdContext?.title ? ` PRD "${prdContext.title}"도 함께 참고합니다.` : ' 필요하면 캡처가 이 컨텍스트를 덮어쓸 수 있습니다.'}`
      : (prdContext?.title
        ? `선택한 요소와 PRD "${prdContext.title}"를 함께 기준으로 요청합니다.`
        : '선택한 요소를 기준으로 요청합니다.');
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
  });

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
    captureMeta.textContent = `${Math.round(data.rect.width)} × ${Math.round(data.rect.height)} 영역이 선택되었습니다. 요청과 함께 전달됩니다.`;
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
      thumb.title = '첨부한 스크린샷';
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
    const routeLabel = payload?.pagePath || payload?.requestContract?.target?.route_or_page || '현재 화면';

    const phaseCopyMap = {
      queued: `Codex가 ${routeLabel} 기준으로 작업 범위를 정리하고 있어요.`,
      creating_worktree: `Codex가 안전한 작업 공간을 준비하고 있어요.`,
      running_codex: `Codex가 ${targetLabel} 주변 코드를 실제로 수정하고 있어요.`,
      collecting_diff: `Codex가 바뀐 파일과 변경 범위를 정리하고 있어요.`,
      validating: `Codex가 validate와 typecheck를 돌려서 안전한지 확인하고 있어요.`,
      capturing_screenshot: `Codex가 preview 화면을 캡처해서 바로 검토할 수 있게 준비하고 있어요.`,
      preview_ready: `Preview가 준비됐어요. 바뀐 화면을 바로 검토할 수 있어요.`,
      no_change_needed: `이번 요청은 현재 화면 기준으로 바로 적용할 변경이 없다고 판단했어요.`,
      applying_local_patch: `승인된 변경을 로컬 워크스페이스에 적용하고 있어요.`,
      queued_for_retry: `피드백을 반영해서 다시 수정 준비 중이에요.`,
      pipeline_error: `작업 중 문제가 생겨서 원인을 정리하고 있어요.`,
    };

    const base = phaseCopyMap[phase] || `Codex가 ${targetLabel} 요청을 처리하고 있어요.`;
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
    title.textContent = 'Codex가 작업을 시작했어요';

    const body = document.createElement('div');
    body.className = 'progress-card-body';
    body.textContent = getProgressPhaseCopy('queued', '', payload);

    const meta = document.createElement('div');
    meta.className = 'progress-card-meta';
    meta.textContent = `${payload?.client || 'current client'} · ${payload?.pagePath || '/'}`;

    const status = document.createElement('div');
    status.className = 'msg-status';
    status.innerHTML = '<span class="dot dot-waiting"></span> waiting';

    bubble.appendChild(title);
    bubble.appendChild(body);
    bubble.appendChild(meta);
    bubble.appendChild(status);
    msg.appendChild(bubble);
    messagesEl.appendChild(msg);
    scrollToBottom();

    activeProgressCard = {
      requestId,
      root: msg,
      title,
      body,
      meta,
      status,
      payload,
    };

    return activeProgressCard;
  }

  function updateProgressMessage({ requestId, phase, latestLog, statusType, statusLabel, title }) {
    if (!activeProgressCard || activeProgressCard.requestId !== requestId) {
      return;
    }

    if (title) {
      activeProgressCard.title.textContent = title;
    }

    activeProgressCard.body.textContent = getProgressPhaseCopy(phase, latestLog, activeProgressCard.payload);
    activeProgressCard.status.innerHTML = `<span class="dot dot-${statusType}"></span> ${escapeHtml(statusLabel)}`;
    scrollToBottom();
  }

  function clearActiveProgressCard() {
    activeProgressCard = null;
  }

  function phaseLabel(phase) {
    const map = {
      queued: 'Queued',
      creating_worktree: 'Preparing worktree',
      running_codex: 'Codex is editing',
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
        addSystemMessage('새 탭 열기에 실패했어요.', 'error');
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
      highlights.push(`변경 파일 ${files.length}개`);
    }
    if (normalizedPrompt) {
      highlights.push(`${normalizedPrompt} 관련 수정`);
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
      const targetLabel = /Title/.test(addedLine) ? '제목 아래 간격' : '간격';
      bullets.push(`${targetLabel}을 ${marginMatchRemoved[1]}px에서 ${marginMatchAdded[1]}px로 조정했습니다.`);
    } else if (
      addedLine &&
      removedLine &&
      /t\('/.test(addedLine) &&
      /t\('/.test(removedLine)
    ) {
      bullets.push('문구 또는 번역 키가 변경되었습니다.');
    } else if (meaningfulAdded.length) {
      bullets.push(`변경 내용: ${meaningfulAdded.join(' / ')}`);
    }

    if (meaningfulRemoved.length && !(marginMatchAdded && marginMatchRemoved)) {
      bullets.push(`이전 상태: ${meaningfulRemoved.join(' / ')}`);
    }

    if (!bullets.length && files.length) {
      bullets.push(`대상 파일: ${files.map((file) => file.split('/').pop()).join(', ')}`);
    }

    if (primaryFile) {
      bullets.push(`수정 파일: ${primaryFile}`);
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
      img.title = '새 탭에서 크게 보기';
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
      openFullBtn.textContent = '스크린샷 크게 보기';
      openFullBtn.addEventListener('click', () => {
        if (img.src) {
          openExternalUrl(screenshotUrl || img.src);
        }
      });
      screenshotActions.appendChild(openFullBtn);

      if (previewUrl) {
        const openPageBtn = document.createElement('button');
        openPageBtn.className = 'preview-open-full-btn preview-open-page-btn';
        openPageBtn.textContent = '실제 preview 페이지 열기';
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
    summaryTitle.textContent = '변경 요약';
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
    approveBtn.textContent = 'Approve → Apply locally';
    approveBtn.addEventListener('click', () => handleApprove(requestId, actions));

    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'preview-btn reject-btn';
    rejectBtn.textContent = 'Request Changes';
    rejectBtn.addEventListener('click', () => handleReject(requestId, actions));

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'preview-btn cancel-btn';
    cancelBtn.textContent = '취소';
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
    title.textContent = '변경이 필요하지 않아요';

    const note = document.createElement('div');
    note.className = 'preview-empty-note';
    note.textContent = latestLog || '현재 코드와 요청을 다시 비교한 결과, 바로 적용할 앱 변경 사항이 없었습니다.';

    const actionBtn = document.createElement('button');
    actionBtn.className = 'preview-open-full-btn preview-open-page-btn';
    actionBtn.textContent = '요청 더 구체화하기';
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
    inputStatus.textContent = '리뷰 카드를 닫았습니다. 바로 다음 요청을 보낼 수 있어요.';
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
          'preview에서 요청한 변경이 보인다.',
          ...(resolvedLanguage ? [`preview와 screenshot이 ${resolvedLanguage} 언어를 유지한다.`] : []),
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
        ? `예: ${promptInput.value.trim()}`
        : '예: 로그인 CTA를 더 명확하게 만든다.';
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
    isSubmitting = true;
    updateSendState();

    chrome.runtime.sendMessage(
      { type: 'inspect-submit', payload },
      (response) => {
        isSubmitting = false;
        updateSendState();

        if (chrome.runtime.lastError) {
          addSystemMessage('Failed to send: ' + chrome.runtime.lastError.message, 'error');
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
            addSystemMessage('Sent to Codex', 'sent');
            inputStatus.textContent = 'Switch to Codex and press Enter';
            setTimeout(() => {
              inputStatus.textContent = '';
              startNativePolling();
            }, 1200);
          }
        } else {
          addSystemMessage('Error: ' + (response ? response.error : 'Unknown'), 'error');
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
      inputStatus.textContent = '선택하거나 직접 적어주시면 바로 작업을 시작합니다.';
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
        inputStatus.textContent = '좋아요. 마지막으로 한 가지만 더 확인할게요.';
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
    inputStatus.textContent = '계획을 확인해주시면 실제 수정과 preview 생성을 시작합니다.';
    addExecutionPlanMessage(pendingExecutionPlan);
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
            title: 'Codex가 preview를 준비했어요',
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
            title: 'Codex가 이번 요청은 변경 없이 유지하는 편이 맞다고 판단했어요',
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
            title: 'Codex가 변경을 적용했어요',
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
            title: 'Codex 작업 중 문제가 생겼어요',
          });
          addSystemMessage('Error: ' + (response.error || 'Unknown'), 'error');
        } else if (response.status === 'processing' || response.status === 'pending') {
          inputStatus.textContent = '';
          updateProgressMessage({
            requestId,
            phase: response.phase || 'queued',
            latestLog: response.latestLog || '',
            statusType: response.status === 'pending' ? 'waiting' : 'sent',
            statusLabel: response.status === 'pending' ? 'waiting' : 'working',
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
        addSystemMessage('Timed out waiting for Codex', 'timeout');
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
        addSystemMessage(`영역 선택을 시작하지 못했어요: ${chrome.runtime.lastError.message}`, 'error');
        return;
      }
      if (!response || response.ok === false) {
        addSystemMessage(`영역 선택을 시작하지 못했어요: ${response?.error || 'Unknown error'}`, 'error');
        return;
      }
      inputStatus.textContent = '드래그해서 캡처할 영역을 선택하세요.';
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
      inputStatus.textContent = '선택한 스크린샷이 요청에 포함됩니다.';
    }
  });

  updateContextStrip();

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
