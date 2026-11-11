const fs = require('fs');
const readline = require('readline');
const file = 'C:/Users/Acer/.gemini/antigravity/brain/60bbdf21-65ac-4f3c-aced-ddec7f8d439b/.system_generated/logs/transcript_full.jsonl';
const rl = readline.createInterface({ input: fs.createReadStream(file) });
rl.on('line', (line) => {
  if (line.includes('"step_index": 5517') || line.includes('"step_index":5517')) {
    const obj = JSON.parse(line);
    console.log('Found 5517:', Object.keys(obj));
    fs.writeFileSync('scripts/step_5517.json', JSON.stringify(obj, null, 2), 'utf8');
  }
});
