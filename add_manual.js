const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'public', 'known_domains.json');

const MANUAL_ENTRIES = [
    { name: 'stevenx.ip', address: '0x19FFDa63B0fbaa3a51e68c894e97ba0C152003d6' },
    { name: 'azittt90.ip', address: '0xd391885c212730C11f18B3f8d31b30970E136F02' },
    { name: 'abhigupta.ip', address: '0x737f96b22b33d72a7601e1951bbdac049c54b4de' },
    { address: "0x8D618d7E081b109a0DA5FeCAf439aD899Ec3c735", name: "mdarman.ip" }
];

async function run() {
    console.log("Loading data...");
    let data = [];
    if (fs.existsSync(FILE)) {
        data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    }

    // Convert to map for easy update
    const map = new Map();
    data.forEach(d => map.set(d.address.toLowerCase(), d));

    console.log("Updating entries...");
    for (const entry of MANUAL_ENTRIES) {
        const addr = entry.address.toLowerCase();
        let existing = map.get(addr) || {};

        // Update fields
        existing.address = entry.address; // Keep original casing from input
        existing.name = entry.name;

        // If new, set defaults
        if (!existing.balance) existing.balance = "0.00";
        if (!existing.transaction_count) existing.transaction_count = 0;
        if (!existing.last_active) existing.last_active = Date.now();

        map.set(addr, existing);
        console.log(`✅ Added/Updated: ${entry.name} -> ${entry.address}`);
    }

    // Save back
    const startSize = data.length;
    const newData = Array.from(map.values());
    fs.writeFileSync(FILE, JSON.stringify(newData, null, 2));

    console.log(`\nDone! Total Wallets: ${newData.length} (Was: ${startSize})`);
}

run();
