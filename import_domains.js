const fs = require('fs');
const https = require('https');
const path = require('path');

const LIST_FILE = 'Story.txt';
const DATA_FILE = path.join(__dirname, 'public', 'known_domains.json');
const API_BASE = 'https://www.storyscan.io/api/v2';
const BATCH_SIZE = 10; // Number of concurrent requests
const DELAY_MS = 100; // Delay between batches

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function get(path, retries = 3) {
    return new Promise((resolve) => {
        const req = https.get(`${API_BASE}${path}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 429) return resolve({ rateLimit: true });
                if (res.statusCode !== 200) return resolve({ error: `Status ${res.statusCode}` });
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve({ error: "Parse Error" });
                }
            });
        });
        req.on('error', (e) => resolve({ error: e.message }));
    });
}

async function fetchDetails(addr) {
    // 1. Fetch Basic Info (Name + Balance)
    const info = await get(`/addresses/${addr}`);
    if (info.rateLimit) return 'RATE';
    if (info.error) return null;

    const name = info.ens_domain_name || info.name;
    if (!name || !name.endsWith('.ip')) return null; // Not a target domain

    // 2. Found a domain! Fetch Counters (Tx Count)
    const counters = await get(`/addresses/${addr}/counters`);
    let txCount = 0;
    if (!counters.rateLimit && !counters.error && counters.transactions_count) {
        txCount = parseInt(counters.transactions_count);
    }

    // Convert Wei to Ether (IP)
    const wei = BigInt(info.coin_balance || "0");
    const balance = (Number(wei) / 1e18).toFixed(2);

    // Date Logic: Default to current time for bulk imports as block timestamp is expensive
    const lastActive = Date.now();

    return {
        address: addr,
        name: name,
        balance: balance,
        tx_count: txCount,
        last_active: lastActive
    };
}

async function run() {
    console.log(`🚀 Starting Bulk Import from ${LIST_FILE}...`);

    // 1. Load Address List
    if (!fs.existsSync(LIST_FILE)) { console.error("❌ File not found:", LIST_FILE); return; }
    const rawList = fs.readFileSync(LIST_FILE, 'utf-8');
    const addresses = [...new Set(rawList.split('\n').map(l => l.trim()).filter(l => l.startsWith('0x')))];
    console.log(`📋 Found ${addresses.length} unique addresses.`);

    // 2. Load Existing Data
    let knownDomains = new Map();
    if (fs.existsSync(DATA_FILE)) {
        try {
            const arr = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
            arr.forEach(d => knownDomains.set(d.address.toLowerCase(), d));
            console.log(`📚 Loaded ${knownDomains.size} existing domains.`);
        } catch (e) { console.log("⚠️ Could not load existing data, starting fresh."); }
    }

    // 3. Process in Batches
    let processed = 0, added = 0, errors = 0;

    for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
        const batch = addresses.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (addr) => {
            // Skip if already exists and complete? No, update valid check.
            if (knownDomains.has(addr.toLowerCase())) return null;

            let res = await fetchDetails(addr);

            // Simple Retry Logic for Rate Limits
            if (res === 'RATE') {
                process.stdout.write('⏳');
                await sleep(2000);
                res = await fetchDetails(addr);
            }

            return res === 'RATE' ? null : res; // If still rate limited, skip
        });

        const results = await Promise.all(promises);

        for (const data of results) {
            if (data) {
                knownDomains.set(data.address.toLowerCase(), data);
                added++;
                process.stdout.write('✅');
            } else {
                // process.stdout.write('.');
            }
        }

        processed += batch.length;
        process.stdout.write(`\r [${Math.round(processed / addresses.length * 100)}%] Processed ${processed}/${addresses.length} | Found ${added} .ip domains... `);

        // Save intermediate progress every 50 items
        if (processed % 50 === 0) {
            fs.writeFileSync(DATA_FILE, JSON.stringify(Array.from(knownDomains.values()), null, 2));
        }

        await sleep(DELAY_MS);
    }

    // Final Save
    fs.writeFileSync(DATA_FILE, JSON.stringify(Array.from(knownDomains.values()), null, 2));
    console.log(`\n🎉 Import Complete! Added ${added} new domains. Total: ${knownDomains.size}`);
}

run();
