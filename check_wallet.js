const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'known_domains.json');
const targetAddress = '0x208a0e013Eeb3155c2352A4e8A6926f5c3853f7b'.toLowerCase();

try {
    const data = fs.readFileSync(filePath, 'utf8');
    const domains = JSON.parse(data);

    const target = domains.find(d => d.address.toLowerCase() === targetAddress);

    if (target) {
        console.log('✅ Wallet Found in Database');
        console.log('Name:', target.name || 'Unknown');
        console.log('Address:', target.address);
        console.log('Balance:', target.balance, 'IP');
        console.log('Total Transactions:', target.transaction_count);
        console.log('\n--- Last Stats (All Time) ---');
        if (target.last_stats?.all) {
            console.log('Count:', target.last_stats.all.count);
            console.log('Volume:', target.last_stats.all.volume);
            console.log('Swaps:', target.last_stats.all.swap_count || 0);
            console.log('Licenses:', target.last_stats.all.license_count || 0);
            console.log('Assets:', target.last_stats.all.asset_count || 0);
        } else {
            console.log('No detailed stats available');
        }

        console.log('\n--- Last Stats (24h) ---');
        if (target.last_stats?.['24h']) {
            console.log('Count:', target.last_stats['24h'].count);
            console.log('Volume:', target.last_stats['24h'].volume);
            console.log('Swaps:', target.last_stats['24h'].swap_count || 0);
            console.log('Licenses:', target.last_stats['24h'].license_count || 0);
            console.log('Assets:', target.last_stats['24h'].asset_count || 0);
        } else {
            console.log('No 24h stats available');
        }
    } else {
        console.log('❌ Wallet NOT found in known_domains.json');
        console.log('This wallet can still be searched using "Inspect Live Data" feature');
    }

} catch (err) {
    console.error('Error reading file:', err);
}
