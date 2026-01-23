
// Logic ported from WalletDetailsModal.tsx
const fs = require('fs');
const https = require('https');

const API_BASE = 'https://www.storyscan.io/api/v2';
const ADDRESS = '0x8D618d7E081b109a0DA5FeCAf439aD899Ec3c735';

// Helper for HTTP GET (Node.js native)
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

const formatVol = (wei) => {
    const val = Number(wei) / 1e18;
    if (val === 0) return "0 IP";
    return val.toLocaleString(undefined, { maximumFractionDigits: 2 }) + " IP";
};

async function run() {
    console.log(`Fetching history for ${ADDRESS}...`);
    const allTxs = [];
    let nextPageParams = '';
    let keepFetching = true;
    let totalFetched = 0;

    try {
        while (keepFetching && totalFetched < 5000) {
            const query = nextPageParams ? `&${nextPageParams}` : '';
            const url = `${API_BASE}/addresses/${ADDRESS}/transactions?items_count=50${query}`;

            const data = await fetchJson(url);
            const items = data.items || [];

            if (items.length === 0) break;

            for (const tx of items) {
                allTxs.push(tx);
            }

            totalFetched += items.length;
            process.stdout.write(`\rFetched ${totalFetched} transactions...`);

            if (data.next_page_params) {
                // Manually parse next_page_params object to string if needed or just use the keys
                // The API returns an object like { items_count: 50, timestamp: ... }
                // We need to convert it to a query string
                const params = new URLSearchParams('');
                for (const [k, v] of Object.entries(data.next_page_params)) {
                    params.append(k, v);
                }
                nextPageParams = params.toString();
            } else {
                keepFetching = false;
            }
        }
        console.log('\nFinished fetching.');
        calculateStats(allTxs);

    } catch (err) {
        console.error('Error:', err);
    }
}

function calculateStats(transactions) {
    let currentCount = 0;
    let currentVolume = 0n;
    let swapCount = 0;
    let licenseCount = 0;
    let assetCount = 0;
    let otherCount = 0;
    const breakdown = { swap: {}, license: {}, asset: {}, other: {} };
    const txLists = { asset: [], license: [] };

    for (const tx of transactions) {
        // FILTER: Exclude failed transactions
        // API v2 uses 'result' field (success/error/execution reverted)
        // Some endpoints might use 'status'. We check both to be safe.
        // We output the status to debug if needed.
        const isSuccess = (tx.result === 'success' || tx.status === 'ok');
        // If result is present but not success, it's a failure (e.g. 'execution reverted')
        if (tx.result && tx.result !== 'success') continue;
        // If status is present (boolean or string) and indicates failure/error
        if (tx.status === 'error' || tx.status === false) continue;

        currentCount++;
        const isContractInteraction = tx.to?.is_contract;
        const val = BigInt(tx.value || 0);
        if (isContractInteraction) {
            currentVolume += val;
        }

        // CLASSIFY
        const method = (tx.method || '').toLowerCase();
        let decoded = '';
        if (tx.decoded_input && tx.decoded_input.method_call) {
            decoded = tx.decoded_input.method_call.toLowerCase();
        }

        // Extract Clean Method Name
        const methodDisplay = tx.decoded_input && tx.decoded_input.method_call
            ? tx.decoded_input.method_call.split('(')[0]
            : (tx.method || 'unknown');

        let contractName = tx.to?.name || tx.to?.hash || 'Unknown';
        if (tx.to?.metadata?.tags && tx.to.metadata.tags.length > 0) {
            const tag = tx.to.metadata.tags.find((t) => t.name && !t.name.includes('contract'));
            if (tag) contractName = `# ${tag.name}`;
        }

        const toName = (tx.to && tx.to.name) ? tx.to.name.toLowerCase() : '';
        let isPiper = toName.includes('piper') || toName.includes('swap');

        const key = `${contractName}|${methodDisplay}|${tx.to?.hash || ''}`;

        // Helper to check full decoded payload
        const fullDecoded = JSON.stringify(tx.decoded_input || {}).toLowerCase();

        const toHash = (tx.to && tx.to.hash) ? tx.to.hash.toLowerCase() : '';
        const KNOWN_ASSET_CONTRACTS = [
            '0xcC2E862bCee5B6036Db0de6E06Ae87e524a79fd8'.toLowerCase() // LicenseAttachmentWorkflows
        ];

        if (KNOWN_ASSET_CONTRACTS.includes(toHash)) {
            assetCount++;
            breakdown.asset[key] = (breakdown.asset[key] || 0) + 1;
            txLists.asset.push(tx.hash);
        }
        else if (method.includes('swap') || decoded.includes('swap') || (method.includes('multicall') && isPiper)) {
            swapCount++;
            breakdown.swap[key] = (breakdown.swap[key] || 0) + 1;
        }
        else if (((method.includes('register') || decoded.includes('register') || method.includes('createip') ||
            method.includes('attachpilterms') || decoded.includes('attachpilterms')) && !method.includes('bulkregister') && !decoded.includes('bulkregister'))
            || (contractName.toLowerCase().includes('nonfungiblepositionmanager') && (fullDecoded.includes('licensor') || fullDecoded.includes('mint') || fullDecoded.includes('88316456')))) {
            assetCount++;
            breakdown.asset[key] = (breakdown.asset[key] || 0) + 1;
            txLists.asset.push(tx.hash);
        }
        else if (method.includes('license') || decoded.includes('license') || method.includes('mintlicense')) {
            // EXCLUSION: Do not count 'signLicense'
            if (method.includes('signlicense') || decoded.includes('signlicense')) {
                otherCount++;
                breakdown.other[key] = (breakdown.other[key] || 0) + 1;
            } else {
                licenseCount++;
                breakdown.license[key] = (breakdown.license[key] || 0) + 1;
                txLists.license.push(tx.hash);
            }
        }
        else {
            otherCount++;
            breakdown.other[key] = (breakdown.other[key] || 0) + 1;
        }
    }


    const result = {
        address: ADDRESS,
        total_transactions: currentCount,
        volume: formatVol(currentVolume),
        counts: {
            swaps: swapCount,
            assets: assetCount,
            licenses: licenseCount,
            others: otherCount
        },
        breakdowns: breakdown,
        tx_lists: txLists
    };

    console.log('Writing results to analysis_final.json...');
    fs.writeFileSync('analysis_final.json', JSON.stringify(result, null, 2));
    console.log('Done.');
}


run();
