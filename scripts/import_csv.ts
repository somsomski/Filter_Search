import fs from 'node:fs';
import { pool } from '../src/db.js';

function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  return lines.map(line => {
    return line.split(',').map(s => s.trim());
  });
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npm run import:csv -- <path-to-csv>');
    process.exit(1);
  }
  if (!pool) {
    console.error('DATABASE_URL not set, cannot import');
    process.exit(1);
  }
  const csv = fs.readFileSync(file, 'utf8');
  const rows = parseCSV(csv);
  const header = rows[0];
  const body = rows.slice(1);
  const required = [
    'brand_src','catalog_year','page','make','model','year_from','year_to',
    'engine_code','fuel','displacement_l','power_hp','body','ac',
    'filter_type','part_number','notes'
  ];
  const miss = required.filter(k => !header.includes(k));
  if (miss.length) {
    console.error('CSV missing columns:', miss);
    process.exit(1);
  }
  const col: Record<string, number> = Object.fromEntries(header.map((h,i)=>[h,i]));
  const anyRow = body[0];
  const brand_src = anyRow[col['brand_src']];
  const catalog_year = Number(anyRow[col['catalog_year']]);
  const { rows: ib } = await pool.query(
    `INSERT INTO ingestion_batch (brand_src, catalog_year) VALUES ($1,$2) RETURNING id`,
    [brand_src, catalog_year]
  );
  const batchId = ib[0].id;
  let ok = 0, fail = 0;
  for (const r of body) {
    try {
      const vals = {
        make: r[col['make']],
        model: r[col['model']],
        year_from: Number(r[col['year_from']]),
        year_to: Number(r[col['year_to']]),
        engine_code: r[col['engine_code']] || null,
        fuel: r[col['fuel']] || null,
        displacement_l: r[col['displacement_l']] ? Number(r[col['displacement_l']]) : null,
        power_hp: r[col['power_hp']] ? Number(r[col['power_hp']]) : null,
        body: r[col['body']] || null,
        ac: r[col['ac']] === '' ? null : (r[col['ac']].toLowerCase() == 'true'),
        filter_type: r[col['filter_type']],
        brand_src: r[col['brand_src']],
        part_number: r[col['part_number']],
        catalog_year: Number(r[col['catalog_year']]),
        page: r[col['page']],
        notes: r[col['notes']] || null
      };
      await pool.query(
        `INSERT INTO catalog_hit
         (make,model,year_from,year_to,engine_code,fuel,displacement_l,power_hp,body,ac,
          filter_type,brand_src,part_number,catalog_year,page,notes,ingestion_batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          vals.make, vals.model, vals.year_from, vals.year_to, vals.engine_code, vals.fuel,
          vals.displacement_l, vals.power_hp, vals.body, vals.ac,
          vals.filter_type, vals.brand_src, vals.part_number, vals.catalog_year, vals.page,
          vals.notes, batchId
        ]
      );
      ok++;
    } catch (e) {
      fail++;
      console.error('Row failed:', r.join(','), e);
    }
  }
  await pool.query('UPDATE ingestion_batch SET log = $1 || E\'\nOK: \' || $3 || \', FAIL: \' || $4 WHERE id = $2', ['import_csv', batchId, ok.toString(), fail.toString()]);
  console.log(`Import completed successfully.`);
  console.log(`Records inserted: ${ok}`);
  console.log(`Records failed: ${fail}`);
  console.log(`Batch ID: ${batchId}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
