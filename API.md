# API Спецификация

## Базовый URL
- Локально: `http://localhost:8080`
- Railway: `https://your-app.railway.app`

## Эндпоинты

### POST /api/lookup

Основной эндпоинт для поиска автомобильных фильтров.

#### Запрос

**Content-Type**: `application/json`

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

**Поля запроса:**
- `make` (string, обязательное) — марка автомобиля
- `model` (string, обязательное) — модель автомобиля  
- `year` (number, обязательное) — год выпуска
- `hints` (object, опциональное) — дополнительные уточнения
  - `fuel` (string, опциональное) — тип топлива: `"nafta"` или `"diesel"`
  - `ac` (boolean, опциональное) — наличие кондиционера
  - `displacement_l` (number, опциональное) — объем двигателя в литрах
- `lang` (string, опциональное) — язык ответа: `"es-AR"` или `"ru"`

#### Ответ

**Важно**: Ответ всегда содержит объект `results` с четырьмя ключами: `oil`, `air`, `cabin`, `fuel`. Если по какой-либо секции нет позиций, возвращается пустой массив `[]`.

**HTTP 200 OK**
```json
{
  "query": {
    "make": "Peugeot",
    "model": "208",
    "year": 2019,
    "hints": {
      "fuel": "nafta",
      "ac": true,
      "displacement_l": 1.6
    },
    "lang": "es-AR"
  },
  "results": {
    "oil": [
      {
        "brand": "MANN",
        "part_number": "W712/95",
        "filter_type": "oil",
        "confidence": 0.95,
        "sources": [
          {
            "catalog": "MANN 2025",
            "page": "143"
          }
        ]
      }
    ],
    "air": [
      {
        "brand": "WEGA", 
        "part_number": "WA12345",
        "filter_type": "air",
        "confidence": 0.90,
        "sources": [
          {
            "catalog": "WEGA 2024",
            "page": "55"
          }
        ]
      }
    ],
    "cabin": [
      {
        "brand": "MANN",
        "part_number": "CUK1234", 
        "filter_type": "cabin",
        "confidence": 0.85,
        "sources": [
          {
            "catalog": "MANN 2025",
            "page": "200"
          }
        ]
      }
    ],
    "fuel": [
      {
        "brand": "FRAM",
        "part_number": "WK820/7",
        "filter_type": "fuel", 
        "confidence": 0.88,
        "sources": [
          {
            "catalog": "FRAM 2024",
            "page": "120"
          }
        ]
      }
    ]
  },
  "disambiguation": {
    "needed": false,
    "ask": [],
    "fallback_texts": {
      "es-AR": "",
      "ru": ""
    }
  },
  "notices": [
    "Resultados basados en catálogos importados. Verificá combustible/AC si hay duda."
  ]
}
```

**HTTP 400 Bad Request**
```json
{
  "error": "make is required and must be a non-empty string"
}
```

```json
{
  "error": "year is required and must be a number between 1900 and 2030"
}
```

**HTTP 404 Not Found**
```json
{
  "query": {
    "make": "UnknownMake",
    "model": "UnknownModel", 
    "year": 2020
  },
  "results": {},
  "disambiguation": {
    "needed": false,
    "ask": []
  },
  "notices": [
    "No hay registros en los catálogos para esta combinación."
  ]
}
```

**HTTP 503 Service Unavailable**
```json
{
  "error": "Database not available"
}
```

#### Пример с дизамбигуацией

**Важно**: Дизамбигуация теперь работает пошагово — задается только один вопрос за раз по приоритету: 1) fuel, 2) ac, 3) displacement_l.

**Запрос:**
```json
{
  "make": "Peugeot",
  "model": "208", 
  "year": 2019
}
```

**Ответ:**
```json
{
  "query": {
    "make": "Peugeot",
    "model": "208",
    "year": 2019
  },
  "results": {
    "oil": [
      {
        "brand": "MANN",
        "part_number": "W712/95",
        "filter_type": "oil",
        "confidence": 0.75,
        "sources": [
          {
            "catalog": "MANN 2025",
            "page": "143"
          }
        ]
      }
    ],
    "air": [],
    "cabin": [],
    "fuel": []
  },
  "disambiguation": {
    "needed": true,
    "ask": [
      {
        "field": "fuel",
        "options": ["nafta", "diesel"],
        "reason": "Hay variantes por combustible."
      }
    ],
    "fallback_texts": {
      "es-AR": "¿Nafta o diésel?",
      "ru": "Nafta или diesel?"
    }
  },
  "notices": [
    "Resultados basados en catálogos importados. Verificá combustible/AC si hay duda."
  ]
}
```

### POST /api/lookup/text

Альтернативный эндпоинт, возвращающий результаты в текстовом формате для WhatsApp.

#### Запрос
Аналогичен `/api/lookup`

#### Ответ
```json
{
  "text": "🧰 Filtros para Peugeot 208 2019\n• Aceite: MANN W712/95\n• Aire: WEGA WA12345\n• Cabina: MANN CUK1234\n• Combustible: FRAM WK820/7",
  "structured": {
    // ... полный объект как в /api/lookup
  }
}
```

### GET /health

Проверка состояния сервиса.

#### Ответ
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Коды ошибок

| Код | Описание | Причина |
|-----|----------|---------|
| 400 | Bad Request | Отсутствуют обязательные поля (`make`, `model`, `year`) |
| 404 | Not Found | Нет данных для указанной комбинации |
| 500 | Internal Server Error | Ошибка сервера |
| 503 | Service Unavailable | База данных недоступна |

## Типы фильтров

Система поддерживает 4 типа фильтров:
- `oil` — масляный фильтр
- `air` — воздушный фильтр  
- `cabin` — салонный фильтр
- `fuel` — топливный фильтр

## Confidence Score

Каждый результат содержит оценку уверенности от 0.50 до 0.99:
- 0.95+ — высокая уверенность (единственный результат)
- 0.85-0.94 — хорошая уверенность
- 0.75-0.84 — средняя уверенность
- 0.50-0.74 — низкая уверенность (требует дизамбигуации)
