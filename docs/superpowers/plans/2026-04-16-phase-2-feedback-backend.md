# Phase 2: Feedback + Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a comment/feedback system with pin comments on screens (ratio-based positioning), threaded replies, emoji reactions, status tracking (open/resolved/rejected), and a FeedbackPanel sidebar. Then set up Supabase Docker for local development with Auth, DB, and Realtime, connecting via a service adapter pattern. Enable 30-second auto-save and beforeunload warning.

**Architecture:** Comments are NOT React Flow nodes — they are absolute positioned divs inside ScreenNode, using xRatio/yRatio (0~1) for resize-safe positioning. A dedicated `feedback-store.ts` (Zustand) manages comment state separately from canvas state. Service interfaces abstract persistence so localStorage and Supabase adapters are interchangeable. Supabase Docker provides Auth + PostgreSQL + Realtime for local development.

**Tech Stack:** @supabase/supabase-js, Zustand 5, React 18, Vite 5, TypeScript, Docker (Supabase CLI)

**Spec:** `docs/superpowers/specs/2026-04-16-moloco-canvas-design.md` — Sections 3, 4, 5, 6.4, 8, 9 (Phase 2)

---

## File Map

| File | Responsibility |
|------|---------------|
| `canvas-app/src/types.ts` | Add Comment, Reply, AuthUser types |
| `canvas-app/src/store/feedback-store.ts` | Zustand store: comments Record, activeThread, CRUD actions |
| `canvas-app/src/feedback/CommentOverlay.tsx` | Absolute-positioned pin dots inside ScreenNode |
| `canvas-app/src/feedback/CommentThread.tsx` | Expanded comment thread with replies + status |
| `canvas-app/src/feedback/ReactionBar.tsx` | Emoji reaction toggle buttons |
| `canvas-app/src/feedback/FeedbackPanel.tsx` | Sidebar: full comment list + status filter |
| `canvas-app/src/feedback/CommentPin.tsx` | Single pin marker component |
| `canvas-app/src/canvas/nodes/ScreenNode.tsx` | Add CommentOverlay + comment-mode click handler |
| `canvas-app/src/canvas/Toolbar.tsx` | Visual feedback for comment mode active state |
| `canvas-app/src/services/interfaces.ts` | Service contracts: ProjectService, CanvasService, CommentService, AuthService, RealtimeService |
| `canvas-app/src/services/local-adapter.ts` | Extend with CommentService (localStorage) |
| `canvas-app/src/services/supabase-adapter.ts` | Supabase implementation of all service interfaces |
| `canvas-app/src/services/service-provider.tsx` | React context to inject active adapter |
| `canvas-app/src/hooks/useAutoSave.ts` | 30s interval auto-save + beforeunload |
| `canvas-app/src/hooks/useKeyboardShortcuts.ts` | No changes needed (C key already switches to comment mode) |
| `canvas-app/src/App.tsx` | Wire ServiceProvider, FeedbackPanel, auto-save |
| `canvas-app/src/canvas/CanvasView.tsx` | Add FeedbackPanel toggle |
| `canvas-app/package.json` | Add @supabase/supabase-js |
| `canvas-app/supabase/` | Supabase project config + migrations |

---

## Sub-Phase 2a: Comment System (Local Only)

### Task 1: Add Comment & Reply Types

**Files:**
- Modify: `canvas-app/src/types.ts`

- [ ] **Step 1: Add Comment, Reply, and AuthUser types**

Append to the end of `canvas-app/src/types.ts`:

```typescript
// ── Comment / Feedback ───────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  avatar?: string;
}

export interface Reply {
  id: string;
  text: string;
  author: AuthUser;
  createdAt: string;
}

export interface Comment {
  id: string;
  screenId: string;
  xRatio: number;              // 0~1 (screen width ratio)
  yRatio: number;              // 0~1 (screen height ratio)
  text: string;
  author: AuthUser;
  status: 'open' | 'resolved' | 'rejected';
  reactions: Record<string, string[]>;  // { "thumbsup": ["user1", "user2"] }
  replies: Reply[];
  createdAt: string;
}

export type CommentStatus = Comment['status'];
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/types.ts
git commit -m "feat(canvas): add Comment, Reply, AuthUser types for Phase 2"
```

---

### Task 2: Feedback Store

**Files:**
- Create: `canvas-app/src/store/feedback-store.ts`

- [ ] **Step 1: Create feedback-store.ts**

