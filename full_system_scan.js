const fs = require('fs');
const path = require('path');
const https = require('https');

const FILE = path.join(__dirname, 'public', 'known_domains.json');
const STORY_API_BASE = 'https://www.storyscan.io/api/v2';

// OPTIMIZED SETTINGS
// STRICT SAFE MODE
const CONCURRENCY = 3; // Scanning 2 wallets at a time (OPTIMAL)
const LIST_FILE = 'Story.txt';

async function get(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
            timeout: 10000
        }, (res) => {
            if (res.statusCode === 429) {
                return reject(new Error(`429`)); // Rate Limit
            }
            if (res.statusCode < 200 || res.statusCode > 299) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    reject(new Error('Invalid JSON'));
                }
            });
        });
        req.on('error', (err) => reject(err));
        req.on('timeout', () => req.destroy());
    });
}

async function fetchWalletDetails(address, retries = 5) {
    try {
        const [info, counters, txs] = await Promise.all([
            get(`${STORY_API_BASE}/addresses/${address}`),
            get(`${STORY_API_BASE}/addresses/${address}/counters`),
            get(`${STORY_API_BASE}/addresses/${address}/transactions`)
        ]);

        let balance = "0.00";
        if (info && info.coin_balance) balance = (Number(BigInt(info.coin_balance)) / 1e18).toFixed(2);

        let txCount = 0;
        if (counters && counters.transactions_count) txCount = parseInt(counters.transactions_count);

        if (parseFloat(balance) > 100000000) balance = "0.00";

        let lastActive = 0;
        if (txs && txs.items && txs.items.length > 0) lastActive = Date.parse(txs.items[0].timestamp);

        return { balance, txCount, lastActive, success: true };
    } catch (e) {
        if (retries > 0) {
            const waitTime = e.message.includes('429') ? 10000 : 3000; // Wait 10s for Rate Limit, 3s for others
            console.log(`⚠️ Rate Limit (429) hit for ${address}... Waiting ${waitTime / 1000}s... (Retries left: ${retries})`);
            await sleep(waitTime);
            return fetchWalletDetails(address, retries - 1);
        }
        return { success: false, error: e.message };
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    console.log(" Starting Full System Scan (OPTIMIZED SPEED 5x)...");

    let existingData = [];
    // Ensure checks for directory and file existence
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(FILE)) {
        try {
            const rawData = fs.readFileSync(FILE, 'utf-8');
            existingData = JSON.parse(rawData);
        } catch (err) {
            console.error("⚠️ Error reading known_domains.json. Starting fresh/empty.", err.message);
            existingData = [];
        }
    } else {
        console.log("⚠️ known_domains.json not found. Creating new empty file.");
        fs.writeFileSync(FILE, JSON.stringify([], null, 2));
    }

    // Remove duplicates
    const uniqueMap = new Map();
    existingData.forEach(d => uniqueMap.set(d.address.toLowerCase(), d));

    // IMPORT FROM STORY.TXT to find missing
    if (fs.existsSync(LIST_FILE)) {
        const rawList = fs.readFileSync(LIST_FILE, 'utf-8');
        const addresses = [...new Set(rawList.split('\n').map(l => l.trim()).filter(l => l.startsWith('0x')))];
        console.log(`📄 Loaded ${addresses.length} addresses from Story.txt`);

        let newCount = 0;
        addresses.forEach(addr => {
            const lower = addr.toLowerCase();
            if (!uniqueMap.has(lower)) {
                uniqueMap.set(lower, {
                    address: addr,
                    name: 'Unknown',
                    balance: "0.00",
                    transaction_count: 0,
                    last_active: 0
                });
                newCount++;
            }
        });
        console.log(`➕ Added ${newCount} missing wallets to the scan list.`);
    }

    const uniqueWallets = Array.from(uniqueMap.values());
    console.log(`📋 Total Unique Wallets to Scan: ${uniqueWallets.length}`);

    let processed = 0;

    for (let i = 0; i < uniqueWallets.length; i += CONCURRENCY) {
        const chunk = uniqueWallets.slice(i, i + CONCURRENCY);

        const promises = chunk.map(async (wallet) => {
            const data = await fetchWalletDetails(wallet.address);
            if (data.success) {
                wallet.balance = data.balance;
                wallet.transaction_count = data.txCount;
                if (data.lastActive > 0) {
                    wallet.last_active = data.lastActive;
                }
                const timeStr = wallet.last_active ? new Date(wallet.last_active).toLocaleString() : "Never";
                console.log(`[✅ UPDATED] ${wallet.address} | Balance: ${wallet.balance} | PM Txs: ${wallet.transaction_count} | Last Active: ${timeStr}`);
            } else {
                console.log(`❌ Failed: ${wallet.address} | Error: ${data.error}`);
            }
            return true;
        });

        await Promise.all(promises);
        processed += chunk.length;

        if (processed % 20 === 0) { // Save every 20 items (optimized)
            fs.writeFileSync(FILE, JSON.stringify(uniqueWallets, null, 2));
        }

        // Fast sleep
        await sleep(200);
    }

    fs.writeFileSync(FILE, JSON.stringify(uniqueWallets, null, 2));
    console.log("\n✅ ALL WALLETS UPDATED SUCCESSFULLY.");
}

run();
