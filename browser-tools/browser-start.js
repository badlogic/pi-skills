#!/usr/bin/env node

import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const useProfile = process.argv[2] === "--profile";

if (process.argv[2] && process.argv[2] !== "--profile") {
	console.log("Usage: browser-start.js [--profile]");
	console.log("\nOptions:");
	console.log("  --profile  Copy your default Chrome profile (cookies, logins)");
	process.exit(1);
}

const SCRAPING_DIR = `${process.env.HOME}/.cache/browser-tools`;

// Resolve Chrome/Chromium executable path
function findChrome() {
	// 1. Environment variable override
	if (process.env.BROWSER_TOOLS_CHROME) {
		const envPath = process.env.BROWSER_TOOLS_CHROME;
		if (existsSync(envPath)) return envPath;
		console.error(`Warning: BROWSER_TOOLS_CHROME=${envPath} not found, falling back to default search`);
	}

	const platform = process.platform;

	// 2. Platform-specific default paths
	const defaultPaths = {
		darwin: [
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
			"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
		],
		win32: [
			"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
			"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
			"C:\\Program Files\\Chromium\\Application\\chrome.exe",
			"C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe",
			`${process.env.LOCALAPPDATA}\\Chromium\\Application\\chrome.exe`,
			`${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
			"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
		],
	};

	if (platform === "darwin" || platform === "win32") {
		for (const p of defaultPaths[platform]) {
			if (existsSync(p)) return p;
		}
	}

	// 3. Search PATH for common browser names
	const commands = {
		darwin: ["google-chrome", "google-chrome-stable", "chromium", "brave-browser", "microsoft-edge"],
		linux: ["google-chrome", "google-chrome-stable", "chromium-browser", "chromium", "brave-browser", "microsoft-edge", "yandex-browser"],
		win32: ["chrome", "chromium", "msedge", "brave"],
	};

	const candidates = commands[platform] || commands.linux;
	for (const cmd of candidates) {
		try {
			const which = platform === "win32"
				? execSync(`where ${cmd}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split("\n")[0]
				: execSync(`command -v ${cmd}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
			if (which && existsSync(which)) return which;
		} catch {
			// not found on PATH
		}
	}

	return null;
}

// Resolve default Chrome user data directory for the current platform
function defaultChromeProfileDir() {
	const home = process.env.HOME || process.env.USERPROFILE;
	switch (process.platform) {
		case "darwin":
			return `${home}/Library/Application Support/Google/Chrome`;
		case "win32":
			return `${process.env.LOCALAPPDATA}\\Google\\Chrome\\User Data`;
		default: // linux
			return `${home}/.config/google-chrome`;
	}
}

const chromePath = findChrome();
if (!chromePath) {
	console.error("Error: Could not find Chrome/Chromium executable.");
	console.error("Install Google Chrome, Chromium, or a Chromium-based browser.");
	console.error("You can also set the BROWSER_TOOLS_CHROME environment variable to specify the path explicitly.");
	process.exit(1);
}

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
	const profileDir = defaultChromeProfileDir();
	if (existsSync(profileDir)) {
		console.log("Syncing profile...");
		try {
			execSync(
				`cp -r ${profileDir}/* "${SCRAPING_DIR}/" 2>/dev/null; true`,
				{ stdio: "pipe" },
			);
		} catch {
			console.error("Warning: profile sync failed, continuing without profile");
		}
	} else {
		console.error("Warning: Chrome profile not found at", profileDir);
	}
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