const fs = require('fs');

try {
    const raw = fs.readFileSync('tx_dump.json', 'utf-8');
    const txs = JSON.parse(raw);

    const methods = {};
    const decodedMethods = {};
    const toNames = {};

    txs.forEach(tx => {
        // Count Methods
        const m = tx.method || 'unknown';
        methods[m] = (methods[m] || 0) + 1;

        // Count Decoded Methods
        if (tx.decoded_input && tx.decoded_input.method_call) {
            const dm = tx.decoded_input.method_call.split('(')[0];
            decodedMethods[dm] = (decodedMethods[dm] || 0) + 1;
        }

        // Count To Names (for Swaps/DEX checks)
        if (tx.to && tx.to.name) {
            toNames[tx.to.name] = (toNames[tx.to.name] || 0) + 1;
        } else if (tx.to && tx.to.metadata && tx.to.metadata.tags) {
            tx.to.metadata.tags.forEach(t => {
                toNames[`TAG: ${t.name}`] = (toNames[`TAG: ${t.name}`] || 0) + 1;
            });
        }
    });

    console.log("--- Methods ---");
    console.table(methods);
    console.log("\n--- Decoded Methods ---");
    console.table(decodedMethods);
    console.log("\n--- To Addresses/Tags ---");
    console.table(toNames);

} catch (e) {
    console.error(e);
}
