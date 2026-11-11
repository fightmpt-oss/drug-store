const https = require('https');
const fs = require('fs');

const options = {
  hostname: 'www.dtam.moph.go.th',
  port: 443,
  path: '/thai-med-code/',
  method: 'GET',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'th,en-US;q=0.7,en;q=0.3'
  }
};

const req = https.request(options, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Length header:', res.headers['content-length']);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Total length received:', data.length);
    fs.writeFileSync('scripts/dtam_saved_page.html', data, 'utf8');
    
    // Look for No_01
    const lines = data.split('\n');
    const matchedLines = lines.filter(l => l.includes('No_01') || l.includes('.xlsx') || l.includes('11,482') || l.includes('44,541'));
    console.log('Matched lines count:', matchedLines.length);
    matchedLines.forEach(l => console.log('Line:', l.trim()));
  });
});
req.on('error', e => console.error(e));
req.end();
