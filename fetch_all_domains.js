const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const API_BASE = 'https://www.storyscan.io/api/v2';
const API_KEY = 'MhBsxkU1z9fG6TofE59KqiiWV-YlYE8Q4awlLQehF3U'; // Using existing key from check_missing_domains.js
const CONTRACT_ADDRESS = '0xFF829D3EA4D8f25BF8bE2d8774c080A8046CB7e1';
const KNOWN_DOMAINS_FILE = path.join(__dirname, 'public', 'known_domains.json');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function get(url) {
    return new Promise((resolve, reject) => {
        const attempt = async (retries) => {
            const req = https.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'application/json',
                    'X-API-Key': API_KEY
                }
            }, (res) => {
                if (res.statusCode === 429) {
                    if (retries > 0) {
                        const delay = 2000;
                        // console.log(`   (Rate Limit 429) Retrying in ${delay}ms...`);
                        setTimeout(() => attempt(retries - 1), delay);
                        return;
                    }
                    // return reject(new Error('429 Rate Limit'));
                    // resolve empty to skip safely? No, better to retry forever or fail.
                    // Let's retry long loop for this script.
                    setTimeout(() => attempt(retries), 5000);
                    return;
                }

                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        resolve(json);
                    } catch (e) {
                        resolve({}); // JSON parse error
                    }
                });
            });
            req.on('error', (e) => {
                if (retries > 0) setTimeout(() => attempt(retries - 1), 1000);
                else resolve({});
            });
        };
        attempt(5);
    });
}

async function main() {
    console.log("🚀 Starting Full Domain Contract Scan...");
    console.log(`   Contract: ${CONTRACT_ADDRESS}`);

    // 1. Load Known Domains
    const knownMap = new Map(); // address -> name
    if (fs.existsSync(KNOWN_DOMAINS_FILE)) {
        try {
            const known = JSON.parse(fs.readFileSync(KNOWN_DOMAINS_FILE));
            known.forEach(k => knownMap.set(k.address.toLowerCase(), k.name));
            console.log(`📚 Loaded ${known.length} existing domains.`);
        } catch (e) {
            console.error("Error loading known domains:", e.message);
        }
    }

    const newDiscoveries = new Map();
    let totalFetched = 0;
    let nextPageParams = null;

    do {
        let url = `${API_BASE}/tokens/${CONTRACT_ADDRESS}/instances`;
        if (nextPageParams) {
            // Construct query params from next_page_params object if it exists
            const params = new URLSearchParams(nextPageParams).toString();
            url += `?${params}`;
        }

        process.stdout.write(`\rFetching... Total: ${totalFetched} | Found New: ${newDiscoveries.size}`);

        const data = await get(url);

        if (data.items) {
            for (const item of data.items) {
                totalFetched++;

                const metadataRequest = item.metadata; // sometimes metadata is null, but we need the name
                // If metadata is null, we might need to fetch it or skip. 
                // Usually the 'instances' endpoint returns minimal data, check structure.
                // Assuming item.metadata.name exists or we need to look closer.

                // fallback if metadata is missing or name is missing, but usually for domains it should be there.
                // Wait, typically for ERC721 instances, the Blockscout V2 API returns 'metadata' object.

                let name = item.metadata?.name;
                const owner = item.owner?.hash;

                if (!name || !owner) continue;
                if (!name.endsWith('.ip')) continue;

                const addr = owner.toLowerCase();

                if (!knownMap.has(addr)) {
                    // NEW ADDRESS
                    if (!newDiscoveries.has(addr)) {
                        newDiscoveries.set(addr, { name, type: 'NEW' });
                        // console.log(`\n🔔 NEW: ${name} (${addr})`);
                    }
                } else {
                    const existingName = knownMap.get(addr);
                    if (existingName !== name) {
                        // UPDATED NAME
                        if (!newDiscoveries.has(addr)) {
                            newDiscoveries.set(addr, { name, type: 'UPDATE', old: existingName });
                            //  console.log(`\n🔄 UPDATE: ${existingName} -> ${name} (${addr})`);
                        }
                    }
                }
            }
            nextPageParams = data.next_page_params;
        } else {
            console.log("\n❌ API Error or End of Stream (no items).");
            break;
        }

        await sleep(100); // polite delay

    } while (nextPageParams);

    console.log(`\n\n✅ Scan Complete. Fetched ${totalFetched} tokens.`);

    // 2. Report Findings
    if (newDiscoveries.size === 0) {
        console.log("No new or updated domains found.");
    } else {
        console.log(`\n🎉 Found ${newDiscoveries.size} NEW/UPDATED entries:\n`);

        const list = [];
        newDiscoveries.forEach((val, addr) => {
            list.push({ address: addr, ...val });
        });

        // Print header
        console.log("Address, Name, Type");
        list.forEach(item => {
            if (item.type === 'UPDATE') {
                console.log(`${item.address}: ${item.name} (was ${item.old}) [UPDATE]`);
            } else {
                console.log(`${item.address}: ${item.name} [NEW]`);
            }
        });

        // Optional: Save to a temp file for easy copy-paste
        const outPath = path.join(__dirname, 'new_domains_found.json');
        fs.writeFileSync(outPath, JSON.stringify(list, null, 2));
        console.log(`\nSaved list to ${outPath}`);
    }
}

main();
