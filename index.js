const express = require('express');
const qrcode = require('qrcode-terminal'); // Make sure this is already installed, if not run npm install qrcode-terminal
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
const PORT = process.env.PORT || 3000; // Render provides PORT, local defaults to 3000
let qrCodeString = 'Loading QR code...'; // Variable to store the QR code

// Basic Express server for health check and to display QR
app.get('/', (req, res) => {
    res.send(`
        <h1>WhatsApp Bot is Running!</h1>
        <p>Check the logs for bot status or visit /qr for QR code (if available).</p>
        <p>Current QR Status: ${qrCodeString}</p>
    `);
});

app.get('/qr', (req, res) => {
    res.send(`
        <h1>Scan this QR Code:</h1>
        <pre>${qrCodeString}</pre>
        <p>Refresh this page if the QR code doesn't appear immediately or changes.</p>
    `);
});

app.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
});

// --- End of new Express server code ---


// Your existing WhatsApp-web.js code starts here
// Make sure your client initialization and event listeners follow this structure

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'client-one',
        dataPath: '/var/data' // IMPORTANT: This should match your Render Disk mount path
    }),
    puppeteer: {
        args: ['--no-sandbox'],
    }
});

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    console.log('QR RECEIVED', qr); // Log to terminal
    qrCodeString = qr; // Store QR for web display
});

client.on('ready', () => {
    console.log('Client is ready!');
    qrCodeString = 'Client is ready! No QR needed.';
});

client.on('message', message => {
    if (message.body === '!ping') {
        message.reply('pong');
    }
});

client.on('disconnected', (reason) => {
    console.log('Client was disconnected', reason);
    qrCodeString = 'Bot disconnected. Please restart or check logs.';
});


client.initialize();