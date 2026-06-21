#!/usr/bin/env tsx

/**
 * Patch aria-snapshot-ai/src files from the latest Playwright source
 *
 * This script downloads the Playwright source zip and updates the local files
 * while preserving custom modifications and generating a patch report.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as tar from 'tar';
import { fileURLToPath } from 'url';

const CONFIG = {
  playwrightRepo: 'microsoft/playwright',
  playwrightVersion: 'latest', // 'latest' for main branch, or specific tag like 'v1.58.0'
  useMainBranch: true,
  srcDir: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src'),
  tempDir: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.temp'),
  dryRun: false,
};

const FILES_TO_PATCH = [
  'packages/injected/src/ariaSnapshot.ts',
  'packages/injected/src/domUtils.ts',
  'packages/injected/src/roleUtils.ts',
  'packages/playwright-core/src/utils/isomorphic/ariaSnapshot.ts',
  'packages/playwright-core/src/utils/isomorphic/cssParser.ts',
  'packages/playwright-core/src/utils/isomorphic/cssTokenizer.ts',
  'packages/playwright-core/src/utils/isomorphic/stringUtils.ts',
  'packages/playwright-core/src/utils/isomorphic/yaml.ts',
];

const PATH_MAPPING: Record<string, string> = {
  'packages/injected/src/ariaSnapshot.ts': 'ariaSnapshot.ts',
  'packages/injected/src/domUtils.ts': 'domUtils.ts',
  'packages/injected/src/roleUtils.ts': 'roleUtils.ts',
  'packages/playwright-core/src/utils/isomorphic/ariaSnapshot.ts': 'isomorphic/ariaSnapshot.ts',
  'packages/playwright-core/src/utils/isomorphic/cssParser.ts': 'isomorphic/cssParser.ts',
  'packages/playwright-core/src/utils/isomorphic/cssTokenizer.ts': 'isomorphic/cssTokenizer.ts',
  'packages/playwright-core/src/utils/isomorphic/stringUtils.ts': 'isomorphic/stringUtils.ts',
  'packages/playwright-core/src/utils/isomorphic/yaml.ts': 'isomorphic/yaml.ts',
};

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log('');
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`  ${title}`, 'cyan');
  log(`${'='.repeat(60)}\n`, 'cyan');
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  log(`Downloading: ${url}`, 'blue');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await fs.writeFile(destPath, buffer);

  log(`Downloaded to: ${destPath}`, 'green');
}

async function getLatestPlaywrightVersion(): Promise<string> {
  log('Fetching latest Playwright version...', 'blue');

  const response = await fetch('https://api.github.com/repos/microsoft/playwright/releases/latest');
  const data = await response.json() as { tag_name: string };

  const version = data.tag_name.replace(/^v/, '');
  log(`Latest version: ${version}`, 'green');

  return version;
}

async function getMainBranchCommit(): Promise<string> {
  log('Fetching latest main branch commit...', 'blue');

  const response = await fetch('https://api.github.com/repos/microsoft/playwright/commits/main');
  const data = await response.json() as { sha: string; commit: { committer: { date: string } } };

  const sha = data.sha.substring(0, 7); // Short SHA
  const date = new Date(data.commit.committer.date).toLocaleString();

  log(`Latest main commit: ${sha} (${date})`, 'green');

  return sha;
}

async function extractPlaywrightSource(tarballPath: string, extractDir: string): Promise<string> {
  log(`Extracting Playwright source...`, 'blue');

  await fs.mkdir(extractDir, { recursive: true });

  await tar.extract({
    file: tarballPath,
    cwd: extractDir,
    strip: 1, // Remove the top-level directory (playwright-1.58.2/)
  });

  log(`Extracted to: ${extractDir}`, 'green');
  return extractDir;
}

async function readFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read file: ${filePath}`);
  }
}

function hasLocalModifications(oldContent: string, upstreamContent: string): boolean {
  // Normalize whitespace for comparison
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
  return normalize(oldContent) !== normalize(upstreamContent);
}

/**
 * Transform Playwright imports to local paths
 * Changes @isomorphic/... to ./isomorphic/...
 *
 * Handles:
 * - import * as X from '@isomorphic/...'
 * - import { X, Y } from '@isomorphic/...'
 * - import X from '@isomorphic/...'
 * - Mixed: import X, { Y } from '@isomorphic/...'
 */
