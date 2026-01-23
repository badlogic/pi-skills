#!/usr/bin/env node

import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);

const usage = () => {
	console.log("Usage: browser-start.js [--profile[=name]]");
	console.log("\nOptions:");
	console.log("  --profile [name]  Copy your Chrome profile (cookies, logins).");
	console.log("                    If name is omitted, use the last used profile.");
	process.exit(1);
};

let useProfile = false;
let requestedProfile = null;

if (args.length > 0) {
	const [first, ...rest] = args;
	if (first === "--profile") {
		useProfile = true;
		if (rest.length > 1) {
			usage();
		}
		requestedProfile = rest[0] ?? null;
	} else if (first.startsWith("--profile=")) {
		useProfile = true;
		if (rest.length > 0) {
			usage();
		}
		requestedProfile = first.slice("--profile=".length) || null;
	} else {
		usage();
	}
}

const HOME_DIR = process.env.HOME ?? "";
const CHROME_DIR = path.join(HOME_DIR, "Library/Application Support/Google/Chrome");
const LOCAL_STATE_PATH = path.join(CHROME_DIR, "Local State");
const SCRAPING_DIR = path.join(HOME_DIR, ".cache/browser-tools");

const readJson = (filePath) => {
	try {
		return JSON.parse(fs.readFileSync(filePath, "utf8"));
	} catch {
		return null;
	}
};

const getLastUsedProfileDir = () => {
	const localState = readJson(LOCAL_STATE_PATH);
	return (
		localState?.profile?.last_used ||
		localState?.profile?.last_active_profiles?.[0] ||
		"Default"
	);
};

const getProfileEntries = () => {
	const entries = [];
	let dirs = [];

	try {
		dirs = fs.readdirSync(CHROME_DIR, { withFileTypes: true });
	} catch {
		return entries;
	}

	for (const entry of dirs) {
		if (!entry.isDirectory()) continue;
		const prefPath = path.join(CHROME_DIR, entry.name, "Preferences");
		if (!fs.existsSync(prefPath)) continue;
		const pref = readJson(prefPath);
		const profileName = pref?.profile?.name ?? entry.name;
		entries.push({ dir: entry.name, name: profileName ?? entry.name });
	}

	const localState = readJson(LOCAL_STATE_PATH);
	const infoCache = localState?.profile?.info_cache ?? {};
	for (const [dir, info] of Object.entries(infoCache)) {
		if (!info?.name) continue;
		const existing = entries.find((entry) => entry.dir === dir);
		if (existing) {
			existing.name = info.name;
		}
	}

	return entries;
};

const formatProfileList = (entries) =>
	entries
		.map((entry) => `${entry.name} (${entry.dir})`)
		.sort();

const parseProfileDescriptor = (value) => {
	if (!value) return null;
	const match = value.match(/^(.*)\s+\(([^)]+)\)$/);
	if (!match) return null;
	const name = match[1].trim();
	const dir = match[2].trim();
	if (!name || !dir) return null;
	return { name, dir };
};

const resolveProfile = (requestedName) => {
	const entries = getProfileEntries();
	const trimmed = requestedName?.trim();

	if (trimmed) {
		const descriptor = parseProfileDescriptor(trimmed);
		if (descriptor) {
			const match = entries.find(
				(entry) => entry.dir === descriptor.dir && entry.name === descriptor.name,
			);
			if (match) {
				return { profileDir: match.dir, profileName: match.name };
			}
		}

		const dirMatch = entries.find((entry) => entry.dir === trimmed);
		if (dirMatch) {
			return { profileDir: dirMatch.dir, profileName: dirMatch.name };
		}

		const nameMatches = entries.filter((entry) => entry.name === trimmed);
		if (nameMatches.length === 1) {
			return { profileDir: nameMatches[0].dir, profileName: nameMatches[0].name };
		}
		if (nameMatches.length > 1) {
			console.error(`✗ Profile name "${requestedName}" is ambiguous.`);
			console.error("Matches:");
			for (const match of nameMatches) {
				console.error(`  - ${match.name} (${match.dir})`);
			}
			console.error("Use --profile \"Name (Profile X)\" or --profile \"Profile X\" to select a directory.");
			process.exit(1);
		}

		const available = formatProfileList(entries);

		console.error(`✗ Unknown Chrome profile "${requestedName}".`);
		if (available.length) {
			console.error("Available profiles:");
			for (const entry of available) {
				console.error(`  - ${entry}`);
			}
		}
		process.exit(1);
	}

	const lastUsedDir = getLastUsedProfileDir();
	const lastEntry = entries.find((entry) => entry.dir === lastUsedDir);
	return { profileDir: lastUsedDir, profileName: lastEntry?.name ?? lastUsedDir };
};

const formatProfileLabel = (profileName, profileDir) => {
	if (!profileName && !profileDir) return null;
	if (profileName && profileDir && profileName !== profileDir) {
		return `${profileName} (${profileDir})`;
	}
	return profileName ?? profileDir;
};

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

let profileDir = null;
let profileName = null;
let profileLabel = null;

if (useProfile) {
	({ profileDir, profileName } = resolveProfile(requestedProfile));
	profileLabel = formatProfileLabel(profileName, profileDir);
}

// Setup profile directory
execSync(`mkdir -p "${SCRAPING_DIR}"`, { stdio: "ignore" });

// Remove SingletonLock to allow new instance
try {
	execSync(
		`rm -f "${SCRAPING_DIR}/SingletonLock" "${SCRAPING_DIR}/SingletonSocket" "${SCRAPING_DIR}/SingletonCookie"`,
		{ stdio: "ignore" },
	);
} catch {}

if (useProfile) {
	console.log(`Syncing profile${profileLabel ? ` (${profileLabel})` : ""}...`);
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
			"${CHROME_DIR}/" "${SCRAPING_DIR}/"`,
		{ stdio: "pipe" },
	);
}

// Start Chrome with flags to force new instance
const chromeArgs = [
	"--remote-debugging-port=9222",
	`--user-data-dir=${SCRAPING_DIR}`,
	"--no-first-run",
	"--no-default-browser-check",
];

if (useProfile && profileDir) {
	chromeArgs.push(`--profile-directory=${profileDir}`);
}

spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", chromeArgs, {
	detached: true,
	stdio: "ignore",
}).unref();

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

console.log(`✓ Chrome started on :9222${useProfile ? ` with profile ${profileLabel ?? "Default"}` : ""}`);
