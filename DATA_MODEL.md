# Модель данных

## Схема базы данных

### Таблица `catalog_hit` (основная)

Основная таблица с данными каталогов производителей фильтров.

```sql
CREATE TABLE IF NOT EXISTS catalog_hit (
  id BIGSERIAL PRIMARY KEY,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year_from INT NOT NULL,
  year_to INT NOT NULL,
  engine_code TEXT,
  fuel TEXT,
  displacement_l NUMERIC(3,1),
  power_hp INT,
  body TEXT,
  ac BOOLEAN,
  filter_type TEXT NOT NULL CHECK (filter_type IN ('oil','air','cabin','fuel')),
  brand_src TEXT NOT NULL,
  part_number TEXT NOT NULL,
  catalog_year INT NOT NULL,
  page TEXT NOT NULL,
  notes TEXT,
  ingestion_batch_id BIGINT REFERENCES ingestion_batch(id) ON DELETE SET NULL
);
```

**Описание полей:**
- `id` — уникальный идентификатор записи
- `make` — марка автомобиля (например, "Peugeot")
- `model` — модель автомобиля (например, "208")
- `year_from` — начальный год производства
- `year_to` — конечный год производства
- `engine_code` — код двигателя (опционально)
- `fuel` — тип топлива: "nafta" или "diesel"
- `displacement_l` — объем двигателя в литрах
- `power_hp` — мощность в лошадиных силах
- `body` — тип кузова (например, "HB", "SUV")
- `ac` — наличие кондиционера (true/false)
- `filter_type` — тип фильтра: "oil", "air", "cabin", "fuel"
- `brand_src` — бренд каталога (MANN, FRAM, MARENO, MAHLE, WEGA)
- `part_number` — номер детали
- `catalog_year` — год каталога
- `page` — страница в каталоге
- `notes` — дополнительные заметки
- `ingestion_batch_id` — ссылка на batch импорта

### Таблица `ingestion_batch`

Логирование процессов импорта данных.

```sql
CREATE TABLE IF NOT EXISTS ingestion_batch (
  id BIGSERIAL PRIMARY KEY,
  brand_src TEXT NOT NULL,
  catalog_year INT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  log TEXT
);
```

**Описание полей:**
- `id` — уникальный идентификатор batch
- `brand_src` — источник данных (бренд каталога)
- `catalog_year` — год каталога
- `created_at` — время создания batch
- `log` — лог импорта (статистика успешных/неудачных записей)

### Таблицы для v1.0 (НЕ используются в MVP)

Таблицы `part` и `xref` подготовлены для будущего использования в v1.0 и находятся в файле `migrations/002_future_parts.sql`. Они НЕ применяются в текущем MVP.

**Примечание:** Эти таблицы будут использоваться для нормализации деталей и создания связей между производителями в будущих версиях.

## Индексы

```sql
-- Основной индекс для поиска
CREATE INDEX IF NOT EXISTS idx_catalog_lookup 
ON catalog_hit(make, model, year_from, year_to, filter_type);

-- Индекс для дизамбигуации по характеристикам двигателя
CREATE INDEX IF NOT EXISTS idx_catalog_engine 
ON catalog_hit(engine_code, fuel, ac);

-- Индекс для нормализованных деталей
CREATE INDEX IF NOT EXISTS idx_part_key 
ON part(brand, part_number, filter_type);
```

## Ограничения и валидация

### CHECK ограничения
- `filter_type` должен быть одним из: 'oil', 'air', 'cabin', 'fuel'
- `year_from` и `year_to` должны быть положительными числами
- `year_from` ≤ `year_to`

### Обязательные поля
- `make`, `model`, `year_from`, `year_to` — для поиска
- `filter_type`, `brand_src`, `part_number`, `catalog_year`, `page` — для идентификации детали

### Опциональные поля
- `engine_code`, `fuel`, `displacement_l`, `power_hp`, `body`, `ac`, `notes`

## Примеры данных

### CSV заголовки
```csv
brand_src,catalog_year,page,make,model,year_from,year_to,engine_code,fuel,displacement_l,power_hp,body,ac,filter_type,part_number,notes
```

### Пример записи
```csv
MANN,2025,143,Peugeot,208,2015,2021,EC5,nafta,1.6,115,HB,true,oil,W712/95,
WEGA,2024,55,Peugeot,208,2015,2021,,nafta,1.6,,HB,true,air,WA12345,
MANN,2025,200,Peugeot,208,2015,2021,,nafta,1.6,,HB,true,cabin,CUK1234,carbón activo/bio
FRAM,2024,120,Peugeot,208,2015,2021,,nafta,1.6,,HB,true,fuel,WK820/7,
```

## Типы данных

| Поле | Тип | Описание |
|------|-----|----------|
| `make`, `model`, `brand_src` | TEXT | Строки без ограничений длины |
| `year_from`, `year_to`, `catalog_year` | INT | Целые числа |
| `displacement_l` | NUMERIC(3,1) | Число с 1 знаком после запятой |
| `power_hp` | INT | Целые числа |
| `fuel` | TEXT | "nafta" или "diesel" |
| `ac` | BOOLEAN | true/false |
| `filter_type` | TEXT | "oil", "air", "cabin", "fuel" |
| `page` | TEXT | Номер страницы (может содержать диапазоны) |

## Производительность

### Размер данных (оценка)
- ~100,000 записей на каталог производителя
- ~500,000 записей для всех источников MVP
- Размер таблицы: ~200-300 MB

### Время выполнения запросов
- Простой поиск (make, model, year): < 10ms
- Поиск с дизамбигуацией: < 50ms
- Импорт 10,000 записей: ~30 секунд

### Рекомендации по оптимизации
1. Регулярно обновлять статистику таблиц: `ANALYZE catalog_hit;`
2. Мониторить размер индексов
3. Рассмотреть партиционирование по годам при росте данных
