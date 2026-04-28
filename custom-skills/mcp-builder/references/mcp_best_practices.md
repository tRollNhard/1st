# MCP Best Practices

## Quick Reference

### Server Naming
- **Python**: `{service}_mcp` (e.g., `slack_mcp`)
- **TypeScript**: `{service}-mcp-server` (e.g., `slack-mcp-server`)

### Tool Naming
- snake_case with service prefix
- Format: `{service}_{action}_{resource}`
- Examples: `slack_send_message`, `github_create_issue`

### Response Formats
- Support `json` (programmatic) and `markdown` (human-readable)
- Default to markdown

### Pagination
- Respect `limit` param; return `has_more`, `next_offset`, `total_count`
- Default 20–50 items per page

### Transport
- **Streamable HTTP**: remote, multi-client
- **stdio**: local, single-user
- Avoid deprecated SSE

---

## Tool Design

### Naming Rules
1. snake_case: `search_users`, `create_project`
2. Service prefix to avoid collisions across MCP servers
3. Action-oriented verbs: get, list, search, create, update, delete
4. Atomic and focused — one operation per tool

### Descriptions
Must narrowly and unambiguously describe functionality. Include:
- What the tool does
- Args with types and constraints
- Return value schema
- Examples: "Use when: X" and "Don't use when: Y"
- Error cases

### Annotations

| Annotation | Default | Meaning |
|---|---|---|
| `readOnlyHint` | false | Tool does not modify state |
| `destructiveHint` | true | May delete/overwrite |
| `idempotentHint` | false | Same args = same result, no side effects |
| `openWorldHint` | true | Talks to external systems |

Annotations are hints, not security guarantees.

---

## Response Formats

### JSON (`response_format="json"`)
```json
{
  "total": 150,
  "count": 20,
  "offset": 0,
  "items": [...],
  "has_more": true,
  "next_offset": 20
}
```

### Markdown (`response_format="markdown"`, default)
- Headers for grouping
- Human-readable timestamps
- Display names with IDs in parentheses
- Omit noisy metadata

---

## Pagination

Always implement for list endpoints:

```typescript
const response = {
  total: data.total,
  count: items.length,
  offset: params.offset,
  items,
  has_more: data.total > params.offset + items.length,
  next_offset: data.total > params.offset + items.length
    ? params.offset + items.length
    : undefined
};
```

---

## Transport Selection

| Criterion | stdio | Streamable HTTP |
|---|---|---|
| Deployment | Local | Remote / cloud |
| Clients | Single | Multiple |
| Complexity | Low | Medium |
| Real-time push | No | Yes |

**stdio**: Do NOT log to stdout — use stderr only.

**Streamable HTTP**: Create a new transport per request (stateless):
```typescript
app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
  res.on('close', () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
```

---

## Security

### Authentication
- OAuth 2.1 or API keys via environment variables — never hardcoded
- Validate tokens/keys on startup
- Clear error messages on auth failure

### Input Validation
- Zod (TS) or Pydantic (Python) for all inputs
- Sanitize file paths (prevent directory traversal)
- Check parameter sizes and ranges
- Prevent command injection

### Local HTTP Servers
- Bind to `127.0.0.1`, not `0.0.0.0`
- Validate `Origin` header (DNS rebinding protection)

---

## Error Handling

Report errors inside the result object, not as protocol errors:

```typescript
return {
  isError: true,
  content: [{
    type: "text",
    text: "Error: Rate limit exceeded. Wait 60s before retrying."
  }]
};
```

Common status mappings:
- 404 → "Resource not found. Check the ID."
- 403 → "Permission denied."
- 429 → "Rate limit exceeded. Wait before retrying."
- timeout → "Request timed out. Try again."

---

## Character Limits

Prevent overwhelming context windows:

```typescript
const CHARACTER_LIMIT = 25000;

if (result.length > CHARACTER_LIMIT) {
  // Halve the data and flag truncation
  response.truncated = true;
  response.truncation_message =
    `Truncated from ${data.length} to ${truncated.length} items. ` +
    `Use 'offset' or add filters to see more.`;
}
```
