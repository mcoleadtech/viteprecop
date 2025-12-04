#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function usage() {
    console.error(
        `Usage: ${path.basename(process.argv[1])} <project-path> [--domain=<url>] [--strategy=react|preact] [--build]`,
    );
    process.exit(1);
}

// Helper per executar comandes de forma segura sense shell
function runCommand(command, args, options = {}) {
    const result = spawnSync(command, args, { stdio: 'inherit', ...options });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`Command ${command} failed with code ${result.status}`);
    }
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) usage();

    const projectPathArg = args[0];
    const projectRoot = path.resolve(projectPathArg);

    if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
        console.error('Error: specified path does not exist or is not a directory.');
        process.exit(1);
    }

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

    // Verificació: El package.json ha de ser on diem que és
    const pkgPath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        console.error('Error: package.json not found in the specified directory.');
        process.exit(1);
    }

    const cliPath = path.join(__dirname, '..', 'src', 'index.mjs');

    try {
        // Importem dinàmicament el CLI intern per executar-lo
        // Això evita haver de fer spawn d'un nou procés node si no volem, 
        // però per consistència amb apply-zip i per aïllament, podem usar spawn o importar.
        // Com que index.mjs exporta 'run', el podem importar.

        const { run } = await import(cliPath);
        console.log(`· Optimizing local project at: ${projectRoot}`);
        await run({ projectRoot, domain, strategy });

    } catch (err) {
        console.error(`Error running vite-seo-bootstrap: ${err.message}`);
        process.exit(1);
    }

    // Patch package.json (versió vite-bundle-visualizer)
    try {
        const pkgRaw = fs.readFileSync(pkgPath, 'utf8');
        const pkg = JSON.parse(pkgRaw);
        let patched = false;
        const fixVersion = (deps) => {
            if (!deps) return;
            const key = 'vite-bundle-visualizer';
            if (deps[key] && /^\^?1\.\d+\.\d+/.test(deps[key]) === false) {
                deps[key] = '^1.2.1';
                patched = true;
            }
        };
        fixVersion(pkg.dependencies);
        fixVersion(pkg.devDependencies);
        if (patched) {
            fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
            console.log('· Patched package.json dependencies.');
        }
    } catch (e) {
        console.warn('Warning: Could not patch package.json', e.message);
    }

    if (buildFlag) {
        try {
            console.log('· Installing dependencies (this may take a while)...');
            const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
            runCommand(npmCmd, ['install'], { cwd: projectRoot });

            console.log('· Running build...');
            runCommand(npmCmd, ['run', 'build'], { cwd: projectRoot });

            console.log('· Build complete! Check the "dist" folder.');
        } catch (err) {
            console.error('Error during install/build:', err.message);
            process.exit(1);
        }
    } else {
        console.log('· Optimization complete. Run "npm install" and "npm run build" manually.');
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
