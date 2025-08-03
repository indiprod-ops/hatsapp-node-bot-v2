// Required Node.js modules
const express = require('express');
const qrcode = require('qrcode'); // For generating QR code image for web display
const qrcodeTerminal = require('qrcode-terminal'); // For displaying QR in terminal logs
const { Client, LocalAuth } = require('whatsapp-web.js');
const axios = require('axios'); // For making HTTP requests to your GAS API

// ------------------- Configuration Variables -------------------
// Load environment variables (best practice for security)
require('dotenv').config();

const WOO_CONSUMER_KEY = process.env.WOO_CONSUMER_KEY;
const WOO_CONSUMER_SECRET = process.env.WOO_CONSUMER_SECRET;
const WOO_STORE_URL = process.env.WOO_STORE_URL;
const GAS_API_URL = process.env.GAS_API_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ------------------- Express Web Server Setup -------------------
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

let qrCodeString = 'Loading QR code...';

// Basic Express server for health check
app.get('/', (req, res) => {
    res.send(`
        <h1>WhatsApp Bot is Running!</h1>
        <p>Status: ${qrCodeString.includes('img') ? 'QR Code available or Client Ready!' : qrCodeString}</p>
    `);
});

// Endpoint to display the QR code as an image
app.get('/qr', (req, res) => {
    if (qrCodeString.startsWith('<img src="data:image/png;base64,')) {
        res.send(`
            <h1>Scan this QR Code:</h1>
            ${qrCodeString}
            <p>Once scanned, the QR code will disappear.</p>
        `);
    } else {
        res.send(`
            <h1>Waiting for QR Code...</h1>
            <p>${qrCodeString}</p>
        `);
    }
});

// Start the Express web server
app.listen(PORT, () => {
    console.log(`[SERVER] Web server listening on port ${PORT}`);
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
    console.log('[WHATSAPP] QR Code received.');
    qrcodeTerminal.generate(qr, { small: true });

    qrcode.toDataURL(qr, (err, url) => {
        if (err) {
            console.error('[WHATSAPP] Error generating QR code image for web:', err);
            qrCodeString = 'Error generating QR code image.';
        } else {
            qrCodeString = `<img src="${url}" alt="QR Code" width="300" height="300"/>`;
            console.log('[WHATSAPP] QR code image data URL generated.');
        }
    });
});

// Event listener for when the client is ready
client.on('ready', () => {
    console.log('[WHATSAPP] Client is ready!');
    qrCodeString = 'Client is ready! You are logged in.';
});

// Function to get product from WooCommerce API
const getWooProduct = async (query) => {
    console.log(`[WOOCOMMERCE] Attempting to fetch products for query: '${query}'`);
    if (!WOO_CONSUMER_KEY || !WOO_CONSUMER_SECRET || !WOO_STORE_URL) {
        console.error('[WOOCOMMERCE] WooCommerce configuration is not complete!');
        return null;
    }

    try {
        const response = await axios.get(
            `${WOO_STORE_URL}/wp-json/wc/v3/products`,
            {
                params: {
                    search: query,
                    consumer_key: WOO_CONSUMER_KEY,
                    consumer_secret: WOO_CONSUMER_SECRET,
                    per_page: 5
                }
            }
        );
        console.log(`[WOOCOMMERCE] Successfully fetched ${response.data.length} products.`);
        return response.data;
    } catch (error) {
        console.error('[WOOCOMMERCE] Error fetching product from WooCommerce:', error.response ? error.response.data : error.message);
        return null;
    }
};

