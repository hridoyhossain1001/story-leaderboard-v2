const https = require('https');
const TX_HASHES = [
    '0x84dc3a1516303d3d33ee44e0c3c3ada401c993bab80aa53b13ce1b82ebc51b4a',
    '0xdd8a3f96308712c69a9cb57b86bbbd05f0592f720937d06937bcea6e3a3465fc'
];
const API_BASE = 'https://www.storyscan.io/api/v2';

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function run() {
    for (const hash of TX_HASHES) {
        const url = `${API_BASE}/transactions/${hash}`;
        console.log(`\nFetching ${url}...`);
        try {
            const tx = await fetchJson(url);

            console.log(`--- Transaction ${hash} ---`);
            console.log('Method:', tx.method);
            console.log('Decoded Method:', tx.decoded_input?.method_call);
            console.log('To Address:', tx.to?.hash);
            console.log('To Name:', tx.to?.name);
            console.log('Status:', tx.result); // Check what the API returns for status (often 'result' or 'status')
            console.log('Is Error:', tx.status === 'error' || tx.result === 'error');

            // Check our logic
            const method = (tx.method || '').toLowerCase();
            const decoded = (tx.decoded_input?.method_call || '').toLowerCase();
            const toHash = (tx.to?.hash || '').toLowerCase();
            const KNOWN_ASSET_CONTRACTS = ['0xcC2E862bCee5B6036Db0de6E06Ae87e524a79fd8'.toLowerCase()];

            console.log('--- Classification Logic ---');
            if (KNOWN_ASSET_CONTRACTS.includes(toHash)) {
                console.log('MATCH: Whitelisted Asset Contract');
            }
            if (method.includes('register') || decoded.includes('register')) {
                console.log('MATCH: "register" keyword found');
            }
            if (method.includes('createip')) {
                console.log('MATCH: "createip" keyword found');
            }
            if (method.includes('license') || decoded.includes('license') || method.includes('mintlicense')) {
                console.log('MATCH: "license" keyword found');
            }
        } catch (e) {
            console.error('Error fetching tx:', e.message);
        }
    }
}

run();
