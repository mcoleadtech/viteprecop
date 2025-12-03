const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs').promises; // Utilitzem la versió asíncrona
const { execFile } = require('child_process');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Llista blanca per validar l'estratègia
const ALLOWED_STRATEGIES = ['react', 'preact'];

app.post('/convert', upload.single('zipFile'), async (req, res) => {
    // 1. Validació d'entrada
    let domain = req.body.domain || 'https://example.com';
    let strategy = req.body.strategy || 'react';

    // Neteja bàsica del domini (evitar caràcters estranys)
    if (!/^https?:\/\/[a-zA-Z0-9.-]+(?::\d+)?$/.test(domain)) {
        // Si el format no és vàlid, tornem al default o donem error
        console.warn('Domini invàlid, usant default');
        domain = 'https://example.com';
    }

    if (!ALLOWED_STRATEGIES.includes(strategy)) {
        if (req.file) await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).send('Invalid strategy provided.');
    }

    if (!req.file) {
        return res.status(400).send('No zip file uploaded');
    }

    const origName  = path.parse(req.file.originalname).name;
    // Sanititzem el nom de sortida per seguretat
    const safeOrigName = origName.replace(/[^a-zA-Z0-9_-]/g, '_'); 
    const outName   = `${safeOrigName}-seo-ssg.zip`;

    const uploadedTempPath = req.file.path;
    const originalExt      = path.extname(req.file.originalname) || '.zip';
    const renamedInputPath = uploadedTempPath + originalExt;

    // Rutes per neteja final
    const filesToClean = [uploadedTempPath, renamedInputPath];

    try {
        // 2. Renombrar fitxer (Asíncron)
        await fs.rename(uploadedTempPath, renamedInputPath);

        const cliPath = path.join(__dirname, 'cli', 'bin', 'apply-zip.mjs');
        const dir = path.dirname(renamedInputPath);
        
        // El script CLI genera un fitxer basat en el nom d'entrada hash
        const hashedBaseName = path.parse(renamedInputPath).name;
        const cliOutName     = `${hashedBaseName}-seo-ssg.zip`;
        const cliOutPath     = path.join(dir, cliOutName);
        const outputFullPath = path.join(dir, outName);
        
        filesToClean.push(outputFullPath, cliOutPath);

        // 3. Execució segura amb execFile (sense shell)
        const args = [
            cliPath, 
            renamedInputPath, 
            `--domain=${domain}`, 
            `--strategy=${strategy}`
        ];

        // Prometifiquem execFile per usar await
        await new Promise((resolve, reject) => {
            execFile('node', args, (error, stdout, stderr) => {
                if (error) {
                    console.error('CLI Error:', stderr);
                    reject(error);
                } else {
                    resolve(stdout);
                }
            });
        });

        // 4. Comprovar i moure el resultat (Asíncron)
        try {
            await fs.access(cliOutPath); // Comprova si existeix
            await fs.rename(cliOutPath, outputFullPath);
        } catch (e) {
            throw new Error('El fitxer de sortida no s\'ha generat correctament.');
        }

        // 5. Enviar fitxer
        res.download(outputFullPath, outName, async (downloadErr) => {
            if (downloadErr) {
                console.error('Error sending file:', downloadErr);
            }
            // Neteja de fitxers (Asíncrona i sense bloquejar)
            for (const f of filesToClean) {
                await fs.unlink(f).catch(() => {}); // Ignorem errors si el fitxer ja no hi és
            }
        });

    } catch (err) {
        console.error('Server processing error:', err);
        // Intentar netejar en cas d'error
        for (const f of filesToClean) {
            await fs.unlink(f).catch(() => {});
        }
        
        if (!res.headersSent) {
            res.status(500).send('Server error processing upload');
        }
    }
});

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