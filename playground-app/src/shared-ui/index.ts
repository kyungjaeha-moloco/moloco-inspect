/**
 * Shared UI primitives — consumed by both Canvas AI panel and (future)
 * the Chrome extension sidepanel when it migrates to React.
 *
 * Design tokens live in `tokens.css` and are imported once via main.tsx.
 */

export { ChatBubble } from './components/ChatBubble';
export { InputArea, type InputAreaProps, type InputAreaToolbarButton } from './components/InputArea';
export { Card, CardSectionLabel, Chip } from './components/Card';
