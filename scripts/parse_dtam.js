const https = require('https');

https.get('https://www.dtam.moph.go.th/thai-med-code/', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'th,en-US;q=0.9,en;q=0.8'
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    // Find all links
    const linkRegex = /href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
    let match;
    const xlsxLinks = [];
    const downloadLinks = [];
    while ((match = linkRegex.exec(data)) !== null) {
      const url = match[1];
      const text = match[2].replace(/<[^>]+>/g, '').trim();
      if (url.includes('.xlsx') || url.includes('.xls') || text.includes('.xlsx') || text.includes('No_01')) {
        xlsxLinks.push({ url, text });
      }
      if (url.includes('download') || url.includes('wp-content/uploads')) {
        downloadLinks.push({ url, text });
      }
    }
    console.log('XLSX / No_01 links found:', xlsxLinks);
    console.log('Download / upload links count:', downloadLinks.length);
    console.log('Sample download links:', downloadLinks.slice(0, 10));

    const idx = data.indexOf('No_01-165.xlsx');
    const dlMatch = data.match(/href=["'](https?:\/\/www\.dtam\.moph\.go\.th\/dtam-dl\/\d+\/[^"']*)["'][^>]*>\s*No_01-\d+\.xlsx/i)
      || data.match(/href=["'](https?:\/\/www\.dtam\.moph\.go\.th\/dtam-dl\/\d+\/[^"']*)["']/i);
    
    if (dlMatch) {
      console.log('Downloading master file from:', dlMatch[1]);
      const fs = require('fs');
      const path = require('path');
      const file = fs.createWriteStream(path.join(__dirname, 'dtam_sample.xlsx'));
      https.get(dlMatch[1], {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.dtam.moph.go.th/thai-med-code/'
        }
      }, (dlRes) => {
        console.log('Download status:', dlRes.statusCode, dlRes.headers['content-type']);
        dlRes.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('Downloaded finished! File size:', fs.statSync(path.join(__dirname, 'dtam_sample.xlsx')).size, 'bytes');
          
          // Inspect with xlsx
          const XLSX = require('xlsx');
          const wb = XLSX.readFile(path.join(__dirname, 'dtam_sample.xlsx'));
          for (const sName of wb.SheetNames) {
            const sheet = wb.Sheets[sName];
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            console.log(`\n=== Sheet "${sName}" (Total rows: ${json.length}) ===`);
            for (let i = 0; i < Math.min(5, json.length); i++) {
              console.log(`Row ${i}:`, json[i]);
            }
          }
          process.exit(0);
        });
      });
    } else {
      console.log('Could not find download link');
    }
  });
}).on('error', err => {
  console.error('HTTPS Error:', err.message);
});
