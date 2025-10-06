import { pool } from './db.js';
const FILTERS = ['oil', 'air', 'cabin', 'fuel'];
function toNumberOrNull(value) {
    if (value == null)
        return null;
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : null;
    const n = parseFloat(String(value).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}
function score(row, hints, ctx) {
    const rowDisp = toNumberOrNull(row.displacement_l);
    const hintDisp = toNumberOrNull(hints?.displacement_l);
    let s = 0.40; // base
    const fuelMatched = !!(hints?.fuel && row.fuel && hints.fuel === row.fuel);
    if (fuelMatched || ctx.fuelUnique)
        s += 0.35;
    const acHintIsBool = typeof hints?.ac === 'boolean';
    const acMatched = acHintIsBool && typeof row.ac === 'boolean' && hints.ac === row.ac;
    if (acMatched || ctx.acUnique)
        s += 0.25;
    const dispMatched = hintDisp != null && rowDisp != null && Math.abs(rowDisp - hintDisp) <= 0.1;
    if (dispMatched || ctx.displacementUnique)
        s += 0.25;
    if (row.engine_code)
        s += 0.10;
    // final clamp
    const clamped = Math.min(Math.max(s, 0.50), 0.99);
    return clamped;
}
function inferDisambiguation(rows, hints) {
    const ask = [];
    // Применяем текущие hints для получения candidate set
    const filtered = rows.filter(r => {
        if (hints?.fuel && r.fuel && r.fuel !== hints.fuel)
            return false;
        if (typeof hints?.ac === 'boolean' && typeof r.ac === 'boolean' && r.ac !== hints.ac)
            return false;
        const hintDisp = toNumberOrNull(hints?.displacement_l);
        const rowDisp = toNumberOrNull(r.displacement_l);
        if (hintDisp != null && rowDisp != null && Math.abs(rowDisp - hintDisp) > 0.1)
            return false;
        return true;
    });
    const fuels = new Set(filtered.map(r => r.fuel).filter(Boolean));
    const acs = new Set(filtered.map(r => String(r.ac)).filter(v => v !== 'null'));
    // Пошаговая дизамбигуация: один вопрос за раз по приоритету
    // 1) fuel, 2) ac, 3) displacement_l (только если влияет на результат)
    if (!hints?.fuel && fuels.size > 1) {
        ask.push({ field: 'fuel', options: ['nafta', 'diesel'], reason: 'Hay variantes por combustible.' });
    }
    else if (hints?.fuel && !hints.ac && acs.size > 1) {
        ask.push({ field: 'ac', options: [true, false], reason: 'Hay variantes por tipo de media de cabina.' });
    }
    else if (!hints?.displacement_l && doesDisplacementAffectResult(filtered)) {
        const dispValues = [];
        for (const r of filtered) {
            const n = toNumberOrNull(r.displacement_l);
            if (n != null)
                dispValues.push(n);
        }
        const roundedUnique = new Set(Array.from(new Set(dispValues))
            .map(x => Math.round(x * 10) / 10)
            .filter(x => Number.isFinite(x)));
        const opts = Array.from(roundedUnique).sort((a, b) => a - b);
        ask.push({ field: 'displacement_l', options: opts, reason: 'Hay variantes por cilindrada.' });
    }
    return ask;
}
function doesDisplacementAffectResult(rows) {
    // Группируем записи по (filter_type, brand_src, part_number)
    const groups = new Map();
    for (const r of rows) {
        const disp = toNumberOrNull(r.displacement_l);
        if (disp == null)
            continue; // Исключаем NULL значения
        const key = `${r.filter_type}::${r.brand_src}::${r.part_number}`;
        if (!groups.has(key)) {
            groups.set(key, new Set());
        }
        groups.get(key).add(Math.round(disp * 10) / 10); // Округляем до 0.1
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
export async function lookup(input) {
    const { make, model, year } = input;
    const hints = input.hints ?? {};
    if (!make || !model || !year) {
        throw Object.assign(new Error('Missing fields'), { status: 400 });
    }
    if (!pool) {
        throw Object.assign(new Error('Database not available'), { status: 503 });
    }
    const result = await pool.query(`
    SELECT make, model, year_from, year_to, engine_code, fuel, displacement_l, power_hp, body, ac,
           filter_type, brand_src, part_number, catalog_year, page
    FROM catalog_hit
    WHERE LOWER(make) = LOWER($1)
      AND LOWER(model) = LOWER($2)
      AND $3 BETWEEN year_from AND year_to
    `, [make, model, year]);
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
        if (hints.fuel && r.fuel && r.fuel !== hints.fuel)
            return false;
        if (typeof hints.ac === 'boolean' && typeof r.ac === 'boolean' && r.ac !== hints.ac)
            return false;
        const hintDisp = toNumberOrNull(hints.displacement_l);
        const rowDisp = toNumberOrNull(r.displacement_l);
        if (hintDisp != null && rowDisp != null && Math.abs(rowDisp - hintDisp) > 0.1)
            return false;
        return true;
    });
    const working = filtered.length > 0 ? filtered : rows;
    // uniqueness context for scoring
    const fuelSet = new Set(working.map(r => r.fuel).filter(Boolean));
    const acSet = new Set(working.map(r => String(r.ac)).filter(v => v !== 'null'));
    const dispSet = new Set(working
        .map(r => toNumberOrNull(r.displacement_l))
        .filter((v) => v != null)
        .map(v => Math.round(v * 10) / 10));
    const ctx = {
        fuelUnique: fuelSet.size === 1,
        acUnique: acSet.size === 1,
        displacementUnique: dispSet.size === 1,
    };
    const byType = new Map();
    for (const ft of ['oil', 'air', 'cabin', 'fuel'])
        byType.set(ft, new Map());
    for (const r of working) {
        const conf = score(r, hints, ctx);
        const key = `${r.brand_src}::${r.part_number}`;
        const bucket = byType.get(r.filter_type);
        if (!bucket.has(key)) {
            bucket.set(key, {
                brand: r.brand_src,
                part_number: r.part_number,
                filter_type: r.filter_type,
                confidence: conf,
                sources: [{ catalog: `${r.brand_src} ${r.catalog_year}`, page: r.page }]
            });
        }
        else {
            const ph = bucket.get(key);
            ph.confidence = Math.max(ph.confidence, conf);
            const tag = `${r.brand_src} ${r.catalog_year}`;
            if (!ph.sources.find(s => s.catalog === tag && s.page === r.page)) {
                ph.sources.push({ catalog: tag, page: r.page });
            }
        }
    }
    const results = {
        oil: [],
        air: [],
        cabin: [],
        fuel: []
    };
    for (const ft of ['oil', 'air', 'cabin', 'fuel']) {
        const list = Array.from(byType.get(ft).values()).sort((a, b) => b.confidence - a.confidence);
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
                        ask[0]?.field === 'ac' ? '¿Filtro de cabina: estándar (CU) o carbón activo/bio (CUK/FP)?' :
                            'Decime la cilindrada (ej: 1.6).',
                    'ru': ask[0]?.field === 'fuel' ? 'Nafta или diesel?' :
                        ask[0]?.field === 'ac' ? 'Салонный фильтр: стандарт (CU) или уголь/био (CUK/FP)?' :
                            'Уточни объем двигателя (например, 1.6).'
                }
            }
            : { needed: false, ask: [] },
        notices: ['Resultados basados en catálogos importados. Verificá combustible/tipo de media si hay duda.']
    };
}
