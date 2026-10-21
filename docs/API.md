# Tuesday API

All endpoints live under `/api`. Authentication is either the session cookie set by `POST /api/auth/login` or an API token in `Authorization: Bearer tue_…`. Mutating cookie-authenticated requests must send `X-Requested-With: tuesday` and `Content-Type: application/json` (file uploads use multipart and still need the header).

Error shape: `{ "error": { "code": "validation_error", "message": "…", "details": … } }`.
Board events are streamed at `GET /api/stream` as SSE.

## Tokens

```bash
curl -X POST http://localhost:3000/api/me/tokens \
  -H 'Content-Type: application/json' -H 'X-Requested-With: tuesday' \
  -b cookies.txt -d '{"name":"CI","scope":"write"}'
# => { "token": { "id": 1, ... }, "secret": "tue_..." }
```

`GET /api/me/tokens` lists active tokens, `DELETE /api/me/tokens/:id` revokes one. Read tokens can only use `GET`/`HEAD`. Up to 600 requests per minute per token are allowed.

## Examples

```bash
# Current user
curl http://localhost:3000/api/auth/me -H "Authorization: Bearer $TUESDAY_TOKEN"

# Workspaces and boards
curl http://localhost:3000/api/workspaces -H "Authorization: Bearer $TUESDAY_TOKEN"
curl http://localhost:3000/api/boards/1 -H "Authorization: Bearer $TUESDAY_TOKEN"

# Create an item
curl -X POST http://localhost:3000/api/boards/1/items \
  -H "Authorization: Bearer $TUESDAY_TOKEN" -H 'Content-Type: application/json' \
  -d '{"groupId":1,"name":"Deploy v2"}'

# Set a text value (or /values/:id for typed CellValue objects)
curl -X PUT http://localhost:3000/api/items/1/values/3/text \
  -H "Authorization: Bearer $TUESDAY_TOKEN" -H 'Content-Type: application/json' \
  -d '{"text":"Done"}'

# Export / import CSV
curl http://localhost:3000/api/boards/1/export.csv -H "Authorization: Bearer $TUESDAY_TOKEN" -o board.csv
```

Webhooks use the admin `webhooks` endpoints and sign each body with
`X-Tuesday-Signature: sha256=<HMAC-SHA256(body, secret)>`. Test with `POST /api/webhooks/:id/test`.

AI routes are under `/api/ai/*` and stream NDJSON (`{"type":"text","delta":…}`, `{"type":"done"}`) for chat, summaries, generation, column runs, automations and insight widgets.

API tokens and webhooks are managed from Profile → API tokens and Admin → Integrations.

## Inbound board webhook

Create the URL in the board menu under **Inbound webhook…**. The token is the secret; rotate it to invalidate the old URL. The endpoint is public and rate limited to 60 requests per minute.

```bash
curl -X POST "https://your-domain.example/api/hooks/board/<token>" \
  -H "content-type: application/json" \
  -d '{
    "name": "Client request",
    "group": "To do",
    "status": "In progress",
    "dueDate": "2026-10-20",
    "assignee": "person@example.com",
    "description": "Created from the intake form.",
    "values": {
      "Notes": "Website refresh",
      "Budget": 1200,
      "Brief": "https://example.com/brief",
      "Approved": true,
      "Priority": "High"
    }
  }'
```

Fields:

- `name`, `title` or `subject` — item name; defaults to `Webhook item`.
- `group` (name, case-insensitive) or `groupId` — defaults to the first group.
- `status` — status label name, case-insensitive.
- `dueDate` — `YYYY-MM-DD` or an ISO timestamp; ISO values are converted to the organisation timezone.
- `assignee` — email of a user who can see the board.
- `description` — posted as the first update.
- `values` — `{column title: value}` for text, number, link, email, phone, dropdown (option name), checkbox and people (email) columns. Link values accept a URL string or `{url,label}`.
- `values` is best-effort: invalid values are reported under `errors`, and the item is still created when the name and group are valid.
- Unknown top-level fields are ignored and returned under `ignored`.

Response:

```json
{
  "item": { "id": 42, "name": "Client request" },
  "boardId": 3,
  "ignored": ["unknown_field"],
  "errors": [{ "field": "values.Budget", "message": "Expected a number" }]
}
```

Delivery log: `GET /api/boards/:id/inbound-webhook/deliveries` (board manage access) returns the newest 100 requests with `createdAt`, `statusCode`, `itemId`, `ignored`, `errors`, the request body truncated to 2 KB, and the client IP. The board webhook settings show the same rows with a detail drawer.

### Optional signing

Board managers can set a signing secret from the webhook settings or with `PATCH /api/boards/:id/inbound-webhook` `{"secret":"..."}` (minimum 16 characters). The secret is never returned; the API only reports `secretSet: true`. Remove it with `{"secret":null}`.

When a secret is set, every POST must include an HMAC of the exact raw body:

```bash
BODY='{"name":"Signed item"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')
curl -X POST "https://your-domain.example/api/hooks/board/<token>" \
  -H "content-type: application/json" \
  -H "X-Tuesday-Signature: sha256=$SIG" \
  -d "$BODY"
```

Missing or invalid signatures return 401 and are recorded in the delivery log. The HTTPS settings panel can send a sample item with `POST /api/boards/:id/inbound-webhook/test` (board manage access); it goes through the same item-creation path and records a delivery.
