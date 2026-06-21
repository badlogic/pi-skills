#!/usr/bin/env node

import { spawn, execSync } from "node:child_process";
import { platform } from "node:os";
import puppeteer from "puppeteer-core";

const useProfile = process.argv[2] === "--profile";

if (process.argv[2] && process.argv[2] !== "--profile") {
	console.log("Usage: browser-start.js [--profile]");
	console.log("\nOptions:");
	console.log("  --profile  Copy your default Chrome profile (cookies, logins)");
	process.exit(1);
}

const isMac = platform() === "darwin";
const SCRAPING_DIR = `${process.env.HOME}/.cache/browser-tools`;

const CHROME_PATH = isMac
	? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
	: (() => {
		// Try common Linux Chrome locations
		for (const cmd of ["google-chrome-stable", "google-chrome", "chromium-browser", "chromium"]) {
			try {
				return execSync(`which ${cmd}`, { stdio: "pipe" }).toString().trim();
			} catch {}
		}
		return null;
	})();

const PROFILE_DIR = isMac
	? `${process.env.HOME}/Library/Application Support/Google/Chrome/`
	: `${process.env.HOME}/.config/google-chrome/`;

// Check if already running on :9222
try {
	const browser = await puppeteer.connect({
		browserURL: "http://localhost:9222",
		defaultViewport: null,
	});
	await browser.disconnect();
	console.log("✓ Chrome already running on :9222");
	process.exit(0);
} catch {}

if (!CHROME_PATH) {
	console.error("✗ Chrome not found. Install Google Chrome or Chromium.");
	process.exit(1);
}

// Setup profile directory
execSync(`mkdir -p "${SCRAPING_DIR}"`, { stdio: "ignore" });

// Remove SingletonLock to allow new instance
try {
	execSync(`rm -f "${SCRAPING_DIR}/SingletonLock" "${SCRAPING_DIR}/SingletonSocket" "${SCRAPING_DIR}/SingletonCookie"`, { stdio: "ignore" });
} catch {}

if (useProfile) {
	console.log("Syncing profile...");
	execSync(
		`rsync -a --delete \
			--exclude='SingletonLock' \
			--exclude='SingletonSocket' \
			--exclude='SingletonCookie' \
			--exclude='*/Sessions/*' \
			--exclude='*/Current Session' \
			--exclude='*/Current Tabs' \
			--exclude='*/Last Session' \
			--exclude='*/Last Tabs' \
			"${PROFILE_DIR}" "${SCRAPING_DIR}/"`,
		{ stdio: "pipe" },
	);
}

// Start Chrome with flags to force new instance
spawn(
	CHROME_PATH,
	[
		"--remote-debugging-port=9222",
		`--user-data-dir=${SCRAPING_DIR}`,
		"--no-first-run",
		"--no-default-browser-check",
	],
	{ detached: true, stdio: "ignore" },
).unref();

// Wait for Chrome to be ready
let connected = false;
for (let i = 0; i < 30; i++) {
	try {
		const browser = await puppeteer.connect({
			browserURL: "http://localhost:9222",
			defaultViewport: null,
		});
		await browser.disconnect();
		connected = true;
		break;
	} catch {
		await new Promise((r) => setTimeout(r, 500));
	}
}

if (!connected) {
	console.error("✗ Failed to connect to Chrome");
	process.exit(1);
}

console.log(`✓ Chrome started on :9222${useProfile ? " with your profile" : ""}`);
