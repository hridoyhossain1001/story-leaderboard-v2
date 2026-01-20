const https = require('https');
const fs = require('fs');

const STORY_API_BASE = 'https://www.storyscan.io/api/v2';
const API_KEY = 'MhBsxkU1z9fG6TofE59KqiiWV-YlYE8Q4awlLQehF3U';

const ADDRESS = '0x4Ec04c2ca8ef0061170d9EB5589aA09a80ce0Fff';

async function get(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json',
                'X-API-Key': API_KEY
            }
        }, (res) => {
            console.log(`Status Code: ${res.statusCode}`);
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode !== 200) {
                        console.error("API Error:", parsed);
                    }
                    resolve(parsed);
                } catch {
                    console.error("Raw Data:", data);
                    reject(new Error('Invalid JSON'));
                }
            });
        });
        req.on('error', reject);
    });
}

async function run() {
    console.log(`Fetching transactions for ${ADDRESS}...`);
    const url = `${STORY_API_BASE}/addresses/${ADDRESS}/transactions?items_count=50`;
    try {
        const res = await get(url);
        if (res.items) {
            console.log(`Fetched ${res.items.length} transactions.`);
            fs.writeFileSync('tx_dump.json', JSON.stringify(res.items, null, 2));
            console.log("Saved to tx_dump.json");
        } else {
            console.log("No items found. Response keys:", Object.keys(res));
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();
