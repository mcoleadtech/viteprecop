#!/usr/bin/env node
// Entry point for the vite-seo-bootstrap CLI.
// This script resolves the project directory, parses a simple
// --domain flag and defers to the implementation in src/index.mjs.

import { fileURLToPath } from 'url';
import path from 'path';
import { run } from '../src/index.mjs';

async function main() {
  const argv = process.argv.slice(2);
  // Determine the target directory. Default to the current working directory
  // if none is provided.
  const dirArg = argv.find(arg => !arg.startsWith('--'));
  const projectRoot = dirArg ? path.resolve(process.cwd(), dirArg) : process.cwd();

  // Parse an optional --domain flag. If not provided we fall back to a
  // placeholder domain. This makes it obvious in generated files that
  // the user should update it.
  const domainFlag = argv.find(arg => arg.startsWith('--domain='));
  const domain = domainFlag
    ? domainFlag.substring('--domain='.length)
    : 'https://yourdomain.com';

  // Determine strategy for SSG/prerender wiring. Accepts
  // --strategy=react (default) or --strategy=preact. Unknown
  // strategies will fall back to react.
  const strategyFlag = argv.find(arg => arg.startsWith('--strategy='));
  const strategy = strategyFlag
    ? strategyFlag.substring('--strategy='.length).toLowerCase()
    : 'react';

  try {
    await run({ projectRoot, domain, strategy });
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();