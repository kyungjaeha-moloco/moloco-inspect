import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { Comment, CommentStatus } from '../types';
import { useFeedbackStore } from '../store/feedback-store';
import { ReactionBar } from './ReactionBar';

const STATUS_OPTIONS: { value: CommentStatus; label: string; color: string }[] = [
  { value: 'open', label: 'Open', color: '#346bea' },
  { value: 'resolved', label: 'Resolved', color: '#28c840' },
  { value: 'rejected', label: 'Rejected', color: '#999' },
];

interface CommentThreadProps {
  comment: Comment;
  onClose: () => void;
}

export const CommentThread = React.memo(function CommentThread({
  comment,
  onClose,
}: CommentThreadProps) {
  const [replyText, setReplyText] = useState('');
  const replyInputRef = useRef<HTMLInputElement>(null);
  const addReply = useFeedbackStore((s) => s.addReply);
  const deleteComment = useFeedbackStore((s) => s.deleteComment);
  const deleteReply = useFeedbackStore((s) => s.deleteReply);
  const setCommentStatus = useFeedbackStore((s) => s.setCommentStatus);
  const currentUserId = useFeedbackStore((s) => s.currentUser.id);

  useEffect(() => {
    replyInputRef.current?.focus();
  }, [comment.id]);

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

  const handleStatusChange = useCallback(
    (status: CommentStatus) => {
      setCommentStatus(comment.id, status);
    },
    [comment.id, setCommentStatus],
  );

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: `${comment.xRatio * 100}%`,
        top: `${comment.yRatio * 100}%`,
        transform: 'translate(-50%, 8px)',
        zIndex: 30,
        width: 280,
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: 10,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        fontSize: 13,
        color: '#333',
        overflow: 'hidden',
      }}
    >
      {/* Header: author + status + close */}
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
        {/* Status selector */}
        <select
          value={comment.status}
          onChange={(e) => handleStatusChange(e.target.value as CommentStatus)}
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

      {/* Comment body */}
      <div style={{ padding: '8px 12px' }}>
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {comment.text}
        </div>
        <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>
          {formatTime(comment.createdAt)}
        </div>

        {/* Reactions */}
        <ReactionBar commentId={comment.id} reactions={comment.reactions} />
      </div>

      {/* Replies */}
      {comment.replies.length > 0 && (
        <div
          style={{
            borderTop: '1px solid #f0f0f0',
            maxHeight: 200,
            overflowY: 'auto',
          }}
        >
          {comment.replies.map((reply) => (
            <div
              key={reply.id}
              style={{
                padding: '6px 12px',
                borderBottom: '1px solid #f8f8f8',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 12 }}>
                  {reply.author.name}
                </span>
                <span style={{ fontSize: 10, color: '#999' }}>
                  {formatTime(reply.createdAt)}
                </span>
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
              <div
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  marginTop: 2,
                }}
              >
                {reply.text}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply input */}
      <form
        onSubmit={handleSubmitReply}
        style={{
          display: 'flex',
          borderTop: '1px solid #f0f0f0',
          padding: 6,
          gap: 4,
        }}
      >
        <input
          ref={replyInputRef}
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

      {/* Delete comment (only author) */}
      {comment.author.id === currentUserId && (
        <div
          style={{
            borderTop: '1px solid #f0f0f0',
            padding: '4px 12px 6px',
            textAlign: 'right',
          }}
        >
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
});
