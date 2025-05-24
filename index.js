import dotenv from 'dotenv';
dotenv.config();

import {
    makeWASocket,
    Browsers,
    fetchLatestBaileysVersion,
    DisconnectReason,
    useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import express from 'express';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { File } from 'megajs';
import config from './config.js';
import handlerMode from './events/handlerMode.js';
import handler from './events/handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const app = express();
const PORT = config.PORT;

const MAIN_LOGGER = pino({
    timestamp: () => `,"time":"${new Date().toJSON()}"`
});
const logger = MAIN_LOGGER.child({});
logger.level = "trace";

// Middleware
app.use(express.json());

// Route to your handler
app.use('/handler', handler);

app.use('/handler', (req, res, next) => {
    req.app.locals.ask = ask;
    next();
}, handler);


// Basic route
app.get('/', (req, res) => {
    res.send('Hello World!');
});

// Session management
const sessionDir = path.join(__dirname, 'session');
const credsPath = path.join(sessionDir, 'creds.json');

if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

async function downloadSessionData() {
    try {
        console.log("Debugging SESSION_ID:", config.SESSION_ID);

        if (!config.SESSION_ID) {
            throw new Error('❌ Please add your session to SESSION_ID env !!');
        }

        const sessdata = config.SESSION_ID.split("ASK-XMD~;;;")[1];

        if (!sessdata || !sessdata.includes("#")) {
            throw new Error('❌ Invalid SESSION_ID format! It must contain both file ID and decryption key.');
        }

        const [fileID, decryptKey] = sessdata.split("#");

        console.log("🔄 Downloading Session...");
        const file = File.fromURL(`https://mega.nz/file/${fileID}#${decryptKey}`);

        const data = await new Promise((resolve, reject) => {
            file.download((err, data) => {
                if (err) reject(err);
                else resolve(data);
            });
        });

        await fs.promises.writeFile(credsPath, data);
        console.log("🔒 Session Successfully Loaded !!");
        return true;
    } catch (error) {
        console.error('❌ Failed to download session data:', error);
        return false;
    }
}

async function start() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`🤖 ASK XMD using WA v${version.join('.')}, isLatest: ${isLatest}`);

        const ask = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: true,
            browser: ["ASK-XMD", "safari", "3.3"],
            auth: state,
            getMessage: async (key) => {
                if (store) {
                    const msg = await store.loadMessage(key.remoteJid, key.id);
                    return msg.message || undefined;
                }
                return { conversation: "ASK XMD whatsapp user bot" };
            }
        });

        ask.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                if (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                    start();
                }
            } else if (connection === 'open') {
                console.log(chalk.green("Connected Successfully ask-MD "));
                ask.sendMessage(ask.user.id, {
                    image: { url: "https://files.catbox.moe/scvigx.jpg" },
                    caption: `*Hello there ask-MD User! 👋🏻*

> Bot connected

*Thanks for using ask-MD*

- *YOUR PREFIX:* = ${config.PREFIX}

> *© Pᴏᴡᴇʀᴇᴅ Bʏ ask Iɴᴄ.♡*🖤`
                });
            }
        });

        ask.ev.on('creds.update', saveCreds);

        // Set the bot mode
        if (config.MODE === "public") {
            ask.public = true;
        } else if (config.MODE === "private") {
            ask.public = false;
        }

        // Ajoutez ici d'autres gestionnaires d'événements si nécessaire

    } catch (error) {
        console.error('Critical Error:', error);
        process.exit(1);
    }
}

async function init() {
    try {
        if (fs.existsSync(credsPath)) {
            console.log("🔒 Session file found, proceeding without QR code.");
        } else {
            const sessionDownloaded = await downloadSessionData();
            if (sessionDownloaded) {
                console.log("🔒 Session downloaded, starting bot.");
            } else {
                console.log("No session found or downloaded, QR code will be printed for authentication.");
            }
        }
    } catch (error) {
        console.error('Error during initialization:', error);
    }
}

init();

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
