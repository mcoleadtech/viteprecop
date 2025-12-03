// Wiring for static prerendering with Preact using @preact/preset-vite.
// This generator installs preact dependencies, updates the Vite
// configuration to enable prerendering, rewrites the main entry file
// for hydration and prerender export, and adjusts index.html.

import fs from 'fs/promises';
import path from 'path';

/**
 * Apply prerender wiring for Preact. This will modify package.json,
 * update vite.config, adjust index.html and main entry file. It is
 * assumed that the project originally uses React; the script will
 * switch to Preact. Use with caution on existing React codebases.
 *
 * @param {Object} opts
 * @param {string} opts.projectRoot Absolute path to project root
 * @param {Object} opts.pkg Parsed package.json (mutated as needed)
 * @param {string} opts.domain Base URL (unused here but kept for parity)
 */
export async function applyPreactPrerender({ projectRoot, pkg, domain }) {
  const pkgPath = path.join(projectRoot, 'package.json');
  pkg.dependencies = pkg.dependencies || {};
  pkg.devDependencies = pkg.devDependencies || {};
  let updated = false;

  // Install preact and related libraries. We conservatively add to
  // dependencies rather than devDependencies.
  const preactDeps = {
    'preact': '^10.17.1',
    '@preact/preset-vite': '^2.4.0',
    'preact-iso': '^3.1.0',
    'preact-render-to-string': '^5.2.6'
  };
  for (const [dep, version] of Object.entries(preactDeps)) {
    if (!pkg.dependencies[dep] && !pkg.devDependencies[dep]) {
      pkg.dependencies[dep] = version;
      updated = true;
    }
  }
  if (updated) {
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
    console.log('· Added preact dependencies to package.json');
  }

  // Modify vite config to use the preact preset. We attempt to find
  // vite.config.ts or js and replace the react plugin with preact.
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
    let configContent = await fs.readFile(configPath, 'utf8');
    // Ensure import of preact plugin
    if (!configContent.includes("'@preact/preset-vite'")) {
      configContent = configContent.replace(/import\s+react\s+from\s+['"]@vitejs\/plugin-react[^'"]*['"];?\n/, "import preact from '@preact/preset-vite';\n");
    }
    // Replace the react() plugin call with preact({ prerender: { enabled: true }})
    configContent = configContent.replace(/react\(([^)]*)\)/, "preact({ prerender: { enabled: true } })");
    // If import line for react plugin still exists (e.g. SWC), remove it
    configContent = configContent.replace(/import\s+react[^;]+;\n?/g, '');
    await fs.writeFile(configPath, configContent, 'utf8');
    console.log(`· Updated ${path.basename(configPath)} to use preact with prerender`);
  } catch (err) {
    console.log('· Skipped vite config update (file not found)');
  }

  // Adjust index.html to add prerender attribute on the entry script.
  const indexHtmlPath = path.join(projectRoot, 'index.html');
  try {
    let html = await fs.readFile(indexHtmlPath, 'utf8');
    html = html.replace(/<script([^>]*?)src="\/?src\/main[^"']*"/i, '<script prerender$1src="/src/main.tsx"');
    await fs.writeFile(indexHtmlPath, html, 'utf8');
    console.log('· Updated index.html to mark entry script as prerender');
  } catch {
    console.log('· Skipped index.html modification (file not found)');
  }

  // Rewrite src/main entry file for preact hydration and prerender export.
  const srcDir = path.join(projectRoot, 'src');
  let mainPath = path.join(srcDir, 'main.tsx');
  let mainJsxPath = path.join(srcDir, 'main.jsx');
  let targetPath;
  try {
    await fs.access(mainPath);
    targetPath = mainPath;
  } catch {
    try {
      await fs.access(mainJsxPath);
      targetPath = mainJsxPath;
    } catch {
      // Fallback to main.tsx
      targetPath = mainPath;
    }
  }
  const preactMain = `import { hydrate, prerender as ssr } from 'preact-iso';
import App from './App';

// Hydrate on the client if window is defined
if (typeof window !== 'undefined') {
  hydrate(<App />, document.getElementById('root'));
}

// Export prerender function for the prerender plugin
export async function prerender(data) {
  const { html, links } = await ssr(<App {...data} />);
  return { html, links };
}
`;
  await fs.mkdir(srcDir, { recursive: true });
  await fs.writeFile(targetPath, preactMain, 'utf8');
  console.log(`· Wrote ${path.relative(projectRoot, targetPath)} with preact hydration and prerender`);

  // Write dotfiles (.env and .gitignore) if missing
  await ensureDotFiles({ projectRoot, domain });
}

/**
 * Ensure .env and .gitignore files exist.  Shared with React generator.
 *
 * @param {Object} opts
 * @param {string} opts.projectRoot
 * @param {string} opts.domain
 */
async function ensureDotFiles({ projectRoot, domain }) {
  const envPath = path.join(projectRoot, '.env');
  try {
    await fs.access(envPath);
  } catch {
    const baseUrl = domain.replace(/\/$/, '');
    const envContents = `# Base URL for your site\nVITE_BASE_URL=${baseUrl}`;
    await fs.writeFile(envPath, envContents, 'utf8');
    console.log('· Wrote .env with VITE_BASE_URL');
  }
  const gitignorePath = path.join(projectRoot, '.gitignore');
  try {
    await fs.access(gitignorePath);
  } catch {
    const gitignore = `# dependencies\nnode_modules\n\n# build output\ndist\n\n# environment files\n.env\n\n# system files\n.DS_Store\n`;
    await fs.writeFile(gitignorePath, gitignore, 'utf8');
    console.log('· Wrote .gitignore');
  }
}