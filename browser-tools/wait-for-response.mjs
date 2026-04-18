#!/usr/bin/env node

import puppeteer from "puppeteer-core";
import fs from "fs";

const system = process.argv[2] || "thaura"; // claude, grok, or thaura
const logfile = process.argv[3] || `~/mg/logs/${system}-response.md`;
const expandedLogfile = logfile.replace("~", process.env.HOME);

const signoffs = {
  claude: "Claude is AI and can make mistakes",
  grok: "Upgrade to SuperGrok",
  thaura: "🌱",
};

const signoff = signoffs[system];
if (!signoff) {
  console.error(`✗ Unknown system: ${system}`);
  process.exit(1);
}

console.log(`⏱️  Waiting for ${system} response...`);
console.log(`📍 Watching for signoff: "${signoff}"`);

const startTime = Date.now();

const browser = await puppeteer.connect({
  browserURL: "http://localhost:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page = pages.find(
  (p) =>
    (system === "claude" && p.url().includes("claude.ai")) ||
    (system === "grok" && p.url().includes("grok.com")) ||
    (system === "thaura" && p.url().includes("thaura.ai"))
);

if (!page) {
  console.error(`✗ ${system} tab not found`);
  process.exit(1);
}

// Poll for signoff every 500ms
let lastLength = 0;
let pollCount = 0;
const maxPolls = 600; // 5 minutes max

const checkForSignoff = async () => {
  pollCount++;

  const text = await page.evaluate(() => document.body.innerText);

  if (text.includes(signoff)) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✓ Response complete in ${elapsed}s`);
    console.log(`📝 Extracting to ${expandedLogfile}...`);

    // Write to file
    fs.writeFileSync(expandedLogfile, text);
    console.log(`✓ Logged (${text.split("\n").length} lines)`);

    await browser.disconnect();
    process.exit(0);
  }

  // Show progress indicator
  if (text.length > lastLength) {
    process.stdout.write(".");
    lastLength = text.length;
  }

  if (pollCount >= maxPolls) {
    console.error(`\n✗ Timeout after 5 minutes`);
    process.exit(1);
  }

  setTimeout(checkForSignoff, 500);
};

checkForSignoff();
