#!/usr/bin/env node

import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const tabArg = args[0];
const message = args.slice(1).join(" ");

if (!tabArg || !message) {
	console.log("Usage: browser-pick-tab.js <tab-index-or-pattern> 'message'");
	console.log("\nExamples:");
	console.log('  browser-pick-tab.js 3 "Click the code block"');
	console.log('  browser-pick-tab.js claude "Click the Intc.hs code"');
	process.exit(1);
}

const b = await Promise.race([
	puppeteer.connect({
		browserURL: "http://localhost:9222",
		defaultViewport: null,
	}),
	new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
]).catch((e) => {
	console.error("Failed to connect to browser");
	process.exit(1);
});

const pages = await b.pages();
let targetPage;

const index = parseInt(tabArg);
if (!isNaN(index) && index > 0 && index <= pages.length) {
	targetPage = pages[index - 1];
} else {
	targetPage = pages.find(p => p.url().includes(tabArg));
	if (!targetPage) {
		console.error(`No tab found matching: "${tabArg}"`);
		console.error("\nAvailable tabs:");
		pages.forEach((p, i) => console.error(`${i + 1}. ${p.url()}`));
		await b.disconnect();
		process.exit(1);
	}
}

console.log(`Target: ${targetPage.url()}`);
console.log(`Message: ${message}\n`);

// Inject picker with instructions
await targetPage.evaluate((msg) => {
	// Create instruction overlay
	const overlay = document.createElement("div");
	overlay.id = "pick-overlay";
	overlay.style.cssText = `
		position: fixed;
		top: 20px;
		left: 20px;
		background: white;
		padding: 15px;
		border: 2px solid #ff6b6b;
		border-radius: 4px;
		z-index: 999999;
		font-family: monospace;
		font-size: 13px;
		line-height: 1.4;
	`;
	overlay.innerHTML = `
		<div style="font-weight: bold; margin-bottom: 8px;">${msg}</div>
		<div style="font-size: 11px; color: #666;">
			Click to pick | Ctrl+Click for multiple | Esc to finish
		</div>
	`;
	document.body.appendChild(overlay);
	
	window.__pickResults = [];
	let picking = true;
	
	document.addEventListener("click", (e) => {
		if (!picking) return;
		if (e.target === overlay || overlay.contains(e.target)) return;
		
		e.preventDefault();
		e.stopPropagation();
		
		const el = e.target;
		window.__pickResults.push({
			tag: el.tagName,
			text: el.innerText?.substring(0, 200) || "",
			className: el.className,
			id: el.id,
			html: el.outerHTML.substring(0, 300),
		});
		
		// Highlight picked element
		el.style.border = "2px solid #4CAF50";
		el.style.backgroundColor = "rgba(76, 175, 80, 0.1)";
		
		// Single click = done, Ctrl+click = add more
		if (!e.ctrlKey && !e.metaKey) {
			picking = false;
			overlay.innerText = "Picked! Press Esc or close.";
			overlay.style.borderColor = "#4CAF50";
		}
	}, true);
	
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			picking = false;
			overlay.innerText = "Done!";
		}
	});
}, message);

// Wait for picks
await new Promise(r => setTimeout(r, 1000));

let picked = false;
for (let i = 0; i < 120; i++) {
	const results = await targetPage.evaluate(() => window.__pickResults);
	if (results && results.length > 0) {
		console.log(`Selected ${results.length} element(s):\n`);
		results.forEach((r, idx) => {
			console.log(`[${idx + 1}] ${r.tag}${r.id ? '#' + r.id : ''}${r.className ? '.' + r.className.split(' ')[0] : ''}`);
			console.log(`    Text: ${r.text.substring(0, 80)}`);
			console.log();
		});
		picked = true;
		break;
	}
	await new Promise(r => setTimeout(r, 500));
}

if (!picked) {
	console.log("No element picked within timeout");
}

// Clean up overlay and highlights
await targetPage.evaluate(() => {
	document.querySelectorAll('#pick-overlay').forEach(el => el.remove());
	document.querySelectorAll('[style*="border: 2px solid #4CAF50"]').forEach(el => {
		el.style.border = '';
		el.style.backgroundColor = '';
	});
});

await b.disconnect();
