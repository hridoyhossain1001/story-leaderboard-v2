const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'public', 'known_domains.json');

function run() {
    console.log("Loading data...");
    let data;
    try {
        data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    } catch (e) {
        console.error("Failed to read file:", e.message);
        return;
    }

    let changed = false;
    let migrated = 0;
    let kept = 0;

    data = data.map(d => {
        // 1. Prioritize existing transaction_count
        let finalTx = 0;

        if (d.transaction_count !== undefined && d.transaction_count !== null && !isNaN(d.transaction_count)) {
            finalTx = parseInt(d.transaction_count);
            kept++;
        } else if (d.tx_count !== undefined && d.tx_count !== null && !String(d.tx_count).includes("NaN")) {
            // 2. Migrate from tx_count if transaction_count is missing/invalid
            finalTx = parseInt(d.tx_count);
            migrated++;
            changed = true;
        }

        if (isNaN(finalTx)) finalTx = 0;

        // 3. Update Object: Set transaction_count, remove tx_count
        d.transaction_count = finalTx;
        delete d.tx_count;

        return d;
    });

    if (changed || migrated > 0) {
        fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
        console.log(`\n✅ Standardization Complete:`);
        console.log(`- Migrated from 'tx_count': ${migrated}`);
        console.log(`- Already had 'transaction_count': ${kept}`);
        console.log(`- Total Entries: ${data.length}`);
        console.log(`- Saved to ${FILE}`);
    } else {
        console.log("\n✅ All data was already standardized.");
    }
}

run();
