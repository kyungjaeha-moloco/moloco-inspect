import { applyLanguageToRoute, extractWorkplaceIdFromRoute, normalizeLanguage } from '../shared.js';
import { captureScreenshotWithMsmPortal } from '../capture.js';
import { verifyCopyVisibleWithMsmPortal } from '../verify.js';
import { verifyRouteWithMsmPortal } from '../route-verify.js';
import { createMsmPortalRuntimeConfig } from '../config.js';

export const MSM_PREVIEW_BOOTSTRAP_PATH = '/__codex/preview-bootstrap';
export const MSM_PORTAL_PRODUCT_FILE_PREFIX = 'js/msm-portal-web/';
export const MSM_PORTAL_PRODUCT_SOURCE_PREFIX = 'js/msm-portal-web/src/';

export function getPreviewRouteFromPayload(payload) {
  const explicitPath = typeof payload?.pagePath === 'string' ? payload.pagePath.trim() : '';
  if (explicitPath) return explicitPath.startsWith('/') ? explicitPath : `/${explicitPath}`;

  const pageUrl = typeof payload?.pageUrl === 'string' ? payload.pageUrl.trim() : '';
  if (!pageUrl) return '/';

  try {
    const parsed = new URL(pageUrl);
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
  } catch {
    return '/';
  }
}

export function getPreviewLanguageFromPayload(payload) {
  const explicitLanguage = normalizeLanguage(payload?.language);
  if (explicitLanguage) return explicitLanguage;

  const pageUrl = typeof payload?.pageUrl === 'string' ? payload.pageUrl.trim() : '';
  if (!pageUrl) return null;

  try {
    return normalizeLanguage(new URL(pageUrl).searchParams.get('lng'));
  } catch {
    return null;
  }
}

export function buildMsmPreviewBootstrapRoute(args) {
  return buildMsmPreviewContext(args).bootstrapRoute;
}

export function buildMsmPreviewContext(args) {
  const payload = args?.payload ?? {};
  const client = typeof args?.client === 'string' && args.client.trim() ? args.client.trim() : null;
  const language = getPreviewLanguageFromPayload(payload);
  const targetRoute = applyLanguageToRoute(getPreviewRouteFromPayload(payload), language);
  const previewUrl = new URL(MSM_PREVIEW_BOOTSTRAP_PATH, 'http://preview.local');

  previewUrl.searchParams.set('target', targetRoute || '/');

  const workplaceId = extractWorkplaceIdFromRoute(targetRoute);
  if (workplaceId) {
    previewUrl.searchParams.set('workplaceId', workplaceId);
  }

  if (language) {
    previewUrl.searchParams.set('lng', language);
  }

  if (client) {
    previewUrl.searchParams.set('client', client);
  }

  return {
    client,
    language,
    targetRoute,
    workplaceId,
    bootstrapRoute: `${previewUrl.pathname}${previewUrl.search}${previewUrl.hash}`,
  };
}

export function createMsmPortalPreviewAdapter() {
  return {
    id: 'msm-portal',
    previewBootstrapPath: MSM_PREVIEW_BOOTSTRAP_PATH,
    createRuntimeConfig(args) {
      return createMsmPortalRuntimeConfig(args);
    },
    extractWorkplaceIdFromRoute,
    getPreviewRouteFromPayload,
    getPreviewLanguageFromPayload,
    isProductFile(relativePath) {
      return typeof relativePath === 'string' && relativePath.startsWith(MSM_PORTAL_PRODUCT_FILE_PREFIX);
    },
    isProductSourceFile(relativePath) {
      return typeof relativePath === 'string' && relativePath.startsWith(MSM_PORTAL_PRODUCT_SOURCE_PREFIX);
    },
    buildPreviewContext(args) {
      return buildMsmPreviewContext(args);
    },
    buildPreviewBootstrapRoute(args) {
      return buildMsmPreviewBootstrapRoute(args);
    },
    async captureScreenshot(args) {
      return await captureScreenshotWithMsmPortal(args);
    },
    async verifyCopyVisible(args) {
      return await verifyCopyVisibleWithMsmPortal(args);
    },
    async verifyRoute(args) {
      return await verifyRouteWithMsmPortal(args);
    },
  };
}
