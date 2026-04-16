import React, { useCallback, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { Node } from '@xyflow/react';
import { useFeedbackStore } from '../../store/feedback-store';
import type { Comment, CommentStatus } from '../../types';

// ── Data shape for comment nodes ──────────────────────

export interface CommentNodeData extends Record<string, unknown> {
  commentId: string;
}

export type CommentFlowNode = Node<CommentNodeData, 'comment'>;

// ── Status colors (mirror CommentPin) ─────────────────

const STATUS_COLORS: Record<CommentStatus, string> = {
  open: '#346bea',
  resolved: '#28c840',
  rejected: '#999',
};

// ── Pin SVG (self-contained, no absolute positioning hack) ──

function PinIcon({ comment, index, isActive }: { comment: Comment; index: number; isActive: boolean }) {
  const color = STATUS_COLORS[comment.status];
  return (
    <svg
      width="24"
      height="32"
      viewBox="0 0 24 32"
      fill="none"
      style={{
        filter: isActive ? 'drop-shadow(0 0 4px rgba(52,107,234,0.6))' : 'none',
        transition: 'filter 0.15s',
        display: 'block',
      }}
    >
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
  );
}

// ── Inline thread popup (canvas-coordinate-aware) ─────
// Unlike the screen-level CommentThread which uses xRatio/yRatio absolute positioning,
// this one is positioned relative to the node itself (offset below the pin).

function InlineThread({ comment, onClose }: { comment: Comment; onClose: () => void }) {
  const [replyText, setReplyText] = useState('');
  const addReply = useFeedbackStore((s) => s.addReply);
  const deleteComment = useFeedbackStore((s) => s.deleteComment);
  const deleteReply = useFeedbackStore((s) => s.deleteReply);
  const setCommentStatus = useFeedbackStore((s) => s.setCommentStatus);
  const currentUserId = useFeedbackStore((s) => s.currentUser.id);

  const handleSubmitReply = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = replyText.trim();
      if (!trimmed) return;
      addReply(comment.id, trimmed);
      setReplyText('');
    },
    [comment.id, replyText, addReply],
  );

  const handleDelete = useCallback(() => {
    deleteComment(comment.id);
    onClose();
  }, [comment.id, deleteComment, onClose]);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const STATUS_OPTIONS: { value: CommentStatus; label: string; color: string }[] = [
    { value: 'open', label: 'Open', color: '#346bea' },
    { value: 'resolved', label: 'Resolved', color: '#28c840' },
    { value: 'rejected', label: 'Rejected', color: '#999' },
  ];

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: 36,
        left: 0,
        zIndex: 9999,
        width: 280,
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: 10,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        fontSize: 13,
        color: '#333',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontWeight: 600, flex: 1 }}>{comment.author.name}</span>
        <select
          value={comment.status}
          onChange={(e) => setCommentStatus(comment.id, e.target.value as CommentStatus)}
          style={{
            fontSize: 11,
            padding: '2px 4px',
            border: '1px solid #e0e0e0',
            borderRadius: 4,
            background: '#fafafa',
            color: STATUS_OPTIONS.find((s) => s.value === comment.status)?.color,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 16,
            color: '#999',
            lineHeight: 1,
            padding: '0 2px',
          }}
          title="Close"
        >
          x
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '8px 12px' }}>
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{comment.text}</div>
        <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>{formatTime(comment.createdAt)}</div>
      </div>

      {/* Replies */}
      {comment.replies.length > 0 && (
        <div style={{ borderTop: '1px solid #f0f0f0', maxHeight: 200, overflowY: 'auto' }}>
          {comment.replies.map((reply) => (
            <div key={reply.id} style={{ padding: '6px 12px', borderBottom: '1px solid #f8f8f8' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 12 }}>{reply.author.name}</span>
                <span style={{ fontSize: 10, color: '#999' }}>{formatTime(reply.createdAt)}</span>
                {reply.author.id === currentUserId && (
                  <button
                    onClick={() => deleteReply(comment.id, reply.id)}
                    style={{
                      marginLeft: 'auto',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 10,
                      color: '#ccc',
                    }}
                    title="Delete reply"
                  >
                    x
                  </button>
                )}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 2 }}>
                {reply.text}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply input */}
      <form
        onSubmit={handleSubmitReply}
        style={{ display: 'flex', borderTop: '1px solid #f0f0f0', padding: 6, gap: 4 }}
      >
        <input
          autoFocus
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="Reply..."
          style={{
            flex: 1,
            border: '1px solid #e0e0e0',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 12,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={!replyText.trim()}
          style={{
            padding: '4px 10px',
            fontSize: 12,
            fontWeight: 500,
            border: 'none',
            borderRadius: 6,
            background: replyText.trim() ? '#346bea' : '#e0e0e0',
            color: replyText.trim() ? '#fff' : '#999',
            cursor: replyText.trim() ? 'pointer' : 'default',
          }}
        >
          Send
        </button>
      </form>

      {/* Delete (author only) */}
      {comment.author.id === currentUserId && (
        <div style={{ borderTop: '1px solid #f0f0f0', padding: '4px 12px 6px', textAlign: 'right' }}>
          <button
            onClick={handleDelete}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              color: '#e74c3c',
            }}
          >
            Delete comment
          </button>
        </div>
      )}
    </div>
  );
}

// ── CommentNode ───────────────────────────────────────

export const CommentNode = React.memo(function CommentNode({
  data,
}: NodeProps<CommentFlowNode>) {
  const { commentId } = data;

  const comment = useFeedbackStore((s) => s.comments[commentId]);
  const activeThreadId = useFeedbackStore((s) => s.activeThreadId);
  const setActiveThread = useFeedbackStore((s) => s.setActiveThread);

  // Index among all canvas-level comments for the pin number
  const allComments = useFeedbackStore((s) => s.comments);
  const canvasComments = React.useMemo(
    () =>
      Object.values(allComments)
        .filter((c) => c.screenId === null)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [allComments],
  );
  const index = canvasComments.findIndex((c) => c.id === commentId);

  const isActive = activeThreadId === commentId;

  const handlePinClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setActiveThread(isActive ? null : commentId);
    },
    [commentId, isActive, setActiveThread],
  );

  const handleClose = useCallback(() => {
    setActiveThread(null);
  }, [setActiveThread]);

  if (!comment) return null;

  return (
    // nodrag class prevents ReactFlow from starting a drag when the user interacts
    // with the thread popup inputs/buttons.
    <div
      style={{ position: 'relative', width: 24, height: 32, cursor: 'pointer' }}
      title={`${comment.author.name}: ${comment.text.slice(0, 60)}`}
    >
      <div onClick={handlePinClick}>
        <PinIcon comment={comment} index={index >= 0 ? index : 0} isActive={isActive} />
      </div>

      {isActive && (
        <div className="nodrag nowheel">
          <InlineThread comment={comment} onClose={handleClose} />
        </div>
      )}
    </div>
  );
});
