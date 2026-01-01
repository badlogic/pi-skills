#!/usr/bin/env node

import { spawn, execSync } from "node:child_process";
import { platform } from "node:os";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

// Platform-specific Chrome executable paths
const CHROME_PATHS = {
	darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
	linux: [
		"/usr/bin/google-chrome",
		"/usr/bin/google-chrome-stable",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
		"/snap/bin/chromium",
	],
	win32: [
		"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
		"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
	],
};

// Platform-specific Chrome profile paths
const PROFILE_PATHS = {
	darwin: `${process.env.HOME}/Library/Application Support/Google/Chrome/`,
	linux: `${process.env.HOME}/.config/google-chrome/`,
	win32: `${process.env.LOCALAPPDATA}\\Google\\Chrome\\User Data\\`,
};

function findChrome() {
	const os = platform();
	const paths = CHROME_PATHS[os] || [];
	
	// Allow override via environment variable
	if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
		return process.env.CHROME_PATH;
	}
	
	for (const p of paths) {
		if (existsSync(p)) {
			return p;
		}
	}
	
	return null;
}

function getProfilePath() {
	const os = platform();
	// Allow override via environment variable
	if (process.env.CHROME_PROFILE_PATH) {
		return process.env.CHROME_PROFILE_PATH;
	}
	return PROFILE_PATHS[os] || PROFILE_PATHS.linux;
}

const useProfile = process.argv[2] === "--profile";

if (process.argv[2] && process.argv[2] !== "--profile") {
	console.log("Usage: browser-start.js [--profile]");
	console.log("\nOptions:");
	console.log("  --profile  Copy your default Chrome profile (cookies, logins)");
	process.exit(1);
}

const SCRAPING_DIR = `${process.env.HOME}/.cache/browser-tools`;

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

// Setup profile directory
execSync(`mkdir -p "${SCRAPING_DIR}"`, { stdio: "ignore" });

// Remove SingletonLock to allow new instance
try {
	execSync(`rm -f "${SCRAPING_DIR}/SingletonLock" "${SCRAPING_DIR}/SingletonSocket" "${SCRAPING_DIR}/SingletonCookie"`, { stdio: "ignore" });
} catch {}

if (useProfile) {
	console.log("Syncing profile...");
	const profilePath = getProfilePath();
	if (!existsSync(profilePath)) {
		console.error(`✗ Chrome profile not found at: ${profilePath}`);
		console.error("  Set CHROME_PROFILE_PATH environment variable to override");
		process.exit(1);
	}
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
			"${profilePath}" "${SCRAPING_DIR}/"`,
		{ stdio: "pipe" },
	);
}

// Find Chrome executable
const chromePath = findChrome();
if (!chromePath) {
	console.error("✗ Chrome/Chromium not found");
	console.error("  Install Chrome or set CHROME_PATH environment variable");
	process.exit(1);
}

// Start Chrome with flags to force new instance
spawn(
	chromePath,
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
