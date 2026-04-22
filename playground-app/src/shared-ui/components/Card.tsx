import React from 'react';

/**
 * Generic card container — the base for PlanCard, ExecutionCard, ElementCard, etc.
 */
export const Card = React.memo(function Card({
  tone = 'default',
  children,
  style,
}: {
  tone?: 'default' | 'success' | 'error' | 'accent';
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const borderColor = {
    default: 'var(--border-primary)',
    success: 'var(--success-light)',
    error: 'var(--error-light)',
    accent: 'var(--accent-light)',
  }[tone];

  return (
    <div
      style={{
        background: 'var(--bg-secondary)',
        border: `1px solid ${borderColor}`,
        borderRadius: 'var(--radius-lg)',
        padding: 12,
        marginLeft: 30,
        ...style,
      }}
    >
      {children}
    </div>
  );
});

/**
 * Section heading within a card — uppercase small label.
 */
export const CardSectionLabel = React.memo(function CardSectionLabel({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: 'success' | 'error';
}) {
  const color = {
    success: 'var(--success)',
    error: 'var(--error)',
  }[tone ?? 'success'];
  return (
    <div
      style={{
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: tone ? color : 'var(--text-tertiary)',
        fontWeight: 600,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
});

export const Chip = React.memo(function Chip({
  label,
  color = 'neutral',
}: {
  label: string;
  color?: 'neutral' | 'accent' | 'success' | 'error' | 'entity';
}) {
  const bg = {
    neutral: 'var(--badge-bg)',
    accent: 'var(--chip-bg)',
    success: 'var(--success-light)',
    error: 'var(--error-light)',
    entity: 'rgba(107, 91, 214, 0.12)',
  }[color];
  const fg = {
    neutral: 'var(--badge-text)',
    accent: 'var(--chip-text)',
    success: 'var(--success)',
    error: 'var(--error)',
    entity: '#6b5bd6',
  }[color];
  return (
    <span
      style={{
        padding: '2px 8px',
        background: bg,
        color: fg,
        borderRadius: 10,
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: 0.2,
      }}
    >
      {label}
    </span>
  );
});
