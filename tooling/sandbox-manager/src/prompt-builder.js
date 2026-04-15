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

  if (/\b(text|copy|label|placeholder|번역|문구|텍스트)\b/i.test(payload.userPrompt || '')) {
    parts.push('\n6. This is a copy change. Check useTranslation namespace before editing locale files.');
  }

  return parts.join('\n');
}
