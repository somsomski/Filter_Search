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
npm run build && npm start
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

## Smoke Tests / Postman

Рекомендуемая последовательность тестирования для проверки основной функциональности:

### 1. Health Check
```bash
curl http://localhost:8080/health
```
**Ожидаемый результат:** HTTP 200 с `{"status":"ok","timestamp":"...","db":"ok"}`

### 2. Peugeot 208 без hints (дизамбигуация по fuel)
```bash
curl -X POST http://localhost:8080/api/lookup \
  -H "Content-Type: application/json" \
  -d '{"make": "Peugeot", "model": "208", "year": 2019}'
```
**Ожидаемый результат:** HTTP 200, `disambiguation.needed=true`, вопрос по `fuel`

### 3. Peugeot 208 с fuel=nafta (дизамбигуация по displacement_l)
```bash
curl -X POST http://localhost:8080/api/lookup \
  -H "Content-Type: application/json" \
  -d '{"make": "Peugeot", "model": "208", "year": 2019, "hints": {"fuel": "nafta"}}'
```
**Ожидаемый результат:** HTTP 200, вопрос по `displacement_l` (если есть варианты)

### 4. Peugeot 208 с fuel=diesel (дизамбигуация по displacement_l)
```bash
curl -X POST http://localhost:8080/api/lookup \
  -H "Content-Type: application/json" \
  -d '{"make": "Peugeot", "model": "208", "year": 2019, "hints": {"fuel": "diesel"}}'
```
**Ожидаемый результат:** HTTP 200, вопрос по `displacement_l`, некоторые секции могут быть пустыми

### 5. Journey 2013 (тест с реальными данными)
```bash
curl -X POST http://localhost:8080/api/lookup \
  -H "Content-Type: application/json" \
  -d '{"make": "Dodge", "model": "Journey", "year": 2013}'
```
**Ожидаемый результат:** HTTP 200 с результатами или дизамбигуацией

### Ожидаемое поведение

| Тест | results.keys | disambiguation | Примечание |
|------|-------------|----------------|------------|
| Health | - | - | Проверка доступности сервиса и БД |
| 208 без hints | oil,air,cabin,fuel | fuel вопрос | Пошаговая дизамбигуация |
| 208 + fuel=nafta | oil,air,cabin,fuel | displacement_l вопрос | Следующий шаг дизамбигуации |
| 208 + fuel=diesel | oil,air,cabin,fuel | displacement_l вопрос | Некоторые секции могут быть [] |
| Journey 2013 | oil,air,cabin,fuel | зависит от данных | Реальный кейс |

### Автоматические тесты
```bash
# Запуск всех тестов
./scripts/smoke/lookup_ok.sh    # Тесты успешных запросов
./scripts/smoke/lookup_bad.sh   # Тесты некорректных запросов

# Или используйте HTTP файлы в IDE (VS Code с REST Client)
scripts/smoke/lookup_ok.http
scripts/smoke/lookup_bad.http
```

## UI / Веб-интерфейс

Простой веб-интерфейс доступен по адресу `/` (корневой маршрут).

### Функциональность

- **Поиск фильтров**: Ввод марки, модели и года автомобиля
- **Дизамбигуация**: Интерактивные вопросы для уточнения параметров
  - Кнопки для выбора типа топлива (nafta/diesel)
  - Поле ввода для объема двигателя (displacement_l)
- **Активные фильтры**: Чипы с текущими параметрами поиска
  - Клик по чипу удаляет соответствующий фильтр
  - Автоматический перезапуск поиска при изменении
- **Результаты**: Всегда показываются 4 секции фильтров
  - Пустые секции отображаются с подписью "— No entries / Нет позиций —"
  - Результаты с деталями, уверенностью и источниками

### Технические детали

- **Vanilla JS**: Без внешних фреймворков
- **Responsive**: Адаптивный дизайн для мобильных устройств
- **Двуязычность**: Поддержка испанского (es-AR) и русского (ru) языков

## Contribution / Guardrails

Проект следует строгим рамкам MVP с автоматической защитой от дрейфа.

### Правила разработки

1. **API эндпоинты**: Разрешены только `POST /api/lookup` и `GET /health`
2. **Зависимости**: Только необходимые пакеты (express, cors, pg, typescript)
3. **Изменения**: Все изменения должны проходить через GitHub Actions guardrails

### Процесс внесения изменений

1. **Создайте feature branch** от main
2. **Внесите изменения** согласно MVP рамкам
3. **Обновите документацию** (DECISIONS.md для архитектурных решений)
4. **Создайте PR** - GitHub Actions автоматически проверит гвардрайлы
5. **Дождитесь прохождения** всех проверок перед merge

### GitHub Actions Guardrails

Автоматически проверяются:
- ✅ TypeScript компиляция без ошибок
- ✅ Отсутствие новых API маршрутов
- ✅ Отсутствие новых зависимостей
- ✅ Соответствие структуре MVP

**Нарушение гвардрайлов блокирует merge в main.**

### Исключения из правил

Для добавления новых функций:
1. Создайте ADR в `DECISIONS.md`
2. Обновите `SCOPE.md` с обоснованием
3. Создайте отдельный PR с детальным описанием
4. Получите явное одобрение команды

## Документация

- [ARCHITECTURE.md](ARCHITECTURE.md) — архитектура системы
- [API.md](API.md) — спецификация API
- [DATA_MODEL.md](DATA_MODEL.md) — модель данных
- [ETL.md](ETL.md) — процесс импорта данных
- [DEPLOY.md](DEPLOY.md) — инструкции деплоя
- [SCOPE.md](SCOPE.md) — рамки MVP
