import React from 'react';
import type { ComponentEntry } from '../../types';
import { CodeBlock } from '../CodeBlock';

export function CodeTab({ comp }: { comp: ComponentEntry }) {
  return (
    <>
      {comp.example && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Example</h2>
          </div>
          <div className="code-block-header">JSX</div>
          <CodeBlock code={comp.example} />
        </div>
      )}

      {comp.recipeCode && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Rendering Recipe</h2>
          </div>
          {comp.recipeDescription && <p className="card-desc" style={{ marginBottom: 12 }}>{comp.recipeDescription}</p>}
          <CodeBlock code={comp.recipeCode} />
        </div>
      )}

      {!comp.example && !comp.recipeCode && (
        <div className="empty-state">No code examples available for this component.</div>
      )}
    </>
  );
}
