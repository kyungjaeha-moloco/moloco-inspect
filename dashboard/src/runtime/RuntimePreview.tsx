import React, { useState } from 'react';

import { MCButton2 } from '@moloco/moloco-cloud-react-ui';
import MCContentLayout from '@msm-portal/common/component/layout/content/MCContentLayout';
import MCBarTabs, { MTBarTab } from '@msm-portal/common/component/tab/bar-tab/MCBarTabs';
import MCStatus from '@msm-portal/common/component/status/MCStatus';
import MCFormTextInput from '@msm-portal/common/component/form/v1/input/MCFormTextInput';
import MCFormCheckBox from '@msm-portal/common/component/form/v1/checkbox/MCFormCheckBox';
import MCFormSwitchInput from '@msm-portal/common/component/form/v1/input/MCFormSwitchInput';
import MCFormRadioGroup from '@msm-portal/common/component/form/v1/radio/MCFormRadioGroup';
import { DesignSystemProviders } from './DesignSystemProviders';
import { FormikHarness } from './FormikHarness';

type RuntimePreviewName =
  | 'MCButton2'
  | 'MCBarTabs'
  | 'MCStatus'
  | 'MCContentLayout'
  | 'MCFormTextInput'
  | 'MCFormCheckBox'
  | 'MCFormSwitchInput'
  | 'MCFormRadioGroup';

const supportedNames = new Set<RuntimePreviewName>([
  'MCButton2',
  'MCBarTabs',
  'MCStatus',
  'MCContentLayout',
  'MCFormTextInput',
  'MCFormCheckBox',
  'MCFormSwitchInput',
  'MCFormRadioGroup',
]);

function ButtonPreview() {
  return (
    <div className="runtime-stack">
      <div className="runtime-inline">
        <MCButton2 color="primary" variant="basic">
          Create campaign
        </MCButton2>
        <MCButton2 color="secondary" variant="basic">
          Cancel
        </MCButton2>
      </div>
    </div>
  );
}

function TabsPreview() {
  const [activeTab, setActiveTab] = useState<'overview' | 'creative' | 'history'>('overview');
  const tabs: MTBarTab[] = [
    { label: 'Overview', active: activeTab === 'overview', onClick: () => setActiveTab('overview') },
    { label: 'Creative', active: activeTab === 'creative', onClick: () => setActiveTab('creative') },
    { label: 'History', active: activeTab === 'history', onClick: () => setActiveTab('history') },
  ];

  return (
    <div className="runtime-stack runtime-full">
      <MCBarTabs tabs={tabs} />
    </div>
  );
}

function StatusPreview() {
  return (
    <div className="runtime-stack">
      <div className="runtime-inline runtime-inline-start">
        <MCStatus icon="active" label="Healthy" />
        <MCStatus icon="scheduled" label="Scheduled" />
        <MCStatus icon="rejected" label="Rejected" />
      </div>
    </div>
  );
}

function ContentLayoutPreview() {
  return (
    <div className="runtime-frame">
      <MCContentLayout
        title="Campaign overview"
        showBreadcrumb={false}
        rightAccessory={
          <MCButton2 color="primary" variant="basic" size="small">
            Create
          </MCButton2>
        }
      >
        <div className="runtime-body-copy">Page body content renders inside the layout body area.</div>
      </MCContentLayout>
    </div>
  );
}

function FormTextInputPreview() {
  return (
    <FormikHarness initialValues={{ title: 'Brand awareness launch' }}>
      <div className="runtime-form">
        <MCFormTextInput
          name="title"
          fieldLabel="Campaign title"
          hint="Used as the internal display name"
          required
        />
      </div>
    </FormikHarness>
  );
}

function FormCheckBoxPreview() {
  return (
    <FormikHarness initialValues={{ remarketing: true }}>
      <div className="runtime-form">
        <MCFormCheckBox name="remarketing" fieldLabel="Include remarketing users" />
      </div>
    </FormikHarness>
  );
}

function FormSwitchInputPreview() {
  return (
    <FormikHarness initialValues={{ enabled: true }}>
      <div className="runtime-form">
        <MCFormSwitchInput name="enabled" fieldLabel="Live delivery enabled" />
      </div>
    </FormikHarness>
  );
}

function FormRadioGroupPreview() {
  return (
    <FormikHarness initialValues={{ biddingType: 'cpc' }}>
      <div className="runtime-form">
        <MCFormRadioGroup
          name="biddingType"
          label="Bidding type"
          options={[
            { value: 'cpc', label: 'CPC' },
            { value: 'cpm', label: 'CPM' },
          ]}
        />
      </div>
    </FormikHarness>
  );
}

function RuntimePreviewInner({ name }: { name: RuntimePreviewName }) {
  switch (name) {
    case 'MCButton2':
      return <ButtonPreview />;
    case 'MCBarTabs':
      return <TabsPreview />;
    case 'MCStatus':
      return <StatusPreview />;
    case 'MCContentLayout':
      return <ContentLayoutPreview />;
    case 'MCFormTextInput':
      return <FormTextInputPreview />;
    case 'MCFormCheckBox':
      return <FormCheckBoxPreview />;
    case 'MCFormSwitchInput':
      return <FormSwitchInputPreview />;
    case 'MCFormRadioGroup':
      return <FormRadioGroupPreview />;
    default:
      return null;
  }
}

type ErrorBoundaryState = {
  hasError: boolean;
};

class PreviewErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) {
      return <div className="runtime-fallback">Runtime preview could not be rendered in this harness yet.</div>;
    }

    return this.props.children;
  }
}

export function isRuntimePreviewSupported(name: string): name is RuntimePreviewName {
  return supportedNames.has(name as RuntimePreviewName);
}

export function RuntimePreview({ name }: { name: RuntimePreviewName }) {
  return (
    <PreviewErrorBoundary>
      <DesignSystemProviders>
        <RuntimePreviewInner name={name} />
      </DesignSystemProviders>
    </PreviewErrorBoundary>
  );
}
