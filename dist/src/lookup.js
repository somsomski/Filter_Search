import { pool } from './db.js';
const FILTERS = ['oil', 'air', 'cabin', 'fuel'];
// Приоритеты полей для дизамбигурации (чем меньше число, тем выше приоритет)
// При прочих равных выбирается поле с более высоким приоритетом
const FIELD_PRIORITY = {
    'fuel': 1,
    'generation': 2,
    'series_suffix': 3,
    'displacement_l': 4,
    'platform': 5,
    'power_hp': 6,
    'engine_code': 7,
    'engine_series': 8,
    'body': 9,
    'ac': 10
};
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
function score(row, hints, ctx, engineSeriesGroups) {
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
    // Сравниваем engine_series с учетом эквивалентности
    let engineSeriesMatched = false;
    if (hints?.engine_series && row.engine_series) {
        if (hints.engine_series === row.engine_series) {
            engineSeriesMatched = true;
        }
        else if (engineSeriesGroups) {
            // Проверяем эквивалентность через канонические значения
            const rowCanonical = getCanonicalEngineSeries(row.engine_series, engineSeriesGroups);
            const hintCanonical = getCanonicalEngineSeries(hints.engine_series, engineSeriesGroups);
            if (rowCanonical && hintCanonical && rowCanonical === hintCanonical) {
                engineSeriesMatched = true;
            }
            else if (areEngineSeriesEquivalent(hints.engine_series, row.engine_series)) {
                engineSeriesMatched = true;
            }
        }
    }
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
/**
 * Вычисляет эффективность поля для дизамбигурации
 * Возвращает максимальное количество записей, которое останется после выбора любого значения
 * Чем меньше это число, тем эффективнее поле для дизамбигурации
 */
/**
 * Извлекает series_suffix из engine_series
 * Если engine_series содержит "|", берем части после "|"
 * Иначе пытаемся извлечь суффикс (последний токен или числовую часть)
 */
function extractSeriesSuffix(engineSeries) {
    if (!engineSeries)
        return [];
    // Если есть разделитель "|", берем все части после первой
    if (engineSeries.includes('|')) {
        const parts = engineSeries.split('|').map(s => s.trim()).filter(s => s.length > 0);
        return parts.slice(1); // Пропускаем первую часть
    }
    // Иначе пытаемся извлечь суффикс (последний токен)
    const tokens = engineSeries.split(/[\s\-_\/]+/).filter(t => t.length > 0);
    if (tokens.length > 1) {
        return [tokens[tokens.length - 1]]; // Последний токен как суффикс
    }
    return [];
}
function calculateFieldEfficiency(rows, field, engineSeriesGroups) {
    const valueCounts = new Map();
    for (const r of rows) {
        let value = null;
        if (field === 'fuel') {
            value = r.fuel;
        }
        else if (field === 'ac') {
            value = r.ac;
        }
        else if (field === 'displacement_l') {
            const disp = toNumberOrNull(r.displacement_l);
            value = disp != null ? Math.round(disp * 10) / 10 : null;
        }
        else if (field === 'engine_series') {
            if (r.engine_series) {
                // Разбиваем на варианты по "|"
                const variants = splitEngineSeriesVariants(r.engine_series);
                for (const variant of variants) {
                    // Используем каноническое значение если есть
                    const canonical = engineSeriesGroups ? getCanonicalEngineSeries(variant, engineSeriesGroups) : variant;
                    value = canonical || variant;
                    const key = String(value);
                    valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
                }
                continue; // Уже обработали варианты
            }
        }
        else if (field === 'engine_code') {
            value = r.engine_code;
        }
        else if (field === 'body') {
            value = r.body;
        }
        else if (field === 'power_hp') {
            value = r.power_hp;
        }
        else if (field === 'generation') {
            value = r.generation;
        }
        else if (field === 'series_suffix') {
            // Используем поле series_suffix из БД, если оно есть
            // Иначе извлекаем из engine_series
            if (r.series_suffix) {
                value = r.series_suffix;
            }
            else if (r.engine_series) {
                const suffixes = extractSeriesSuffix(r.engine_series);
                for (const suffix of suffixes) {
                    valueCounts.set(suffix, (valueCounts.get(suffix) || 0) + 1);
                }
                continue; // Уже обработали суффиксы
            }
        }
        else if (field === 'platform') {
            value = r.platform;
        }
        if (value != null) {
            const key = String(value);
            valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
        }
    }
    // Проверяем, влияет ли поле на результат (есть ли разные значения для одного фильтра)
    let affectsResult = false;
    if (valueCounts.size > 1) {
        const groupsByPart = new Map();
        for (const r of rows) {
            const key = `${r.filter_type}::${r.brand_src}::${r.part_number}`;
            if (!groupsByPart.has(key)) {
                groupsByPart.set(key, new Set());
            }
            let value = null;
            if (field === 'fuel') {
                value = r.fuel;
            }
            else if (field === 'ac') {
                value = r.ac;
            }
            else if (field === 'displacement_l') {
                const disp = toNumberOrNull(r.displacement_l);
                value = disp != null ? Math.round(disp * 10) / 10 : null;
            }
            else if (field === 'engine_series') {
                if (r.engine_series) {
                    const variants = splitEngineSeriesVariants(r.engine_series);
                    for (const variant of variants) {
                        const canonical = engineSeriesGroups ? getCanonicalEngineSeries(variant, engineSeriesGroups) : variant;
                        value = canonical || variant;
                        groupsByPart.get(key).add(value);
                    }
                    continue;
                }
            }
            else if (field === 'engine_code') {
                value = r.engine_code;
            }
            else if (field === 'body') {
                value = r.body;
            }
            else if (field === 'power_hp') {
                value = r.power_hp;
            }
            else if (field === 'generation') {
                value = r.generation;
            }
            else if (field === 'series_suffix') {
                if (r.series_suffix) {
                    value = r.series_suffix;
                }
                else if (r.engine_series) {
                    const suffixes = extractSeriesSuffix(r.engine_series);
                    for (const suffix of suffixes) {
                        groupsByPart.get(key).add(suffix);
                    }
                    continue;
                }
            }
            else if (field === 'platform') {
                value = r.platform;
            }
            if (value != null) {
                groupsByPart.get(key).add(value);
            }
        }
        // Проверяем, есть ли группы с разными значениями
        for (const values of groupsByPart.values()) {
            if (values.size > 1) {
                affectsResult = true;
                break;
            }
        }
    }
    // Максимальное количество записей, которое останется после выбора любого значения
    const maxRemaining = valueCounts.size > 0 ? Math.max(...Array.from(valueCounts.values())) : rows.length;
    // Фильтруем null, undefined и пустые строки, затем сортируем
    const options = Array.from(valueCounts.keys())
        .filter(v => v != null && v !== '' && v !== 'null' && v !== 'undefined')
        .sort((a, b) => {
        if (typeof a === 'number' && typeof b === 'number')
            return a - b;
        return String(a).localeCompare(String(b));
    });
    return { maxRemaining, options, affectsResult };
}
function inferDisambiguation(rows, hints, engineSeriesGroups) {
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
        // Сравниваем engine_series с учетом эквивалентности и вариантов через "|"
        if (hints?.engine_series && r.engine_series) {
            const variants = splitEngineSeriesVariants(r.engine_series);
            let matched = false;
            for (const variant of variants) {
                if (hints.engine_series === variant) {
                    matched = true;
                    break;
                }
                else if (engineSeriesGroups) {
                    const rowCanonical = getCanonicalEngineSeries(variant, engineSeriesGroups);
                    const hintCanonical = getCanonicalEngineSeries(hints.engine_series, engineSeriesGroups);
                    if (rowCanonical && hintCanonical && rowCanonical === hintCanonical) {
                        matched = true;
                        break;
                    }
                    else if (areEngineSeriesEquivalent(hints.engine_series, variant)) {
                        matched = true;
                        break;
                    }
                }
            }
            if (!matched)
                return false;
        }
        // Проверяем другие поля
        if (hints?.engine_code && r.engine_code && r.engine_code !== hints.engine_code)
            return false;
        if (hints?.body && r.body && r.body !== hints.body)
            return false;
        if (hints?.power_hp != null && r.power_hp != null && r.power_hp !== hints.power_hp)
            return false;
        // Проверяем series_suffix (используем поле из БД или извлекаем из engine_series)
        if (hints?.series_suffix) {
            if (r.series_suffix && r.series_suffix !== hints.series_suffix)
                return false;
            if (!r.series_suffix && r.engine_series) {
                const suffixes = extractSeriesSuffix(r.engine_series);
                if (suffixes.length > 0 && !suffixes.includes(hints.series_suffix))
                    return false;
            }
        }
        // Проверяем generation и platform
        if (hints?.generation && r.generation && r.generation !== hints.generation)
            return false;
        if (hints?.platform && r.platform && r.platform !== hints.platform)
            return false;
        return true;
    });
    // Если нет записей после фильтрации, используем все записи
    const working = filtered.length > 0 ? filtered : rows;
    // Вычисляем эффективность каждого поля для дизамбигурации
    const candidates = [];
    // Группируем эквивалентные engine_series для анализа
    const localEngineSeriesGroups = engineSeriesGroups || groupEquivalentEngineSeries(working);
    if (!hints?.fuel) {
        const eff = calculateFieldEfficiency(working, 'fuel', localEngineSeriesGroups);
        if (eff.affectsResult && eff.options.length > 1) {
            candidates.push({ field: 'fuel', efficiency: eff });
        }
    }
    if (!hints?.generation) {
        const eff = calculateFieldEfficiency(working, 'generation', localEngineSeriesGroups);
        if (eff.affectsResult && eff.options.length > 1) {
            candidates.push({ field: 'generation', efficiency: eff });
        }
    }
    if (!hints?.series_suffix) {
        const eff = calculateFieldEfficiency(working, 'series_suffix', localEngineSeriesGroups);
        if (eff.affectsResult && eff.options.length > 1) {
            candidates.push({ field: 'series_suffix', efficiency: eff });
        }
    }
    if (!hints?.displacement_l) {
        const eff = calculateFieldEfficiency(working, 'displacement_l', localEngineSeriesGroups);
        if (eff.affectsResult && eff.options.length > 1) {
            candidates.push({ field: 'displacement_l', efficiency: eff });
        }
    }
    if (!hints?.platform) {
        const eff = calculateFieldEfficiency(working, 'platform', localEngineSeriesGroups);
        if (eff.affectsResult && eff.options.length > 1) {
            candidates.push({ field: 'platform', efficiency: eff });
        }
    }
    if (typeof hints?.ac !== 'boolean') {
        const eff = calculateFieldEfficiency(working, 'ac', localEngineSeriesGroups);
        if (eff.affectsResult && eff.options.length > 1) {
            candidates.push({ field: 'ac', efficiency: eff });
        }
    }
    if (!hints?.engine_series) {
        const eff = calculateFieldEfficiency(working, 'engine_series', localEngineSeriesGroups);
        if (eff.affectsResult && eff.options.length > 1) {
            candidates.push({ field: 'engine_series', efficiency: eff });
        }
    }
    // Проверяем другие поля (только если они еще не указаны в hints)
    if (!hints?.engine_code) {
        const effEngineCode = calculateFieldEfficiency(working, 'engine_code', localEngineSeriesGroups);
        if (effEngineCode.affectsResult && effEngineCode.options.length > 1) {
            candidates.push({ field: 'engine_code', efficiency: effEngineCode });
        }
    }
    if (!hints?.body) {
        const effBody = calculateFieldEfficiency(working, 'body', localEngineSeriesGroups);
        if (effBody.affectsResult && effBody.options.length > 1) {
            candidates.push({ field: 'body', efficiency: effBody });
        }
    }
    if (hints?.power_hp == null) {
        const effPowerHp = calculateFieldEfficiency(working, 'power_hp', localEngineSeriesGroups);
        if (effPowerHp.affectsResult && effPowerHp.options.length > 1) {
            candidates.push({ field: 'power_hp', efficiency: effPowerHp });
        }
    }
    // Выбираем поле с наименьшим maxRemaining (быстрее всего приведет к однозначному результату)
    // При одинаковом maxRemaining выбираем поле с более высоким приоритетом
    if (candidates.length > 0) {
        candidates.sort((a, b) => {
            // Сначала по maxRemaining
            if (a.efficiency.maxRemaining !== b.efficiency.maxRemaining) {
                return a.efficiency.maxRemaining - b.efficiency.maxRemaining;
            }
            // При одинаковом maxRemaining - по приоритету
            const priorityA = FIELD_PRIORITY[a.field] || 999;
            const priorityB = FIELD_PRIORITY[b.field] || 999;
            return priorityA - priorityB;
        });
        const best = candidates[0];
        // Проверяем, что опции не пустые
        if (best.efficiency.options.length === 0) {
            return ask; // Не добавляем вопрос без опций
        }
        let reason = '';
        if (best.field === 'fuel') {
            reason = 'Hay variantes por combustible.';
        }
        else if (best.field === 'generation') {
            reason = 'Hay variantes por generación.';
        }
        else if (best.field === 'series_suffix') {
            reason = 'Hay variantes por sufijo de serie.';
        }
        else if (best.field === 'displacement_l') {
            reason = 'Hay variantes por cilindrada.';
        }
        else if (best.field === 'platform') {
            reason = 'Hay variantes por plataforma.';
        }
        else if (best.field === 'power_hp') {
            reason = 'Hay variantes por potencia.';
        }
        else if (best.field === 'engine_code') {
            reason = 'Hay variantes por código de motor.';
        }
        else if (best.field === 'engine_series') {
            reason = 'Hay variantes por serie de motor.';
        }
        else if (best.field === 'body') {
            reason = 'Hay variantes por tipo de carrocería.';
        }
        else if (best.field === 'ac') {
            reason = 'Hay variantes por tipo de media de cabina.';
        }
        ask.push({
            field: best.field,
            options: best.efficiency.options,
            reason
        });
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
/**
 * Разбивает engine_series на варианты по разделителю "|"
 * Примеры:
 * - "A|B" -> ["A", "B"]
 * - "TBI 16V" -> ["TBI 16V"]
 */
function splitEngineSeriesVariants(engineSeries) {
    if (!engineSeries)
        return [];
    return engineSeries.split('|').map(s => s.trim()).filter(s => s.length > 0);
}
/**
 * Токенизирует engine_series, извлекая ключевые токены
 * Примеры:
 * - "16V K4M-706" -> ["16V", "K4M", "706"]
 * - "K4M" -> ["K4M"]
 * - "TBI 16V" -> ["TBI", "16V"]
 */
function tokenizeEngineSeries(engineSeries) {
    if (!engineSeries)
        return [];
    // Разбиваем по пробелам, дефисам и другим разделителям
    const tokens = engineSeries
        .toUpperCase()
        .split(/[\s\-_\/]+/)
        .filter(t => t.length > 0);
    return tokens;
}
/**
 * Определяет, относятся ли два engine_series к одному двигателю
 * Сравнивает по ключевым токенам
 * Учитывает варианты через разделитель "|"
 */
function areEngineSeriesEquivalent(series1, series2) {
    if (!series1 || !series2)
        return false;
    if (series1 === series2)
        return true;
    // Разбиваем на варианты по "|"
    const variants1 = splitEngineSeriesVariants(series1);
    const variants2 = splitEngineSeriesVariants(series2);
    // Проверяем, есть ли пересечение вариантов
    for (const v1 of variants1) {
        for (const v2 of variants2) {
            if (v1 === v2)
                return true;
            // Проверяем эквивалентность через токены
            const tokens1 = new Set(tokenizeEngineSeries(v1));
            const tokens2 = new Set(tokenizeEngineSeries(v2));
            // Если один набор токенов полностью содержится в другом - это один двигатель
            // Например: ["K4M"] содержится в ["16V", "K4M", "706"]
            if (tokens1.size === 0 || tokens2.size === 0)
                return false;
            // Проверяем пересечение токенов
            const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
            // Если есть общие токены и один из наборов полностью содержится в другом
            if (intersection.size > 0) {
                // Если все токены одного набора есть в другом - это один двигатель
                const allTokens1In2 = [...tokens1].every(t => tokens2.has(t));
                const allTokens2In1 = [...tokens2].every(t => tokens1.has(t));
                if (allTokens1In2 || allTokens2In1) {
                    return true;
                }
                // Разделяем токены на буквенные (идентификаторы) и числовые (суффиксы)
                const isNumeric = (s) => /^\d+$/.test(s);
                const alphaTokens1 = [...tokens1].filter(t => !isNumeric(t) && t.length >= 2);
                const alphaTokens2 = [...tokens2].filter(t => !isNumeric(t) && t.length >= 2);
                const numericTokens1 = [...tokens1].filter(isNumeric);
                const numericTokens2 = [...tokens2].filter(isNumeric);
                // Если все буквенные токены совпадают - проверяем числовые
                // Например: "K4M" и "16V K4M-706" - эквивалентны (все буквенные токены "K4M" есть в обоих, числовые не важны)
                // Но "K4M-706" и "K4M-707" - НЕ эквивалентны (разные числовые суффиксы)
                if (alphaTokens1.length > 0 && alphaTokens2.length > 0) {
                    const alphaSet1 = new Set(alphaTokens1);
                    const alphaSet2 = new Set(alphaTokens2);
                    // Если все буквенные токены одного набора есть в другом
                    const allAlpha1In2 = alphaTokens1.every(t => alphaSet2.has(t));
                    const allAlpha2In1 = alphaTokens2.every(t => alphaSet1.has(t));
                    if (allAlpha1In2 || allAlpha2In1) {
                        // Если у обоих есть числовые токены - они должны совпадать
                        // Если у одного есть числовые, а у другого нет - это нормально (один более детальный)
                        if (numericTokens1.length > 0 && numericTokens2.length > 0) {
                            // Оба имеют числовые токены - они должны совпадать
                            const numericSet1 = new Set(numericTokens1);
                            const numericSet2 = new Set(numericTokens2);
                            const allNumeric1In2 = numericTokens1.every(t => numericSet2.has(t));
                            const allNumeric2In1 = numericTokens2.every(t => numericSet1.has(t));
                            if (allNumeric1In2 || allNumeric2In1) {
                                return true;
                            }
                            // Если числовые токены не совпадают - это разные двигатели
                            // Продолжаем проверку других вариантов
                        }
                        else {
                            // У одного есть числовые, у другого нет - это один двигатель (один более детальный)
                            return true;
                        }
                    }
                }
            }
        }
    }
    return false;
}
/**
 * Группирует похожие engine_series из разных каталогов
 * Возвращает Map: канонический engine_series -> список всех эквивалентных
 */
function groupEquivalentEngineSeries(rows) {
    const groups = new Map();
    const processed = new Set();
    // Собираем все уникальные engine_series (включая варианты через "|")
    const allSeries = new Set();
    for (const r of rows) {
        if (r.engine_series) {
            const variants = splitEngineSeriesVariants(r.engine_series);
            for (const variant of variants) {
                allSeries.add(variant);
            }
        }
    }
    // Группируем эквивалентные
    for (const series of allSeries) {
        if (processed.has(series))
            continue;
        const equivalent = [series];
        processed.add(series);
        // Ищем все эквивалентные
        for (const otherSeries of allSeries) {
            if (processed.has(otherSeries))
                continue;
            if (areEngineSeriesEquivalent(series, otherSeries)) {
                equivalent.push(otherSeries);
                processed.add(otherSeries);
            }
        }
        // Выбираем наиболее краткую запись как каноническую
        const canonical = equivalent.reduce((shortest, current) => current.length < shortest.length ? current : shortest);
        groups.set(canonical, equivalent);
    }
    return groups;
}
/**
 * Получает канонический engine_series для данного значения
 */
function getCanonicalEngineSeries(engineSeries, groups) {
    if (!engineSeries)
        return null;
    for (const [canonical, equivalents] of groups) {
        if (equivalents.includes(engineSeries)) {
            return canonical;
        }
    }
    return engineSeries;
}
function doesEngineSeriesAffectResult(rows) {
    // Группируем записи по (filter_type, brand_src, part_number)
    const groups = new Map();
    // Группируем эквивалентные engine_series
    const engineSeriesGroups = groupEquivalentEngineSeries(rows);
    for (const r of rows) {
        if (!r.engine_series)
            continue; // Исключаем NULL значения
        // Разбиваем на варианты по "|" и обрабатываем каждый
        const variants = splitEngineSeriesVariants(r.engine_series);
        for (const variant of variants) {
            // Используем канонический engine_series
            const canonical = getCanonicalEngineSeries(variant, engineSeriesGroups);
            if (!canonical)
                continue;
            const key = `${r.filter_type}::${r.brand_src}::${r.part_number}`;
            if (!groups.has(key)) {
                groups.set(key, new Set());
            }
            groups.get(key).add(canonical);
        }
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
           engine_series, engine_desc_raw, generation, platform, series_suffix,
           filter_type, brand_src, part_number, catalog_year, page, notes
    FROM catalog_hit
    WHERE LOWER(make) = LOWER($1)
      AND LOWER(model) = LOWER($2)
      AND (
        year_from IS NULL
        OR ($3 >= year_from AND (year_to IS NULL OR $3 <= year_to))
      )
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
    // Группируем эквивалентные engine_series один раз для всех операций
    const engineSeriesGroups = groupEquivalentEngineSeries(rows);
    const ask = inferDisambiguation(rows, hints, engineSeriesGroups);
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
        // Сравниваем engine_series с учетом эквивалентности и вариантов через "|"
        if (hints.engine_series && r.engine_series) {
            const variants = splitEngineSeriesVariants(r.engine_series);
            let matched = false;
            for (const variant of variants) {
                if (hints.engine_series === variant) {
                    matched = true;
                    break;
                }
                else {
                    const rowCanonical = getCanonicalEngineSeries(variant, engineSeriesGroups);
                    const hintCanonical = getCanonicalEngineSeries(hints.engine_series, engineSeriesGroups);
                    if (rowCanonical && hintCanonical && rowCanonical === hintCanonical) {
                        matched = true;
                        break;
                    }
                    else if (areEngineSeriesEquivalent(hints.engine_series, variant)) {
                        matched = true;
                        break;
                    }
                }
            }
            if (!matched)
                return false;
        }
        // Проверяем другие поля
        if (hints.engine_code && r.engine_code && r.engine_code !== hints.engine_code)
            return false;
        if (hints.body && r.body && r.body !== hints.body)
            return false;
        if (hints.power_hp != null && r.power_hp != null && r.power_hp !== hints.power_hp)
            return false;
        // Проверяем series_suffix (используем поле из БД или извлекаем из engine_series)
        if (hints.series_suffix) {
            if (r.series_suffix && r.series_suffix !== hints.series_suffix)
                return false;
            if (!r.series_suffix && r.engine_series) {
                const suffixes = extractSeriesSuffix(r.engine_series);
                if (suffixes.length > 0 && !suffixes.includes(hints.series_suffix))
                    return false;
            }
        }
        // Проверяем generation и platform
        if (hints.generation && r.generation && r.generation !== hints.generation)
            return false;
        if (hints.platform && r.platform && r.platform !== hints.platform)
            return false;
        return true;
    });
    const working = filtered.length > 0 ? filtered : rows;
    // uniqueness context for scoring (используем канонические значения)
    const fuelSet = new Set(working.map(r => r.fuel).filter(Boolean));
    const acSet = new Set(working.map(r => String(r.ac)).filter(v => v !== 'null'));
    const dispSet = new Set(working
        .map(r => toNumberOrNull(r.displacement_l))
        .filter((v) => v != null)
        .map(v => Math.round(v * 10) / 10));
    const engineSeriesSet = new Set(working
        .map(r => r.engine_series ? getCanonicalEngineSeries(r.engine_series, engineSeriesGroups) : null)
        .filter((v) => v != null));
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
        const conf = score(r, hints, ctx, engineSeriesGroups);
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
                        ask[0]?.field === 'generation' ? '¿Generación?' :
                            ask[0]?.field === 'series_suffix' ? '¿Sufijo de serie?' :
                                ask[0]?.field === 'displacement_l' ? 'Decime la cilindrada (ej: 1.6).' :
                                    ask[0]?.field === 'platform' ? '¿Plataforma?' :
                                        ask[0]?.field === 'power_hp' ? '¿Potencia (HP)?' :
                                            ask[0]?.field === 'engine_code' ? '¿Código del motor?' :
                                                ask[0]?.field === 'engine_series' ? '¿Serie del motor? (ej.: TBI 16V)' :
                                                    ask[0]?.field === 'body' ? '¿Tipo de carrocería?' :
                                                        ask[0]?.field === 'ac' ? '¿Filtro de cabina: estándar (CU) o carbón activo/bio (CUK/FP)?' :
                                                            'Falta un dato',
                    'ru': ask[0]?.field === 'fuel' ? 'Nafta или diesel?' :
                        ask[0]?.field === 'generation' ? 'Поколение?' :
                            ask[0]?.field === 'series_suffix' ? 'Суффикс серии?' :
                                ask[0]?.field === 'displacement_l' ? 'Уточни объем двигателя (например, 1.6).' :
                                    ask[0]?.field === 'platform' ? 'Платформа?' :
                                        ask[0]?.field === 'power_hp' ? 'Мощность (л.с.)?' :
                                            ask[0]?.field === 'engine_code' ? 'Код двигателя?' :
                                                ask[0]?.field === 'engine_series' ? 'Серия двигателя? (например, TBI 16V)' :
                                                    ask[0]?.field === 'body' ? 'Тип кузова?' :
                                                        ask[0]?.field === 'ac' ? 'Салонный фильтр: стандарт (CU) или уголь/био (CUK/FP)?' :
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
