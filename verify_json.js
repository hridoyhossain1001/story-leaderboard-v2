const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'public', 'known_domains.json');
const TARGET = '0x4Ec04c2ca8ef0061170d9EB5589aA09a80ce0Fff';

try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    const wallet = data.find(w => w.address.toLowerCase() === TARGET.toLowerCase());

    if (wallet) {
        console.log("FOUND WALLET:");
        console.log(JSON.stringify(wallet.last_stats, null, 2));
    } else {
        console.log("Wallet NOT found.");
    }
} catch (e) {
    console.error("Error reading JSON:", e.message);
}
