const API_BASE = 'https://www.storyscan.io/api/v2';
// A wallet that definitely has balance 266.10 (from logs) -> storyfoundation.ip 
// Address for storyfoundation.ip (I don't have it handy from logs directly, picking the first from list)
const address = '0x4Ec04c2ca8ef0061170d9EB5589aA09a80ce0Fff';

async function check() {
    const urls = [
        `${API_BASE}/addresses/${address}/transactions`
    ];

    for (const url of urls) {
        console.log(`\nChecking ${url}...`);
        try {
            const res = await fetch(url);
            console.log("Status:", res.status);
            if (!res.ok) {
                console.log("Error body:", await res.text());
                continue;
            }
            const json = await res.json();
            console.log("Items Count:", json.items ? json.items.length : 0);
            if (json.items && json.items.length > 0) {
                console.log("First Tx [0]:", JSON.stringify(json.items[0], null, 2));
            }
        } catch (e) {
            console.log("Error:", e.message);
        }
    }
}

check();
