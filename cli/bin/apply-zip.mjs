#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function usage() {
  console.error(
    `Usage: ${path.basename(process.argv[1])} <zip-file> [--domain=<url>] [--strategy=react|preact]`,
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

  const zipArg = args[0];
  const zipPath = path.resolve(zipArg);
  
  if (!fs.existsSync(zipPath)) {
    console.error('Error: specified file does not exist.');
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

  // Crear directori temporal de forma segura
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-seo-bootstrap-zip-'));

  try {
    // 1. Unzip segur (sense shell interpolation)
    console.log('· Extracting zip...');
    runCommand('unzip', ['-qq', zipPath, '-d', tempDir]);
  } catch (err) {
    console.error(`Error extracting zip: ${err.message}`);
    process.exit(1);
  }

  const cliPath = path.join(__dirname, 'cli.mjs');
  
  try {
    // 2. Executar CLI intern de forma segura
    console.log('· Running optimization...');
    runCommand('node', [
      cliPath, 
      tempDir, 
      `--domain=${domain}`, 
      `--strategy=${strategy}`
    ]);
  } catch (err) {
    console.error(`Error running vite-seo-bootstrap: ${err.message}`);
    process.exit(1);
  }

  // Patch package.json (Mantinc la teva lògica, sembla correcta)
  const pkgPath = path.join(tempDir, 'package.json');
  try {
    if (fs.existsSync(pkgPath)) {
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
      }
    }
  } catch (e) {
    console.warn('Warning: Could not patch package.json', e.message);
  }

  if (buildFlag) {
    try {
      console.log('· Installing dependencies...');
      // npm install ha de córrer amb shell: true a Windows de vegades, però spawnSync sol gestionar-ho bé si es troba al PATH.
      // Per seguretat en sistemes unix, millor array. En Windows 'npm.cmd'.
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      runCommand(npmCmd, ['install'], { cwd: tempDir });
      
      console.log('· Running build...');
      runCommand(npmCmd, ['run', 'build'], { cwd: tempDir });
    } catch (err) {
      console.error('Error during install/build:', err.message);
    }
  }

  const { name: baseName, dir: baseDir } = path.parse(zipPath);
  const outputName = `${baseName}-seo-ssg.zip`;
  const outputPath = path.join(baseDir, outputName);

  try {
    // 3. Zip de sortida segur
    // Nota: 'zip' requereix canviar de directori o usar -j, però aquí volem estructura recursiva.
    // Spawn permet especificar { cwd: tempDir }
    console.log('· Compressing output...');
    runCommand('zip', ['-rq', outputPath, '.'], { cwd: tempDir });
  } catch (err) {
    console.error(`Error creating output zip: ${err.message}`);
    process.exit(1);
  }

  // Neteja del directori temporal
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (e) {}

  console.log(`Created optimized zip: ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});