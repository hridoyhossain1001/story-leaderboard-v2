const fs = require('fs');
const https = require('https');
const path = require('path');

const LIST_FILE = 'Story.txt';
const DATA_FILE = path.join(__dirname, 'public', 'known_domains.json');
const MISSING_FILE = path.join(__dirname, 'missing_wallets_final.txt');
const API_BASE = 'https://www.storyscan.io/api/v2';

// USER REQUEST: "Aro slow check koro" -> 2 Seconds per wallet
const DELAY_MS = 2000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function get(path) {
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

async function fetchWithRetry(addr) {
    let attempts = 0;
    while (attempts < 5) { // Increased retries to 5
        const info = await get(`/addresses/${addr}`);
        if (info.rateLimit) {
            process.stdout.write('⏳'); // Wait longer on rate limit
            await sleep(10000);
            attempts++;
            continue;
        }
        if (info.error) return null; // 404 or other error

        return info;
    }
    return null;
}

async function run() {
    console.log(`🚀 Starting SUPER SLOW Re-Check (2s delay)...`);
    console.log(`Target: Find any missing .ip domains from ${LIST_FILE}`);

    // 1. Load Address List
    if (!fs.existsSync(LIST_FILE)) { console.error("❌ File not found:", LIST_FILE); return; }
    const rawList = fs.readFileSync(LIST_FILE, 'utf-8');
    const allAddresses = [...new Set(rawList.split('\n')
        .map(l => l.trim())
        .filter(l => l.startsWith('0x'))
        .map(l => l.toLowerCase())
    )];

    // 2. Load Existing Data
    let knownDomains = new Map();
    if (fs.existsSync(DATA_FILE)) {
        try {
            const arr = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
            arr.forEach(d => knownDomains.set(d.address.toLowerCase(), d));
        } catch (e) { }
    }

    // 3. Identify Missing
    const missingCandidates = allAddresses.filter(addr => !knownDomains.has(addr));
    console.log(`\n📊 Status:`);
    console.log(`- Total Wallets: ${allAddresses.length}`);
    console.log(`- Already Found: ${knownDomains.size}`);
    console.log(`- To Check: ${missingCandidates.length} (These are potentially missing)`);
    console.log(`\nScanning... (Press Ctrl+C to stop)`);

    let newFound = 0;
    let notFoundList = [];

    for (let i = 0; i < missingCandidates.length; i++) {
        const addr = missingCandidates[i];

        const info = await fetchWithRetry(addr);

        let found = false;
        if (info) {
            const name = info.ens_domain_name || info.name;
            if (name && name.endsWith('.ip')) {
                // FOUND ONE!

                const wei = BigInt(info.coin_balance || "0");
                const balance = (Number(wei) / 1e18).toFixed(2);

                let txCount = 0;
                // Since this is Super Slow, get counters too
                const counters = await get(`/addresses/${addr}/counters`);
                if (!counters.rateLimit && !counters.error && counters.transactions_count) {
                    txCount = parseInt(counters.transactions_count);
                } else if (info.transaction_count) {
                    txCount = parseInt(info.transaction_count);
                }

                const entry = {
                    address: info.hash || addr,
                    name: name,
                    balance: balance,
                    transaction_count: txCount,
                    last_active: Date.now()
                };

                knownDomains.set(addr, entry);
                newFound++;
                found = true;
                process.stdout.write('✅'); // Green check for found
            }
        }

        if (!found) {
            notFoundList.push(addr);
            process.stdout.write('❌'); // Red X for not found (visual feedback)
        }

        // Periodic Save
        if (i % 5 === 0) { // Save often
            fs.writeFileSync(DATA_FILE, JSON.stringify(Array.from(knownDomains.values()), null, 2));
        }

        await sleep(DELAY_MS);
    }

    // Final Save
    fs.writeFileSync(DATA_FILE, JSON.stringify(Array.from(knownDomains.values()), null, 2));
    fs.writeFileSync(MISSING_FILE, notFoundList.join('\n'));

    console.log(`\n🎉 Super Scan Complete!`);
    console.log(`✅ Added: ${newFound}`);
    console.log(`❌ Missing: ${notFoundList.length} (Saved to missing_wallets_final.txt)`);
}

run();
