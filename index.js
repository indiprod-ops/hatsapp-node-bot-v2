// Start the Express web server
app.listen(PORT, () => {
    console.log(`[SERVER] Serveur web en écoute sur le port ${PORT}`);
    console.log(`[DEBUG] Endpoint de debug WooCommerce: http://localhost:${PORT}/debug/woocommerce`);
});// Required Node.js modules
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

// Validation des variables d'environnement requises
const validateEnvironmentVariables = () => {
    const required = ['GEMINI_API_KEY', 'GAS_API_URL'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        console.error(`[CONFIG] Variables d'environnement manquantes: ${missing.join(', ')}`);
    }
    
    // WooCommerce est optionnel
    if (!WOO_CONSUMER_KEY || !WOO_CONSUMER_SECRET || !WOO_STORE_URL) {
        console.warn('[CONFIG] Configuration WooCommerce incomplète - les requêtes produits seront désactivées');
    }
    
    return missing.length === 0;
};

validateEnvironmentVariables();

// ------------------- Express Web Server Setup -------------------
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

let qrCodeString = 'Loading QR code...';
let clientStatus = 'Initializing...';

// Basic Express server for health check
app.get('/', (req, res) => {
    res.send(`
        <h1>WhatsApp Bot is Running!</h1>
        <p>Status: ${clientStatus}</p>
        <p>QR Status: ${qrCodeString.includes('img') ? 'QR Code disponible' : qrCodeString}</p>
        <p><a href="/qr">Voir le QR Code</a></p>
    `);
});

// Endpoint to display the QR code as an image
app.get('/qr', (req, res) => {
    if (qrCodeString.startsWith('<img src="data:image/png;base64,')) {
        res.send(`
            <h1>Scannez ce QR Code:</h1>
            <div style="text-align: center;">
                ${qrCodeString}
            </div>
            <p style="text-align: center;">Une fois scanné, le QR code disparaîtra.</p>
            <script>
                setTimeout(() => {
                    window.location.reload();
                }, 5000);
            </script>
        `);
    } else {
        res.send(`
            <h1>En attente du QR Code...</h1>
            <p>${qrCodeString}</p>
            <script>
                setTimeout(() => {
                    window.location.reload();
                }, 3000);
            </script>
        `);
    }
});

// Add debugging endpoint for WooCommerce
app.get('/debug/woocommerce', async (req, res) => {
    if (!isWooCommerceConfigured()) {
        return res.json({
            status: 'error',
            message: 'WooCommerce non configuré',
            config: {
                hasKey: !!WOO_CONSUMER_KEY,
                hasSecret: !!WOO_CONSUMER_SECRET,
                hasUrl: !!WOO_STORE_URL
            }
        });
    }

    try {
        const connectionTest = await testWooCommerceConnection();
        const testProducts = await getWooProduct('test');
        
        res.json({
            status: 'success',
            connectionTest,
            config: {
                url: WOO_STORE_URL,
                hasKey: !!WOO_CONSUMER_KEY,
                hasSecret: !!WOO_CONSUMER_SECRET,
                keyLength: WOO_CONSUMER_KEY ? WOO_CONSUMER_KEY.length : 0,
                secretLength: WOO_CONSUMER_SECRET ? WOO_CONSUMER_SECRET.length : 0
            },
            testProductCount: testProducts ? testProducts.length : 0
        });
    } catch (error) {
        res.json({
            status: 'error',
            message: error.message,
            config: {
                url: WOO_STORE_URL,
                hasKey: !!WOO_CONSUMER_KEY,
                hasSecret: !!WOO_CONSUMER_SECRET
            }
        });
    }
});

// ------------------- WhatsApp-web.js Bot Setup -------------------
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'client-one',
        dataPath: './wwebjs_auth'
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
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
        ],
        headless: true,
        timeout: 60000
    }
});

