const fs = require('fs');
const path = require('path');
const https = require('https');

const FILE = path.join(__dirname, 'public', 'known_domains.json');
const STORY_API_BASE = 'https://www.storyscan.io/api/v2';

// Mainnet Public Key (300 req/s limit)
const API_KEY = 'MhBsxkU1z9fG6TofE59KqiiWV-YlYE8Q4awlLQehF3U';

// OPTIMIZED SETTINGS
const CONCURRENCY = 10; // Reduced to prevent 429s
const LIST_FILE = 'Story.txt';

const classifyTx = (tx) => {
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

    // SWAP: 'swap' in name OR 'multicall' to PiperX/DEX or specific liquidity methods
    if (method.includes('swap') || decoded.includes('swap') ||
        ((method.includes('multicall') || method.includes('exactinput') || method.includes('addliquidity') || method.includes('removeliquidity')) && isPiper)) {
        type = 'swap';
    }
    // LICENSE: 'license' in name
    else if (method.includes('license') || decoded.includes('license')) {
        type = 'license';
    }
    // ASSET: 'register' in name (IP Asset Registry), 'createIpToken'
    else if (method.includes('register') || decoded.includes('register') || method.includes('mintandregister') || method.includes('createiptoken')) {
        type = 'asset';
    }

    return type;
};

