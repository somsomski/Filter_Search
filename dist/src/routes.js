import { Router } from 'express';
import { lookup } from './lookup.js';
import { toWhatsappText } from './formatter.js';
const router = Router();
router.post('/api/lookup', async (req, res) => {
    try {
        const payload = req.body ?? {};
        const out = await lookup(payload);
        res.json(out);
    }
    catch (e) {
        const status = e?.status ?? 500;
        res.status(status).json({ error: e.message ?? 'Internal error' });
    }
});
router.post('/api/lookup/text', async (req, res) => {
    try {
        const payload = req.body ?? {};
        const out = await lookup(payload);
        const lang = payload.lang === 'ru' ? 'ru' : 'es-AR';
        const text = toWhatsappText(out, lang);
        res.json({ text, structured: out });
    }
    catch (e) {
        const status = e?.status ?? 500;
        res.status(status).json({ error: e.message ?? 'Internal error' });
    }
});
export default router;
