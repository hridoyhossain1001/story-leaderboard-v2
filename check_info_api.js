const API_BASE = 'https://www.storyscan.io/api/v2';
const address = '0x4Ec04c2ca8ef0061170d9EB5589aA09a80ce0Fff'; // A wallet from the list

async function check() {
    console.log(`Checking Info for ${address}...`);

    // Check main info
    const infoUrl = `${API_BASE}/addresses/${address}`;
    try {
        const res = await fetch(infoUrl);
        const json = await res.json();
        console.log("--- /addresses/ADDR ---");
        console.log(JSON.stringify(json, null, 2));
    } catch (e) { console.log(e); }

    // Check counters (common in Blockscout)
    const countersUrl = `${API_BASE}/addresses/${address}/counters`;
    try {
        const res = await fetch(countersUrl);
        if (res.ok) {
            const json = await res.json();
            console.log("--- /counters ---");
            console.log(JSON.stringify(json, null, 2));
        } else {
            console.log("--- /counters --- (404/Error)");
        }
    } catch (e) { console.log(e); }
}

check();
