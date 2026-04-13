export type ComponentEntry = {
  name: string;
  description: string;
  shortDescription?: string;
  dos?: string[];
  donts?: string[];
  antiPatterns?: Array<{ scenario: string; reason: string; alternative: string }>;
  commonlyPairedWith?: string[];
  accessibility?: {
    role?: string;
    ariaLabel?: string;
    keyboardInteraction?: Array<{ key: string; action: string }>;
    screenReaderAnnouncement?: string;
    notes?: string[];
  };
  usageFileCount?: number;
  status?: string;
  tierName?: string;
  functionalCategory?: string;
  importPath?: string;
  path?: string;
  formikRequired?: boolean;
  propCount: number;
  whenToUse?: string[];
  doNotUse?: string[];
  example?: string;
  notes?: string[];
  requiredProviders: string[];
  optionalProviders: string[];
  mustBeInside: string[];
  dependencyNotes?: string;
  recipeKey?: string;
  recipeDescription?: string;
  recipeProviders?: string[];
  recipeCode?: string;
  storybookPath?: string;
  goldenStates: Array<{ name: string; description: string }>;
  structure?: {
    dimensions?: Record<string, string>;
    padding?: Record<string, string>;
    spacing?: string;
    border?: string;
    background?: string;
    notes?: string[];
  };
};

export type ComponentCategory = {
  name: string;
  description: string;
  count: number;
  components: ComponentEntry[];
};

export type ComponentsCatalog = {
  meta: {
    totalCategories: number;
    totalComponents: number;
  };
  categories: ComponentCategory[];
};

export type TokenValue = {
  hex: string;
  semantic: string | string[];
  source?: string;
  usage?: string;
  lightEquivalent?: string;
};

export type PaletteSection = Record<string, TokenValue | string>;

export type FoundationsData = {
  meta: { generatedAt: string; description: string };
  modes: Array<'light' | 'dark'>;
  sections: string[];
  light: Record<string, PaletteSection>;
  dark: Record<string, PaletteSection>;
};

export type LiveComponentProp = { name: string };

export type LiveComponentEntry = {
  name: string;
  description: string;
  shortDescription?: string;
  functional_category?: string;
  status?: string;
  tier?: string | number;
  importPath?: string;
  path?: string;
  formikRequired?: boolean;
  when_to_use?: string[];
  do_not_use?: string[];
  example?: string;
  states?: Array<{ name: string; description?: string }>;
  props?: LiveComponentProp[];
  notes?: string[];
  dos?: string[];
  donts?: string[];
  antiPatterns?: Array<{ scenario: string; reason: string; alternative: string }>;
  compositions?: { commonly_paired_with?: string[] };
  accessibility?: {
    role?: string;
    ariaLabel?: string;
    keyboardInteraction?: Array<{ key: string; action: string }>;
    screenReaderAnnouncement?: string;
    notes?: string[];
  };
  usage_stats?: { file_count?: number };
  structure?: {
    dimensions?: Record<string, string>;
    padding?: Record<string, string>;
    spacing?: string;
    border?: string;
    background?: string;
    notes?: string[];
  };
};

export type LiveComponentCategory = {
  name: string;
  description: string;
  components: LiveComponentEntry[];
};

export type LiveComponentsJson = {
  meta: { tiers?: Record<string, { name: string }> };
  categories: LiveComponentCategory[];
};

export type DependencyComponentEntry = {
  requires?: string[];
  optional?: string[];
  must_be_inside?: string[];
  notes?: string;
};

export type RenderingRecipe = {
  description: string;
  providers: string[];
  code: string;
};

export type ComponentDependenciesJson = {
  components: Record<string, DependencyComponentEntry>;
  rendering_recipes: Record<string, RenderingRecipe>;
};

export type GoldenExampleStatesJson = {
  components: Record<string, { golden_states?: Array<{ name: string; description: string }> }>;
};

export type UxWritingJson = {
  service_voice: {
    principles: Array<{
      id: string;
      name: string;
      rule: string;
      good_examples?: Record<string, string[]>;
      avoid?: Record<string, string[]>;
    }>;
    terminology: {
      recommended: Array<{ concept: string; ko: string; en: string }>;
      consistency_rule: string;
    };
  };
  surface_rules: Record<string, {
    rule: string;
    guidance?: string[];
    do?: Record<string, string[]>;
    dont?: Record<string, string[]>;
  }>;
  validation_process: {
    automation_policy: { rationale: string };
    automated_checks: Array<{ id: string; description: string }>;
    manual_review: string[];
  };
  examples: Record<string, Array<{
    scenario: string;
    before: { ko: string; en: string };
    after: { ko: string; en: string };
    why: string;
  }>>;
};

