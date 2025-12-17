const fs = require('fs');
const path = require('path');
const https = require('https');

const FILE = path.join(__dirname, 'public', 'known_domains.json');
const API_BASE = 'https://www.storyscan.io/api/v2';
const CONCURRENCY = 5; // Scan 5 wallets at a time for speed

async function get(url) {
    return new Promise((resolve) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve({});
                }
            });
        }).on('error', () => resolve({}));
    });
}

async function fetchWalletData(address) {
    try {
        // Fetch Balance & Counters concurrently
        const [info, counters] = await Promise.all([
            get(`${API_BASE}/addresses/${address}`),
            get(`${API_BASE}/addresses/${address}/counters`)
        ]);

        let balance = "0.00";
        if (info && info.coin_balance) {
            balance = (Number(BigInt(info.coin_balance)) / 1e18).toFixed(2);
        }

        let txCount = 0;
        if (counters && counters.transactions_count) {
            txCount = parseInt(counters.transactions_count);
        }

        return { balance, txCount, success: true };
    } catch (e) {
        return { success: false };
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    console.log("🚀 Starting Fast Rescan...");

    if (!fs.existsSync(FILE)) {
        console.error("❌ known_domains.json not found!");
        return;
    }

    let data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    console.log(`Loaded ${data.length} wallets.`);

    let updatedCount = 0;

    // Process in chunks
    for (let i = 0; i < data.length; i += CONCURRENCY) {
        const chunk = data.slice(i, i + CONCURRENCY);
        const promises = chunk.map(async (entry) => {
            const result = await fetchWalletData(entry.address);
            if (result.success) {
                // Update entry
                entry.balance = result.balance;
                entry.transaction_count = result.txCount;
                entry.last_active = Date.now(); // Mark as recently checked
                return true;
            }
            return false;
        });

        const results = await Promise.all(promises);
        updatedCount += results.filter(r => r).length;

        // Progress bar style output
        process.stdout.write(`\r⚡ Progress: ${i + chunk.length}/${data.length} | Updated: ${updatedCount}`);

        // Save every 50 wallets to see live updates
        if ((i + chunk.length) % 50 === 0) {
            fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
        }

        // Small breathing room for API
        await sleep(100);
    }

    // Final Save
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
    console.log(`\n\n✅ Complete! Updated ${updatedCount} wallets.`);
    console.log("Website should reflect these changes immediately.");
}

run();
