const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'known_domains.json');

try {
    const data = fs.readFileSync(filePath, 'utf8');
    const domains = JSON.parse(data);

    let zeroStatsCount = 0;
    let zeroStatsWallets = [];

    domains.forEach(wallet => {
        const allStats = wallet.last_stats?.all;

        // Check if stats are all zeros despite having transactions
        if (wallet.transaction_count > 0 && allStats && allStats.count === 0) {
            zeroStatsCount++;
            zeroStatsWallets.push({
                address: wallet.address,
                name: wallet.name || 'Unknown',
                txCount: wallet.transaction_count,
                balance: wallet.balance
            });
        }
    });

    console.log(`\n📊 Total Wallets: ${domains.length}`);
    console.log(`❌ Wallets with Zero Stats: ${zeroStatsCount}\n`);

    if (zeroStatsCount > 0) {
        console.log('Wallets needing fix:');
        console.log('='.repeat(80));
        zeroStatsWallets.slice(0, 20).forEach((w, i) => {
            console.log(`${i + 1}. ${w.name}`);
            console.log(`   Address: ${w.address}`);
            console.log(`   Transactions: ${w.txCount}, Balance: ${w.balance} IP\n`);
        });

        if (zeroStatsCount > 20) {
            console.log(`... and ${zeroStatsCount - 20} more wallets\n`);
        }
    } else {
        console.log('✅ All wallets have correct stats!');
    }

} catch (err) {
    console.error('Error reading file:', err);
}
