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
console.log(`${pages.length} tabs open:\n`);
pages.forEach((p, i) => {
	console.log(`${i + 1}. ${p.url()}`);
});

await b.disconnect();
