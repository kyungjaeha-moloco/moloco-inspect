import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Path resolution — JSON files live at ../../src/ relative to this file
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, "../../src");

function readJson(filename: string): unknown {
  return JSON.parse(readFileSync(join(SRC_DIR, filename), "utf-8"));
}

// Lazy-load so the server starts fast and parse errors surface per-tool
let _tokens: ReturnType<typeof loadTokens> | null = null;
let _components: ReturnType<typeof loadComponents> | null = null;
let _patterns: ReturnType<typeof loadPatterns> | null = null;
let _conventions: ReturnType<typeof loadConventions> | null = null;

// ---------------------------------------------------------------------------
// Typed loaders
// ---------------------------------------------------------------------------
interface TokenEntry {
  name: string;
  token: string;
  hex?: string;
  usage: string;
  role?: string;
  state?: string;
}

interface TokenColorGroup {
  description: string;
  tokens: TokenEntry[];
}

interface SpacingToken {
  multiplier: number;
  value: string;
  usage: string;
}

interface TypographyToken {
  name: string;
  size: string;
  lineHeight: string;
  fontWeight: string | number;
  usage: string;
}

interface TokensFile {
  meta: Record<string, string>;
  color: {
    description: string;
    naming: string;
    properties: string[];
    roles: string[];
    text: TokenColorGroup;
    background: TokenColorGroup;
    border: TokenColorGroup;
    icon: TokenColorGroup;
  };
  spacing: {
    description: string;
    baseUnit: string;
    themeAccessPattern: string;
    tokens: SpacingToken[];
  };
  typography: {
    description: string;
    themeAccessPattern: string;
    tokens: TypographyToken[];
  };
  iconCatalog?: {
    description: string;
    source: string;
    categories: Array<{
      category: string;
      icons: string[];
    }>;
  };
}

interface ComponentProp {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: string;
}

interface ComponentState {
  name: string;
  description: string;
}

interface ComponentDefinition {
  name: string;
  path: string;
  description: string;
  formikRequired?: boolean;
  props?: ComponentProp[];
  states?: ComponentState[];
  dos?: string[];
  donts?: string[];
  example?: string;
  notes?: string[];
}

interface ComponentCategory {
  name: string;
  description: string;
  components: ComponentDefinition[];
}

interface ComponentsFile {
  meta: Record<string, string>;
  categories: ComponentCategory[];
}

interface Pattern {
  id: string;
  name: string;
  description: string;
  when?: string;
  rules?: string[];
  code?: string;
  order?: string[];
}

interface PatternsFile {
  meta: Record<string, string>;
  patterns: Pattern[];
}

interface ConventionsFile {
  meta: Record<string, string>;
  namingPrefixes: Array<{ prefix: string; type: string; description: string; examples: string[] }>;
  fileNaming: Array<{ pattern: string; useCase: string; examples: string[] }>;
  importAliases: Array<{ alias: string; resolves: string }>;
  importOrder: string[];
  styledComponentRules: string[];
  formComponentRules: string[];
  directoryStructure: Record<string, string>;
  architecture: {
    description: string;
    layers: Array<{ name: string; location: string; naming: string; responsibility: string }>;
  };
  containerNaming: { pattern: string; actions: string[]; examples: string[] };
  buildCommands: Record<string, string>;
  envVars: Record<string, string | string[]>;
  clients: string[];
}

function loadTokens(): TokensFile {
  if (!_tokens) _tokens = readJson("tokens.json") as TokensFile;
  return _tokens;
}

function loadComponents(): ComponentsFile {
  if (!_components) _components = readJson("components.json") as ComponentsFile;
  return _components;
}

function loadPatterns(): PatternsFile {
  if (!_patterns) _patterns = readJson("patterns.json") as PatternsFile;
  return _patterns;
}

