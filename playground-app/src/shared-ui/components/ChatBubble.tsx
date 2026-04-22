import React from 'react';

/**
 * Shared chat bubble — matches Moloco Inspect sidepanel visual language.
 * Used by both the Canvas AI panel and the Chrome extension (after migration).
 */
export const ChatBubble = React.memo(function ChatBubble({
  role,
  children,
  avatar,
}: {
  role: 'user' | 'assistant';
  children: React.ReactNode;
  /** Optional avatar for assistant messages. */
  avatar?: React.ReactNode;
}) {
  if (role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div
          style={{
            maxWidth: '85%',
            background: 'var(--msg-user-bg)',
            color: 'var(--msg-user-text)',
            padding: '9px 12px',
            borderRadius: '14px 14px 2px 14px',
            fontSize: 13,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <div
        style={{
          flex: '0 0 auto',
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: 'var(--accent-light)',
          color: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
        }}
        aria-hidden
      >
        {avatar ?? '✦'}
      </div>
      <div
        style={{
          flex: 1,
          fontSize: 13,
          lineHeight: 1.5,
          color: 'var(--text-primary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {children}
      </div>
    </div>
  );
});
