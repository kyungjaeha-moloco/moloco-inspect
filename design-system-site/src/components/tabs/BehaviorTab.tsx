import React from 'react';

export type BehaviorData = {
  semantic_actions: Array<{ action: string; triggers: string }>;
  data_flow: { input: string; output: string; side_effects: string[] };
};

export function BehaviorTab({ data }: { data: BehaviorData | null }) {
  if (!data) {
    return <div className="empty-state">No behavior data available for this component.</div>;
  }

  return (
    <>
      {data.semantic_actions.length > 0 && (
        <div className="section behavior-section">
          <div className="section-header">
            <h2 className="section-title">Semantic Actions</h2>
          </div>
          {data.semantic_actions.map((sa, i) => (
            <div className="behavior-action" key={i}>
              <div className="behavior-action-name">{sa.action}</div>
              <div className="behavior-action-trigger">{sa.triggers}</div>
            </div>
          ))}
        </div>
      )}

      {data.data_flow && (
        <div className="section behavior-section">
          <div className="section-header">
            <h2 className="section-title">Data Flow</h2>
          </div>
          <div className="data-flow-grid">
            <div className="data-flow-card">
              <div className="data-flow-label">Input</div>
              <div className="data-flow-value">{data.data_flow.input || 'None'}</div>
            </div>
            <div className="data-flow-card">
              <div className="data-flow-label">Output</div>
              <div className="data-flow-value">{data.data_flow.output || 'None'}</div>
            </div>
            <div className="data-flow-card">
              <div className="data-flow-label">Side Effects</div>
              <div className="data-flow-value">
                {data.data_flow.side_effects && data.data_flow.side_effects.length > 0
                  ? data.data_flow.side_effects.join(', ')
                  : 'None'}
              </div>
            </div>
          </div>
        </div>
      )}

      {data.semantic_actions.length === 0 && !data.data_flow && (
        <div className="empty-state">No behavior data available for this component.</div>
      )}
    </>
  );
}
