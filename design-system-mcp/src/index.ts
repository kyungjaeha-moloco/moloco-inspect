import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Resolve data directory
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../design-system/src");

// ---------------------------------------------------------------------------
// Load all JSON data at startup
// ---------------------------------------------------------------------------
function loadJson<T>(filename: string): T {
  const fullPath = join(DATA_DIR, filename);
  const raw = readFileSync(fullPath, "utf-8");
  return JSON.parse(raw) as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

const componentsData: AnyRecord = loadJson("components.json");
const dependenciesData: AnyRecord = loadJson("component-dependencies.json");
const tokensData: AnyRecord = loadJson("tokens.json");
const patternsData: AnyRecord = loadJson("patterns.json");
const stateMachinesData: AnyRecord = loadJson("state-machines.json");
const behaviorsData: AnyRecord = loadJson("component-behaviors.json");
const goldenStatesData: AnyRecord = loadJson("golden-example-states.json");
const uxWritingData: AnyRecord = loadJson("ux-writing.json");

// ---------------------------------------------------------------------------
// Helper: flatten all components from categories array into a lookup map
// ---------------------------------------------------------------------------
interface ComponentEntry {
  name: string;
  category: string;
  shortDescription?: string;
  description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

function buildComponentIndex(): Map<string, ComponentEntry> {
  const index = new Map<string, ComponentEntry>();
  const categories: AnyRecord[] = componentsData.categories ?? [];
  for (const cat of categories) {
    const catName: string = cat.name ?? "Uncategorized";
    const components: AnyRecord[] = cat.components ?? [];
    for (const comp of components) {
      index.set((comp.name as string).toLowerCase(), {
        ...comp,
        category: catName,
      });
    }
  }
  return index;
}

const componentIndex = buildComponentIndex();

function findComponent(name: string): ComponentEntry | undefined {
  return componentIndex.get(name.toLowerCase());
}

// ---------------------------------------------------------------------------
// Helper: build a flat dependency lookup from the dependencies file
// ---------------------------------------------------------------------------
function buildDependencyIndex(): Map<string, AnyRecord> {
  const index = new Map<string, AnyRecord>();
  const components: AnyRecord = dependenciesData.components ?? {};
  for (const [name, data] of Object.entries(components)) {
    index.set(name.toLowerCase(), data as AnyRecord);
  }
  return index;
}

const dependencyIndex = buildDependencyIndex();

// ---------------------------------------------------------------------------
// Helper: fuzzy score — simple character-overlap scoring
// ---------------------------------------------------------------------------
function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t === q) return 100;
  if (t.includes(q)) return 80;
  if (q.includes(t)) return 60;
  // count common chars
  let common = 0;
  for (const ch of q) {
    if (t.includes(ch)) common++;
  }
  return Math.round((common / Math.max(q.length, t.length)) * 40);
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------
const server = new Server(
  { name: "moloco-design-system", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ---------------------------------------------------------------------------
// List tools
// ---------------------------------------------------------------------------
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_components",
        description:
          "Returns all component names with short description and category. Optionally filter by category name (partial match).",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description:
                "Optional partial category name to filter by, e.g. 'Form', 'Table', 'Layout'.",
            },
          },
          required: [],
        },
      },
      {
        name: "get_component",
        description:
          "Returns full detail for a component: description, props, import path, when to use, do/don't, dependencies, recipe code, golden states, accessibility, structure, and style specs.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Exact component name, e.g. MCFormTextInput",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "get_component_example",
        description:
          "Returns import statement, example code snippet, and recipe code (if available) for a component.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Exact component name, e.g. MCButton2",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "get_component_dependencies",
        description:
          "Returns provider/context requirements for a component: requires, optional, must_be_inside, and rendering recipe.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Exact component name, e.g. MCFormTextInput",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "get_token",
        description:
          "Returns design tokens for a given category (color, spacing, typography, borderRadius) and optional role filter.",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: ["color", "spacing", "typography", "borderRadius"],
              description: "Token category to retrieve.",
            },
            role: {
              type: "string",
              description:
                "Optional role filter, e.g. 'neutral', 'brand', 'danger', 'text', 'background'.",
            },
          },
          required: ["category"],
        },
      },
      {
        name: "get_pattern",
        description:
          "Returns a UI pattern definition including layer structure, file checklist, validation checklist, and code example.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description:
                "Pattern id or partial name, e.g. 'form-basic', 'table', 'full-page'.",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "search_components",
        description:
          "Fuzzy search across component names and descriptions. Returns top 10 matches.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query string.",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_component_states",
        description:
          "Returns state machine data for a component: all states, transitions, and Formik integration notes.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Component name, e.g. MCFormTextInput, MCButton2",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "get_ux_writing_rules",
        description:
          "Returns UX writing principles and surface-specific rules (buttons, errors, empty states, tooltips, etc.).",
        inputSchema: {
          type: "object",
          properties: {
            surface: {
              type: "string",
              description:
                "Optional surface filter, e.g. 'button', 'error', 'empty_state', 'tooltip', 'placeholder'.",
            },
          },
          required: [],
        },
      },
    ],
  };
});

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

