#!/usr/bin/env node

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const url = process.argv[2];

if (!url) {
	console.log("Usage: content.js <url>");
	console.log("\nExtracts readable content from a webpage as markdown.");
	console.log("\nExamples:");
	console.log("  content.js https://example.com/article");
	console.log("  content.js https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html");
	process.exit(1);
}

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

try {
	const response = await fetch(url, {
		headers: {
			"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			"Accept-Language": "en-US,en;q=0.9",
		},
		signal: AbortSignal.timeout(15000),
	});
	
	if (!response.ok) {
		console.error(`HTTP ${response.status}: ${response.statusText}`);
		process.exit(1);
	}
	
	const html = await response.text();
	const dom = new JSDOM(html, { url });
	const reader = new Readability(dom.window.document);
	const article = reader.parse();
	
	if (article && article.content) {
		if (article.title) {
			console.log(`# ${article.title}\n`);
		}
		console.log(htmlToMarkdown(article.content));
		process.exit(0);
	}
	
	// Fallback: try to extract main content
	const fallbackDoc = new JSDOM(html, { url });
	const body = fallbackDoc.window.document;
	body.querySelectorAll("script, style, noscript, nav, header, footer, aside").forEach(el => el.remove());
	
	const title = body.querySelector("title")?.textContent?.trim();
	const main = body.querySelector("main, article, [role='main'], .content, #content") || body.body;
	
	if (title) {
		console.log(`# ${title}\n`);
	}
	
	const text = main?.innerHTML || "";
	if (text.trim().length > 100) {
		console.log(htmlToMarkdown(text));
	} else {
		console.error("Could not extract readable content from this page.");
		process.exit(1);
	}
} catch (e) {
	console.error(`Error: ${e.message}`);
	process.exit(1);
}
