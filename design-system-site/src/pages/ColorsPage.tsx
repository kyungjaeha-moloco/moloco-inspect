import React, { useState } from 'react';
import type { FoundationsData, PaletteSection, TokenValue } from '../types';
import { getContrastText, formatSemantic } from '../utils';

function isTokenValue(v: unknown): v is TokenValue {
  return typeof v === 'object' && v !== null && 'hex' in v;
}

type Props = { data: FoundationsData };

export function ColorsPage({ data }: Props) {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const palette = data[mode] ?? {};

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Colors</h1>
        <p className="page-subtitle">Semantic color tokens for both light and dark modes.</p>
      </div>

      <div className="mode-toggle" style={{ marginBottom: 24 }}>
        <button
          className={`mode-toggle-btn${mode === 'light' ? ' active' : ''}`}
          onClick={() => setMode('light')}
        >Light</button>
        <button
          className={`mode-toggle-btn${mode === 'dark' ? ' active' : ''}`}
          onClick={() => setMode('dark')}
        >Dark</button>
      </div>

      {Object.entries(palette).map(([sectionName, section]) => (
        <div key={sectionName} className="section">
          <div className="section-header">
            <h2 className="section-title">{sectionName}</h2>
          </div>
          <table className="token-table">
            <thead>
              <tr>
                <th style={{ width: 48 }}>Swatch</th>
                <th>Token</th>
                <th>Hex</th>
                <th>Semantic</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(section as PaletteSection).map(([tokenName, value]) => {
                if (!isTokenValue(value)) return null;
                return (
                  <tr key={tokenName}>
                    <td>
                      <span
                        className="color-swatch"
                        style={{ backgroundColor: value.hex }}
                        title={value.hex}
                      />
                    </td>
                    <td><span className="token-name">{tokenName}</span></td>
                    <td><span className="token-hex">{value.hex}</span></td>
                    <td>{formatSemantic(value.semantic)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
