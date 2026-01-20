const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'public', 'known_domains.json');

try {
    const rawData = fs.readFileSync(FILE, 'utf-8');
    const data = JSON.parse(rawData);

    // Sort by transaction_count descending
    data.sort((a, b) => b.transaction_count - a.transaction_count);

    console.log("Top 5 Active Wallets:");
    data.slice(0, 5).forEach(w => {
        console.log(`${w.address}: ${w.transaction_count} txs`);
    });

} catch (err) {
    console.error("Error:", err.message);
}
