#!/usr/bin/env node

import puppeteer from "puppeteer-core";

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

const cookies = await page.cookies();

for (const cookie of cookies) {
	console.log(`${cookie.name}: ${cookie.value}`);
	console.log(`  domain: ${cookie.domain}`);
	console.log(`  path: ${cookie.path}`);
	console.log(`  httpOnly: ${cookie.httpOnly}`);
	console.log(`  secure: ${cookie.secure}`);
	console.log("");
}

process.exit(0);
