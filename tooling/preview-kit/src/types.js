/**
 * @typedef {Object} MTPreviewBootstrapInput
 * @property {unknown} payload
 * @property {string | null | undefined} [client]
 */

/**
 * @typedef {Object} MTPreviewContext
 * @property {string | null} client
 * @property {string | null} language
 * @property {string} targetRoute
 * @property {string | null} workplaceId
 * @property {string} bootstrapRoute
 */

/**
 * @typedef {Object} MTPreviewCaptureInput
 * @property {string} msmRepoRoot
 * @property {string} worktreePath
 * @property {string} previewUrl
 * @property {string} screenshotPath
 * @property {string | null | undefined} [expectedLanguage]
 * @property {string | null | undefined} [client]
 */

/**
 * @typedef {Object} MTPreviewVerifyRouteInput
 * @property {string} msmRepoRoot
 * @property {string} worktreePath
 * @property {string} previewUrl
 * @property {string | null | undefined} [expectedLanguage]
 * @property {string | null | undefined} [client]
 */

/**
 * @typedef {Object} MTPreviewVerifyCopyInput
 * @property {string} msmRepoRoot
 * @property {string} worktreePath
 * @property {string} previewUrl
 * @property {string | null | undefined} [expectedLanguage]
 * @property {string[]} candidates
 */

/**
 * @typedef {Object} MTPreviewVerificationResult
 * @property {boolean} ok
 * @property {string} message
 * @property {string | null | undefined} [profileId]
 * @property {string | null | undefined} [currentPath]
 */

/**
 * @typedef {Object} MTProductPreviewAdapter
 * @property {string} id
 * @property {string} previewBootstrapPath
 * @property {(route: string) => string | null} extractWorkplaceIdFromRoute
 * @property {(payload: unknown) => string} getPreviewRouteFromPayload
 * @property {(payload: unknown) => string | null} getPreviewLanguageFromPayload
 * @property {(input: MTPreviewBootstrapInput) => MTPreviewContext} buildPreviewContext
 * @property {(input: MTPreviewBootstrapInput) => string} buildPreviewBootstrapRoute
 */

export {};
