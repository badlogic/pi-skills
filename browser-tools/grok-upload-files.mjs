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
const grokPage = pages.find((p) => p.url().includes("grok.com"));

if (!grokPage) {
  console.error("✗ Grok.com tab not found");
  process.exit(1);
}

console.log("Found Grok tab");

// Click the Attach button
const attachButton = await grokPage.$('button[aria-label="Attach"]');
if (!attachButton) {
  console.error("✗ Attach button not found");
  process.exit(1);
}

console.log("Found attach button, clicking...");
await attachButton.click();

// Wait for menu to appear
await new Promise((r) => setTimeout(r, 500));

// Click "Upload a file" menu item
const uploadMenuItem = await grokPage.evaluateHandle(() => {
  const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
  return items.find((item) => item.textContent.includes("Upload a file"));
});

if (!uploadMenuItem) {
  console.error("✗ Upload a file menu item not found");
  process.exit(1);
}

console.log("Found upload menu item, clicking...");
await grokPage.evaluate((el) => el.click(), uploadMenuItem);

// Wait for file input to appear
await new Promise((r) => setTimeout(r, 500));

// Find file input and upload
const fileInput = await grokPage.$('input[type="file"]');
if (!fileInput) {
  console.error("✗ File input not found");
  process.exit(1);
}

console.log("Found file input, uploading files...");
await fileInput.uploadFile(...files);

console.log(`✓ Uploaded ${files.length} files to Grok`);
console.log("Files should appear in the chat");

await browser.disconnect();
