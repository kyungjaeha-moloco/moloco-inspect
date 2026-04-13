import type {
  ComponentEntry,
  ComponentsCatalog,
  ComponentDependenciesJson,
  GoldenExampleStatesJson,
  LiveComponentEntry,
  LiveComponentsJson,
} from './types';

export function slugify(value: string) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
}

export function getContrastText(hex: string) {
  if (!hex || hex === 'transparent') return '#161616';
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return '#161616';
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 165 ? '#161616' : '#ffffff';
}

export function formatSemantic(semantic: string | string[]) {
  return Array.isArray(semantic) ? semantic.join(', ') : semantic;
}

function getRecipeKey(component: LiveComponentEntry): string | undefined {
  if (component.name === 'MCButton2') return 'standalone_button';
  if (component.name === 'MCContentLayout') return 'content_layout_preview';
  if (component.formikRequired) return 'form_input_preview';
  return undefined;
}

export function buildComponentsCatalog(
  liveComponents: LiveComponentsJson,
  dependencyJson: ComponentDependenciesJson,
  goldenStatesJson: GoldenExampleStatesJson,
): ComponentsCatalog {
  const categories = liveComponents.categories.map((category) => {
    const components = category.components.map((component) => {
      const TIER_NAMES: Record<string, string> = { '0': 'Primitive', '1': 'Core', '2': 'Composite', '3': 'Domain' };
      const tierName = component.tier !== undefined ? TIER_NAMES[String(component.tier)] : undefined;
      const dependency = dependencyJson.components[component.name] ?? {};
      const recipeKey = getRecipeKey(component);
      const recipe = recipeKey ? dependencyJson.rendering_recipes[recipeKey] : undefined;
      const goldenStates =
        goldenStatesJson.components[component.name]?.golden_states ??
        (component.states ?? []).map((state) => ({
          name: state.name,
          description: state.description ?? 'Documented component state',
        }));

      return {
        name: component.name,
        description: component.description,
        shortDescription: component.shortDescription,
        status: component.status,
        tierName,
        functionalCategory: component.functional_category,
        importPath: component.importPath,
        path: component.path,
        formikRequired: component.formikRequired,
        propCount: component.props?.length ?? 0,
        whenToUse: component.when_to_use ?? [],
        doNotUse: component.do_not_use ?? [],
        example: component.example,
        notes: component.notes ?? [],
        requiredProviders: dependency.requires ?? [],
        optionalProviders: dependency.optional ?? [],
        mustBeInside: dependency.must_be_inside ?? [],
        dependencyNotes: dependency.notes,
        recipeKey,
        recipeDescription: recipe?.description,
        recipeProviders: recipe?.providers ?? [],
        recipeCode: recipe?.code,
        goldenStates,
        dos: component.dos ?? [],
        donts: component.donts ?? [],
        antiPatterns: component.antiPatterns ?? [],
        commonlyPairedWith: component.compositions?.commonly_paired_with ?? [],
        accessibility: component.accessibility,
        usageFileCount: component.usage_stats?.file_count,
      } as ComponentEntry;
    });

    return {
      name: category.name,
      description: category.description,
      count: components.length,
      components,
    };
  });

  return {
    meta: {
      totalCategories: categories.length,
      totalComponents: categories.reduce((sum, c) => sum + c.components.length, 0),
    },
    categories,
  };
}
