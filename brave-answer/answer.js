#!/usr/bin/env node

const args = process.argv.slice(2);

// Parse boolean flags
const researchIndex = args.indexOf("--research");
const research = researchIndex !== -1;
if (research) args.splice(researchIndex, 1);

const rawIndex = args.indexOf("--raw");
const raw = rawIndex !== -1;
if (raw) args.splice(rawIndex, 1);

// Parse country option
let country = "US";
const countryIndex = args.indexOf("--country");
if (countryIndex !== -1 && args[countryIndex + 1]) {
	country = args[countryIndex + 1].toUpperCase();
	args.splice(countryIndex, 2);
}

// Parse language option
let language = "en";
const languageIndex = args.indexOf("--language");
if (languageIndex !== -1 && args[languageIndex + 1]) {
	language = args[languageIndex + 1].toLowerCase();
	args.splice(languageIndex, 2);
}

const question = args.join(" ");

if (!question) {
	console.log("Usage: answer.js <question> [--research] [--raw] [--country <code>] [--language <code>]");
	console.log("\nOptions:");
	console.log("  --research          Multi-search deep mode (slow, can take minutes)");
	console.log("  --raw               Print raw API content with citation tags intact");
	console.log("  --country <code>    Two-letter country code (default: US)");
	console.log("  --language <code>   Two-letter language code (default: en)");
	console.log("\nEnvironment:");
	console.log("  BRAVE_ANSWER_API_KEY  Required. Your Brave Search API key with Answers tier.");
	console.log("\nExamples:");
	console.log('  answer.js "what is the latest stable release of Bun?"');
	console.log('  answer.js "summarize the 2026 EU AI Act timeline" --research');
	console.log('  answer.js "current state of WebGPU in Safari" --country GB');
	process.exit(1);
}

const apiKey = process.env.BRAVE_ANSWER_API_KEY;
if (!apiKey) {
	console.error("Error: BRAVE_ANSWER_API_KEY environment variable is required.");
	console.error("Get your API key at: https://api-dashboard.search.brave.com/app/keys");
	process.exit(1);
}

async function fetchBraveAnswer(question, { research, country, language }) {
	const body = {
		model: "brave",
		stream: true,
		messages: [{ role: "user", content: question }],
	};
	// Research mode is incompatible with enable_citations (API returns 422).
	// Citations are returned inline in research mode; non-research mode needs the flag.
	if (research) body.enable_research = true;
	else body.enable_citations = true;
	body.country = country;
	body.language = language;

	const response = await fetch("https://api.search.brave.com/res/v1/chat/completions", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Accept": "text/event-stream",
			"x-subscription-token": apiKey,
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`HTTP ${response.status}: ${response.statusText}\n${errorText}`);
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let content = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		let nl;
		while ((nl = buffer.indexOf("\n")) !== -1) {
			const line = buffer.slice(0, nl).trim();
			buffer = buffer.slice(nl + 1);
			if (!line.startsWith("data:")) continue;
			const payload = line.slice(5).trim();
			if (payload === "[DONE]") continue;
			try {
				const evt = JSON.parse(payload);
				const delta = evt?.choices?.[0]?.delta?.content;
				if (typeof delta === "string") content += delta;
			} catch {
				// ignore malformed chunks
			}
		}
	}

	return content;
}

function parseAnswer(content) {
	// Research mode wraps the synthesized answer in <answer>{"answer": "..."}</answer>
	// and does not return per-claim citations.
	const answerMatch = content.match(/<answer>([\s\S]*?)<\/answer>/);
	if (answerMatch) {
		try {
			const { answer } = JSON.parse(answerMatch[1]);
			return { prose: (answer || "").trim(), citations: new Map() };
		} catch {
			// fall through to citation parsing
		}
	}

	// Standard mode: <citation>{json}</citation> tags inline in the prose.
	const citations = new Map();
	let prose = content.replace(/<citation>([\s\S]*?)<\/citation>/g, (_, json) => {
		try {
			const c = JSON.parse(json);
			const n = c.number ?? citations.size + 1;
			if (!citations.has(n)) citations.set(n, { url: c.url, snippet: c.snippet });
			return `[${n}]`;
		} catch {
			return "";
		}
	});

	// Strip internal/metadata tags emitted by either mode.
	for (const tag of ["enum_item", "usage", "queries", "analyzing", "thinking", "progress", "blindspots"]) {
		prose = prose.replace(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "g"), "");
	}
	prose = prose.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
	return { prose, citations };
}

// Main
try {
	const content = await fetchBraveAnswer(question, { research, country, language });

	if (raw) {
		process.stdout.write(content + "\n");
		process.exit(0);
	}

	const { prose, citations } = parseAnswer(content);

	console.log(prose);

	if (citations.size > 0) {
		console.log("\n--- Sources ---");
		const sorted = [...citations.entries()].sort((a, b) => a[0] - b[0]);
		for (const [n, c] of sorted) {
			console.log(`[${n}] ${c.url}`);
			if (c.snippet) console.log(`    ${c.snippet.replace(/\s+/g, " ").trim().slice(0, 200)}`);
		}
	}
} catch (e) {
	console.error(`Error: ${e.message}`);
	process.exit(1);
}
