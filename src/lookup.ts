import { pool } from './db.js';
import { DisambQuestion, FilterType, LookupInput, LookupOutput, PartHit } from './types.js';

type Row = {
  make: string;
  model: string;
  year_from: number;
  year_to: number;
  engine_code: string | null;
  fuel: string | null;
  displacement_l: number | null;
  power_hp: number | null;
  body: string | null;
  ac: boolean | null;
  filter_type: FilterType;
  brand_src: string;
  part_number: string;
  catalog_year: number;
  page: string;
};

const FILTERS: FilterType[] = ['oil','air','cabin','fuel'];

function score(row: Row, hints: LookupInput['hints']): number {
  let s = 0;
  if (hints?.fuel && row.fuel && hints.fuel === row.fuel) s += 0.5;
  if (typeof hints?.ac === 'boolean' && typeof row.ac === 'boolean' && hints.ac === row.ac) s += 0.3;
  if (hints?.displacement_l && row.displacement_l && Math.abs(row.displacement_l - hints.displacement_l) < 0.05) {
    s += 0.3;
  } else if (row.engine_code && hints?.displacement_l == null) {
    s += 0.1;
  }
  if (row.body) s += 0.05;
  return Math.min(1, Math.max(0, s));
}

function inferDisambiguation(rows: Row[], hints: LookupInput['hints']): DisambQuestion[] {
  const ask: DisambQuestion[] = [];
  const fuels = new Set(rows.map(r => r.fuel).filter(Boolean) as string[]);
  const acs = new Set(rows.map(r => String(r.ac)).filter(v => v !== 'null'));
  const disps = new Set(rows.map(r => r.displacement_l).filter(Boolean) as number[]);
  if (!hints?.fuel && fuels.size > 1) {
    ask.push({ field: 'fuel', options: ['nafta','diesel'], reason: 'Hay variantes por combustible.' });
  }
  if (hints?.fuel && !hints.ac && acs.size > 1) {
    ask.push({ field: 'ac', options: [true, false], reason: 'Hay variantes con/sin aire acondicionado.' });
  }
  if (!hints?.displacement_l && disps.size > 1) {
    const opts = Array.from(disps).sort().map(x => Number(x.toFixed(1)));
    ask.push({ field: 'displacement_l', options: opts, reason: 'Hay variantes por cilindrada.' });
  }
  return ask;
}

export async function lookup(input: LookupInput): Promise<LookupOutput> {
  const { make, model, year } = input;
  const hints = input.hints ?? {};
  if (!make || !model || !year) {
    throw Object.assign(new Error('Missing fields'), { status: 400 });
  }
  const { rows } = await pool.query<Row>(
    `
    SELECT make, model, year_from, year_to, engine_code, fuel, displacement_l, power_hp, body, ac,
           filter_type, brand_src, part_number, catalog_year, page
    FROM catalog_hit
    WHERE LOWER(make) = LOWER($1)
      AND LOWER(model) = LOWER($2)
      AND $3 BETWEEN year_from AND year_to
    `,
    [make, model, year]
  );
  if (rows.length === 0) {
    return {
      query: input,
      results: {},
      disambiguation: { needed: false, ask: [] },
      notices: ['No hay registros en los catálogos para esta combinación.']
    };
  }
  const ask = inferDisambiguation(rows, hints);
  const needAsk = ask.length > 0;
  const filtered = rows.filter(r => {
    if (hints.fuel && r.fuel && r.fuel !== hints.fuel) return false;
    if (typeof hints.ac === 'boolean' && typeof r.ac === 'boolean' && r.ac !== hints.ac) return false;
    if (hints.displacement_l && r.displacement_l && Math.abs(r.displacement_l - hints.displacement_l) >= 0.05) return false;
    return true;
  });
  const working = filtered.length > 0 ? filtered : rows;
  const byType = new Map<FilterType, Map<string, PartHit>>();
  for (const ft of ['oil','air','cabin','fuel'] as FilterType[]) byType.set(ft, new Map());
  for (const r of working) {
    const conf = score(r, hints);
    const key = `${r.brand_src}::${r.part_number}`;
    const bucket = byType.get(r.filter_type)!;
    if (!bucket.has(key)) {
      bucket.set(key, {
        brand: r.brand_src,
        part_number: r.part_number,
        filter_type: r.filter_type,
        confidence: conf,
        sources: [{ catalog: `${r.brand_src} ${r.catalog_year}`, page: r.page }]
      });
    } else {
      const ph = bucket.get(key)!;
      ph.confidence = Math.max(ph.confidence, conf);
      const tag = `${r.brand_src} ${r.catalog_year}`;
      if (!ph.sources.find(s => s.catalog === tag && s.page === r.page)) {
        ph.sources.push({ catalog: tag, page: r.page });
      }
    }
  }
  const results: LookupOutput['results'] = {};
  for (const ft of ['oil','air','cabin','fuel'] as FilterType[]) {
    const list = Array.from(byType.get(ft)!.values()).sort((a, b) => b.confidence - a.confidence);
    if (list.length > 0) results[ft] = list;
  }
  return {
    query: input,
    results,
    disambiguation: needAsk
      ? {
          needed: true,
          ask,
          fallback_texts: {
            'es-AR': ask[0]?.field === 'fuel' ? '¿Nafta o diésel?' :
                     ask[0]?.field === 'ac'   ? '¿Tiene aire acondicionado?' :
                     'Decime la cilindrada (ej: 1.6).',
            'ru':    ask[0]?.field === 'fuel' ? 'Nafta или diesel?' :
                     ask[0]?.field === 'ac'   ? 'Есть кондиционер (AC)?' :
                     'Уточни объем двигателя (например, 1.6).'
          }
        }
      : { needed: false, ask: [] },
    notices: ['Resultados basados en catálogos importados. Verificá combustible/AC si hay duda.']
  };
}
