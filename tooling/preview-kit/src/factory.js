import { createMsmPortalPreviewAdapter } from './adapters/msm-portal.js';

export function createPreviewAdapter(productId = 'msm-portal') {
  switch (productId) {
    case 'msm-portal':
      return createMsmPortalPreviewAdapter();
    default:
      throw new Error(`Unknown preview adapter: ${productId}`);
  }
}
