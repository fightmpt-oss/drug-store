const https = require('https');
const fs = require('fs');

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'th,en-US;q=0.7,en;q=0.3',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Upgrade-Insecure-Requests': '1'
};

https.get('https://www.dtam.moph.go.th/thai-med-code/', { headers }, res => {
  console.log('Status:', res.statusCode);
  console.log('Set-Cookie:', res.headers['set-cookie']);
  let html = '';
  res.on('data', c => html += c);
  res.on('end', () => {
    console.log('Total length:', html.length);
    fs.writeFileSync('scripts/dtam_page.html', html, 'utf8');

    // If it's the real page, let's look for table rows and links
    const links = [];
    const aRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = aRegex.exec(html)) !== null) {
      const href = m[1];
      const text = m[2].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
      if (href.includes('.xls') || href.includes('download') || text.includes('.xls') || text.includes('No_01') || text.includes('ดาวน์โหลด')) {
        links.push({ href, text });
      }
    }
    console.log('Matching links found:', links);

    // Also look for download monitor shortcodes or data tables
    const tableRegex = /<table[\s\S]*?<\/table>/gi;
    const tables = html.match(tableRegex) || [];
    console.log('Total tables found:', tables.length);
    tables.forEach((t, i) => {
      if (t.includes('No_01') || t.includes('11,482') || t.includes('เดี่ยว') || t.includes('xls')) {
        console.log(`Table ${i} matched! Length:`, t.length);
        console.log(`Table ${i} preview:`, t.slice(0, 1500));
      }
    });
  });
}).on('error', console.error);
