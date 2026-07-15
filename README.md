---
title: Aurora Life OS ChatGPT App
emoji: 🌌
colorFrom: indigo
colorTo: cyan
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# Aurora Life OS - ChatGPT App

A working ChatGPT Apps SDK / MCP Apps starter with an interactive inline widget.

## App archetype

`interactive-decoupled` - ChatGPT selects tools; the MCP server owns data and calculations; the widget renders and calls tools through the MCP Apps bridge.

## Included tools

- `show_dashboard` - read and render the dashboard
- `update_metrics` - update spending, focus, energy and completion metrics
- `complete_task` - complete a task from ChatGPT or the widget
- `replan_day` - generate a revised action plan
- `analyse_day` - provide a contextual recommendation

## Run locally

```bash
npm install
npm run validate
npm start
```

The MCP endpoint is:

```text
http://localhost:7860/mcp
```

Test it with MCP Inspector:

```bash
npx @modelcontextprotocol/inspector@latest --server-url http://localhost:7860/mcp --transport http
```

## Connect to ChatGPT

1. Expose port 7860 through an HTTPS tunnel, for example `ngrok http 7860`.
2. In ChatGPT developer mode, add the remote MCP URL ending in `/mcp`.
3. Ask: "Open my Aurora dashboard."
4. For production, deploy the server behind a stable HTTPS endpoint.

## Hugging Face Spaces

This repository includes a Dockerfile for Docker Spaces. The server listens on `process.env.PORT` and defaults to port `7860`.

## Important

This demo stores state in server memory. Restarting the process resets it. For a real multi-user app, replace the in-memory profile/tasks with authenticated persistent storage such as Postgres.

No OpenAI API key is required for this MCP app scaffold. ChatGPT provides the model reasoning; your server provides tools and UI.
