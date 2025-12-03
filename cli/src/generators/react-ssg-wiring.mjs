// Additional wiring for React static site generation using vite-react-ssg.
// This module augments a Vite + React project to enable true static
// generation. It installs react-router-dom and vite-react-ssg, updates
// scripts, creates a simple routes definition and entry for SSG, and
// rewrites the index.html script tag to point to the new entry.

import fs from 'fs/promises';
import path from 'path';

/**
 * Apply the React SSG wiring to an existing project. Must be run
 * after the SEO bootstrap has been applied, as it relies on some
 * common file structures and config. This will modify package.json
 * and write new files into src/.
 *
 * @param {Object} opts
 * @param {string} opts.projectRoot Absolute path to the project root
 * @param {Object} opts.pkg The parsed package.json (mutated as needed)
 */
export async function applyReactSsgWiring({ projectRoot, pkg }) {
  const pkgPath = path.join(projectRoot, 'package.json');
  // Ensure dependencies objects exist
  pkg.dependencies = pkg.dependencies || {};
  pkg.devDependencies = pkg.devDependencies || {};
  pkg.scripts = pkg.scripts || {};

  let updatedPkg = false;
  // Add react-router-dom if absent
  if (!pkg.dependencies['react-router-dom'] && !pkg.devDependencies['react-router-dom']) {
    pkg.dependencies['react-router-dom'] = '^6.19.0';
    updatedPkg = true;
  }
  // Add vite-react-ssg as a dev dependency
  if (!pkg.devDependencies['vite-react-ssg'] && !pkg.dependencies['vite-react-ssg']) {
    pkg.devDependencies['vite-react-ssg'] = '^0.8.9';
    updatedPkg = true;
  }
  // Update build script to use vite-react-ssg build
  const buildScript = pkg.scripts['build'];
  if (buildScript && buildScript.includes('vite') && !buildScript.includes('vite-react-ssg')) {
    pkg.scripts['build'] = buildScript.replace('vite', 'vite-react-ssg');
    updatedPkg = true;
  }
  // Update dev script to use vite-react-ssg dev
  const devScript = pkg.scripts['dev'];
  if (devScript && devScript.includes('vite') && !devScript.includes('vite-react-ssg')) {
    pkg.scripts['dev'] = devScript.replace('vite', 'vite-react-ssg');
    updatedPkg = true;
  }
  // If no dev script, add one
  if (!pkg.scripts['dev']) {
    pkg.scripts['dev'] = 'vite-react-ssg dev';
    updatedPkg = true;
  }

  if (updatedPkg) {
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
    console.log('· Updated package.json with SSG dependencies and scripts');
  }

  // Create a simple routes definition file
  const srcDir = path.join(projectRoot, 'src');
  await fs.mkdir(srcDir, { recursive: true });
  const routesFile = path.join(srcDir, 'routes.jsx');
  const routesContent = `import React from 'react';
import App from './App';

// Minimal route definition for vite-react-ssg.
const routes = [
  {
    path: '/',
    element: <App />,
  },
];

export default routes;
`;
  await fs.writeFile(routesFile, routesContent, 'utf8');
  console.log('· Wrote src/routes.jsx');

  // Create a new SSG entry file
  const entryFile = path.join(srcDir, 'main.ssg.jsx');
  const entryContent = `import { ViteReactSSG } from 'vite-react-ssg';
import routes from './routes.jsx';

// Export createRoot for vite-react-ssg to bootstrap the app.
export const createRoot = ViteReactSSG({ routes });
`;
  await fs.writeFile(entryFile, entryContent, 'utf8');
  console.log('· Wrote src/main.ssg.jsx');

  // Rewrite the script tag in index.html to point to main.ssg.jsx
  const indexHtmlPath = path.join(projectRoot, 'index.html');
  try {
    let indexHtml = await fs.readFile(indexHtmlPath, 'utf8');
    // Replace any script that loads main.tsx or main.jsx
    const scriptRegex = /<script\s+[^>]*src="\/?src\/(main[^"']*)"[^>]*><\/script>/;
    indexHtml = indexHtml.replace(scriptRegex, '<script type="module" src="/src/main.ssg.jsx"></script>');
    await fs.writeFile(indexHtmlPath, indexHtml, 'utf8');
    console.log('· Updated index.html to use main.ssg.jsx');
  } catch (err) {
    // If index.html does not exist (e.g. in some frameworks) we ignore
    console.log('· Skipped index.html update (file not found)');
  }

  // Remove viteSSG plugin from vite config to avoid conflicts with
  // vite-react-ssg. We leave other plugins like sitemap and HTML intact.
  const tsConfig = path.join(projectRoot, 'vite.config.ts');
  const jsConfig = path.join(projectRoot, 'vite.config.js');
  let configPath;
  try {
    await fs.access(tsConfig);
    configPath = tsConfig;
  } catch {
    configPath = jsConfig;
  }
  try {
    let config = await fs.readFile(configPath, 'utf8');
    // Remove import line referencing viteSSG (e.g. "import { viteSSG } from 'vite-ssg/...'")
    config = config.replace(/^import\s+\{[^}]*\bviteSSG\b[^}]*}\s+from[^\n]*\n?/gm, '');
    // Remove the viteSSG plugin call including its parentheses and inner
    // contents. We scan to find the matching parenthesis to handle nested
    // parentheses in arrow functions.
    const start = config.indexOf('viteSSG(');
    if (start !== -1) {
      let depth = 0;
      let end = -1;
      for (let i = start; i < config.length; i++) {
        const ch = config[i];
        if (ch === '(') {
          depth++;
        } else if (ch === ')') {
          depth--;
          if (depth === 0) {
            end = i + 1;
            break;
          }
        }
      }
      if (end !== -1) {
        // Skip any trailing comma and whitespace/newlines after the call
        while (end < config.length && /[\s,]/.test(config[end])) {
          end++;
        }
        config = config.slice(0, start) + config.slice(end);
      }
    }
    // Also remove any now-empty plugin array entries like trailing commas
    config = config.replace(/,\s*]/g, ']');
    await fs.writeFile(configPath, config, 'utf8');
    console.log(`· Cleaned viteSSG from ${path.basename(configPath)}`);
  } catch (err) {
    // do nothing if config not found
  }
}