// Event listener for when the QR code is generated
client.on('qr', qr => {
    console.log('[WHATSAPP] QR Code reçu.');
    clientStatus = 'En attente de scan QR Code';
    qrcodeTerminal.generate(qr, { small: true });

    qrcode.toDataURL(qr, (err, url) => {
        if (err) {
            console.error('[WHATSAPP] Erreur génération QR code image:', err);
            qrCodeString = 'Erreur génération QR code image.';
        } else {
            qrCodeString = `<img src="${url}" alt="QR Code" width="300" height="300"/>`;
            console.log('[WHATSAPP] QR code image data URL généré.');
        }
    });
});

// Event listener for when the client is ready
client.on('ready', async () => {
    console.log('[WHATSAPP] Client prêt!');
    clientStatus = 'Connecté et prêt';
    qrCodeString = 'Client prêt! Vous êtes connecté.';
    
    // Test WooCommerce connection on startup
    if (isWooCommerceConfigured()) {
        console.log('[INIT] Test de la connexion WooCommerce...');
        const wooConnectionTest = await testWooCommerceConnection();
        if (wooConnectionTest) {
            console.log('[INIT] ✅ WooCommerce prêt');
        } else {
            console.log('[INIT] ❌ Problème avec WooCommerce');
        }
    }
});

// Event listener for authentication success
client.on('authenticated', () => {
    console.log('[WHATSAPP] Authentification réussie');
    clientStatus = 'Authentifié';
});

// Event listener for authentication failure
client.on('auth_failure', msg => {
    console.error('[WHATSAPP] Échec authentification:', msg);
    clientStatus = 'Échec authentification';
});

// Function to check if WooCommerce is configured
const isWooCommerceConfigured = () => {
    return WOO_CONSUMER_KEY && WOO_CONSUMER_SECRET && WOO_STORE_URL;
};

// Function to test WooCommerce API connection
const testWooCommerceConnection = async () => {
    if (!isWooCommerceConfigured()) {
        console.warn('[WOOCOMMERCE] Configuration incomplète - test ignoré');
        return false;
    }

    try {
        console.log('[WOOCOMMERCE] Test de connexion...');
        const testUrl = `${WOO_STORE_URL}/wp-json/wc/v3/system_status`;
        
        const response = await axios.get(testUrl, {
            auth: {
                username: WOO_CONSUMER_KEY,
                password: WOO_CONSUMER_SECRET
            },
            timeout: 10000,
            headers: {
                'User-Agent': 'WhatsApp-Bot/1.0'
            }
        });

        console.log('[WOOCOMMERCE] ✅ Connexion API réussie');
        return true;
    } catch (error) {
        console.error('[WOOCOMMERCE] ❌ Échec test connexion:', {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            url: error.config?.url,
            headers: error.response?.headers
        });
        return false;
    }
};

