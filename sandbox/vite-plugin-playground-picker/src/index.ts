/**
 * Public entry. Consumers (the sandbox's msm-portal vite config) import:
 *
 *   import { playgroundPickerPlugin } from 'vite-plugin-playground-picker';
 *   // or default:
 *   import playgroundPicker from 'vite-plugin-playground-picker';
 */

export { playgroundPickerPlugin, default } from './plugin.js';
export type {
  ElementContext,
  PickerMode,
  PickerPluginOptions,
  PickerReadyMessage,
  PickerPickedMessage,
  PickerHoverMessage,
  PickerRouteMessage,
  PickerErrorMessage,
  PlaygroundPickerCommand,
  PlaygroundPickerMessage,
} from './types.js';
export {
  PICKER_QUERY_NONCE,
  PICKER_QUERY_PARENT_ORIGIN,
  PICKER_QUERY_DEBUG,
  PICKER_MESSAGE_SOURCE,
} from './types.js';
