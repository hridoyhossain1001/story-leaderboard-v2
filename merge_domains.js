const fs = require('fs');
const path = require('path');

const KNOWN_DOMAINS_FILE = path.join(__dirname, 'public', 'known_domains.json');
const NEW_DOMAINS_FILE = path.join(__dirname, 'new_domains_found.json');

function main() {
    console.log("🔄 Merging Domain Updates...");

    if (!fs.existsSync(KNOWN_DOMAINS_FILE) || !fs.existsSync(NEW_DOMAINS_FILE)) {
        console.error("❌ Missing input files.");
        return;
    }

    const known = JSON.parse(fs.readFileSync(KNOWN_DOMAINS_FILE));
    const updates = JSON.parse(fs.readFileSync(NEW_DOMAINS_FILE));

    console.log(`   Current Domains: ${known.length}`);
    console.log(`   Updates to Apply: ${updates.length}`);

    let applied = 0;

    updates.forEach(update => {
        const addr = update.address.toLowerCase();

        // Find existing index
        const idx = known.findIndex(k => k.address.toLowerCase() === addr);

        if (update.type === 'NEW') {
            if (idx === -1) {
                // Truly new
                known.push({
                    address: update.address, // keep original casing from update or standardize?
                    name: update.name,
                    balance: "0.00",
                    transaction_count: 0,
                    last_active: Date.now(), // Estimate
                    last_stats: {
                        "24h": { count: 0, volume: "0 IP" },
                        "3d": { count: 0, volume: "0 IP" },
                        "7d": { count: 0, volume: "0 IP" },
                        "14d": { count: 0, volume: "0 IP" },
                        "30d": { count: 0, volume: "0 IP" },
                        "60d": { count: 0, volume: "0 IP" },
                        "90d": { count: 0, volume: "0 IP" },
                        "all": { count: 0, volume: "0 IP" }
                    },
                    known_spam_count: 0,
                    net_worth_usd: 0
                });
                console.log(`   [NEW] Added ${update.name}`);
                applied++;
            } else {
                console.log(`   [WARN] 'NEW' domain ${update.name} already exists. Updating name only.`);
                known[idx].name = update.name;
                applied++;
            }
        } else if (update.type === 'UPDATE') {
            if (idx !== -1) {
                console.log(`   [UPDATE] ${known[idx].name} -> ${update.name}`);
                known[idx].name = update.name;
                applied++;
            } else {
                console.log(`   [WARN] 'UPDATE' domain ${update.name} not found in list. Adding as new.`);
                known.push({
                    address: update.address,
                    name: update.name,
                    balance: "0.00",
                    transaction_count: 0,
                    last_active: Date.now(),
                    last_stats: {
                        "24h": { count: 0, volume: "0 IP" },
                        "7d": { count: 0, volume: "0 IP" },
                        "all": { count: 0, volume: "0 IP" }
                    },
                    known_spam_count: 0,
                    net_worth_usd: 0
                });
                applied++;
            }
        }
    });

    fs.writeFileSync(KNOWN_DOMAINS_FILE, JSON.stringify(known, null, 2));
    console.log(`✅ Success! Updated ${applied} domains. Total now: ${known.length}`);
}

main();
