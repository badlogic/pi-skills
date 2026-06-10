#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import { google } from 'googleapis';
import { authenticate } from '@google-cloud/local-auth';
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const args = process.argv.slice(2);

const contentIndex = args.indexOf("--content");
const fetchContent = contentIndex !== -1;
if (fetchContent) args.splice(contentIndex, 1);

let numResults = 5;
const nIndex = args.indexOf("-n");
if (nIndex !== -1 && args[nIndex + 1]) {
	numResults = parseInt(args[nIndex + 1], 10);
	args.splice(nIndex, 2);
}

const query = args.join(" ");

if (!query) {
	console.log("Usage: search.js <query> [-n <num>] [--content]");
	console.log("\nOptions:");
	console.log("  -n <num>              Number of results (default: 5, max: 10)");
	console.log("  --content             Fetch readable content as markdown");
	console.log("\nEnvironment:");
	console.log("  GOOGLE_SEARCH_CX      Required. Your Google Custom Search Engine ID.");
	console.log("\nSetup:");
	console.log("  Place your OAuth client credentials JSON at ~/.google-search/credentials.json");
	process.exit(1);
}

const CX = process.env.GOOGLE_SEARCH_CX;
if (!CX) {
	console.error("Error: GOOGLE_SEARCH_CX environment variable is required.");
	process.exit(1);
}

const TOKEN_PATH = path.join(os.homedir(), '.google-search', 'token.json');
const CREDENTIALS_PATH = path.join(os.homedir(), '.google-search', 'credentials.json');

async function getAuthenticatedClient() {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        throw new Error(`Credentials file not found at ${CREDENTIALS_PATH}. Please follow the setup instructions in SKILL.md.`);
    }

    // Attempt to load existing token
    if (fs.existsSync(TOKEN_PATH)) {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        const client = google.auth.fromJSON(JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8')));
        client.setCredentials(token);
        return client;
    }

    // Start local OAuth flow
    console.log('No token found. Starting OAuth flow...');
    const client = await authenticate({
        keyfilePath: CREDENTIALS_PATH,
        scopes: ['https://www.googleapis.com/auth/cse'],
    });

    if (client.credentials) {
        fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(client.credentials));
        console.log(`Token saved to ${TOKEN_PATH}`);
    }

    return client;
}

async function fetchGoogleResults(auth, query, numResults) {
    const customsearch = google.customsearch('v1');
    const res = await customsearch.cse.list({
        auth,
        cx: CX,
        q: query,
        num: Math.min(numResults, 10),
    });

    if (!res.data.items) return [];

    return res.data.items.map(item => ({
        title: item.title || "",
        link: item.link || "",
        snippet: item.snippet || "",
    }));
}

function htmlToMarkdown(html) {
	const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
	turndown.use(gfm);
	return turndown
		.turndown(html)
		.replace(/\[\\?\[\s*\\?\]\]\([^)]*\)/g, "")
		.replace(/ +/g, " ")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

async function fetchPageContent(url) {
	try {
		const response = await fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
				"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			},
			signal: AbortSignal.timeout(10000),
		});

		if (!response.ok) return `(HTTP ${response.status})`;

		const html = await response.text();
		const dom = new JSDOM(html, { url });
		const reader = new Readability(dom.window.document);
		const article = reader.parse();

		if (article && article.content) {
			return htmlToMarkdown(article.content).substring(0, 5000);
		}

		return "(Could not extract content)";
	} catch (e) {
		return `(Error: ${e.message})`;
	}
}

try {
    const auth = await getAuthenticatedClient();
	const results = await fetchGoogleResults(auth, query, numResults);

	if (results.length === 0) {
		console.error("No results found.");
		process.exit(0);
	}

	if (fetchContent) {
		for (const result of results) {
			result.content = await fetchPageContent(result.link);
		}
	}

	for (let i = 0; i < results.length; i++) {
		const r = results[i];
		console.log(`--- Result ${i + 1} ---`);
		console.log(`Title: ${r.title}`);
		console.log(`Link: ${r.link}`);
		console.log(`Snippet: ${r.snippet}`);
		if (r.content) {
			console.log(`Content:\n${r.content}`);
		}
		console.log("");
	}
} catch (e) {
	console.error(`Error: ${e.message}`);
	process.exit(1);
}
