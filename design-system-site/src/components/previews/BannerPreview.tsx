import React from 'react';
import type { PropValues } from '../PropControls';

export function BannerPreview({ propValues }: { propValues?: PropValues }) {
  const variant = String(propValues?.variant || 'info');
  const variantMap: Record<string, { bg: string; border: string; icon: string; text: string }> = {
    info: { bg: '#E1F5FE', border: '#0288D1', icon: '\u2139', text: 'Your campaign is under review.' },
    success: { bg: '#E8F5E9', border: '#24a148', icon: '\u2713', text: 'Campaign published successfully.' },
    warning: { bg: '#FFF8E1', border: '#f1c21b', icon: '\u26A0', text: 'Budget is running low.' },
    error: { bg: '#FFEBEE', border: '#da1e28', icon: '\u2717', text: 'Campaign delivery failed.' },
  };
  const current = variantMap[variant] || variantMap.info;
  return (
    <div style={{ padding: '12px 16px', background: current.bg, borderLeft: `3px solid ${current.border}`, borderRadius: 4, display: 'flex', alignItems: 'center', gap: 8, minWidth: 300 }}>
      <span style={{ fontSize: 14 }}>{current.icon}</span>
      <span style={{ fontSize: 13, color: '#161616' }}>{current.text}</span>
    </div>
  );
}
