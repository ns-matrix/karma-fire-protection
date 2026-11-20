/* ============================================
   SQLite database layer (node:sqlite built-in)
   Avoids native-compile dependencies.
   ============================================ */
'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, 'leads.db');

let db = null;

function getDb() {
  if (db) return db;

  // Ensure directory exists (skip for :memory:)
  if (DB_PATH !== ':memory:') {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }

  db = new DatabaseSync(DB_PATH);

  // Reasonable safety defaults
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  initSchema(db);
  return db;
}

function initSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id        TEXT    NOT NULL UNIQUE,
      name           TEXT    NOT NULL,
      phone          TEXT    NOT NULL,
      email          TEXT    NOT NULL,
      company        TEXT,
      building_type  TEXT,
      service        TEXT    NOT NULL,
      location       TEXT    NOT NULL,
      message        TEXT,
      contact_method TEXT,
      consent        INTEGER NOT NULL DEFAULT 0,
      status         TEXT    NOT NULL DEFAULT 'New',
      source         TEXT    NOT NULL DEFAULT 'Website',
      ip_hash        TEXT,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
    CREATE INDEX IF NOT EXISTS idx_leads_status     ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_lead_id    ON leads(lead_id);

    CREATE TABLE IF NOT EXISTS rate_limits (
      bucket   TEXT    NOT NULL,
      window_start INTEGER NOT NULL,
      count    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (bucket, window_start)
    );
  `);
}

/* ---------- ID generator: KP-2026-0001 ---------- */
function nextLeadId(database, now = new Date()) {
  const year = now.getFullYear();
  const prefix = `KP-${year}-`;
  const row = database
    .prepare("SELECT lead_id FROM leads WHERE lead_id LIKE ? ORDER BY id DESC LIMIT 1")
    .get(`${prefix}%`);

  let seq = 1;
  if (row) {
    const tail = String(row.lead_id).split('-').pop();
    const parsed = parseInt(tail, 10);
    if (!Number.isNaN(parsed)) seq = parsed + 1;
  }
  return prefix + String(seq).padStart(4, '0');
}

/* ---------- Insert lead ---------- */
function insertLead(data) {
  const database = getDb();
  const leadId = nextLeadId(database);

  database.prepare(`
    INSERT INTO leads
      (lead_id, name, phone, email, company, building_type, service,
       location, message, contact_method, consent, status, source, ip_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', ?, ?)
  `).run(
    leadId,
    data.name,
    data.phone,
    data.email,
    data.company || null,
    data.building_type || null,
    data.service,
    data.location,
    data.message || null,
    data.contact_method || null,
    data.consent ? 1 : 0,
    data.source || 'Website',
    data.ip_hash || null
  );

  return getLeadByLeadId(leadId);
}

function getLeadByLeadId(leadId) {
  return getDb().prepare('SELECT * FROM leads WHERE lead_id = ?').get(leadId);
}

function getLeadById(id) {
  return getDb().prepare('SELECT * FROM leads WHERE id = ?').get(id);
}

/* ---------- Queries for bot commands ---------- */
function getLatestLeads(limit = 5) {
  return getDb().prepare('SELECT * FROM leads ORDER BY id DESC LIMIT ?').all(limit);
}

function getTodayLeads() {
  return getDb().prepare(
    "SELECT * FROM leads WHERE date(created_at) = date('now') ORDER BY id DESC"
  ).all();
}

function getLeadStats() {
  const database = getDb();
  const total = database.prepare('SELECT COUNT(*) AS c FROM leads').get().c;
  const today = database.prepare(
    "SELECT COUNT(*) AS c FROM leads WHERE date(created_at) = date('now')"
  ).get().c;
  const byService = database.prepare(
    'SELECT service, COUNT(*) AS c FROM leads GROUP BY service ORDER BY c DESC'
  ).all();
  const byStatus = database.prepare(
    'SELECT status, COUNT(*) AS c FROM leads GROUP BY status ORDER BY c DESC'
  ).all();
  return { total, today, byService, byStatus };
}

function searchLeads(query) {
  const q = `%${query}%`;
  return getDb().prepare(
    `SELECT * FROM leads
     WHERE lead_id LIKE ? OR name LIKE ? OR phone LIKE ?
     ORDER BY id DESC LIMIT 5`
  ).all(q, q, q);
}

function getLeadsForExport(limit = 500) {
  return getDb().prepare(
    'SELECT * FROM leads ORDER BY id DESC LIMIT ?'
  ).all(limit);
}

const VALID_STATUSES = ['New', 'Contacted', 'Qualified', 'In Progress', 'Converted', 'Closed'];

function updateLeadStatus(leadId, status) {
  if (!VALID_STATUSES.includes(status)) return null;
  const database = getDb();
  const res = database.prepare(
    "UPDATE leads SET status = ?, updated_at = datetime('now') WHERE lead_id = ?"
  ).run(status, leadId);
  if (res.changes === 0) return null;
  return getLeadByLeadId(leadId);
}

/* ---------- Simple rate limiting (DB-backed) ---------- */
function checkRateLimit(bucket, limit, windowSeconds) {
  const database = getDb();
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);

  const row = database
    .prepare('SELECT count FROM rate_limits WHERE bucket = ? AND window_start = ?')
    .get(bucket, windowStart);

  if (!row) {
    database.prepare(
      'INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, 1)'
    ).run(bucket, windowStart);
    return true;
  }

  if (row.count >= limit) return false;

  database.prepare(
    'UPDATE rate_limits SET count = count + 1 WHERE bucket = ? AND window_start = ?'
  ).run(bucket, windowStart);
  return true;
}

module.exports = {
  getDb,
  insertLead,
  getLeadByLeadId,
  getLeadById,
  getLatestLeads,
  getTodayLeads,
  getLeadStats,
  searchLeads,
  getLeadsForExport,
  updateLeadStatus,
  checkRateLimit,
  VALID_STATUSES
};
