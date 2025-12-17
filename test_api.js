const https = require('https');

const ADDR = '0x1A8d8B196C11237a3424168069411985F2C5B099'; // Example from logs
const URL = `https://www.storyscan.io/api/v2/addresses/${ADDR}/transactions`;

console.log("Fetching:", URL);

https.get(URL, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            if (json.items && json.items.length > 0) {
                console.log("First Tx Timestamp:", json.items[0].timestamp);
                console.log("Raw First Item:", JSON.stringify(json.items[0], null, 2));
            } else {
                console.log("No items found:", json);
            }
        } catch (e) {
            console.error("Parse error:", e);
        }
    });
});
