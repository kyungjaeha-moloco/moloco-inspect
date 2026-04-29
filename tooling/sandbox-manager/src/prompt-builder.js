/**
 * Build a prompt for the sandbox agent.
 * Adapted from orchestrator/server.js buildPrompt() for container context.
 * All paths reference /workspace/* inside the container.
 */

const DESIGN_SYSTEM_PATH = '/workspace/design-system';

export function buildSandboxPrompt(payload) {
  const parts = [];
  const requestContract = payload.requestContract || {};

  if (payload.component) parts.push(`Component: ${payload.component}`);
  if (payload.file) parts.push(`File: ${payload.file}${payload.line ? ':' + payload.line : ''}`);
  if (payload.testId) parts.push(`Test ID: ${payload.testId}`);
  if (payload.pagePath) parts.push(`Current route: ${payload.pagePath}`);
  if (payload.client) parts.push(`Current client: ${payload.client}`);

  if (Array.isArray(payload.selectedElements) && payload.selectedElements.length) {
    const labels = payload.selectedElements.map(
      (item) => item.testId || item.component || item.semantics?.labelText || item.semantics?.domTag || 'element',
    );
    parts.push(`Selected elements: ${labels.join(' | ')}`);
  }

  if (requestContract.goal) parts.push(`Request goal: ${requestContract.goal}`);
  if (requestContract.change_intent) parts.push(`Change intent: ${requestContract.change_intent}`);

  if (Array.isArray(requestContract.constraints) && requestContract.constraints.length) {
    parts.push(`Constraints: ${requestContract.constraints.join(' | ')}`);
  }
  if (Array.isArray(requestContract.success_criteria) && requestContract.success_criteria.length) {
    parts.push(`Success criteria: ${requestContract.success_criteria.join(' | ')}`);
  }

  if (payload.styles) {
    const s = payload.styles;
    parts.push(`Current styles: font ${s.fontSize}/${s.fontWeight}, color ${s.color}, padding ${s.padding}, size ${s.width}x${s.height}`);
  }

  if (payload.language) {
    parts.push(`Current page language: ${payload.language}`);
    parts.push('Preserve the current page language in the preview and in any visible copy changes.');
  }

  parts.push(`\nPM Request: ${payload.userPrompt}`);

  // App structure context for faster file discovery
  const client = payload.client || 'tving';
  parts.push(`\n--- WORKSPACE CONTEXT ---`);
  parts.push(`App root: /workspace/msm-portal/js/msm-portal-web`);
  parts.push(`App entry: src/apps/${client}/`);
  parts.push(`Design system: ${DESIGN_SYSTEM_PATH}`);
  parts.push(`Shared components: src/components/`);
  parts.push(`i18n files: src/i18n/locales/{ko,en}/`);
  parts.push(`Pattern: Container (data) → Component (UI). Containers use tRPC hooks.`);

  parts.push(`\n--- RULES ---`);
  parts.push(`1. Read the target file FIRST. Do not explore unrelated directories.`);
  parts.push(`2. Make the SMALLEST possible change. Touch at most 3 files.`);
  parts.push(`3. Do not install dependencies, modify package.json, lockfiles, or opencode.json. Do not create commits.`);
  parts.push(`4. If a file path is given, start there. Otherwise search by testId or component name.`);
  parts.push(`5. Finish within 5 tool calls when possible. Do not over-explore.`);
  parts.push(
    `6. CLIENT SCOPING — CRITICAL: the live preview renders the '${client}' app. Multiple apps (msm-default, tving, shortmax, onboard-demo) keep parallel copies of the same component filename (e.g. MCPublisherCreativeReviewTable.tsx exists in 4 places, one per app). You MUST edit the copy under src/apps/${client}/... — editing another app's copy has zero visible effect and is the #1 source of "my change didn't show up" bugs. If grep returns matches outside src/apps/${client}/, src/components/, or src/i18n/, ignore them.`,
  );
  parts.push(
    `7. DESIGN SYSTEM — CRITICAL: this codebase has a complete component library at \`@moloco/moloco-cloud-react-ui\` plus internal wrappers under \`src/common/component/\`. Always reuse these instead of rolling your own raw HTML/CSS. Before introducing a new \`<button>\`, \`<table>\`, \`<input>\`, status pill, modal, or toggle, grep the codebase for an existing equivalent and import it.\n   - Buttons: \`MCButton2\` (preferred) / \`MCButton\` (legacy) from \`@moloco/moloco-cloud-react-ui\`. Do NOT use raw <button>.\n   - Layout / spacing: \`MCStack\` (vertical/horizontal flex with consistent gap). Do NOT scatter inline \`style={{ display: 'flex', gap: ...}}\`.\n   - Icons: \`MCIcon\` with the project's icon name set. Do NOT use emoji or external icon packages.\n   - Toggle / switch: \`MCSwitch\`. For segmented controls, look at existing patterns in \`src/common/component/\`.\n   - Status badges: import \`MCStatus\` from \`src/common/component/status/MCStatus.tsx\` (or its app-level equivalent). Do NOT hand-color colored boxes for Allowed/Blocked/Pending states.\n   - Tables: see \`src/common/component/table/\` for cell renderers and sort handlers. \`src/common/component/report-table/\` for data-grid patterns. Do NOT rebuild a table with raw \`<table><tr><td>\` if a sibling page already renders a similar list.\n   - Dialogs / modals: \`src/common/component/dialog/\`. Do NOT roll your own backdrop + z-index modal.\n   - Form fields, dropdowns, date pickers, popovers: check \`src/common/component/{form, popover, ...}\` and the moloco-cloud-react-ui exports first.\n   When in doubt, pick a sibling page that already does what you're being asked to build (e.g. \`PublisherCreativeReview\` for a creative-review table) and copy its component import set verbatim — uniformity beats clever new approaches. Tokens (colors, spacing, radii) come from \`color\` / theme exports of \`@moloco/moloco-cloud-react-ui\`; do not hardcode hex values.`,
  );

  if (/\b(text|copy|label|placeholder|번역|문구|텍스트)\b/i.test(payload.userPrompt || '')) {
    parts.push('\n6. This is a copy change. Check useTranslation namespace before editing locale files.');
  }

  // RULE 8 — Self-verification before finishing.
  //
  // The host runs an external review (Claude reads the diff against the
  // PRD) AFTER you exit. Failing review is expensive: it blocks the job
  // and the user has to either retry the task or accept-anyway. Most
  // review failures we've seen come from sloppy syntax errors or routes
  // broken as a side-effect of unrelated edits — both catchable in <30s
  // here, before you finish. Run the self-checks every time.
  parts.push(`\n8. SELF-VERIFICATION — before finishing your work, verify your changes don't break the workspace. These checks DO NOT count against the 5-tool budget in rule 5; spend whatever you need on them:`);
  parts.push(`   a. \`cd /workspace/msm-portal/js/msm-portal-web && pnpm exec tsc --noEmit\` — must exit 0. If it errors, the diff doesn't compile; fix it before finishing.`);
  if (payload.targetRoute && typeof payload.targetRoute === 'string' && payload.targetRoute.startsWith('/')) {
    parts.push(`   b. \`curl -sS -o /dev/null -w "%{http_code}\\n" http://localhost:5173${payload.targetRoute}\` — must print a 2xx (200/204/etc) status. The result page is \`${payload.targetRoute}\`. If 4xx/5xx, your edit broke the route — common causes: deleted a sibling route's import, removed a component another route depends on, broke the shared layout. Investigate and fix.`);
    parts.push(`   c. After (b), also \`curl -sS http://localhost:5173${payload.targetRoute} | head -c 1500\` once and confirm the HTML actually contains rendered app content (not a Vite "error overlay" page or a blank \`<div id=\"root\"></div>\`). A 200 with a blank body is still broken.`);
  } else {
    parts.push(`   b. \`curl -sS -o /dev/null -w "%{http_code}\\n" http://localhost:5173/\` — must print a 2xx. If 4xx/5xx, your edit broke the app's entry; fix before finishing.`);
  }
  parts.push(`   Only finish your work after every check above passes. Do NOT 'finish and let the reviewer catch it' — that's twice the work.`);

  return parts.join('\n');
}
