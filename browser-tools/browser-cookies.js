#!/usr/bin/env node

import { connectAndSelectPage } from "./lib/page-selection.js";

const { browser: b, page: p } = await connectAndSelectPage(process.argv.slice(2));

const cookies = await p.cookies();

for (const cookie of cookies) {
	console.log(`${cookie.name}: ${cookie.value}`);
	console.log(`  domain: ${cookie.domain}`);
	console.log(`  path: ${cookie.path}`);
	console.log(`  httpOnly: ${cookie.httpOnly}`);
	console.log(`  secure: ${cookie.secure}`);
	console.log("");
}

await b.disconnect();
