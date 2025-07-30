// Required Node.js modules
const express = require('express');
const qrcode = require('qrcode'); // For generating QR code image for web display
const qrcodeTerminal = require('qrcode-terminal'); // For displaying QR in terminal logs
const { Client, LocalAuth } = require('whatsapp-web.js');
const axios = require('axios'); // For making HTTP requests to your GAS API

// ------------------- Configuration Variables -------------------
// IMPORTANT: Replace this with your actual GAS Web App URL
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbxkryh7GxaatnZNVQsggYQCID8G7I9-pC95TYW5m3dcAECPl6V6tKEtxwY2c68SZ_ZF/exec"; 

// ------------------- Express Web Server Setup -------------------
const app = express();
app.use(express.json()); // IMPORTANT: This line allows Express to parse JSON request bodies
const PORT = process.env.PORT || 3000; // Render provides PORT, local defaults to 3000

let qrCodeString = 'Loading QR code...'; // Variable to store the QR code status or image data URL

// Basic Express server for health check
app.get('/', (req, res) => {
    res.send(`
        <h1>WhatsApp Bot is Running!</h1>
        <p>This is a background service. To view the QR code for scanning, go to <a href="/qr">/qr</a>.</p>
        <p>Current Status: ${qrCodeString.includes('img') ? 'QR Code available or Client Ready!' : qrCodeString}</p>
    `);
});

// Endpoint to display the QR code as an image
app.get('/qr', (req, res) => {
    if (qrCodeString.startsWith('<img src="data:image/png;base64,')) {
        res.send(`
            <h1>Scan this QR Code:</h1>
            ${qrCodeString}
            <p>Refresh this page if the QR code doesn't appear immediately or changes.</p>
            <p>Once scanned, the QR code will disappear, and the bot will show 'Client is ready!'</p>
        `);
    } else {
        res.send(`
            <h1>Waiting for QR Code...</h1>
            <p>${qrCodeString}</p>
            <p>Refresh this page in a few seconds. If it takes too long, check Render logs for errors.</p>
        `);
    }
});

// Endpoint to send WhatsApp messages via POST request from external services (like GAS)
app.post('/send', async (req, res) => {
    const { number, message } = req.body;

    if (!number || !message) {
        return res.status(400).json({ error: 'Number and message are required in the request body.' });
    }

    const formattedNumber = number.includes('@c.us') ? number : `${number}@c.us`;

    try {
        if (client.info && client.info.me && client.info.me.user) {
            const sentMessage = await client.sendMessage(formattedNumber, message);
            console.log(`[API Send] Message sent to ${formattedNumber}:`, sentMessage.id.id);
            res.status(200).json({ success: true, id: sentMessage.id.id, message: `Message sent to ${number}` });
        } else {
            console.warn(`[API Send] WhatsApp client not ready. Attempted to send to ${formattedNumber}.`);
            res.status(500).json({ error: 'WhatsApp client is not ready. Please scan QR or check bot status.', status: qrCodeString });
        }
    } catch (error) {
        console.error(`[API Send] Error sending message to ${formattedNumber}:`, error);
        res.status(500).json({
            error: 'Failed to send message.',
            details: error.message,
            statusCode: error.statusCode || 'N/A',
            responseBody: error.responseBody || 'N/A'
        });
    }
});

// Start the Express web server
app.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
    console.log(`Access bot status at http://localhost:${PORT}`);
    console.log(`Access QR code at http://localhost:${PORT}/qr`);
    console.log(`API endpoint for sending messages: http://localhost:${PORT}/send (POST request)`);
});

// ------------------- WhatsApp-web.js Bot Setup -------------------

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'client-one',
        dataPath: '/var/data'
    }),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ],
        headless: true
    }
});

// Event listener for when the QR code is generated
client.on('qr', qr => {
    qrcodeTerminal.generate(qr, { small: true });
    console.log('QR RECEIVED (terminal format)');

    qrcode.toDataURL(qr, (err, url) => {
        if (err) {
            console.error('Error generating QR code image for web:', err);
            qrCodeString = 'Error generating QR code image for web.';
        } else {
            qrCodeString = `<img src="${url}" alt="QR Code" width="300" height="300"/>`;
            console.log('QR code image data URL generated.');
        }
    });
});

// Event listener for when the client is ready
client.on('ready', () => {
    console.log('Client is ready!');
    qrCodeString = 'Client is ready! You are logged in.';
});

// Event listener for incoming messages
client.on('message', async message => { // IMPORTANT: Changed to async
    const chat = await message.getChat(); // Get chat object for context

    // Existing commands
    if (message.body === '!ping') {
        message.reply('pong');
    } else if (message.body === '!info') {
        client.info.getBatteryStatus().then(battery => {
            message.reply(`Battery: ${battery.battery}% ${battery.plugged ? '(Plugged in)' : '(Not plugged in)'}`);
        });
    } else if (message.body.startsWith('!echo ')) {
        const textToEcho = message.body.substring(6);
        message.reply(`You echoed: ${textToEcho}`);
    }
    // NEW: Handle commands like "OF17001?" or "OF17001"
    else if (message.body.toUpperCase().startsWith('OF')) {
        let orderNumber = message.body.toUpperCase().trim(); // Take the whole message as potential order number

        // Remove the trailing '?' if present
        if (orderNumber.endsWith('?')) {
            orderNumber = orderNumber.slice(0, -1);
        }

        // Optional: Add more specific validation here if needed, e.g., using a regex
        // if (!/^OF\d+$/.test(orderNumber)) {
        //     message.reply('Format de commande invalide. Veuillez utiliser le format OFXXXXX (ex: OF17001 ou OF17001?).');
        //     return;
        // }

        console.log(`Received potential order command: ${orderNumber}`);

        try {
            // Make the request to your Google Apps Script API
            const response = await axios.get(GAS_API_URL, {
                params: {
                    orderNumber: orderNumber // Pass the order number as a query parameter
                }
            });

            const apiResponse = response.data; // This will be the JSON from your GAS script

            if (apiResponse.status === 'success') {
                const data = apiResponse.data;
                let replyMessage = `*Détails de la commande ${orderNumber}*:\n\n`;

                // Loop through all keys (column headers) and values in the response data
                // This builds a clean message from all columns
                for (const key in data) {
                    if (Object.hasOwnProperty.call(data, key)) {
                        replyMessage += `*${key}*: ${data[key]}\n`;
                    }
                }
                message.reply(replyMessage);
            } else if (apiResponse.status === 'not_found') {
                message.reply(`Numéro de commande '${orderNumber}' introuvable. Veuillez vérifier et réessayer.`);
            } else {
                message.reply(`Une erreur est survenue lors de la récupération des données : ${apiResponse.message || 'Erreur inconnue de l\'API.'}`);
                console.error('API Error Response:', apiResponse);
            }

        } catch (error) {
            console.error('Error fetching data from GAS API:', error.message);
            message.reply('Désolé, une erreur technique est survenue lors de la tentative de récupération des données de commande. Veuillez réessayer plus tard.');
        }
    }
});

// Event listener for disconnection
client.on('disconnected', (reason) => {
    console.log('Client was disconnected', reason);
    qrCodeString = `Bot disconnected: ${reason}. Please restart or check logs.`;
});

// Initialize the WhatsApp client
client.initialize();