#!/usr/bin/env node
/**
 * MSM Portal Design System Validation Runner
 *
 * Checks source files against the design system rules defined in:
 *   - validation-runner.json (29 checks)
 *   - conventions.json (12 constraints with regex)
 *
 * Usage:
 *   npx tsx design-system/scripts/validate.ts src/apps/msm-default/component/order/
 *   npx tsx design-system/scripts/validate.ts src/apps/msm-default/container/order/list/OrderListContainer.tsx
 *   npx tsx design-system/scripts/validate.ts --help
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Severity = "error" | "warning";

interface Violation {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  file: string;
  line: number | null;
  detail: string;
  fix: string;
}

interface PassedCheck {
  ruleId: string;
  ruleName: string;
  file: string;
  detail: string;
}

interface FileLayer {
  kind: "page" | "container" | "component" | "other";
}

interface TokenDeviation {
  found: string;
  correct: string;
  reason?: string;
}

interface ComponentDependencyEntry {
  requires?: string[];
  optional?: string[];
  must_be_inside?: string[];
  notes?: string;
}

interface UXWritingPhraseRule {
  id: string;
  locale: string;
  match_type: "includes" | "exact";
  value: string;
  severity?: Severity;
  message: string;
  suggestion: string;
}

interface UXWritingGenericCtaRule {
  id: string;
  locale: string;
  key_suffixes: string[];
  exact_values: string[];
  severity?: Severity;
  message: string;
  suggestion: string;
}

interface UXWritingConfig {
  machine_checks?: {
    discouraged_phrases?: UXWritingPhraseRule[];
    generic_cta_rules?: UXWritingGenericCtaRule[];
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectFiles(target: string): string[] {
  const resolved = path.resolve(target);
  if (!fs.existsSync(resolved)) {
    console.error(`Path not found: ${resolved}`);
    process.exit(1);
  }
  const stat = fs.statSync(resolved);
  if (stat.isFile()) {
    return [resolved];
  }
  const results: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        results.push(full);
      }
    }
  }
  walk(resolved);
  return results;
}

function isTsxFile(f: string): boolean {
  return f.endsWith(".tsx");
}

function isTsOrTsxFile(f: string): boolean {
  return f.endsWith(".ts") || f.endsWith(".tsx");
}

function isExcluded(f: string): boolean {
  const base = path.basename(f);
  return (
    base.includes(".test.") ||
    base.includes(".spec.") ||
    base.includes(".mock.") ||
    base === "tokens.json"
  );
}

function isStoryFile(f: string): boolean {
  return path.basename(f).includes(".stories.");
}

function detectLayer(filePath: string): FileLayer {
  if (/\/page\//.test(filePath)) return { kind: "page" };
  if (/\/container\//.test(filePath)) return { kind: "container" };
  if (/\/component\//.test(filePath)) return { kind: "component" };
  return { kind: "other" };
}

let componentDependencyCache: Record<string, ComponentDependencyEntry> | null = null;
let uxWritingConfigCache: UXWritingConfig | null = null;

function loadComponentDependencies(): Record<string, ComponentDependencyEntry> {
  if (componentDependencyCache) {
    return componentDependencyCache;
  }

  try {
    const dependenciesPath = path.resolve(__dirname, "../src/component-dependencies.json");
    const dependenciesData = JSON.parse(fs.readFileSync(dependenciesPath, "utf-8"));
    componentDependencyCache = dependenciesData.components ?? {};
  } catch {
    componentDependencyCache = {};
  }

  return componentDependencyCache;
}

function getFormikRequiredComponents(): string[] {
  const dependencies = loadComponentDependencies();
  const fromDependencies = Object.entries(dependencies)
    .filter(([name, entry]) => {
      if (!name.startsWith("MC")) return false;
      const requiresFormik = entry.requires?.includes("Formik") ?? false;
      const insideFormik = entry.must_be_inside?.includes("Formik context") ?? false;
      return requiresFormik || insideFormik;
    })
    .map(([name]) => name);

  if (fromDependencies.length > 0) {
    return fromDependencies;
  }

  return [
    "MCFormTextInput",
    "MCFormTextArea",
    "MCFormNumberInput",
    "MCFormCheckBox",
    "MCFormSwitchInput",
    "MCFormRadioGroup",
    "MCFormSingleRichSelect",
    "MCFormMultiRichSelect",
    "MCFormCardSelect",
    "MCFormInlineChipRichSelect",
    "MCFormDateRangePicker",
    "MCFormDateTimeRangePicker",
    "MCFormColorInput",
    "MCFormChipInput",
    "MCFormWeeklyTimeTablePicker",
    "MCFormOptionalFrequencyInput",
    "MCFormSkippableVideoInput",
  ];
}

function loadUxWritingConfig(): UXWritingConfig {
  if (uxWritingConfigCache) {
    return uxWritingConfigCache;
  }

  try {
    const uxWritingPath = path.resolve(__dirname, "../src/ux-writing.json");
    uxWritingConfigCache = JSON.parse(fs.readFileSync(uxWritingPath, "utf-8"));
  } catch {
    uxWritingConfigCache = {};
  }

  return uxWritingConfigCache;
}

function getLocaleAssetFiles(): string[] {
  const assetsRoot = path.resolve(__dirname, "../../msm-portal/js/msm-portal-web/src/i18n/assets");
  if (!fs.existsSync(assetsRoot)) return [];

  return collectFiles(assetsRoot).filter((file) => file.endsWith(".json"));
}

function inferLocaleFromPath(filePath: string): string | null {
  const normalized = filePath.replaceAll(path.sep, "/");
  if (normalized.includes("/i18n/assets/en/")) return "en";
  if (normalized.includes("/i18n/assets/ko/")) return "ko";
  return null;
}

function flattenLocaleStrings(obj: unknown, prefix: string = ""): Array<{ keyPath: string; value: string }> {
  if (typeof obj === "string") {
    return [{ keyPath: prefix, value: obj }];
  }

  if (typeof obj !== "object" || obj === null) {
    return [];
  }

  const results: Array<{ keyPath: string; value: string }> = [];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    results.push(...flattenLocaleStrings(value, nextPrefix));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Individual Check Implementations
// ---------------------------------------------------------------------------

function checkNoHardcodedColors(
  filePath: string,
  lines: string[]
): { violations: Violation[]; passed: boolean } {
  if (!isTsOrTsxFile(filePath) || isExcluded(filePath)) return { violations: [], passed: true };
  const violations: Violation[] = [];
  const regex = /#([0-9A-Fa-f]{3,8})\b/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments and import lines
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*") || line.trimStart().startsWith("import ")) continue;
    let match: RegExpExecArray | null;
    regex.lastIndex = 0;
    while ((match = regex.exec(line)) !== null) {
      violations.push({
        ruleId: "style-no-hex",
        ruleName: "No hardcoded colors",
        severity: "error",
        file: filePath,
        line: i + 1,
        detail: `Hardcoded color: ${match[0]}`,
        fix: "Replace with props.theme.mcui.palette.* token (e.g., props.theme.mcui.palette.background.primary)",
      });
    }
  }
  return { violations, passed: violations.length === 0 };
}

function checkNoHardcodedSpacing(
  filePath: string,
  lines: string[]
): { violations: Violation[]; passed: boolean } {
  if (!isTsOrTsxFile(filePath) || isExcluded(filePath)) return { violations: [], passed: true };
  const violations: Violation[] = [];
  const regex = /(padding|margin|gap):\s*\d+px/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      const pxVal = match[0].match(/(\d+)px/);
      const n = pxVal ? Math.round(parseInt(pxVal[1], 10) / 8) : "n";
      violations.push({
        ruleId: "style-no-px-spacing",
        ruleName: "No hardcoded spacing",
        severity: "error",
        file: filePath,
        line: i + 1,
        detail: `Hardcoded spacing: ${match[0]}`,
        fix: `Replace with \${props => props.theme.mcui.spacing(${n})}`,
      });
    }
  }
  return { violations, passed: violations.length === 0 };
}

function checkNoHardcodedFonts(
  filePath: string,
  lines: string[]
): { violations: Violation[]; passed: boolean } {
  if (!isTsOrTsxFile(filePath) || isExcluded(filePath)) return { violations: [], passed: true };
  const violations: Violation[] = [];
  const regex = /font-size:\s*\d+(px|rem|em)/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      violations.push({
        ruleId: "style-no-px-fonts",
        ruleName: "No hardcoded font sizes",
        severity: "error",
        file: filePath,
        line: i + 1,
        detail: `Hardcoded font size: ${match[0]}`,
        fix: "Replace with props.theme.mcui.typography.* token (e.g., props.theme.mcui.typography.BODY_1_BODY.size)",
      });
    }
  }
  return { violations, passed: violations.length === 0 };
}

function checkNoInlineStyles(
  filePath: string,
  lines: string[]
): { violations: Violation[]; passed: boolean } {
  if (!isTsxFile(filePath) || isExcluded(filePath) || isStoryFile(filePath)) return { violations: [], passed: true };
  const violations: Violation[] = [];
  const regex = /style=\{\{/g;
  for (let i = 0; i < lines.length; i++) {
    regex.lastIndex = 0;
    if (regex.test(lines[i])) {
      violations.push({
        ruleId: "style-no-inline",
        ruleName: "No inline styles",
        severity: "error",
        file: filePath,
        line: i + 1,
        detail: `Inline style prop: style={{...}}`,
        fix: "Use styled-components with SC* prefix (e.g., const SCWrapper = styled.div`...`)",
      });
    }
  }
  return { violations, passed: violations.length === 0 };
}

function checkScPrefix(
  filePath: string,
  lines: string[]
): { violations: Violation[]; passed: boolean } {
  if (!isTsOrTsxFile(filePath) || isExcluded(filePath)) return { violations: [], passed: true };
  const violations: Violation[] = [];
  // Match: const SomeName = styled. but NOT const SC* = styled.
  const regex = /^(\s*)const ([A-Z][a-zA-Z]+)\s*=\s*styled\./;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(regex);
    if (match) {
      const name = match[2];
      if (!name.startsWith("SC")) {
        violations.push({
          ruleId: "style-sc-prefix",
          ruleName: "Styled components use SC prefix",
          severity: "error",
          file: filePath,
          line: i + 1,
          detail: `Styled component "${name}" missing SC prefix`,
          fix: `Rename to SC${name} (e.g., const SC${name} = styled....)`,
        });
      }
    }
  }
  return { violations, passed: violations.length === 0 };
}

function checkI18nHardcoded(
  filePath: string,
  lines: string[]
): { violations: Violation[]; passed: boolean } {
  if (!isTsxFile(filePath) || isExcluded(filePath) || isStoryFile(filePath)) return { violations: [], passed: true };
  const violations: Violation[] = [];
  // Conservative JSX text check: only flag inline text that clearly sits between an opening tag
  // and a closing tag on the same line. This avoids false positives on TS generic syntax
  // such as Promise<unknown> in type annotations.
  const regex = />\s*([A-Z][a-zA-Z\s]{2,})\s*<\//g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      const text = match[1].trim();
      // Skip common non-user-facing patterns
      if (/^(SC|MC|MT|ME|React|Component|Container|Page|Props|Type|Interface)/.test(text)) continue;
      violations.push({
        ruleId: "i18n-no-hardcoded",
        ruleName: "No hardcoded user-facing strings",
        severity: "error",
        file: filePath,
        line: i + 1,
        detail: `Hardcoded string in JSX: "${text}"`,
        fix: "Replace with {t('key.path')} using useTranslation hook",
      });
    }
  }
  return { violations, passed: violations.length === 0 };
}

function checkFormikContext(
  filePath: string,
  content: string
): { violations: Violation[]; passed: boolean } {
  if (!isTsxFile(filePath) || isExcluded(filePath) || isStoryFile(filePath)) return { violations: [], passed: true };
  const violations: Violation[] = [];
  const mcFormComponents = getFormikRequiredComponents();
  const usesFormComponent = mcFormComponents.some((c) => content.includes(c));
  if (!usesFormComponent) return { violations: [], passed: true };

  const hasFormik =
    content.includes("Formik") ||
    content.includes("<Form") ||
    content.includes("useFormik") ||
    content.includes("useFormikContext");

  if (!hasFormik) {
    // Find the first line that uses an MCForm* component
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const comp of mcFormComponents) {
        if (lines[i].includes(`<${comp}`)) {
          violations.push({
            ruleId: "comp-formik-context",
            ruleName: "Form inputs inside Formik",
            severity: "error",
            file: filePath,
            line: i + 1,
            detail: `${comp} used without Formik context in this file`,
            fix: "Wrap in <Formik initialValues={...} validationSchema={...} onSubmit={...}> or ensure parent component provides Formik context",
          });
          break; // one violation per line
        }
      }
    }
  }
  return { violations, passed: violations.length === 0 };
}

function checkNoDirectMcSingleInput(
  filePath: string,
  lines: string[]
): { violations: Violation[]; passed: boolean } {
  if (!isTsxFile(filePath) || isExcluded(filePath)) return { violations: [], passed: true };
  const violations: Violation[] = [];
  // Only flag in files that look like form files
  const content = lines.join("\n");
  const isFormFile =
    content.includes("Formik") ||
    content.includes("MCForm") ||
    /\/form\//i.test(filePath);
  if (!isFormFile) return { violations: [], passed: true };

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("MCSingleTextInput")) {
      violations.push({
        ruleId: "comp-no-direct-mcsingleinput",
        ruleName: "No MCSingleTextInput in forms",
        severity: "error",
        file: filePath,
        line: i + 1,
        detail: "MCSingleTextInput used in form context",
        fix: "Replace with MCFormTextInput which provides Formik integration, label, error display, and accessibility",
      });
    }
  }
  return { violations, passed: violations.length === 0 };
}

function checkArchPageThin(
  filePath: string,
  lines: string[],
  content: string
): { violations: Violation[]; passed: PassedCheck | null } {
  const layer = detectLayer(filePath);
  if (layer.kind !== "page" || !isTsxFile(filePath)) return { violations: [], passed: null };

  const violations: Violation[] = [];
  const hookPatterns = [
    "useState",
    "useEffect",
    "useQuery",
    "useNavigate",
    "useTranslation",
    "useEntityParam",
    "useMemo",
    "useCallback",
  ];

  for (const hook of hookPatterns) {
    // Check actual usage, not just imports of Container that happen to contain the word
    const useRegex = new RegExp(`\\b${hook}\\b`);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;
      // Skip import lines - we care about usage, not re-exports
      if (line.trimStart().startsWith("import ")) continue;
      if (useRegex.test(line)) {
        violations.push({
          ruleId: "arch-page-thin",
          ruleName: "Page is thin wrapper",
          severity: "error",
          file: filePath,
          line: i + 1,
          detail: `Page file uses hook: ${hook}`,
          fix: `Move ${hook} to Container (MC{Entity}{Action}Container.tsx)`,
        });
      }
    }
  }

  if (violations.length === 0) {
    return {
      violations: [],
      passed: {
        ruleId: "arch-page-thin",
        ruleName: "Page is thin wrapper",
        file: filePath,
        detail: `${lines.length} lines`,
      },
    };
  }
  return { violations, passed: null };
}

function checkArchComponentPure(
  filePath: string,
  lines: string[]
): { violations: Violation[]; passed: boolean } {
  const layer = detectLayer(filePath);
  if (layer.kind !== "component" || !isTsxFile(filePath) || isExcluded(filePath))
    return { violations: [], passed: true };

  const violations: Violation[] = [];
  const forbidden = [
    { pattern: /trpc\./, name: "tRPC call" },
    { pattern: /msmAPI\./, name: "msmAPI call" },
    { pattern: /useNavigate\(\)/, name: "useNavigate" },
    { pattern: /useEntityParam/, name: "useEntityParam" },
    { pattern: /\bfetch\(/, name: "fetch() call" },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*") || line.trimStart().startsWith("import ")) continue;
    for (const f of forbidden) {
      if (f.pattern.test(line)) {
        violations.push({
          ruleId: "arch-component-pure",
          ruleName: "Component is pure UI",
          severity: "error",
          file: filePath,
          line: i + 1,
          detail: `Component contains ${f.name}`,
          fix: "Move data fetching and hooks from Component to Container, pass computed values as props",
        });
      }
    }
  }
  return { violations, passed: violations.length === 0 };
}

function checkArchContainerData(
  filePath: string,
  lines: string[]
): { violations: Violation[]; passed: boolean } {
  // This check is informational: verify container HAS the data hooks
  // We only flag components that have them (handled by arch-component-pure)
  // So this is a pass-through for containers
  return { violations: [], passed: true };
}

function checkImportOrder(
  filePath: string,
  lines: string[]
): { violations: Violation[]; passed: boolean } {
  if (!isTsOrTsxFile(filePath) || isExcluded(filePath)) return { violations: [], passed: true };

  const violations: Violation[] = [];
  const importLines: { line: number; text: string; group: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("import ")) continue;

    let importText = line;
    let j = i;
    while (!importText.includes(";") && j + 1 < lines.length) {
      j += 1;
      importText += ` ${lines[j].trim()}`;
    }

    // Stop at first non-import (skip blank lines between imports)
    let group: number;
    if (/from\s+['"]react['"]/.test(importText) || /from\s+['"]react-dom['"]/.test(importText)) {
      group = 1; // React
    } else if (/from\s+['"]@moloco\//.test(importText)) {
      group = 3; // Moloco UI
    } else if (/from\s+['"]@msm-portal\//.test(importText)) {
      group = 4; // Internal
    } else if (/from\s+['"]\./.test(importText)) {
      group = 5; // Relative
    } else {
      group = 2; // Third-party
    }
    importLines.push({ line: i + 1, text: importText, group });
    i = j;
  }

  // Check that groups are non-decreasing
  for (let i = 1; i < importLines.length; i++) {
    if (importLines[i].group < importLines[i - 1].group) {
      violations.push({
        ruleId: "import-order",
        ruleName: "Import order",
        severity: "warning",
        file: filePath,
        line: importLines[i].line,
        detail: `Import out of order: group ${importLines[i].group} after group ${importLines[i - 1].group}`,
        fix: "Reorder imports: (1) React (2) third-party (3) @moloco/* (4) @msm-portal/* (5) relative ./",
      });
      break; // Report once per file
    }
  }
  return { violations, passed: violations.length === 0 };
}

function checkNoRawPublicUiImports(
  filePath: string,
  lines: string[]
): { violations: Violation[]; passed: boolean } {
  if (!isTsOrTsxFile(filePath) || isExcluded(filePath)) return { violations: [], passed: true };

  const normalizedPath = filePath.replaceAll(path.sep, "/");
  const isProductLayerFile =
    normalizedPath.includes("/msm-portal/js/msm-portal-web/src/apps/") ||
    normalizedPath.includes("/msm-portal/js/msm-portal-web/src/common/");

  if (!isProductLayerFile) return { violations: [], passed: true };

  const violations: Violation[] = [];
  const forbiddenImportPatterns = [
    { regex: /from\s+['"]@radix-ui\//, label: "Radix UI import" },
    { regex: /from\s+['"][^'"]*components\/ui\//, label: "raw UI component import" },
    { regex: /from\s+['"]class-variance-authority['"]/, label: "class-variance-authority import" },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("import ")) continue;

    for (const pattern of forbiddenImportPatterns) {
      if (pattern.regex.test(line)) {
        violations.push({
          ruleId: "contract-no-raw-public-ui",
          ruleName: "No raw public UI imports",
          severity: "error",
          file: filePath,
          line: i + 1,
          detail: `${pattern.label} found in product-facing code`,
          fix: "Use stable MC* contracts in product code. Keep raw implementation imports inside adapter or implementation layers.",
        });
      }
    }
  }

  return { violations, passed: violations.length === 0 };
}

const KNOWN_TOKEN_DEVIATIONS: TokenDeviation[] = (() => {
  try {
    const tokensPath = path.resolve(__dirname, "../src/tokens.json");
    const tokensData = JSON.parse(fs.readFileSync(tokensPath, "utf-8"));
    const deviations = tokensData.codebase_deviations?.deviations;

    if (!Array.isArray(deviations)) return [];

    return deviations
      .filter((entry): entry is TokenDeviation => {
        return typeof entry?.found === "string" && typeof entry?.correct === "string";
      })
      .map((entry) => ({
        found: entry.found,
        correct: entry.correct,
        reason: typeof entry.reason === "string" ? entry.reason : undefined,
      }));
  } catch {
    return [];
  }
})();

function checkSemanticTokenPreference(
  filePath: string,
  lines: string[]
): { violations: Violation[]; passed: boolean } {
  if (!isTsOrTsxFile(filePath) || isExcluded(filePath)) return { violations: [], passed: true };
  if (KNOWN_TOKEN_DEVIATIONS.length === 0) return { violations: [], passed: true };

  const normalizedPath = filePath.replaceAll(path.sep, "/");
  const isProductLayerFile =
    normalizedPath.includes("/msm-portal/js/msm-portal-web/src/apps/") ||
    normalizedPath.includes("/msm-portal/js/msm-portal-web/src/common/");

  if (!isProductLayerFile) return { violations: [], passed: true };

  const violations: Violation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

    for (const deviation of KNOWN_TOKEN_DEVIATIONS) {
      if (!line.includes(deviation.found)) continue;

      const reasonSuffix = deviation.reason ? ` (${deviation.reason})` : "";

      violations.push({
        ruleId: "contract-prefer-semantic-token-meaning",
        ruleName: "Prefer semantic token meaning",
        severity: "warning",
        file: filePath,
        line: i + 1,
        detail: `Legacy token path "${deviation.found}" should be replaced with "${deviation.correct}"${reasonSuffix}`,
        fix: `Replace ${deviation.found} with ${deviation.correct}`,
      });
    }
  }

  return { violations, passed: violations.length === 0 };
}

function checkTransientProps(
  filePath: string,
  lines: string[]
): { violations: Violation[]; passed: boolean } {
  if (!isTsOrTsxFile(filePath) || isExcluded(filePath)) return { violations: [], passed: true };
  const violations: Violation[] = [];

  // Look for styled component type params with non-$ props
  // Pattern: styled.div<{ someNonHtmlProp: ... }>
  const styledRegex = /styled\.\w+<\{([^}]+)\}>/;
  const htmlAttrs = new Set([
    "id", "className", "style", "title", "role", "tabIndex", "hidden",
    "disabled", "type", "name", "value", "checked", "placeholder",
    "href", "src", "alt", "width", "height", "children", "key", "ref",
    "onClick", "onChange", "onSubmit", "onFocus", "onBlur", "onKeyDown",
    "onMouseEnter", "onMouseLeave", "aria-label", "aria-hidden", "data-testid",
    "htmlFor", "autoComplete", "readOnly", "required", "max", "min", "step",
    "target", "rel", "as",
  ]);

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(styledRegex);
    if (match) {
      const propsStr = match[1];
      // Extract prop names: "isActive: boolean; size: number" -> ["isActive", "size"]
      const propNames = propsStr
        .split(/[;,]/)
        .map((p) => p.trim().split(/[:\s?]/)[0].trim())
        .filter(Boolean);
      for (const prop of propNames) {
        if (!prop.startsWith("$") && !htmlAttrs.has(prop)) {
          violations.push({
            ruleId: "style-transient-props",
            ruleName: "Non-HTML props use $ prefix",
            severity: "error",
            file: filePath,
            line: i + 1,
            detail: `Styled component prop "${prop}" is not prefixed with $`,
            fix: `Rename to $${prop} in both the styled component definition and JSX usage`,
          });
        }
      }
    }
  }
  return { violations, passed: violations.length === 0 };
}

function checkLoadingState(
  filePath: string,
  content: string
): { violations: Violation[]; passed: boolean } {
  const layer = detectLayer(filePath);
  if (layer.kind !== "container" || !isTsxFile(filePath) || isExcluded(filePath))
    return { violations: [], passed: true };

  // Only check containers that do data fetching
  const doesFetch = /useQuery|useMutation|trpc\.|msmAPI\./.test(content);
  if (!doesFetch) return { violations: [], passed: true };

  const hasLoadingCheck =
    /isFetching|isLoading/.test(content) &&
    /MCCircularLoader|MCLoader/.test(content);

  if (!hasLoadingCheck) {
    return {
      violations: [
        {
          ruleId: "state-loading",
          ruleName: "Loading state handled",
          severity: "error",
          file: filePath,
          line: null,
          detail: "Container fetches data but has no loading state handling",
          fix: "Add: if (isLoading) return <MCCircularLoader fillParent />;",
        },
      ],
      passed: false,
    };
  }
  return { violations: [], passed: true };
}

function checkErrorState(
  filePath: string,
  content: string
): { violations: Violation[]; passed: boolean } {
  const layer = detectLayer(filePath);
  if (layer.kind !== "container" || !isTsxFile(filePath) || isExcluded(filePath))
    return { violations: [], passed: true };

  const doesFetch = /useQuery|trpc\.|msmAPI\./.test(content);
  if (!doesFetch) return { violations: [], passed: true };

  const hasErrorHandling = /fireCollapsibleError|useInAppAlert/.test(content);

  if (!hasErrorHandling) {
    return {
      violations: [
        {
          ruleId: "state-error",
          ruleName: "Error state handled",
          severity: "error",
          file: filePath,
          line: null,
          detail: "Container fetches data but has no error handling",
          fix: "Add error handling with useInAppAlert: fireCollapsibleError({ summary: t('message.read.error'), error })",
        },
      ],
      passed: false,
    };
  }
  return { violations: [], passed: true };
}

function checkSubmitDisabled(
  filePath: string,
  content: string,
  lines: string[]
): { violations: Violation[]; passed: boolean } {
  if (!isTsxFile(filePath) || isExcluded(filePath)) return { violations: [], passed: true };

  // Only check files with forms
  const hasForm = /Formik|<Form/.test(content);
  const hasSubmitButton = /type=["']submit["']/.test(content);
  if (!hasForm || !hasSubmitButton) return { violations: [], passed: true };

  const hasDisabledSubmit = /disabled=\{.*isSubmitting/.test(content);
  if (!hasDisabledSubmit) {
    // Find the submit button line
    let submitLine: number | null = null;
    for (let i = 0; i < lines.length; i++) {
      if (/type=["']submit["']/.test(lines[i])) {
        submitLine = i + 1;
        break;
      }
    }
    return {
      violations: [
        {
          ruleId: "state-submit-disabled",
          ruleName: "Submit button disabled during submission",
          severity: "error",
          file: filePath,
          line: submitLine,
          detail: "Submit button lacks disabled={isSubmitting}",
          fix: 'Add disabled={isSubmitting} to the submit button: <MCButton2 variant="contained" type="submit" disabled={isSubmitting}>',
        },
      ],
      passed: false,
    };
  }
  return { violations: [], passed: true };
}

function checkSuccessFeedback(
  filePath: string,
  content: string
): { violations: Violation[]; passed: boolean } {
  const layer = detectLayer(filePath);
  if (layer.kind !== "container" || !isTsxFile(filePath) || isExcluded(filePath))
    return { violations: [], passed: true };

  const hasMutation = /useMutation|mutate\(|mutateAsync/.test(content);
  if (!hasMutation) return { violations: [], passed: true };

  const hasSuccessFeedback = /fireSuccess/.test(content);
  if (!hasSuccessFeedback) {
    return {
      violations: [
        {
          ruleId: "state-success-feedback",
          ruleName: "Success feedback provided",
          severity: "error",
          file: filePath,
          line: null,
          detail: "Container has mutation but no success feedback",
          fix: "Add: fireSuccess(t('message.create.success')); then navigate to list/detail page",
        },
      ],
      passed: false,
    };
  }
  return { violations: [], passed: true };
}

// ---------------------------------------------------------------------------
// Main Runner
// ---------------------------------------------------------------------------

function runChecks(filePath: string, content: string, lines: string[]): {
  violations: Violation[];
  passedChecks: PassedCheck[];
} {
  const violations: Violation[] = [];
  const passedChecks: PassedCheck[] = [];

  const checks: Array<{
    id: string;
    name: string;
    fn: () => { violations: Violation[]; passed: boolean | PassedCheck | null };
  }> = [
    {
      id: "style-no-hex",
      name: "No hardcoded colors",
      fn: () => {
        const r = checkNoHardcodedColors(filePath, lines);
        return { violations: r.violations, passed: r.passed };
      },
    },
    {
      id: "style-no-px-spacing",
      name: "No hardcoded spacing",
      fn: () => {
        const r = checkNoHardcodedSpacing(filePath, lines);
        return { violations: r.violations, passed: r.passed };
      },
    },
    {
      id: "style-no-px-fonts",
      name: "No hardcoded font sizes",
      fn: () => {
        const r = checkNoHardcodedFonts(filePath, lines);
        return { violations: r.violations, passed: r.passed };
      },
    },
    {
      id: "style-no-inline",
      name: "No inline styles",
      fn: () => {
        const r = checkNoInlineStyles(filePath, lines);
        return { violations: r.violations, passed: r.passed };
      },
    },
    {
      id: "style-sc-prefix",
      name: "Styled components use SC prefix",
      fn: () => {
        const r = checkScPrefix(filePath, lines);
        return { violations: r.violations, passed: r.passed };
      },
    },
    {
      id: "style-transient-props",
      name: "Non-HTML props use $ prefix",
      fn: () => {
        const r = checkTransientProps(filePath, lines);
        return { violations: r.violations, passed: r.passed };
      },
    },
    {
      id: "i18n-no-hardcoded",
      name: "No hardcoded user-facing strings",
      fn: () => {
        const r = checkI18nHardcoded(filePath, lines);
        return { violations: r.violations, passed: r.passed };
      },
    },
    {
      id: "comp-formik-context",
      name: "Form inputs inside Formik",
      fn: () => {
        const r = checkFormikContext(filePath, content);
        return { violations: r.violations, passed: r.passed };
      },
    },
    {
      id: "comp-no-direct-mcsingleinput",
      name: "No MCSingleTextInput in forms",
      fn: () => {
        const r = checkNoDirectMcSingleInput(filePath, lines);
        return { violations: r.violations, passed: r.passed };
      },
    },
    {
      id: "arch-page-thin",
      name: "Page is thin wrapper",
      fn: () => {
        const r = checkArchPageThin(filePath, lines, content);
        return { violations: r.violations, passed: r.passed };
      },
    },
    {
      id: "arch-component-pure",
      name: "Component is pure UI",
      fn: () => {
        const r = checkArchComponentPure(filePath, lines);
        return { violations: r.violations, passed: r.passed };
      },
    },
    {
      id: "import-order",
      name: "Import order",
      fn: () => {
        const r = checkImportOrder(filePath, lines);
        return { violations: r.violations, passed: r.passed };
      },
    },
    {
      id: "contract-no-raw-public-ui",
      name: "No raw public UI imports",
      fn: () => {
        const r = checkNoRawPublicUiImports(filePath, lines);
        return { violations: r.violations, passed: r.passed };
      },
    },
    {
      id: "contract-prefer-semantic-token-meaning",
      name: "Prefer semantic token meaning",
      fn: () => {
        const r = checkSemanticTokenPreference(filePath, lines);
        return { violations: r.violations, passed: r.passed };
      },
    },
    {
      id: "state-loading",
      name: "Loading state handled",
      fn: () => {
        const r = checkLoadingState(filePath, content);
        return { violations: r.violations, passed: r.passed };
      },
    },
    {
      id: "state-error",
      name: "Error state handled",
      fn: () => {
        const r = checkErrorState(filePath, content);
        return { violations: r.violations, passed: r.passed };
      },
    },
    {
      id: "state-submit-disabled",
      name: "Submit button disabled during submission",
      fn: () => {
        const r = checkSubmitDisabled(filePath, content, lines);
        return { violations: r.violations, passed: r.passed };
      },
    },
    {
      id: "state-success-feedback",
      name: "Success feedback provided",
      fn: () => {
        const r = checkSuccessFeedback(filePath, content);
        return { violations: r.violations, passed: r.passed };
      },
    },
    {
      id: "token-exists",
      name: "Typography tokens exist",
      fn: () => {
        const r = checkTokenExists(filePath, lines);
        return { violations: r.violations, passed: r.passed };
      },
    },
  ];

  for (const check of checks) {
    const result = check.fn();
    violations.push(...result.violations);
    if (result.passed === true) {
      passedChecks.push({
        ruleId: check.id,
        ruleName: check.name,
        file: filePath,
        detail: "OK",
      });
    } else if (result.passed && typeof result.passed === "object" && result.passed !== null) {
      passedChecks.push(result.passed as PassedCheck);
    }
  }

  return { violations, passedChecks };
}

// ---------------------------------------------------------------------------
// P2: Token Exists Check — verify typography tokens used in code exist in tokens.json
// ---------------------------------------------------------------------------

const VALID_TYPOGRAPHY_TOKENS: Set<string> = (() => {
  try {
    const tokensPath = path.resolve(__dirname, "../src/tokens.json");
    const tokensData = JSON.parse(fs.readFileSync(tokensPath, "utf-8"));
    const names = new Set<string>();
    if (tokensData.typography?.tokens) {
      for (const entry of tokensData.typography.tokens) {
        if (entry.name) names.add(entry.name);
      }
    }
    return names;
  } catch {
    return new Set<string>();
  }
})();

function checkTokenExists(
  filePath: string,
  lines: string[]
): { violations: Violation[]; passed: boolean } {
  if (!isTsOrTsxFile(filePath) || isExcluded(filePath)) return { violations: [], passed: true };
  if (VALID_TYPOGRAPHY_TOKENS.size === 0) return { violations: [], passed: true };

  const violations: Violation[] = [];
  const regex = /theme\.mcui\.typography\.([A-Z][A-Z0-9_]+)\b/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      const tokenName = match[1];
      // Skip if accessing a sub-property like .size or .fontWeight directly on the match
      if (!VALID_TYPOGRAPHY_TOKENS.has(tokenName)) {
        violations.push({
          ruleId: "token-exists",
          ruleName: "Typography token exists",
          severity: "error",
          file: filePath,
          line: i + 1,
          detail: `Unknown typography token: ${tokenName}. Available: ${[...VALID_TYPOGRAPHY_TOKENS].slice(0, 5).join(", ")}...`,
          fix: `Check design-system/src/tokens.json for valid typography token names`,
        });
      }
    }
  }
  return { violations, passed: violations.length === 0 };
}

// ---------------------------------------------------------------------------
// P1: i18n Bilingual Check — verify en/ko sot-resource.json have matching keys
// ---------------------------------------------------------------------------

function checkI18nBilingual(): { violations: Violation[]; passed: PassedCheck[] } {
  const violations: Violation[] = [];
  const passed: PassedCheck[] = [];

  const basePath = path.resolve(__dirname, "../../msm-portal/js/msm-portal-web/src/i18n/assets");
  const enPath = path.join(basePath, "en/sot-resource.json");
  const koPath = path.join(basePath, "ko/sot-resource.json");

  if (!fs.existsSync(enPath) || !fs.existsSync(koPath)) {
    return { violations, passed };
  }

  let enData: Record<string, unknown>;
  let koData: Record<string, unknown>;
  try {
    enData = JSON.parse(fs.readFileSync(enPath, "utf-8"));
    koData = JSON.parse(fs.readFileSync(koPath, "utf-8"));
  } catch {
    return { violations, passed };
  }

  const enKeys = new Set(Object.keys(enData));
  const koKeys = new Set(Object.keys(koData));

  const missingInKo: string[] = [];
  for (const key of enKeys) {
    if (!koKeys.has(key)) {
      missingInKo.push(key);
    }
  }

  const missingInEn: string[] = [];
  for (const key of koKeys) {
    if (!enKeys.has(key)) {
      missingInEn.push(key);
    }
  }

  // Check nested key parity for matching top-level keys
  function flattenKeys(obj: unknown, prefix: string = ""): string[] {
    if (typeof obj !== "object" || obj === null) return [prefix];
    const keys: string[] = [];
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      keys.push(...flattenKeys(v, prefix ? `${prefix}.${k}` : k));
    }
    return keys;
  }

  const nestedMissing: string[] = [];
  for (const key of enKeys) {
    if (koKeys.has(key)) {
      const enNested = new Set(flattenKeys(enData[key], key));
      const koNested = new Set(flattenKeys(koData[key], key));
      for (const nk of enNested) {
        if (!koNested.has(nk)) {
          nestedMissing.push(nk);
        }
      }
    }
  }

  if (missingInKo.length > 0) {
    for (const key of missingInKo) {
      violations.push({
        ruleId: "i18n-bilingual",
        ruleName: "i18n bilingual parity",
        severity: "error",
        file: "sot-resource.json (ko)",
        line: null,
        detail: `Namespace "${key}" exists in en but missing in ko`,
        fix: `Add "${key}" to ko/sot-resource.json. Use [TODO: translate] if translation unknown.`,
      });
    }
  }

  if (nestedMissing.length > 0) {
    for (const key of nestedMissing.slice(0, 10)) {
      violations.push({
        ruleId: "i18n-bilingual-nested",
        ruleName: "i18n bilingual nested key parity",
        severity: "warning",
        file: "sot-resource.json (ko)",
        line: null,
        detail: `Key "${key}" exists in en but missing in ko`,
        fix: `Add the missing key to ko/sot-resource.json`,
      });
    }
    if (nestedMissing.length > 10) {
      violations.push({
        ruleId: "i18n-bilingual-nested",
        ruleName: "i18n bilingual nested key parity",
        severity: "warning",
        file: "sot-resource.json (ko)",
        line: null,
        detail: `... and ${nestedMissing.length - 10} more missing nested keys`,
        fix: `Run with --json for full list`,
      });
    }
  }

  if (violations.length === 0) {
    passed.push({
      ruleId: "i18n-bilingual",
      ruleName: "i18n bilingual parity",
      file: "sot-resource.json",
      detail: `en: ${enKeys.size} namespaces, ko: ${koKeys.size} namespaces — all matched`,
    });
  }

  return { violations, passed };
}

function checkUxWritingConsistency(): { violations: Violation[]; passed: PassedCheck[] } {
  const violations: Violation[] = [];
  const passed: PassedCheck[] = [];
  const config = loadUxWritingConfig();
  const discouragedPhraseRules = config.machine_checks?.discouraged_phrases ?? [];
  const genericCtaRules = config.machine_checks?.generic_cta_rules ?? [];
  const localeFiles = getLocaleAssetFiles();

  if (localeFiles.length === 0) {
    return { violations, passed };
  }

  for (const localeFile of localeFiles) {
    const locale = inferLocaleFromPath(localeFile);
    if (!locale) continue;

    let localeData: unknown;
    try {
      localeData = JSON.parse(fs.readFileSync(localeFile, "utf-8"));
    } catch {
      continue;
    }

    const flatEntries = flattenLocaleStrings(localeData);
    for (const entry of flatEntries) {
      const normalizedValue = entry.value.trim();
      const comparableValue =
        locale === "en" ? normalizedValue.toLowerCase() : normalizedValue;

      for (const rule of discouragedPhraseRules) {
        if (rule.locale !== locale) continue;
        const comparableRuleValue =
          locale === "en" ? rule.value.toLowerCase() : rule.value;
        const matched =
          rule.match_type === "exact"
            ? comparableValue === comparableRuleValue
            : comparableValue.includes(comparableRuleValue);

        if (!matched) continue;

        violations.push({
          ruleId: "uxw-discouraged-phrases",
          ruleName: "Discouraged UX writing phrases",
          severity: rule.severity ?? "warning",
          file: localeFile,
          line: null,
          detail: `${entry.keyPath} uses discouraged wording "${normalizedValue}". ${rule.message}`,
          fix: rule.suggestion,
        });
      }

      for (const rule of genericCtaRules) {
        if (rule.locale !== locale) continue;
        const keyMatched = rule.key_suffixes.some((suffix) => entry.keyPath.endsWith(suffix));
        if (!keyMatched) continue;
        if (!rule.exact_values.includes(normalizedValue)) continue;

        violations.push({
          ruleId: "uxw-generic-cta",
          ruleName: "Generic CTA wording",
          severity: rule.severity ?? "warning",
          file: localeFile,
          line: null,
          detail: `${entry.keyPath} uses generic CTA "${normalizedValue}". ${rule.message}`,
          fix: rule.suggestion,
        });
      }
    }
  }

  if (violations.length === 0) {
    passed.push({
      ruleId: "uxw-writing-consistency",
      ruleName: "UX writing consistency",
      file: "i18n/assets",
      detail: `Scanned ${localeFiles.length} locale files — no discouraged wording or generic CTA warnings found`,
    });
  }

  return { violations, passed };
}

// ---------------------------------------------------------------------------
// Output Formatting
// ---------------------------------------------------------------------------

function formatPath(filePath: string): string {
  // Try to show relative to cwd
  const cwd = process.cwd();
  if (filePath.startsWith(cwd)) {
    return filePath.slice(cwd.length + 1);
  }
  return filePath;
}

function formatViolation(v: Violation): string {
  const icon = v.severity === "error" ? "\x1b[31m\u2718 FAIL\x1b[0m" : "\x1b[33m\u26A0 WARN\x1b[0m";
  const loc = v.line ? `:${v.line}` : "";
  const lines = [
    `${icon} [${v.ruleId}] ${formatPath(v.file)}${loc}`,
    `   ${v.detail}`,
    `   Fix: ${v.fix}`,
  ];
  return lines.join("\n");
}

function formatPassed(p: PassedCheck): string {
  return `\x1b[32m\u2714 PASS\x1b[0m [${p.ruleId}] ${formatPath(p.file)} (${p.detail})`;
}

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
\x1b[1m=== MSM Portal Design System Validation Runner ===\x1b[0m

Usage:
  npx tsx design-system/scripts/validate.ts <path> [options]

Arguments:
  <path>          File or directory to validate

Options:
  --help, -h      Show this help message
  --json          Output results as JSON
  --quiet         Only show violations (no passed checks)
  --severity=<s>  Filter by severity: error, warning, all (default: all)

Examples:
  npx tsx design-system/scripts/validate.ts src/apps/msm-default/component/order/
  npx tsx design-system/scripts/validate.ts src/apps/msm-default/container/order/list/OrderListContainer.tsx
`);
    process.exit(0);
  }

  const targetPath = args.find((a) => !a.startsWith("--"))!;
  const jsonOutput = args.includes("--json");
  const quiet = args.includes("--quiet");
  const severityArg = args.find((a) => a.startsWith("--severity="));
  const severityFilter = severityArg ? severityArg.split("=")[1] : "all";

  const files = collectFiles(targetPath).filter(isTsOrTsxFile);

  if (files.length === 0) {
    console.log("No .ts/.tsx files found at the given path.");
    process.exit(0);
  }

  if (!jsonOutput) {
    console.log(`\n\x1b[1m=== MSM Portal Design System Validation ===\x1b[0m`);
    console.log(`Scanning: ${formatPath(path.resolve(targetPath))}`);
    console.log(`Files: ${files.length}\n`);
  }

  let allViolations: Violation[] = [];
  let allPassed: PassedCheck[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const lines = content.split("\n");
    const { violations, passedChecks } = runChecks(file, content, lines);
    allViolations.push(...violations);
    allPassed.push(...passedChecks);
  }

  // Project-level checks
  const i18nResult = checkI18nBilingual();
  allViolations.push(...i18nResult.violations);
  allPassed.push(...i18nResult.passed);

  const uxWritingResult = checkUxWritingConsistency();
  allViolations.push(...uxWritingResult.violations);
  allPassed.push(...uxWritingResult.passed);

  // Filter by severity
  if (severityFilter !== "all") {
    allViolations = allViolations.filter((v) => v.severity === severityFilter);
  }

  // Sort: errors first, then warnings
  allViolations.sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === "error" ? -1 : 1;
  });

  // JSON output
  if (jsonOutput) {
    const errors = allViolations.filter((v) => v.severity === "error");
    const warnings = allViolations.filter((v) => v.severity === "warning");
    const result =
      errors.length > 0
        ? "fail"
        : warnings.length > 2
          ? "conditional_pass"
          : "pass";
    const output = {
      total_checks: allViolations.length + allPassed.length,
      errors_failed: errors.length,
      errors_passed: allPassed.filter((p) => !warnings.some((w) => w.ruleId === p.ruleId)).length,
      warnings_flagged: warnings.length,
      overall_result: result,
      failed_checks: allViolations.map((v) => ({
        id: v.ruleId,
        severity: v.severity,
        file: formatPath(v.file),
        line: v.line,
        detail: v.detail,
        fix: v.fix,
      })),
    };
    console.log(JSON.stringify(output, null, 2));
    process.exit(errors.length > 0 ? 1 : 0);
  }

  // Text output
  // Show violations
  for (const v of allViolations) {
    console.log(formatViolation(v));
    console.log();
  }

  // Show passed (unless quiet)
  if (!quiet && allPassed.length > 0) {
    for (const p of allPassed) {
      console.log(formatPassed(p));
    }
    console.log();
  }

  // Summary
  const errorCount = allViolations.filter((v) => v.severity === "error").length;
  const warnCount = allViolations.filter((v) => v.severity === "warning").length;
  const passCount = allPassed.length;
  const total = errorCount + warnCount + passCount;

  let resultLabel: string;
  if (errorCount > 0) {
    resultLabel = "\x1b[31mFAIL\x1b[0m";
  } else if (warnCount > 2) {
    resultLabel = "\x1b[33mCONDITIONAL PASS\x1b[0m";
  } else {
    resultLabel = "\x1b[32mPASS\x1b[0m";
  }

  console.log(`\x1b[1mSummary:\x1b[0m ${errorCount} errors, ${warnCount} warnings, ${passCount} passed (${total} total checks)`);
  console.log(`Result: ${resultLabel}`);

  process.exit(errorCount > 0 ? 1 : 0);
}

main();
