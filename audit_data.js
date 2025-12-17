const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'public', 'known_domains.json');

if (fs.existsSync(FILE)) {
    console.log("🔍 Auditing known_domains.json...");
    try {
        const data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
        let suspicious = [];

        data.forEach((d, i) => {
            const raw = String(d.balance);
            const val = parseFloat(raw.replace(/,/g, ''));

            // Check for Suspicious Values
            let reason = null;

            if (val > 100000000) reason = "Huge Value (>100M)";
            else if (raw.includes('e+')) reason = "Scientific Notation";
            else if (!raw.includes('.') && val > 1000) reason = "No Decimal & > 1000";

            if (reason) {
                suspicious.push({ index: i, address: d.address, name: d.name, balance: raw, reason });
            }
        });

        console.log(`Found ${suspicious.length} suspicious entries.`);
        if (suspicious.length > 0) {
            console.log("Top 20 Suspicious Entries:");
            console.table(suspicious.slice(0, 20));
        }

    } catch (e) {
        console.error("Error reading file:", e);
    }
} else {
    console.log("❌ File not found.");
}
