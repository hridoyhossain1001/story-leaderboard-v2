const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'public', 'known_domains.json');

function run() {
    console.log("Loading data...");
    let data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    let changed = false;

    data.forEach(d => {
        // Fix NaN or invalid Tx Count
        if (typeof d.transaction_count !== 'number' || isNaN(d.transaction_count)) {
            // Try parsing if string
            let val = parseInt(d.transaction_count);
            if (isNaN(val)) {
                console.log(`Fixing NaN Tx for ${d.name} -> 0`);
                d.transaction_count = 0;
                changed = true;
            } else {
                // It was a string number, check if it was "NaN" string
                if (String(d.transaction_count) === "NaN") {
                    console.log(`Fixing "NaN" string for ${d.name} -> 0`);
                    d.transaction_count = 0;
                    changed = true;
                }
            }
        }

        // Ensure Balance is string formatted
        if (d.balance === "NaN" || d.balance === undefined) {
            console.log(`Fixing NaN Balance for ${d.name} -> 0.00`);
            d.balance = "0.00";
            changed = true;
        }
    });

    if (changed) {
        fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
        console.log("💾 Fixed and Saved!");
    } else {
        console.log("✅ No NaN values found.");
    }
}

run();
