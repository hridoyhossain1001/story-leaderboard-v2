const https = require('https');

const BLOCK_NUMBER = '11975316';
const URL = `https://www.storyscan.io/api/v2/blocks/${BLOCK_NUMBER}/transactions`;

console.log(`🔍 Checking Block ${BLOCK_NUMBER} for .ip domains...`);

https.get(URL, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            const items = json.items || [];
            const found = [];

            items.forEach(tx => {
                if (tx.from && tx.from.ens_domain_name) {
                    found.push({ type: 'FROM', name: tx.from.ens_domain_name, hash: tx.hash });
                }
                if (tx.to && tx.to.ens_domain_name) {
                    found.push({ type: 'TO', name: tx.to.ens_domain_name, hash: tx.hash });
                }
            });

            if (found.length > 0) {
                console.log(`✅ Found ${found.length} .ip domains in block ${BLOCK_NUMBER}:`);
                found.forEach(f => console.log(`- [${f.type}] ${f.name} (Tx: ${f.hash})`));
            } else {
                console.log(`❌ No .ip domains found in block ${BLOCK_NUMBER} (scanned ${items.length} txs).`);
            }

        } catch (e) {
            console.error("Error parsing JSON:", e.message);
        }
    });
}).on('error', (e) => {
    console.error("Error fetching data:", e.message);
});
