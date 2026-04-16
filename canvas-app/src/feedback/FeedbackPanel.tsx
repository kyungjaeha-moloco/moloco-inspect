import React, { useMemo, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useFeedbackStore } from '../store/feedback-store';
import type { CommentStatus } from '../types';

const STATUS_TABS: { value: CommentStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'rejected', label: 'Rejected' },
];

const STATUS_DOT_COLORS: Record<CommentStatus, string> = {
  open: '#346bea',
  resolved: '#28c840',
  rejected: '#999',
};

interface FeedbackPanelProps {
  isOpen: boolean;
  onToggle: () => void;
}

export const FeedbackPanel = React.memo(function FeedbackPanel({
  isOpen,
  onToggle,
}: FeedbackPanelProps) {
  const { comments, statusFilter, setStatusFilter, activeThreadId, setActiveThread } =
    useFeedbackStore(
      useShallow((s) => ({
        comments: s.comments,
        statusFilter: s.statusFilter,
        setStatusFilter: s.setStatusFilter,
        activeThreadId: s.activeThreadId,
        setActiveThread: s.setActiveThread,
      })),
    );

  const filteredComments = useMemo(() => {
    const all = Object.values(comments).sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt),
    );
    if (statusFilter === 'all') return all;
    return all.filter((c) => c.status === statusFilter);
  }, [comments, statusFilter]);

  const commentCount = Object.keys(comments).length;
  const openCount = useMemo(
    () => Object.values(comments).filter((c) => c.status === 'open').length,
    [comments],
  );

  const handleCommentClick = useCallback(
    (commentId: string) => {
      setActiveThread(activeThreadId === commentId ? null : commentId);
    },
    [activeThreadId, setActiveThread],
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

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        title="Open Feedback Panel"
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 10,
          height: 32,
          padding: '0 12px',
          borderRadius: 8,
          border: '1px solid #e0e0e0',
          background: '#fff',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 500,
          color: '#666',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        Comments
        {openCount > 0 && (
          <span
            style={{
              background: '#346bea',
              color: '#fff',
              borderRadius: 10,
              padding: '0 6px',
              fontSize: 10,
              fontWeight: 600,
              lineHeight: '18px',
            }}
          >
            {openCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        width: 300,
        height: '100%',
        background: '#fff',
        borderLeft: '1px solid #e0e0e0',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14, color: '#333', flex: 1 }}>
          Comments ({commentCount})
        </span>
        <button
          onClick={onToggle}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 16,
            color: '#999',
          }}
          title="Close"
        >
          x
        </button>
      </div>

      {/* Status filter tabs */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: '8px 12px',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            style={{
              flex: 1,
              padding: '4px 8px',
              fontSize: 11,
              fontWeight: statusFilter === tab.value ? 600 : 400,
              border: 'none',
              borderRadius: 4,
              background: statusFilter === tab.value ? '#e8f0fe' : 'transparent',
              color: statusFilter === tab.value ? '#346bea' : '#666',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Comment list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        {filteredComments.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: '#999',
              fontSize: 12,
            }}
          >
            {commentCount === 0
              ? 'No comments yet. Press C to enter comment mode.'
              : 'No comments match the current filter.'}
          </div>
        ) : (
          filteredComments.map((comment) => (
            <div
              key={comment.id}
              onClick={() => handleCommentClick(comment.id)}
              style={{
                padding: '8px 10px',
                marginBottom: 4,
                borderRadius: 6,
                border:
                  activeThreadId === comment.id
                    ? '1px solid #346bea'
                    : '1px solid #f0f0f0',
                background:
                  activeThreadId === comment.id ? '#f0f5ff' : '#fafafa',
                cursor: 'pointer',
                transition: 'background 0.1s, border-color 0.1s',
              }}
            >
              {/* Author + status + time */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 4,
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: STATUS_DOT_COLORS[comment.status],
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: 12,
                    color: '#333',
                    flex: 1,
                  }}
                >
                  {comment.author.name}
                </span>
                <span style={{ fontSize: 10, color: '#999' }}>
                  {formatTime(comment.createdAt)}
                </span>
              </div>

              {/* Text preview */}
              <div
                style={{
                  fontSize: 12,
                  color: '#555',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {comment.text}
              </div>

              {/* Reply count */}
              {comment.replies.length > 0 && (
                <div
                  style={{
                    fontSize: 10,
                    color: '#999',
                    marginTop: 4,
                  }}
                >
                  {comment.replies.length} repl{comment.replies.length === 1 ? 'y' : 'ies'}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
});
