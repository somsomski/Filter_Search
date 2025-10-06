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
    "displacement_l": 1.6,
    "engine_series": "TBI 16V"
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
  - `ac` (boolean, опциональное) — тип медиа салона: `false` = estándar (CU), `true` = carbón activo/bio (CUK/FP). Не связан с наличием кондиционера.
  - `displacement_l` (number, опциональное) — объем двигателя в литрах
  - `engine_series` (string, опциональное) — серия двигателя (например, "TBI 16V", "BLUEHDI", "TSI")
- `lang` (string, опциональное) — язык ответа: `"es-AR"` или `"ru"`

#### Ответ

**Инвариант**: Объект `results` ВСЕГДА содержит четыре ключа: `oil`, `air`, `cabin`, `fuel`. Если по какой-либо секции нет позиций, возвращается пустой массив `[]`. Это гарантирует единообразную структуру ответа независимо от наличия данных.

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
      "displacement_l": 1.6,
      "engine_series": "TBI 16V"
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
    "Resultados basados en catálogos importados. Verificá combustible/tipo de media si hay duda."
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

**Важно**: Дизамбигуация теперь работает пошагово — задается только один вопрос за раз по приоритету: 1) fuel, 2) ac, 3) displacement_l, 4) engine_series. 

**Умная дизамбигуация**: Вопрос по displacement_l задается только если разные значения displacement_l действительно влияют на результат (дают разные детали). Если для разных значений displacement_l получается одинаковый набор деталей, вопрос не задается.

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
    "Resultados basados en catálogos importados. Verificá combustible/tipo de media si hay duda."
  ]
}
```

#### Примеры дизамбигуации

**Пример A: Неоднозначность по fuel**
```json
{
  "make": "Peugeot",
  "model": "208",
  "year": 2019
}
```
Ответ содержит вопрос только по fuel:
```json
{
  "disambiguation": {
    "needed": true,
    "ask": [
      {
        "field": "fuel",
        "options": ["nafta", "diesel"],
        "reason": "Hay variantes por combustible."
      }
    ]
  }
}
```

**Пример B: fuel=nafta → вопрос по displacement_l**
```json
{
  "make": "Peugeot",
  "model": "208",
  "year": 2019,
  "hints": {
    "fuel": "nafta"
  }
}
```
Ответ содержит вопрос только по displacement_l:
```json
{
  "disambiguation": {
    "needed": true,
    "ask": [
      {
        "field": "displacement_l",
        "options": [1.2, 1.6],
        "reason": "Hay variantes por cilindrada."
      }
    ]
  }
}
```

**Пример C: fuel=diesel → вопрос по displacement_l с пустыми секциями**
```json
{
  "make": "Peugeot",
  "model": "208",
  "year": 2019,
  "hints": {
    "fuel": "diesel"
  }
}
```
Ответ содержит все 4 ключа, некоторые пустые:
```json
{
  "results": {
    "oil": [{"brand": "MANN", "part_number": "W712/95", ...}],
    "air": [],
    "cabin": [],
    "fuel": [{"brand": "FRAM", "part_number": "WK820/7", ...}]
  },
  "disambiguation": {
    "needed": true,
    "ask": [
      {
        "field": "displacement_l",
        "options": [1.5, 1.6],
        "reason": "Hay variantes por cilindrada."
      }
    ]
  }
}
```

**Пример D: Умная дизамбигуация - displacement_l не влияет на результат**
```json
{
  "make": "Peugeot",
  "model": "208",
  "year": 2019,
  "hints": {
    "fuel": "nafta"
  }
}
```
Ответ НЕ содержит вопрос по displacement_l, если детали одинаковые:
```json
{
  "results": {
    "oil": [{"brand": "MANN", "part_number": "W712/95", ...}],
    "air": [{"brand": "WEGA", "part_number": "WA12345", ...}],
    "cabin": [],
    "fuel": []
  },
  "disambiguation": {
    "needed": false,
    "ask": []
  }
}
```

**Пример E: Дизамбигуация по серии двигателя**
```json
{
  "make": "Peugeot",
  "model": "208",
  "year": 2019,
  "hints": {
    "fuel": "nafta",
    "ac": true,
    "displacement_l": 1.6
  }
}
```
Ответ содержит вопрос по engine_series:
```json
{
  "results": {
    "oil": [{"brand": "MANN", "part_number": "W712/95", ...}],
    "air": [{"brand": "WEGA", "part_number": "WA12345", ...}],
    "cabin": [],
    "fuel": []
  },
  "disambiguation": {
    "needed": true,
    "ask": [
      {
        "field": "engine_series",
        "options": ["TBI 16V", "JTDM 16V", "TSI"],
        "reason": "Hay variantes por serie de motor."
      }
    ],
    "fallback_texts": {
      "es-AR": "¿Serie del motor? (ej.: TBI 16V)",
      "ru": "Серия двигателя? (например, TBI 16V)"
    }
  }
}
```

#### Примеры ошибок валидации

**HTTP 400 Bad Request**
```json
{
  "error": "make is required and must be a non-empty string"
}
```

```json
{
  "error": "model is required and must be a non-empty string"
}
```

```json
{
  "error": "year is required and must be a number between 1900 and 2030"
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
