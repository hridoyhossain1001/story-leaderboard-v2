const fs = require('fs');
const path = require('path');
const https = require('https');

const LIST_FILE = 'missing_wallets_final.txt';
const API_KEY = 'MhBsxkU1z9fG6TofE59KqiiWV-YlYE8Q4awlLQehF3U';
const STORY_API_BASE = 'https://www.storyscan.io/api/v2';
const CONCURRENCY = 10;

async function get(url, retries = 5) {
    return new Promise((resolve, reject) => {
        const attempt = async (n) => {
            const req = https.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'application/json',
                    'X-API-Key': API_KEY
                },
                timeout: 10000
            }, (res) => {
                if (res.statusCode === 429) {
                    if (n > 0) {
                        const delay = 1000 * (6 - n) + Math.random() * 500;
                        setTimeout(() => attempt(n - 1), delay);
                        return;
                    }
                    return reject(new Error(`429`));
                }
                if (res.statusCode < 200 || res.statusCode > 299) {
                    // If 404, acts as null/empty
                    if (res.statusCode === 404) return resolve(null);
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
            req.on('error', (err) => {
                if (n > 0) {
                    setTimeout(() => attempt(n - 1), 1000);
                } else {
                    reject(err);
                }
            });
            req.on('timeout', () => req.destroy());
        };
        attempt(retries);
    });
}

async function checkDomains() {
    console.log("Reading missing wallets list...");
    const content = fs.readFileSync(path.join(__dirname, LIST_FILE), 'utf8');
    const addresses = content.split('\n').map(l => l.trim()).filter(l => l.startsWith('0x'));

    console.log(`Found ${addresses.length} addresses to check.`);

    const found = [];
    const missing = [];

    // Chunking for concurrency
    for (let i = 0; i < addresses.length; i += CONCURRENCY) {
        const chunk = addresses.slice(i, i + CONCURRENCY);
        const promises = chunk.map(async (addr) => {
            try {
                const data = await get(`${STORY_API_BASE}/addresses/${addr}`);
                if (data && data.ens_domain_name) {
                    return { address: addr, name: data.ens_domain_name };
                }
            } catch (e) {
                console.error(`Error checking ${addr}: ${e.message}`);
            }
            return null;
        });

        const results = await Promise.all(promises);

        results.forEach((res, idx) => {
            if (res) {
                found.push(res);
                console.log(`✅ FOUND: ${res.address} -> ${res.name}`);
            } else {
                missing.push(chunk[idx]);
                // console.log(`❌ MISSING: ${chunk[idx]}`); // Optional: keep quiet to avoid noise
            }
        });

        process.stdout.write(`Processed ${Math.min(i + CONCURRENCY, addresses.length)}/${addresses.length}...\r`);
        await new Promise(r => setTimeout(r, 100)); // Small delay between chunks
    }

    console.log("\n\n--- RESULTS ---");
    console.log(`Found Domains: ${found.length}`);
    console.log(`Missing Domains: ${missing.length}`);

    if (found.length > 0) {
        console.log("\nFOUND DOMAINS:");
        found.forEach(f => console.log(`${f.address}: ${f.name}`));
    }
}

checkDomains();
