


// Required Node.js modules
const express = require('express');
const qrcode = require('qrcode'); // For generating QR code image for web display
const qrcodeTerminal = require('qrcode-terminal'); // For displaying QR in terminal logs
const { Client, LocalAuth } = require('whatsapp-web.js');
const axios = require('axios'); // For making HTTP requests to your GAS API

// ------------------- Configuration Variables -------------------
// IMPORTANT: Replace this with your actual GAS Web App URL
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwh-b0VEWGQxnR-H7gXWvRfCA0rFnbbXWfTEKSFIGqYhI_-RulrgnmGS69yX2wu-e_b/exec"; 
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
client.on('message', async message => {
    const chat = await message.getChat();

    // Helper to get value or empty string
    const getVal = (key) => data[key] || '';

    // Helper to format date
    const formatDateToDDMM = (dateValue) => {
        if (!dateValue) return '';
        try {
            const date = new Date(dateValue);
            if (isNaN(date.getTime())) {
                return dateValue; // If not a valid date, return original
            }
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            return `${day}.${month}`;
        } catch (e) {
            return dateValue;
        }
    };

    // Handle commands like "OF17001?" or "OF17001"
    if (message.body.toUpperCase().startsWith('OF')) {
        let orderNumber = message.body.toUpperCase().trim();

        // Remove the trailing '?' if present
        if (orderNumber.endsWith('?')) {
            orderNumber = orderNumber.slice(0, -1);
        }

        console.log(`Received potential order command: ${orderNumber}`);

        try {
            // Make the request to your Google Apps Script API
            const response = await axios.get(GAS_API_URL, {
                params: {
                    orderNumber: orderNumber
                }
            });

            const apiResponse = response.data;

            if (apiResponse.status === 'success') {
                const data = apiResponse.data;
                let replyMessageParts = []; 

                // --- Section "Sans en-tête" ---
                // Numéro - Client
                let lineNumClient = `*${getVal('Numéro')}*`;
                if (getVal('Numéro Client')) lineNumClient += ` - ${getVal('Numéro Client')}`;
                if (lineNumClient.trim() !== '*') replyMessageParts.push(lineNumClient);

                // Type - Simple/Double
                let lineTypeDouble = [];
                if (getVal('Type')) lineTypeDouble.push(getVal('Type'));
                if (getVal('Simple/Double')) lineTypeDouble.push(getVal('Simple/Double'));
                if (lineTypeDouble.length > 0) replyMessageParts.push(lineTypeDouble.join(' - '));

                // Température
                let temp = getVal('Température');
                if (temp) replyMessageParts.push(temp);

                // Sens
                let sens = getVal('Sens');
                if (sens) replyMessageParts.push(sens);

                // Détails sens (new: separate line if exists)
                let detailsSens = getVal('Détails sens');
                if (detailsSens) replyMessageParts.push(detailsSens);

                // Hauteur x Largeur x Épaisseur
                let dimParts = [];
                if (getVal('Hauteur')) dimParts.push(getVal('Hauteur'));
                if (getVal('Largeur')) dimParts.push(getVal('Largeur'));
                if (getVal('Épaisseur')) dimParts.push(getVal('Épaisseur'));
                if (dimParts.length > 0) replyMessageParts.push(dimParts.join(' x '));

                // Revêtement Extérieur / Revêtement Intérieur
                let revParts = [];
                if (getVal('Revêtement Extérieur')) revParts.push(getVal('Revêtement Extérieur'));
                if (getVal('Revêtement Intérieur')) revParts.push(getVal('Revêtement Intérieur'));
                if (revParts.length > 0) replyMessageParts.push(revParts.join(' / '));

                // Protection Extérieure / Protection Intérieure
                let protParts = [];
                if (getVal('Protection Extérieure')) protParts.push(getVal('Protection Extérieure'));
                if (getVal('Protection Intérieure')) protParts.push(getVal('Protection Intérieure'));
                if (protParts.length > 0) replyMessageParts.push(protParts.join(' / '));

                // Cadre, Monté_Sur Ép. Panneau
                let cadreMountParts = [];
                if (getVal('Cadre')) cadreMountParts.push(getVal('Cadre'));
                // Make sure this matches your exact Google Sheet header for Ép. Panneau
                if (getVal('Ép. Panneau')) cadreMountParts.push(getVal('Ép. Panneau')); 
                if (cadreMountParts.length > 0) replyMessageParts.push(cadreMountParts.join(', '));

                // Seuil (now on its own line)
                let seuil = getVal('Seuil');
                if (seuil) replyMessageParts.push(seuil);

                // Retour PVC (now on its own line)
                let retourPvc = getVal('Retour PVC');
                if (retourPvc) replyMessageParts.push(retourPvc);

                // Charnières (now on its own line)
                let charnieres = getVal('Charnières');
                if (charnieres) replyMessageParts.push(charnieres);
                
                // Emballage (Quantité Charnières) - remains on its own line
                let qteCharn = getVal('Quantité Charnières');
                if (qteCharn) replyMessageParts.push(qteCharn);

                // Fermeture
                let fermeture = getVal('Fermeture');
                if (fermeture) replyMessageParts.push(fermeture);

                // Serrure
                let serrure = getVal('Serrure');
                if (serrure) replyMessageParts.push(serrure);

                // Système Guide
                let systemeGuide = getVal('Système Guide');
                if (systemeGuide) replyMessageParts.push(systemeGuide);

                // Poignée Mobile / Poignée Fixe
                let poigneeParts = [];
                if (getVal('Poignée Mobile')) poigneeParts.push(getVal('Poignée Mobile'));
                if (getVal('Poignée Fixe')) poigneeParts.push(getVal('Poignée Fixe'));
                if (poigneeParts.length > 0) replyMessageParts.push(poigneeParts.join(' / '));

                // Accessoires
                let accessoires = getVal('Accessoires');
                if (accessoires) replyMessageParts.push(accessoires);

                // Infos
                let infos = getVal('Infos');
                if (infos) replyMessageParts.push(infos);

                // --- Join first section parts ---
                let firstSectionContent = replyMessageParts.join('\n');
                let finalReplyMessage = firstSectionContent;


                // --- Separator and Second section (Dates) ---
                let secondSectionParts = [];
                let toleAluminium = formatDateToDDMM(getVal('Tole Aluminium'));
                let aluminium = formatDateToDDMM(getVal('Aluminium'));
                let injection = formatDateToDDMM(getVal('Injection'));
                let montage = formatDateToDDMM(getVal('Montage'));

                // Always push the title, even if value is empty, as per example
                secondSectionParts.push(`*Tole*: ${toleAluminium}`);
                secondSectionParts.push(`*Aluminium*: ${aluminium}`);
                secondSectionParts.push(`*Injection*: ${injection}`);
                secondSectionParts.push(`*Montage*: ${montage}`);
                
                let secondSectionContent = secondSectionParts.join('\n');
                
                // Add separator and second section content if either section has content
                // The check for secondSectionContent ensures we don't add separator if it's just empty titles
                if (firstSectionContent || secondSectionContent.trim() !== '*Tole*: \n*Aluminium*: \n*Injection*: \n*Montage*: ') {
                    if (finalReplyMessage) finalReplyMessage += `\n`; // Add newline only if first section exists
                    finalReplyMessage += `\n---\n`; 
                    finalReplyMessage += secondSectionContent;
                }

                message.reply(finalReplyMessage.trim()); // Trim final message to remove any leading/trailing newlines
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
    // New logic for Gemini chatbot
    else {
        // This is where we'll handle any message that isn't a known command
        console.log(`Sending message to Gemini API: "${message.body}"`);

        try {
            // Get the API key from the environment variable (secure!)
            const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
            
            if (!GEMINI_API_KEY) {
                console.error('GEMINI_API_KEY is not set as an environment variable!');
                message.reply("Désolé, je ne peux pas répondre pour le moment. La clé API de l'IA est manquante.");
                return;
            }

            const geminiResponse = await axios.post(
                `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
                {
                    contents: [
                        {
                            parts: [
                                {
                                    text: message.body
                                }
                            ]
                        }
                    ]
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                    }
                }
            );

            const geminiText = geminiResponse.data.candidates[0].content.parts[0].text;
            message.reply(geminiText);

        } catch (error) {
            console.error('Error with Gemini API:', error.response ? error.response.data : error.message);
            message.reply("Désolé, je n'ai pas pu traiter votre demande pour le moment. L'IA a rencontré une erreur.");
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