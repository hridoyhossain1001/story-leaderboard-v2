const fs = require('fs');
const https = require('https');

const API_KEY = 'MhBsxkU1z9fG6TofE59KqiiWV-YlYE8Q4awlLQehF3U';
const STORY_API_BASE = 'https://www.storyscan.io/api/v2';
const ADDRESS = '0x1A8d8Baed2161e145686d20e579775C8ca032216';

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
    console.log(`🔍 Checking FULL Transaction History for: ${ADDRESS}`);

    try {
        const counters = await get(`${STORY_API_BASE}/addresses/${ADDRESS}/counters`);
        let totalRaw = counters.transactions_count ? parseInt(counters.transactions_count) : 0;

        console.log(`- Expected Total (Counter): ${totalRaw}`);

        let allTxs = [];
        let fetched = 0;
        let url = `${STORY_API_BASE}/addresses/${ADDRESS}/transactions`;
        let page = 0;

        while (fetched < totalRaw && page < 50) {
            console.log(`  > Fetching Page ${page + 1}...`);
            const res = await get(url);
            if (res.items && res.items.length > 0) {
                allTxs = allTxs.concat(res.items);
                fetched += res.items.length;

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
        let spamTxHashes = [];

        allTxs.forEach(tx => {
            const isIncoming = tx.to && tx.to.hash && tx.to.hash.toLowerCase() === ADDRESS.toLowerCase();
            const value = BigInt(tx.value || "0");
            const isError = tx.status === 'error';

            // REFINED SPAM DEFINITION:
            // 1. Error Status = Spam
            // 2. Low Value (< $0.10) AND Not a Contract Interaction = Spam

            const hasInput = tx.raw_input && tx.raw_input !== '0x';
            const isContractInteraction = hasInput || (tx.transaction_types && (tx.transaction_types.includes('contract_call') || tx.transaction_types.includes('token_transfer')));

            const VALUE_THRESHOLD = 100000000000000000n; // 0.1 IP
            const isBelowThreshold = value < VALUE_THRESHOLD;

            // Only flag as spam if Error OR (Low Value AND No Interaction)
            if (isError || (isBelowThreshold && !isContractInteraction)) {
                spamCount++;
                if (spamTxHashes.length < 10) {
                    const valueInIP = Number(value) / 1e18;
                    let reason = "Error";
                    if (!isError) {
                        reason = `Low Value ($${(valueInIP * 1.58).toFixed(4)}) & No Interaction`;
                    }
                    spamTxHashes.push({
                        hash: tx.hash,
                        reason: reason,
                        value: value.toString(),
                        isIncoming
                    });
                }
            }
        });

        let validTx = Math.max(0, totalRaw - spamCount);
        if (allTxs.length >= totalRaw) {
            validTx = allTxs.length - spamCount;
        }

        console.log(`\n📊 FULL DEEP SCAN RESULTS:`);
        console.log(`- Total Raw Count:   ${totalRaw}`);
        console.log(`- Total Scanned:     ${allTxs.length}`);
        console.log(`- Spam Detected:     ${spamCount}`);
        console.log(`--------------------------------`);
        console.log(`✅ REAL VALID TX:     ${validTx}`);

        const linkList = spamTxHashes.map((item, index) => `${index + 1}. https://www.storyscan.io/tx/${item.hash} (Reason: ${item.reason}, Value: ${item.value}, Incoming: ${item.isIncoming})`).join('\n');

        console.log(`\n🔗 Top 10 Detected Spam Transactions:`);
        console.log(linkList);
        fs.writeFileSync('spam_links_clean.txt', linkList);

    } catch (e) {
        console.error("❌ Error:", e.message);
    }
}

check();
