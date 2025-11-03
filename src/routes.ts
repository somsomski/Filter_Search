import { Router } from 'express';
import { lookup, suggestModels, suggestMakes } from './lookup.js';

const router = Router();

// Input validation for /api/lookup
function validateLookupInput(body: any): { valid: boolean; error?: string } {
  if (!body.make || typeof body.make !== 'string' || body.make.trim().length === 0) {
    return { valid: false, error: 'make is required and must be a non-empty string' };
  }
  if (!body.model || typeof body.model !== 'string' || body.model.trim().length === 0) {
    return { valid: false, error: 'model is required and must be a non-empty string' };
  }
  if (!body.year || typeof body.year !== 'number' || body.year < 1900 || body.year > 2030) {
    return { valid: false, error: 'year is required and must be a number between 1900 and 2030' };
  }
  return { valid: true };
}

router.post('/api/lookup', async (req, res) => {
  try {
    const payload = req.body ?? {};
    
    // Validate input
    const validation = validateLookupInput(payload);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    
    const out = await lookup(payload);
    res.json(out);
  } catch (e: any) {
    const status = e?.status ?? 500;
    res.status(status).json({ error: e.message ?? 'Internal error' });
  }
});

router.get('/api/suggest-makes', async (req, res) => {
  try {
    const makePrefix = (req.query.makePrefix as string) || '';
    const limit = parseInt(req.query.limit as string) || 100;
    
    const suggestions = await suggestMakes(makePrefix.trim(), limit);
    res.json({ suggestions });
  } catch (e: any) {
    const status = e?.status ?? 500;
    res.status(status).json({ error: e.message ?? 'Internal error' });
  }
});

router.get('/api/suggest-models', async (req, res) => {
  try {
    const make = req.query.make as string;
    const modelPrefix = (req.query.modelPrefix as string) || '';
    
    if (!make || typeof make !== 'string' || make.trim().length === 0) {
      return res.status(400).json({ error: 'make is required and must be a non-empty string' });
    }
    
    const suggestions = await suggestModels(make.trim(), modelPrefix.trim());
    res.json({ suggestions });
  } catch (e: any) {
    const status = e?.status ?? 500;
    res.status(status).json({ error: e.message ?? 'Internal error' });
  }
});

export default router;
