// Viewer + embed helpers for Loom creations, and the GLB-URL guard.
//
// These mirror two real platform sources so an agent sees the SAME shapes the
// three.ws web app uses — never a divergent guess:
//   • the host allowlist + validation in api/loom.js (validateGlbUrl)
//   • the /forge/embed URL + iframe snippet in src/forge-embed-snippets.js
//
// A Loom creation is a forged GLB. The canonical way to preview one is the
// zero-dependency three.ws viewer page at /forge/embed?src=<glb> (orbit + AR +
// branding), which is exactly what we hand back as viewer_url.

import { THREE_WS_BASE } from '../config.js';

// Hosts a forged GLB can legitimately live on — kept in lockstep with
// ALLOWED_GLB_HOST_SUFFIXES in api/loom.js. The server is the source of truth and
// rejects anything else; we check here too so submit_creation fails fast with a
// clear message instead of a round-trip 400.
export const ALLOWED_GLB_HOST_SUFFIXES = [
	'three.ws',
	'r2.dev',
	'cloudflarestorage.com',
	'replicate.delivery',
	'githubusercontent.com',
];

/**
 * Validate a model URL is an https URL on an allowlisted host. Returns the
 * normalized href on success, or null if it fails any check — same contract as
 * the server's validateGlbUrl so client and server never disagree.
 */
export function validateGlbUrl(raw) {
	if (typeof raw !== 'string' || !raw.trim()) return null;
	let url;
	try {
		url = new URL(raw.trim());
	} catch {
		return null;
	}
	if (url.protocol !== 'https:') return null;
	const host = url.hostname.toLowerCase();
	const ok = ALLOWED_GLB_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
	return ok ? url.href : null;
}

function escAttr(s) {
	return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** The /forge/embed viewer URL for a GLB, optionally carrying a title. */
export function viewerUrl(glbUrl, title) {
	if (!glbUrl) return null;
	const q = new URLSearchParams({ src: glbUrl });
	if (title) q.set('title', String(title).slice(0, 120));
	return `${THREE_WS_BASE}/forge/embed?${q.toString()}`;
}

/** Open Graph / social card image for a GLB (same endpoint the web app uses). */
export function ogImageUrl(glbUrl) {
	if (!glbUrl) return null;
	return `${THREE_WS_BASE}/api/avatar-og?src=${encodeURIComponent(glbUrl)}`;
}

/** A paste-ready iframe embed for the creation — matches forge-embed-snippets.js. */
export function iframeSnippet(glbUrl, title, { width = 640, height = 360 } = {}) {
	if (!glbUrl) return null;
	const src = viewerUrl(glbUrl, title);
	return (
		`<iframe src="${escAttr(src)}" width="${width}" height="${height}" ` +
		`style="border:0;border-radius:14px;max-width:100%" ` +
		`allow="xr-spatial-tracking; fullscreen" loading="lazy" ` +
		`title="${escAttr(title || '3D model forged on three.ws')}"></iframe>`
	);
}

/**
 * Decorate a raw creation record from /api/loom with the viewer URL, OG image,
 * and a ready-to-embed iframe — so every read tool returns something an MCP
 * client can preview inline without a second lookup. Returns null for a missing
 * record; passes through unknown fields untouched.
 */
export function decorateCreation(rec) {
	if (!rec || typeof rec !== 'object') return null;
	const glb = typeof rec.glbUrl === 'string' ? rec.glbUrl : null;
	return {
		...rec,
		viewer_url: glb ? viewerUrl(glb, rec.prompt) : null,
		og_image_url: glb ? ogImageUrl(glb) : null,
		iframe_snippet: glb ? iframeSnippet(glb, rec.prompt) : null,
	};
}
