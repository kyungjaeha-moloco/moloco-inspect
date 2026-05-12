import React, { useCallback } from 'react';

export interface InputAreaToolbarButton {
  id: string;
  title: string;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}

export interface InputAreaProps {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  onChange: (value: string) => void;
  onSubmit: () => void;
  canSubmit: boolean;
  /** Toolbar buttons rendered to the LEFT of the send button. */
  toolbarButtons?: InputAreaToolbarButton[];
  /** Optional context strip shown above the textarea (e.g. selection chip, status). */
  aboveInput?: React.ReactNode;
  /** Optional footer row under the textarea (e.g. "inspect agent · sandbox"). */
  footer?: React.ReactNode;
  /** Hint shown to the left of the send button (e.g. "Enter 전송"). */
  hint?: string;
  sendLabel?: string;
}

/**
 * Shared input area — textarea + toolbar + footer.
 * Matches Moloco Inspect sidepanel visual language exactly so both surfaces feel identical.
 */
export const InputArea = React.memo(function InputArea({
  value,
  placeholder,
  disabled,
  rows = 3,
  onChange,
  onSubmit,
  canSubmit,
  toolbarButtons = [],
  aboveInput,
  footer,
  hint,
  sendLabel,
}: InputAreaProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (disabled) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (canSubmit) onSubmit();
      }
    },
    [disabled, canSubmit, onSubmit],
  );

  return (
    <div
      style={{
        borderTop: '1px solid var(--border-primary)',
        padding: 12,
        flex: '0 0 auto',
        background: 'var(--bg-secondary)',
      }}
    >
      <div
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-lg)',
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          transition: 'border-color 0.15s',
        }}
      >
        {aboveInput}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          style={{
            width: '100%',
            border: 'none',
            outline: 'none',
            resize: 'none',
            fontSize: 13,
            lineHeight: 1.5,
            fontFamily: 'inherit',
            color: 'var(--text-primary)',
            background: 'transparent',
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {toolbarButtons.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={b.onClick}
              disabled={b.disabled}
              title={b.title}
              aria-label={b.title}
              style={{
                width: 28,
                height: 28,
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                background: b.active ? 'var(--accent-light)' : 'transparent',
                color: b.active ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: b.disabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: b.disabled ? 0.4 : 1,
                transition: 'background 0.12s, color 0.12s',
              }}
            >
              {b.icon}
            </button>
          ))}
          {hint && (
            <span
              style={{
                flex: 1,
                fontSize: 10,
                color: 'var(--text-tertiary)',
                padding: '0 4px',
              }}
            >
              {hint}
            </span>
          )}
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit || disabled}
            title={sendLabel ?? 'Send'}
            style={{
              marginLeft: hint ? 0 : 'auto',
              padding: '6px 14px',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              background: canSubmit && !disabled ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: canSubmit && !disabled ? '#fff' : 'var(--text-tertiary)',
              cursor: canSubmit && !disabled ? 'pointer' : 'not-allowed',
              fontSize: 12,
              fontWeight: 500,
              transition: 'background 0.12s',
            }}
          >
            {sendLabel ?? 'Send'}
          </button>
        </div>
      </div>
      {footer && (
        <div
          style={{
            marginTop: 6,
            display: 'flex',
            gap: 6,
            fontSize: 10,
            color: 'var(--text-tertiary)',
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
});
