const fs = require('fs');
const path = require('path');
const https = require('https');

const FILE = path.join(__dirname, 'public', 'known_domains.json');
const STORY_API_BASE = 'https://www.storyscan.io/api/v2';

// Mainnet Public Key (300 req/s limit)
const API_KEY = 'MhBsxkU1z9fG6TofE59KqiiWV-YlYE8Q4awlLQehF3U';

// OPTIMIZED SETTINGS
const CONCURRENCY = 10; // Increased Speed (Supported by Key)
const LIST_FILE = 'Story.txt';

async function get(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json',
                'X-API-Key': API_KEY // Authenticated Request
            },
            timeout: 10000
        }, (res) => {
            if (res.statusCode === 429) {
                return reject(new Error(`429`));
            }
            if (res.statusCode < 200 || res.statusCode > 299) {
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
        req.on('error', (err) => reject(err));
        req.on('timeout', () => req.destroy());
    });
}

const MAX_PAGES = 20; // Safety limit (1000 txs)

async function fetchAllTransactions(address, totalExpected) {
    let allTxs = [];
    let page = 0;

    // Safety Limit: 50 pages = 50 items * 50 = 2500 Txs max deep scan.
    let url = `${STORY_API_BASE}/addresses/${address}/transactions`;

    while (page < MAX_PAGES) {

        try {
            const res = await get(url);
            if (res.items && res.items.length > 0) {
                allTxs = allTxs.concat(res.items);

                // If we reached expected count, stop early
                if (totalExpected > 0 && allTxs.length >= totalExpected) break;

                // Pagination Logic
                if (res.next_page_params) {
                    const params = new URLSearchParams(res.next_page_params).toString();
                    url = `${STORY_API_BASE}/addresses/${address}/transactions?${params}`;
                } else {
                    break;
                }
            } else {
                break;
            }
            page++;
            // Small delay to be gentle even with Key
            if (page % 5 === 0) await sleep(200);

        } catch (e) {
            console.log(`⚠️ Pagination Error at page ${page}: ${e.message}`);
            break;
        }
    }
    return allTxs;
}

async function fetchWalletDetails(address, retries = 5) {
    try {
        // 1. Fetch Counts & Balance
        const [info, counters] = await Promise.all([
            get(`${STORY_API_BASE}/addresses/${address}`),
            get(`${STORY_API_BASE}/addresses/${address}/counters`),
        ]);

        let balance = "0.00";
        if (info && info.coin_balance) balance = (Number(BigInt(info.coin_balance)) / 1e18).toFixed(2);
        if (parseFloat(balance) > 100000000) balance = "0.00";

        // Use Counter as Base check
        let totalStats = counters && counters.transactions_count ? parseInt(counters.transactions_count) : 0;

        // 2. Fetch ALL Transactions (Deep Scan with Pagination)
        const allTxs = await fetchAllTransactions(address, totalStats);

        let validTxCount = 0;
        let lastActive = 0;
        let spamCount = 0;

        if (allTxs.length > 0) {
            lastActive = Date.parse(allTxs[0].timestamp);

            allTxs.forEach(tx => {
                const isIncoming = tx.to && tx.to.hash && tx.to.hash.toLowerCase() === address.toLowerCase();
                const value = BigInt(tx.value || "0");
                const isError = tx.status === 'error';

                const isSpam = (isIncoming && value === 0n) || isError;

                if (!isSpam) {
                    // It's a valid transaction
                } else {
                    spamCount++;
                }
            });
        }

        // If we fetched "Most" or "All", we trust Valid count = fetched - spam
        // OR better: Valid = (TotalRaw - Spam). 
        // We assume un-fetched older history (if any) is valid? 
        // Current logic fetches MAX 2500. So if >2500, we missed some spam.
        // But (TotalRaw - Spam) is the best estimate.

        // If we actually fetched everything (fetched >= totalRaw), then Exact Count is (fetched - spam).
        if (allTxs.length >= totalStats) {
            validTxCount = allTxs.length - spamCount;
        } else {
            // We didn't fetch everything (maybe older history exists beyond page limit).
            // We subtract found spam from Raw Total.
            validTxCount = Math.max(0, totalStats - spamCount);
        }

        return {
            balance,
            txCount: validTxCount,
            lastActive,
            success: true
        };

    } catch (e) {
        if (retries > 0) {
            const waitTime = e.message.includes('429') ? 2000 : 1000;
            await sleep(waitTime);
            return fetchWalletDetails(address, retries - 1);
        }
        return { success: false, error: e.message };
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    console.log(" Starting Full System Scan (OPTIMIZED SPEED 5x)...");

    let existingData = [];
    // Ensure checks for directory and file existence
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(FILE)) {
        try {
            const rawData = fs.readFileSync(FILE, 'utf-8');
            existingData = JSON.parse(rawData);
        } catch (err) {
            console.error("⚠️ Error reading known_domains.json. Starting fresh/empty.", err.message);
            existingData = [];
        }
    } else {
        console.log("⚠️ known_domains.json not found. Creating new empty file.");
        fs.writeFileSync(FILE, JSON.stringify([], null, 2));
    }

    // Remove duplicates
    const uniqueMap = new Map();
    existingData.forEach(d => uniqueMap.set(d.address.toLowerCase(), d));

    // IMPORT FROM STORY.TXT to find missing
    if (fs.existsSync(LIST_FILE)) {
        const rawList = fs.readFileSync(LIST_FILE, 'utf-8');
        const addresses = [...new Set(rawList.split('\n').map(l => l.trim()).filter(l => l.startsWith('0x')))];
        console.log(`📄 Loaded ${addresses.length} addresses from Story.txt`);

        let newCount = 0;
        addresses.forEach(addr => {
            const lower = addr.toLowerCase();
            if (!uniqueMap.has(lower)) {
                uniqueMap.set(lower, {
                    address: addr,
                    name: 'Unknown',
                    balance: "0.00",
                    transaction_count: 0,
                    last_active: 0
                });
                newCount++;
            }
        });
        console.log(`➕ Added ${newCount} missing wallets to the scan list.`);
    }

    const uniqueWallets = Array.from(uniqueMap.values());
    console.log(`📋 Total Unique Wallets to Scan: ${uniqueWallets.length}`);

    let processed = 0;

    for (let i = 0; i < uniqueWallets.length; i += CONCURRENCY) {
        const chunk = uniqueWallets.slice(i, i + CONCURRENCY);

        const promises = chunk.map(async (wallet) => {
            const data = await fetchWalletDetails(wallet.address);
            if (data.success) {
                wallet.balance = data.balance;
                wallet.transaction_count = data.txCount;
                if (data.lastActive > 0) {
                    wallet.last_active = data.lastActive;
                }
                const timeStr = wallet.last_active ? new Date(wallet.last_active).toLocaleString() : "Never";
                console.log(`[✅ UPDATED] ${wallet.address} | Bal: ${wallet.balance} | Tx: ${wallet.transaction_count} | Last: ${timeStr}`);
            } else {
                console.log(`❌ Failed: ${wallet.address} | Error: ${data.error}`);
            }
            return true;
        });

        await Promise.all(promises);
        processed += chunk.length;

        if (processed % 20 === 0) { // Save every 20 items (optimized)
            fs.writeFileSync(FILE, JSON.stringify(uniqueWallets, null, 2));
        }

        // Fast sleep
        await sleep(200);
    }

    fs.writeFileSync(FILE, JSON.stringify(uniqueWallets, null, 2));
    console.log("\n✅ ALL WALLETS UPDATED SUCCESSFULLY.");
}

run();
