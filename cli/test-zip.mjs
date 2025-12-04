import AdmZip from 'adm-zip';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.join(__dirname, 'test-output');
const dummyZipPath = path.join(testDir, 'dummy.zip');
const cliPath = path.join(__dirname, 'bin', 'apply-zip.mjs');

// Clean up previous test run
if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
}
fs.mkdirSync(testDir);

// Create a dummy project structure
const dummyProjectDir = path.join(testDir, 'dummy-project');
fs.mkdirSync(dummyProjectDir);
fs.writeFileSync(path.join(dummyProjectDir, 'package.json'), JSON.stringify({
    name: "dummy-project",
    version: "1.0.0",
    dependencies: {
        "react": "^18.0.0"
    }
}, null, 2));

// Create a dummy zip file
const zip = new AdmZip();
zip.addLocalFolder(dummyProjectDir);
zip.writeZip(dummyZipPath);

console.log('Created dummy zip at:', dummyZipPath);

// Run the CLI tool
console.log('Running apply-zip.mjs...');
const result = spawnSync('node', [cliPath, dummyZipPath], { stdio: 'inherit' });

if (result.status !== 0) {
    console.error('CLI tool failed with status:', result.status);
    process.exit(1);
}

// Verify output
const outputZipName = 'dummy-seo-ssg.zip';
const outputZipPath = path.join(testDir, outputZipName);

if (fs.existsSync(outputZipPath)) {
    console.log('Success! Output zip created at:', outputZipPath);

    // Verify content of output zip
    const outZip = new AdmZip(outputZipPath);
    const entries = outZip.getEntries();
    const entryNames = entries.map(e => e.entryName);

    console.log('Output zip entries:', entryNames);

    if (entryNames.includes('package.json') && entryNames.includes('src/components/SEO.tsx')) {
        console.log('Verification passed: package.json and SEO component found.');
    } else {
        console.error('Verification failed: Missing expected files in output zip.');
        process.exit(1);
    }

} else {
    console.error('Verification failed: Output zip not found.');
    process.exit(1);
}
