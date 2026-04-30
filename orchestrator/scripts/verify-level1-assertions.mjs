#!/usr/bin/env node
/**
 * Unit-style verification of runLevel1Assertions — 코드 자체 회귀
 * 방지. agent-review.js 안의 함수를 직접 호출.
 */
import { runLevel1Assertions } from '../lib/qa-adapters/agent-review.js';

// runLevel1Assertions 가 export 되도록 agent-review.js 수정 필요 (Task 1.1 보완).

const cases = [
  {
    name: 'A1 sign-in redirect',
    evidence: { finalUrl: 'http://localhost:5173/sign-in?redirect=/admin/stats', httpStatus: 200, bodyText: 'Sign in form ...', pageErrors: [], consoleErrors: [] },
    job: { targetRoute: '/admin/stats' },
    expectedPassed: false,
    expectedFailureRegex: /A1/,
  },
  {
    name: 'A2 500 error',
    evidence: { finalUrl: 'http://localhost:5173/help', httpStatus: 500, bodyText: 'error', pageErrors: [], consoleErrors: [] },
    job: { targetRoute: '/help' },
    expectedPassed: false,
    expectedFailureRegex: /A2/,
  },
  {
    // A3 는 warning only — final verdict 에 영향 X. failures 에 안 들어가고
    // warnings 에 들어가야 함.
    name: 'A3 redirect to forbidden (warning only)',
    evidence: { finalUrl: 'http://localhost:5173/forbidden', httpStatus: 200, bodyText: 'Forbidden page content here that is more than 50 characters long.', pageErrors: [], consoleErrors: [] },
    job: { targetRoute: '/admin/stats' },
    expectedPassed: true,  // A3 는 fail 안 시킴
    expectedFailureRegex: null,
    expectedWarningRegex: /A3/,
  },
  {
    name: 'A4 empty body',
    evidence: { finalUrl: 'http://localhost:5173/help', httpStatus: 200, bodyText: '<div id="root"></div>', pageErrors: [], consoleErrors: [] },
    job: { targetRoute: '/help' },
    expectedPassed: false,
    expectedFailureRegex: /A4/,
  },
  {
    name: 'A5 page error',
    evidence: { finalUrl: 'http://localhost:5173/help', httpStatus: 200, bodyText: 'some content here that is more than 50 characters long enough', pageErrors: ['TypeError: x is undefined'], consoleErrors: [] },
    job: { targetRoute: '/help' },
    expectedPassed: false,
    expectedFailureRegex: /A5/,
  },
  {
    name: 'clean — all assertions pass',
    evidence: { finalUrl: 'http://localhost:5173/help', httpStatus: 200, bodyText: '<html><body><h1>Help</h1><p>곧 컨텐츠가 추가됩니다</p></body></html>', pageErrors: [], consoleErrors: [] },
    job: { targetRoute: '/help' },
    expectedPassed: true,
    expectedFailureRegex: null,
  },
];

let pass = 0;
for (const c of cases) {
  const r = runLevel1Assertions(c.evidence, c.job);
  const matchesPassed = r.passed === c.expectedPassed;
  const matchesFailure =
    c.expectedFailureRegex == null
      ? r.failures.length === 0
      : r.failures.some((f) => c.expectedFailureRegex.test(f));
  const matchesWarning =
    c.expectedWarningRegex == null
      ? true  // warning 검증 안 하는 케이스는 자동 통과
      : (r.warnings || []).some((w) => c.expectedWarningRegex.test(w));
  const ok = matchesPassed && matchesFailure && matchesWarning;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${c.name}: passed=${r.passed}, ` +
      `failures=${JSON.stringify(r.failures)}, warnings=${JSON.stringify(r.warnings || [])}`,
  );
  if (ok) pass++;
}
console.log(`\nResults: ${pass}/${cases.length}`);
process.exit(pass === cases.length ? 0 : 1);
