const https = require('https');

const STORY_API_BASE = 'https://www.storyscan.io/api/v2';
const API_KEY = 'MhBsxkU1z9fG6TofE59KqiiWV-YlYE8Q4awlLQehF3U';

const ADDRESS = '0x4Ec04c2ca8ef0061170d9EB5589aA09a80ce0Fff';

async function get(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json',
                'X-API-Key': API_KEY
            }
        }, (res) => {
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
        req.on('error', reject);
    });
}

// Logic to identify transaction types
function classifyTx(tx) {
    let type = 'other';
    const method = (tx.method || '').toLowerCase();

    let decoded = '';
    if (tx.decoded_input && tx.decoded_input.method_call) {
        decoded = tx.decoded_input.method_call.toLowerCase();
    }

    const toName = (tx.to && tx.to.name) ? tx.to.name.toLowerCase() : '';
    let isPiper = toName.includes('piper') || toName.includes('swap');
    if (tx.to && tx.to.metadata && tx.to.metadata.tags) {
        tx.to.metadata.tags.forEach(t => {
            if (t.name.toLowerCase().includes('piper')) isPiper = true;
        });
    }

    // SWAP: 'swap' in name OR 'multicall' to PiperX/DEX
    if (method.includes('swap') || decoded.includes('swap') || (method.includes('multicall') && isPiper)) {
        type = 'swap';
    }
    // LICENSE: 'license' in name
    else if (method.includes('license') || decoded.includes('license')) {
        type = 'license';
    }
    // ASSET: 'register' in name (IP Asset Registry)
    else if (method.includes('register') || decoded.includes('register') || method.includes('mintandregister')) {
        type = 'asset';
    }

    return type;
}

async function run() {
    console.log(`Scanning full history for ${ADDRESS}...`);

    let allTxs = [];
    let page = 0;
    while (true) {
        // Fetch in batches (scan ALL history)
        let url = `${STORY_API_BASE}/addresses/${ADDRESS}/transactions?items_count=100`;
        if (page > 0) {
            // For simple prototype, we just fetch first 2 pages (200 txs) to be fast
            // If user has thousands, this script might take too long without pagination params logic
            // But let's try to do at least 200.
            // Actually, the API uses next_page_params.
            break;
        }

        // Fetch all pages properly?
        // Let's reuse proper pagination logic from full_system_scan.js but simplifed
        break;
    }

    // RE-IMPLEMENT PAGINATION FOR CORRECTNESS
    let url = `${STORY_API_BASE}/addresses/${ADDRESS}/transactions`;
    let items = [];
    let count = 0;

    while (true) {
        try {
            console.log(`Fetching page...`);
            const res = await get(url);
            if (res.items && res.items.length > 0) {
                items = items.concat(res.items);
                if (res.next_page_params) {
                    const params = new URLSearchParams(res.next_page_params).toString();
                    url = `${STORY_API_BASE}/addresses/${ADDRESS}/transactions?${params}`;
                } else {
                    break;
                }
            } else {
                break;
            }
            count++;
            if (count > 20) break; // Safety limit 1000 txs
            await new Promise(r => setTimeout(r, 100)); // Rate limit safety
        } catch (e) {
            console.log("Error fetching:", e.message);
            break;
        }
    }

    console.log(`\nAnalyzed ${items.length} transactions.`);

    let stats = {
        swap: 0,
        license: 0,
        asset: 0,
        other: 0
    };

    items.forEach(tx => {
        const type = classifyTx(tx);
        stats[type]++;
    });

    console.log("\n--- FINAL STATS ---");
    console.log(`Swaps: ${stats.swap}`);
    console.log(`Licenses Sold/Bought: ${stats.license}`);
    console.log(`Assets Registered: ${stats.asset}`);
    console.log(`Other: ${stats.other}`);
    console.log(`Total: ${items.length}`);

    // Detailed Breakdown
    const detailed = { swap: {}, license: {}, asset: {}, other: {} };
    items.forEach(tx => {
        const type = classifyTx(tx);
        const method = tx.decoded_input && tx.decoded_input.method_call
            ? tx.decoded_input.method_call.split('(')[0]
            : (tx.method || 'unknown');

        detailed[type][method] = (detailed[type][method] || 0) + 1;
    });

    console.log("\n--- DETAILED BREAKDOWN ---");
    console.log("SWAPS methods:");
    console.table(detailed.swap);

    console.log("\nLICENSES methods:");
    console.table(detailed.license);

    console.log("\nASSETS methods:");
    console.table(detailed.asset);

    console.log("\nOTHER methods:");
    console.table(detailed.other);
}

run();
