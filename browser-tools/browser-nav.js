#!/usr/bin/env node

import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const newTab = args.includes("--new");
const reload = args.includes("--reload");
const tabIdx = args.indexOf("--tab");
const tabId = tabIdx !== -1 ? args[tabIdx + 1] : null;
const url = args.find((a, i) => !a.startsWith("--") && (tabIdx === -1 || i !== tabIdx + 1));

if (!url) {
	console.log("Usage: browser-nav.js <url> [--new] [--reload] [--tab <targetId>]");
	console.log("\nExamples:");
	console.log("  browser-nav.js https://example.com              # Navigate current tab");
	console.log("  browser-nav.js https://example.com --new        # Open in new tab (prints tab:<targetId>)");
	console.log("  browser-nav.js https://example.com --reload     # Navigate and force reload");
	console.log("  browser-nav.js https://example.com --tab ABC123 # Navigate specific tab");
	process.exit(1);
}

const b = await Promise.race([
	puppeteer.connect({
		browserURL: "http://localhost:9222",
		defaultViewport: null,
	}),
	new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
]).catch((e) => {
	console.error("✗ Could not connect to browser:", e.message);
	console.error("  Run: browser-start.js");
	process.exit(1);
});

if (newTab) {
	const p = await b.newPage();
	await p.goto(url, { waitUntil: "domcontentloaded" });
	console.log(`✓ Opened: ${url} tab:${p.target()._targetId}`);
} else if (tabId) {
	const pages = await b.pages();
	const p = pages.find((pg) => pg.target()._targetId === tabId);
	if (!p) {
		console.error(`✗ No tab found with id: ${tabId}`);
		process.exit(1);
	}
	await p.goto(url, { waitUntil: "domcontentloaded" });
	if (reload) {
		await p.reload({ waitUntil: "domcontentloaded" });
	}
	console.log(`✓ Navigated to: ${url}`);
} else {
	const p = (await b.pages()).at(-1);
	await p.goto(url, { waitUntil: "domcontentloaded" });
	if (reload) {
		await p.reload({ waitUntil: "domcontentloaded" });
	}
	console.log(`✓ Navigated to: ${url}`);
}

await b.disconnect();
