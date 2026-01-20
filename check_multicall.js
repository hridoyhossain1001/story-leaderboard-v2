const https = require('https');

const API_BASE = 'https://www.storyscan.io/api/v2';
const ADDRESS = '0x4Ec04c2ca8ef0061170d9EB5589aA09a80ce0Fff'; // Known wallet with history

async function get(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch { resolve({}); }
            });
        }).on('error', reject);
    });
}

async function run() {
    console.log(`Scanning for 'multicall' transactions for ${ADDRESS}...`);

    // Fetch a batch of transactions
    const url = `${API_BASE}/addresses/${ADDRESS}/transactions?items_count=100`;
    const data = await get(url);
    const items = data.items || [];

    const multicalls = items.filter(tx =>
        (tx.method && tx.method.toLowerCase().includes('multicall')) ||
        (tx.decoded_input && tx.decoded_input.method_call && tx.decoded_input.method_call.toLowerCase().includes('multicall'))
    );

    if (multicalls.length === 0) {
        console.log("No multicall transactions found in recent history.");
        return;
    }

    console.log(`Found ${multicalls.length} multicall transactions. Analyzing the first one:`);
    const tx = multicalls[0];

    console.log("\n--- Transaction Details ---");
    console.log(`Hash: ${tx.hash}`);
    console.log(`Method: ${tx.method || tx.decoded_input?.method_call}`);

    console.log("\n--- WHERE (Destination) ---");
    console.log("We identify 'where' it happened using the 'TO' address metadata:");

    if (tx.to) {
        console.log(`To Address: ${tx.to.hash}`);
        console.log(`To Name: ${tx.to.name}`);
        console.log(`To is_contract: ${tx.to.is_contract}`);

        if (tx.to.metadata && tx.to.metadata.tags) {
            console.log("\n✅ TAGS FOUND (This identifies the Project):");
            console.log(JSON.stringify(tx.to.metadata.tags, null, 2));

            const projectTag = tx.to.metadata.tags.find(t => t.name && !t.name.includes('contract'));
            if (projectTag) {
                console.log(`\n🎉 IDENTIFIED PROJECT: #${projectTag.name}`);
            } else {
                console.log("\n⚠️ Tags found but generic (like 'contract').");
            }
        } else {
            console.log("\n❌ NO TAGS found for this contract.");
        }
    }
}

run();
