const https = require('https');

const address = "0xC92bDEEc2A26e908922400117B6E627B494eA2CD"; // User requested address
const STORY_API_BASE = "https://www.storyscan.io/api/v2";
const API_KEY = 'MhBsxkU1z9fG6TofE59KqiiWV-YlYE8Q4awlLQehF3U';

async function get(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json',
                'X-API-Key': API_KEY
            }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    console.error("Parse Error", e.message, data);
                    resolve({});
                }
            });
        }).on('error', reject);
    });
}

async function debug() {
    console.log(`Fetching transactions for ${address}...`);

    try {
        const res = await get(`${STORY_API_BASE}/addresses/${address}/transactions`);
        if (res.items && res.items.length > 0) {
            console.log("Total Items:", res.items.length);
            console.log("First Item (Index 0) Timestamp:", res.items[0].timestamp);
            console.log("Last Item (Index End) Timestamp:", res.items[res.items.length - 1].timestamp);

            const firstDate = new Date(res.items[0].timestamp);
            const lastDate = new Date(res.items[res.items.length - 1].timestamp);

            if (firstDate > lastDate) {
                console.log("CONCLUSION: API returns NEWEST first (Correct).");
            } else {
                console.log("CONCLUSION: API returns OLDEST first (Incorrect for Last Active).");
            }
        } else {
            console.log("No transactions found.");
        }

    } catch (error) {
        console.error("Error:", error);
    }

    console.log(`Fetching data for ${address}...`);

    try {
        const info = await get(`${STORY_API_BASE}/addresses/${address}`);
        console.log("--- INFO ---");
        console.log("coin_balance:", info.coin_balance);
        console.log("exchange_rate:", info.exchange_rate);
        console.log("Full Info Keys:", Object.keys(info));

        const tokens = await get(`${STORY_API_BASE}/addresses/${address}/token-balances`);
        console.log("\n--- TOKENS ---");
        console.log("Is Array?", Array.isArray(tokens));
        if (Array.isArray(tokens)) {
            tokens.forEach((t, i) => {
                console.log(`Token ${i}:`, t.token ? t.token.symbol : 'No Token Info', "Value:", t.value);
                if (t.token) {
                    console.log("  Exchange Rate:", t.token.exchange_rate);
                    console.log("  Decimals:", t.token.decimals);
                }
            });
        } else {
            console.log("Tokens Response:", tokens);
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

debug();
