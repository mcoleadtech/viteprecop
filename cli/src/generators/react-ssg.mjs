// Functions for bootstrapping a Vite + React project with
// sensible SEO and SSG defaults. This module exports a single
// async function `applyReactSsgSeo` which orchestrates the
// modifications. Each helper is split out for clarity and easier
// testing.

import fs from 'fs/promises';
import path from 'path';

// List of dependencies to add to the project's package.json. The
// versions here are conservative placeholders. Users should run
// `npm install` or `yarn install` afterwards to resolve actual
// versions. All packages except vite-bundle-visualizer are placed
// under `dependencies`, as they are needed at runtime (for SSR/SSG).
const SEO_DEPENDENCIES = {
  'react-helmet-async': '^2.0.0',
  'vite-plugin-html': '^3.2.1',
  'vite-plugin-sitemap': '^0.7.1',
  'vite-ssg': '^0.24.0'
};
// NOTE: vite-bundle-visualizer only publishes up to 1.2.x at the time
// of writing. Using ^1.9.0 would break npm install. See
// https://registry.npmjs.org/vite-bundle-visualizer for available
// versions. We pin to the latest 1.2.x to avoid install errors.
// Also adding @vitejs/plugin-react as it is required by the new vite config.
const SEO_DEV_DEPENDENCIES = {
  'vite-bundle-visualizer': '^1.2.1',
  '@vitejs/plugin-react': '^4.2.1',
  'vite': '^5.0.0'
};

/**
 * Apply the React + vite-ssg bootstrap steps to the given project. This
 * function performs several modifications: it updates package.json,
 * writes a SEO component, creates sitemap helpers, writes a robots.txt,
 * rewrites the Vite configuration and adds a simple markdown guide.
 *
 * @param {Object} opts
 * @param {string} opts.projectRoot Absolute path to the project root
 * @param {Object} opts.pkg Parsed package.json of the project
 * @param {string} opts.domain Base URL used in sitemap and canonical tags
 */
export async function applyReactSsgSeo({ projectRoot, pkg, domain }) {
  await updatePackageJson({ projectRoot, pkg });
  await ensureSeoComponent({ projectRoot });
  await ensureSitemapHelper({ projectRoot, domain });
  await ensureRobotsTxt({ projectRoot, domain });
  await updateViteConfig({ projectRoot, domain });
  await writeSeoGuide({ projectRoot, domain, projectName: pkg.name || 'Your Vite App' });
  await ensureDotFiles({ projectRoot, domain });
}

/**
 * Update package.json with required dependencies and scripts.
 * Writes back to disk only if modifications were made.
 *
 * @param {Object} opts
 */
async function updatePackageJson({ projectRoot, pkg }) {
  let updated = false;
  pkg.dependencies = pkg.dependencies || {};
  pkg.devDependencies = pkg.devDependencies || {};
  // Add runtime deps
  for (const [dep, version] of Object.entries(SEO_DEPENDENCIES)) {
    if (!pkg.dependencies[dep] && !pkg.devDependencies[dep]) {
      pkg.dependencies[dep] = version;
      updated = true;
    }
  }
  // Add dev deps
  for (const [dep, version] of Object.entries(SEO_DEV_DEPENDENCIES)) {
    if (!pkg.devDependencies[dep] && !pkg.dependencies[dep]) {
      pkg.devDependencies[dep] = version;
      updated = true;
    }
  }
  // Add analyse script
  pkg.scripts = pkg.scripts || {};
  if (!pkg.scripts.analyze) {
    pkg.scripts.analyze = 'npx vite-bundle-visualizer';
    updated = true;
  }
  if (updated) {
    const pkgPath = path.join(projectRoot, 'package.json');
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
    console.log('· Updated package.json with SEO dependencies and analyze script');
  } else {
    console.log('· package.json already contains required dependencies');
  }
}

/**
 * Ensure a SEO component exists in src/components/Seo.tsx. If the file
 * already exists, it will be overwritten with our recommended template.
 *
 * @param {Object} opts
 */
async function ensureSeoComponent({ projectRoot }) {
  const componentsDir = path.join(projectRoot, 'src', 'components');
  await fs.mkdir(componentsDir, { recursive: true });
  const target = path.join(componentsDir, 'Seo.tsx');
  const contents = `import { Helmet } from 'react-helmet-async';

export interface SeoProps {
  title: string;
  description: string;
  canonical: string;
  image?: string;
  schemaMarkup?: Record<string, any>;
}

/**
 * Seo component sets up meta tags, social cards and structured data on a
 * per-page basis using react-helmet-async. Pass whatever props you
 * need to customise the metadata for each route.
 */
const Seo = ({ title, description, canonical, image, schemaMarkup }: SeoProps) => (
  <Helmet>
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={canonical} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    {image && <meta property="og:image" content={image} />} 
    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={description} />
    {image && <meta name="twitter:image" content={image} />} 
    {schemaMarkup && (
      <script type="application/ld+json">
        {JSON.stringify(schemaMarkup)}
      </script>
    )}
  </Helmet>
);

export default Seo;
`;
  await fs.writeFile(target, contents, 'utf8');
  console.log('· Wrote src/components/Seo.tsx');
}

/**
 * Create src/seo/sitemap.ts with helper functions used by vite-plugin-sitemap.
 *
 * @param {Object} opts
 */
async function ensureSitemapHelper({ projectRoot, domain }) {
  const seoDir = path.join(projectRoot, 'src', 'seo');
  await fs.mkdir(seoDir, { recursive: true });
  const target = path.join(seoDir, 'sitemap.ts');
  const contents = `export const BASE_URL = '${domain}';

/**
 * Optionally return a list of dynamic routes to include in your
 * sitemap. You might fetch data from an API or read local files here.
 */
export async function dynamicRoutes(): Promise<string[]> {
  return [];
}

/**
 * Specify any routes you want to exclude from the sitemap (e.g. admin pages).
 */
export const excludeRoutes: string[] = ['/admin', '/private'];
`;
  await fs.writeFile(target, contents, 'utf8');
  console.log('· Wrote src/seo/sitemap.ts');
}

