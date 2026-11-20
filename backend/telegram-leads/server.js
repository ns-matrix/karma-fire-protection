/* ============================================
   KARMA FIRE PROTECTION — LEAD API SERVER
   Serves the static website + POST /api/leads
   ============================================ */
'use strict';

require('dotenv').config();

const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');

const db = require('./db');
const { validateLead, escapeHtml } = require('./validate');
const telegram = require('./telegram');

const app = express();
const PORT = process.env.PORT || 3000;
const SITE_ROOT = path.join(__dirname, '..', '..');
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/* ---------- Security middleware ---------- */

// CORS: only allow configured origins (or same-origin requests with no Origin header)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else {
      return res.status(403).json({ ok: false, message: 'Origin not allowed.' });
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Basic hardening headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Body parsing with size limit
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

// Request logging (no PII)
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'test') {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  }
  next();
});

/* ---------- Static frontend ---------- */
app.use(
  express.static(SITE_ROOT, {
    index: ['index.html'],
    maxAge: '1h',
    setHeaders(res, filePath) {
      if (/\.(html)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
    }
  })
);

/* ---------- Health check ---------- */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'up' });
});

/* ---------- Lead submission ---------- */
app.post('/api/leads', async (req, res) => {
  try {
    const body = req.body || {};

    // 1) Honeypot — silently pretend success for bots
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      console.warn('Honeypot triggered — bot submission discarded.');
      return res.status(200).json({
        ok: true,
        message: 'Thank you! Your request has been received. We will get back to you shortly.'
      });
    }

    // 2) Rate limiting: per-IP, max 5 per 10 minutes
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32);
    if (!db.checkRateLimit(`lead:${ipHash}`, 5, 600)) {
      return res.status(429).json({
        ok: false,
        message: 'Too many requests. Please wait a few minutes and try again.'
      });
    }

    // 3) Server-side validation
    const result = validateLead(body);
    if (!result.ok) {
      return res.status(400).json({
        ok: false,
        message: 'Please check the form fields and try again.',
        errors: result.errors
      });
    }

    // 4) Save lead
    const lead = db.insertLead({ ...result.data, ip_hash: ipHash });
    console.log(`✅ Lead saved: ${lead.lead_id}`);

    // 5) Telegram notification (failure must not break the response)
    try {
      const notify = await telegram.notifyNewLead(lead);
      if (notify && notify.ok === false && notify.reason === 'not_configured') {
        console.warn('Telegram not configured — set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.');
      }
    } catch (err) {
      console.error('Telegram notification failed:', err.message);
    }

    return res.status(201).json({
      ok: true,
      leadId: lead.lead_id,
      message: 'Thank you! Your request has been received. We will get back to you shortly.'
    });
  } catch (err) {
    console.error('Lead submission error:', err);
    // Safe error: no internals leaked
    return res.status(500).json({
      ok: false,
      message: 'Something went wrong on our side. Please try again or call +91 95949 67751.'
    });
  }
});

/* ---------- 404 for API ---------- */
app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, message: 'Not found.' });
});

/* ---------- Start ---------- */
if (require.main === module) {
  db.getDb(); // initialise schema
  app.listen(PORT, () => {
    console.log(`🔥 Karma Lead API running on http://localhost:${PORT}`);
    telegram.startBot();
  });

  process.on('SIGINT', () => {
    telegram.stopBot();
    process.exit(0);
  });
}

module.exports = app;
