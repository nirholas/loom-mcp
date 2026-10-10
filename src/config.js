// Centralized env + HTTP base for the loom MCP.
//
// This server is a thin wrapper over the PUBLIC three.ws Loom API (/api/loom) —
// the community 3D-creation gallery. The feed and single-creation reads are fully
// public; submitting a creation is also public, gated server-side only by an IP
// rate limit (no key, no signer, no account). The only knobs are which deployment
// to talk to and how long to wait. Every creation comes live from the endpoint.

export function env(key, fallback) {
	const v = process.env[key];
	return v !== undefined && String(v).trim() !== '' ? String(v).trim() : fallback;
}

// Base URL of the three.ws API that serves /api/loom. Override only when
// self-hosting or pointing at a preview deployment.
export const THREE_WS_BASE = env('THREE_WS_BASE', 'https://three.ws').replace(/\/+$/, '');

// Per-request timeout (ms). These are light reads + a small JSON POST, so a
// modest default is plenty while still riding out a cold edge.
export const HTTP_TIMEOUT_MS = (() => {
	const raw = env('THREE_WS_TIMEOUT_MS');
	if (raw === undefined) return 20000;
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0) {
		throw Object.assign(new Error(`THREE_WS_TIMEOUT_MS must be a positive number (got "${raw}")`), {
			code: 'bad_config',
		});
	}
	return n;
})();

// Identifies this client to the API in request logs.
export const USER_AGENT = '@three-ws/loom-mcp';
