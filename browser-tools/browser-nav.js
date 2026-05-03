#!/usr/bin/env node

import { connectAndSelectPage } from "./lib/page-selection.js";

const argv = process.argv.slice(2);
const newTab = argv.includes("--new");
const url = argv.find(a => !a.startsWith("--"));

if (!url) {
	console.log("Usage: browser-nav.js <url> [--new] [--id <targetId>] [--page <index>] [--reload]");
	console.log("\nExamples:");
	console.log("  browser-nav.js https://example.com                         # Navigate last tab");
	console.log("  browser-nav.js https://example.com --new                   # Open in new tab");
	console.log("  browser-nav.js https://example.com --id A5A3072972ABBE085  # Navigate specific tab");
	console.log("  browser-nav.js https://example.com --page 0                # Navigate tab by index");
	console.log("  browser-nav.js https://example.com --reload                # Navigate and force reload");
	console.log("\nNote: --new is mutually exclusive with --id and --page");
	process.exit(1);
}

const reload = argv.includes("--reload");

if (newTab && (argv.includes("--id") || argv.includes("--page"))) {
	console.error("✗ --new is mutually exclusive with --id and --page");
	process.exit(1);
}

const { browser: b, page: p } = await connectAndSelectPage(argv, { requirePage: !newTab });

if (newTab) {
	const newPage = await b.newPage();
	await newPage.goto(url, { waitUntil: "domcontentloaded" });
	console.log("✓ Opened:", url);
} else {
	await p.goto(url, { waitUntil: "domcontentloaded" });
	if (reload) {
		await p.reload({ waitUntil: "domcontentloaded" });
	}
	console.log("✓ Navigated to:", url);
}

await b.disconnect();
