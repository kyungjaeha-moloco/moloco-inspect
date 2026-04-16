import React, { useCallback, useMemo, useState } from 'react';
import { useFeedbackStore } from '../store/feedback-store';
import { useCanvasStore } from '../store/canvas-store';
import { CommentPin } from './CommentPin';
import { CommentThread } from './CommentThread';

interface CommentOverlayProps {
  screenId: string;
}

export const CommentOverlay = React.memo(function CommentOverlay({
  screenId,
}: CommentOverlayProps) {
  const interactionMode = useCanvasStore((s) => s.interactionMode);

  const allComments = useFeedbackStore((s) => s.comments);
  const activeThreadId = useFeedbackStore((s) => s.activeThreadId);
  const setActiveThread = useFeedbackStore((s) => s.setActiveThread);
  const addComment = useFeedbackStore((s) => s.addComment);

  const screenComments = useMemo(
    () =>
      Object.values(allComments)
        .filter((c) => c.screenId === screenId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [allComments, screenId],
  );

  const [pendingPin, setPendingPin] = useState<{ xRatio: number; yRatio: number } | null>(null);
  const [pendingText, setPendingText] = useState('');

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (interactionMode !== 'comment') return;

      // Calculate ratio from click position within the overlay div
      const rect = e.currentTarget.getBoundingClientRect();
      const xRatio = (e.clientX - rect.left) / rect.width;
      const yRatio = (e.clientY - rect.top) / rect.height;

      setPendingPin({ xRatio, yRatio });
      setPendingText('');
    },
    [interactionMode],
  );

  const handlePinClick = useCallback(
    (commentId: string) => {
      setActiveThread(activeThreadId === commentId ? null : commentId);
    },
    [activeThreadId, setActiveThread],
  );

  const handleCloseThread = useCallback(() => {
    setActiveThread(null);
  }, [setActiveThread]);

  const activeComment = activeThreadId ? allComments[activeThreadId] : null;
  const showActiveThread = activeComment && activeComment.screenId === screenId;

  return (
    <div
      onClick={handleOverlayClick}
      style={{
        position: 'absolute',
        inset: 0,
        // pointerEvents none by default — let clicks pass through to screen content.
        // Only set to auto in comment mode so overlay captures click-to-place events.
        pointerEvents: interactionMode === 'comment' ? 'auto' : 'none',
        cursor: interactionMode === 'comment' ? 'crosshair' : 'default',
        zIndex: 15,
      }}
    >
      {/* Pin markers — each wrapped so they capture clicks regardless of mode */}
      {screenComments.map((comment, idx) => (
        <div
          key={comment.id}
          style={{
            position: 'absolute',
            left: `${comment.xRatio * 100}%`,
            top: `${comment.yRatio * 100}%`,
            pointerEvents: 'auto',
            zIndex: 15,
          }}
        >
          <CommentPin
            comment={comment}
            index={idx}
            isActive={activeThreadId === comment.id}
            onClick={handlePinClick}
          />
        </div>
      ))}

      {/* Active thread popup */}
      {showActiveThread && (
        <div style={{ pointerEvents: 'auto' }}>
          <CommentThread
            comment={activeComment}
            onClose={handleCloseThread}
          />
        </div>
      )}

      {/* Inline comment input form — shown after clicking in comment mode */}
      {pendingPin && (
        <div
          style={{
            position: 'absolute',
            left: `${pendingPin.xRatio * 100}%`,
            top: `${pendingPin.yRatio * 100}%`,
            transform: 'translate(-50%, 8px)',
            pointerEvents: 'auto',
            zIndex: 20,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 8,
              padding: 12,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              width: 240,
              border: '1px solid #e0e0e0',
            }}
          >
            <textarea
              autoFocus
              value={pendingText}
              onChange={(e) => setPendingText(e.target.value)}
              placeholder="댓글을 입력하세요..."
              style={{
                width: '100%',
                height: 60,
                border: '1px solid #d0d0d0',
                borderRadius: 4,
                padding: 8,
                fontSize: 13,
                resize: 'none',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setPendingPin(null);
                  setPendingText('');
                }
              }}
            />
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginTop: 8,
                justifyContent: 'flex-end',
              }}
            >
              <button
                onClick={() => {
                  setPendingPin(null);
                  setPendingText('');
                }}
                style={{
                  padding: '4px 12px',
                  border: '1px solid #d0d0d0',
                  borderRadius: 4,
                  background: '#fff',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                취소
              </button>
              <button
                onClick={() => {
                  if (pendingText.trim()) {
                    addComment(screenId, pendingPin.xRatio, pendingPin.yRatio, pendingText.trim());
                    setPendingPin(null);
                    setPendingText('');
                  }
                }}
                style={{
                  padding: '4px 12px',
                  border: 'none',
                  borderRadius: 4,
                  background: '#346bea',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                등록
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
