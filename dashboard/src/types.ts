export type ComponentEntry = {
  name: string;
  description: string;
  shortDescription?: string;
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
  goldenStates: Array<{ name: string; description: string }>;
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

export type LiveComponentProp = {
  name: string;
};

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
};

export type LiveComponentCategory = {
  name: string;
  description: string;
  components: LiveComponentEntry[];
};

export type LiveComponentsJson = {
  meta: {
    tiers?: Record<string, { name: string }>;
  };
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

export type ValidationRunnerJson = {
  checks?: {
    contract?: Array<{ id: string }>;
  };
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
  surface_rules: Record<
    string,
    {
      rule: string;
      guidance?: string[];
      do?: Record<string, string[]>;
      dont?: Record<string, string[]>;
    }
  >;
  validation_process: {
    automation_policy: {
      rationale: string;
    };
    automated_checks: Array<{ id: string; description: string }>;
    manual_review: string[];
  };
  examples: Record<
    string,
    Array<{
      scenario: string;
      before: { ko: string; en: string };
      after: { ko: string; en: string };
      why: string;
    }>
  >;
};

export type SidebarLinkItem = {
  label: string;
  to?: string;
  href?: string;
  active?: boolean;
  tone?: 'default' | 'sub';
};
