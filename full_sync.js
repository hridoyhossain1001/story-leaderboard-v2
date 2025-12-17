const fs = require('fs');
const path = require('path');

const API_BASE = 'https://www.storyscan.io/api/v2';
const FILE = path.join(__dirname, 'public', 'known_domains.json');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchDetails(address) {
    try {
        // Fetch Account Details (Balance) AND Transactions (Last Active)
        // Fetch Account Details (Balance), Transactions (Last Active), AND Counters (Total Tx)
        const [infoRes, txRes, countersRes] = await Promise.all([
            fetch(`${API_BASE}/addresses/${address}`),
            fetch(`${API_BASE}/addresses/${address}/transactions`),
            fetch(`${API_BASE}/addresses/${address}/counters`)
        ]);

        if (infoRes.status === 429 || txRes.status === 429 || countersRes.status === 429) return 'RATE';

        const info = infoRes.ok ? await infoRes.json() : {};
        const txs = txRes.ok ? await txRes.json() : {};
        const counters = countersRes.ok ? await countersRes.json() : {};

        let balance = "0.00";
        if (info.coin_balance) {
            balance = (parseFloat(info.coin_balance) / 1e18).toFixed(2);
        }

        // Capture Transaction Count from Counters
        let txCount = 0;
        if (counters.transactions_count) {
            txCount = parseInt(counters.transactions_count, 10);
        } else if (info.transaction_count) {
            // Fallback
            txCount = parseInt(info.transaction_count, 10);
        }



        let lastActive = 0;
        if (txs.items && txs.items.length > 0) {
            // timestamps in API are usually ISO strings
            lastActive = Date.parse(txs.items[0].timestamp);
        } else {
            // If no transactions found in list, maybe checking counters?
            // Or leave as 0 (will use fallback)
        }

        return { balance, lastActive, txCount };
    } catch (e) {
        return null;
    }
}

async function main() {
    if (!fs.existsSync(FILE)) return;

    let data = JSON.parse(fs.readFileSync(FILE));
    console.log(`🔄 Syncing ${data.length} wallets with REAL DATA...`);

    for (let i = 0; i < data.length; i++) {
        const address = data[i].address;

        process.stdout.write(`[${i + 1}/${data.length}] ${data[i].name}... `);

        const result = await fetchDetails(address);

        if (result === 'RATE') {
            process.stdout.write("⚠️ Rate Limit! Re-trying in 5s...\n");
            i--; // Retry this index
            await sleep(5000);
            continue;
        }

        if (result) {
            data[i].balance = result.balance;
            data[i].transaction_count = result.txCount;

            // Only update date if we found a valid one. 
            // If API returns no txs (e.g. internal only), keep existing "random/old" date 
            // OR set to Date.now() if we want to confirm "checked at"? 
            // User wants "Real" data. If no tx, then "Last Active" is elusive.
            // Let's typically trust the Tx list.
            if (result.lastActive > 0) {
                data[i].last_active = result.lastActive;
            }

            process.stdout.write(`✅ Bal: ${data[i].balance} | Txs: ${data[i].transaction_count} | Active: ${result.lastActive > 0 ? 'Updated' : 'No Tx Found'}\n`);
        } else {
            process.stdout.write("❌ Fail\n");
        }

        // Save progress every 20 items
        if (i % 20 === 0) {
            fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
        }

        await sleep(150); // Slight delay to avoid 429
    }

    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
    console.log("🎉 Full Sync Complete!");
}

main();
