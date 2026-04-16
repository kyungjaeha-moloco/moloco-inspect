import React, { useCallback } from 'react';
import { useFeedbackStore } from '../store/feedback-store';

const EMOJI_OPTIONS = [
  { key: 'thumbsup', display: '\uD83D\uDC4D' },
  { key: 'thumbsdown', display: '\uD83D\uDC4E' },
  { key: 'heart', display: '\u2764\uFE0F' },
  { key: 'eyes', display: '\uD83D\uDC40' },
  { key: 'fire', display: '\uD83D\uDD25' },
  { key: 'check', display: '\u2705' },
];

interface ReactionBarProps {
  commentId: string;
  reactions: Record<string, string[]>;
}

export const ReactionBar = React.memo(function ReactionBar({
  commentId,
  reactions,
}: ReactionBarProps) {
  const toggleReaction = useFeedbackStore((s) => s.toggleReaction);
  const currentUserId = useFeedbackStore((s) => s.currentUser.id);

  const handleToggle = useCallback(
    (emoji: string) => {
      toggleReaction(commentId, emoji);
    },
    [commentId, toggleReaction],
  );

  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
      {EMOJI_OPTIONS.map((emoji) => {
        const users = reactions[emoji.key] || [];
        const isActive = users.includes(currentUserId);
        const count = users.length;

        return (
          <button
            key={emoji.key}
            onClick={() => handleToggle(emoji.key)}
            title={`${emoji.display} (${count})`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              padding: '2px 6px',
              fontSize: 12,
              border: isActive ? '1px solid #346bea' : '1px solid #e0e0e0',
              borderRadius: 12,
              background: isActive ? '#e8f0fe' : '#fff',
              cursor: 'pointer',
              lineHeight: 1,
              opacity: count > 0 ? 1 : 0.5,
            }}
          >
            <span style={{ fontSize: 13 }}>{emoji.display}</span>
            {count > 0 && (
              <span
                style={{
                  fontSize: 11,
                  color: isActive ? '#346bea' : '#666',
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});