```typescript
import { create } from 'zustand';
import type { Comment, Reply, AuthUser, CommentStatus } from '../types';

// ── Default local user (before auth is wired) ──

const LOCAL_USER: AuthUser = {
  id: 'local-user',
  name: 'Me',
};

// ── State shape ──

interface FeedbackState {
  // Data
  comments: Record<string, Comment>;
  activeThreadId: string | null;
  statusFilter: CommentStatus | 'all';
  currentUser: AuthUser;

  // Actions — comments
  addComment: (screenId: string, xRatio: number, yRatio: number, text: string) => string;
  updateCommentText: (commentId: string, text: string) => void;
  deleteComment: (commentId: string) => void;
  setCommentStatus: (commentId: string, status: CommentStatus) => void;

  // Actions — replies
  addReply: (commentId: string, text: string) => void;
  deleteReply: (commentId: string, replyId: string) => void;

  // Actions — reactions
  toggleReaction: (commentId: string, emoji: string) => void;

  // Actions — UI
  setActiveThread: (commentId: string | null) => void;
  setStatusFilter: (filter: CommentStatus | 'all') => void;
  setCurrentUser: (user: AuthUser) => void;

  // Actions — bulk
  setComments: (comments: Record<string, Comment>) => void;
  getCommentsForScreen: (screenId: string) => Comment[];
}

export const useFeedbackStore = create<FeedbackState>()((set, get) => ({
  comments: {},
  activeThreadId: null,
  statusFilter: 'all',
  currentUser: LOCAL_USER,

  addComment: (screenId, xRatio, yRatio, text) => {
    const { comments, currentUser } = get();
    const newId = `comment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newComment: Comment = {
      id: newId,
      screenId,
      xRatio: Math.max(0, Math.min(1, xRatio)),
      yRatio: Math.max(0, Math.min(1, yRatio)),
      text,
      author: currentUser,
      status: 'open',
      reactions: {},
      replies: [],
      createdAt: new Date().toISOString(),
    };
    set({
      comments: { ...comments, [newId]: newComment },
      activeThreadId: newId,
    });
    return newId;
  },

  updateCommentText: (commentId, text) => {
    const { comments } = get();
    const comment = comments[commentId];
    if (!comment) return;
    set({
      comments: {
        ...comments,
        [commentId]: { ...comment, text },
      },
    });
  },

  deleteComment: (commentId) => {
    const { comments, activeThreadId } = get();
    if (!comments[commentId]) return;
    const newComments = { ...comments };
    delete newComments[commentId];
    set({
      comments: newComments,
      activeThreadId: activeThreadId === commentId ? null : activeThreadId,
    });
  },

  setCommentStatus: (commentId, status) => {
    const { comments } = get();
    const comment = comments[commentId];
    if (!comment) return;
    set({
      comments: {
        ...comments,
        [commentId]: { ...comment, status },
      },
    });
  },

  addReply: (commentId, text) => {
    const { comments, currentUser } = get();
    const comment = comments[commentId];
    if (!comment) return;
    const newReply: Reply = {
      id: `reply-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text,
      author: currentUser,
      createdAt: new Date().toISOString(),
    };
    set({
      comments: {
        ...comments,
        [commentId]: {
          ...comment,
          replies: [...comment.replies, newReply],
        },
      },
    });
  },

  deleteReply: (commentId, replyId) => {
    const { comments } = get();
    const comment = comments[commentId];
    if (!comment) return;
    set({
      comments: {
        ...comments,
        [commentId]: {
          ...comment,
          replies: comment.replies.filter((r) => r.id !== replyId),
        },
      },
    });
  },

  toggleReaction: (commentId, emoji) => {
    const { comments, currentUser } = get();
    const comment = comments[commentId];
    if (!comment) return;
    const reactions = { ...comment.reactions };
    const users = reactions[emoji] ? [...reactions[emoji]] : [];
    const idx = users.indexOf(currentUser.id);
    if (idx >= 0) {
      users.splice(idx, 1);
      if (users.length === 0) {
        delete reactions[emoji];
      } else {
        reactions[emoji] = users;
      }
    } else {
      reactions[emoji] = [...users, currentUser.id];
    }
    set({
      comments: {
        ...comments,
        [commentId]: { ...comment, reactions },
      },
    });
  },

  setActiveThread: (commentId) => set({ activeThreadId: commentId }),
  setStatusFilter: (filter) => set({ statusFilter: filter }),
  setCurrentUser: (user) => set({ currentUser: user }),

  setComments: (comments) => set({ comments }),

  getCommentsForScreen: (screenId) => {
    const { comments } = get();
    return Object.values(comments)
      .filter((c) => c.screenId === screenId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/store/feedback-store.ts
git commit -m "feat(canvas): add feedback Zustand store for comments/replies/reactions"
```

---

### Task 3: CommentPin Component

**Files:**
- Create: `canvas-app/src/feedback/CommentPin.tsx`

- [ ] **Step 1: Create CommentPin.tsx**

A small numbered pin marker rendered at the comment position.

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/feedback/CommentPin.tsx
git commit -m "feat(canvas): add CommentPin component with status-colored pin marker"
```

---

### Task 4: ReactionBar Component

**Files:**
- Create: `canvas-app/src/feedback/ReactionBar.tsx`

- [ ] **Step 1: Create ReactionBar.tsx**

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/feedback/ReactionBar.tsx
git commit -m "feat(canvas): add ReactionBar with emoji toggle buttons"
```

---

### Task 5: CommentThread Component

**Files:**
- Create: `canvas-app/src/feedback/CommentThread.tsx`

- [ ] **Step 1: Create CommentThread.tsx**

An expanded thread showing the comment, status controls, replies, reaction bar, and a reply input.

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/feedback/CommentThread.tsx
git commit -m "feat(canvas): add CommentThread with replies, status, reactions"
```

---

### Task 6: CommentOverlay Component

**Files:**
- Create: `canvas-app/src/feedback/CommentOverlay.tsx`

- [ ] **Step 1: Create CommentOverlay.tsx**

This renders inside ScreenNode as an absolute overlay. It shows pins for all comments on this screen and handles click-to-create in comment mode.

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/feedback/CommentOverlay.tsx
git commit -m "feat(canvas): add CommentOverlay with pin creation and thread popup"
```

---

### Task 7: FeedbackPanel Sidebar

**Files:**
- Create: `canvas-app/src/feedback/FeedbackPanel.tsx`

- [ ] **Step 1: Create FeedbackPanel.tsx**

A sidebar listing all comments with status filtering. Clicking a comment activates its thread.

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/feedback/FeedbackPanel.tsx
git commit -m "feat(canvas): add FeedbackPanel sidebar with status filter and comment list"
```

---

### Task 8: Wire CommentOverlay into ScreenNode

**Files:**
- Modify: `canvas-app/src/canvas/nodes/ScreenNode.tsx`

- [ ] **Step 1: Add CommentOverlay import and render it inside ScreenNode**

Add the import at the top of `canvas-app/src/canvas/nodes/ScreenNode.tsx`, after the existing imports:

```typescript
import { CommentOverlay } from '../../feedback/CommentOverlay';
```

Then, inside the ScreenNode JSX, add CommentOverlay as the last child before the closing `</div>` of the outer container (after the connection handles, before the closing `</div>` and `</>`). The outer container div needs `position: 'relative'` added to its style.

Find this in `canvas-app/src/canvas/nodes/ScreenNode.tsx`:
```tsx
      <div
        style={{
          width: '100%',
          minHeight: data.height,
          background: '#ffffff',
          borderRadius: 8,
          border: selected
            ? '2px solid #346bea'
            : isDragOver
              ? '2px solid #60a5fa'
              : '1px solid #e0e0e0',
          boxShadow: selected
            ? '0 0 0 2px rgba(52,107,234,0.2)'
            : isDragOver
              ? '0 0 0 2px rgba(96,165,250,0.2)'
              : '0 2px 8px rgba(0,0,0,0.08)',
          overflow: 'hidden',
          fontSize: 14,
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
      >
```

Replace with:
```tsx
      <div
        style={{
          width: '100%',
          minHeight: data.height,
          background: '#ffffff',
          borderRadius: 8,
          border: selected
            ? '2px solid #346bea'
            : isDragOver
              ? '2px solid #60a5fa'
              : '1px solid #e0e0e0',
          boxShadow: selected
            ? '0 0 0 2px rgba(52,107,234,0.2)'
            : isDragOver
              ? '0 0 0 2px rgba(96,165,250,0.2)'
              : '0 2px 8px rgba(0,0,0,0.08)',
          overflow: 'visible',
          fontSize: 14,
          transition: 'border-color 0.15s, box-shadow 0.15s',
          position: 'relative',
        }}
      >
```

Note: The outer div changes from `overflow: 'hidden'` to `overflow: 'visible'` so comment thread popups can extend beyond the node boundary. To prevent DS component content from leaking out, wrap the Components area (the div with `padding: 16`) in `overflow: 'hidden'`. The CommentOverlay is placed OUTSIDE this wrapper, still inside the outer div, so it benefits from `overflow: 'visible'`.

Then find the closing section with the Handles:
```tsx
        {/* Connection handles */}
        <Handle
          type="source"
          position={Position.Right}
          style={{ background: '#346bea' }}
        />
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: '#346bea' }}
        />
      </div>
```

Replace with:
```tsx
        {/* Connection handles */}
        <Handle
          type="source"
          position={Position.Right}
          style={{ background: '#346bea' }}
        />
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: '#346bea' }}
        />

        {/* Comment overlay — absolute pins + thread popup */}
        <CommentOverlay screenId={id} />
      </div>
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/canvas/nodes/ScreenNode.tsx
git commit -m "feat(canvas): wire CommentOverlay into ScreenNode"
```

---

### Task 9: Wire FeedbackPanel into CanvasView

**Files:**
- Modify: `canvas-app/src/canvas/CanvasView.tsx`

- [ ] **Step 1: Add FeedbackPanel import**

Add at the top of `canvas-app/src/canvas/CanvasView.tsx`, after existing imports:

```typescript
import { FeedbackPanel } from '../feedback/FeedbackPanel';
```

- [ ] **Step 2: Add feedback panel state and toggle**

Inside the `CanvasView` function, after the existing `const handlePaletteToggle` line, add:

```typescript
  // Feedback panel state
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const handleFeedbackToggle = useCallback(() => {
    setFeedbackOpen((prev) => !prev);
  }, []);
