const fs = require('fs');
const path = require('path');

// Configuration
const API_BASE = 'https://www.storyscan.io/api/v2';
const OUTPUT_FILE = path.join(__dirname, 'public', 'known_domains.json');
const SAFETY_BUFFER = 50;
const BATCH_SIZE = 200; // ⚠️ High Load Mode requested by User

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchBlockTransactions(blockNumber) {
  try {
    const res = await fetch(`${API_BASE}/blocks/${blockNumber}/transactions`);
    if (res.status === 429) return { rateLimit: true }; // Hit limit
    if (!res.ok) return { items: [] };
    return await res.json();
  } catch (error) {
    return { items: [] };
  }
}

async function fetchLatestBlockNumber() {
  try {
    const res = await fetch(`${API_BASE}/blocks`);
    if (!res.ok) throw new Error("Failed");
    const json = await res.json();
    return json.items ? parseInt(json.items[0].height) : 0;
  } catch (e) { return 0; }
}

async function fetchFullProfile(address) {
  try {
    const [detailsRes, countersRes] = await Promise.all([
      fetch(`${API_BASE}/addresses/${address}`),
      fetch(`${API_BASE}/addresses/${address}/counters`)
    ]);

    const details = detailsRes.ok ? await detailsRes.json() : {};
    const counters = countersRes.ok ? await countersRes.json() : {};

    let balance = "0.00";
    if (details.coin_balance) {
      balance = (parseFloat(details.coin_balance) / 1e18).toFixed(2);
    }

    return {
      tx_count: counters.transactions_count || "0",
      balance: balance
    };
  } catch (error) {
    return { tx_count: "0", balance: "0.00" };
  }
}

async function main() {
  console.log(`🚀 Starting EXTREME Scanner (Batch Size: ${BATCH_SIZE})...`);

  const knownDomains = new Map();
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE));
      existing.forEach(e => knownDomains.set(e.address, e));
      console.log(`📚 Loaded ${existing.length} existing domains.`);
    } catch (e) { }
  }

  let latest = await fetchLatestBlockNumber();
  while (latest === 0) {
    console.log("Waiting for API...");
    await sleep(3000);
    latest = await fetchLatestBlockNumber();
  }

  let currentBlock = latest - SAFETY_BUFFER;
  console.log(`🟢 Starting Extreme Monitor at Block ${currentBlock} (Head: ${latest})`);

  while (true) {
    const head = await fetchLatestBlockNumber();

    if (head >= currentBlock) {
      while (currentBlock <= head) {
        const batchEnd = Math.min(currentBlock + BATCH_SIZE - 1, head);
        const batchSize = batchEnd - currentBlock + 1;

        // Visual Spinner for high speed scanning
        const time = new Date().toLocaleTimeString();
        if (batchSize > 1) {
          process.stdout.write(`\r[${time}] ⚡ Scanning Block ${currentBlock} -> ${batchEnd} (${batchSize} blocks)...`);
        }

        const promises = [];
        for (let b = currentBlock; b <= batchEnd; b++) {
          promises.push(fetchBlockTransactions(b).then(data => ({ block: b, data })));
        }

        const results = await Promise.all(promises);

        let hitRateLimit = false;

        for (const { block, data } of results) {
          if (data.rateLimit) { hitRateLimit = true; continue; }

          // Log API failure if items is undefined but no rate limit
          if (!data.items && !data.rateLimit) {
            // Silent fail usually, but let's log intermittently if needed. 
            // keeping it clean for now to avoid spamming "Error".
          }

          if (data.items && data.items.length > 0) {
            for (const tx of data.items) {
              let found = false, addr = null, name = null;
              if (tx.from?.ens_domain_name?.endsWith('.ip')) { found = true; addr = tx.from.hash; name = tx.from.ens_domain_name; }
              else if (tx.to?.ens_domain_name?.endsWith('.ip')) { found = true; addr = tx.to.hash; name = tx.to.ens_domain_name; }

              if (found) await processCandidate(knownDomains, addr, name, tx.timestamp, tx.hash);
            }
          }
        }

        if (hitRateLimit) {
          console.warn("\n⚠️ API Rate Limit Hit (429)! Cooling down for 5s...");
          await sleep(5000);
        }

        // Print persistence log every ~500 blocks or if we just finished a large batch
        if (currentBlock % 1000 < BATCH_SIZE) {
          console.log(`\n✅ [${time}] Checkpoint: Reached Block ${batchEnd}. Active.`);
        }

        currentBlock += batchSize;
        await sleep(50);
      }
      saveProgress(Array.from(knownDomains.values()));
    } else {
      process.stdout.write(`\r💤 [${new Date().toLocaleTimeString()}] Waiting for Block ${currentBlock}... (Head: ${head})    `);
      await sleep(2000);
    }
  }
}

async function processCandidate(map, address, name, timestamp, txHash) {
  const isNew = !map.has(address);
  if (isNew || map.get(address).balance === "0.00") {
    console.log(`\n🔔 Live Hit: ${name}`);
    const stats = await fetchFullProfile(address);
    map.set(address, { address, name, last_active: timestamp, ...stats, first_seen_tx: txHash });
    saveProgress(Array.from(map.values()));
  } else {
    // Existing user: Check if this is a newer activity AND update their stats
    const current = map.get(address);
    if (new Date(timestamp) > new Date(current.last_active)) {
      console.log(`\n🔄 Updating Stats: ${name}`);
      // Always re-fetch mostly for tx_count accuracy
      const stats = await fetchFullProfile(address);

      const updated = {
        ...current,
        last_active: timestamp,
        tx_count: stats.tx_count, // Update count
        balance: stats.balance    // Update balance
      };
      map.set(address, updated);
      // Save immediately so UI reflects the change
      saveProgress(Array.from(map.values()));
    }
  }
}

function saveProgress(data) {
  if (!fs.existsSync(path.join(__dirname, 'public'))) {
    fs.mkdirSync(path.join(__dirname, 'public'));
  }
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
}

main();
