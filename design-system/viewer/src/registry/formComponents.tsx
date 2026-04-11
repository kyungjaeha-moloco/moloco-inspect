import React from 'react';

export interface ComponentEntry {
  name: string;
  category: string;
  description: string;
  render: () => React.ReactNode;
  formikValues?: Record<string, unknown>;
}

// Lazy-load each form component individually to isolate failures
const Lazy = {
  MCFormChipInput: React.lazy(() =>
    import('@msm-portal/common/component/form/v1/input/MCFormChipInput').then(m => ({ default: m.default }))
  ),
  MCFormColorInput: React.lazy(() =>
    import('@msm-portal/common/component/form/v1/input/MCFormColorInput').then(m => ({ default: m.default }))
  ),
  MCFormRadioGroup: React.lazy(() =>
    import('@msm-portal/common/component/form/v1/radio/MCFormRadioGroup').then(m => ({ default: m.default }))
  ),
  MCFormSingleRichSelect: React.lazy(() =>
    import('@msm-portal/common/component/form/v1/select/MCFormSingleRichSelect').then(m => ({ default: m.default }))
  ),
  MCFormMultiRichSelect: React.lazy(() =>
    import('@msm-portal/common/component/form/v1/select/MCFormMultiRichSelect').then(m => ({ default: m.default }))
  ),
  MCFormCardSelect: React.lazy(() =>
    import('@msm-portal/common/component/form/v1/select/MCFormCardSelect').then(m => ({ default: m.default }))
  ),
  MCFormInlineChipRichSelect: React.lazy(() =>
    import('@msm-portal/common/component/form/v1/select/MCFormInlineChipRichSelect').then(m => ({ default: m.default }))
  ),
};

// Lazy Formik + styled components
const LazyFormik = React.lazy(() =>
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error formik types from msm-portal node_modules
  import('formik').then((m: any) => ({
    default: ({ initialValues, children }: { initialValues: Record<string, unknown>; children: React.ReactNode }) => (
      <m.Formik initialValues={initialValues} onSubmit={() => {}}>
        <m.Form style={{ maxWidth: '480px' }}>{children}</m.Form>
      </m.Formik>
    ),
  }))
);

const LazyFormPanel = React.lazy(() =>
  import('@msm-portal/common/component/form/shared/MCFormStyledComponents').then(m => ({
    default: () => (
      <m.MCFormPanel>
        <m.MCFormPanelTitle>Campaign Details</m.MCFormPanelTitle>
        <m.MCFormPanelSubTitle>Fill in the basic information for your campaign.</m.MCFormPanelSubTitle>
        <m.MCFormPanelBody>
          <m.MCFormFieldGroup>
            <div style={{ color: '#888', fontSize: '14px' }}>Form fields go here inside MCFormFieldGroup</div>
          </m.MCFormFieldGroup>
        </m.MCFormPanelBody>
      </m.MCFormPanel>
    ),
  }))
);

function FormikWrap({ initialValues, children }: { initialValues: Record<string, unknown>; children: React.ReactNode }) {
  return (
    <React.Suspense fallback={<div style={{ color: '#9CA3AF', fontSize: 12 }}>Loading form...</div>}>
      <LazyFormik initialValues={initialValues}>{children}</LazyFormik>
    </React.Suspense>
  );
}

const COUNTRY_OPTIONS = [
  { label: 'United States', value: 'us' },
  { label: 'South Korea', value: 'kr' },
  { label: 'Japan', value: 'jp' },
  { label: 'Germany', value: 'de' },
  { label: 'France', value: 'fr' },
];

const CATEGORY_OPTIONS = [
  { label: 'Technology', value: 'tech' },
  { label: 'Finance', value: 'finance' },
  { label: 'Healthcare', value: 'health' },
  { label: 'Education', value: 'edu' },
  { label: 'Entertainment', value: 'entertainment' },
];

const AD_TYPE_OPTIONS = [
  { label: 'Banner', value: 'banner', description: 'Standard image banner ad' },
  { label: 'Video', value: 'video', description: 'Full-screen video ad' },
  { label: 'Native', value: 'native', description: 'Blends with app content' },
];

