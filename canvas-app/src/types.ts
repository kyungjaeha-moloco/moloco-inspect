import type { Node, Edge } from '@xyflow/react';

// ── Section (Group Node) ──────────────────────────────

export interface SectionData extends Record<string, unknown> {
  name: string;
  color: string;
}

export type SectionNode = Node<SectionData, 'section'>;

// ── Screen (Custom Node) ──────────────────────────────

export interface ScreenData extends Record<string, unknown> {
  name: string;
  width: number;
  height: number;
  zIndex: number;
  locked: boolean;
}

export type ScreenNode = Node<ScreenData, 'screen'>;

// ── ScreenComponent (flat map) ────────────────────────

export interface ScreenComponent {
  id: string;
  screenId: string;
  parentId: string | null;
  childIds: string[];
  type: string;
  props: Record<string, any>;
  order: number;
  createdAt: string;
}

// ── Flow Edge ─────────────────────────────────────────

export interface FlowData extends Record<string, unknown> {
  label: string;
}

export type FlowEdge = Edge<FlowData>;

// ── Canvas Project ────────────────────────────────────

export interface CanvasProject {
  id: string;
  name: string;
  viewport: { x: number; y: number; zoom: number };
  schemaVersion: number;
  createdBy: string;
  updatedAt: string;
}

// ── Interaction Mode ──────────────────────────────────

export type InteractionMode = 'select' | 'pan' | 'comment';

// ── Union types for React Flow ────────────────────────

export type CanvasNode = SectionNode | ScreenNode;
export type CanvasEdge = FlowEdge;

// ── Saved State (for localStorage persistence) ───────

export interface SavedCanvasState {
  project: CanvasProject;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  components: Record<string, ScreenComponent>;
}

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
