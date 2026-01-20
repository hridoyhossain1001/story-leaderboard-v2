const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'public', 'known_domains.json');

try {
    const data = fs.readFileSync(FILE, 'utf8');
    const domains = JSON.parse(data);

    let zeroStatsWallets = [];

    domains.forEach(wallet => {
        const allStats = wallet.last_stats?.all;

        // Find wallets with zero stats but have transactions
        if (wallet.transaction_count > 0 && allStats && allStats.count === 0) {
            zeroStatsWallets.push(wallet.address);
        }
    });

    // Save to a text file for batch processing
    const outputFile = path.join(__dirname, 'wallets_to_fix.txt');
    fs.writeFileSync(outputFile, zeroStatsWallets.join('\n'));

    console.log(`✅ Found ${zeroStatsWallets.length} wallets needing fix`);
    console.log(`📝 Saved to: wallets_to_fix.txt`);
    console.log(`\nYou can now run the batch fix script to process all of them.`);

} catch (err) {
    console.error('Error:', err);
}
