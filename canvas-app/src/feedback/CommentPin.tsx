import React, { useCallback } from 'react';
import type { Comment, CommentStatus } from '../types';

const STATUS_COLORS: Record<CommentStatus, string> = {
  open: '#346bea',
  resolved: '#28c840',
  rejected: '#999',
};

interface CommentPinProps {
  comment: Comment;
  index: number;
  isActive: boolean;
  onClick: (commentId: string) => void;
}

export const CommentPin = React.memo(function CommentPin({
  comment,
  index,
  isActive,
  onClick,
}: CommentPinProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick(comment.id);
    },
    [comment.id, onClick],
  );

  const color = STATUS_COLORS[comment.status];

  return (
    <div
      onClick={handleClick}
      title={`${comment.author.name}: ${comment.text.slice(0, 60)}`}
      style={{
        position: 'absolute',
        left: `${comment.xRatio * 100}%`,
        top: `${comment.yRatio * 100}%`,
        transform: 'translate(-50%, -100%)',
        zIndex: 20,
        cursor: 'pointer',
        filter: isActive ? 'drop-shadow(0 0 4px rgba(52,107,234,0.6))' : 'none',
        transition: 'filter 0.15s',
      }}
    >
      {/* Pin shape */}
      <svg width="24" height="32" viewBox="0 0 24 32" fill="none">
        <path
          d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20s12-11 12-20C24 5.373 18.627 0 12 0z"
          fill={color}
        />
        <text
          x="12"
          y="15"
          textAnchor="middle"
          fill="#fff"
          fontSize="10"
          fontWeight="600"
          fontFamily="sans-serif"
        >
          {index + 1}
        </text>
      </svg>
    </div>
  );
});
