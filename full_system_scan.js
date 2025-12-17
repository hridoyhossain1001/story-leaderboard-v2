const fs = require('fs');
const path = require('path');
const https = require('https');

const FILE = path.join(__dirname, 'public', 'known_domains.json');
const STORY_API_BASE = 'https://www.storyscan.io/api/v2';

// OPTIMIZED SETTINGS
const CONCURRENCY = 5; // Safe Speed (5 wallets at once)
const LIST_FILE = 'Story.txt';

async function get(url) {
    return new Promise((resolve) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json'
            },
            timeout: 15000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve({});
                }
            });
        });

        req.on('error', () => resolve({}));
        req.on('timeout', () => req.destroy());
    });
}

async function fetchWalletDetails(address) {
    // 1. Get Balance
    // 2. Get Tx Count
    // 3. Get Last Transaction Time
    try {
        const [info, counters, txs] = await Promise.all([
            get(`${STORY_API_BASE}/addresses/${address}`),
            get(`${STORY_API_BASE}/addresses/${address}/counters`),
            get(`${STORY_API_BASE}/addresses/${address}/transactions`) // Fetch latest tx
        ]);

        let balance = "0.00";
        if (info && info.coin_balance) {
            balance = (Number(BigInt(info.coin_balance)) / 1e18).toFixed(2);
        }

        let txCount = 0;
        if (counters && counters.transactions_count) {
            txCount = parseInt(counters.transactions_count);
        }

        // Fix huge/weird balances
        if (parseFloat(balance) > 100000000) {
            balance = "0.00";
        }

        // Determine Last Active from actual TX history
        let lastActive = 0;
        if (txs && txs.items && txs.items.length > 0) {
            lastActive = Date.parse(txs.items[0].timestamp);
        }

        return { balance, txCount, lastActive, success: true };
    } catch (e) {
        return { success: false };
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    console.log("� Starting Full System Scan (OPTIMIZED SPEED 5x)...");

    let existingData = [];
    if (fs.existsSync(FILE)) {
        existingData = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
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
                console.log(`✅ ${wallet.address.slice(0, 8)}... | Bal: ${wallet.balance.padEnd(6)} | Tx: ${String(wallet.transaction_count).padEnd(4)} | Last: ${timeStr}`);
            } else {
                console.log(`❌ Failed: ${wallet.address.slice(0, 8)}...`);
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
