import express from 'express';
import cors from 'cors';
import routes from './routes.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Add healthcheck endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Serve index.html for root route (must come before static middleware)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public'), {
    index: false // Don't serve index.html automatically
}));
app.use(routes);
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';
app.listen(PORT, HOST, () => {
    console.log(`Filter service listening on ${HOST}:${PORT}`);
});
