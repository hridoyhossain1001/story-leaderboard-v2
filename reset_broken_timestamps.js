const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'public', 'known_domains.json');

try {
    const data = fs.readFileSync(FILE, 'utf8');
    const domains = JSON.parse(data);
    let fixedCount = 0;

    const domainsWithReset = domains.map(wallet => {
        const allStats = wallet.last_stats?.all;
        // Identify broken wallets: Has Tx but Zero Stats
        if (wallet.transaction_count > 0 && allStats && allStats.count === 0) {
            // Reset timestamp to 0 to force re-scan
            wallet.last_scanned_timestamp = 0;
            fixedCount++;
        }
        return wallet;
    });

    fs.writeFileSync(FILE, JSON.stringify(domainsWithReset, null, 2));

    console.log(`✅ Reset timestamps for ${fixedCount} broken wallets.`);
    console.log(`Now run 'node full_system_scan.js' to re-scan them immediately.`);

} catch (err) {
    console.error('Error:', err);
}
