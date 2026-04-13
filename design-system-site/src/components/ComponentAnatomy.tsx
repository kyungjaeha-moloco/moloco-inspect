import React from 'react';

type AnatomyNode = {
  name: string;
  description: string;
  required?: boolean;
  children?: AnatomyNode[];
};

// Define anatomy trees for key compound component patterns
const ANATOMY_MAP: Record<string, AnatomyNode> = {
  // Form pattern
  MCFormTextInput: {
    name: 'Formik',
    description: 'Form context provider',
    required: true,
    children: [{
      name: 'Form',
      description: 'HTML form element',
      required: true,
      children: [{
        name: 'MCFormPanel',
        description: 'Visual panel container',
        children: [{
          name: 'MCFormPanelTitle',
          description: 'Panel heading',
        }, {
          name: 'MCFormPanelBody',
          description: 'Panel content area',
          children: [{
            name: 'MCFormFieldGroup',
            description: 'Field group with grid layout',
            children: [{
              name: 'MCFormTextInput',
              description: 'Text input with Formik binding',
              required: true,
            }],
          }],
        }],
      }, {
        name: 'MCFormActions',
        description: 'Submit/cancel button row',
        children: [{
          name: 'MCButton2',
          description: 'Action buttons',
        }],
      }],
    }],
  },

  // Content layout pattern
  MCContentLayout: {
    name: 'MCContentLayout',
    description: 'Page layout with header, tabs, and content',
    required: true,
    children: [{
      name: 'header',
      description: 'Breadcrumb + title + action buttons',
      children: [{
        name: 'MCBreadcrumb',
        description: 'Navigation breadcrumb',
      }, {
        name: 'title',
        description: 'Page title (h1)',
      }, {
        name: 'MCButton2',
        description: 'Primary action (Create, Edit)',
      }],
    }, {
      name: 'MCBarTabs',
      description: 'Tab navigation',
    }, {
      name: 'content',
      description: 'Tab content panels',
      children: [{
        name: 'MCI18nTable | MCForm*',
        description: 'Data table or form depending on page type',
      }],
    }],
  },

  // Dialog pattern
  MCCommonDialog: {
    name: 'MCCommonDialog',
    description: 'Modal dialog overlay',
    required: true,
    children: [{
      name: 'title',
      description: 'Dialog heading',
    }, {
      name: 'content',
      description: 'Dialog body content',
    }, {
      name: 'actions',
      description: 'Confirm/cancel buttons',
      children: [{
        name: 'MCButton2 (cancel)',
        description: 'Secondary action',
      }, {
        name: 'MCButton2 (confirm)',
        description: 'Primary/destructive action',
      }],
    }],
  },

  // Table pattern
  MCI18nTable: {
    name: 'MCI18nTable',
    description: 'Internationalized data table',
    required: true,
    children: [{
      name: 'MCTableActionBar',
      description: 'Selection actions bar (visible when rows selected)',
    }, {
      name: 'thead',
      description: 'Column headers with sort/filter',
    }, {
      name: 'tbody',
      description: 'Data rows',
      children: [{
        name: 'cellRenderer',
        description: 'Custom cell renderers per column',
      }],
    }, {
      name: 'MCPagination',
      description: 'Pagination controls',
    }],
  },
};

// For form inputs that share the same anatomy, reference the MCFormTextInput tree
const FORM_INPUT_NAMES = [
  'MCFormTextArea', 'MCFormNumberInput', 'MCFormCheckBox', 'MCFormSwitchInput',
  'MCFormRadioGroup', 'MCFormSingleRichSelect', 'MCFormMultiRichSelect',
  'MCFormDatePicker', 'MCFormTimePicker', 'MCFormTagInput', 'MCFormAutoComplete',
  'MCFormCardSelect', 'MCFormPercent',
];

export function getAnatomyTree(componentName: string): AnatomyNode | null {
  if (ANATOMY_MAP[componentName] && ANATOMY_MAP[componentName].children?.length) {
    return ANATOMY_MAP[componentName];
  }
  // Form inputs reference the MCFormTextInput anatomy with their own name substituted
  if (FORM_INPUT_NAMES.includes(componentName)) {
    const tree = JSON.parse(JSON.stringify(ANATOMY_MAP.MCFormTextInput)) as AnatomyNode;
    // Find and rename the leaf input node
    function renameLeaf(node: AnatomyNode): void {
      if (node.name === 'MCFormTextInput') {
        node.name = componentName;
        node.description = `${componentName} with Formik binding`;
        return;
      }
      for (const child of node.children ?? []) renameLeaf(child);
    }
    renameLeaf(tree);
    return tree;
  }
  return null;
}

function AnatomyTreeNode({ node, depth = 0 }: { node: AnatomyNode; depth?: number }) {
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="anatomy-node" style={{ marginLeft: depth * 24 }}>
      <div className="anatomy-node-row">
        {depth > 0 && <span className="anatomy-connector" />}
        <span className={`anatomy-node-name${node.required ? ' required' : ''}`}>
          {node.name}
        </span>
        {node.required && <span className="anatomy-required-dot" />}
      </div>
      <div className="anatomy-node-desc" style={{ marginLeft: depth > 0 ? 20 : 0 }}>
        {node.description}
      </div>
      {hasChildren && (
        <div className="anatomy-children">
          {node.children!.map((child, i) => (
            <AnatomyTreeNode key={`${child.name}-${i}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ComponentAnatomyDiagram({ componentName }: { componentName: string }) {
  const tree = getAnatomyTree(componentName);
  if (!tree) return null;

  return (
    <div className="anatomy-diagram">
      <AnatomyTreeNode node={tree} />
    </div>
  );
}
