#!/usr/bin/env node

/**
 * Shared page selection for browser tools.
 *
 * Provides `connectAndSelectPage()` which:
 * 1. Connects to Chrome on :9222
 * 2. Resolves --id / --page flags to a specific Puppeteer page
 * 3. Returns { browser, page, allPages }
 *
 * Usage:
 *   import { connectAndSelectPage } from './lib/page-selection.js';
 *   const { browser: b, page: p } = await connectAndSelectPage(process.argv.slice(2));
 *
 * Supports:
 *   --id <targetId>   Select page by stable target ID (from --list)
 *   --page <index>    Select page by index, 'last' or '-1' (default: last)
 *   --list            List all pages with stable IDs, then exit
 */

import puppeteer from "puppeteer-core";

const CONNECT_TIMEOUT = 5000;

/**
 * Connect to Chrome and select a page based on CLI flags.
 *
 * @param {string[]} argv - CLI arguments (e.g. process.argv.slice(2))
 * @param {object} [options]
 * @param {boolean} [options.requirePage=true] - If false, returns null page when no selection matches
 * @returns {Promise<{ browser: import('puppeteer-core').Browser, page: import('puppeteer-core').Page|null, allPages: import('puppeteer-core').Page[] }>}
 */
export async function connectAndSelectPage(argv, { requirePage = true } = {}) {
	// Parse flags
	const positional = [];
	const flags = {};
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--id' && argv[i + 1]) {
			flags.id = argv[++i];
		} else if (argv[i] === '--page' && argv[i + 1]) {
			flags.page = argv[++i];
		} else if (argv[i] === '--list') {
			flags.list = true;
		} else if (argv[i] === '--new') {
			flags.newTab = true;
		} else if (!argv[i].startsWith('--')) {
			positional.push(argv[i]);
		}
	}

	// Connect
	const b = await Promise.race([
		puppeteer.connect({
			browserURL: "http://localhost:9222",
			defaultViewport: null,
		}),
		new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), CONNECT_TIMEOUT)),
	]).catch((e) => {
		console.error("✗ Could not connect to browser:", e.message);
		console.error("  Run: browser-start.js");
		process.exit(1);
	});

	const allPages = await b.pages();

	if (allPages.length === 0) {
		console.error("✗ No pages found in browser");
		await b.disconnect();
		process.exit(1);
	}

	// --list mode
	if (flags.list) {
		console.log("# AVAILABLE PAGES");
		console.log("");
		const pageTargets = await Promise.all(allPages.map(async (page, index) => {
			const target = page.target();
			const url = page.url();
			const title = await page.title();
			return { id: target._targetId, url, title, index };
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

	// --new flag means caller handles page creation
	if (flags.newTab) {
		return { browser: b, page: null, allPages };
	}

	// Select page
	let p;
	let selectionMethod = '';

	if (flags.id) {
		p = allPages.find(page => page.target()._targetId === flags.id);
		selectionMethod = `id="${flags.id}"`;
	} else if (flags.page) {
		const indexStr = flags.page.toLowerCase();
		if (indexStr === 'last' || indexStr === '-1') {
			p = allPages.at(-1);
			selectionMethod = 'page=last';
		} else {
			const index = parseInt(flags.page, 10);
			if (isNaN(index) || index < 0 || index >= allPages.length) {
				console.error(`✗ Invalid page index: ${flags.page} (must be 0-${allPages.length - 1})`);
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

	if (!p && requirePage) {
		console.error(`✗ No page found with ${selectionMethod}`);
		await b.disconnect();
		process.exit(1);
	}

	return { browser: b, page: p, allPages };
}
