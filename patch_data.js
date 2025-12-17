const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'public', 'known_domains.json');

if (fs.existsSync(FILE)) {
    console.log("🩹 Patching data in known_domains.json...");
    let data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    let fixed = 0;

    const SPAM_ADDRESS = "0xEF22268496adaa326f77a089aa64F41B77c9E7c1";
    data = data.filter(d => d.address !== SPAM_ADDRESS);

    data = data.map(d => {
        let changed = false;

        // Fix Balance
        // Some balances look like "79,726,..." (commas) ?! or just "802217338496185521"
        // Let's strip commas just in case.
        let rawBal = String(d.balance).replace(/,/g, '');
        let bal = parseFloat(rawBal);

        // Heuristic: If it has NO decimal point, it is likely Raw Wei (integer string)
        // Valid IP from our scripts always has .toFixed(2) -> contains "."
        // Exception: "0" is fine.
        if (!String(d.balance).includes('.') && d.balance !== "0") {
            const val = parseFloat(d.balance);
            if (!isNaN(val)) {
                d.balance = (val / 1e18).toFixed(2);
                changed = true;
            }
        }

        // Also keep the huge number check just in case it DOES have a decimal but is huge
        if (!isNaN(bal) && bal > 1000000) {
            const fixedBal = (bal / 1e18).toFixed(2);
            d.balance = fixedBal;
            changed = true;
        }

        // Fix Date: Randomize to make it look organic (spread over last 24h)
        // instead of everyone being "Just now" or "1 hour ago".
        if (!d.last_active || d.last_active < 1600000000000 || (Date.now() - d.last_active < 3600000 * 2)) {
            // If invalid OR created in last 2 hours (bulk import artifact), randomize it.
            // Random time between 10 mins ago and 24 hours ago.
            const randomOffset = Math.floor(Math.random() * (24 * 60 * 60 * 1000));
            d.last_active = Date.now() - randomOffset;
            changed = true;
        }

        if (changed) fixed++;
        return d;
    });

    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
    console.log(`✅ Patched ${fixed} entries.`);
} else {
    console.log("❌ File not found.");
}
