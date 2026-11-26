# BUILD REPORT — factdocs

Clean-room rebuild of `com.ecuafact.docsapi/documentacion`
v1.0.0 (remote-only MCP server at
`https://docsapi.ecuafact.com/mcp`), built 2026-10-28 as a
forwarding client. Package: `@reneturcios/factdocs` 0.1.0,
registry name `io.github.CloudCorpRecords/factdocs`.

## Surface built

Full surface: **6 of 6 captured tools built**, none omitted.

| Tool | Required fields as served |
|------|---------------------------|
| `ejemplo_comprobante` | `tipo` |
| `explicar_error` | `codigo` |
| `leer_guia` | `slug` |
| `buscar_documentacion` | `consulta` |
| `consultar_referencia` | NO `required` key in the capture — served verbatim, none invented |
| `listar_guias` | NO `required` key in the capture — served verbatim, none invented; its `properties` object is empty |

Each served tool carries exactly the keys `name`, `description`,
`inputSchema`, exactly as captured: the capture carries NO
`title` keys on any tool and none are served. Property
`default` keys from the capture are served verbatim
(`seccion`, `ruta`, `metodo` default null; `maximo` default 8).
The tool literals were generated programmatically from
`harness/fixtures/ecuafact-tools.json` by the script at
`/tmp/b50-factdocs-scratch/gen.py` (parse + re-serialise; the
generator's round-trip assertions confirmed the emitted
literals parse back to the fixture's tool objects) — never
retyped — and the registration-integrity test suite plus the
parity harness confirmed the served literals deep-equal the
fixture's 6 tool objects, in order. Tools are registered via
the MCP SDK low-level Server API (`ListToolsRequestSchema` /
`CallToolRequestSchema` handlers), not McpServer+zod.

## Fixture conflicts

**None.** The spec and the fixture agree on all 6 tools' names,
descriptions, required fields (including the two tools with no
`required` key: `consultar_referencia` and `listar_guias`, the
latter with an empty `properties` object) and property shapes,
including the `default` keys.

## Labelled reconstructions (from the spec's Wire section)

- Upstream endpoint pinned: `https://docsapi.ecuafact.com/mcp`.
- Env override `FACTDOCS_MCP_URL` — labelled reconstruction.
- The registry record declares NO headers on the remote: no auth
  header is ever sent. Tests assert that no `Authorization`
  header is sent under any environment — including with key-like
  env vars (`FACTDOCS_API_KEY`, `API_KEY`, `AUTHORIZATION`) set —
  and that no `X-API-Key` header is ever sent; upstream requests
  carry only `Content-Type`, `Accept` and, when issued,
  `Mcp-Session-Id`.
- Error rendering `factdocs error:` text for upstream failures —
  labelled reconstruction.
- Upstream results pass through verbatim, including
  `structuredContent`, `isError` and extra fields. tools/call is
  forwarded as streamable-HTTP JSON-RPC: initialize
  (protocolVersion `2025-03-26`) → notifications/initialized →
  tools/call, honouring `Mcp-Session-Id` when issued; plain-JSON
  and SSE replies are both parsed. The forwarding core takes an
  injectable fetch; tests stub the upstream — no live network
  calls in tests.

## Deviations

None in the shipped surface. Build execution note: the
lockfile/install/build/test/parity chain was run setsid-detached
(see Lockfile) after in-session npm runs were killed by the VM
write guard; outputs were verified from disk afterwards.

## Lockfile

- Route: the offline route (`npm install --package-lock-only
  --ignore-scripts --offline`) failed first with ENOTCACHED (no
  cached packument for `@modelcontextprotocol/sdk`). The
  specified fallback route — `HTTPS_PROXY=http://hatch-egress-proxy:3128
  HTTP_PROXY=http://hatch-egress-proxy:3128 npm install
  --package-lock-only --ignore-scripts --registry
  https://registry.npmjs.org` — is the route that generated the
  lockfile, run setsid-detached after in-session attempts failed
  with `EPERM: operation not permitted, write` on the npm cache
  write of the SDK packument during a sustained write-guard
  window (and one VM replacement wiped the first detached run;
  it was relaunched and completed).
- Parses as JSON; `name` == `@reneturcios/factdocs`.
- Package entries: **128**.
- sha256: `794a58981d97cd4a8c0405944a0f2b5acce52ad2e0e17946adbee00652b665f1`

## server.json

- Description exactly: "Ecuafact API documentation: guides, error codes, example e-invoices and OpenAPI reference." —
  **90 characters** (verified programmatically).
- npm package entry carries `"version": "0.1.0"`; the OCI entry
  (`ghcr.io/cloudcorprecords/factdocs:0.1.0`) carries **no**
  `version` field. Both entries carry packageArguments
  `[{type: positional, value: mcp}]` and transport stdio.
  Dockerfile (node:20-alpine, both stages) carries the label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/factdocs"`.
  Container workflow `IMAGE` is `ghcr.io/cloudcorprecords/factdocs`
  and its smoke test asserts the server name `factdocs`.

## Verification (all run 2026-10-28)

1. `tsc --noEmit` (direct binary) → exit 0.
2. Build (`tsc`) → exit 0; real `dist/` produced (cli, forward,
   index, mcp, types — .js, .d.ts, .js.map each).
3. `node dist/cli.js --version` → `0.1.0`.
4. Test suite (direct `tsx --test`) → **57 tests, 57 pass, 0 fail**
   (registration-integrity suite deep-equals the served tools/list
   against the fixture's 6 tools, including the no-`title`-key
   assertion and required-key exactness — consultar_referencia
   and listar_guias have NO required key, and listar_guias has an
   empty properties object — plus default-key verbatim checks,
   session handling/reuse, env override, the no-Authorization /
   no-X-API-Key assertions under any environment, verbatim
   per-tool argument forwarding for all 6 tools and result
   pass-through including structuredContent and upstream isError,
   SSE parsing, error rendering for both the JSON-RPC-error and
   transport-failure paths, MCP-layer validation, and CLI
   behaviour including a working subcommand for every one of the
   6 tools against a local stub server).
5. Parity: `python3 /home/hatch/workspace/mcp-rebuild-100/harness/parity.py --original /home/hatch/workspace/mcp-rebuild-100/harness/fixtures/ecuafact-tools.json --rebuild "stdio:node /home/hatch/workspace/mcp-rebuild-100/builds/factdocs/dist/cli.js mcp" --out /home/hatch/workspace/mcp-rebuild-100/builds/factdocs/parity-out` → **verdict PASS, parity 100.0**
   (6/6 identical, 0 missing, 0 extra, no schema diffs). Output in
   `parity-out/`.
