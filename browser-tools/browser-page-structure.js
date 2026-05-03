#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseArgs } from "node:util";
import { connectAndSelectPage } from "./lib/page-selection.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		help: { type: 'boolean', short: 'h' },
		list: { type: 'boolean', short: 'l' },
		id: { type: 'string' },
		page: { type: 'string', short: 'p' },
		depth: { type: 'string' },
		boxes: { type: 'boolean', short: 'b' },
	},
	allowPositionals: true,
});

if (values.help) {
	console.log(`
browser-page-structure.js - Generate ARIA snapshot from browser page

USAGE:
  browser-page-structure.js [options]

OPTIONS:
  -h, --help              Show this help
  -l, --list              List all pages with their stable IDs
  --id <targetId>          Select page by stable ID (recommended)
  -p, --page <index>      Select page by index (may change if tabs moved)
                           Use 'last' or '-1' for the last tab
  --depth <N>             Limit tree to depths 0 through N (default: unlimited)
  -b, --boxes             Include bounding box coordinates [box=x,y,w,h]

EXAMPLES:
  # List all pages
  browser-page-structure.js --list

  # Select page by stable ID (recommended - persists across tab moves)
  browser-page-structure.js --id A5A3072972ABBE08577A7CD3F62DF08D

  # Select first page by index (may break if tabs moved)
  browser-page-structure.js --page 0

  # Select last page (default)
  browser-page-structure.js
  browser-page-structure.js --page last

  # Shallow overview (top 3 levels, depths 0-2)
  browser-page-structure.js --depth 2

  # Include bounding boxes for spatial reasoning
  browser-page-structure.js --boxes

NOTES:
  - Stable IDs (from --list) persist across tab moves and navigation
  - Page indices are shown in --list output for reference but are unstable
  - Run: browser-start.js to start the browser with remote debugging
	`);
	process.exit(0);
}

const { browser: b, page: p } = await connectAndSelectPage(process.argv.slice(2));

const ariaBundlePath = path.join(__dirname, 'aria-snapshot-bundle.js');

if (!fs.existsSync(ariaBundlePath)) {
	console.error("✗ ARIA snapshot bundle not found at:", ariaBundlePath);
	process.exit(1);
}

const ariaBundleCode = fs.readFileSync(ariaBundlePath, 'utf8');
await p.evaluateOnNewDocument(ariaBundleCode);
await p.evaluate(ariaBundleCode);

const ariaOptions = { mode: 'ai' };
if (values.depth) {
	const d = parseInt(values.depth, 10);
	if (isNaN(d) || d < 1) {
		console.error(`✗ Invalid depth: ${values.depth} (must be a positive integer)`);
		await b.disconnect();
		process.exit(1);
	}
	ariaOptions.depth = d;
}
if (values.boxes)
	ariaOptions.boxes = true;

const ariaResult = await p.evaluate((opts) => {
	try {
		const { generateAriaTree, renderAriaTree } = __ariaSnapshotBundle;
		const snapshot = generateAriaTree(document.body, opts);
		const result = renderAriaTree(snapshot, opts);
		return { yaml: result.text, iframeDepths: result.iframeDepths };
	} catch (error) {
		console.error('[aria-snapshot] Error:', error.message);
		return {
			yaml: '',
			iframeDepths: {},
			error: error.message
		};
	}
}, ariaOptions);

if (!ariaResult.yaml) {
	console.error("✗ Could not generate ARIA snapshot:", ariaResult.error || "unknown error");
	await b.disconnect();
	process.exit(1);
}

const pageUrl = await p.evaluate(() => window.location.href);
const pageTitle = await p.evaluate(() => document.title);
console.log(`url: ${pageUrl}`);
console.log(`title: ${pageTitle}`);
console.log("");
console.log(ariaResult.yaml);

if (ariaResult.iframeDepths && Object.keys(ariaResult.iframeDepths).length > 0) {
	console.log('');
	console.log('# IFRAMES');
	for (const [ref, depth] of Object.entries(ariaResult.iframeDepths)) {
		console.log(`# iframe [ref=${ref}] at depth ${depth} — iframe content is not included in this snapshot`);
	}
}

// Exit immediately without disconnecting - process termination will clean up
process.exit(0);
