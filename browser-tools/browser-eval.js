#!/usr/bin/env node

import { parseArgs } from "node:util";
import { connectAndSelectPage } from "./lib/page-selection.js";

const { positionals } = parseArgs({
	args: process.argv.slice(2),
	options: {
		id: { type: 'string' },
		page: { type: 'string' },
	},
	allowPositionals: true,
});

const code = positionals.join(" ");
if (!code) {
	console.log("Usage: browser-eval.js 'code' [--id <targetId>] [--page <index>]");
	console.log("\nExamples:");
	console.log('  browser-eval.js "document.title"');
	console.log('  browser-eval.js "document.title" --id A5A3072972ABBE08577A7CD3F62DF08D');
	console.log('  browser-eval.js "document.querySelectorAll(\'a\').length" --page 0');
	process.exit(1);
}

const { browser: b, page: p } = await connectAndSelectPage(process.argv.slice(2));

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
