const https = require('https');
const fs = require('fs');

const cookie = 'visid_incap_3233646=q+7B3KDYQTqNy47nIPn1JLPd0WoAAAAAQUIPAAAAAADW8CFd7b/8l3M28XKDWaaW; incap_ses_297_3233646=1esdMsvaEGFuOFycCygfBMPd0WoAAAAAYXx99ypmQUVh0Lt5fp6KlQ==';

const options = {
  hostname: 'www.dtam.moph.go.th',
  port: 443,
  path: '/thai-med-code/',
  method: 'GET',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'th,en-US;q=0.7,en;q=0.3',
    'Cookie': cookie
  }
};

https.get(options, res => {
  console.log('Status with cookie:', res.statusCode);
  let html = '';
  res.on('data', c => html += c);
  res.on('end', () => {
    console.log('Length with cookie:', html.length);
    fs.writeFileSync('scripts/dtam_with_cookie.html', html, 'utf8');
    const idx = html.indexOf('No_01');
    console.log('No_01 index:', idx);
    if (idx !== -1) {
      console.log('Snippet around No_01:', html.substring(idx - 200, idx + 400));
    }
  });
}).on('error', console.error);
