#!/usr/bin/env node

import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { connectAndSelectPage } from "./lib/page-selection.js";

const SCREENSHOT_TIMEOUT = 15000;

const { browser: b, page: p } = await connectAndSelectPage(process.argv.slice(2));

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const filename = `screenshot-${timestamp}.png`;
const filepath = join(tmpdir(), filename);

let client;
try {
	await p.bringToFront();
	client = await p.createCDPSession();
	await client.send('Page.bringToFront');
	const { data } = await Promise.race([
		client.send('Page.captureScreenshot', { format: 'png', fromSurface: true }),
		new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout after ${SCREENSHOT_TIMEOUT / 1000}s`)), SCREENSHOT_TIMEOUT)),
	]);
	await writeFile(filepath, Buffer.from(data, 'base64'));
	console.log(filepath);
} catch (e) {
	console.error("✗ Could not capture screenshot:", e.message);
	console.error("  Try browser-page-structure.js --boxes, or inspect with browser-eval.js.");
	await b.disconnect();
	process.exit(1);
} finally {
	if (client) {
		try {
			await client.detach();
		} catch {}
		}
}

await b.disconnect();
