import { pool } from './db.js';
import { DisambQuestion, FilterType, LookupInput, LookupOutput, PartHit } from './types.js';

type Row = {
  make: string;
  model: string;
  year_from: number;
  year_to: number;
  engine_code: string | null;
  fuel: string | null;
  displacement_l: number | string | null;
  power_hp: number | null;
  body: string | null;
  ac: boolean | null;
  engine_series: string | null;
  engine_desc_raw: string | null;
  filter_type: FilterType;
  brand_src: string;
  part_number: string;
  catalog_year: number;
  page: string;
};

const FILTERS: FilterType[] = ['oil','air','cabin','fuel'];

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const n = parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function score(
  row: Row,
  hints: LookupInput['hints'],
  ctx: { fuelUnique: boolean; acUnique: boolean; displacementUnique: boolean; engineSeriesUnique: boolean }
): number {
  const rowDisp = toNumberOrNull(row.displacement_l);
  const hintDisp = toNumberOrNull(hints?.displacement_l as any);

  let s = 0.40; // base

  const fuelMatched = !!(hints?.fuel && row.fuel && hints.fuel === row.fuel);
  if (fuelMatched || ctx.fuelUnique) s += 0.35;

  const acHintIsBool = typeof hints?.ac === 'boolean';
  const acMatched = acHintIsBool && typeof row.ac === 'boolean' && hints!.ac === row.ac;
  if (acMatched || ctx.acUnique) s += 0.25;

  const dispMatched = hintDisp != null && rowDisp != null && Math.abs(rowDisp - hintDisp) <= 0.1;
  if (dispMatched || ctx.displacementUnique) s += 0.25;

  const engineSeriesMatched = !!(hints?.engine_series && row.engine_series && hints.engine_series === row.engine_series);
  if (engineSeriesMatched || ctx.engineSeriesUnique) s += 0.20;

  if (row.engine_code) s += 0.10;

  // final clamp
  const clamped = Math.min(Math.max(s, 0.50), 0.99);
  return clamped;
}

function inferDisambiguation(rows: Row[], hints: LookupInput['hints']): DisambQuestion[] {
  const ask: DisambQuestion[] = [];
  
  // Применяем текущие hints для получения candidate set
  const filtered = rows.filter(r => {
    if (hints?.fuel && r.fuel && r.fuel !== hints.fuel) return false;
    if (typeof hints?.ac === 'boolean' && typeof r.ac === 'boolean' && r.ac !== hints.ac) return false;
    const hintDisp = toNumberOrNull(hints?.displacement_l as any);
    const rowDisp = toNumberOrNull(r.displacement_l);
    if (hintDisp != null && rowDisp != null && Math.abs(rowDisp - hintDisp) > 0.1) return false;
    if (hints?.engine_series && r.engine_series && r.engine_series !== hints.engine_series) return false;
    return true;
  });
  
  const fuels = new Set(filtered.map(r => r.fuel).filter(Boolean) as string[]);
  const acs = new Set(filtered.map(r => String(r.ac)).filter(v => v !== 'null'));
  const engineSeries = new Set(filtered.map(r => r.engine_series).filter(Boolean) as string[]);
  
  // Пошаговая дизамбигуация: один вопрос за раз по приоритету
  // 1) fuel, 2) ac, 3) displacement_l, 4) engine_series
  if (!hints?.fuel && fuels.size > 1) {
    ask.push({ field: 'fuel', options: ['nafta','diesel'], reason: 'Hay variantes por combustible.' });
  } else if (hints?.fuel && !hints.ac && acs.size > 1) {
    ask.push({ field: 'ac', options: [true, false], reason: 'Hay variantes por tipo de media de cabina.' });
  } else if (hints?.fuel && hints.ac && !hints.displacement_l && doesDisplacementAffectResult(filtered)) {
    const dispValues: number[] = [];
    for (const r of filtered) {
      const n = toNumberOrNull(r.displacement_l);
      if (n != null) dispValues.push(n);
    }
    const roundedUnique = new Set(
      Array.from(new Set(dispValues))
        .map(x => Math.round(x * 10) / 10)
        .filter(x => Number.isFinite(x))
    );
    const opts = Array.from(roundedUnique).sort((a, b) => a - b);
    ask.push({ field: 'displacement_l', options: opts, reason: 'Hay variantes por cilindrada.' });
  } else if (hints?.fuel && hints.ac && !hints.engine_series && engineSeries.size > 1) {
    const opts = Array.from(engineSeries).sort();
    ask.push({ field: 'engine_series', options: opts, reason: 'Hay variantes por serie de motor.' });
  }
  return ask;
}

