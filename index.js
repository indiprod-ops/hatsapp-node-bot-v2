// Required Node.js modules
const express = require('express');
const qrcode = require('qrcode'); // For generating QR code image for web display
const qrcodeTerminal = require('qrcode-terminal'); // For displaying QR in terminal logs
const { Client, LocalAuth } = require('whatsapp-web.js');

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
    // Check if qrCodeString contains an image tag (meaning QR is ready)
    if (qrCodeString.startsWith('<img src="data:image/png;base64,')) {
        res.send(`
            <h1>Scan this QR Code:</h1>
            ${qrCodeString}
            <p>Refresh this page if the QR code doesn't appear immediately or changes.</p>
            <p>Once scanned, the QR code will disappear, and the bot will show 'Client is ready!'</p>
        `);
    } else {
        // If not an image, display the status text
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

    // Format the number to WhatsApp's expected format (e.g., "2126xxxxxx@c.us")
    // Assumes 'number' comes as a string like "2126xxxxxx"
    const formattedNumber = number.includes('@c.us') ? number : `${number}@c.us`;

    try {
        // Ensure the WhatsApp client is ready before attempting to send a message
        if (client.info && client.info.me && client.info.me.user) { // More robust check for client readiness
            const sentMessage = await client.sendMessage(formattedNumber, message);
            console.log(`[API Send] Message sent to ${formattedNumber}:`, sentMessage.id.id);
            res.status(200).json({ success: true, id: sentMessage.id.id, message: `Message sent to ${number}` });
        } else {
            console.warn(`[API Send] WhatsApp client not ready. Attempted to send to ${formattedNumber}.`);
            res.status(500).json({ error: 'WhatsApp client is not ready. Please scan QR or check bot status.', status: qrCodeString });
        }
    } catch (error) {
        console.error(`[API Send] Error sending message to ${formattedNumber}:`, error);
        // Provide more detail in the error response for debugging
        res.status(500).json({
            error: 'Failed to send message.',
            details: error.message,
            statusCode: error.statusCode || 'N/A', // Include HTTP status if available
            responseBody: error.responseBody || 'N/A' // Include response body if available
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
        clientId: 'client-one', // A unique ID for this session
        dataPath: '/var/data'   // CRITICAL: This MUST match your Render Disk mount path
    }),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // This helps with memory on Render
            '--disable-gpu'
        ],
        headless: true // Keep this true for server environments
    }
});

// Event listener for when the QR code is generated
client.on('qr', qr => {
    qrcodeTerminal.generate(qr, { small: true }); // Display QR in terminal logs (for Render logs)
    console.log('QR RECEIVED (terminal format)');

    // Generate Data URL for image to display on web page
    qrcode.toDataURL(qr, (err, url) => {
        if (err) {
            console.error('Error generating QR code image for web:', err);
            qrCodeString = 'Error generating QR code image for web.';
        } else {
            // Update the string with the HTML <img> tag
            qrCodeString = `<img src="${url}" alt="QR Code" width="300" height="300"/>`;
            console.log('QR code image data URL generated.');
        }
    });
});

// Event listener for when the client is ready
client.on('ready', () => {
    console.log('Client is ready!');
    qrCodeString = 'Client is ready! You are logged in.'; // Update status for web display
});

// Event listener for incoming messages
client.on('message', message => {
    if (message.body === '!ping') {
        message.reply('pong');
    } else if (message.body === '!info') {
        client.info.getBatteryStatus().then(battery => {
            message.reply(`Battery: ${battery.battery}% ${battery.plugged ? '(Plugged in)' : '(Not plugged in)'}`);
        });
    } else if (message.body === '!echo' && message.hasQuotedMsg) {
        message.getQuotedMessage().then(quotedMsg => {
            message.reply(`You echoed: ${quotedMsg.body}`);
        });
    } else if (message.body.startsWith('!echo ')) {
        const textToEcho = message.body.substring(6);
        message.reply(`You echoed: ${textToEcho}`);
    }
});

// Event listener for disconnection
client.on('disconnected', (reason) => {
    console.log('Client was disconnected', reason);
    qrCodeString = `Bot disconnected: ${reason}. Please restart or check logs.`;
    // IMPORTANT: In production, consider a re-initialization strategy here.
    // For now, Render will usually restart the service, which will re-run initialize.
    // client.initialize(); // Uncommenting this might lead to restart loops if not handled carefully
});

// Initialize the WhatsApp client
client.initialize();