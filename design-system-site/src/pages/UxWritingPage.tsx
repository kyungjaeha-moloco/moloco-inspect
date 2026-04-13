import React, { useState } from 'react';
import type { UxWritingJson } from '../types';

type Props = { data: UxWritingJson };

export function UxWritingPage({ data }: Props) {
  const tabs = ['Principles', 'Surface Rules', 'Terminology', 'Examples'] as const;
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>('Principles');

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">UX Writing</h1>
        <p className="page-subtitle">Voice, tone, and content guidelines for a consistent user experience.</p>
      </div>

      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Principles' && (
        <div>
          {data.service_voice.principles.map((p) => (
            <div key={p.id} className="card">
              <div className="card-title">{p.name}</div>
              <div className="card-desc">{p.rule}</div>
              {p.good_examples && Object.keys(p.good_examples).length > 0 && (
                <div style={{ marginTop: 12 }}>
                  {Object.entries(p.good_examples).map(([ctx, examples]) => (
                    <div key={ctx} style={{ marginBottom: 8 }}>
                      <strong style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', color: 'var(--text-helper)' }}>{ctx}</strong>
                      <ul style={{ paddingLeft: 20, marginTop: 4 }}>
                        {examples.map((ex, i) => <li key={i} style={{ color: 'var(--success)' }}>{ex}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'Surface Rules' && (
        <div>
          {Object.entries(data.surface_rules).map(([name, rule]) => (
            <div key={name} className="card">
              <div className="card-title">{name}</div>
              <div className="card-desc">{rule.rule}</div>
              {rule.guidance && rule.guidance.length > 0 && (
                <ul style={{ paddingLeft: 20, marginTop: 8, color: 'var(--text-secondary)' }}>
                  {rule.guidance.map((g, i) => <li key={i}>{g}</li>)}
                </ul>
              )}
              {(rule.do || rule.dont) && (
                <div className="dodont-grid" style={{ marginTop: 12 }}>
                  {rule.do && (
                    <div className="dodont-card dodont-do">
                      <div className="dodont-card-header">Do</div>
                      <div className="dodont-card-body">
                        <ul>
                          {Object.entries(rule.do).map(([ctx, items]) =>
                            items.map((item, i) => <li key={`${ctx}-${i}`}>{item}</li>)
                          )}
                        </ul>
                      </div>
                    </div>
                  )}
                  {rule.dont && (
                    <div className="dodont-card dodont-dont">
                      <div className="dodont-card-header">{"Don't"}</div>
                      <div className="dodont-card-body">
                        <ul>
                          {Object.entries(rule.dont).map(([ctx, items]) =>
                            items.map((item, i) => <li key={`${ctx}-${i}`}>{item}</li>)
                          )}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'Terminology' && (
        <div>
          <p className="card-desc" style={{ marginBottom: 16 }}>{data.service_voice.terminology.consistency_rule}</p>
          <table className="props-table">
            <thead>
              <tr><th>Concept</th><th>Korean</th><th>English</th></tr>
            </thead>
            <tbody>
              {data.service_voice.terminology.recommended.map((term) => (
                <tr key={term.concept}>
                  <td><strong>{term.concept}</strong></td>
                  <td>{term.ko}</td>
                  <td>{term.en}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'Examples' && (
        <div>
          {Object.entries(data.examples).map(([category, examples]) => (
            <div key={category} className="section">
              <div className="section-header">
                <h2 className="section-title">{category}</h2>
              </div>
              {examples.map((ex, i) => (
                <div key={i} className="card">
                  <div className="card-title">{ex.scenario}</div>
                  <div className="dodont-grid" style={{ marginTop: 8 }}>
                    <div className="dodont-card dodont-dont">
                      <div className="dodont-card-header">Before</div>
                      <div className="dodont-card-body">
                        <div>{ex.before.ko}</div>
                        <div style={{ color: 'var(--text-helper)', fontSize: 'var(--text-xs)' }}>{ex.before.en}</div>
                      </div>
                    </div>
                    <div className="dodont-card dodont-do">
                      <div className="dodont-card-header">After</div>
                      <div className="dodont-card-body">
                        <div>{ex.after.ko}</div>
                        <div style={{ color: 'var(--text-helper)', fontSize: 'var(--text-xs)' }}>{ex.after.en}</div>
                      </div>
                    </div>
                  </div>
                  <div className="card-desc" style={{ marginTop: 8 }}><strong>Why:</strong> {ex.why}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
