const https = require('https');

const address = '0x5625f6e30c448e1cc4b7c54f1d70c8eefa20d556'; // First from missing list
const API_KEY = 'MhBsxkU1z9fG6TofE59KqiiWV-YlYE8Q4awlLQehF3U';

const options = {
    hostname: 'www.storyscan.io',
    path: `/api/v2/addresses/${address}`,
    method: 'GET',
    headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'X-API-Key': API_KEY
    }
};

const req = https.request(options, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log(JSON.stringify(JSON.parse(data), null, 2));
    });
});

req.on('error', error => {
    console.error(error);
});

req.end();