// Function to get product from WooCommerce API
const getWooProduct = async (query) => {
    console.log(`[WOOCOMMERCE] Tentative récupération produits pour: '${query}'`);
    
    if (!isWooCommerceConfigured()) {
        console.warn('[WOOCOMMERCE] Configuration WooCommerce incomplète!');
        return null;
    }

    try {
        // Clean and format the WooCommerce store URL
        const baseUrl = WOO_STORE_URL.replace(/\/$/, ''); // Remove trailing slash
        const apiUrl = `${baseUrl}/wp-json/wc/v3/products`;
        
        console.log('[WOOCOMMERCE] URL de requête:', apiUrl);
        console.log('[WOOCOMMERCE] Paramètres de recherche:', { search: query, per_page: 5 });
        
        const response = await axios.get(apiUrl, {
            auth: {
                username: WOO_CONSUMER_KEY,
                password: WOO_CONSUMER_SECRET
            },
            params: {
                search: query,
                per_page: 5,
                status: 'publish',
                orderby: 'relevance'
            },
            timeout: 15000,
            headers: {
                'User-Agent': 'WhatsApp-Bot/1.0',
                'Accept': 'application/json'
            }
        });

        console.log(`[WOOCOMMERCE] ✅ ${response.data.length} produits récupérés avec succès.`);
        
        // Log first product for debugging
        if (response.data.length > 0) {
            console.log('[WOOCOMMERCE] Premier produit:', {
                name: response.data[0].name,
                price: response.data[0].price,
                stock_status: response.data[0].stock_status
            });
        }
        
        return response.data;
    } catch (error) {
        console.error('[WOOCOMMERCE] ❌ Erreur récupération produit:', {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            url: error.config?.url,
            method: error.config?.method
        });

        // Specific error handling
        if (error.response?.status === 404) {
            console.error('[WOOCOMMERCE] 🔍 Erreur 404 - Vérifiez:');
            console.error('- URL du site WooCommerce correct');
            console.error('- Permaliens activés dans WordPress');
            console.error('- WooCommerce REST API activé');
        } else if (error.response?.status === 401) {
            console.error('[WOOCOMMERCE] 🔐 Erreur 401 - Vérifiez:');
            console.error('- Consumer Key correct');
            console.error('- Consumer Secret correct');
            console.error('- Permissions API suffisantes');
        } else if (error.response?.status === 403) {
            console.error('[WOOCOMMERCE] 🚫 Erreur 403 - Permissions insuffisantes');
        }

        return null;
    }
};

// Function to format order status message
const formatOrderStatusMessage = (data) => {
    const getVal = (key) => data[key] || '';
    let replyMessageParts = [];

    // Numéro - Client
    let lineNumClient = `*${getVal('Numéro')}*`;
    if (getVal('Numéro Client')) lineNumClient += ` - ${getVal('Numéro Client')}`;
    if (lineNumClient.trim() !== '**') replyMessageParts.push(lineNumClient);

    // Date de commande
    if (getVal('Date de commande')) {
        replyMessageParts.push(`📅 *Date:* ${getVal('Date de commande')}`);
    }

    // Statut
    if (getVal('Statut')) {
        const status = getVal('Statut');
        let statusEmoji = '📦';
        if (status.toLowerCase().includes('livré')) statusEmoji = '✅';
        else if (status.toLowerCase().includes('expédié')) statusEmoji = '🚚';
        else if (status.toLowerCase().includes('préparation')) statusEmoji = '⏳';
        
        replyMessageParts.push(`${statusEmoji} *Statut:* ${status}`);
    }

    // Client
    if (getVal('Client')) {
        replyMessageParts.push(`👤 *Client:* ${getVal('Client')}`);
    }

    // Téléphone
    if (getVal('Téléphone')) {
        replyMessageParts.push(`📞 *Téléphone:* ${getVal('Téléphone')}`);
    }

    // Adresse
    if (getVal('Adresse')) {
        replyMessageParts.push(`📍 *Adresse:* ${getVal('Adresse')}`);
    }

    // Total
    if (getVal('Total')) {
        replyMessageParts.push(`💰 *Total:* ${getVal('Total')}`);
    }

    // Transporteur
    if (getVal('Transporteur')) {
        replyMessageParts.push(`🚛 *Transporteur:* ${getVal('Transporteur')}`);
    }

    // Numéro de suivi
    if (getVal('Numéro de suivi')) {
        replyMessageParts.push(`📋 *Suivi:* ${getVal('Numéro de suivi')}`);
    }

    // Notes
    if (getVal('Notes')) {
        replyMessageParts.push(`📝 *Notes:* ${getVal('Notes')}`);
    }

    return replyMessageParts.join('\n');
};

