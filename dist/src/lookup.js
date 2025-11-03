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
function parseNotes(notes) {
    if (!notes)
        return {};
    const result = {};
    // Парсим формат: date=2008-11..;comment="C/C. Activado";xref=MANN:CUK4436
    const parts = notes.split(';');
    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed)
            continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1)
            continue;
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();
        // Убираем кавычки если есть
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (key === 'comment') {
            result.comment = value;
        }
        else if (key === 'date') {
            result.date = value;
        }
        else if (key === 'xref') {
            result.xref = value;
        }
    }
    return result;
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
    const engineSeriesMatched = !!(hints?.engine_series && row.engine_series && hints.engine_series === row.engine_series);
    // Если engine_series не уникален и не указан в hints, не даем полные баллы
    if (engineSeriesMatched) {
        s += 0.20;
    }
    else if (ctx.engineSeriesUnique && !row.engine_series) {
        // Если engine_series уникален для всех записей и у этой записи его нет - это нормально
        s += 0.20;
    }
    else if (ctx.engineSeriesUnique && row.engine_series) {
        // Если engine_series уникален и у записи он есть
        s += 0.20;
    }
    // Если engine_series НЕ уникален и не указан в hints - не добавляем баллы
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
        if (hints?.engine_series && r.engine_series && r.engine_series !== hints.engine_series)
            return false;
        return true;
    });
    const fuels = new Set(filtered.map(r => r.fuel).filter(Boolean));
    const acs = new Set(filtered.map(r => String(r.ac)).filter(v => v !== 'null'));
    const engineSeries = new Set(filtered.map(r => r.engine_series).filter(Boolean));
    // Пошаговая дизамбигуация: один вопрос за раз по приоритету
    // 1) fuel, 2) ac, 3) displacement_l, 4) engine_series
    if (!hints?.fuel && fuels.size > 1) {
        ask.push({ field: 'fuel', options: ['nafta', 'diesel'], reason: 'Hay variantes por combustible.' });
    }
    else if ((hints?.fuel || fuels.size <= 1) && !hints?.ac && acs.size > 1) {
        ask.push({ field: 'ac', options: [true, false], reason: 'Hay variantes por tipo de media de cabina.' });
    }
    else if ((hints?.fuel || fuels.size <= 1) && (hints?.ac !== undefined || acs.size <= 1) && !hints?.displacement_l && doesDisplacementAffectResult(filtered)) {
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
    else if ((hints?.fuel || fuels.size <= 1) && (hints?.ac !== undefined || acs.size <= 1) && (hints?.displacement_l || !doesDisplacementAffectResult(filtered)) && !hints?.engine_series && engineSeries.size > 1 && doesEngineSeriesAffectResult(filtered)) {
        const opts = Array.from(engineSeries).sort();
        ask.push({ field: 'engine_series', options: opts, reason: 'Hay variantes por serie de motor.' });
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
function doesEngineSeriesAffectResult(rows) {
    // Группируем записи по (filter_type, brand_src, part_number)
    const groups = new Map();
    for (const r of rows) {
        if (!r.engine_series)
            continue; // Исключаем NULL значения
        const key = `${r.filter_type}::${r.brand_src}::${r.part_number}`;
        if (!groups.has(key)) {
            groups.set(key, new Set());
        }
        groups.get(key).add(r.engine_series);
    }
    // Проверяем, есть ли группы с разными значениями engine_series
    // Это означает, что engine_series влияет на результат
    for (const [key, engineSeries] of groups) {
        if (engineSeries.size > 1) {
            return true; // engine_series влияет на результат
        }
    }
    return false; // engine_series не влияет на результат
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
           engine_series, engine_desc_raw, filter_type, brand_src, part_number, catalog_year, page, notes
    FROM catalog_hit
    WHERE LOWER(make) = LOWER($1)
      AND LOWER(model) = LOWER($2)
      AND $3 >= year_from
      AND (year_to IS NULL OR $3 <= year_to)
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
        if (hints.engine_series && r.engine_series && r.engine_series !== hints.engine_series)
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
    const engineSeriesSet = new Set(working.map(r => r.engine_series).filter(Boolean));
    const ctx = {
        fuelUnique: fuelSet.size === 1,
        acUnique: acSet.size === 1,
        displacementUnique: dispSet.size === 1,
        engineSeriesUnique: engineSeriesSet.size === 1,
    };
    const byType = new Map();
    const notesByType = new Map();
    for (const ft of ['oil', 'air', 'cabin', 'fuel']) {
        byType.set(ft, new Map());
        notesByType.set(ft, new Map());
    }
    // Собираем все notes для каждого фильтра
    for (const r of working) {
        const key = `${r.brand_src}::${r.part_number}`;
        const bucket = notesByType.get(r.filter_type);
        if (!bucket.has(key)) {
            bucket.set(key, []);
        }
        const parsed = parseNotes(r.notes);
        if (parsed.comment || parsed.date || parsed.xref) {
            bucket.get(key).push(parsed);
        }
    }
    // Обрабатываем записи и добавляем notes
    for (const r of working) {
        const conf = score(r, hints, ctx);
        const key = `${r.brand_src}::${r.part_number}`;
        const bucket = byType.get(r.filter_type);
        const notesList = notesByType.get(r.filter_type).get(key) || [];
        if (!bucket.has(key)) {
            const parsed = parseNotes(r.notes);
            const partHit = {
                brand: r.brand_src,
                part_number: r.part_number,
                filter_type: r.filter_type,
                confidence: conf,
                sources: [{ catalog: `${r.brand_src} ${r.catalog_year}`, page: r.page }]
            };
            // Всегда добавляем comment если есть
            if (parsed.comment) {
                partHit.comment = parsed.comment;
            }
            // xref в тестовом режиме
            if (parsed.xref) {
                partHit.xref = parsed.xref;
            }
            bucket.set(key, partHit);
        }
        else {
            const ph = bucket.get(key);
            ph.confidence = Math.max(ph.confidence, conf);
            const tag = `${r.brand_src} ${r.catalog_year}`;
            if (!ph.sources.find(s => s.catalog === tag && s.page === r.page)) {
                ph.sources.push({ catalog: tag, page: r.page });
            }
            // Обновляем comment если есть новый
            const parsed = parseNotes(r.notes);
            if (parsed.comment && !ph.comment) {
                ph.comment = parsed.comment;
            }
            // Обновляем xref если есть новый
            if (parsed.xref && !ph.xref) {
                ph.xref = parsed.xref;
            }
        }
    }
    // Проверяем различия в date и добавляем date только если есть различия
    for (const ft of ['oil', 'air', 'cabin', 'fuel']) {
        const bucket = byType.get(ft);
        const notesBucket = notesByType.get(ft);
        // Собираем все уникальные dates для каждого типа фильтра
        const datesByKey = new Map();
        for (const [key, notesList] of notesBucket) {
            const dates = new Set();
            for (const note of notesList) {
                if (note.date) {
                    dates.add(note.date);
                }
            }
            if (dates.size > 0) {
                datesByKey.set(key, dates);
            }
        }
        // Проверяем, есть ли различия в date между фильтрами
        const allDates = new Set();
        for (const dates of datesByKey.values()) {
            for (const date of dates) {
                allDates.add(date);
            }
        }
        const hasDateDifferences = allDates.size > 1;
        // Если есть различия, добавляем date к каждому фильтру
        if (hasDateDifferences) {
            for (const [key, partHit] of bucket) {
                const notesList = notesBucket.get(key) || [];
                // Берем первый найденный date
                for (const note of notesList) {
                    if (note.date) {
                        partHit.date = note.date;
                        break;
                    }
                }
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
            // Повышаем confidence только если нет неопределенности
            if (!needAsk) {
                list[0].confidence = Math.max(list[0].confidence, 0.95);
            }
        }
        // Если есть вопрос дизамбигуации, снижаем confidence для всех результатов
        if (needAsk && ask.length > 0) {
            const askingField = ask[0].field;
            // Особенно снижаем confidence если спрашивается engine_series
            const penalty = askingField === 'engine_series' ? 0.15 : 0.10;
            for (const item of list) {
                item.confidence = Math.max(0.50, item.confidence - penalty);
            }
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
                            ask[0]?.field === 'displacement_l' ? 'Decime la cilindrada (ej: 1.6).' :
                                ask[0]?.field === 'engine_series' ? '¿Serie del motor? (ej.: TBI 16V)' :
                                    'Falta un dato',
                    'ru': ask[0]?.field === 'fuel' ? 'Nafta или diesel?' :
                        ask[0]?.field === 'ac' ? 'Салонный фильтр: стандарт (CU) или уголь/био (CUK/FP)?' :
                            ask[0]?.field === 'displacement_l' ? 'Уточни объем двигателя (например, 1.6).' :
                                ask[0]?.field === 'engine_series' ? 'Серия двигателя? (например, TBI 16V)' :
                                    'Нужен уточняющий пункт'
                }
            }
            : { needed: false, ask: [] },
        notices: ['Resultados basados en catálogos importados. Verificá combustible/tipo de media si hay duda.']
    };
}
/**
 * Получает список марок для автокомплита по частичному вводу марки
 */
export async function suggestMakes(makePrefix, limit = 100) {
    if (!pool) {
        throw Object.assign(new Error('Database not available'), { status: 503 });
    }
    const makePrefixLower = makePrefix.toLowerCase().trim();
    let query;
    let params;
    if (makePrefixLower.length === 0) {
        // Если префикс пустой, возвращаем все марки
        query = `
      SELECT DISTINCT make
      FROM catalog_hit
      ORDER BY make
      LIMIT $1
    `;
        params = [limit];
    }
    else {
        // Если есть префикс, ищем марки, начинающиеся с него
        query = `
      SELECT DISTINCT make
      FROM catalog_hit
      WHERE LOWER(make) LIKE LOWER($1) || '%'
      ORDER BY make
      LIMIT $2
    `;
        params = [makePrefix, limit];
    }
    const result = await pool.query(query, params);
    return result.rows.map(row => row.make);
}
/**
 * Получает список моделей для автокомплита по марке и частичному вводу модели
 * Без ограничения количества - возвращает все доступные модели
 */
export async function suggestModels(make, modelPrefix) {
    if (!make || !make.trim()) {
        return [];
    }
    if (!pool) {
        throw Object.assign(new Error('Database not available'), { status: 503 });
    }
    const modelPrefixLower = modelPrefix.toLowerCase().trim();
    let query;
    let params;
    if (modelPrefixLower.length === 0) {
        // Если префикс пустой, возвращаем все модели для данной марки
        query = `
      SELECT DISTINCT model
      FROM catalog_hit
      WHERE LOWER(make) = LOWER($1)
      ORDER BY model
    `;
        params = [make];
    }
    else {
        // Если есть префикс, ищем модели, начинающиеся с него
        query = `
      SELECT DISTINCT model
      FROM catalog_hit
      WHERE LOWER(make) = LOWER($1)
        AND LOWER(model) LIKE LOWER($2) || '%'
      ORDER BY model
    `;
        params = [make, modelPrefix];
    }
    const result = await pool.query(query, params);
    return result.rows.map(row => row.model);
}
