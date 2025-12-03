// Main entry point for the vite-seo-bootstrap library.
// Exports a single async function `run` that performs all
// modifications to the target Vite project. The goal of this module
// is to be self‑contained, avoid external dependencies and provide
// clear logging for the user.

import fs from 'fs/promises';
import path from 'path';
import { applyReactSsgSeo } from './generators/react-ssg.mjs';

// Simple helpers to colourise terminal output without external deps.
const colours = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

function colourise(str, colour) {
  return colours[colour] + str + colours.reset;
}

/**
 * The main entry point invoked by the CLI. It performs a series of
 * sanity checks on the target project (e.g. existence of package.json),
 * infers whether it's a React project, and applies the React + SSG
 * presets. Logging is kept simple so it still works in environments
 * without TTY capabilities.
 *
 * @param {Object} options
 * @param {string} options.projectRoot Absolute path to the project root
 * @param {string} options.domain Base URL used for the sitemap and canonical URLs
 */
export async function run({ projectRoot, domain, strategy = 'react' }) {
  console.log(colourise('\n🔧 Vite SEO Bootstrap', 'cyan'));
  console.log('  Project:', projectRoot);
  console.log('  Domain: ', domain);

  // Ensure package.json exists in the target directory
  const pkgPath = path.join(projectRoot, 'package.json');
  let pkg;
  try {
    const raw = await fs.readFile(pkgPath, 'utf8');
    pkg = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Could not read package.json from ${projectRoot}. Ensure you are pointing to the root of a Vite project.`
    );
  }

  // Determine whether this is a React or Preact project by inspecting dependencies
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const usesReact = Boolean(
    deps.react || deps['@vitejs/plugin-react'] || deps['@vitejs/plugin-react-swc']
  );
  const usesPreact = Boolean(
    deps.preact || deps['@preact/preset-vite']
  );

  if (!usesReact && !usesPreact) {
    console.log(
      colourise(
        'Warning: no React or Preact dependency detected. Proceeding with the React preset. You can ignore this if you plan to add React later.',
        'yellow'
      )
    );
  }

  // Branch based on the selected strategy. When strategy is 'preact',
  // we attempt to apply preact-specific prerender wiring. Otherwise we
  // default to the react strategy.
  try {
    if (strategy === 'preact') {
      const { applyPreactPrerender } = await import('./generators/preact-prerender.mjs');
      await applyPreactPrerender({ projectRoot, pkg, domain });
    } else {
      // Default to React SSG. First apply generic SEO bootstrap, then
      // wire up SSG via vite-react-ssg.
      await applyReactSsgSeo({ projectRoot, pkg, domain });
      const { applyReactSsgWiring } = await import('./generators/react-ssg-wiring.mjs');
      await applyReactSsgWiring({ projectRoot, pkg, domain });
    }
  } catch (err) {
    throw err;
  }

  console.log(colourise('\n✅ SEO/SSG bootstrap completed. Please review the changes.', 'green'));
}