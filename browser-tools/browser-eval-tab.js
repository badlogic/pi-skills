#!/usr/bin/env node

import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const tabArg = args[0]; // Can be index (1-based) or URL pattern
const code = args.slice(1).join(" ");

if (!tabArg || !code) {
	console.log("Usage: browser-eval-tab.js <tab-index-or-pattern> 'code'");
	console.log("\nExamples:");
	console.log('  browser-eval-tab.js 2 "document.title"  (tab index 2)');
	console.log('  browser-eval-tab.js claude "document.title"  (first tab matching "claude")');
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
	console.error("  Run: browser-start.js &");
	process.exit(1);
});

const pages = await b.pages();

let targetPage;

// Try numeric index first (1-based)
const index = parseInt(tabArg);
if (!isNaN(index) && index > 0 && index <= pages.length) {
	targetPage = pages[index - 1];
} else {
	// Try URL pattern matching
	targetPage = pages.find(p => p.url().includes(tabArg));
	if (!targetPage) {
		console.error(`✗ No tab found matching: "${tabArg}"`);
		console.error("\nAvailable tabs:");
		pages.forEach((p, i) => {
			console.error(`${i + 1}. ${p.url()}`);
		});
		process.exit(1);
	}
}

if (!targetPage) {
	console.error("✗ No target tab found");
	process.exit(1);
}

const result = await targetPage.evaluate((c) => {
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

await b.disconnect();
