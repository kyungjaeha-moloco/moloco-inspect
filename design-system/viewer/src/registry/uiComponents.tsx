import React, { useState } from 'react';

import { MCButton2 } from '@moloco/moloco-cloud-react-ui';

// All verified as `export default` by reading source files
import MCContentLayout from '@msm-portal/common/component/layout/content/MCContentLayout';
import MCCommonDialog from '@msm-portal/common/component/dialog/common-dialog/MCCommonDialog';
import MCMoreActionsButton from '@msm-portal/common/component/button/MCMoreActionsButton';
import MCMoreActionGroupsButton from '@msm-portal/common/component/button/MCMoreActionGroupsButton';
import MCPopover from '@msm-portal/common/component/popover/MCPopover';
import MCColorPicker from '@msm-portal/common/component/color/MCColorPicker';
import MCTimer from '@msm-portal/common/component/timer/MCTimer';
import MCFullScreenLoader from '@msm-portal/common/component/loader/MCFullScreenLoader';

// MTRGBAColor is defined in the color component's local types file;
// we inline the shape here so the registry has no path dependency on internals.
type MTRGBAColor = {
  r: number; // 0–255
  g: number; // 0–255
  b: number; // 0–255
  a?: number; // 0–1
};

export interface ComponentEntry {
  name: string;
  category: string;
  description: string;
  render: () => React.ReactNode;
  formikValues?: Record<string, unknown>;
}

// ── MCCommonDialog Demo ──────────────────────────────────────────────────────
// Needs useState, so defined as a named component to keep render() clean.
function CommonDialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <MCButton2 variant="basic" color="primary" onClick={() => setOpen(true)}>
        Open Dialog
      </MCButton2>
      <MCCommonDialog
        open={open}
        title="Confirm Action"
        content={
          <div style={{ padding: '16px 0', fontSize: 14 }}>
            Are you sure you want to proceed with this action?
          </div>
        }
        actions={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <MCButton2 variant="basic" color="secondary" onClick={() => setOpen(false)}>
              Cancel
            </MCButton2>
            <MCButton2 variant="basic" color="primary" onClick={() => setOpen(false)}>
              Confirm
            </MCButton2>
          </div>
        }
        onClose={() => setOpen(false)}
        width="480px"
      />
    </div>
  );
}

