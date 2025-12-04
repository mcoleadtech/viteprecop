import fs from 'fs/promises';
import path from 'path';

/**
 * Analyzes the project to detect routes and structure.
 * 
 * @param {string} projectRoot 
 * @returns {Promise<{ routes: string[], hasComponents: boolean }>}
 */
export async function analyzeProject(projectRoot) {
    console.log('· Analyzing project structure...');

    const routes = new Set(['/']);
    let hasComponents = false;

    try {
        // 1. Check for src/components
        try {
            await fs.access(path.join(projectRoot, 'src', 'components'));
            hasComponents = true;
        } catch { }

        // 2. File-based routing detection (src/pages or src/views)
        const pagesDirs = ['src/pages', 'src/views'];
        for (const dir of pagesDirs) {
            try {
                const fullPath = path.join(projectRoot, dir);
                const files = await fs.readdir(fullPath);
                for (const file of files) {
                    if (/\.(jsx?|tsx?)$/.test(file)) {
                        const name = path.parse(file).name;
                        if (name.toLowerCase() === 'index' || name.toLowerCase() === 'home') {
                            routes.add('/');
                        } else {
                            // Convert CamelCase to kebab-case for URLs usually, 
                            // but for now let's keep it simple or lowercase it.
                            // Figma Make often uses simple names.
                            const route = '/' + name.toLowerCase();
                            routes.add(route);
                        }
                    }
                }
            } catch { }
        }

        // 3. Code-based routing detection (scanning App.tsx/jsx, main.tsx/jsx)
        // We look for <Route path="..." /> patterns.
        const searchFiles = ['src/App.tsx', 'src/App.jsx', 'src/main.tsx', 'src/main.jsx', 'src/routes.tsx', 'src/routes.jsx'];

        for (const relativePath of searchFiles) {
            try {
                const content = await fs.readFile(path.join(projectRoot, relativePath), 'utf8');
                // Regex to find path="..." props in Route components or similar
                // Matches: path="/about", path='/contact', path="about"
                const pathRegex = /path=['"]\/?([^'"]+)['"]/g;
                let match;
                while ((match = pathRegex.exec(content)) !== null) {
                    const routePath = match[1];
                    // Ignore wildcards or dynamic params for SSG for now (unless we want to support them later)
                    if (!routePath.includes('*') && !routePath.includes(':')) {
                        routes.add('/' + routePath.replace(/^\//, ''));
                    }
                }
            } catch { }
        }

    } catch (err) {
        console.warn('Warning: Analysis failed, falling back to defaults.', err);
    }

    const sortedRoutes = Array.from(routes).sort();
    console.log(`· Detected routes: ${sortedRoutes.join(', ')}`);

    return {
        routes: sortedRoutes,
        hasComponents
    };
}