export const FORM_COMPONENTS: ComponentEntry[] = [
  {
    name: 'MCFormChipInput (empty)',
    category: 'Form',
    description: 'Chip input field for entering multiple tag values — empty state.',
    render: () => (
      <FormikWrap initialValues={{ tags: [] }}>
        <Lazy.MCFormChipInput name="tags" fieldLabel="Tags" placeholder="Type and press Enter" />
      </FormikWrap>
    ),
  },
  {
    name: 'MCFormChipInput (pre-filled)',
    category: 'Form',
    description: 'Chip input field for entering multiple tag values — pre-filled with keywords.',
    render: () => (
      <FormikWrap initialValues={{ keywords: ['react', 'typescript', 'vite'] }}>
        <Lazy.MCFormChipInput name="keywords" fieldLabel="Keywords" required />
      </FormikWrap>
    ),
  },
  {
    name: 'MCFormColorInput (empty)',
    category: 'Form',
    description: 'Color picker input — empty state.',
    render: () => (
      <FormikWrap initialValues={{ color: null }}>
        <Lazy.MCFormColorInput name="color" fieldLabel="Brand Color" colorPickerTitle="Pick a color" />
      </FormikWrap>
    ),
  },
  {
    name: 'MCFormColorInput (pre-filled)',
    category: 'Form',
    description: 'Color picker input — pre-filled with a brand blue color.',
    render: () => (
      <FormikWrap initialValues={{ brandColor: { r: 52, g: 107, b: 234, a: 1 } }}>
        <Lazy.MCFormColorInput name="brandColor" fieldLabel="Brand Color" colorPickerTitle="Pick a brand color" required />
      </FormikWrap>
    ),
  },
  {
    name: 'MCFormRadioGroup',
    category: 'Form',
    description: 'Radio button group for selecting a single option from a list.',
    render: () => (
      <FormikWrap initialValues={{ plan: '' }}>
        <Lazy.MCFormRadioGroup
          name="plan"
          label="Subscription Plan"
          required
          options={[
            { value: 'basic', label: 'Basic' },
            { value: 'pro', label: 'Pro' },
            { value: 'enterprise', label: 'Enterprise' },
          ]}
        />
      </FormikWrap>
    ),
  },
  {
    name: 'MCFormSingleRichSelect',
    category: 'Form',
    description: 'Dropdown select for choosing a single value from a rich option list.',
    render: () => (
      <FormikWrap initialValues={{ country: '' }}>
        <Lazy.MCFormSingleRichSelect
          name="country"
          label="Country"
          placeholder="Select a country"
          options={COUNTRY_OPTIONS}
          required
        />
      </FormikWrap>
    ),
  },
  {
    name: 'MCFormMultiRichSelect',
    category: 'Form',
    description: 'Dropdown select for choosing multiple values from a rich option list.',
    render: () => (
      <FormikWrap initialValues={{ countries: [] }}>
        <Lazy.MCFormMultiRichSelect
          name="countries"
          label="Target Countries"
          placeholder="Select countries"
          options={COUNTRY_OPTIONS}
        />
      </FormikWrap>
    ),
  },
  {
    name: 'MCFormCardSelect',
    category: 'Form',
    description: 'Card-style selector for choosing a single option with visual card UI.',
    render: () => (
      <FormikWrap initialValues={{ adType: '' }}>
        <Lazy.MCFormCardSelect
          name="adType"
          label="Ad Type"
          options={AD_TYPE_OPTIONS as any}
          cardsPerRow={3}
          required
        />
      </FormikWrap>
    ),
  },
  {
    name: 'MCFormInlineChipRichSelect',
    category: 'Form',
    description: 'Inline chip selector that displays selected values as chips within the field.',
    render: () => (
      <FormikWrap initialValues={{ categories: [] }}>
        <Lazy.MCFormInlineChipRichSelect
          name="categories"
          fieldLabel="Categories"
          placeholder="Select categories"
          options={CATEGORY_OPTIONS as any}
        />
      </FormikWrap>
    ),
  },
  {
    name: 'MCFormPanel',
    category: 'Form',
    description: 'Layout panel container used to group related form fields with a title and optional subtitle.',
    render: () => (
      <FormikWrap initialValues={{}}>
        <React.Suspense fallback={<div style={{ color: '#9CA3AF', fontSize: 12 }}>Loading panel...</div>}>
          <LazyFormPanel />
        </React.Suspense>
      </FormikWrap>
    ),
  },
];
