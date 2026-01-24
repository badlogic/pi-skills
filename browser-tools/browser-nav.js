#!/usr/bin/env node

import puppeteer from "puppeteer-core";

const url = process.argv[2];
const newTab = process.argv[3] === "--new";

if (!url) {
	console.log("Usage: browser-nav.js <url> [--new]");
	console.log("\nExamples:");
	console.log("  browser-nav.js https://example.com       # Navigate current tab");
	console.log("  browser-nav.js https://example.com --new # Open in new tab");
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
	console.log("✓ Opened:", url);
} else {
	const pages = await b.pages();
	let p = pages.at(-1);
	if (!p) {
		p = await b.newPage();
	}
	await p.goto(url, { waitUntil: "domcontentloaded" });
	console.log("✓ Navigated to:", url);
}

await b.disconnect();
