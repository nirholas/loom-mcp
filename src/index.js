#!/usr/bin/env node
// @three-ws/loom-mcp — MCP server entry point.
//
// Exposes Loom, the three.ws community 3D-creation gallery (the public forge
// feed), over stdio so any AI assistant can:
//   • get_loom_feed   — browse community-forged creations, newest-first
//   • get_creation    — fetch one creation + its /forge/embed viewer URL
//   • submit_creation — contribute a forged GLB to the public gallery
//
// A thin wrapper over the PUBLIC three.ws API (/api/loom). Reads need no key;
// submission needs no key or account either — it is gated server-side only by an
// IP rate limit. Closes the loop with scene-mcp (compose) and avatar-agent
// (generate): forge a GLB, then publish it here for the whole platform to see.
//
// Run standalone:
//   node packages/loom-mcp/src/index.js
//
// Or wire into Claude Code / Cursor — see README.md.

import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { def as getLoomFeed } from './tools/get-loom-feed.js';
import { def as getCreation } from './tools/get-creation.js';
import { def as submitCreation } from './tools/submit-creation.js';

// Single source of truth for the advertised server version — package.json.
const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require('../package.json');

export const TOOLS = [getLoomFeed, getCreation, submitCreation];

/**
 * Construct a fully-registered McpServer without connecting a transport.
 * Registration is env-free, so this is safe to import from tests.
 * @returns {McpServer}
 */
export function buildServer() {
	const server = new McpServer(
		{ name: 'loom-mcp', title: 'three.ws Loom', version: PKG_VERSION },
		{
			capabilities: { tools: {} },
			instructions:
				'three.ws Loom MCP — the community 3D-creation gallery. get_loom_feed browses the public, ' +
				'world-readable feed of community-forged GLB creations (newest-first, paginated via the ' +
				'nextBefore cursor); every item comes with a /forge/embed viewer_url and a paste-ready ' +
				'iframe_snippet so you can preview it inline. get_creation fetches a single creation by id with ' +
				'the same viewer extras. submit_creation contributes a forged GLB to the gallery — it needs ' +
				'just a prompt and an https glbUrl on an allowed host (three.ws, r2.dev, cloudflarestorage.com, ' +
				'replicate.delivery, githubusercontent.com); no key or account is required, but submissions are ' +
				'PUBLIC and rate-limited (~20/hour per IP), and `author` is free-text attribution, not identity. ' +
				'This closes the loop with scene-mcp (compose worlds) and avatar-agent (generate GLBs): forge a ' +
				'model elsewhere, then publish it here. The only coin this platform references is $THREE.',
		},
	);

	for (const tool of TOOLS) {
		server.registerTool(
			tool.name,
			{
				title: tool.title,
				description: tool.description,
				inputSchema: tool.inputSchema,
				// MCP ToolAnnotations (readOnlyHint / destructiveHint / idempotentHint /
				// openWorldHint) — lets clients gate confirmation prompts per tool
				// instead of treating every call as a destructive write.
				annotations: tool.annotations,
			},
			async (args, extra) => {
				try {
					const result = await tool.handler(args, extra);
					const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
					return { content: [{ type: 'text', text }] };
				} catch (err) {
					const payload = {
						ok: false,
						error: err?.code || 'unhandled',
						message: err?.message || String(err),
						...(err?.status ? { status: err.status } : {}),
						...(err?.body ? { detail: err.body } : {}),
					};
					return {
						content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
						isError: true,
					};
				}
			},
		);
	}

	return server;
}

async function main() {
	const server = buildServer();
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error(`[loom-mcp@${PKG_VERSION}] connected over stdio with ${TOOLS.length} tools`);
}

// Connect stdio ONLY when this file is the process entry point. Importing the
// module (tests, embedding) must not grab the transport. realpath both sides:
// npm bin shims are symlinks, so argv[1] may differ from import.meta.url.
function isProcessEntryPoint() {
	if (!process.argv[1]) return false;
	try {
		return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
	} catch {
		return false;
	}
}

if (isProcessEntryPoint()) {
	main().catch((err) => {
		console.error('[loom-mcp] fatal:', err);
		process.exit(1);
	});
}
