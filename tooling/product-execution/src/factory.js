import { createMsmPortalProductExecution } from './adapters/msm-portal.js';

export function createProductExecution(productId = 'msm-portal', args) {
  switch (productId) {
    case 'msm-portal':
      return createMsmPortalProductExecution(args);
    default:
      throw new Error(`Unknown product execution adapter: ${productId}`);
  }
}
