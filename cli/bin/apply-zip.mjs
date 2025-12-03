#!/usr/bin/env node
/**
 * Apply vite-seo-bootstrap to a zipped Vite project.
 *
 * This helper script accepts a path to a zip archive containing a Vite project,
 * extracts it to a temporary directory, runs the vite-seo-bootstrap CLI on
 * the extracted directory, and then re-compresses the modified project into
 * a new archive alongside the original.  The output archive name is derived
 * from the input name with `-seo-ssg.zip` appended.
 *
 * Usage:
 *   node apply-zip.mjs path/to/project.zip --domain=https://example.com [--strategy=react|preact]
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Resolve the directory containing this script to find cli.mjs
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function usage() {
  console.error(
    `Usage: ${path.basename(process.argv[1])} <zip-file> [--domain=<url>] [--strategy=react|preact]`,
  );
  console.error(
    'Applies vite-seo-bootstrap to the given Vite project zip and produces a new zip with SEO/SSG wiring.',
  );
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) usage();

  const zipArg = args[0];
  const zipPath = path.resolve(zipArg);
  if (!fs.existsSync(zipPath)) {
    console.error('Error: specified file does not exist.');
    process.exit(1);
  }
  // Allow any filename; if it lacks .zip extension we'll still proceed.

  // Extract domain and strategy flags
  let domain = 'https://example.com';
  let strategy = 'react';
  let buildFlag = false;
  for (const arg of args.slice(1)) {
    if (arg.startsWith('--domain=')) {
      domain = arg.replace('--domain=', '');
    } else if (arg.startsWith('--strategy=')) {
      strategy = arg.replace('--strategy=', '');
    } else if (arg === '--build') {
      buildFlag = true;
    }
  }

  // Prepare temp directory for extraction
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-seo-bootstrap-zip-'));
  // Extract zip contents to tempDir
  try {
    execSync(`unzip -qq '${zipPath}' -d '${tempDir}'`);
  } catch (err) {
    console.error(`Error extracting zip: ${err.message}`);
    process.exit(1);
  }

  // Run vite-seo-bootstrap CLI on the extracted project
  const cliPath = path.join(__dirname, 'cli.mjs');
  try {
    execSync(
      `node '${cliPath}' '${tempDir}' --domain='${domain}' --strategy=${strategy}`,
      {
        stdio: 'inherit',
      },
    );
  } catch (err) {
    console.error(`Error running vite-seo-bootstrap: ${err.message}`);
    process.exit(1);
  }

  // Patch package.json to ensure vite-bundle-visualizer uses a valid version.
  // Some versions of the generator may pin to an invalid version (e.g. ^1.9.0).
  const pkgPath = path.join(tempDir, 'package.json');
  try {
    const pkgRaw = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(pkgRaw);
    let patched = false;
    const fixVersion = (deps) => {
      if (!deps) return;
      const key = 'vite-bundle-visualizer';
      if (deps[key] && /^\^?1\.\d+\.\d+/.test(deps[key]) === false) {
        // Replace any invalid version with the latest 1.2.x range
        deps[key] = '^1.2.1';
        patched = true;
      }
    };
    fixVersion(pkg.dependencies);
    fixVersion(pkg.devDependencies);
    if (patched) {
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
      console.warn(
        '· Patched vite-bundle-visualizer version in generated package.json to ^1.2.1',
      );
    }
  } catch {
    // ignore if package.json missing or cannot parse
  }
  // Optionally perform npm install and build if --build flag is provided
  if (buildFlag) {
    try {
      console.log('· Installing dependencies...');
      execSync('npm install', { cwd: tempDir, stdio: 'inherit' });
      console.log('· Running build...');
      execSync('npm run build', { cwd: tempDir, stdio: 'inherit' });
    } catch (err) {
      console.error('Error during install/build:', err.message);
      // Do not exit; continue to package the project
    }
  }

  // Create output zip name
  const { name: baseName, dir: baseDir } = path.parse(zipPath);
  const outputName = `${baseName}-seo-ssg.zip`;
  const outputPath = path.join(baseDir, outputName);

  // Re-compress the modified project
  try {
    execSync(`cd '${tempDir}' && zip -rq '${outputPath}' .`);
  } catch (err) {
    console.error(`Error creating output zip: ${err.message}`);
    process.exit(1);
  }

  console.log(`Created optimized zip: ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});