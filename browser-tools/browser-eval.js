#!/usr/bin/env node

import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const tabIdx = args.indexOf("--tab");
const tabId = tabIdx !== -1 ? args[tabIdx + 1] : null;
const code = args.filter((a, i) => a !== "--tab" && (tabIdx === -1 || i !== tabIdx + 1)).join(" ");

if (!code) {
	console.log("Usage: browser-eval.js [--tab <targetId>] 'code'");
	console.log("\nExamples:");
	console.log('  browser-eval.js "document.title"');
	console.log('  browser-eval.js "document.querySelectorAll(\'a\').length"');
	console.log('  browser-eval.js --tab ABC123 "document.title"');
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

let p;
if (tabId) {
	const pages = await b.pages();
	p = pages.find((pg) => pg.target()._targetId === tabId);
	if (!p) {
		console.error(`✗ No tab found with id: ${tabId}`);
		process.exit(1);
	}
} else {
	p = (await b.pages()).at(-1);
}

if (!p) {
	console.error("✗ No active tab found");
	process.exit(1);
}

const result = await p.evaluate((c) => {
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