// Event listener for incoming messages
client.on('message', async message => {
    try {
        const chat = await message.getChat();
        console.log(`[MESSAGE] Message reçu de ${chat.name || chat.id.user}: "${message.body}"`);

        if (message.body.toUpperCase().startsWith('OF')) {
            // Existing logic for Google Apps Script
            console.log('[INTENT] Commande détectée: Suivi de commande');
            let orderNumber = message.body.toUpperCase().trim().replace('?', '');
           
            try {
                if (!GAS_API_URL) {
                    throw new Error('GAS_API_URL non configuré');
                }

                console.log('[GAS] Requête vers:', GAS_API_URL, 'avec orderNumber:', orderNumber);
                
                const response = await axios.get(GAS_API_URL, { 
                    params: { orderNumber: orderNumber },
                    timeout: 15000
                });
                
                const apiResponse = response.data;
               
                if (apiResponse.status === 'success') {
                    const formattedMessage = formatOrderStatusMessage(apiResponse.data);
                    console.log('[RESPONSE] Envoi message statut commande.');
                    await message.reply(formattedMessage);
                } else if (apiResponse.status === 'not_found') {
                    console.log('[RESPONSE] Numéro de commande introuvable.');
                    await message.reply(`❌ Numéro de commande '${orderNumber}' introuvable.`);
                } else {
                    console.error('[API_ERROR] Erreur API GAS:', apiResponse);
                    await message.reply(`⚠️ Une erreur est survenue lors de la récupération des données.`);
                }
            } catch (error) {
                console.error('[API_ERROR] Erreur requête GAS API:', error.message);
                await message.reply('❌ Désolé, une erreur technique est survenue lors du suivi de commande.');
            }
        } else {
            // New logic for Gemini chatbot with WooCommerce integration
            console.log('[INTENT] Détecté: Requête générale/produit');
            
            try {
                if (!GEMINI_API_KEY) {
                    throw new Error('Clé API Gemini manquante');
                }

                let productContext = '';
                const lowerCaseMessage = message.body.toLowerCase();
               
                // Détecter si l'utilisateur demande des informations produit
                const productKeywords = ['produit', 'disponible', 'liste', 'prix', 'acheter', 'commander', 'stock', 'catalogue'];
                const isProductQuery = productKeywords.some(keyword => lowerCaseMessage.includes(keyword));

                if (isProductQuery && isWooCommerceConfigured()) {
                    console.log('[INTENT] Utilisateur demande des produits. Récupération WooCommerce...');
                    
                    // Extract meaningful search terms from the message
                    const searchTerms = message.body
                        .toLowerCase()
                        .replace(/[^\w\s]/g, ' ')
                        .split(' ')
                        .filter(word => word.length > 2 && !['produit', 'disponible', 'liste', 'prix', 'acheter'].includes(word))
                        .join(' ')
                        .trim();
                    
                    const searchQuery = searchTerms || message.body;
                    console.log('[WOOCOMMERCE] Recherche avec termes:', searchQuery);
                    
                    const wooProducts = await getWooProduct(searchQuery);

                    if (wooProducts && wooProducts.length > 0) {
                        console.log('[WOOCOMMERCE] Produits trouvés. Formatage contexte pour Gemini.');
                        productContext = `
Voici les informations produits pertinentes de notre boutique en ligne :

${wooProducts.map((p, index) => {
    const price = p.price || p.regular_price || 'Prix sur demande';
    const salePrice = p.sale_price ? ` (Prix promo: ${p.sale_price}€)` : '';
    const description = (p.short_description || p.description || 'Pas de description disponible')
        .replace(/<[^>]*>/g, '')
        .replace(/&[^;]+;/g, '')
        .substring(0, 150);
    
    return `
🛍️ **${p.name}**
   💰 Prix: ${price}€${salePrice}
   📝Description: ${description}${description.length >= 150 ? '...' : ''}
   📦 Stock: ${p.stock_status === 'instock' ? '✅ En stock' : '❌ Rupture de stock'}
   🆔 SKU: ${p.sku || 'N/A'}
   🔗 Voir le produit: ${p.permalink}
`;
                        }).join('\n---\n')}

INSTRUCTIONS: Utilise ces informations pour répondre au client de manière commerciale mais honnête. 
- Mentionne les prix en euros
- Indique le statut du stock
- Si un produit est en rupture, propose des alternatives si disponibles
- Sois enthousiaste mais professionnel
- N'invente pas d'informations non fournies
`;
                    } else {
                        console.log('[WOOCOMMERCE] Aucun produit trouvé pour la requête.');
                        productContext = `Aucun produit spécifique n'a été trouvé pour "${searchQuery}" dans notre catalogue. 
Suggestions pour le client:
- Reformuler sa recherche avec d'autres mots-clés
- Demander la liste complète des produits disponibles
- Contacter directement pour des produits spécifiques`;
                    }
                } else if (isProductQuery && !isWooCommerceConfigured()) {
                    productContext = "La boutique en ligne n'est pas configurée actuellement. Veuillez contacter l'administrateur.";
                }

                const prompt = productContext ? 
                    `${productContext}\n\nQuestion du client : ${message.body}\n\nRéponds en français, sois utile et professionnel.` : 
                    `Question du client : ${message.body}\n\nRéponds en français, sois utile et professionnel.`;
                
                console.log('[GEMINI] Envoi prompt vers API...');
               
                const geminiResponse = await axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
                    { 
                        contents: [{ 
                            parts: [{ text: prompt }] 
                        }],
                        generationConfig: {
                            temperature: 0.7,
                            topK: 40,
                            topP: 0.95,
                            maxOutputTokens: 1024,
                        }
                    },
                    { 
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 15000
                    }
                );

                if (geminiResponse.data.candidates && geminiResponse.data.candidates[0]) {
                    const geminiText = geminiResponse.data.candidates[0].content.parts[0].text;
                    console.log('[RESPONSE] Envoi réponse Gemini.');
                    await message.reply(geminiText);
                } else {
                    throw new Error('Réponse Gemini invalide');
                }

            } catch (error) {
                console.error('[GEMINI] Erreur API Gemini:', {
                    message: error.message,
                    response: error.response?.data,
                    status: error.response?.status
                });
                await message.reply("❌ Désolé, je n'ai pas pu traiter votre demande pour le moment. L'IA a rencontré une erreur.");
            }
        }
    } catch (error) {
        console.error('[MESSAGE] Erreur traitement message:', error);
        try {
            await message.reply("❌ Une erreur inattendue s'est produite. Veuillez réessayer.");
        } catch (replyError) {
            console.error('[MESSAGE] Erreur envoi réponse d\'erreur:', replyError);
        }
    }
});