function loadConventions(): ConventionsFile {
  if (!_conventions) _conventions = readJson("conventions.json") as ConventionsFile;
  return _conventions;
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------
const server = new McpServer({
  name: "msm-design-system",
  version: "1.0.0",
});

// ── list_components ──────────────────────────────────────────────────────────
server.tool(
  "list_components",
  "Returns all component names grouped by category with descriptions. Use this first to discover what components exist before calling get_component.",
  {},
  async () => {
    const data = loadComponents();
    const result = data.categories.map((cat) => ({
      category: cat.name,
      description: cat.description,
      components: cat.components.map((c) => ({
        name: c.name,
        description: c.description,
        formikRequired: c.formikRequired ?? false,
        path: c.path,
      })),
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

// ── get_component ────────────────────────────────────────────────────────────
server.tool(
  "get_component",
  "Returns the full definition of a single component: props, states, dos/donts, and a code example. Pass the exact component name (e.g. 'MCFormTextInput').",
  { name: z.string().describe("Exact component name, e.g. 'MCFormTextInput'") },
  async ({ name }) => {
    const data = loadComponents();
    let found: ComponentDefinition | undefined;
    let foundCategory = "";

    for (const cat of data.categories) {
      const match = cat.components.find(
        (c) => c.name.toLowerCase() === name.toLowerCase(),
      );
      if (match) {
        found = match;
        foundCategory = cat.name;
        break;
      }
    }

    if (!found) {
      const allNames = data.categories.flatMap((c) =>
        c.components.map((comp) => comp.name),
      );
      return {
        content: [
          {
            type: "text",
            text: `Component '${name}' not found. Available components:\n${allNames.join("\n")}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ category: foundCategory, ...found }, null, 2),
        },
      ],
    };
  },
);

// ── list_tokens ──────────────────────────────────────────────────────────────
server.tool(
  "list_tokens",
  "Returns all token categories with descriptions. Use this to discover available token categories before calling get_tokens.",
  {},
  async () => {
    const data = loadTokens();
    const categories = [
      {
        category: "color.text",
        description: data.color.text.description,
        count: data.color.text.tokens.length,
      },
      {
        category: "color.background",
        description: data.color.background.description,
        count: data.color.background.tokens.length,
      },
      {
        category: "color.border",
        description: data.color.border.description,
        count: data.color.border.tokens.length,
      },
      {
        category: "color.icon",
        description: data.color.icon.description,
        count: data.color.icon.tokens.length,
      },
      {
        category: "spacing",
        description: data.spacing.description,
        baseUnit: data.spacing.baseUnit,
        themeAccessPattern: data.spacing.themeAccessPattern,
        count: data.spacing.tokens.length,
      },
      {
        category: "typography",
        description: data.typography.description,
        themeAccessPattern: data.typography.themeAccessPattern,
        count: data.typography.tokens.length,
      },
    ];

    if (data.iconCatalog) {
      categories.push({
        category: "icons",
        description: data.iconCatalog.description,
        count: data.iconCatalog.categories.reduce(
          (sum, c) => sum + c.icons.length,
          0,
        ),
      } as typeof categories[number]);
    }

    return {
      content: [{ type: "text", text: JSON.stringify(categories, null, 2) }],
    };
  },
);

// ── get_tokens ───────────────────────────────────────────────────────────────
server.tool(
  "get_tokens",
  "Returns all tokens for a given category. Valid categories: 'color.text', 'color.background', 'color.border', 'color.icon', 'spacing', 'typography'.",
  {
    category: z
      .enum([
        "color.text",
        "color.background",
        "color.border",
        "color.icon",
        "spacing",
        "typography",
      ])
      .describe("Token category to retrieve"),
  },
  async ({ category }) => {
    const data = loadTokens();

    let result: unknown;
    switch (category) {
      case "color.text":
        result = {
          category,
          description: data.color.text.description,
          themeAccessPattern: data.meta,
          tokens: data.color.text.tokens,
        };
        break;
      case "color.background":
        result = {
          category,
          description: data.color.background.description,
          tokens: data.color.background.tokens,
        };
        break;
      case "color.border":
        result = {
          category,
          description: data.color.border.description,
          tokens: data.color.border.tokens,
        };
        break;
      case "color.icon":
        result = {
          category,
          description: data.color.icon.description,
          tokens: data.color.icon.tokens,
        };
        break;
      case "spacing":
        result = {
          category,
          description: data.spacing.description,
          baseUnit: data.spacing.baseUnit,
          themeAccessPattern: data.spacing.themeAccessPattern,
          tokens: data.spacing.tokens,
        };
        break;
      case "typography":
        result = {
          category,
          description: data.typography.description,
          themeAccessPattern: data.typography.themeAccessPattern,
          tokens: data.typography.tokens,
        };
        break;
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

// ── list_patterns ────────────────────────────────────────────────────────────
server.tool(
  "list_patterns",
  "Returns all pattern IDs with names and descriptions. Use this to discover patterns before calling get_pattern.",
  {},
  async () => {
    const data = loadPatterns();
    const result = data.patterns.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      when: p.when,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

// ── get_pattern ──────────────────────────────────────────────────────────────
server.tool(
  "get_pattern",
  "Returns the full pattern definition including code example and rules. Pass the pattern ID (e.g. 'form-basic', 'list-page', 'create-page').",
  {
    id: z
      .string()
      .describe(
        "Pattern ID, e.g. 'form-basic', 'list-page', 'page-container-component'",
      ),
  },
  async ({ id }) => {
    const data = loadPatterns();
    const found = data.patterns.find(
      (p) => p.id.toLowerCase() === id.toLowerCase(),
    );

    if (!found) {
      const allIds = data.patterns.map((p) => p.id);
      return {
        content: [
          {
            type: "text",
            text: `Pattern '${id}' not found. Available pattern IDs:\n${allIds.join("\n")}`,
          },
        ],
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(found, null, 2) }],
    };
  },
);

// ── get_conventions ──────────────────────────────────────────────────────────
server.tool(
  "get_conventions",
  "Returns the full conventions document: naming prefixes (MC/MT/SC/ME/use), file naming, import aliases, import order, styled-component rules, form rules, directory structure, architecture layers, build commands, and client list.",
  {},
  async () => {
    const data = loadConventions();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  },
);

// ── get_icon_catalog ─────────────────────────────────────────────────────────
server.tool(
  "get_icon_catalog",
  "Returns the icon catalog with all available icon names grouped by category. Use this to find valid icon names for MCIcon and button leftIcon/rightIcon props.",
  {},
  async () => {
    const data = loadTokens();

    if (!data.iconCatalog) {
      return {
        content: [
          {
            type: "text",
            text: "Icon catalog not found in tokens.json. The iconCatalog section may not have been added yet.",
          },
        ],
      };
    }

    return {
      content: [
        { type: "text", text: JSON.stringify(data.iconCatalog, null, 2) },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Intentionally no console.log — stdio transport uses stdout for protocol
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
