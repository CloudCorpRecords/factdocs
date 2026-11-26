# Changelog

## 0.1.0 (2026-10-28)

- First release: a forwarding client for the hosted Ecuafact docsapi MCP server. All 6 captured tools are answered locally for tools/list, and every tools/call is forwarded upstream over a streamable-HTTP JSON-RPC session (initialize, notifications/initialized, tools/call, honouring the Mcp-Session-Id header when the upstream issues one).
- Tools: `ejemplo_comprobante`, `explicar_error`, `leer_guia`, `buscar_documentacion`, `consultar_referencia`, `listar_guias`. The capture carries no `title` keys and none are served; `consultar_referencia` and `listar_guias` carry no `required` key in the capture and none is served, and `listar_guias` carries an empty properties object. Property `default` keys from the capture (`seccion`, `ruta`, `metodo` default null; `maximo` default 8) are served verbatim.
- Upstream results pass through verbatim, including the isError flag; upstream failures surface as `factdocs error:` text results.
- One bin serves the CLI (one subcommand per tool, plus `--version`) and the stdio MCP server (`mcp` subcommand). The upstream endpoint can be overridden via `FACTDOCS_MCP_URL`. The upstream record declares no headers, so no auth header is ever sent.
