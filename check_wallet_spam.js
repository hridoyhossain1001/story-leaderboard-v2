const fs = require('fs');
const https = require('https');

const API_KEY = 'MhBsxkU1z9fG6TofE59KqiiWV-YlYE8Q4awlLQehF3U';
const STORY_API_BASE = 'https://www.storyscan.io/api/v2';
const ADDRESS = '0x4Ec04c2ca8ef0061170d9EB5589aA09a80ce0Fff';

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
        let nextParams = null; // If V2 uses cursor
        let url = `${STORY_API_BASE}/addresses/${ADDRESS}/transactions`;

        // Naive Pagination Loop (Check if V2 supports standard blockscout pagination)
        // Since we don't have explicit doc, we attempt to fetch using ?next_page_params if returned, 
        // or we simply confirm the first 100 stats.
        // User asked for "Full Check" -> implies checking if >100 exists.

        // Let's modify logic to fetch ALL
        let page = 0;

        while (fetched < totalRaw && page < 50) { // Max 5000 txs safety
            console.log(`  > Fetching Page ${page + 1}...`);
            // NOTE: V2 pagination usually requires specific params from previous response.
            // If we don't handle next_page_params, we just get first page repeatedly.
            // Let's assume for this single test we check the first 100 which covers 300+ of this user?

            // Wait, the previous test showed 327 Total TX.
            // We need to fetch 4 pages.
            // V2 API Standard: ?block_number=...&index=... from `next_page_params`.

            const res = await get(url);
            if (res.items && res.items.length > 0) {
                allTxs = allTxs.concat(res.items);
                fetched += res.items.length;

                if (res.next_page_params) {
                    // Construct next URL
                    const params = new URLSearchParams(res.next_page_params).toString();
                    url = `${STORY_API_BASE}/addresses/${ADDRESS}/transactions?${params}`;
                } else {
                    break; // No more pages
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
            // 2. Value 0 AND Not a Contract Interaction (Swap/Token Transfer) = Spam

            const hasInput = tx.raw_input && tx.raw_input !== '0x';
            const isContractInteraction = hasInput || (tx.transaction_types && (tx.transaction_types.includes('contract_call') || tx.transaction_types.includes('token_transfer')));

            if (isError || (value === 0n && !isContractInteraction)) {
                spamCount++;
                if (spamTxHashes.length < 10) {
                    spamTxHashes.push({
                        hash: tx.hash,
                        reason: isError ? "Error" : "0 Value & No Interaction",
                        value: value.toString(),
                        isIncoming
                    });
                }
            }
        });

        let validTx = Math.max(0, totalRaw - spamCount);
        // If we fetched everything, trust our manual count more than raw counter
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
