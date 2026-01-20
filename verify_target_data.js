
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'known_domains.json');
const targetAddress = '0x4Ec04c2ca8ef0061170d9EB5589aA09a80ce0Fff'.toLowerCase();

try {
    const data = fs.readFileSync(filePath, 'utf8');
    const domains = JSON.parse(data);

    const target = domains.find(d => d.address.toLowerCase() === targetAddress);

    if (target) {
        console.log('Target Wallet Found:', target.name || target.address);
        console.log('Last Stats (All):', target.last_stats?.all);
        console.log('Last Stats (24h):', target.last_stats?.['24h']);

        if (target.last_stats?.all?.swap_count !== undefined) {
            console.log('SUCCESS: Detailed stats present.');
        } else {
            console.log('FAILURE: Detailed stats missing.');
        }
    } else {
        console.log('Target Wallet NOT found in known_domains.json');
    }

} catch (err) {
    console.error('Error reading file:', err);
}
