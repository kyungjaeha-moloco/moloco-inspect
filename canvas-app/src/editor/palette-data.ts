import { PREVIEW_REGISTRY } from '../ds-registry/registry';

export interface PaletteItem {
  type: string;            // e.g. "MCButton2"
  label: string;           // human-readable name
  hasPreview: boolean;     // whether a live preview renderer exists
}

export interface PaletteCategory {
  name: string;
  items: PaletteItem[];
}

/**
 * Components that have live preview renderers in the PREVIEW_REGISTRY.
 * These are shown with full interactive previews in the palette.
 * 15 interactive components from registry.ts.
 */
const INTERACTIVE_COMPONENTS: { type: string; label: string; category: string }[] = [
  // Form Inputs
  { type: 'MCFormTextInput', label: 'Text Input', category: 'Form Inputs' },
  { type: 'MCFormTextArea', label: 'Text Area', category: 'Form Inputs' },
  { type: 'MCFormNumberInput', label: 'Number Input', category: 'Form Inputs' },
  { type: 'MCFormCheckBox', label: 'Checkbox', category: 'Form Inputs' },
  { type: 'MCFormSwitchInput', label: 'Switch', category: 'Form Inputs' },
  { type: 'MCFormRadioGroup', label: 'Radio Group', category: 'Form Inputs' },
  { type: 'MCFormSingleRichSelect', label: 'Select', category: 'Form Inputs' },
  { type: 'MCSearchBar', label: 'Search Bar', category: 'Form Inputs' },
  // Buttons
  { type: 'MCButton2', label: 'Button', category: 'Buttons' },
  // Navigation
  { type: 'MCBarTabs', label: 'Bar Tabs', category: 'Navigation' },
  { type: 'MCAccordion', label: 'Accordion', category: 'Navigation' },
  // Feedback & Overlay
  { type: 'MCCommonDialog', label: 'Dialog', category: 'Feedback & Overlay' },
  { type: 'MCStatus', label: 'Status', category: 'Feedback & Overlay' },
  { type: 'MCBanner', label: 'Banner', category: 'Feedback & Overlay' },
  { type: 'MCCircularLoader', label: 'Loader', category: 'Feedback & Overlay' },
];

/**
 * Static components — no interactive preview renderer yet.
 * Shown in the palette with "(preview coming soon)" label.
 * 23 commonly used static components.
 */
const STATIC_COMPONENTS: { type: string; label: string; category: string }[] = [
  // Form Inputs (no preview yet)
  { type: 'MCFormMultiRichSelect', label: 'Multi Select', category: 'Form Inputs' },
  { type: 'MCFormCardSelect', label: 'Card Select', category: 'Form Inputs' },
  { type: 'MCFormInlineChipRichSelect', label: 'Inline Chip Select', category: 'Form Inputs' },
  { type: 'MCFormDateRangePicker', label: 'Date Range Picker', category: 'Form Inputs' },
  { type: 'MCFormColorInput', label: 'Color Input', category: 'Form Inputs' },
  { type: 'MCFormChipInput', label: 'Chip Input', category: 'Form Inputs' },
  // Form Layout
  { type: 'MCFormPanel', label: 'Form Panel', category: 'Form Layout' },
  { type: 'MCFormFieldGroup', label: 'Field Group', category: 'Form Layout' },
  { type: 'MCFormField', label: 'Form Field', category: 'Form Layout' },
  { type: 'MCFormLayout', label: 'Form Layout', category: 'Form Layout' },
  // Buttons
  { type: 'MCMoreActionsButton', label: 'More Actions', category: 'Buttons' },
  // Navigation
  { type: 'MCCollapsibleNavbar', label: 'Navbar', category: 'Navigation' },
  { type: 'MCStepper', label: 'Stepper', category: 'Navigation' },
  // Feedback & Overlay
  { type: 'MCPopover', label: 'Popover', category: 'Feedback & Overlay' },
  { type: 'MCDivider', label: 'Divider', category: 'Feedback & Overlay' },
  { type: 'MCStatusBadge', label: 'Status Badge', category: 'Feedback & Overlay' },
  { type: 'MCTimer', label: 'Timer', category: 'Feedback & Overlay' },
  // Shared Styled
  { type: 'MCIcon', label: 'Icon', category: 'Shared Styled' },
  { type: 'MCStack', label: 'Stack', category: 'Shared Styled' },
  { type: 'MCSingleTextInput', label: 'Text Input (no Formik)', category: 'Shared Styled' },
  { type: 'MCTextEllipsis', label: 'Text Ellipsis', category: 'Shared Styled' },
  // Layout
  { type: 'MCContentLayout', label: 'Content Layout', category: 'Layout' },
  // Table
  { type: 'MCReportTable', label: 'Report Table', category: 'Table' },
];

/**
 * Build palette categories from the combined component list.
 * Interactive components (with preview) come first within each category.
 */
export function buildPaletteCategories(): PaletteCategory[] {
  const categoryMap = new Map<string, PaletteItem[]>();

  // Category order
  const CATEGORY_ORDER = [
    'Form Inputs',
    'Form Layout',
    'Buttons',
    'Navigation',
    'Feedback & Overlay',
    'Shared Styled',
    'Layout',
    'Table',
  ];

  for (const cat of CATEGORY_ORDER) {
    categoryMap.set(cat, []);
  }

  for (const comp of INTERACTIVE_COMPONENTS) {
    const items = categoryMap.get(comp.category) ?? [];
    items.push({
      type: comp.type,
      label: comp.label,
      hasPreview: comp.type in PREVIEW_REGISTRY,
    });
    categoryMap.set(comp.category, items);
  }

  for (const comp of STATIC_COMPONENTS) {
    const items = categoryMap.get(comp.category) ?? [];
    items.push({
      type: comp.type,
      label: comp.label,
      hasPreview: comp.type in PREVIEW_REGISTRY,
    });
    categoryMap.set(comp.category, items);
  }

  return CATEGORY_ORDER
    .filter((cat) => (categoryMap.get(cat)?.length ?? 0) > 0)
    .map((cat) => ({
      name: cat,
      items: categoryMap.get(cat)!,
    }));
}

/** Total number of palette components */
export const TOTAL_PALETTE_COMPONENTS = INTERACTIVE_COMPONENTS.length + STATIC_COMPONENTS.length;
