#!/usr/bin/env node

import { parseArgs } from "node:util";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { connectAndSelectPage } from "./lib/page-selection.js";

// Global timeout - exit if script takes too long
const TIMEOUT = 30000;
setTimeout(() => {
	console.error("✗ Timeout after 30s");
	process.exit(1);
}, TIMEOUT).unref();

const { positionals } = parseArgs({
	args: process.argv.slice(2),
	options: {
		id: { type: 'string' },
		page: { type: 'string' },
	},
	allowPositionals: true,
});

const url = positionals[0];

if (!url) {
	console.log("Usage: browser-content.js <url> [--id <targetId>] [--page <index>]");
	console.log("\nExtracts readable content from a URL as markdown.");
	console.log("\nExamples:");
	console.log("  browser-content.js https://example.com");
	console.log("  browser-content.js https://example.com --id A5A3072972ABBE08577A7CD3F62DF08D");
	console.log("  browser-content.js https://en.wikipedia.org/wiki/Rust_(programming_language) --page 0");
	process.exit(1);
}

const { browser: b, page: p } = await connectAndSelectPage(process.argv.slice(2));

await Promise.race([
	p.goto(url, { waitUntil: "networkidle2" }),
	new Promise((r) => setTimeout(r, 10000)),
]).catch(() => {});

// Get HTML via CDP (works even with TrustedScriptURL restrictions)
const client = await p.createCDPSession();
const { root } = await client.send("DOM.getDocument", { depth: -1, pierce: true });
const { outerHTML } = await client.send("DOM.getOuterHTML", { nodeId: root.nodeId });
await client.detach();

const finalUrl = p.url();

// Extract with Readability
const doc = new JSDOM(outerHTML, { url: finalUrl });
const reader = new Readability(doc.window.document);
const article = reader.parse();

function htmlToMarkdown(html) {
	const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
	turndown.use(gfm);
	turndown.addRule("removeEmptyLinks", {
		filter: (node) => node.nodeName === "A" && !node.textContent?.trim(),
		replacement: () => "",
	});
	return turndown
		.turndown(html)
		.replace(/\[\\?\[\s*\\?\]\]\([^)]*\)/g, "")
		.replace(/ +/g, " ")
		.replace(/\s+,/g, ",")
		.replace(/\s+\./g, ".")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

let content;
if (article && article.content) {
	content = htmlToMarkdown(article.content);
} else {
	const fallbackDoc = new JSDOM(outerHTML, { url: finalUrl });
	const fallbackBody = fallbackDoc.window.document;
	fallbackBody.querySelectorAll("script, style, noscript, nav, header, footer, aside").forEach((el) => el.remove());
	const main = fallbackBody.querySelector("main, article, [role='main'], .content, #content") || fallbackBody.body;
	const fallbackHtml = main?.innerHTML || "";
	if (fallbackHtml.trim().length > 100) {
		content = htmlToMarkdown(fallbackHtml);
	} else {
		content = "(Could not extract content)";
	}
}

console.log(`URL: ${finalUrl}`);
if (article?.title)
	console.log(`Title: ${article.title}`);
console.log("");
console.log(content);

await b.disconnect();
