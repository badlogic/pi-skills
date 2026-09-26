#!/usr/bin/env node

import { spawn, execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const useProfile = args.includes("--profile");
const headless = args.includes("--headless");

const unknown = args.filter((a) => a !== "--profile" && a !== "--headless");
if (unknown.length) {
	console.log("Usage: browser-start.js [--profile] [--headless]");
	console.log("\nOptions:");
	console.log("  --profile  Copy your default Chrome profile (cookies, logins)");
	console.log("  --headless Run without a visible window (for scripted capture)");
	process.exit(1);
}

const SCRAPING_DIR = `${homedir()}/.cache/browser-tools`;

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

// ── Locate a Chrome/Chromium binary ──────────────────────────────────────────
// Order: CHROME_PATH env → common install paths → puppeteer/playwright caches
// → macOS bundle. Works on Linux, macOS and Windows.
function findChrome() {
	const fromEnv = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
	if (fromEnv && existsSync(fromEnv)) return fromEnv;

	const fixed = [
		"/usr/bin/google-chrome",
		"/usr/bin/google-chrome-stable",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
		"/snap/bin/chromium",
		"/opt/google/chrome/chrome",
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
		"C:/Program Files/Google/Chrome/Application/chrome.exe",
		"C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
	];
	for (const p of fixed) if (existsSync(p)) return p;

	// Versioned cache dirs, newest first.
	const caches = [
		`${homedir()}/.cache/puppeteer/chrome`,
		`${homedir()}/.cache/ms-playwright`,
	];
	const found = [];
	for (const base of caches) {
		if (!existsSync(base)) continue;
		let entries = [];
		try {
			entries = readdirSync(base);
		} catch {
			continue;
		}
		for (const entry of entries.sort().reverse()) {
			const dir = join(base, entry);
			for (const rel of [
				"chrome-linux64/chrome",
				"chrome-linux/chrome",
				"chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
				"chrome-win/chrome.exe",
			]) {
				const p = join(dir, rel);
				if (existsSync(p)) found.push(p);
			}
		}
	}
	return found[0] || null;
}

const chromePath = findChrome();
if (!chromePath) {
	console.error("✗ Could not find a Chrome/Chromium binary.");
	console.error("  Install one, or set CHROME_PATH=/path/to/chrome");
	process.exit(1);
}
console.log(`Using Chrome: ${chromePath}`);

// Setup profile directory
execSync(`mkdir -p "${SCRAPING_DIR}"`, { stdio: "ignore" });

// Remove SingletonLock to allow new instance
try {
	execSync(`rm -f "${SCRAPING_DIR}/SingletonLock" "${SCRAPING_DIR}/SingletonSocket" "${SCRAPING_DIR}/SingletonCookie"`, { stdio: "ignore" });
} catch {}

// Default profile location per platform
const profileSrc = {
	darwin: `${homedir()}/Library/Application Support/Google/Chrome/`,
	win32: `${homedir()}/AppData/Local/Google/Chrome/User Data/`,
	linux: `${homedir()}/.config/google-chrome/`,
}[platform()] || `${homedir()}/.config/google-chrome/`;

if (useProfile) {
	if (!existsSync(profileSrc)) {
		console.error(`✗ No Chrome profile at ${profileSrc}`);
		process.exit(1);
	}
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
			"${profileSrc}" "${SCRAPING_DIR}/"`,
		{ stdio: "pipe" },
	);
}

const chromeArgs = [
	"--remote-debugging-port=9222",
	`--user-data-dir=${SCRAPING_DIR}`,
	"--no-first-run",
	"--no-default-browser-check",
];
if (headless) chromeArgs.push("--headless=new");

spawn(chromePath, chromeArgs, { detached: true, stdio: "ignore" }).unref();

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

console.log(
	`✓ Chrome started on :9222${useProfile ? " with your profile" : ""}${headless ? " (headless)" : ""}`,
);