export type GovernanceJson = {
  audit_cycle?: { last_audit?: string; next_audit?: string };
  promotion_queue?: Array<{ name: string; reason?: string }>;
  deprecation_queue?: Array<{ name: string; reason?: string; migration?: string }>;
  removal_queue?: Array<{ name: string; reason?: string }>;
  watch_list?: Array<{ name: string; reason?: string }>;
};

export type PatternLayerEntry = {
  location?: string;
  responsibility?: string;
  imports?: string[];
};

export type PatternsJson = {
  patterns: Array<{
    id: string;
    name: string;
    description: string;
    when?: string;
    layer_structure?: Record<string, string | PatternLayerEntry>;
    file_checklist?: string[];
    validation_checklist?: string[];
    code?: string;
  }>;
};

export type ColorToken = {
  name: string;
  token: string;
  hex: string;
  tier: string;
  status: string;
  usage: string;
  $description?: string;
  do_not_use_for?: string;
  components?: string[];
  role?: string;
  pairedWith?: string[];
  states?: Record<string, { token: string; hex: string; $description?: string }>;
};

export type TokensJson = {
  color?: {
    text?: { tokens?: ColorToken[]; deprecated?: ColorToken[] };
    background?: { tokens?: ColorToken[]; deprecated?: ColorToken[] };
    border?: { tokens?: ColorToken[]; deprecated?: ColorToken[] };
    icon?: { tokens?: ColorToken[]; deprecated?: ColorToken[] };
  };
  spacing?: {
    baseUnit?: number;
    usage?: string;
    values?: Array<{ multiplier: number; px: number; usage: string; category?: string }>;
    categories?: Record<string, { range: string; description: string }>;
  };
  typography?: {
    usage?: string;
    tokens?: Array<{
      name: string;
      token: string;
      size: string;
      weight: string;
      lineHeight: string | null;
      letterSpacing?: string;
      usage: string;
      category?: string;
    }>;
  };
  borderRadius?: {
    tokens?: Array<{ name: string; value: string; usage?: string }>;
  };
};

export type StateMachinesJson = {
  passive?: { components?: string[] };
  formInputs?: Record<string, {
    description?: string;
    extends?: string;
    states?: Record<string, {
      visual?: string;
      description?: string;
      transitions?: Record<string, { target: string; trigger?: string }>;
    }>;
    additional_states?: Record<string, unknown>;
    additional_transitions?: Record<string, unknown>;
    override_transitions?: Record<string, unknown>;
  }>;
  interactive?: Record<string, {
    states?: Record<string, {
      visual?: string;
      description?: string;
      transitions?: Record<string, { target: string; trigger?: string }>;
    }>;
  }>;
};

export type ComponentBehaviorsJson = {
  [category: string]: Record<string, {
    extends?: string;
    semantic_actions?: Array<{ action: string; triggers: string }>;
    additional_actions?: Array<{ action: string; triggers: string }>;
    override_actions?: Array<{ action: string; triggers: string }>;
    data_flow?: { input: string; output: string; side_effects: string[] };
  }>;
};

// --- Workflow JSON types ---

export type CodeExampleSnippets = Record<string, string>;

export type CodeExampleEntry = {
  pattern: string;
  entity: string;
  description: string;
  files?: Record<string, string | string[]>;
  key_snippets?: CodeExampleSnippets;
  key_imports?: string[];
  key_hooks?: string[];
  notes?: string[];
};

export type CodeExamplesJson = {
  meta?: { description?: string; version?: string; lastUpdated?: string };
  examples: CodeExampleEntry[];
  common_patterns_across_entities?: Record<string, {
    pattern?: string;
    template?: string;
    verified_in?: string[];
    verified_examples?: string[];
    convention?: string;
    examples?: string[];
  }>;
  file_naming_verification?: Record<string, {
    convention?: string;
    examples?: string[];
  }>;
};

export type ErrorPatternEntry = {
  id: string;
  error: string;
  cause?: string;
  detection?: string;
  fix?: string;
  fix_code?: string;
  fix_strategies?: string[];
  common_scenarios?: string[];
  common_mistakes?: string[];
  required_registrations?: string[];
  affected_components?: string[];
  severity: 'critical' | 'error' | 'warning';
  category: string;
  validation_ref?: string;
  source?: string;
};

export type ErrorPatternsJson = {
  meta?: { description?: string };
  errors: ErrorPatternEntry[];
  categories?: Record<string, string>;
  severity_levels?: Record<string, string>;
};

export type UxCriterionEntry = {
  id: string;
  name: string;
  question: string;
  check_for?: string[];
  pass?: string;
  fail_example?: string;
  weight: 'high' | 'medium' | 'low';
};

export type UxCriteriaJson = {
  meta?: { description?: string };
  criteria: Record<string, UxCriterionEntry[]>;
  scoring?: {
    method?: string;
    weights?: Record<string, number>;
    thresholds?: Record<string, string>;
  };
};
