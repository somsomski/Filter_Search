# ETL Процесс

## Подготовка CSV из PDF каталогов

### Ожидаемые колонки CSV

Обязательные поля для импорта:
```csv
brand_src,catalog_year,page,make,model,year_from,year_to,engine_code,fuel,displacement_l,power_hp,body,ac,filter_type,part_number,notes
```

**Описание полей:**
- `brand_src` — источник каталога (MANN, FRAM, MARENO, MAHLE, WEGA)
- `catalog_year` — год каталога (например, 2024, 2025)
- `page` — страница в каталоге (может быть диапазоном "120-125")
- `make` — марка автомобиля
- `model` — модель автомобиля
- `year_from` — начальный год производства
- `year_to` — конечный год производства
- `engine_code` — код двигателя (опционально)
- `fuel` — тип топлива: "nafta" или "diesel"
- `displacement_l` — объем двигателя в литрах (например, 1.6)
- `power_hp` — мощность в л.с. (опционально)
- `body` — тип кузова (HB, SUV, SEDAN, etc.)
- `ac` — тип медиа салона: "true" = carbón activo/bio (CUK/FP), "false" = estándar (CU). Не связан с наличием кондиционера.
- `filter_type` — тип фильтра: "oil", "air", "cabin", "fuel"
- `part_number` — номер детали производителя
- `notes` — дополнительные заметки (опционально)

### Пример правильного CSV

```csv
brand_src,catalog_year,page,make,model,year_from,year_to,engine_code,fuel,displacement_l,power_hp,body,ac,filter_type,part_number,notes
MANN,2025,143,Peugeot,208,2015,2021,EC5,nafta,1.6,115,HB,true,oil,W712/95,
WEGA,2024,55,Peugeot,208,2015,2021,,nafta,1.6,,HB,true,air,WA12345,
MANN,2025,200,Peugeot,208,2015,2021,,nafta,1.6,,HB,true,cabin,CUK1234,carbón activo/bio
FRAM,2024,120,Peugeot,208,2015,2021,,nafta,1.6,,HB,true,fuel,WK820/7,
MANN,2025,90,Dodge,Journey,2010,2016,ED3,nafta,2.4,,SUV,true,oil,W680/1,
```

## Запуск импорта

### Команда импорта

```bash
# Локально
npm run import ./path/to/catalog.csv

# На Railway (через CLI)
railway run npm run import ./path/to/catalog.csv
```

### Переменные окружения

Обязательные:
- `DATABASE_URL` — строка подключения к PostgreSQL

### Процесс импорта

1. **Валидация файла**
   - Проверка существования файла
   - Парсинг CSV структуры
   - Валидация обязательных колонок

2. **Создание batch записи**
   ```sql
   INSERT INTO ingestion_batch (brand_src, catalog_year) 
   VALUES ($1, $2) RETURNING id
   ```

3. **Массовая вставка данных**
   - Парсинг каждой строки CSV
   - Валидация типов данных
   - Вставка в `catalog_hit`
   - Создание записи в `part` (для нормализации)

4. **Логирование результатов**
   ```sql
   UPDATE ingestion_batch 
   SET log = 'import_csv\nOK: 1000, FAIL: 5' 
   WHERE id = $1
   ```

## Формат логов и ошибок

### Успешный импорт
```
Done. OK=1000, FAIL=0, batchId=123
```

### Импорт с ошибками
```
Row failed: MANN,2025,143,Peugeot,208,2015,2021,EC5,nafta,invalid_number,115,HB,true,oil,W712/95, Error: invalid input syntax for type numeric: "invalid_number"
Done. OK=999, FAIL=1, batchId=123
```

### Типичные ошибки

1. **Отсутствующие колонки**
   ```
   CSV missing columns: fuel, displacement_l
   ```

2. **Неправильные типы данных**
   ```
   Row failed: ...,invalid_year,... Error: invalid input syntax for type integer: "invalid_year"
   ```

3. **Нарушение ограничений**
   ```
   Row failed: ...,invalid_filter_type,... Error: new row for relation "catalog_hit" violates check constraint "catalog_hit_filter_type_check"
   ```

4. **Проблемы с подключением к БД**
   ```
   DATABASE_URL not set, cannot import
   ```

## Мониторинг импорта

### Проверка статуса batch
```sql
SELECT id, brand_src, catalog_year, created_at, log 
FROM ingestion_batch 
ORDER BY created_at DESC 
LIMIT 10;
```

### Статистика по источникам
```sql
SELECT brand_src, catalog_year, COUNT(*) as records
FROM catalog_hit 
GROUP BY brand_src, catalog_year
ORDER BY brand_src, catalog_year;
```

### Проверка качества данных
```sql
-- Записи без обязательных полей
SELECT COUNT(*) FROM catalog_hit 
WHERE make IS NULL OR model IS NULL OR year_from IS NULL;

-- Дубликаты деталей
SELECT brand_src, part_number, filter_type, COUNT(*) 
FROM catalog_hit 
GROUP BY brand_src, part_number, filter_type 
HAVING COUNT(*) > 1;
```

## Рекомендации по подготовке данных

### Из PDF каталогов
1. **Извлечение данных**: Используйте OCR или ручной ввод
2. **Нормализация**: Приведите названия марок/моделей к единому формату
3. **Валидация**: Проверьте корректность годов и типов фильтров
4. **Тестирование**: Импортируйте небольшую выборку для проверки

### Качество данных
- **Марки**: Используйте официальные названия (Peugeot, не PEUGEOT)
- **Модели**: Точные названия моделей (208, не "208 Hatchback")
- **Годы**: Проверьте корректность диапазонов (year_from ≤ year_to)
- **Типы фильтров**: Только "oil", "air", "cabin", "fuel"
- **Топливо**: Только "nafta" или "diesel"

### Размер файлов
- **Рекомендуемый размер**: до 50,000 записей за раз
- **Большие каталоги**: Разбивайте на части по годам или типам фильтров
- **Время импорта**: ~30 секунд на 10,000 записей

## Troubleshooting

### Проблема: Медленный импорт
**Решение**: Проверьте индексы и выполните `ANALYZE catalog_hit;`

### Проблема: Ошибки кодировки
**Решение**: Сохраняйте CSV в UTF-8 без BOM

### Проблема: Память при больших файлах
**Решение**: Разбивайте файлы на части по 10,000 записей
