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
                '90d': 90 * 24 * 60 * 60 * 1000,
                'all': Infinity
            };

            const stats = {};

            Object.keys(periods).forEach(key => {
                let count = 0;
                let volume = 0n;
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

                stats[key] = { count, volume: volStr };
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

    // PRIORITY SORT: Never-scanned first, then oldest-scanned
    uniqueWallets.sort((a, b) => {
        const aTs = a.last_scanned_timestamp || 0;
        const bTs = b.last_scanned_timestamp || 0;
        return aTs - bTs; // Smallest (0 or oldest) first
    });

    const neverScanned = uniqueWallets.filter(w => !w.last_scanned_timestamp).length;
    console.log(`📋 Total Unique Wallets: ${uniqueWallets.length} | Never Scanned: ${neverScanned} (Priority)`);

    let processed = 0;

    for (let i = 0; i < uniqueWallets.length; i += CONCURRENCY) {
        const chunk = uniqueWallets.slice(i, i + CONCURRENCY);

        const promises = chunk.map(async (wallet) => {
            // Pass existing wallet data for INCREMENTAL scanning
            const data = await fetchWalletDetails(wallet.address, wallet);
            if (data.success) {
                wallet.balance = data.balance;
                if (data.net_worth_usd !== undefined) {
                    wallet.net_worth_usd = data.net_worth_usd;
                }
                wallet.transaction_count = data.txCount;
                if (data.lastActive > 0) {
                    wallet.last_active = data.lastActive;
                }
                if (data.stats) {
                    wallet.last_stats = data.stats;
                }
                // NEW: Store incremental scan data
                if (data.last_scanned_timestamp) {
                    wallet.last_scanned_timestamp = data.last_scanned_timestamp;
                }
                if (data.known_spam_count !== undefined) {
                    wallet.known_spam_count = data.known_spam_count;
                }
                const timeStr = wallet.last_active ? new Date(wallet.last_active).toLocaleString() : "Never";
                console.log(`[✅ UPDATED] ${wallet.address} | Bal: ${wallet.balance} | Tx: ${wallet.transaction_count} | Spam: ${wallet.known_spam_count || 0} | Last: ${timeStr}`);
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
        await sleep(100);
    }

    fs.writeFileSync(FILE, JSON.stringify(uniqueWallets, null, 2));
    console.log("\n✅ ALL WALLETS UPDATED SUCCESSFULLY.");
}

run();
