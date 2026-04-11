import { createMsmPortalProductRunner } from './adapters/msm-portal.js';

export function createProductRunner(productId = 'msm-portal', args) {
  switch (productId) {
    case 'msm-portal':
      return createMsmPortalProductRunner(args);
    default:
      throw new Error(`Unknown product runner: ${productId}`);
  }
}
