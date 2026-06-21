#!/usr/bin/env node

import puppeteer from "puppeteer-core";

const code = process.argv.slice(2).join(" ");
if (!code) {
	console.log("Usage: browser-eval.js 'code'");
	console.log("\nExamples:");
	console.log('  browser-eval.js "document.title"');
	console.log('  browser-eval.js "document.querySelectorAll(\'a\').length"');
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

const pages = await b.pages();
const types = await Promise.all(pages.map(p => p.target().type()));
const idx = types.findIndex(t => t === 'page');
const page = pages[idx >= 0 ? idx : 0];

if (!page) {
	console.error("✗ No active tab found");
	process.exit(1);
}

const result = await page.evaluate((c) => {
	const AsyncFunction = (async () => {}).constructor;
	return new AsyncFunction(`return (${c})`)();
}, code);

if (Array.isArray(result)) {
	for (let i = 0; i < result.length; i++) {
		if (i > 0) console.log("");
		for (const [key, value] of Object.entries(result[i])) {
			console.log(`${key}: ${value}`);
		}
	}
} else if (typeof result === "object" && result !== null) {
	for (const [key, value] of Object.entries(result)) {
		console.log(`${key}: ${value}`);
	}
} else {
	console.log(result);
}

process.exit(0);