async function get(url, retries = 5) {
    return new Promise((resolve, reject) => {
        const attempt = async (n) => {
            const req = https.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'application/json',
                    'X-API-Key': API_KEY // Authenticated Request
                },
                timeout: 10000
            }, (res) => {
                if (res.statusCode === 429) {
                    if (n > 0) {
                        const delay = 1000 * (6 - n) + Math.random() * 500;
                        console.log(`⚠️ 429 Rate Limit. Retrying in ${Math.round(delay)}ms... (${url})`);
                        setTimeout(() => attempt(n - 1), delay);
                        return;
                    }
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

const MAX_PAGES = 100; // 3000 txs per wallet

async function fetchAllTransactions(address, totalExpected, lastScannedTs = 0) {
    let allTxs = [];
    let page = 0;
    let hitOldTransaction = false;

    // Safety Limit: 100 pages = 50 items * 100 = 5000 Txs max deep scan.
    let url = `${STORY_API_BASE}/addresses/${address}/transactions`;

    while (page < MAX_PAGES) {

        try {
            const res = await get(url);
            if (res.items && res.items.length > 0) {

                // INCREMENTAL LOGIC: Filter out already-scanned transactions
                for (const tx of res.items) {
                    const txTs = Date.parse(tx.timestamp);
                    if (lastScannedTs > 0 && txTs <= lastScannedTs) {
                        // We've reached transactions we already processed
                        hitOldTransaction = true;
                        break;
                    }
                    allTxs.push(tx);
                }

                if (hitOldTransaction) {
                    console.log(`   ↪ Reached already-scanned transactions at page ${page}`);
                    break;
                }

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
            if (page % 5 === 0) await new Promise(r => setTimeout(r, 50));

        } catch (e) {
            if (e.message.includes('429')) {
                console.log(`⚠️ Rate Limit (429) at page ${page}. Retrying...`);
                await new Promise(r => setTimeout(r, 2000));
                continue; // Retry same URL
            }
            console.log(`⚠️ Pagination Error at page ${page}: ${e.message}`);
            break;
        }
    }
    return allTxs;
}

async function fetchWalletDetails(address, existingWalletData = {}, retries = 5) {
    try {
        // Get existing data for incremental scan
        const lastScannedTs = existingWalletData.last_scanned_timestamp || 0;
        const existingSpamCount = existingWalletData.known_spam_count || 0;

        // 1. Fetch Counts & Balance
        const [info, counters, tokens] = await Promise.all([
            get(`${STORY_API_BASE}/addresses/${address}`),
            get(`${STORY_API_BASE}/addresses/${address}/counters`),
            get(`${STORY_API_BASE}/addresses/${address}/token-balances`),
        ]);

        let netWorthUSD = 0;

        // 1. Native Coin Wealth
        let balance = "0.00";
        if (info && info.coin_balance) {
            const balNum = Number(BigInt(info.coin_balance)) / 1e18;
            balance = balNum.toFixed(2);

            if (info.exchange_rate) {
                netWorthUSD += balNum * parseFloat(info.exchange_rate);
            }
        }
        if (parseFloat(balance) > 100000000) balance = "0.00";

        // 2. Token Wealth
        if (Array.isArray(tokens)) {
            tokens.forEach(t => {
                if (t.value && t.token && t.token.exchange_rate) {
                    const decimals = t.token.decimals ? parseInt(t.token.decimals) : 18;
                    const val = Number(BigInt(t.value)) / (10 ** decimals);
                    const price = parseFloat(t.token.exchange_rate);
                    if (!isNaN(val) && !isNaN(price)) {
                        netWorthUSD += val * price;
                    }
                }
            });
        }


        // Use Counter as Base check
        let totalStats = counters && counters.transactions_count ? parseInt(counters.transactions_count) : 0;

        // 2. Fetch Transactions (INCREMENTAL: Only NEW ones since last scan)
        const allTxs = await fetchAllTransactions(address, totalStats, lastScannedTs);

        let newLastScannedTs = lastScannedTs; // Keep old if no new txs
        let newSpamCount = 0;

        if (allTxs.length > 0) {
            // Update last scanned timestamp to the newest transaction
            newLastScannedTs = Date.parse(allTxs[0].timestamp);

            allTxs.forEach(tx => {
                const value = BigInt(tx.value || "0");
                const isError = tx.status === 'error';

                // SPAM LOGIC REFINED:
                const hasInput = tx.raw_input && tx.raw_input !== '0x';
                const typeStr = (tx.transaction_types || []).join(',');
                const isContractCall = typeStr.includes('contract_call') || hasInput;
                const isTokenTransfer = typeStr.includes('token_transfer');

                // Value Threshold $0.10 USD (~0.063 IP)
                // 1 IP = 1e18 wei; 0.063 IP = 63000000000000000 wei
                const VALUE_THRESHOLD = 63000000000000000n;
                const isHighValue = value >= VALUE_THRESHOLD;

                // VALID if: NOT Error AND (High Value OR Contract/Token Interaction)
                // SPAM if: Error OR (Low Value AND No Contract/Token Interaction)
                const isSpam = isError || (!isHighValue && !isContractCall && !isTokenTransfer);

                if (isSpam) {
                    newSpamCount++;
                }
            });

            if (lastScannedTs > 0) {
                console.log(`   ↪ Incremental: Found ${allTxs.length} new txs, ${newSpamCount} new spam`);
            }
        }

        // CUMULATIVE SPAM COUNT
        const totalSpamCount = existingSpamCount + newSpamCount;
        const validTxCount = Math.max(0, totalStats - totalSpamCount);

        // Calculate Time-Based Stats (24h, 7d, etc) for Instant Frontend
        function calculateStats(txs) {
            const now = Date.now();
            const periods = {
                '24h': 24 * 60 * 60 * 1000,
                '3d': 3 * 24 * 60 * 60 * 1000,
                '7d': 7 * 24 * 60 * 60 * 1000,
                '14d': 14 * 24 * 60 * 60 * 1000,
                '30d': 30 * 24 * 60 * 60 * 1000,
                '60d': 60 * 24 * 60 * 60 * 1000,
                '90d': 90 * 24 * 60 * 60 * 1000,
                'all': Infinity
            };

            const stats = {};

            Object.keys(periods).forEach(key => {
                let count = 0;
                let volume = 0n;
                let swapCount = 0;
                let licenseCount = 0;
                let assetCount = 0; // Asset Registration
                const cutoff = periods[key] === Infinity ? 0 : now - periods[key];

                txs.forEach(tx => {
                    const ts = Date.parse(tx.timestamp);
                    if (ts >= cutoff) {
                        // Re-use spam/valid logic?
                        // Frontend logic says: Count = All (in window), Volume = Contract Only
                        // But we should filter SPAM out first?
                        // Let's stick to Valid Txs only for Stats.

                        const hasInput = tx.raw_input && tx.raw_input !== '0x';
                        const typeStr = (tx.transaction_types || []).join(',');
                        const isContractCall = typeStr.includes('contract_call') || hasInput;
                        const isTokenTransfer = typeStr.includes('token_transfer');

                        const val = BigInt(tx.value || "0");
                        const isHighValue = val >= 63000000000000000n; // $0.10 USD
                        const isSpam = tx.status === 'error' || (!isHighValue && !isContractCall && !isTokenTransfer);

                        if (!isSpam) {
                            count++;

                            // -------------------------
                            // NEW: Detailed Classification
                            // -------------------------
                            const txType = classifyTx(tx);
                            if (txType === 'swap') swapCount++;
                            if (txType === 'license') licenseCount++;
                            if (txType === 'asset') assetCount++;
                            // -------------------------

                            // Volume: Track Native IP Volume for all valid txs (or keep strictly contract?)
                            // User asked to check "marked value" - assume sum of transfers? 
                            // For STATS, let's keep it simple: Add native value.
                            // If token volume needed, we'd parse. For now, native volume + count is key.
                            if (isContractCall || isTokenTransfer || isHighValue) {
                                volume += val;
                            }
                        }
                    }
                });

                // Format Volume
                const volIP = Number(volume) / 1e18;
                let volStr = "0 IP";
                if (volIP > 0) {
                    if (volIP < 0.01) volStr = "<0.01 IP";
                    else volStr = volIP.toLocaleString(undefined, { maximumFractionDigits: 2 }) + " IP";
                }

                stats[key] = {
                    count,
                    volume: volStr,
                    // NEW FIELDS
                    swap_count: swapCount,
                    license_count: licenseCount,
                    asset_count: assetCount
                };
            });
            return stats;
        }

        const timeStats = calculateStats(allTxs);

        // lastActive: Use the newest transaction timestamp (or keep existing)
        const lastActive = newLastScannedTs || existingWalletData.last_active || 0;

        return {
            balance,
            net_worth_usd: netWorthUSD, // NEW FIELD
            txCount: validTxCount,
            lastActive,
            stats: timeStats,
            // NEW: Incremental scan data
            last_scanned_timestamp: newLastScannedTs,
            known_spam_count: totalSpamCount,
            success: true
        };


    } catch (e) {
        if (retries > 0) {
            const waitTime = e.message.includes('429') ? 2000 : 1000;
            await sleep(waitTime);
            return fetchWalletDetails(address, existingWalletData, retries - 1);
        }
        return { success: false, error: e.message };
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    console.log("DEBUG SCAN STARTING...");
    const target = '0x208a0e013Eeb3155c2352A4e8A6926f5c3853f7b';
    const wallet = {
        address: target,
        name: 'Debug Wallet',
        last_scanned_timestamp: 0 // Force full scan
    };

    console.log(`Scanning ${target}...`);
    const data = await fetchWalletDetails(target, wallet);

    if (data.success) {
        console.log("SUCCESS!");
        console.log("STATS:", JSON.stringify(data.stats.all, null, 2));

        // SAVE TO FILE
        try {
            const rawData = fs.readFileSync(FILE, 'utf-8');
            const domainList = JSON.parse(rawData);
            const index = domainList.findIndex(w => w.address.toLowerCase() === target.toLowerCase());

            if (index !== -1) {
                // Update existing
                const w = domainList[index];
                w.balance = data.balance;
                w.net_worth_usd = data.net_worth_usd;
                w.transaction_count = data.txCount;
                w.last_active = data.lastActive;
                w.last_stats = data.stats;
                w.last_scanned_timestamp = data.last_scanned_timestamp;
                w.known_spam_count = data.known_spam_count;

                domainList[index] = w;
                console.log("Updating existing wallet entry...");
            } else {
                console.log("Wallet not found in file, ignoring save (debug mode).");
            }

            fs.writeFileSync(FILE, JSON.stringify(domainList, null, 2));
            console.log("✅ Saved to known_domains.json");
        } catch (e) {
            console.error("Error saving:", e);
        }

    } else {
        console.log("FAILED:", data.error);
    }
}

run();
