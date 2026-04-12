/**
 * @typedef {Object} SandboxConfig
 * @property {string} requestId
 * @property {string} [imageName]
 * @property {number} openCodePort
 * @property {number} vitePort
 * @property {string} apiKey - OpenAI or Anthropic API key
 * @property {string} [provider] - 'openai' or 'anthropic'
 * @property {string} [model] - e.g. 'gpt-4o' or 'claude-sonnet-4-20250514'
 * @property {string} [serverPassword]
 */

/**
 * @typedef {Object} SandboxInstance
 * @property {string} containerId
 * @property {string} containerName
 * @property {number} openCodePort
 * @property {number} vitePort
 */

/**
 * @typedef {Object} ExecResult
 * @property {string} stdout
 * @property {string} stderr
 * @property {number} exitCode
 */

/**
 * @typedef {Object} DiffResult
 * @property {string} diffText
 * @property {string[]} changedFiles
 * @property {string} diffStat
 */

/**
 * @typedef {Object} AgentResult
 * @property {string} sessionId
 * @property {Object} info
 * @property {Array} parts
 * @property {number} cost
 * @property {Object} tokens
 */

export {};
