# Filter Service (Argentina) — MVP

## Установка локально
1. `npm i`
2. Создай `.env` по примеру `.env.example` (DATABASE_URL).
3. Инициализируй БД: выполни `schema.sql`.
4. Импортируй пример: `npm run import:csv`
5. Запусти: `npm run dev` → http://localhost:8080

## Деплой на Railway
- Добавь сервис → переменные: `DATABASE_URL`, `PORT=8080`, `NODE_ENV=production`
- Выполни `schema.sql` в PostgreSQL плагине
- Импортируй свои CSV: `npm run import:csv`
- Эндпоинт: `POST /api/lookup` — см. src/types.ts (LookupInput/Output)

## LookupInput (JSON)
```json
{
  "make": "Peugeot",
  "model": "208",
  "year": 2019,
  "hints": { "fuel": null, "ac": null, "displacement_l": null },
  "lang": "es-AR"
}
```

## Ответ
- `results.oil|air|cabin|fuel` — массив деталей
- `disambiguation.needed=true` — нужно уточнить `fuel|ac|displacement_l`