// Zod schemas for input validation
const ListComponentsInput = z.object({ category: z.string().optional() });
const GetComponentInput = z.object({ name: z.string() });
const GetTokenInput = z.object({
  category: z.enum(["color", "spacing", "typography", "borderRadius"]),
  role: z.string().optional(),
});
const GetPatternInput = z.object({ id: z.string() });
const SearchComponentsInput = z.object({ query: z.string() });
const GetComponentStatesInput = z.object({ name: z.string() });
const GetUxWritingInput = z.object({ surface: z.string().optional() });

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // -----------------------------------------------------------------------
      // list_components
      // -----------------------------------------------------------------------
      case "list_components": {
        const { category } = ListComponentsInput.parse(args ?? {});
        const results: AnyRecord[] = [];

        for (const cat of componentsData.categories ?? []) {
          const catName: string = cat.name ?? "";
          if (category && !catName.toLowerCase().includes(category.toLowerCase())) {
            continue;
          }
          for (const comp of cat.components ?? []) {
            results.push({
              name: comp.name,
              category: catName,
              shortDescription: comp.shortDescription ?? comp.description ?? "",
              status: comp.status ?? "unknown",
              importPath: comp.importPath ?? null,
            });
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  total: results.length,
                  filter: category ?? null,
                  components: results,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // -----------------------------------------------------------------------
      // get_component
      // -----------------------------------------------------------------------
      case "get_component": {
        const { name: compName } = GetComponentInput.parse(args);
        const comp = findComponent(compName);
        if (!comp) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    error: `Component "${compName}" not found. Use search_components or list_components to browse available components.`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // Attach golden states if present
        const golden =
          goldenStatesData.components?.[comp.name] ?? null;

        // Attach behaviors if present
        let behaviors: AnyRecord | null = null;
        for (const groupKey of Object.keys(behaviorsData)) {
          if (groupKey === "meta" || groupKey === "version" || groupKey === "description" || groupKey === "lastUpdated") continue;
          const group = behaviorsData[groupKey] as AnyRecord;
          if (group[comp.name]) {
            behaviors = group[comp.name] as AnyRecord;
            break;
          }
          if (group["_shared"] && comp.name.startsWith("MCForm")) {
            behaviors = group["_shared"] as AnyRecord;
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  name: comp.name,
                  category: comp.category,
                  status: comp.status,
                  description: comp.description ?? comp.shortDescription,
                  shortDescription: comp.shortDescription,
                  importPath: comp.importPath,
                  importStatement: comp.importStatement,
                  when_to_use: comp.when_to_use ?? [],
                  do_not_use: comp.do_not_use ?? [],
                  antiPatterns: comp.antiPatterns ?? [],
                  compositions: comp.compositions ?? {},
                  props: comp.props ?? [],
                  recipes: comp.recipes ?? [],
                  accessibility: comp.accessibility ?? null,
                  structure: comp.structure ?? null,
                  style: comp.style ?? null,
                  anatomy: comp.anatomy ?? null,
                  golden_states: golden,
                  behaviors,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // -----------------------------------------------------------------------
      // get_component_example
      // -----------------------------------------------------------------------
      case "get_component_example": {
        const { name: compName } = GetComponentInput.parse(args);
        const comp = findComponent(compName);
        if (!comp) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  { error: `Component "${compName}" not found.` },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const recipes = comp.recipes ?? [];
        const firstRecipe = recipes[0] ?? null;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  name: comp.name,
                  importStatement: comp.importStatement ?? null,
                  importPath: comp.importPath ?? null,
                  example_code: firstRecipe?.code ?? null,
                  recipe_name: firstRecipe?.name ?? null,
                  recipe_description: firstRecipe?.description ?? null,
                  all_recipes: recipes.map((r: AnyRecord) => ({
                    name: r.name,
                    description: r.description,
                    code: r.code,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // -----------------------------------------------------------------------
      // get_component_dependencies
      // -----------------------------------------------------------------------
      case "get_component_dependencies": {
        const { name: compName } = GetComponentInput.parse(args);

        // Check components.json compositions first
        const comp = findComponent(compName);
        const compositions = comp?.compositions ?? {};

        // Check dedicated dependencies file
        const depEntry = dependencyIndex.get(compName.toLowerCase());

        // Also check providers section for relevant ones
        const providers = dependenciesData.providers ?? {};
        const providerStack = dependenciesData.provider_stack_order ?? {};

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  name: compName,
                  // from components.json
                  must_be_inside: compositions.must_be_inside ?? [],
                  requires: compositions.requires ?? [],
                  optional: compositions.optional ?? [],
                  // from component-dependencies.json
                  dependency_detail: depEntry ?? null,
                  // global providers for reference
                  available_providers: Object.fromEntries(
                    Object.entries(providers).map(([k, v]) => [
                      k,
                      {
                        import: (v as AnyRecord).import,
                        required_by: (v as AnyRecord).required_by,
                        notes: (v as AnyRecord).notes,
                      },
                    ])
                  ),
                  provider_stack_order: providerStack,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // -----------------------------------------------------------------------
      // get_token
      // -----------------------------------------------------------------------
      case "get_token": {
        const { category, role } = GetTokenInput.parse(args);
        const categoryData = tokensData[category];
        if (!categoryData) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    error: `Token category "${category}" not found. Valid categories: color, spacing, typography, borderRadius.`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // For color, it has sub-groups (text, background, border, icon)
        // For others it may be flatter
        let filteredData: AnyRecord = categoryData;

        if (category === "color" && role) {
          // role can be a property (text, background, border, icon) or a role (neutral, brand, etc.)
          const roleLower = role.toLowerCase();
          filteredData = {};

          // Try matching as property first
          const properties = ["text", "background", "border", "icon", "bg"];
          const matchedProp = properties.find((p) => roleLower.includes(p));
          if (matchedProp && categoryData[matchedProp]) {
            filteredData[matchedProp] = categoryData[matchedProp];
          } else {
            // Filter by role within each property group
            for (const prop of properties) {
              const group = categoryData[prop];
              if (!group?.tokens) continue;
              const filtered = (group.tokens as AnyRecord[]).filter(
                (t) =>
                  (t.role && t.role.toLowerCase().includes(roleLower)) ||
                  (t.name && t.name.toLowerCase().includes(roleLower))
              );
              if (filtered.length > 0) {
                filteredData[prop] = { ...group, tokens: filtered };
              }
            }
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  category,
                  role_filter: role ?? null,
                  meta: tokensData.meta ?? null,
                  data: filteredData,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // -----------------------------------------------------------------------
      // get_pattern
      // -----------------------------------------------------------------------
      case "get_pattern": {
        const { id } = GetPatternInput.parse(args);
        const patterns: AnyRecord[] = patternsData.patterns ?? [];
        const idLower = id.toLowerCase();

        const match = patterns.find(
          (p) =>
            p.id?.toLowerCase() === idLower ||
            p.id?.toLowerCase().includes(idLower) ||
            p.name?.toLowerCase().includes(idLower)
        );

        if (!match) {
          const available = patterns.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
          }));
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    error: `Pattern "${id}" not found.`,
                    available_patterns: available,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(match, null, 2),
            },
          ],
        };
      }

      // -----------------------------------------------------------------------
      // search_components
      // -----------------------------------------------------------------------
      case "search_components": {
        const { query } = SearchComponentsInput.parse(args);
        const scored: { score: number; comp: ComponentEntry }[] = [];

        for (const comp of componentIndex.values()) {
          const nameScore = fuzzyScore(query, comp.name ?? "");
          const descScore = fuzzyScore(query, comp.shortDescription ?? comp.description ?? "");
          const score = Math.max(nameScore, descScore * 0.7);
          if (score > 5) {
            scored.push({ score, comp });
          }
        }

        scored.sort((a, b) => b.score - a.score);
        const top10 = scored.slice(0, 10).map(({ score, comp }) => ({
          name: comp.name,
          category: comp.category,
          shortDescription: comp.shortDescription ?? comp.description ?? "",
          importPath: comp.importPath ?? null,
          status: comp.status ?? "unknown",
          relevance_score: score,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ query, results: top10 }, null, 2),
            },
          ],
        };
      }

      // -----------------------------------------------------------------------
      // get_component_states
      // -----------------------------------------------------------------------
      case "get_component_states": {
        const { name: compName } = GetComponentStatesInput.parse(args);

        // Search across all top-level groups in state-machines.json
        let found: AnyRecord | null = null;
        let groupName = "";

        for (const key of Object.keys(stateMachinesData)) {
          if (
            key === "$schema" ||
            key === "version" ||
            key === "lastUpdated" ||
            key === "description"
          )
            continue;
          const group = stateMachinesData[key] as AnyRecord;
          if (group[compName]) {
            found = group[compName] as AnyRecord;
            groupName = key;
            break;
          }
          // Check if it's a form input and _shared exists
          if (compName.startsWith("MCForm") && group["_shared"]) {
            found = group["_shared"] as AnyRecord;
            groupName = key;
          }
        }

        if (!found) {
          const available: string[] = [];
          for (const key of Object.keys(stateMachinesData)) {
            if (["$schema", "version", "lastUpdated", "description"].includes(key)) continue;
            const group = stateMachinesData[key] as AnyRecord;
            available.push(...Object.keys(group).filter((k) => k !== "_shared"));
          }
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    error: `No state machine found for "${compName}".`,
                    note: "MCForm* components share the formInputs._shared machine.",
                    components_with_state_machines: available,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  name: compName,
                  group: groupName,
                  state_machine: found,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // -----------------------------------------------------------------------
      // get_ux_writing_rules
      // -----------------------------------------------------------------------
      case "get_ux_writing_rules": {
        const { surface } = GetUxWritingInput.parse(args ?? {});

        if (!surface) {
          // Return full document
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(uxWritingData, null, 2),
              },
            ],
          };
        }

        // Filter to the matching surface
        const surfaceLower = surface.toLowerCase();
        const result: AnyRecord = {
          meta: uxWritingData.meta,
          service_voice: uxWritingData.service_voice ?? null,
          matched_surface: null,
        };

        // Look through surface_rules or similar top-level keys
        for (const key of Object.keys(uxWritingData)) {
          if (key === "meta" || key === "service_voice") continue;
          const section = uxWritingData[key] as AnyRecord;
          if (key.toLowerCase().includes(surfaceLower)) {
            result.matched_surface = { key, data: section };
            break;
          }
          // Check if it's an object with surface sub-keys
          if (typeof section === "object" && !Array.isArray(section)) {
            for (const subKey of Object.keys(section)) {
              if (subKey.toLowerCase().includes(surfaceLower)) {
                result.matched_surface = { key: `${key}.${subKey}`, data: section[subKey] };
                break;
              }
            }
          }
          if (result.matched_surface) break;
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: `Unknown tool: ${name}` }, null, 2),
            },
          ],
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: message }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr so it doesn't pollute the JSON-RPC stdout stream
  process.stderr.write("Moloco Design System MCP server running on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
