import React from 'react';
import type { ComponentEntry } from '../../types';
import { CodeBlock } from '../CodeBlock';
import { ComponentAnatomyDiagram, getAnatomyTree } from '../ComponentAnatomy';

export function UsageTab({ comp }: { comp: ComponentEntry }) {
  return (
    <>
      {comp.importPath && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Import</h2>
          </div>
          <CodeBlock code={`import ${comp.name} from '${comp.importPath}';`} />
        </div>
      )}

      {comp.whenToUse && comp.whenToUse.length > 0 && (
        <div className="section">
          <div className="dodont-grid">
            <div className="dodont-card dodont-do">
              <div className="dodont-card-header">When to use</div>
              <div className="dodont-card-body">
                <ul>
                  {comp.whenToUse.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </div>
            </div>
            {comp.doNotUse && comp.doNotUse.length > 0 && (
              <div className="dodont-card dodont-dont">
                <div className="dodont-card-header">Do not use</div>
                <div className="dodont-card-body">
                  <ul>
                    {comp.doNotUse.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {(comp.dos?.length || comp.donts?.length) ? (
        <div className="section">
          <h3 className="section-title">Implementation Guidelines</h3>
          <div className="dodont-grid">
            {comp.dos?.length ? (
              <div className="dodont-card dodont-do">
                <div className="dodont-card-header">✓ Do</div>
                <div className="dodont-card-body">
                  <ul>{comp.dos.map((d, i) => <li key={i}>{d}</li>)}</ul>
                </div>
              </div>
            ) : null}
            {comp.donts?.length ? (
              <div className="dodont-card dodont-dont">
                <div className="dodont-card-header">✗ Don't</div>
                <div className="dodont-card-body">
                  <ul>{comp.donts.map((d, i) => <li key={i}>{d}</li>)}</ul>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {comp.antiPatterns?.length ? (
        <div className="section">
          <h3 className="section-title">Anti-patterns</h3>
          {comp.antiPatterns.map((ap, i) => (
            <div key={i} className="card" style={{ marginBottom: 8 }}>
              <div className="card-title">{ap.scenario}</div>
              <div className="card-desc">
                <strong>Why:</strong> {ap.reason}<br />
                <strong>Instead:</strong> <code>{ap.alternative}</code>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {getAnatomyTree(comp.name) && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Component Anatomy</h2>
          </div>
          <ComponentAnatomyDiagram componentName={comp.name} />
        </div>
      )}

      {(comp.requiredProviders.length > 0 || comp.mustBeInside.length > 0) && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Dependencies</h2>
          </div>
          {comp.requiredProviders.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <strong>Required providers:</strong>{' '}
              {comp.requiredProviders.map((p) => <code key={p} style={{ marginRight: 4 }}>{p}</code>)}
            </div>
          )}
          {comp.mustBeInside.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <strong>Must be inside:</strong>{' '}
              {comp.mustBeInside.map((p) => <code key={p} style={{ marginRight: 4 }}>{p}</code>)}
            </div>
          )}
          {comp.dependencyNotes && <p className="card-desc">{comp.dependencyNotes}</p>}
          {comp.commonlyPairedWith?.length ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--text-helper)', marginBottom: 4 }}>Commonly paired with</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {comp.commonlyPairedWith.map(c => <span key={c} className="badge badge-neutral">{c}</span>)}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
