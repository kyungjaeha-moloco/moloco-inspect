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
  addCanvasComment: (canvasX: number, canvasY: number, text: string) => string;
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

  addCanvasComment: (canvasX, canvasY, text) => {
    const { comments, currentUser } = get();
    const newId = `comment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newComment: Comment = {
      id: newId,
      screenId: null,
      xRatio: 0,
      yRatio: 0,
      canvasX,
      canvasY,
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
      .filter((c) => c.screenId !== null && c.screenId === screenId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
}));
