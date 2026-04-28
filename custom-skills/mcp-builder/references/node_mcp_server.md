# TypeScript MCP Server Implementation Guide

## Quick Reference

### Key Imports
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import { z } from "zod";
```

### Server Init
```typescript
const server = new McpServer({
  name: "service-mcp-server",
  version: "1.0.0"
});
```

### Tool Registration Pattern
```typescript
server.registerTool(
  "service_action_resource",
  {
    title: "Display Name",
    description: "What it does, args, returns, examples, errors",
    inputSchema: MyZodSchema,
    outputSchema: { result: z.string() },  // optional
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params) => {
    const output = { result: `Processed: ${params.query}` };
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output
    };
  }
);
```

**IMPORTANT**: Always use `server.registerTool()`. Never use deprecated `server.tool()` or manual `setRequestHandler`.

---

## package.json

```json
{
  "name": "{service}-mcp-server",
  "version": "1.0.0",
  "description": "MCP server for {Service} API",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "clean": "rm -rf dist"
  },
  "engines": { "node": ">=18" },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.6.1",
    "axios": "^1.7.9",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Zod Schemas

```typescript
enum ResponseFormat { MARKDOWN = "markdown", JSON = "json" }

const SearchSchema = z.object({
  query: z.string()
    .min(2, "Query must be at least 2 characters")
    .max(200, "Query must not exceed 200 characters")
    .describe("Search string"),
  limit: z.number().int().min(1).max(100).default(20).describe("Max results"),
  offset: z.number().int().min(0).default(0).describe("Pagination offset"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("'markdown' or 'json'")
}).strict();

type SearchInput = z.infer<typeof SearchSchema>;
```

Use `.strict()` to reject unknown fields. Always add `.describe()` to every field.

---

## Shared Utilities

### API Client
```typescript
const API_BASE_URL = "https://api.example.com/v1";
const CHARACTER_LIMIT = 25000;

async function makeApiRequest<T>(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  data?: unknown,
  params?: Record<string, unknown>
): Promise<T> {
  const response = await axios({
    method, url: `${API_BASE_URL}/${endpoint}`, data, params,
    timeout: 30000,
    headers: { "Content-Type": "application/json", "Accept": "application/json" }
  });
  return response.data;
}
```

### Error Handler
```typescript
import { AxiosError } from "axios";

function handleApiError(error: unknown): string {
  if (error instanceof AxiosError && error.response) {
    switch (error.response.status) {
      case 404: return "Error: Resource not found. Check the ID.";
      case 403: return "Error: Permission denied.";
      case 429: return "Error: Rate limit exceeded. Wait before retrying.";
      default:  return `Error: API returned ${error.response.status}.`;
    }
  }
  if (error instanceof AxiosError && error.code === "ECONNABORTED")
    return "Error: Request timed out. Try again.";
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}
```

---

## Pagination

```typescript
function buildPaginatedResponse<T>(
  items: T[],
  total: number,
  offset: number
) {
  return {
    total,
    count: items.length,
    offset,
    items,
    has_more: total > offset + items.length,
    next_offset: total > offset + items.length ? offset + items.length : undefined
  };
}
```

---

## Response Formatting

```typescript
function formatItems(
  items: Item[],
  format: ResponseFormat,
  title: string
): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify(items, null, 2);
  }
  const lines = [`# ${title}`, ""];
  for (const item of items) {
    lines.push(`## ${item.name} (${item.id})`);
    lines.push(`- **Status**: ${item.status}`);
    lines.push("");
  }
  return lines.join("\n");
}
```

---

## Transports

### stdio (local)
```typescript
async function runStdio() {
  if (!process.env.SERVICE_API_KEY) {
    console.error("ERROR: SERVICE_API_KEY required");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP server running via stdio");  // stderr only
}
```

### Streamable HTTP (remote)
```typescript
async function runHTTP() {
  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,  // stateless
      enableJsonResponse: true
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const port = parseInt(process.env.PORT || "3000");
  app.listen(port, () => console.error(`MCP server on http://localhost:${port}/mcp`));
}
```

### Auto-select by env
```typescript
const transport = process.env.TRANSPORT || "stdio";
if (transport === "http") runHTTP().catch(err => { console.error(err); process.exit(1); });
else runStdio().catch(err => { console.error(err); process.exit(1); });
```

---

## Resources (optional)

```typescript
server.registerResource(
  {
    uri: "data://records/{id}",
    name: "Record",
    description: "Fetch a record by ID",
    mimeType: "application/json"
  },
  async (uri: string) => {
    const match = uri.match(/^data:\/\/records\/(.+)$/);
    if (!match) throw new Error("Invalid URI");
    const record = await fetchRecord(match[1]);
    return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(record) }] };
  }
);
```

Use resources for simple URI-keyed data reads; use tools for operations with side effects or complex logic.

---

## Complete Minimal Example

```typescript
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios, { AxiosError } from "axios";

const CHARACTER_LIMIT = 25000;
enum ResponseFormat { MARKDOWN = "markdown", JSON = "json" }

const server = new McpServer({ name: "example-mcp-server", version: "1.0.0" });

const ListSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

server.registerTool(
  "example_list_items",
  {
    title: "List Example Items",
    description: `List all items from the Example API.

Args:
  - limit (number): Max items to return, 1–100 (default: 20)
  - offset (number): Pagination offset (default: 0)
  - response_format ('markdown'|'json'): Output format (default: 'markdown')

Returns: Paginated list of items with id, name, status fields.`,
    inputSchema: ListSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  async (params) => {
    try {
      const data = await axios.get(`https://api.example.com/items`, {
        params: { limit: params.limit, offset: params.offset },
        timeout: 30000
      });
      const items = data.data.items ?? [];
      const total = data.data.total ?? 0;
      const output = { total, count: items.length, offset: params.offset, items,
        has_more: total > params.offset + items.length };
      const text = params.response_format === ResponseFormat.JSON
        ? JSON.stringify(output, null, 2)
        : `# Items (${total} total)\n\n` + items.map((i: any) => `- **${i.name}** (${i.id})`).join("\n");
      return { content: [{ type: "text", text }], structuredContent: output };
    } catch (error) {
      const msg = error instanceof AxiosError && error.response
        ? `Error: API returned ${error.response.status}.`
        : `Error: ${error instanceof Error ? error.message : String(error)}`;
      return { content: [{ type: "text", text: msg }] };
    }
  }
);

const transport = new StdioServerTransport();
server.connect(transport).catch(err => { console.error(err); process.exit(1); });
```

---

## Quality Checklist

### Design
- [ ] Tools cover complete workflows, not just individual API endpoints
- [ ] Tool names follow `{service}_{action}_{resource}` in snake_case
- [ ] All annotations set correctly

### Implementation
- [ ] `server.registerTool()` used — no deprecated APIs
- [ ] Every tool has `title`, `description`, `inputSchema`, `annotations`
- [ ] All Zod schemas use `.strict()` and `.describe()` on every field
- [ ] `handleApiError()` shared — no inline try/catch duplication
- [ ] Pagination returns `has_more`, `next_offset`, `total`
- [ ] CHARACTER_LIMIT enforced with truncation message

### TypeScript
- [ ] `strict: true` in tsconfig — no `any`
- [ ] All async functions have explicit `Promise<T>` return types
- [ ] Zod inferred types used (`z.infer<typeof Schema>`)

### Build
- [ ] `npm run build` succeeds
- [ ] `node dist/index.js` starts without error
- [ ] MCP Inspector test passes
