const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { exec } = require('child_process');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Parse URL‑encoded bodies (form fields)
app.use(express.urlencoded({ extended: true }));
// Serve static files from the public directory
app.use(express.static('public'));

/**
 * Handle uploaded ZIP file.  Uses vite-seo-bootstrap's apply-zip script to
 * convert a Vite project zip into an SEO/SSG optimised version.  The converted
 * archive is returned as a file download.
 */
app.post('/convert', upload.single('zipFile'), (req, res) => {
    const domain   = req.body.domain   || 'https://example.com';
    const strategy = req.body.strategy || 'react';

    if (!req.file) {
        res.status(400).send('No zip file uploaded');
        return;
    }

    // Determine original filename (without extension) for a user‑friendly output name
    const origName  = path.parse(req.file.originalname).name;
    const outName   = `${origName}-seo-ssg.zip`;

    // Multer stores the uploaded file without extension in req.file.path.
    // The CLI script expects the file to exist, but names its output based on
    // the hashed filename (not the original name). To keep track of the CLI
    // output, rename the uploaded file to include its original extension.  This
    // ensures that path.parse() inside the CLI uses a predictable base name.
    const uploadedTempPath = req.file.path;
    const originalExt      = path.extname(req.file.originalname) || '.zip';
    const renamedInputPath = uploadedTempPath + originalExt;
    try {
        fs.renameSync(uploadedTempPath, renamedInputPath);
    } catch (renameErr) {
        console.error('Error renaming uploaded file:', renameErr);
        res.status(500).send('Server error processing upload');
        return;
    }

    // Path to the CLI script inside this project
    const cliPath = path.join(__dirname, 'cli', 'bin', 'apply-zip.mjs');

    // Execute the CLI script.  The CLI will produce its output based on the
    // renamed hashed filename; after it completes we will rename it to a
    // user‑friendly name based on the original filename.  Quotes are used
    // around paths to handle spaces or special characters.
    const cmd = `node '${cliPath}' '${renamedInputPath}' --domain='${domain}' --strategy=${strategy}`;
    exec(cmd, (err) => {
        if (err) {
            console.error('Error running vite-seo-bootstrap:', err);
            res.status(500).send('Error optimising the project');
            return;
        }
        const dir = path.dirname(renamedInputPath);
        // The CLI uses the base name of renamedInputPath for its output
        const hashedBaseName = path.parse(renamedInputPath).name;
        const cliOutName     = `${hashedBaseName}-seo-ssg.zip`;
        const cliOutPath     = path.join(dir, cliOutName);

        const outputFullPath = path.join(dir, outName);

        // If the CLI output exists, rename it to the user‑friendly name
        try {
            if (fs.existsSync(cliOutPath)) {
                fs.renameSync(cliOutPath, outputFullPath);
            }
        } catch (renameErr) {
            console.error('Error renaming CLI output:', renameErr);
        }

        // Send the file for download
        res.download(outputFullPath, outName, (downloadErr) => {
            // Clean up temporary files after download
            try {
                if (fs.existsSync(renamedInputPath)) {
                    fs.unlinkSync(renamedInputPath);
                }
                if (fs.existsSync(outputFullPath)) {
                    fs.unlinkSync(outputFullPath);
                }
            } catch (cleanupErr) {
                console.error('Error during cleanup:', cleanupErr);
            }
            if (downloadErr) {
                console.error('Error sending file:', downloadErr);
            }
        });
    });
});

// Start the server.  If the desired port is in use, fall back to the next
// available port.  Allows the user to override via the PORT environment
// variable.  Logs the final chosen port to the console.
const requestedPort = parseInt(process.env.PORT, 10) || 3000;
function startServer(port) {
    const server = app.listen(port, () => {
        console.log(`Vite SEO Bootstrap UI running at http://localhost:${port}`);
    });
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            const next = port + 1;
            console.warn(`Port ${port} is in use, trying ${next}...`);
            startServer(next);
        } else {
            throw err;
        }
    });
}
startServer(requestedPort);
