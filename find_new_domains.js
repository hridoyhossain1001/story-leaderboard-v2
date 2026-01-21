const fs = require('fs');
const path = require('path');

// Configuration
const API_BASE = 'https://www.storyscan.io/api/v2';
const KNOWN_DOMAINS_FILE = path.join(__dirname, 'public', 'known_domains.json');
const TX_DUMP_FILE = path.join(__dirname, 'tx_dump.json');
const SCAN_DEPTH_BLOCKS = 100; // Scan last 100 blocks

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchLatestBlockNumber() {
    try {
        const res = await fetch(`${API_BASE}/blocks`);
        if (!res.ok) throw new Error("Failed");
        const json = await res.json();
        return json.items ? parseInt(json.items[0].height) : 0;
    } catch (e) { return 0; }
}

async function fetchBlockTransactions(blockNumber) {
    try {
        const res = await fetch(`${API_BASE}/blocks/${blockNumber}/transactions`);
        if (res.status === 429) return { rateLimit: true };
        if (!res.ok) return { items: [] };
        return await res.json();
    } catch (error) {
        return { items: [] };
    }
}

async function main() {
    console.log("🚀 Starting Search for NEW Domains...");

    // 1. Load Known Domains
    const knownDomains = new Map(); // address (lowercased) -> name
    if (fs.existsSync(KNOWN_DOMAINS_FILE)) {
        try {
            const known = JSON.parse(fs.readFileSync(KNOWN_DOMAINS_FILE));
            known.forEach(k => knownDomains.set(k.address.toLowerCase(), k.name));
            console.log(`📚 Loaded ${known.length} existing domains.`);
        } catch (e) {
            console.error("Error loading known domains:", e.message);
        }
    }

    const newDiscoveries = new Map(); // address -> name

    function checkCandidate(address, name, source) {
        if (!name || !name.endsWith('.ip')) return;
        const addr = address.toLowerCase();

        if (!knownDomains.has(addr)) {
            if (!newDiscoveries.has(addr)) {
                console.log(`\n🔔 [NEW] ${name} (${addr}) - found in ${source}`);
                newDiscoveries.set(addr, name);
            }
        } else {
            const existingName = knownDomains.get(addr);
            if (existingName !== name) {
                // It's known, but the name is different!
                if (!newDiscoveries.has(addr)) {
                    console.log(`\n🔄 [UPDATE] ${existingName} -> ${name} (${addr}) - found in ${source}`);
                    newDiscoveries.set(addr, name);
                }
            }
        }
    }

    // 2. Check tx_dump.json
    if (fs.existsSync(TX_DUMP_FILE)) {
        console.log("📂 Checking tx_dump.json...");
        try {
            const dump = JSON.parse(fs.readFileSync(TX_DUMP_FILE));
            dump.forEach(tx => {
                if (tx.from && tx.from.ens_domain_name) checkCandidate(tx.from.hash, tx.from.ens_domain_name, "DUMP");
                if (tx.to && tx.to.ens_domain_name) checkCandidate(tx.to.hash, tx.to.ens_domain_name, "DUMP");
            });
        } catch (e) {
            console.error("Error reading tx_dump.json:", e.message);
        }
    }

    // 3. Scan Recent Blocks
    const latestBlock = await fetchLatestBlockNumber();
    if (latestBlock > 0) {
        const startBlock = latestBlock - SCAN_DEPTH_BLOCKS;
        console.log(`⚡ Scanning last ${SCAN_DEPTH_BLOCKS} blocks (${startBlock} -> ${latestBlock})...`);

        for (let b = startBlock; b <= latestBlock; b++) {
            process.stdout.write(`\rScanning Block ${b}...`);
            const data = await fetchBlockTransactions(b);

            if (data.rateLimit) {
                process.stdout.write(" (Rate Limit) ");
                await sleep(2000);
                b--;
                continue;
            }

            if (data.items) {
                for (const tx of data.items) {
                    if (tx.from && tx.from.ens_domain_name) checkCandidate(tx.from.hash, tx.from.ens_domain_name, "BLOCK " + b);
                    if (tx.to && tx.to.ens_domain_name) checkCandidate(tx.to.hash, tx.to.ens_domain_name, "BLOCK " + b);
                }
            }
            await sleep(50); // Be nice
        }
        console.log("\nBlock scan complete.");
    } else {
        console.log("Could not fetch latest block number.");
    }

    // Report
    console.log("\n--- REPORT ---");
    if (newDiscoveries.size === 0) {
        console.log("No new domains found.");
    } else {
        console.log(`Found ${newDiscoveries.size} NEW/UPDATED addresses with domains:`);
        newDiscoveries.forEach((name, addr) => {
            console.log(`- ${name}: ${addr}`);
        });
    }
}

main();
