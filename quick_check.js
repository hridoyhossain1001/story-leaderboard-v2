const https = require('https');

const API_KEY = 'MhBsxkU1z9fG6TofE59KqiiWV-YlYE8Q4awlLQehF3U';
const STORY_API_BASE = 'https://www.storyscan.io/api/v2';

// User needs to provide their wallet address
const ADDRESS = process.argv[2] || '0x4Ec04c2ca8ef0061170d9EB5589aA09a80ce0Fff';

async function get(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json',
                'X-API-Key': API_KEY
            },
            timeout: 10000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });
        });
        req.on('error', (err) => reject(err));
    });
}

async function check() {
    console.log(`🔍 Checking Wallet: ${ADDRESS}\n`);

    try {
        const counters = await get(`${STORY_API_BASE}/addresses/${ADDRESS}/counters`);
        let totalRaw = counters.transactions_count ? parseInt(counters.transactions_count) : 0;

        console.log(`- Expected Total (Counter): ${totalRaw}`);

        let allTxs = [];
        let url = `${STORY_API_BASE}/addresses/${ADDRESS}/transactions`;
        let page = 0;

        while (page < 50) {
            console.log(`  > Fetching Page ${page + 1}...`);
            const res = await get(url);
            if (res.items && res.items.length > 0) {
                allTxs = allTxs.concat(res.items);

                if (totalRaw > 0 && allTxs.length >= totalRaw) break;

                if (res.next_page_params) {
                    const params = new URLSearchParams(res.next_page_params).toString();
                    url = `${STORY_API_BASE}/addresses/${ADDRESS}/transactions?${params}`;
                } else {
                    break;
                }
            } else {
                break;
            }
            page++;
            await new Promise(r => setTimeout(r, 200));
        }

        let spamCount = 0;
        allTxs.forEach(tx => {
            const value = BigInt(tx.value || "0");
            const isError = tx.status === 'error';

            const hasInput = tx.raw_input && tx.raw_input !== '0x';
            const isContractInteraction = hasInput || (tx.transaction_types && (tx.transaction_types.includes('contract_call') || tx.transaction_types.includes('token_transfer')));

            const VALUE_THRESHOLD = 100000000000000000n; // 0.1 IP
            const isBelowThreshold = value < VALUE_THRESHOLD;

            if (isError || (value === 0n && !isContractInteraction) || isBelowThreshold) {
                spamCount++;
            }
        });

        let validTx = Math.max(0, totalRaw - spamCount);
        if (allTxs.length >= totalRaw) {
            validTx = allTxs.length - spamCount;
        }

        console.log(`\n📊 RESULTS:`);
        console.log(`- Total Raw Count:   ${totalRaw}`);
        console.log(`- Total Scanned:     ${allTxs.length}`);
        console.log(`- Spam Detected:     ${spamCount}`);
        console.log(`--------------------------------`);
        console.log(`✅ REAL VALID TX:     ${validTx}`);

    } catch (e) {
        console.error("❌ Error:", e.message);
    }
}

check();
