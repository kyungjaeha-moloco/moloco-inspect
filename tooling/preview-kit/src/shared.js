export function normalizeLanguage(language) {
  const normalized = typeof language === 'string' ? language.trim().toLowerCase() : '';
  if (!normalized) return null;
  if (normalized.startsWith('ko')) return 'ko';
  if (normalized.startsWith('en')) return 'en';
  return normalized;
}

export function applyLanguageToRoute(route, language) {
  const normalizedLanguage = normalizeLanguage(language);
  if (!normalizedLanguage) {
    return route || '/';
  }

  const previewUrl = new URL(route || '/', 'http://preview.local');
  previewUrl.searchParams.set('lng', normalizedLanguage);
  return `${previewUrl.pathname}${previewUrl.search}${previewUrl.hash}`;
}

export function extractWorkplaceIdFromRoute(route) {
  const match = String(route || '').match(/\/v1\/p\/([^/]+)/);
  return match?.[1] || null;
}
