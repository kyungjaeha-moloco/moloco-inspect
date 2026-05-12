// orchestrator/lib/plan-intent.js
//
// plan-emitter intent → fast-track branch decision. Determines whether a change
// is simple enough for an agent to code directly from plan_items alone, or
// complex enough to need the decomposer.
//
// Fast-track: copy_update / spacing_adjustment / token_alignment /
//             accessibility_improvement / state_handling
// Full path (decomposer runs): all other intents.
//
// Used in:
//   - server.js: isFastTrackIntent(plan.intent) → skipDecomposer when calling createJob
//   - molly.js (Slack): show "Fast execution" badge on plan_items card header
//   - chrome-extension/sidepanel.js: same
//   - playground-app/src/editor/AIPanel.tsx: same (TS side defines its own enum)

export const FAST_TRACK_INTENTS = new Set([
  'copy_update',
  'spacing_adjustment',
  'token_alignment',
  'accessibility_improvement',
  'state_handling',
]);

/**
 * @param {string|undefined|null} intent — plan.intent value
 * @returns {boolean}
 */
export function isFastTrackIntent(intent) {
  return typeof intent === 'string' && FAST_TRACK_INTENTS.has(intent);
}
