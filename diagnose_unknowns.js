const fs = require('fs');
const path = require('path');
const https = require('https');

const TARGET_FILE = path.join(__dirname, 'public', 'known_domains.json');
const API_BASE = 'https://www.storyscan.io/api/v2';
const API_KEY = 'MhBsxkU1z9fG6TofE59KqiiWV-YlYE8Q4awlLQehF3U';
const SPACE_ID_CONTRACT = '0xFF829D3EA4D8f25BF8bE2d8774c080A8046CB7e1';

async function get(url) {
    return new Promise((resolve) => {
        const req = https.get(url, { headers: { 'Accept': 'application/json', 'X-API-Key': API_KEY } }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
        });
        req.on('error', () => resolve({}));
    });
}

async function run() {
    const wallets = JSON.parse(fs.readFileSync(TARGET_FILE));
    const unknowns = wallets.filter(w => w.name === 'Unknown');

    console.log(`🔎 Start Diagnosis. Total Remaining Unknowns: ${unknowns.length}`);

    // Check top 5 active unknowns
    unknowns.sort((a, b) => b.transaction_count - a.transaction_count);
    const top5 = unknowns.slice(0, 5);

    for (const w of top5) {
        console.log(`\n--------------------------------------------------`);
        console.log(`Checking Wallet: ${w.address} (Tx: ${w.transaction_count})`);

        const url = `${API_BASE}/addresses/${w.address}/token-balances`;
        const balances = await get(url);

        if (!Array.isArray(balances)) {
            console.log(`❌ API Error or Rate Limit accessing balances.`);
            continue;
        }

        const spaceIdToken = balances.find(b => b.token && b.token.address_hash === SPACE_ID_CONTRACT);

        if (spaceIdToken) {
            console.log(`⚠️  FOUND Space ID Token! Value: ${spaceIdToken.value}`);
            console.log(`    This wallet SHOULD have been fixed. Fetching instances...`);

            const iUrl = `${API_BASE}/tokens/${SPACE_ID_CONTRACT}/instances?holder_address_hash=${w.address}`;
            const instances = await get(iUrl);

            if (instances.items && instances.items.length > 0) {
                console.log(`    Token Item Found: ${JSON.stringify(instances.items[0].metadata?.name)}`);
            } else {
                console.log(`    ❌ No instances found (Maybe burned or weird state?)`);
            }

        } else {
            console.log(`✅ No Space ID Token found in balance.`);
            console.log(`   (Checked ${balances.length} tokens. None matched ${SPACE_ID_CONTRACT})`);
            console.log(`   Conclusion: User genuinely does not own a .ip domain.`);
        }
    }
}

run();
