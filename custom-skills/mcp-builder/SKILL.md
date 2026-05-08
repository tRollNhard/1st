---
name: mcp-builder
version: 1.0
license: MIT
description: >
  Guide for creating high-quality MCP (Model Context Protocol) servers that enable
  LLMs to interact with external services through well-designed tools. Use when
  building MCP servers to integrate external APIs or services, whether in Python
  (FastMCP) or Node/TypeScript (MCP SDK). Triggered by build an MCP server, create
  MCP tools, integrate API via MCP, write MCP server, or MCP for a specific service.
---

# MCP Server Development Guide

## Overview

Create MCP (Model Context Protocol) servers that enable LLMs to interact with external services through well-designed tools. The quality of an MCP server is measured by how well it enables LLMs to accomplish real-world tasks.

---

# Process

## High-Level Workflow

Creating a high-quality MCP server involves four phases:

---

### Phase 1: Deep Research and Planning

#### 1.1 Understand Modern MCP Design

**API Coverage vs. Workflow Tools:**
Balance comprehensive API endpoint coverage with specialized workflow tools. Workflow tools are more convenient for specific tasks; comprehensive coverage gives agents flexibility to compose operations. When uncertain, prioritize comprehensive API coverage.

**Tool Naming and Discoverability:**
Clear, descriptive tool names help agents find the right tools quickly. Use consistent prefixes (e.g., `github_create_issue`, `github_list_repos`) and action-oriented naming.

**Context Management:**
Agents benefit from concise tool descriptions and the ability to filter/paginate results. Design tools that return focused, relevant data.

**Actionable Error Messages:**
Error messages should guide agents toward solutions with specific suggestions and next steps.

#### 1.2 Study the MCP Specification

Fetch the spec: `https://modelcontextprotocol.io/specification/draft.md`

Key areas:
- Transport mechanisms (streamable HTTP, stdio)
- Tool, resource, and prompt definitions
- Tool annotations

#### 1.3 Recommended Stack

- **Language**: TypeScript (recommended — high-quality SDK, static typing, AI models generate it well)
- **Transport**: Streamable HTTP for remote servers (stateless JSON). stdio for local servers.
- **Validation**: Zod for TypeScript, Pydantic for Python

Fetch SDK docs as needed:
- TypeScript SDK: `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md`
- Python SDK: `https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/main/README.md`

Load the reference files below during this phase.

#### 1.4 Plan Your Implementation

Review the service's API documentation. Identify key endpoints, authentication requirements, and data models. List tools to implement — start with the most common operations.

---

### Phase 2: Implementation

#### 2.1 Project Structure (TypeScript)

```
{service}-mcp-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # McpServer init + transport
│   ├── types.ts          # TypeScript interfaces
│   ├── tools/            # Tool implementations (one file per domain)
│   ├── services/         # API clients and shared utilities
│   ├── schemas/          # Zod validation schemas
│   └── constants.ts      # API_URL, CHARACTER_LIMIT, etc.
└── dist/                 # Built output (entry: dist/index.js)
```

#### 2.2 Core Infrastructure

Create shared utilities:
- API client with authentication
- `handleApiError()` with actionable messages
- Response formatting (JSON + Markdown)
- Pagination helpers

#### 2.3 Implement Each Tool

**Input Schema (Zod):**
```typescript
const SearchSchema = z.object({
  query: z.string().min(2).max(200).describe("Search string"),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();
```

**Tool Registration:**
```typescript
server.registerTool(
  "service_action_resource",
  {
    title: "Human-readable title",
    description: "Concise description with args, returns, and examples",
    inputSchema: SearchSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params) => {
    try {
      const output = await makeApiRequest(...);
      return {
        content: [{ type: "text", text: formatOutput(output, params.response_format) }],
        structuredContent: output
      };
    } catch (error) {
      return { content: [{ type: "text", text: handleApiError(error) }] };
    }
  }
);
```

**Always use** `server.registerTool()` — never deprecated `server.tool()` or manual `setRequestHandler`.

**Tool Annotations:**

| Annotation | Type | Description |
|---|---|---|
| `readOnlyHint` | boolean | Does not modify environment |
| `destructiveHint` | boolean | May delete or overwrite |
| `idempotentHint` | boolean | Repeated calls have no extra effect |
| `openWorldHint` | boolean | Interacts with external entities |

---

### Phase 3: Review and Test

#### 3.1 Code Quality Checklist

- No duplicated code — shared helpers for pagination, formatting, auth
- Consistent error handling throughout
- Full TypeScript type coverage, `strict: true`, no `any`
- Clear tool descriptions with explicit args + return schemas
- CHARACTER_LIMIT constant (25000) with truncation + message
- `npm run build` passes cleanly

#### 3.2 Test With MCP Inspector

```bash
npm run build
npx @modelcontextprotocol/inspector node dist/index.js
```

For Python:
```bash
python -m py_compile server.py
npx @modelcontextprotocol/inspector python server.py
```

---

### Phase 4: Evaluations

Create 10 evaluation Q&A pairs that test real LLM use of your server.

Each question must be:
- **Independent** — not dependent on other questions
- **Read-only** — only non-destructive tool calls
- **Complex** — requires 2+ tool calls
- **Verifiable** — single clear answer

Output format:
```xml
<evaluation>
  <qa_pair>
    <question>Specific, complex question requiring multiple tool calls</question>
    <answer>Single verifiable answer</answer>
  </qa_pair>
</evaluation>
```

---

# Reference Files

Load during development:

- [MCP Best Practices](./references/mcp_best_practices.md) — naming, pagination, transport, security
- [TypeScript Implementation Guide](./references/node_mcp_server.md) — full TS patterns with complete example

Fetch from web when needed:
- TypeScript SDK README: `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md`
- Python SDK README: `https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/main/README.md`
- MCP Spec: `https://modelcontextprotocol.io/specification/draft.md`