// Event listener for incoming messages
client.on('message', async message => {
    const chat = await message.getChat();
    console.log(`[MESSAGE] Received message from ${chat.name || chat.id.user}: "${message.body}"`);

    if (message.body.toUpperCase().startsWith('OF')) {
        // Existing logic for Google Apps Script
        console.log('[INTENT] Detected command: Order Tracking');
        let orderNumber = message.body.toUpperCase().trim().replace('?', '');
        
        try {
            const response = await axios.get(GAS_API_URL, { params: { orderNumber: orderNumber } });
            const apiResponse = response.data;
            
            if (apiResponse.status === 'success') {
                const data = apiResponse.data;
                let replyMessageParts = [];
                
                const getVal = (key) => data[key] || '';
                let lineNumClient = `*${getVal('Numéro')}*`;
                if (getVal('Numéro Client')) lineNumClient += ` - ${getVal('Numéro Client')}`;
                if (lineNumClient.trim() !== '*') replyMessageParts.push(lineNumClient);

                // Add other fields to the reply
                if (getVal('Statut')) replyMessageParts.push(`Statut: *${getVal('Statut')}*`);
                if (getVal('Livraison')) replyMessageParts.push(`Livraison: *${getVal('Livraison')}*`);
                if (getVal('Date')) replyMessageParts.push(`Date: *${getVal('Date')}*`);
                
                let finalReplyMessage = replyMessageParts.join('\n');
                console.log('[RESPONSE] Sending order status message.');
                message.reply(finalReplyMessage.trim());
            } else if (apiResponse.status === 'not_found') {
                console.log('[RESPONSE] Order number not found.');
                message.reply(`Numéro de commande '${orderNumber}' introuvable.`);
            } else {
                console.error('[API_ERROR] Error from GAS API:', apiResponse);
                message.reply(`Une erreur est survenue lors de la récupération des données.`);
            }
        } catch (error) {
            console.error('[API_ERROR] Error fetching data from GAS API:', error.message);
            message.reply('Désolé, une erreur technique est survenue.');
        }
    } else {
        // --- LOGIQUE AMÉLIORÉE POUR L'IA ET WOOCOMMERCE ---
        console.log('[INTENT] Detected: General/Product query');
        try {
            if (!GEMINI_API_KEY) {
                console.error('[GEMINI] API key is not set!');
                message.reply("Désolé, la clé API de l'IA est manquante.");
                return;
            }

            // On envoie la requête du client à WooCommerce pour une recherche
            const wooProducts = await getWooProduct(message.body);

            let productContext = '';
            if (wooProducts && wooProducts.length > 0) {
                console.log('[WOOCOMMERCE] Products found. Formatting context for Gemini.');
                productContext = `
Voici les informations de produits pertinentes de ma boutique en ligne :
${wooProducts.map(p => `
    Nom du produit: ${p.name}
    Prix: ${p.price} €
    Description: ${p.short_description ? p.short_description.replace(/<[^>]*>/g, '') : 'Pas de description'}
    Stock: ${p.stock_status === 'instock' ? 'En stock' : 'Rupture de stock'}
    URL: ${p.permalink}
`).join('\n---\n')}
`;
            } else {
                console.log('[WOOCOMMERCE] No products found for the query.');
                productContext = "Aucun produit de notre catalogue n'a été trouvé pour la requête du client.";
            }

            // On enrichit le prompt pour l'IA avec les données des produits
            const prompt = `
Tu es un assistant de chat pour une boutique en ligne. Ton rôle est de répondre aux questions des clients en utilisant les données fournies.
${productContext}

Question du client : "${message.body}"

Réponds de manière concise, polie et utile. Si tu n'as pas l'information dans le contexte des produits, tu peux dire que tu ne la trouves pas mais tu ne dois pas inventer d'informations. Indique que les prix sont en euros.
`;
            console.log('[GEMINI] Sending prompt to API...');
            
            const geminiResponse = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
                { contents: [{ parts: [{ text: prompt }] }] },
                { headers: { 'Content-Type': 'application/json' } }
            );

            const geminiText = geminiResponse.data.candidates[0].content.parts[0].text;
            console.log('[RESPONSE] Sending Gemini response.');
            message.reply(geminiText);

        } catch (error) {
            console.error('[GEMINI] Error with Gemini API:', error.response ? error.response.data : error.message);
            message.reply("Désolé, je n'ai pas pu traiter votre demande pour le moment. L'IA a rencontré une erreur.");
        }
    }
});

// Event listener for disconnection
client.on('disconnected', (reason) => {
    console.log('[WHATSAPP] Client was disconnected', reason);
    qrCodeString = `Bot disconnected: ${reason}. Please restart or check logs.`;
});

// Initialize the WhatsApp client
client.initialize();