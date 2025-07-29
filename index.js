// index.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// --- RENDER DISK CONFIGURATION ---
// IMPORTANT: This path must match the "Mount Path" you configured for your Disk on Render.
const DISK_MOUNT_PATH = '/var/data'; // <--- VERIFY THIS PATH ON RENDER!

// Ensure the directory for the session file exists on the disk
const SESSION_DIR_PATH = path.join(DISK_MOUNT_PATH, 'whatsapp-session'); // We'll store it in a sub-folder on the disk
const SESSION_FILE_PATH = path.join(SESSION_DIR_PATH, 'session.json'); // whatsapp-web.js expects 'session.json' inside a folder

async function startWhatsAppClient() {
    // Ensure the session directory on the disk exists
    if (!fs.existsSync(SESSION_DIR_PATH)) {
        console.log(`Creating session directory on disk: ${SESSION_DIR_PATH}`);
        fs.mkdirSync(SESSION_DIR_PATH, { recursive: true });
    }

    // Initialize WhatsApp Client with LocalAuth pointing to our persistent disk path
    const client = new Client({
        authStrategy: new LocalAuth({
            dataPath: DISK_MOUNT_PATH, // Point dataPath to the mount path of your Render Disk
            // The library will create a 'session' folder inside dataPath
            // and store 'session.json' within it. So, it will be /var/data/session/session.json
        }),
        puppeteer: {
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            // headless: false, // Uncomment for debugging if you want to see the browser (only locally)
        }
    });

    client.on('qr', (qr) => {
        // Generate and display the QR code in the terminal
        console.log('QR RECEIVED:', qr);
        qrcode.generate(qr, { small: true });
        console.log('Scan the QR code with your phone (WhatsApp > Settings > Linked Devices > Link a Device)');
    });

    client.on('ready', () => {
        console.log('Client is ready! WhatsApp is connected.');
        console.log(`Session data is being stored persistently on the Render Disk at: ${SESSION_DIR_PATH}`);
    });

    client.on('authenticated', (session) => {
        console.log('AUTHENTICATED: Session successfully saved on Render Disk.');
        // The LocalAuth strategy handles saving the session file automatically
        // to the dataPath you specified.
    });

    client.on('auth_failure', msg => {
        // Fired if session restore failed or authentication failed
        console.error('AUTHENTICATION FAILURE:', msg);
        console.error('If this persists, try deleting the session folder on your Render Disk and restart.');
    });

    client.on('disconnected', (reason) => {
        console.log('Client was disconnected:', reason);
        // On Render, the session file should persist even after disconnection.
        // If you want to force a new QR scan after disconnection, you'd need
        // to manually delete the session folder on the disk (e.g., via a script
        // or Render's shell) and restart the service.
    });

    client.on('message', async msg => {
        console.log('Message received:', msg.body);

        if (msg.body.toLowerCase() === '!ping') {
            await msg.reply('pong');
            console.log('Replied with "pong"');
        } else if (msg.body.toLowerCase().startsWith('!sendto ')) {
            // Usage: !sendto <number> <message>
            // Example: !sendto 33612345678 Hello from Node.js!
            const parts = msg.body.split(' ');
            const number = parts[1];
            const message = parts.slice(2).join(' ');

            if (!number || !message) {
                return msg.reply('Usage: !sendto <number> <message>');
            }

            // The number must be in international format without '+'
            // e.g., '33612345678' for France
            // whatsapp-web.js expects 'number@c.us' for users or 'number@g.us' for groups
            const sanitizedNumber = number.replace(/[^0-9]/g, '');
            const chatId = `${sanitizedNumber}@c.us`; // Assuming it's a direct user chat

            try {
                // Check if the number is registered on WhatsApp
                const isRegistered = await client.isRegisteredUser(chatId);
                if (!isRegistered) {
                    await msg.reply(`The number ${number} is not registered on WhatsApp.`);
                    console.warn(`Attempted to send message to unregistered number: ${number}`);
                    return;
                }

                await client.sendMessage(chatId, message);
                console.log(`Message sent to ${number}: "${message}"`);
                await msg.reply(`Message sent to ${number}.`);
            } catch (err) {
                console.error(`Failed to send message to ${number}:`, err);
                await msg.reply(`Error sending message to ${number}. Please check the number and try again.`);
            }
        }
    });

    console.log('Initializing WhatsApp Client...');
    client.initialize();
}

startWhatsAppClient();