/**
 * Create or update public/robots.txt. This file instructs crawlers which
 * routes to avoid and points them to the sitemap.xml generated by the
 * Vite plugin.
 *
 * @param {Object} opts
 */
async function ensureRobotsTxt({ projectRoot, domain }) {
  const publicDir = path.join(projectRoot, 'public');
  await fs.mkdir(publicDir, { recursive: true });
  const target = path.join(publicDir, 'robots.txt');
  const canonicalDomain = domain.replace(/\/$/, '');
  const contents = `User-agent: *
Allow: /

Sitemap: ${canonicalDomain}/sitemap.xml

User-agent: Googlebot
Disallow: /private
`;
  await fs.writeFile(target, contents, 'utf8');
  console.log('· Wrote public/robots.txt');
}

/**
 * Generate a recommended Vite configuration for React + vite-ssg. If a
 * vite.config.ts or vite.config.js exists, it will be overwritten.
 * Users may wish to merge this with their own configuration if needed.
 *
 * @param {Object} opts
 */
async function updateViteConfig({ projectRoot, domain }) {
  const tsConfig = path.join(projectRoot, 'vite.config.ts');
  const jsConfig = path.join(projectRoot, 'vite.config.js');
  let target;
  try {
    await fs.access(tsConfig);
    target = tsConfig;
  } catch {
    target = jsConfig;
  }
  const baseUrl = domain.replace(/\/$/, '');
  const contents = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { ViteSitemap } from 'vite-plugin-sitemap';
import { createHtmlPlugin } from 'vite-plugin-html';
import { viteSSG } from 'vite-ssg/serialized-data';

// Define your application routes here. This array is used by vite-ssg to
// prerender each route. Add entries like { path: '/about', name: 'About' }.
const routes = [
  { path: '/', name: 'Home' }
];

export default defineConfig({
  plugins: [
    react(),
    viteSSG({
      includedRoutes: () => routes
    }),
    ViteSitemap({
      baseUrl: '${baseUrl}',
      routes,
      generateRobotsTxt: true
    }),
    createHtmlPlugin({
      minify: true,
      inject: {
        data: {
          title: 'Default Title',
          description: 'Default Description'
        }
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom']
        }
      }
    }
  }
});
`;
  await fs.writeFile(target, contents, 'utf8');
  console.log(`· Wrote ${path.relative(projectRoot, target)}`);
}

/**
 * Write a simple markdown guide to the project root. It explains how
 * to use the generated files and next steps. The user can delete it
 * once they become familiar with the workflow.
 *
 * @param {Object} opts
 */
async function writeSeoGuide({ projectRoot, domain, projectName }) {
  const target = path.join(projectRoot, 'SEO_GUIDE.md');
  const baseUrl = domain.replace(/\/$/, '');
  // Use indented code blocks rather than fenced code blocks to avoid
  // nested backticks in this string literal.
  const guide = [
    `# SEO Optimisation for ${projectName}`,
    '',
    'This project has been bootstrapped with a handful of tooling to improve',
    'search engine optimisation (SEO) and performance.',
    '',
    '## What was added',
    '',
    '- **react-helmet-async** – enable dynamic meta tags per route.',
    '- **vite-ssg** – pre-render pages at build time for fast first paint.',
    '- **vite-plugin-sitemap** – automatically generate sitemap.xml and robots.txt.',
    '- **vite-plugin-html** – inject default metadata into your HTML.',
    '- **vite-bundle-visualizer** – analyse your bundle sizes via `npm run analyze`.',
    '',
    '## Basic usage',
    '',
    '1. Adjust your route definitions in `vite.config.js`/`vite.config.ts` and update',
    '   `src/seo/sitemap.ts` if you have dynamic pages.',
    '2. Use the exported **Seo** component in each page or layout to set',
    '   up metadata:',
    '',
    '       import Seo from "./components/Seo";',
    '       ',
    `       export default function HomePage() {`,
    '         return (',
    '           <>',
    `             <Seo`,
    `               title="Home – ${projectName}"`,
    `               description="Welcome to ${projectName}, a React + Vite example."`,
    `               canonical="${baseUrl}/"`,
    '               schemaMarkup={{',
    '                 "@context": "https://schema.org",',
    '                 "@type": "WebSite",',
    `                 name: "${projectName}",`,
    `                 url: "${baseUrl}/"`,
    '               }}',
    '             />',
    '             <h1>Hello world!</h1>',
    '           </>',
    '         );',
    '       }',
    '',
    '3. Run `npm run build` to generate static HTML for each route.',
    '4. Run `npm run analyze` to view your bundle composition in a browser.',
    '',
    '## Further improvements',
    '',
    '- Add lazy loading for images and modules to improve performance.',
    '- Optimise your images (e.g. WebP) and provide alt text.',
    '- Implement breadcrumbs and structured data for better search results.',
    '- Monitor your site via Google Search Console.',
    '',
    '---',
    '',
    'Generated by **vite-seo-bootstrap**.'
  ].join('\n');
  await fs.writeFile(target, guide, 'utf8');
  console.log('· Wrote SEO_GUIDE.md');
}

/**
 * Write common dotfiles (.env and .gitignore) to the project root if they
 * do not already exist.  The .env file contains a placeholder for the base
 * URL; the .gitignore excludes node_modules, dist output and environment
 * files.  Users may modify these as needed.
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