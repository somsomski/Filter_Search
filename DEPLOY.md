# Деплой на Railway

## Подготовка к деплою

### 1. Создание проекта на Railway

1. Зайдите на [railway.app](https://railway.app)
2. Создайте новый проект
3. Подключите GitHub репозиторий
4. Выберите автоматический деплой из main ветки

### 2. Настройка переменных окружения

В настройках проекта Railway добавьте:

| Переменная | Значение | Описание |
|------------|----------|----------|
| `DATABASE_URL` | `postgres://...` | Автоматически создается при добавлении PostgreSQL |
| `PORT` | `8080` | Порт приложения |
| `NODE_ENV` | `production` | Режим production |

### 3. Добавление PostgreSQL

1. В Railway Dashboard нажмите "New"
2. Выберите "Database" → "PostgreSQL"
3. Railway автоматически создаст `DATABASE_URL`
4. Скопируйте строку подключения для локального доступа

## Миграции базы данных

### Выполнение schema.sql

**Вариант 1: Через Railway CLI**
```bash
# Установка Railway CLI
npm install -g @railway/cli

# Логин
railway login

# Подключение к проекту
railway link

# Выполнение миграции
railway run psql $DATABASE_URL -f schema.sql
```

**Вариант 2: Через веб-интерфейс**
1. Откройте PostgreSQL в Railway Dashboard
2. Перейдите в "Query" tab
3. Скопируйте содержимое `schema.sql`
4. Выполните SQL команды

**Вариант 3: Через внешний клиент**
```bash
# Используйте строку подключения из Railway
psql "postgresql://postgres:password@host:port/railway" -f schema.sql
```

## Build и Start команды

### Build процесс
```bash
# Установка зависимостей
npm ci --include=dev

# Компиляция TypeScript
npx tsc

# Копирование статических файлов
node scripts/build.js
```

### Start команда
```bash
# Запуск сервера
node dist/src/server.js
```

### Конфигурация Railway

Файл `railway.json`:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

Файл `nixpacks.toml`:
```toml
[phases.install]
cmds = [
    "npm ci --include=dev",
]

[phases.build]
cmds = [
    "npm run build",
]

[start]
cmd = "npm start"
```

## Импорт данных на Railway

### Через Railway CLI
```bash
# Импорт CSV файла
railway run npm run import ./data/sample_catalog.csv

# Импорт с локального файла
railway run -- npm run import /path/to/local/file.csv
```

### Через веб-интерфейс
1. Загрузите CSV файл в Railway
2. Используйте Railway CLI для импорта
3. Или выполните импорт через внешний скрипт

### Проверка импорта
```bash
# Подключение к БД через Railway CLI
railway run psql $DATABASE_URL

# Проверка данных
SELECT COUNT(*) FROM catalog_hit;
SELECT brand_src, COUNT(*) FROM catalog_hit GROUP BY brand_src;
```

## Мониторинг и логи

### Health Check
Railway автоматически проверяет `/health` эндпоинт:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Просмотр логов
```bash
# Через Railway CLI
railway logs

# Через веб-интерфейс
# Откройте проект → "Deployments" → выберите деплой → "Logs"
```

### Мониторинг производительности
- Railway Dashboard → "Metrics"
- Мониторинг CPU, памяти, сети
- Настройка алертов при превышении лимитов

## Обновление приложения

### Автоматический деплой
1. Сделайте изменения в коде
2. Закоммитьте в main ветку
3. Railway автоматически запустит новый деплой

### Ручной деплой
```bash
# Через Railway CLI
railway up

# Или через веб-интерфейс
# Нажмите "Deploy" в Railway Dashboard
```

### Обновление базы данных
```bash
# Выполнение новых миграций
railway run psql $DATABASE_URL -f new_migration.sql

# Импорт новых данных
railway run npm run import ./new_catalog.csv
```

## Troubleshooting

### Проблема: Build fails
**Проверьте:**
- Корректность `package.json`
- Наличие всех зависимостей
- TypeScript ошибки: `npm run build:check`

### Проблема: App не запускается
**Проверьте:**
- Переменные окружения
- Доступность базы данных
- Логи приложения: `railway logs`

### Проблема: Database connection failed
**Проверьте:**
- Корректность `DATABASE_URL`
- Доступность PostgreSQL
- Сетевое подключение

### Проблема: Health check fails
**Проверьте:**
- Работает ли `/health` эндпоинт локально
- Нет ли ошибок в логах
- Корректность порта (должен быть 8080)

## Безопасность

### Переменные окружения
- Никогда не коммитьте `DATABASE_URL` в код
- Используйте Railway Secrets для чувствительных данных
- Регулярно ротируйте пароли БД

### Доступ к базе данных
- Ограничьте доступ по IP
- Используйте SSL соединения
- Регулярно обновляйте PostgreSQL

### Мониторинг
- Настройте алерты на критические ошибки
- Мониторьте необычную активность
- Ведите логи всех операций

## Масштабирование

### Горизонтальное масштабирование
Railway автоматически масштабирует приложение при росте нагрузки.

### Вертикальное масштабирование
В Railway Dashboard можно увеличить ресурсы:
- CPU: до 8 vCPU
- RAM: до 32 GB
- Storage: до 1 TB

### Оптимизация производительности
1. **Кеширование**: Добавьте Redis для кеширования частых запросов
2. **CDN**: Используйте Railway CDN для статических файлов
3. **Индексы**: Оптимизируйте индексы БД для частых запросов
4. **Connection pooling**: Настройте пул соединений с БД
