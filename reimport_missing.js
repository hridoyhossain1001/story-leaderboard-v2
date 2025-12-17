const fs = require('fs');
const https = require('https');
const path = require('path');

const LIST_FILE = 'Story.txt';
const DATA_FILE = path.join(__dirname, 'public', 'known_domains.json');
const MISSING_FILE = path.join(__dirname, 'missing_wallets.txt');
const API_BASE = 'https://www.storyscan.io/api/v2';

const DELAY_MS = 600; // Slow check as requested (approx 100/min)

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
    while (attempts < 3) {
        const info = await get(`/addresses/${addr}`);
        if (info.rateLimit) {
            process.stdout.write('⏳');
            await sleep(5000); // 5 sec wait on 429
            attempts++;
            continue;
        }
        if (info.error) return null;

        return info;
    }
    return null; // Failed after retries
}

async function run() {
    console.log(`🚀 Starting Slow Re-Check from ${LIST_FILE}...`);

    // 1. Load Address List
    if (!fs.existsSync(LIST_FILE)) { console.error("❌ File not found:", LIST_FILE); return; }
    const rawList = fs.readFileSync(LIST_FILE, 'utf-8');
    // Normalize: trim, lowercase, ignore empty
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
    console.log(`📚 Known: ${knownDomains.size} | Total in List: ${allAddresses.length}`);

    // 3. Identify Missing
    const missingCandidates = allAddresses.filter(addr => !knownDomains.has(addr));
    console.log(`🔍 Checking ${missingCandidates.length} missing addresses...`);

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

                // Get Balance
                const wei = BigInt(info.coin_balance || "0");
                const balance = (Number(wei) / 1e18).toFixed(2);

                // Get Tx Count (Optional, but user prefers detailed)
                let txCount = 0;
                // Since this is "SLOW CHECK", let's try to get Counters too
                const counters = await get(`/addresses/${addr}/counters`);
                if (!counters.rateLimit && !counters.error && counters.transactions_count) {
                    txCount = parseInt(counters.transactions_count);
                } else if (info.transaction_count) {
                    txCount = parseInt(info.transaction_count);
                }

                const entry = {
                    address: info.hash || addr, // Use proper case from API if available
                    name: name,
                    balance: balance,
                    transaction_count: txCount,
                    last_active: Date.now() // Set to now as discovery time
                };

                knownDomains.set(addr, entry);
                newFound++;
                found = true;
                process.stdout.write('✅');
            }
        }

        if (!found) {
            notFoundList.push(addr);
            process.stdout.write('.');
        }

        // Progress
        if (i % 20 === 0) {
            const progress = Math.round((i / missingCandidates.length) * 100);
            process.stdout.write(` [${progress}%] `);

            // Save periodically
            fs.writeFileSync(DATA_FILE, JSON.stringify(Array.from(knownDomains.values()), null, 2));
            fs.writeFileSync(MISSING_FILE, notFoundList.join('\n'));
        }

        await sleep(DELAY_MS);
    }

    // Final Save
    fs.writeFileSync(DATA_FILE, JSON.stringify(Array.from(knownDomains.values()), null, 2));
    fs.writeFileSync(MISSING_FILE, notFoundList.join('\n'));

    console.log(`\n🎉 Re-Check Complete!`);
    console.log(`✅ Found & Added: ${newFound}`);
    console.log(`❌ Still Missing: ${notFoundList.length} (Saved to missing_wallets.txt)`);
}

run();
