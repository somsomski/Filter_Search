# Filter Search Service (Argentina) — MVP

Сервис поиска автомобильных фильтров по каталогам производителей для Аргентины. Поддерживает источники: MANN, FRAM, MARENO, MAHLE, WEGA.

## Быстрый старт

### Локальная разработка
```bash
# 1. Установка зависимостей
npm install

# 2. Настройка БД
# Создай PostgreSQL БД и выполни schema.sql
createdb filter_search
psql filter_search < schema.sql

# 3. Настройка переменных окружения
export DATABASE_URL="postgres://user:password@localhost:5432/filter_search"

# 4. Импорт тестовых данных
npm run import ./data/sample_catalog.csv

# 5. Запуск сервера
npm run dev
# Открой http://localhost:8080
```

### Деплой на Railway
```bash
# 1. Создай проект на Railway
# 2. Добавь PostgreSQL плагин
# 3. Настрой переменные:
#    DATABASE_URL (автоматически)
#    PORT=8080
#    NODE_ENV=production
# 4. Выполни schema.sql в Railway PostgreSQL
# 5. Импортируй данные через Railway CLI или веб-интерфейс
```

## API

### POST /api/lookup
Поиск фильтров по марке, модели и году автомобиля.

**Запрос:**
```json
{
  "make": "Peugeot",
  "model": "208", 
  "year": 2019,
  "hints": {
    "fuel": "nafta",
    "ac": true,
    "displacement_l": 1.6
  },
  "lang": "es-AR"
}
```

**Ответ:**
```json
{
  "query": { "make": "Peugeot", "model": "208", "year": 2019 },
  "results": {
    "oil": [{"brand": "MANN", "part_number": "W712/95", "confidence": 0.95}],
    "air": [{"brand": "WEGA", "part_number": "WA12345", "confidence": 0.90}],
    "cabin": [{"brand": "MANN", "part_number": "CUK1234", "confidence": 0.85}],
    "fuel": [{"brand": "FRAM", "part_number": "WK820/7", "confidence": 0.88}]
  },
  "disambiguation": {
    "needed": false,
    "ask": []
  },
  "notices": ["Resultados basados en catálogos importados."]
}
```

### GET /health
Проверка состояния сервиса.

## Ошибки и коды ответов

| Код | Описание | Причина |
|-----|----------|---------|
| 400 | Bad Request | Неверные входные данные (make, model, year) |
| 404 | Not Found | Нет данных для указанной комбинации |
| 500 | Internal Server Error | Ошибка сервера |
| 503 | Service Unavailable | База данных недоступна |

## Структура проекта

- `src/` — исходный код TypeScript
- `public/` — статические файлы (HTML/CSS/JS)
- `scripts/` — утилиты импорта данных
- `data/` — примеры CSV файлов
- `schema.sql` — схема базы данных

## Документация

- [ARCHITECTURE.md](ARCHITECTURE.md) — архитектура системы
- [API.md](API.md) — спецификация API
- [DATA_MODEL.md](DATA_MODEL.md) — модель данных
- [ETL.md](ETL.md) — процесс импорта данных
- [DEPLOY.md](DEPLOY.md) — инструкции деплоя
- [SCOPE.md](SCOPE.md) — рамки MVP