function doesDisplacementAffectResult(rows: Row[]): boolean {
  // Группируем записи по (filter_type, brand_src, part_number)
  const groups = new Map<string, Set<number>>();
  
  for (const r of rows) {
    const disp = toNumberOrNull(r.displacement_l);
    if (disp == null) continue; // Исключаем NULL значения
    
    const key = `${r.filter_type}::${r.brand_src}::${r.part_number}`;
    if (!groups.has(key)) {
      groups.set(key, new Set());
    }
    groups.get(key)!.add(Math.round(disp * 10) / 10); // Округляем до 0.1
  }
  
  // Проверяем, есть ли группы с разными значениями displacement_l
  // Это означает, что displacement_l влияет на результат
  for (const [key, displacements] of groups) {
    if (displacements.size > 1) {
      return true; // displacement_l влияет на результат
    }
  }
  
  return false; // displacement_l не влияет на результат
}

export async function lookup(input: LookupInput): Promise<LookupOutput> {
  const { make, model, year } = input;
  const hints = input.hints ?? {};
  if (!make || !model || !year) {
    throw Object.assign(new Error('Missing fields'), { status: 400 });
  }
  if (!pool) {
    throw Object.assign(new Error('Database not available'), { status: 503 });
  }
  const result = await pool.query<Row>(
    `
    SELECT make, model, year_from, year_to, engine_code, fuel, displacement_l, power_hp, body, ac,
           engine_series, engine_desc_raw, filter_type, brand_src, part_number, catalog_year, page
    FROM catalog_hit
    WHERE LOWER(make) = LOWER($1)
      AND LOWER(model) = LOWER($2)
      AND $3 BETWEEN year_from AND year_to
    `,
    [make, model, year]
  );
  const rows = result.rows;
  if (rows.length === 0) {
    return {
      query: input,
      results: {
        oil: [],
        air: [],
        cabin: [],
        fuel: []
      },
      disambiguation: { needed: false, ask: [] },
      notices: ['No hay registros en los catálogos para esta combinación.']
    };
  }
  const ask = inferDisambiguation(rows, hints);
  const needAsk = ask.length > 0;
  const filtered = rows.filter(r => {
    if (hints.fuel && r.fuel && r.fuel !== hints.fuel) return false;
    if (typeof hints.ac === 'boolean' && typeof r.ac === 'boolean' && r.ac !== hints.ac) return false;
    const hintDisp = toNumberOrNull(hints.displacement_l as any);
    const rowDisp = toNumberOrNull(r.displacement_l);
    if (hintDisp != null && rowDisp != null && Math.abs(rowDisp - hintDisp) > 0.1) return false;
    if (hints.engine_series && r.engine_series && r.engine_series !== hints.engine_series) return false;
    return true;
  });
  const working = filtered.length > 0 ? filtered : rows;

  // uniqueness context for scoring
  const fuelSet = new Set(working.map(r => r.fuel).filter(Boolean) as string[]);
  const acSet = new Set(working.map(r => String(r.ac)).filter(v => v !== 'null'));
  const dispSet = new Set(
    working
      .map(r => toNumberOrNull(r.displacement_l))
      .filter((v): v is number => v != null)
      .map(v => Math.round(v * 10) / 10)
  );
  const engineSeriesSet = new Set(working.map(r => r.engine_series).filter(Boolean) as string[]);
  const ctx = {
    fuelUnique: fuelSet.size === 1,
    acUnique: acSet.size === 1,
    displacementUnique: dispSet.size === 1,
    engineSeriesUnique: engineSeriesSet.size === 1,
  };
  const byType = new Map<FilterType, Map<string, PartHit>>();
  for (const ft of ['oil','air','cabin','fuel'] as FilterType[]) byType.set(ft, new Map());
  for (const r of working) {
    const conf = score(r, hints, ctx);
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
  const results: Record<FilterType, PartHit[]> = {
    oil: [],
    air: [],
    cabin: [],
    fuel: []
  };
  
  for (const ft of ['oil','air','cabin','fuel'] as FilterType[]) {
    const list = Array.from(byType.get(ft)!.values()).sort((a, b) => b.confidence - a.confidence);
    if (list.length === 1) {
      list[0].confidence = Math.max(list[0].confidence, 0.95);
    }
    results[ft] = list;
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
                     ask[0]?.field === 'ac'   ? '¿Filtro de cabina: estándar (CU) o carbón activo/bio (CUK/FP)?' :
                     ask[0]?.field === 'displacement_l' ? 'Decime la cilindrada (ej: 1.6).' :
                     ask[0]?.field === 'engine_series' ? '¿Serie del motor? (ej.: TBI 16V)' :
                     'Falta un dato',
            'ru':    ask[0]?.field === 'fuel' ? 'Nafta или diesel?' :
                     ask[0]?.field === 'ac'   ? 'Салонный фильтр: стандарт (CU) или уголь/био (CUK/FP)?' :
                     ask[0]?.field === 'displacement_l' ? 'Уточни объем двигателя (например, 1.6).' :
                     ask[0]?.field === 'engine_series' ? 'Серия двигателя? (например, TBI 16V)' :
                     'Нужен уточняющий пункт'
          }
        }
      : { needed: false, ask: [] },
    notices: ['Resultados basados en catálogos importados. Verificá combustible/tipo de media si hay duda.']
  };
}
