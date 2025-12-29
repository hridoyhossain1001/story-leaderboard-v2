const fs = require('fs');
const https = require('https');
const path = require('path');

const FILE = path.join(__dirname, 'public', 'known_domains.json');
const API_BASE = 'https://www.storyscan.io/api/v2';
const API_KEY = 'MhBsxkU1z9fG6TofE59KqiiWV-YlYE8Q4awlLQehF3U';

// Configuration
const VALUE_THRESHOLD_USD = 0.10;
const IP_PRICE_USD = 1.58; // Approximate price
const VALUE_THRESHOLD_WEI = BigInt(Math.floor((VALUE_THRESHOLD_USD / IP_PRICE_USD) * 1e18)); // ~0.063 IP

async function get(path) {
    return new Promise((resolve) => {
        const req = https.get(`${API_BASE}${path}`, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'X-API-Key': API_KEY }
        }, (res) => {
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

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAllTransactions(addr) {
    let allTxs = [];
    let page = 0;
    while (true) {
        const data = await get(`/addresses/${addr}/transactions?page=${page}`); // Assuming standard pagination param or cursor
        // Note: The API uses cursor usually, checking previous files...
        // previous file used `next_page_params`. Checking `full_system_scan.js` logic.
        // It says: `url = ...?${params}`.

        // Let's implement robust pagination based on `full_system_scan.js` pattern:
        // But for simplicity/speed in this script, we can reuse the `get` properly.
        break;
        // Re-implementing correctly below in `run`.
    }
}

// Helper to fetch all pages linearly
async function getKeyTransactions(addr) {
    let allTxs = [];
    let url = `/addresses/${addr}/transactions`;
    let page = 0;

    while (page < 50) { // Safety cap
        const res = await get(url);
        if (!res || !res.items || res.items.length === 0) break;

        allTxs = allTxs.concat(res.items);

        if (res.next_page_params) {
            const params = new URLSearchParams(res.next_page_params).toString();
            url = `/addresses/${addr}/transactions?${params}`;
        } else {
            break;
        }
        page++;
        await sleep(200);
    }
    return allTxs;
}

async function run() {
    console.log("🧹 Loading data...");
    if (!fs.existsSync(FILE)) {
        console.log("❌ File not found:", FILE);
        return;
    }

    const data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    console.log(`📋 Found ${data.length} wallets. Starting Update & Cleanup...`);

    // Sort slightly to put oldest scans first? Or just linear.
    // Linear is "Age jevaby hoito".

    for (let i = 0; i < data.length; i++) {
        const wallet = data[i];
        console.log(`[${i + 1}/${data.length}] Checking ${wallet.name} (${wallet.address})...`);

        // 1. Fetch Basic Info
        const info = await get(`/addresses/${wallet.address}`);
        const counters = await get(`/addresses/${wallet.address}/counters`);

        if (!info) {
            console.log(`   ⚠️ Failed to fetch info. Skipping.`);
            continue;
        }

        // Update Balance
        let balance = "0.00";
        if (info.coin_balance) balance = (Number(BigInt(info.coin_balance)) / 1e18).toFixed(2);
        wallet.balance = balance;

        // 2. Fetch Transactions & Detect Spam
        const txs = await getKeyTransactions(wallet.address);
        let spamCount = 0;
        let lastActive = 0;

        if (txs.length > 0) {
            lastActive = Date.parse(txs[0].timestamp);

            txs.forEach(tx => {
                const value = BigInt(tx.value || "0");
                const isError = tx.status === 'error';

                // SPAM LOGIC
                // 1. Error is Spam
                // 2. Value < $0.10 USD (0.063 IP)
                //    - EXCEPTION: Contract Interaction (contract_call) is VALID (even if 0 IP)
                //    - EXCEPTION: Token Transfer (token_transfer) is VALID (Assuming > $0.10 value mostly)

                const hasInput = tx.raw_input && tx.raw_input !== '0x';
                const typeStr = (tx.transaction_types || []).join(',');

                const isContractCall = typeStr.includes('contract_call') || hasInput;
                const isTokenTransfer = typeStr.includes('token_transfer');

                // It is VALID if: 
                // - It is NOT an Error AND
                // - (Value >= Threshold OR It is a Contract Call/Token Transfer)

                const isHighValue = value >= VALUE_THRESHOLD_WEI;
                const isValidType = isContractCall || isTokenTransfer;

                const isSpam = isError || (!isHighValue && !isValidType);

                if (isSpam) spamCount++;
            });
        }

        // 3. Update Stats
        const totalRaw = counters && counters.transactions_count ? parseInt(counters.transactions_count) : txs.length;
        // If we didn't fetch ALL pages (capped at 50), our spam count might be partial, but usually sufficient for "active" spam.
        // Better: Use `txs.length` as base if we suspect `totalRaw` includes way more history.
        // But for Leaderboard, we want "Total Valid".
        // Heuristic: If we fetched all (txs.length == totalRaw), use exact math.
        // If truncated, assume spam rate of recent applies? Or just subtract known spam.
        const validCount = Math.max(0, totalRaw - spamCount);

        wallet.transaction_count = validCount;
        if (lastActive > 0) wallet.last_active = lastActive; // Update timestamp

        console.log(`   ✅ Valid Tx: ${validCount} (Raw: ${totalRaw} - Spam: ${spamCount}) | Bal: ${balance}`);

        // Save periodically
        if (i % 5 === 0) fs.writeFileSync(FILE, JSON.stringify(data, null, 2));

        await sleep(500); // Be gentle
    }

    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
    console.log("💾 Final Save Completed!");
}

run();