// ── MCPopover Demo ───────────────────────────────────────────────────────────
function PopoverDemo() {
  const [open, setOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const handleOpen = (e: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(e.currentTarget);
    setOpen(true);
  };

  return (
    <div>
      <MCButton2 variant="basic" color="secondary" onClick={handleOpen}>
        Toggle Popover
      </MCButton2>
      <MCPopover
        open={open}
        anchorEl={anchorEl}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        onClose={() => setOpen(false)}
      >
        <div style={{ padding: 16, fontSize: 13, minWidth: 180 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Popover Content</div>
          <div style={{ color: '#6B7280' }}>This is a styled popover with border and shadow.</div>
        </div>
      </MCPopover>
    </div>
  );
}

// ── MCColorPicker Demo ───────────────────────────────────────────────────────
function ColorPickerDemo() {
  const [color, setColor] = useState<MTRGBAColor>({ r: 52, g: 107, b: 234, a: 1 });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 360 }}>
      <MCColorPicker
        color={color}
        onChange={setColor}
        colorPickerTitle="Brand Color"
      />
      <MCColorPicker
        color={null}
        readonly
      />
    </div>
  );
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const UI_COMPONENTS: ComponentEntry[] = [
  // ── Layout ──────────────────────────────────────────────────────────────────
  {
    name: 'MCContentLayout',
    category: 'Layout',
    description:
      'Page content wrapper with title, optional right accessory, and scrollable body area. ' +
      'Used as the outermost layout for all content pages.',
    render: () => (
      <div style={{ border: '1px dashed #E5E7EB', borderRadius: 6, overflow: 'hidden' }}>
        <MCContentLayout
          title="Campaign Overview"
          rightAccessory={
            <MCButton2 variant="basic" color="primary" size="small">
              + New Campaign
            </MCButton2>
          }
          showBreadcrumb={false}
        >
          <div style={{ padding: 16, fontSize: 13, color: '#6B7280' }}>
            Page body content renders here inside the scrollable body area.
          </div>
        </MCContentLayout>
      </div>
    ),
  },

  // ── Dialog ──────────────────────────────────────────────────────────────────
  {
    name: 'MCCommonDialog',
    category: 'Overlay',
    description:
      'Modal dialog with header title, close button, dividers, scrollable content area, ' +
      'and an actions footer. Controlled via open/onClose.',
    render: () => <CommonDialogDemo />,
  },

  // ── Buttons ─────────────────────────────────────────────────────────────────
  {
    name: 'MCMoreActionsButton',
    category: 'Button',
    description:
      'Icon button that opens a popover list of action items. Each item has a label, ' +
      'optional icon, and an onClick handler.',
    render: () => (
      <MCMoreActionsButton
        variant="icon"
        moreActionItems={[
          { label: 'Edit', icon: 'edit', onClick: () => alert('Edit clicked') },
          { label: 'Duplicate', icon: 'copy', onClick: () => alert('Duplicate clicked') },
          { label: 'Delete', icon: 'delete', onClick: () => alert('Delete clicked') },
        ]}
      >
        More
      </MCMoreActionsButton>
    ),
  },
  {
    name: 'MCMoreActionGroupsButton',
    category: 'Button',
    description:
      'Like MCMoreActionsButton but organises actions into labelled groups separated by ' +
      'dividers. Each group has a label, optional icon, and an array of action items.',
    render: () => (
      <MCMoreActionGroupsButton
        variant="icon"
        moreActionItemGroups={[
          {
            label: 'Campaign',
            icon: 'campaign',
            actions: [
              { label: 'Edit', icon: 'edit', onClick: () => alert('Edit campaign') },
              { label: 'Pause', icon: 'pause', onClick: () => alert('Pause campaign') },
            ],
          },
          {
            label: 'Reporting',
            icon: 'bar_chart',
            actions: [
              { label: 'Export CSV', onClick: () => alert('Export CSV') },
              { label: 'View Report', onClick: () => alert('View Report') },
            ],
          },
        ]}
      >
        Actions
      </MCMoreActionGroupsButton>
    ),
  },

  // ── Overlay ──────────────────────────────────────────────────────────────────
  {
    name: 'MCPopover',
    category: 'Overlay',
    description:
      'Styled MUI Popover wrapper with themed background, border, and box-shadow. ' +
      'Controlled via open/anchorEl/onClose.',
    render: () => <PopoverDemo />,
  },

  // ── Color ────────────────────────────────────────────────────────────────────
  {
    name: 'MCColorPicker',
    category: 'Input',
    description:
      'Inline color swatch that opens a SketchPicker popover. Displays hex value and RGBA ' +
      'channels. Supports readonly and disableAlpha modes.',
    render: () => <ColorPickerDemo />,
  },

  // ── Timer ────────────────────────────────────────────────────────────────────
  {
    name: 'MCTimer',
    category: 'Display',
    description:
      'Countdown timer that decrements from initSec at a configurable interval. ' +
      'Accepts a decorator function to format the remaining seconds.',
    render: () => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 13, color: '#374151' }}>
          Raw seconds:{' '}
          <strong>
            <MCTimer initSec={60} />
          </strong>
        </div>
        <div style={{ fontSize: 13, color: '#374151' }}>
          Formatted:{' '}
          <strong>
            <MCTimer
              initSec={90}
              decorator={(sec) => {
                const m = Math.floor(sec / 60);
                const s = sec % 60;
                return `${m}m ${s.toString().padStart(2, '0')}s`;
              }}
            />
          </strong>
        </div>
      </div>
    ),
  },

  // ── Loader ───────────────────────────────────────────────────────────────────
  {
    name: 'MCFullScreenLoader',
    category: 'Feedback',
    description:
      'Full-viewport centered spinner. Normally fills 100vw × 100vh; ' +
      'contained here in a relative wrapper so it renders at preview scale.',
    render: () => (
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 200,
          overflow: 'hidden',
          border: '1px dashed #E5E7EB',
          borderRadius: 6,
        }}
      >
        {/*
          MCFullScreenLoader uses position fixed-like flex centering with 100vw/100vh.
          The wrapper clips it visually without breaking its internal layout.
        */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MCFullScreenLoader />
        </div>
      </div>
    ),
  },
];
