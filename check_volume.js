const API_BASE = 'https://www.storyscan.io/api/v2';
const ADDRESS = '0x19FFDa63B0fbaa3a51e68c894e97ba0C152003d6';

async function checkVolume() {
    console.log(`Calculating 30-Day Volume for ${ADDRESS}...`);
    console.log(`Calculating All-Time Volume for ${ADDRESS}...`);

    let totalVolume = BigInt(0);
    let count = 0;
    let keepFetching = true;
    let nextPageParams = '';

    // START_TIME = 0; // All Time - Date filtering removed for all-time calculation

    try {
        while (keepFetching) {
            const res = await fetch(`${API_BASE}/addresses/${ADDRESS}/transactions?${nextPageParams}`);
            if (!res.ok) throw new Error(`API Error ${res.status}`);

            const data = await res.json();
            const items = data.items || [];

            if (items.length === 0) break;

            for (const tx of items) {
                const txDate = new Date(tx.timestamp);
                const diff = now.getTime() - txDate.getTime();

                if (diff > ms30d) {
                    keepFetching = false;
                    break;
                }

                // Logic matches WalletDetailsModal: Only contract interactions count towards volume
                if (tx.to && tx.to.is_contract) {
                    totalVolume += BigInt(tx.value || 0);
                    count++;
                }
            }

            if (data.next_page_params && typeof data.next_page_params === 'object') {
                nextPageParams = new URLSearchParams(data.next_page_params).toString();
            } else {
                keepFetching = false;
            }
        }

        const volIP = Number(totalVolume) / 1e18;
        console.log(`\n--- RESULT ---`);
        console.log(`Address: ${ADDRESS}`);
        console.log(`Timeframe: Last 30 Days`);
        console.log(`Contract Interactions: ${count}`);
        console.log(`Total Volume: ${volIP.toFixed(2)} IP`);
        console.log(`(Raw Wei: ${totalVolume.toString()})`);

    } catch (e) {
        console.error("Error:", e.message);
    }
}

checkVolume();