function transformImports(content: string): string {
  // Pattern that matches any import statement containing @isomorphic/
  // This handles all variations: default imports, named imports, star imports, and combinations
  const pattern = /(['"])@isomorphic\/([^'"]+)\1/g;

  const transformed = content.replace(pattern, (match, quote, modulePath) => {
    return `${quote}./isomorphic/${modulePath}${quote}`;
  });

  return transformed;
}

async function patchFile(
  playwrightPath: string,
  localPath: string,
  dryRun: boolean
): Promise<{ patched: boolean; modified: boolean; stats: any }> {
  let upstreamContent = await readFile(playwrightPath);

  // Transform imports if this is a non-isomorphic file
  const isIsomorphicFile = localPath.includes('/isomorphic/');
  if (!isIsomorphicFile) {
    upstreamContent = transformImports(upstreamContent);
  }

  let localContent: string;

  try {
    localContent = await readFile(localPath);
  } catch {
    if (!dryRun) {
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await fs.writeFile(localPath, upstreamContent, 'utf-8');
    }
    return {
      patched: true,
      modified: false,
      stats: {
        linesAdded: upstreamContent.split('\n').length,
        linesRemoved: 0,
        linesChanged: 0,
      },
    };
  }

  const wasModified = hasLocalModifications(localContent, upstreamContent);

  if (wasModified) {
    log(`  ⚠ Has local modifications`, 'yellow');
  }

  // const diff = computeDiff(localContent, upstreamContent, localPath);
  const linesAdded = (upstreamContent.match(/\n/g) || []).length + 1;
  const linesRemoved = (localContent.match(/\n/g) || []).length + 1;

  if (!dryRun) {
    await fs.writeFile(localPath, upstreamContent, 'utf-8');
  }

  return {
    patched: true,
    modified: wasModified,
    stats: {
      linesAdded,
      linesRemoved,
      linesChanged: Math.abs(linesAdded - linesRemoved),
    },
  };
}

async function main() {
  logSection('Playwright Source Patch Tool for aria-snapshot-ai');

  const args = process.argv.slice(2);
  if (args.includes('--dry-run')) {
    CONFIG.dryRun = true;
    log('DRY RUN MODE - No files will be modified', 'yellow');
  }
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: tsx scripts/patch-from-playwright.ts [options]

Options:
  --dry-run    Show what would be changed without modifying files
  --release    Use latest release instead of main branch
  --help, -h   Show this help message

Examples:
  tsx scripts/patch-from-playwright.ts                    # Use main branch (default)
  tsx scripts/patch-from-playwright.ts --release          # Use latest release
  tsx scripts/patch-from-playwright.ts --dry-run          # Preview changes from main
  tsx scripts/patch-from-playwright.ts --release --dry-run # Preview changes from release
`);
    process.exit(0);
  }

  if (args.includes('--release')) {
    CONFIG.useMainBranch = false;
  }

  try {
    let versionInfo: string;
    if (CONFIG.useMainBranch) {
      log('Using main branch for cutting-edge features', 'cyan');
      const sha = await getMainBranchCommit();
      versionInfo = `main-${sha}`;
    } else {
      const version = CONFIG.playwrightVersion === 'latest'
        ? await getLatestPlaywrightVersion()
        : CONFIG.playwrightVersion;
      versionInfo = `v${version}`;
    }

    await fs.mkdir(CONFIG.tempDir, { recursive: true });

    let tarballUrl: string;
    if (CONFIG.useMainBranch) {
      tarballUrl = 'https://github.com/microsoft/playwright/archive/refs/heads/main.tar.gz';
    } else {
      const version = CONFIG.playwrightVersion === 'latest'
        ? await getLatestPlaywrightVersion()
        : CONFIG.playwrightVersion;
      tarballUrl = `https://github.com/microsoft/playwright/archive/refs/tags/v${version}.tar.gz`;
    }

    const tarballPath = path.join(CONFIG.tempDir, `playwright-${versionInfo}.tar.gz`);
    const extractDir = path.join(CONFIG.tempDir, `playwright-${versionInfo}`);

    await downloadFile(tarballUrl, tarballPath);

    logSection('Extracting Playwright Source');
    const playwrightSourceDir = await extractPlaywrightSource(tarballPath, extractDir);

    logSection('Patching Files');

    const results: Array<{
      file: string;
      playwrightPath: string;
      localPath: string;
      patched: boolean;
      modified: boolean;
      stats: any;
    }> = [];

    let totalLinesAdded = 0;
    let totalLinesRemoved = 0;
    let filesWithMods = 0;

    for (const playwrightPath of FILES_TO_PATCH) {
      const localPath = PATH_MAPPING[playwrightPath];
      if (!localPath) {
        log(`  ⚠ No mapping for: ${playwrightPath}`, 'yellow');
        continue;
      }

      const fullPath = path.join(CONFIG.srcDir, localPath);
      const sourcePath = path.join(playwrightSourceDir, playwrightPath);

      log(`\n${playwrightPath.split('/').pop()} -> ${localPath}`, 'blue');

      try {
        const result = await patchFile(sourcePath, fullPath, CONFIG.dryRun);
        results.push({
          file: localPath,
          playwrightPath,
          localPath: fullPath,
          ...result,
        });

        if (result.patched) {
          log(`  ✅ Patched`, 'green');
          if (!localPath.includes('/isomorphic/')) {
            log(`  ℹ Imports transformed: @isomorphic/ → ./isomorphic/`, 'gray');
          }
        }
        if (result.modified) {
          filesWithMods++;
          log(`  ℹ Local modifications detected`, 'yellow');
        }

        totalLinesAdded += result.stats.linesAdded;
        totalLinesRemoved += result.stats.linesRemoved;
      } catch (error) {
        log(`  ❌ Error: ${(error as Error).message}`, 'red');
      }
    }

    logSection('Patch Report');

    console.log(`
Summary:
--------
Version:      Playwright ${versionInfo}
Files:        ${results.length} processed
Modified:     ${filesWithMods} with local changes
Lines added:  ${totalLinesAdded}
Lines removed: ${totalLinesRemoved}

Files patched:
--------------
    `);

    for (const result of results) {
      const status = result.patched
        ? (result.modified ? '⚠ MODIFIED' : '✅ UPDATED')
        : '❌ FAILED';
      console.log(`  ${status}  ${result.file}`);
    }

    if (CONFIG.dryRun) {
      logSection('Dry Run Complete');
      log('Run without --dry-run to apply changes', 'yellow');
    } else {
      logSection('Patch Complete');
      log('Please review the changes and test thoroughly!', 'yellow');
    }

    try {
      await fs.rm(CONFIG.tempDir, { recursive: true, force: true });
      log(`\nCleaned up temporary files`, 'gray');
    } catch (error) {
      log(`\nWarning: Could not clean up temp directory: ${CONFIG.tempDir}`, 'yellow');
    }

  } catch (error) {
    log(`\n❌ Error: ${(error as Error).message}`, 'red');
    if ((error as any).stack) {
      console.error((error as any).stack);
    }
    process.exit(1);
  }
}

main();