```

- [ ] **Step 3: Add FeedbackPanel to the JSX**

Find the closing of the center canvas area:
```tsx
      {/* Right sidebar: Prop Panel */}
      <PropPanel />
```

Replace with:
```tsx
      {/* Right sidebar: Prop Panel */}
      <PropPanel />

      {/* Right sidebar: Feedback Panel */}
      <FeedbackPanel isOpen={feedbackOpen} onToggle={handleFeedbackToggle} />
```

Render `<FeedbackPanel>` after `<PropPanel />` in the flex row. When open, it takes 300px as a sidebar. When closed, it takes 0px width but renders the toggle button as a fixed-position element. The FeedbackPanel component already handles both states internally.

- [ ] **Step 4: Commit**

```bash
git add canvas-app/src/canvas/CanvasView.tsx
git commit -m "feat(canvas): wire FeedbackPanel sidebar into CanvasView"
```

---

### Task 10: Extend localStorage Adapter for Comments

**Files:**
- Modify: `canvas-app/src/types.ts`
- Modify: `canvas-app/src/services/local-adapter.ts`

- [ ] **Step 1: Add comments to SavedCanvasState**

In `canvas-app/src/types.ts`, find:
```typescript
export interface SavedCanvasState {
  project: CanvasProject;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  components: Record<string, ScreenComponent>;
}
```

Replace with:
```typescript
export interface SavedCanvasState {
  project: CanvasProject;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  components: Record<string, ScreenComponent>;
  comments?: Record<string, Comment>;
}
```

- [ ] **Step 2: Update saveCanvas in local-adapter.ts**

In `canvas-app/src/services/local-adapter.ts`, update the `saveCanvas` function signature and body.

Find:
```typescript
export function saveCanvas(
  projectId: string,
  state: {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
    components: Record<string, ScreenComponent>;
  },
): boolean {
```

Replace with:
```typescript
export function saveCanvas(
  projectId: string,
  state: {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
    components: Record<string, ScreenComponent>;
    comments?: Record<string, import('../types').Comment>;
  },
): boolean {
```

Find inside `saveCanvas`:
```typescript
    nodes: state.nodes,
    edges: state.edges,
    components: state.components,
```

Replace with:
```typescript
    nodes: state.nodes,
    edges: state.edges,
    components: state.components,
    comments: state.comments,
```

- [ ] **Step 3: Update saveCanvasWithRetry similarly**

Find:
```typescript
export function saveCanvasWithRetry(
  projectId: string,
  state: {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
    components: Record<string, ScreenComponent>;
  },
): boolean {
```

Replace with:
```typescript
export function saveCanvasWithRetry(
  projectId: string,
  state: {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
    components: Record<string, ScreenComponent>;
    comments?: Record<string, import('../types').Comment>;
  },
): boolean {
```

- [ ] **Step 4: Update useKeyboardShortcuts save to include comments**

In `canvas-app/src/hooks/useKeyboardShortcuts.ts`, find:
```typescript
    const { nodes, edges, components } = useCanvasStore.getState();
    const success = saveCanvasWithRetry(DEFAULT_PROJECT_ID, {
      nodes,
      edges,
      components,
    });
```

Replace with:
```typescript
    const { nodes, edges, components } = useCanvasStore.getState();
    const { comments } = (await import('../store/feedback-store')).useFeedbackStore.getState();
    const success = saveCanvasWithRetry(DEFAULT_PROJECT_ID, {
      nodes,
      edges,
      components,
      comments,
    });
```

Wait — dynamic import in a callback is awkward. Better approach: import `useFeedbackStore` at the top of the file.

Find at the top of `canvas-app/src/hooks/useKeyboardShortcuts.ts`:
```typescript
import { useCanvasStore } from '../store/canvas-store';
import { saveCanvasWithRetry } from '../services/local-adapter';
```

Replace with:
```typescript
import { useCanvasStore } from '../store/canvas-store';
import { useFeedbackStore } from '../store/feedback-store';
import { saveCanvasWithRetry } from '../services/local-adapter';
```

Then find:
```typescript
    const { nodes, edges, components } = useCanvasStore.getState();
    const success = saveCanvasWithRetry(DEFAULT_PROJECT_ID, {
      nodes,
      edges,
      components,
    });
```

Replace with:
```typescript
    const { nodes, edges, components } = useCanvasStore.getState();
    const { comments } = useFeedbackStore.getState();
    const success = saveCanvasWithRetry(DEFAULT_PROJECT_ID, {
      nodes,
      edges,
      components,
      comments,
    });
```

- [ ] **Step 5: Update App.tsx to load comments on mount**

In `canvas-app/src/App.tsx`, find:
```typescript
import { useCanvasStore } from './store/canvas-store';
```

Replace with:
```typescript
import { useCanvasStore } from './store/canvas-store';
import { useFeedbackStore } from './store/feedback-store';
```

Find inside the `useEffect`:
```typescript
    if (saved) {
      console.log('[app] Loaded saved canvas from localStorage');
      useCanvasStore.setState({
        nodes: saved.nodes,
        edges: saved.edges,
        components: saved.components,
        isDirty: false,
      });
```

Replace with:
```typescript
    if (saved) {
      console.log('[app] Loaded saved canvas from localStorage');
      useCanvasStore.setState({
        nodes: saved.nodes,
        edges: saved.edges,
        components: saved.components,
        isDirty: false,
      });
      // Load comments if present
      if (saved.comments) {
        useFeedbackStore.setState({ comments: saved.comments });
      }
```

- [ ] **Step 6: Commit**

```bash
git add canvas-app/src/types.ts canvas-app/src/services/local-adapter.ts canvas-app/src/hooks/useKeyboardShortcuts.ts canvas-app/src/App.tsx
git commit -m "feat(canvas): persist comments in localStorage alongside canvas state"
```

---

### Task 11: Verify Sub-Phase 2a Integration

- [ ] **Step 1: Type check**

Run:
```bash
cd canvas-app && npx tsc --noEmit 2>&1 | head -40
```

Expected: No errors. If there are errors, fix them before proceeding.

- [ ] **Step 2: Start dev server and manually test**

Run:
```bash
cd canvas-app && pnpm dev
```

Expected behaviors to verify:

1. **Comment mode (C key):** Press C to enter comment mode. Toolbar shows comment icon active. Cursor changes to crosshair over screen nodes.
2. **Create comment:** In comment mode, click on a ScreenNode. A prompt appears. Type text and confirm. A numbered blue pin appears at the click location.
3. **Open thread:** Click a pin. A thread popup appears showing the comment text, author, timestamp, status dropdown, reaction bar, and reply input.
4. **Reply:** Type in the reply input and click Send. Reply appears in the thread.
5. **Reactions:** Click an emoji button. It toggles (highlighted border + count). Click again to remove.
6. **Status change:** Change the status dropdown from Open to Resolved. Pin color changes to green.
7. **FeedbackPanel:** Click the "Comments" button (top-right). Sidebar opens with all comments listed. Status filter tabs work. Click a comment in the list to activate its thread on the canvas.
8. **Persistence:** Press Ctrl+S. Refresh. Comments are restored.
9. **Pin positioning:** Resize a ScreenNode. Pins remain at the correct proportional position (ratio-based).

- [ ] **Step 3: Fix any TypeScript or runtime issues**

Common issues:
- `overflow: 'visible'` on ScreenNode may cause visual clipping issues with the title bar. If so, wrap the Components area and CommentOverlay in a `position: relative` div with `overflow: visible`.
- CommentThread popup may be clipped by React Flow viewport. Ensure `zIndex: 30` is high enough.
- `window.prompt` is blocking and ugly. This is intentional for Phase 2a simplicity. A proper inline input will be added in a future iteration.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(canvas): Phase 2a complete — comment system with pins, threads, reactions, persistence"
```

---

## Sub-Phase 2b: Service Layer + Supabase

### Task 12: Define Service Interfaces

**Files:**
- Create: `canvas-app/src/services/interfaces.ts`

- [ ] **Step 1: Create interfaces.ts**

```typescript
import type {
  CanvasProject,
  CanvasNode,
  CanvasEdge,
  ScreenComponent,
  Comment,
  AuthUser,
} from '../types';

// ── ProjectService ───────────────────────────────────

export interface ProjectService {
  listProjects(): Promise<CanvasProject[]>;
  getProject(projectId: string): Promise<CanvasProject | null>;
  createProject(name: string): Promise<CanvasProject>;
  updateProject(projectId: string, updates: Partial<CanvasProject>): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
}

// ── CanvasService ────────────────────────────────────

export interface SavedCanvas {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  components: Record<string, ScreenComponent>;
}

export interface CanvasService {
  saveCanvas(projectId: string, data: SavedCanvas): Promise<boolean>;
  loadCanvas(projectId: string): Promise<SavedCanvas | null>;
}

// ── CommentService ───────────────────────────────────

export interface CommentService {
  listComments(projectId: string): Promise<Comment[]>;
  addComment(projectId: string, comment: Comment): Promise<void>;
  updateComment(projectId: string, commentId: string, updates: Partial<Comment>): Promise<void>;
  deleteComment(projectId: string, commentId: string): Promise<void>;
}

// ── AuthService ──────────────────────────────────────

export interface AuthService {
  signIn(email: string, password: string): Promise<AuthUser>;
  signUp(email: string, password: string, name: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<AuthUser | null>;
  onAuthStateChange(callback: (user: AuthUser | null) => void): () => void;
}

// ── RealtimeService ──────────────────────────────────

export type RealtimeEvent = {
  type: 'comment_added' | 'comment_updated' | 'comment_deleted' | 'canvas_updated';
  payload: any;
};

export interface RealtimeService {
  subscribe(projectId: string, callback: (event: RealtimeEvent) => void): () => void;
  broadcast(projectId: string, event: RealtimeEvent): void;
}

// ── Combined adapter ─────────────────────────────────

export interface ServiceAdapter {
  project: ProjectService;
  canvas: CanvasService;
  comment: CommentService;
  auth: AuthService;
  realtime: RealtimeService;
}
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/services/interfaces.ts
git commit -m "feat(canvas): define service interfaces (Project, Canvas, Comment, Auth, Realtime)"
```

---

### Task 13: Refactor local-adapter to Implement Service Interfaces

**Files:**
- Modify: `canvas-app/src/services/local-adapter.ts`

- [ ] **Step 1: Rewrite local-adapter.ts to implement ServiceAdapter**

Replace the entire contents of `canvas-app/src/services/local-adapter.ts` with:

```typescript
import type {
  CanvasNode,
  CanvasEdge,
  ScreenComponent,
  CanvasProject,
  SavedCanvasState,
  Comment,
  AuthUser,
} from '../types';
import type {
  ServiceAdapter,
  ProjectService,
  CanvasService,
  CommentService,
  AuthService,
  RealtimeService,
  SavedCanvas,
  RealtimeEvent,
} from './interfaces';

const STORAGE_KEY_PREFIX = 'moloco-canvas-';
const DEFAULT_PROJECT_ID = 'default';

function getStorageKey(projectId: string): string {
  return `${STORAGE_KEY_PREFIX}${projectId}`;
}

// ── Local user ──

const LOCAL_USER: AuthUser = {
  id: 'local-user',
  name: 'Local User',
};

// ── ProjectService (localStorage) ──

const projectService: ProjectService = {
  async listProjects() {
    const ids: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_KEY_PREFIX)) {
        ids.push(key.slice(STORAGE_KEY_PREFIX.length));
      }
    }
    const projects: CanvasProject[] = [];
    for (const id of ids) {
      const p = await projectService.getProject(id);
      if (p) projects.push(p);
    }
    return projects;
  },

  async getProject(projectId) {
    try {
      const raw = localStorage.getItem(getStorageKey(projectId));
      if (!raw) return null;
      const parsed: SavedCanvasState = JSON.parse(raw);
      return parsed.project ?? null;
    } catch {
      return null;
    }
  },

  async createProject(name) {
    const id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const project: CanvasProject = {
      id,
      name,
      viewport: { x: 0, y: 0, zoom: 1 },
      schemaVersion: 1,
      createdBy: LOCAL_USER.id,
      updatedAt: new Date().toISOString(),
    };
    const state: SavedCanvasState = {
      project,
      nodes: [],
      edges: [],
      components: {},
      comments: {},
    };
    localStorage.setItem(getStorageKey(id), JSON.stringify(state));
    return project;
  },

  async updateProject(projectId, updates) {
    const raw = localStorage.getItem(getStorageKey(projectId));
    if (!raw) return;
    const state: SavedCanvasState = JSON.parse(raw);
    state.project = { ...state.project, ...updates, updatedAt: new Date().toISOString() };
    localStorage.setItem(getStorageKey(projectId), JSON.stringify(state));
  },

  async deleteProject(projectId) {
    localStorage.removeItem(getStorageKey(projectId));
  },
};

// ── CanvasService (localStorage) ──

const canvasService: CanvasService = {
  async saveCanvas(projectId, data) {
    try {
      const raw = localStorage.getItem(getStorageKey(projectId));
      let state: SavedCanvasState;
      if (raw) {
        state = JSON.parse(raw);
        state.nodes = data.nodes;
        state.edges = data.edges;
        state.components = data.components;
        state.project.updatedAt = new Date().toISOString();
      } else {
        state = {
          project: {
            id: projectId,
            name: 'Untitled Project',
            viewport: { x: 0, y: 0, zoom: 1 },
            schemaVersion: 1,
            createdBy: LOCAL_USER.id,
            updatedAt: new Date().toISOString(),
          },
          nodes: data.nodes,
          edges: data.edges,
          components: data.components,
          comments: {},
        };
      }
      localStorage.setItem(getStorageKey(projectId), JSON.stringify(state));
      return true;
    } catch (err) {
      console.error('[local-adapter] Save failed:', err);
      return false;
    }
  },

  async loadCanvas(projectId) {
    try {
      const raw = localStorage.getItem(getStorageKey(projectId));
      if (!raw) return null;
      const parsed: SavedCanvasState = JSON.parse(raw);
      if (!parsed.nodes || !parsed.edges || !parsed.components) return null;
      return {
        nodes: parsed.nodes,
        edges: parsed.edges,
        components: parsed.components,
      };
    } catch (err) {
      console.error('[local-adapter] Load failed:', err);
      return null;
    }
  },
};

// ── CommentService (localStorage) ──

const commentService: CommentService = {
  async listComments(projectId) {
    try {
      const raw = localStorage.getItem(getStorageKey(projectId));
      if (!raw) return [];
      const parsed: SavedCanvasState = JSON.parse(raw);
      return Object.values(parsed.comments ?? {});
    } catch {
      return [];
    }
  },

  async addComment(projectId, comment) {
    const raw = localStorage.getItem(getStorageKey(projectId));
    if (!raw) return;
    const state: SavedCanvasState = JSON.parse(raw);
    const comments = state.comments ?? {};
    comments[comment.id] = comment;
    state.comments = comments;
    localStorage.setItem(getStorageKey(projectId), JSON.stringify(state));
  },

  async updateComment(projectId, commentId, updates) {
    const raw = localStorage.getItem(getStorageKey(projectId));
    if (!raw) return;
    const state: SavedCanvasState = JSON.parse(raw);
    const comments = state.comments ?? {};
    if (!comments[commentId]) return;
    comments[commentId] = { ...comments[commentId], ...updates };
    state.comments = comments;
    localStorage.setItem(getStorageKey(projectId), JSON.stringify(state));
  },

  async deleteComment(projectId, commentId) {
    const raw = localStorage.getItem(getStorageKey(projectId));
    if (!raw) return;
    const state: SavedCanvasState = JSON.parse(raw);
    const comments = state.comments ?? {};
    delete comments[commentId];
    state.comments = comments;
    localStorage.setItem(getStorageKey(projectId), JSON.stringify(state));
  },
};

// ── AuthService (localStorage — no-op) ──

const authService: AuthService = {
  async signIn() {
    return LOCAL_USER;
  },
  async signUp(_email, _password, name) {
    return { ...LOCAL_USER, name };
  },
  async signOut() {},
  async getCurrentUser() {
    return LOCAL_USER;
  },
  onAuthStateChange(callback) {
    callback(LOCAL_USER);
    return () => {};
  },
};

// ── RealtimeService (localStorage — no-op) ──

const realtimeService: RealtimeService = {
  subscribe() {
    return () => {};
  },
  broadcast() {},
};

// ── Combined adapter ──

export const localAdapter: ServiceAdapter = {
  project: projectService,
  canvas: canvasService,
  comment: commentService,
  auth: authService,
  realtime: realtimeService,
};

// ── Legacy exports (backward compatibility with existing code) ──

export function saveCanvas(
  projectId: string,
  state: {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
    components: Record<string, ScreenComponent>;
    comments?: Record<string, Comment>;
  },
): boolean {
  const saved: SavedCanvasState = {
    project: {
      id: projectId,
      name: 'Untitled Project',
      viewport: { x: 0, y: 0, zoom: 1 },
      schemaVersion: 1,
      createdBy: 'local',
      updatedAt: new Date().toISOString(),
    },
    nodes: state.nodes,
    edges: state.edges,
    components: state.components,
    comments: state.comments,
  };

  try {
    localStorage.setItem(getStorageKey(projectId), JSON.stringify(saved));
    return true;
  } catch (err) {
    console.error('[local-adapter] Save failed:', err);
    return false;
  }
}

export function loadCanvas(projectId: string): SavedCanvasState | null {
  try {
    const raw = localStorage.getItem(getStorageKey(projectId));
    if (!raw) return null;
    const parsed: SavedCanvasState = JSON.parse(raw);
    if (!parsed.nodes || !parsed.edges || !parsed.components) return null;
    return parsed;
  } catch (err) {
    console.error('[local-adapter] Load failed:', err);
    return null;
  }
}

export function saveCanvasWithRetry(
  projectId: string,
  state: {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
    components: Record<string, ScreenComponent>;
    comments?: Record<string, Comment>;
  },
): boolean {
  const success = saveCanvas(projectId, state);
  if (success) return true;
  console.warn('[local-adapter] Retrying save...');
  const retrySuccess = saveCanvas(projectId, state);
  if (!retrySuccess) {
    console.error('[local-adapter] Save failed after retry.');
  }
  return retrySuccess;
}

export function deleteCanvas(projectId: string): void {
  localStorage.removeItem(getStorageKey(projectId));
}

export function listSavedProjects(): string[] {
  const ids: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_KEY_PREFIX)) {
      ids.push(key.slice(STORAGE_KEY_PREFIX.length));
    }
  }
  return ids;
}

export { DEFAULT_PROJECT_ID };
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/services/local-adapter.ts
git commit -m "feat(canvas): refactor local-adapter to implement ServiceAdapter interfaces"
```

---

### Task 14: Service Provider Context

**Files:**
- Create: `canvas-app/src/services/service-provider.tsx`

- [ ] **Step 1: Create service-provider.tsx**

A React context that provides the active service adapter to the component tree.

```tsx
import React, { createContext, useContext, type ReactNode } from 'react';
import type { ServiceAdapter } from './interfaces';
import { localAdapter } from './local-adapter';

const ServiceContext = createContext<ServiceAdapter>(localAdapter);

interface ServiceProviderProps {
  adapter?: ServiceAdapter;
  children: ReactNode;
}

export function ServiceProvider({
  adapter = localAdapter,
  children,
}: ServiceProviderProps) {
  return (
    <ServiceContext.Provider value={adapter}>
      {children}
    </ServiceContext.Provider>
  );
}

export function useService(): ServiceAdapter {
  return useContext(ServiceContext);
}

export function useProjectService() {
  return useContext(ServiceContext).project;
}

export function useCanvasService() {
  return useContext(ServiceContext).canvas;
}

export function useCommentService() {
  return useContext(ServiceContext).comment;
}

export function useAuthService() {
  return useContext(ServiceContext).auth;
}

export function useRealtimeService() {
  return useContext(ServiceContext).realtime;
}
```

- [ ] **Step 2: Wire ServiceProvider in App.tsx**

In `canvas-app/src/App.tsx`, add the import:

```typescript
import { ServiceProvider } from './services/service-provider';
```

Wrap the return JSX with `<ServiceProvider>`:

Find:
```tsx
  return (
    <ReactFlowProvider>
```

Replace with:
```tsx
  return (
    <ServiceProvider>
    <ReactFlowProvider>
```

Find the closing:
```tsx
    </ReactFlowProvider>
  );
```

Replace with:
```tsx
    </ReactFlowProvider>
    </ServiceProvider>
  );
```

- [ ] **Step 3: Commit**

```bash
git add canvas-app/src/services/service-provider.tsx canvas-app/src/App.tsx
git commit -m "feat(canvas): add ServiceProvider context for adapter injection"
```

---

### Task 15: Install Supabase Dependencies

**Files:**
- Modify: `canvas-app/package.json`

- [ ] **Step 1: Install @supabase/supabase-js**

Run:
```bash
cd canvas-app && pnpm add @supabase/supabase-js
```

Expected: `@supabase/supabase-js` appears in package.json dependencies.

- [ ] **Step 2: Commit**

```bash
git add canvas-app/package.json canvas-app/pnpm-lock.yaml
git commit -m "feat(canvas): add @supabase/supabase-js dependency for Phase 2b"
```

---

### Task 16: Supabase Docker Setup

**Files:**
- Create: `canvas-app/supabase/config.toml`
- Create: `canvas-app/supabase/migrations/00001_initial_schema.sql`

- [ ] **Step 1: Initialize Supabase in canvas-app directory**

Run:
```bash
cd canvas-app && npx supabase init
```

This creates `canvas-app/supabase/` directory with `config.toml`.

If `supabase` CLI is not available, install it first:
```bash
brew install supabase/tap/supabase
```

- [ ] **Step 2: Create initial database migration**

Create the file `canvas-app/supabase/migrations/00001_initial_schema.sql`:

```sql
-- ================================================
-- Moloco Canvas — Phase 2 Database Schema
-- ================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Projects ──

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL DEFAULT 'Untitled Project',
  viewport JSONB NOT NULL DEFAULT '{"x": 0, "y": 0, "zoom": 1}',
  schema_version INT NOT NULL DEFAULT 1,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Canvas State (nodes, edges, components as JSONB) ──

CREATE TABLE canvas_states (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  nodes JSONB NOT NULL DEFAULT '[]',
  edges JSONB NOT NULL DEFAULT '[]',
  components JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Comments ──

CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  screen_id TEXT NOT NULL,
  x_ratio REAL NOT NULL CHECK (x_ratio >= 0 AND x_ratio <= 1),
  y_ratio REAL NOT NULL CHECK (y_ratio >= 0 AND y_ratio <= 1),
  text TEXT NOT NULL,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  author_avatar TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'rejected')),
  reactions JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_project ON comments(project_id);
CREATE INDEX idx_comments_screen ON comments(project_id, screen_id);

-- ── Replies ──

CREATE TABLE replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_replies_comment ON replies(comment_id);

-- ── Row Level Security ──

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE replies ENABLE ROW LEVEL SECURITY;

-- For local development, allow all authenticated users full access
-- (Tighten in production with proper org/team-based policies)

CREATE POLICY "Authenticated users can CRUD projects"
  ON projects FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can CRUD canvas_states"
  ON canvas_states FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can CRUD comments"
  ON comments FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can CRUD replies"
  ON replies FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ── Realtime ──

ALTER PUBLICATION supabase_realtime ADD TABLE comments;
ALTER PUBLICATION supabase_realtime ADD TABLE replies;

-- ── Updated-at trigger ──

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER canvas_states_updated_at
  BEFORE UPDATE ON canvas_states
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 3: Start Supabase Docker**

Run:
```bash
cd canvas-app && npx supabase start
```

This pulls and starts the Docker containers. Note the output which includes:
- API URL (e.g., `http://127.0.0.1:54321`)
- anon key
- service_role key
- Studio URL (e.g., `http://127.0.0.1:54323`)

Save these values for the next step.

- [ ] **Step 4: Apply migration**

```bash
cd canvas-app && npx supabase db reset
```

This drops and recreates the database with the migration applied.

- [ ] **Step 5: Create .env.local with Supabase credentials**

Create `canvas-app/.env.local`:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<anon-key-from-supabase-start-output>
```

Add `.env.local` to `.gitignore` if not already present:
```bash
echo ".env.local" >> canvas-app/.gitignore
```

- [ ] **Step 6: Commit (exclude .env.local)**

```bash
git add canvas-app/supabase/ canvas-app/.gitignore
git commit -m "feat(canvas): add Supabase Docker setup with initial schema migration"
```

---

### Task 17: Supabase Client + Adapter

**Files:**
- Create: `canvas-app/src/services/supabase-client.ts`
- Create: `canvas-app/src/services/supabase-adapter.ts`

- [ ] **Step 1: Create supabase-client.ts**

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Supabase features disabled.',
  );
}

export const supabase = createClient(
  supabaseUrl || 'http://localhost:54321',
  supabaseAnonKey || 'placeholder',
);
```

- [ ] **Step 2: Create supabase-adapter.ts**

```typescript
import { supabase } from './supabase-client';
import type {
  ServiceAdapter,
  ProjectService,
  CanvasService,
  CommentService,
  AuthService,
  RealtimeService,
  SavedCanvas,
  RealtimeEvent,
} from './interfaces';
import type { CanvasProject, Comment, Reply, AuthUser } from '../types';

// ── Helpers ──

function mapDbUser(user: { id: string; email?: string; user_metadata?: any }): AuthUser {
  return {
    id: user.id,
    name: user.user_metadata?.name || user.email || 'Unknown',
    avatar: user.user_metadata?.avatar_url,
  };
}

function mapDbComment(row: any, replies: any[] = []): Comment {
  return {
    id: row.id,
    screenId: row.screen_id,
    xRatio: row.x_ratio,
    yRatio: row.y_ratio,
    text: row.text,
    author: {
      id: row.author_id,
      name: row.author_name,
      avatar: row.author_avatar,
    },
    status: row.status,
    reactions: row.reactions || {},
    replies: replies.map((r) => ({
      id: r.id,
      text: r.text,
      author: { id: r.author_id, name: r.author_name },
      createdAt: r.created_at,
    })),
    createdAt: row.created_at,
  };
}

// ── ProjectService (Supabase) ──

const projectService: ProjectService = {
  async listProjects() {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      viewport: row.viewport,
      schemaVersion: row.schema_version,
      createdBy: row.created_by,
      updatedAt: row.updated_at,
    }));
  },

  async getProject(projectId) {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();
    if (error || !data) return null;
    return {
      id: data.id,
      name: data.name,
      viewport: data.viewport,
      schemaVersion: data.schema_version,
      createdBy: data.created_by,
      updatedAt: data.updated_at,
    };
  },

  async createProject(name) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('projects')
      .insert({ name, created_by: user?.id })
      .select()
      .single();
    if (error) throw error;

    // Initialize empty canvas state
    await supabase
      .from('canvas_states')
      .insert({ project_id: data.id });

    return {
      id: data.id,
      name: data.name,
      viewport: data.viewport,
      schemaVersion: data.schema_version,
      createdBy: data.created_by,
      updatedAt: data.updated_at,
    };
  },

  async updateProject(projectId, updates) {
    const dbUpdates: any = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.viewport !== undefined) dbUpdates.viewport = updates.viewport;
    const { error } = await supabase
      .from('projects')
      .update(dbUpdates)
      .eq('id', projectId);
    if (error) throw error;
  },

  async deleteProject(projectId) {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);
    if (error) throw error;
  },
};

// ── CanvasService (Supabase) ──

const canvasService: CanvasService = {
  async saveCanvas(projectId, data) {
    const { error } = await supabase
      .from('canvas_states')
      .upsert({
        project_id: projectId,
        nodes: data.nodes,
        edges: data.edges,
        components: data.components,
      });
    if (error) {
      console.error('[supabase-adapter] Save failed:', error);
      return false;
    }
    // Update project timestamp
    await supabase
      .from('projects')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', projectId);
    return true;
  },

  async loadCanvas(projectId) {
    const { data, error } = await supabase
      .from('canvas_states')
      .select('nodes, edges, components')
      .eq('project_id', projectId)
      .single();
    if (error || !data) return null;
    return {
      nodes: data.nodes || [],
      edges: data.edges || [],
      components: data.components || {},
    };
  },
};

// ── CommentService (Supabase) ──

const commentService: CommentService = {
  async listComments(projectId) {
    const { data: rows, error } = await supabase
      .from('comments')
      .select('*, replies(*)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (rows || []).map((row) => mapDbComment(row, row.replies || []));
  },

  async addComment(projectId, comment) {
    const { error: commentError } = await supabase.from('comments').insert({
      id: comment.id,
      project_id: projectId,
      screen_id: comment.screenId,
      x_ratio: comment.xRatio,
      y_ratio: comment.yRatio,
      text: comment.text,
      author_id: comment.author.id,
      author_name: comment.author.name,
      author_avatar: comment.author.avatar || null,
      status: comment.status,
      reactions: comment.reactions,
    });
    if (commentError) throw commentError;

    // Insert replies if any
    if (comment.replies.length > 0) {
      const replyRows = comment.replies.map((r) => ({
        id: r.id,
        comment_id: comment.id,
        text: r.text,
        author_id: r.author.id,
        author_name: r.author.name,
      }));
      const { error: replyError } = await supabase.from('replies').insert(replyRows);
      if (replyError) throw replyError;
    }
  },

  async updateComment(_projectId, commentId, updates) {
    const dbUpdates: any = {};
    if (updates.text !== undefined) dbUpdates.text = updates.text;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.reactions !== undefined) dbUpdates.reactions = updates.reactions;
    const { error } = await supabase
      .from('comments')
      .update(dbUpdates)
      .eq('id', commentId);
    if (error) throw error;
  },

  async deleteComment(_projectId, commentId) {
    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId);
    if (error) throw error;
  },
};

// ── AuthService (Supabase) ──

const authService: AuthService = {
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return mapDbUser(data.user);
  },

  async signUp(email, password, name) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) throw error;
    if (!data.user) throw new Error('Sign up failed');
    return mapDbUser(data.user);
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    return mapDbUser(user);
  },

  onAuthStateChange(callback) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        callback(session?.user ? mapDbUser(session.user) : null);
      },
    );
    return () => subscription.unsubscribe();
  },
};

// ── RealtimeService (Supabase) ──

const realtimeService: RealtimeService = {
  subscribe(projectId, callback) {
    const channel = supabase
      .channel(`canvas-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const eventType =
            payload.eventType === 'INSERT'
              ? 'comment_added'
              : payload.eventType === 'UPDATE'
                ? 'comment_updated'
                : 'comment_deleted';
          callback({ type: eventType, payload: payload.new || payload.old });
        },
      )
      .on('broadcast', { event: 'canvas_update' }, (payload) => {
        callback({ type: 'canvas_updated', payload: payload.payload });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  broadcast(projectId, event) {
    supabase.channel(`canvas-${projectId}`).send({
      type: 'broadcast',
      event: 'canvas_update',
      payload: event.payload,
    });
  },
};

// ── Combined adapter ──

export const supabaseAdapter: ServiceAdapter = {
  project: projectService,
  canvas: canvasService,
  comment: commentService,
  auth: authService,
  realtime: realtimeService,
};
```

- [ ] **Step 3: Commit**

```bash
git add canvas-app/src/services/supabase-client.ts canvas-app/src/services/supabase-adapter.ts
git commit -m "feat(canvas): add Supabase adapter implementing all service interfaces"
```

---

### Task 18: Auto-Save Hook

**Files:**
- Create: `canvas-app/src/hooks/useAutoSave.ts`

- [ ] **Step 1: Create useAutoSave.ts**

30-second interval auto-save + beforeunload warning when dirty.

```typescript
import { useEffect, useRef, useCallback } from 'react';
import { useCanvasStore } from '../store/canvas-store';
import { useFeedbackStore } from '../store/feedback-store';
import { saveCanvasWithRetry, DEFAULT_PROJECT_ID } from '../services/local-adapter';

const AUTO_SAVE_INTERVAL = 30_000; // 30 seconds

export function useAutoSave() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doSave = useCallback(() => {
    const { nodes, edges, components, isDirty } = useCanvasStore.getState();
    if (!isDirty) return;

    const { comments } = useFeedbackStore.getState();
    const success = saveCanvasWithRetry(DEFAULT_PROJECT_ID, {
      nodes,
      edges,
      components,
      comments,
    });
    if (success) {
      useCanvasStore.setState({ isDirty: false });
      console.log('[auto-save] Canvas auto-saved');
    }
  }, []);

  // Auto-save interval
  useEffect(() => {
    intervalRef.current = setInterval(doSave, AUTO_SAVE_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [doSave]);

  // beforeunload warning
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      const { isDirty } = useCanvasStore.getState();
      if (isDirty) {
        e.preventDefault();
        // Modern browsers show a generic message; setting returnValue is still required
        e.returnValue = '';
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return { saveNow: doSave };
}
```

- [ ] **Step 2: Wire useAutoSave in CanvasView**

In `canvas-app/src/canvas/CanvasView.tsx`, add the import:

```typescript
import { useAutoSave } from '../hooks/useAutoSave';
```

Inside the `CanvasView` function, after the `useKeyboardShortcuts` call, add:

```typescript
  // Auto-save every 30s + beforeunload warning
  useAutoSave();
```

- [ ] **Step 3: Commit**

```bash
git add canvas-app/src/hooks/useAutoSave.ts canvas-app/src/canvas/CanvasView.tsx
git commit -m "feat(canvas): add 30s auto-save interval + beforeunload warning"
```

---

### Task 19: Vite Environment Types

**Files:**
- Create: `canvas-app/src/env.d.ts`

- [ ] **Step 1: Create env.d.ts for Vite env variables**

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 2: Commit**

```bash
git add canvas-app/src/env.d.ts
git commit -m "feat(canvas): add Vite environment type declarations for Supabase"
```

---

### Task 20: Verify Full Phase 2 Integration

- [ ] **Step 1: Type check**

Run:
```bash
cd canvas-app && npx tsc --noEmit 2>&1 | head -50
```

Expected: No errors.

- [ ] **Step 2: Start dev server and test Sub-Phase 2a features**

Run:
```bash
cd canvas-app && pnpm dev
```

Verify all Sub-Phase 2a behaviors from Task 11 still work.

- [ ] **Step 3: Test Supabase Docker (requires Docker running)**

Run:
```bash
cd canvas-app && npx supabase start
```

Verify:
1. Supabase Studio is accessible at `http://127.0.0.1:54323`
2. Tables (projects, canvas_states, comments, replies) are visible in the Studio
3. Create a test user via Studio > Authentication > Add User

- [ ] **Step 4: Test Supabase adapter (manual swap)**

Temporarily modify `canvas-app/src/App.tsx` to use `supabaseAdapter` instead of `localAdapter`:

```typescript
import { supabaseAdapter } from './services/supabase-adapter';
// ...
<ServiceProvider adapter={supabaseAdapter}>
```

Then verify:
1. Login with the test user credentials
2. Create a new project
3. Add nodes and save
4. Refresh — data loads from Supabase
5. Add comments — they persist in the database

Revert the adapter swap after testing (keep `localAdapter` as default).

- [ ] **Step 5: Fix any TypeScript or runtime issues**

Common issues:
- Supabase client import.meta.env may be undefined if .env.local is missing. The client handles this gracefully with console.warn.
- RLS policies may block unauthenticated requests. For local dev, ensure you are signed in.
- Realtime subscription requires the channel to be active. Check that `supabase_realtime` publication includes the tables.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(canvas): Phase 2 complete — feedback system + Supabase backend"
```

---

## Acceptance Criteria Checklist

These map to the spec's Phase 2 completion criteria:

- [ ] Comment mode (C key) activates crosshair cursor; clicking on a ScreenNode creates a pin comment at the correct proportional position (xRatio/yRatio)
- [ ] Pin markers are numbered, colored by status (blue=open, green=resolved, gray=rejected), and survive screen resize
- [ ] Clicking a pin opens a CommentThread popup with: text, author, timestamp, status dropdown, reaction bar, reply input
- [ ] Replies can be added and deleted; reply count shows in FeedbackPanel
- [ ] Emoji reactions toggle on click (highlighted when active, count displayed)
- [ ] Status can be changed between open/resolved/rejected via dropdown
- [ ] FeedbackPanel sidebar shows all comments with status filter tabs (All/Open/Resolved/Rejected)
- [ ] Comments are persisted in localStorage alongside canvas state (Ctrl+S and auto-save)
- [ ] Auto-save triggers every 30 seconds when there are unsaved changes
- [ ] beforeunload warning appears when navigating away with unsaved changes
- [ ] Service interfaces (ProjectService, CanvasService, CommentService, AuthService, RealtimeService) are defined and implemented by both local and Supabase adapters
- [ ] ServiceProvider context allows swapping between localStorage and Supabase adapters
- [ ] Supabase Docker starts with `supabase start` and creates all required tables (projects, canvas_states, comments, replies)
- [ ] Supabase adapter supports Auth (signIn/signUp/signOut), DB operations, and Realtime subscriptions
- [ ] RLS policies ensure only authenticated users can access data
- [ ] After logging into Supabase, saved projects can be loaded and displayed on the canvas
