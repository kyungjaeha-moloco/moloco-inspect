/**
 * @typedef {Object} MTProductRuntimeConfig
 * @property {string} productId
 * @property {string} productFilePrefix
 * @property {string} productSourcePrefix
 * @property {string} appRelativePath
 * @property {string} sourceAppRoot
 * @property {string} worktreeAppRoot
 * @property {string} sourceNodeModulesPath
 * @property {string} worktreeNodeModulesPath
 * @property {string} viteConfigPath
 * @property {string} tsconfigPath
 * @property {{ screenshot: string, previewText: string, previewRoute: string }} e2eScripts
 * @property {{ app: string, src: string, e2e: string }} sourceRoots
 */

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
 * @property {MTProductRuntimeConfig} runtimeConfig
 * @property {string} previewUrl
 * @property {string} screenshotPath
 * @property {string | null | undefined} [expectedLanguage]
 * @property {string | null | undefined} [client]
 */

/**
 * @typedef {Object} MTPreviewVerifyRouteInput
 * @property {MTProductRuntimeConfig} runtimeConfig
 * @property {string} previewUrl
 * @property {string | null | undefined} [expectedLanguage]
 * @property {string | null | undefined} [client]
 */

/**
 * @typedef {Object} MTPreviewVerifyCopyInput
 * @property {MTProductRuntimeConfig} runtimeConfig
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
 * @property {(args: { repoRoot: string, worktreePath: string }) => MTProductRuntimeConfig} createRuntimeConfig
 * @property {(route: string) => string | null} extractWorkplaceIdFromRoute
 * @property {(payload: unknown) => string} getPreviewRouteFromPayload
 * @property {(payload: unknown) => string | null} getPreviewLanguageFromPayload
 * @property {(relativePath: string) => boolean} isProductFile
 * @property {(relativePath: string) => boolean} isProductSourceFile
 * @property {(input: MTPreviewBootstrapInput) => MTPreviewContext} buildPreviewContext
 * @property {(input: MTPreviewBootstrapInput) => string} buildPreviewBootstrapRoute
 * @property {(input: MTPreviewCaptureInput) => Promise<{ stdout: string }>} captureScreenshot
 * @property {(input: MTPreviewVerifyRouteInput) => Promise<MTPreviewVerificationResult>} verifyRoute
 * @property {(input: MTPreviewVerifyCopyInput) => Promise<MTPreviewVerificationResult>} verifyCopyVisible
 */

export {};
