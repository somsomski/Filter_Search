export function toWhatsappText(o, lang = 'es-AR') {
    const t = (es, ru) => lang === 'es-AR' ? es : ru;
    const title = t(`🧰 Filtros para ${o.query.make} ${o.query.model} ${o.query.year}`, `Фильтры для ${o.query.make} ${o.query.model} ${o.query.year}`);
    const line = (labelEs, labelRu, arr) => {
        if (!arr || arr.length === 0)
            return null;
        const best = arr[0];
        const alt = arr.slice(1, 3).map((x) => `${x.brand} ${x.part_number}`).join(', ');
        const label = t(labelEs, labelRu);
        return alt
            ? `• ${label}: ${best.brand} ${best.part_number} (alt: ${alt})`
            : `• ${label}: ${best.brand} ${best.part_number}`;
    };
    const lines = [
        line('Aceite', 'Масляный', o.results.oil),
        line('Aire', 'Воздушный', o.results.air),
        line('Cabina', 'Салонный', o.results.cabin),
        line('Combustible', 'Топливный', o.results.fuel)
    ].filter(Boolean);
    const warn = o.disambiguation.needed
        ? t('⚠️ Falta un dato. ', '⚠️ Нужен один пункт. ') +
            (o.disambiguation.fallback_texts?.[lang] ?? '')
        : '';
    return [title, ...lines, warn].filter(Boolean).join('\n');
}
