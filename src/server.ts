import express from 'express';
import cors from 'cors';
import routes from './routes.js';
import path from 'node:path';
import fs from 'node:fs';
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
  try {
    const indexPath = path.join(__dirname, '..', 'public', 'index.html');
    console.log('Serving index.html from:', indexPath);
    console.log('Directory contents:', __dirname, fs.readdirSync(__dirname));
    console.log('Public folder contents:', path.join(__dirname, '..', 'public'), fs.readdirSync(path.join(__dirname, '..', 'public')));
    console.log('Index file exists:', fs.existsSync(indexPath));
    res.sendFile(indexPath);
  } catch (error) {
    console.error('Error serving index.html:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    // Fallback response if file serving fails
    res.status(200).send(`
      <!doctype html>
      <html>
        <head><title>Filter Search Service</title></head>
        <body>
          <h1>Filter Search Service</h1>
          <p>Service is running successfully!</p>
          <p><a href="/health">Health Check</a></p>
          <p>Error details: ${error instanceof Error ? error.message : String(error)}</p>
        </body>
      </html>
    `);
  }
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public'), { 
  index: false // Don't serve index.html automatically
}));

app.use(routes);

// Centralized error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Filter service listening on ${HOST}:${PORT}`);
  console.log('Static file directory:', path.join(__dirname, '..', 'public'));
  console.log('Directory exists:', fs.existsSync(path.join(__dirname, '..', 'public')));
  if (fs.existsSync(path.join(__dirname, '..', 'public'))) {
    console.log('Public directory contents:', fs.readdirSync(path.join(__dirname, '..', 'public')));
  }
});