// Event listener for disconnection
client.on('disconnected', (reason) => {
    console.log('[WHATSAPP] Client déconnecté:', reason);
    clientStatus = `Bot déconnecté: ${reason}`;
    qrCodeString = `Bot déconnecté: ${reason}. Veuillez redémarrer ou vérifier les logs.`;
});

// Error handling
client.on('error', (error) => {
    console.error('[WHATSAPP] Erreur client:', error);
    clientStatus = `Erreur: ${error.message}`;
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('[SHUTDOWN] Arrêt gracieux...');
    try {
        await client.destroy();
        console.log('[SHUTDOWN] Client WhatsApp fermé.');
    } catch (error) {
        console.error('[SHUTDOWN] Erreur fermeture client:', error);
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('[SHUTDOWN] Signal SIGTERM reçu...');
    try {
        await client.destroy();
        console.log('[SHUTDOWN] Client WhatsApp fermé.');
    } catch (error) {
        console.error('[SHUTDOWN] Erreur fermeture client:', error);
    }
    process.exit(0);
});

// Initialize the WhatsApp client
console.log('[INIT] Initialisation du client WhatsApp...');
client.initialize().catch(error => {
    console.error('[INIT] Erreur initialisation:', error);
    clientStatus = `Erreur initialisation: ${error.message}`;
});