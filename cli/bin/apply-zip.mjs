#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';

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
    // 1. Unzip segur amb adm-zip
    console.log('· Extracting zip...');
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tempDir, true);
  } catch (err) {
    console.error(`Error extracting zip: ${err.message}`);
    // Netejar abans de sortir
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    process.exit(1);
  }

  // --- NOVA LÒGICA: Detectar subcarpeta (Project Root Detection) ---
  let projectRoot = tempDir;
  try {
    const files = fs.readdirSync(tempDir);
    // Ignorem arxius de sistema tipus .DS_Store o __MACOSX si n'hi ha
    const validFiles = files.filter(f => !f.startsWith('.') && f !== '__MACOSX');

    // Si només hi ha 1 element i és una carpeta, assumim que és l'arrel del projecte
    if (validFiles.length === 1) {
      const nestedPath = path.join(tempDir, validFiles[0]);
      if (fs.statSync(nestedPath).isDirectory()) {
        console.log(`· Detected nested project folder: ${validFiles[0]}`);
        projectRoot = nestedPath;
      }
    }
  } catch (e) {
    console.warn('Warning: Could not detect nested folder structure.');
  }

  // Verificació final: El package.json ha de ser on diem que és
  const pkgPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) {
     console.error('Error: package.json not found in the extracted files.');
     console.error(`Looked in: ${projectRoot}`);
     try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
     process.exit(1);
  }
  // ----------------------------------------------------------------

  const cliPath = path.join(__dirname, 'cli.mjs');
  
  try {
    // 2. Executar CLI intern de forma segura passant el projectRoot correcte
    console.log('· Running optimization...');
    runCommand('node', [
      cliPath, 
      projectRoot, // IMPORTANT: Passem projectRoot, no tempDir
      `--domain=${domain}`, 
      `--strategy=${strategy}`
    ]);
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
      console.log('· Installing dependencies...');
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      // Executem dins de projectRoot
      runCommand(npmCmd, ['install'], { cwd: projectRoot });
      
      console.log('· Running build...');
      runCommand(npmCmd, ['run', 'build'], { cwd: projectRoot });
    } catch (err) {
      console.error('Error during install/build:', err.message);
    }
  }

  // Preparar sortida
  const { name: baseName, dir: baseDir } = path.parse(zipPath);
  const outputName = `${baseName}-seo-ssg.zip`;
  const outputPath = path.join(baseDir, outputName);

  try {
    // 3. Zip de sortida segur amb adm-zip
    console.log('· Compressing output...');
    const zip = new AdmZip();
    // Afegim la carpeta local (projectRoot) al zip.
    // addLocalFolder afegeix el contingut de la carpeta a l'arrel del zip si el segon argument és buit.
    zip.addLocalFolder(projectRoot);
    zip.writeZip(outputPath);
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