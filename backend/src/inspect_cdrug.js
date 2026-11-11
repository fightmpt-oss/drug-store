const { initPool, getPool, isLive } = require('./config/db');

async function run() {
  await initPool();
  const pool = getPool();
  if (!pool) {
    console.log('Cannot connect to live MySQL pool');
    process.exit(1);
  }

  const [tables] = await pool.query("SHOW TABLES LIKE '%drug%'");
  console.log('Drug tables:', tables.map(r => Object.values(r)[0]));

  const [cdrugCols] = await pool.query('DESCRIBE cdrug');
  console.log('\ncdrug columns:\n', cdrugCols.map(c => `${c.Field} (${c.Type})`).join(', '));

  const [sample] = await pool.query('SELECT * FROM cdrug LIMIT 3');
  console.log('\nSample cdrug rows:');
  sample.forEach((r, i) => console.log(`[${i+1}] drugcode: ${r.drugcode}, drugname: ${r.drugname}, unit: ${r.drugunit}, price: ${r.unitprice || r.cost || '-'}, tmtcode: ${r.tmtcode || r.tmtid || '-'}`));

  const [[count]] = await pool.query('SELECT count(*) as total FROM cdrug');
  console.log('\nTotal drugs in cdrug:', count.total);

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
