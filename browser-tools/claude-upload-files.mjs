#!/usr/bin/env node

import puppeteer from "puppeteer-core";

const files = [
  "/Users/tonyday567/mg/word/jsv-1996.md",
  "/Users/tonyday567/mg/word/hasegawa-1997.md",
  "/Users/tonyday567/mg/loom/claude-axiom-alignment.md",
];

const browser = await puppeteer.connect({
  browserURL: "http://localhost:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const claudePage = pages.find((p) => p.url().includes("claude.ai"));

if (!claudePage) {
  console.error("✗ Claude.ai tab not found");
  process.exit(1);
}

console.log("Found Claude tab");

// Find the file input
const fileInput = await claudePage.$('input[type="file"]');
if (!fileInput) {
  console.error("✗ File input not found");
  process.exit(1);
}

console.log("Found file input, uploading files...");

// Upload all files
await fileInput.uploadFile(...files);

console.log(`✓ Uploaded ${files.length} files to Claude`);
console.log("Files should appear in the chat input area");

await browser.disconnect();
