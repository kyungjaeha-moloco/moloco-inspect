import React, { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
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

  const { comments, activeThreadId, setActiveThread, addComment } =
    useFeedbackStore(
      useShallow((s) => ({
        comments: s.comments,
        activeThreadId: s.activeThreadId,
        setActiveThread: s.setActiveThread,
        addComment: s.addComment,
      })),
    );

  const screenComments = useMemo(
    () =>
      Object.values(comments)
        .filter((c) => c.screenId === screenId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [comments, screenId],
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (interactionMode !== 'comment') return;

      // Calculate ratio from click position within the overlay div
      const rect = e.currentTarget.getBoundingClientRect();
      const xRatio = (e.clientX - rect.left) / rect.width;
      const yRatio = (e.clientY - rect.top) / rect.height;

      // Prompt for comment text
      const text = window.prompt('Add a comment:');
      if (!text || !text.trim()) return;

      addComment(screenId, xRatio, yRatio, text.trim());
    },
    [interactionMode, screenId, addComment],
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

  const activeComment = activeThreadId ? comments[activeThreadId] : null;
  const showActiveThread = activeComment && activeComment.screenId === screenId;

  return (
    <div
      onClick={handleOverlayClick}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: interactionMode === 'comment' || screenComments.length > 0 ? 'auto' : 'none',
        cursor: interactionMode === 'comment' ? 'crosshair' : 'default',
        zIndex: 15,
      }}
    >
      {/* Pin markers */}
      {screenComments.map((comment, idx) => (
        <CommentPin
          key={comment.id}
          comment={comment}
          index={idx}
          isActive={activeThreadId === comment.id}
          onClick={handlePinClick}
        />
      ))}

      {/* Active thread popup */}
      {showActiveThread && (
        <CommentThread
          comment={activeComment}
          onClose={handleCloseThread}
        />
      )}
    </div>
  );
});
