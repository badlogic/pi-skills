#!/usr/bin/env node

import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { connectAndSelectPage } from "./lib/page-selection.js";

const SCREENSHOT_TIMEOUT = 15000;

const argv = process.argv.slice(2);
const fullPage = argv.includes('--full');
const { browser: b, page: p } = await connectAndSelectPage(argv);

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const filename = `screenshot-${timestamp}.png`;
const filepath = join(tmpdir(), filename);

let client;
try {
	client = await p.createCDPSession();
	const capturePromise = (async () => {
		if (!fullPage) {
			return client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
		}

		const { contentSize } = await client.send('Page.getLayoutMetrics');
		const clip = {
			x: 0,
			y: 0,
			width: Math.ceil(contentSize.width),
			height: Math.ceil(contentSize.height),
			scale: 1,
		};
		return client.send('Page.captureScreenshot', {
			format: 'png',
			fromSurface: true,
			clip,
		});
	})();

	const { data } = await Promise.race([
		capturePromise,
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
