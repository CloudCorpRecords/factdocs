# factdocs

How does the Ecuafact API actually work? factdocs is a local forwarding client for the hosted Ecuafact docsapi MCP service: it answers `tools/list` locally from the captured tool definitions and forwards every call to the service, returning the answers exactly as the service sends them back.

All six tools are read-only reads of the vendor's published API documentation. You can list the guides grouped by topic, read a guide (or just one of its sections), search the documentation, look up an error code from the API's catalogue, get a valid example JSON document for each e-invoice type, and consult the OpenAPI contract. The tools document the invoicing API but issue nothing and submit nothing: the example documents are examples, not filed documents. There is no write, signup, or send tool in this surface.

## The tools

- **`ejemplo_comprobante`** — A valid example JSON for issuing one type of comprobante (01 factura, 03 liquidacion de compra, 04 nota de credito, 05 nota de debito, 06 guia de remision, 07 retencion), with the link to its guide. `tipo` is required; it accepts the code or the name.
- **`explicar_error`** — Explains an error code from the API catalogue (three digits, e.g. 302 or 401): HTTP status, message, when it occurs, what to do and whether to retry. `codigo` is required; it is the `codigo` field of the error body, not the HTTP status.
- **`leer_guia`** — A guide in Markdown. With `seccion`, only the section whose title matches is returned; long guides (such as the SDK ones) are best read by section. `slug` is required; a guide URL is also accepted.
- **`buscar_documentacion`** — Searches the documentation and returns the relevant guides with a fragment and their URL; read a guide afterwards with `leer_guia`. `consulta` is required; `maximo` caps the results between 1 and 20 and defaults to 8.
- **`consultar_referencia`** — The API's OpenAPI contract. With no `ruta`, it lists the endpoints; with a `ruta` (and `metodo`), it returns the parameters, body, responses and schemas used. Both parameters are optional.
- **`listar_guias`** — The documentation guides grouped by topic, with slug, a short description and URL. No parameters.

## Install and run

As an MCP server via npm:

```bash
npx -y @reneturcios/factdocs mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "factdocs": {
      "command": "npx",
      "args": ["-y", "@reneturcios/factdocs", "mcp"]
    }
  }
}
```

As a container:

```bash
docker run -i ghcr.io/cloudcorprecords/factdocs
docker run --rm ghcr.io/cloudcorprecords/factdocs buscar_documentacion '{"consulta":"webhooks"}'
```

## CLI

One binary serves both the command line and the MCP server. Each tool is a subcommand taking a single JSON string with that tool's arguments:

```bash
factdocs ejemplo_comprobante '{"tipo":"01"}'
factdocs explicar_error '{"codigo":"302"}'
factdocs leer_guia '{"slug":"emision-01"}'
factdocs buscar_documentacion '{"consulta":"nota de credito","maximo":5}'
factdocs consultar_referencia '{"ruta":"/v1/comprobantes","metodo":"GET"}'
factdocs listar_guias '{}'
factdocs --version
```

Exit codes: `0` when the forwarded call succeeds, `1` when the upstream result is an error, and `2` for usage problems such as an unknown subcommand or a malformed JSON argument.

## Configuration

- `FACTDOCS_MCP_URL` — Overrides the upstream endpoint. The default is the pinned hosted endpoint, `https://docsapi.ecuafact.com/mcp`. (The override variable is a reconstruction added by this rebuild.)

The upstream registry record declares no headers, so no authentication header is ever sent; the tool surface was captured keyless.

Upstream failures — a JSON-RPC error from the service, a non-2xx response, an unreadable body, or a request that fails outright — are reported to the caller as an error result whose text starts with `factdocs error:`.

## How forwarding works

The first forwarded call opens a session: an `initialize` request (protocol version `2025-03-26`), followed by a `notifications/initialized` notification, then the `tools/call` itself. If the service answers the initialize request with an `Mcp-Session-Id` header, that value is carried on every later request, and the open session is reused for the rest of the process. Replies are accepted either as plain JSON or as server-sent events. Successful results pass through verbatim, including any `isError` flag and any extra fields the service includes.

## Development

```bash
npm install
npm run build   # tsc -> dist/ (dist/cli.js is the bin)
npm test        # tsx --test test/*.test.ts — stubbed upstream, no network
npm run dev     # run the CLI from source
```

The test suite checks the served tool list against the captured surface (all 6 tools, deep-equal, in order, with no `title` key served and no `required` key added to the two tools that carry none), exercises the session handshake and its reuse, verifies that no `Authorization` or `X-API-Key` header is ever sent under any environment, and verifies that arguments go upstream untouched and results come back untouched.

## License

MIT — see `LICENSE`. Copyright (c) 2026 Rene Turcios.
