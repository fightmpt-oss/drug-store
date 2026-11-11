const https = require('https');
const fs = require('fs');

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*'
};

https.get('https://www.dtam.moph.go.th/wp-json/wp/v2/pages/1030', { headers }, res => {
  console.log('Status:', res.statusCode);
  console.log('Content-Type:', res.headers['content-type']);
  let jsonStr = '';
  res.on('data', c => jsonStr += c);
  res.on('end', () => {
    console.log('Length:', jsonStr.length);
    try {
      const page = JSON.parse(jsonStr);
      console.log('Title:', page.title?.rendered);
      const content = page.content?.rendered || '';
      console.log('Content length:', content.length);
      fs.writeFileSync('scripts/dtam_wp_content.html', content, 'utf8');

      // Search for No_01 or xlsx
      const xlsxMatches = content.match(/href=["']([^"']*\.xlsx[^"']*)["']/gi) || [];
      console.log('XLSX Matches:', xlsxMatches);

      // Search for any links
      const aMatches = [];
      const regex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while ((m = regex.exec(content)) !== null) {
        aMatches.push({ href: m[1], text: m[2].replace(/<[^>]+>/g, '').trim() });
      }
      console.log('Total A tags:', aMatches.length);
      const relevant = aMatches.filter(a => a.href.includes('xls') || a.text.includes('xls') || a.text.includes('No_01') || a.href.includes('download'));
      console.log('Relevant links:', relevant);
    } catch (e) {
      console.error('Parse error:', e.message);
      console.log('Raw preview:', jsonStr.slice(0, 500));
    }
  });
}).on('error', console.error);
