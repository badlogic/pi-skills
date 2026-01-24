#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const HOME_DIR = process.env.HOME ?? "";
const CHROME_DIR = path.join(HOME_DIR, "Library/Application Support/Google/Chrome");
const LOCAL_STATE_PATH = path.join(CHROME_DIR, "Local State");

const readJson = (filePath) => {
	try {
		return JSON.parse(fs.readFileSync(filePath, "utf8"));
	} catch {
		return null;
	}
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

const profiles = formatProfileList(getProfileEntries());

if (!profiles.length) {
	console.error("✗ No Chrome profiles found.");
	process.exit(1);
}

for (const profile of profiles) {
	console.log(profile);
}
