#!/usr/bin/env node

import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseArgs } from "node:util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { values, positionals } = parseArgs({
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
  --depth <N>             Limit tree depth (default: unlimited)
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

const b = await Promise.race([
	puppeteer.connect({
		browserURL: "http://localhost:9222",
		defaultViewport: null,
	}),
	new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000)),
]).catch((e) => {
	console.error("✗ Could not connect to browser:", e.message);
	console.error("  Run: browser-start.js");
	process.exit(1);
});

const allPages = await b.pages();

if (allPages.length === 0) {
	console.error("✗ No pages found in browser");
	process.exit(1);
}

if (values.list) {
	console.log("# AVAILABLE PAGES");
	console.log("");

	const pageTargets = await Promise.all(allPages.map(async (page, index) => {
		const target = page.target();
		const url = page.url();
		const title = await page.title();
		return {
			id: target._targetId,
			url,
			title,
			index,
		};
	}));

	pageTargets.forEach(({ id, url, title, index }) => {
		console.log(`id: ${id}`);
		console.log(`  index: ${index} (may change if tabs are moved)`);
		console.log(`  url: ${url}`);
		console.log(`  title: ${title}`);
		console.log("");
	});

	await b.disconnect();
	process.exit(0);
}

let p;
let selectionMethod = '';

if (values.id) {
	p = allPages.find(page => page.target()._targetId === values.id);
	selectionMethod = `id="${values.id}"`;
} else if (values.page) {
	const indexStr = values.page.toLowerCase();
	if (indexStr === 'last' || indexStr === '-1') {
		p = allPages.at(-1);
		selectionMethod = 'page=last';
	} else {
		const index = parseInt(values.page, 10);
		if (isNaN(index) || index < 0 || index >= allPages.length) {
			console.error(`✗ Invalid page index: ${values.page} (must be 0-${allPages.length - 1})`);
			await b.disconnect();
			process.exit(1);
		}
		p = allPages[index];
		selectionMethod = `page=${index}`;
	}
} else {
	p = allPages.at(-1);
	selectionMethod = 'page=last (default)';
}

if (!p) {
	console.error(`✗ No page found with ${selectionMethod}`);
	await b.disconnect();
	process.exit(1);
}

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
