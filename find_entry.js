const fs = require('fs');

const address = '0x3054e1986fe5faa920Cfae137f711f66F82cDE07';
const path = './public/known_domains.json';

try {
    const data = fs.readFileSync(path, 'utf8');
    const domains = JSON.parse(data);
    const entry = domains.find(d => d.address.toLowerCase() === address.toLowerCase());

    if (entry) {
        console.log('Found entry:', JSON.stringify(entry, null, 2));
    } else {
        console.log('Entry NOT found in known_domains.json');
    }
} catch (err) {
    console.error('Error:', err);
}
