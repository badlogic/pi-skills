#!/usr/bin/env node

import puppeteer from "puppeteer-core";

const files = [
  "/Users/tonyday567/mg/loom/yarn-narrative.md",
  "/Users/tonyday567/mg/loom/yarn-axioms.md",
  "/Users/tonyday567/mg/logs/yarn-summary-brief.md",
  "/Users/tonyday567/mg/loom/yarn-prompt.md",
];

const browser = await puppeteer.connect({
  browserURL: "http://localhost:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const thauraPage = pages.find((p) => p.url().includes("thaura.ai"));

if (!thauraPage) {
  console.error("✗ Thaura.ai tab not found");
  process.exit(1);
}

console.log("Found Thaura tab");

// Find file input and upload
const fileInput = await thauraPage.$('input[type="file"]');
if (!fileInput) {
  console.error("✗ File input not found");
  process.exit(1);
}

console.log("Found file input, uploading files...");
await fileInput.uploadFile(...files);

console.log(`✓ Uploaded ${files.length} files to Thaura`);
console.log("Files should appear in the chat");

await browser.disconnect();
