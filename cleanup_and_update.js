const fs = require('fs');
const https = require('https');
const path = require('path');

const FILE = path.join(__dirname, 'public', 'known_domains.json');
const API_BASE = 'https://www.storyscan.io/api/v2';

const TO_REMOVE = '0xb964d803efcbaa6f138363ff0f4aef5ab977e74f.ip';
const TARGET_DOMAINS = ["mdarman.ip"];

function get(path) {
    return new Promise((resolve) => {
        const req = https.get(`${API_BASE}${path}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) return resolve(null);
                try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
    });
}

async function fetchDetails(addr) {
    const info = await get(`/addresses/${addr}`);
    if (!info) return null;

    const counters = await get(`/addresses/${addr}/counters`);
    const txs = await get(`/addresses/${addr}/transactions`);

    let balance = "0.00";
    if (info.coin_balance) balance = (Number(BigInt(info.coin_balance)) / 1e18).toFixed(2);

    let txCount = 0;
    if (counters && counters.transactions_count) txCount = parseInt(counters.transactions_count);
    else if (info.transaction_count) txCount = parseInt(info.transaction_count);

    let lastActive = Date.now();
    if (txs && txs.items && txs.items.length > 0) {
        lastActive = Date.parse(txs.items[0].timestamp);
    }

    return { balance, txCount, lastActive };
}

async function run() {
    console.log("🧹 Loading data...");
    let data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    const initialCount = data.length;

    // 1. Remove Garbage
    data = data.filter(d => d.name !== TO_REMOVE);
    if (data.length < initialCount) console.log(`🗑️ Removed garbage entry: ${TO_REMOVE}`);

    // 2. Update Specifics
    for (const name of TARGET_DOMAINS) {
        const index = data.findIndex(d => d.name === name);
        if (index !== -1) {
            const entry = data[index];
            console.log(`🔄 Updating ${name} (${entry.address})...`);

            const fresh = await fetchDetails(entry.address);
            if (fresh) {
                entry.balance = fresh.balance;
                entry.transaction_count = fresh.txCount;
                entry.last_active = fresh.lastActive;
                console.log(`   ✅ Bal: ${fresh.balance} | Tx: ${fresh.txCount} | Time: ${fresh.lastActive}`);
            } else {
                console.log("   ❌ Failed to fetch fresh data.");
            }
        }
    }

    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
    console.log("💾 Saved!");
}

run();
