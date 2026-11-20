/* ============================================
   TELEGRAM: notifications + admin bot
   All secrets come from environment variables.
   ============================================ */
'use strict';

const db = require('./db');
const { escapeHtml } = require('./validate');

const TOKEN = process.env.TLEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const ADMIN_IDS = String(process.env.ADMIN_TELEGRAM_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const API = `https://api.telegram.org/bot${TOKEN}`;

const HELP_TEXT = `🔧 <b>Karma Lead Bot — Commands</b>

/latest — show the latest website leads
/leads — lead summary with status counts
/stats — totals and service-interest breakdown
/today — leads received today
/search &lt;query&gt; — search by name, phone or Lead ID
/status &lt;LeadID&gt; &lt;Status&gt; — update a lead status
/export — download leads as CSV
/settings — bot configuration (no secrets shown)
/help — this message`;

const STATUSES = db.VALID_STATUSES;

/* ---------- Low-level API ---------- */
async function tg(method, payload) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    console.warn(`Telegram ${method} failed:`, data.description || res.status);
  }
  return data;
}

async function sendMessage(chatId, text, extra = {}) {
  return tg('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...extra
  });
}

function isAdmin(userId) {
  return ADMIN_IDS.includes(String(userId));
}

/* ---------- New lead notification ---------- */
async function notifyNewLead(lead) {
  if (!TOKEN || !CHAT_ID) {
    console.warn('Telegram not configured — lead saved but not notified.');
    return { ok: false, reason: 'not_configured' };
  }

  const text = [
    '🚨 <b>NEW WEBSITE LEAD</b>',
    '',
    `👤 Name: <b>${escapeHtml(lead.name)}</b>`,
    `📱 Phone: <b>${escapeHtml(lead.phone)}</b>`,
    `📧 Email: ${escapeHtml(lead.email)}`,
    `🏢 Company: ${escapeHtml(lead.company || '—')}`,
    `🏗 Building Type: ${escapeHtml(lead.building_type || '—')}`,
    '',
    '🔥 Interested Service:',
    `<b>${escapeHtml(lead.service)}</b>`,
    '',
    '📍 Project Location:',
    `<b>${escapeHtml(lead.location)}</b>`,
    '',
    `📝 Requirements: ${escapeHtml(lead.message || '—')}`,
    `📞 Preferred Contact: ${escapeHtml(lead.contact_method || '—')}`,
    '',
    `🕒 Submitted At: ${escapeHtml(lead.created_at)} (UTC)`,
    '🌐 Source: Karma Fire Protection Website',
    `🆔 Lead ID: <b>${escapeHtml(lead.lead_id)}</b>`
  ].join('\n');

  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Mark Contacted', callback_data: `st:${lead.lead_id}:Contacted` },
        { text: '⭐ Mark Qualified', callback_data: `st:${lead.lead_id}:Qualified` }
      ],
      [
        { text: '🚀 Mark Converted', callback_data: `st:${lead.lead_id}:Converted` },
        { text: '❌ Close Lead', callback_data: `st:${lead.lead_id}:Closed` }
      ]
    ]
  };

  return sendMessage(CHAT_ID, text, { reply_markup: keyboard });
}

/* ---------- Lead formatting helpers ---------- */
function formatLeadRow(l) {
  return (
    `🆔 <b>${escapeHtml(l.lead_id)}</b> — ${escapeHtml(l.name)}\n` +
    `📱 ${escapeHtml(l.phone)} | 📧 ${escapeHtml(l.email)}\n` +
    `🔥 ${escapeHtml(l.service)} | 📍 ${escapeHtml(l.location)}\n` +
    `📌 Status: <b>${escapeHtml(l.status)}</b> | 🕒 ${escapeHtml(l.created_at)}`
  );
}

function formatStats(stats) {
  const lines = [
    '📊 <b>LEAD STATISTICS</b>',
    '',
    `Total leads: <b>${stats.total}</b>`,
    `Today: <b>${stats.today}</b>`,
    '',
    '🔥 By service:'
  ];
  stats.byService.forEach((s) => lines.push(`   • ${escapeHtml(s.service || 'Unknown')}: ${s.c}`));
  lines.push('', '📌 By status:');
  stats.byStatus.forEach((s) => lines.push(`   • ${escapeHtml(s.status)}: ${s.c}`));
  return lines.join('\n');
}

function toCsv(rows) {
  const cols = ['lead_id', 'name', 'phone', 'email', 'company', 'building_type', 'service', 'location', 'message', 'contact_method', 'status', 'source', 'created_at'];
  const esc = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.join(',');
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n');
  return `${head}\n${body}`;
}

/* ---------- Callback query (inline buttons) ---------- */
async function handleCallbackQuery(query) {
  const userId = query.from && query.from.id;
  const chatId = query.message && query.message.chat.id;

  if (!isAdmin(userId)) {
    await tg('answerCallbackQuery', {
      callback_query_id: query.id,
      text: '⛔ You are not authorised.',
      show_alert: true
    });
    return;
  }

  const data = String(query.data || '');
  const [action, leadId, status] = data.split(':');

  if (action === 'st' && leadId && status) {
    const updated = db.updateLeadStatus(leadId, status);
    await tg('answerCallbackQuery', {
      callback_query_id: query.id,
      text: updated ? `${leadId} → ${status}` : 'Lead not found',
      show_alert: !updated
    });
    if (updated && chatId) {
      await sendMessage(
        chatId,
        `✅ Lead <b>${escapeHtml(leadId)}</b> updated to <b>${escapeHtml(status)}</b>\n👤 ${escapeHtml(updated.name)}`
      );
    }
  } else {
    await tg('answerCallbackQuery', { callback_query_id: query.id, text: 'Unknown action.' });
  }
}

/* ---------- Command handler ---------- */
async function handleCommand(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from && msg.from.id;
  const text = String(msg.text || '').trim();
  const [cmd, ...rest] = text.split(/\s+/);
  const arg = rest.join(' ').trim();

  // Only respond in private chats
  if (msg.chat.type !== 'private') return;

  if (cmd === '/start' || cmd === '/help') {
    await sendMessage(
      chatId,
      `👋 <b>Welcome to the Karma Lead Bot</b>\n\n` +
        `This bot notifies you about website enquiries and lets you manage leads.\n\n${HELP_TEXT}`
    );
    return;
  }

  // Everything else requires admin
  if (!isAdmin(userId)) {
    await sendMessage(chatId, '⛔ Access denied. This bot is restricted to authorised administrators.');
    return;
  }

  switch (cmd) {
    case '/latest': {
      const leads = db.getLatestLeads(5);
      if (!leads.length) return sendMessage(chatId, '📭 No leads yet.');
      await sendMessage(
        chatId,
        `🆕 <b>LATEST ${leads.length} LEADS</b>\n\n` + leads.map(formatLeadRow).join('\n\n—\n\n')
      );
      break;
    }

    case '/leads': {
      const stats = db.getLeadStats();
      const recent = db.getLatestLeads(5);
      await sendMessage(
        chatId,
        `📋 <b>LEAD SUMMARY</b>\n\nTotal: <b>${stats.total}</b> | Today: <b>${stats.today}</b>\n\n` +
          (recent.length ? recent.map((l) => `• ${escapeHtml(l.lead_id)} — ${escapeHtml(l.name)} (${escapeHtml(l.status)})`).join('\n') : 'No leads yet.')
      );
      break;
    }

    case '/stats': {
      await sendMessage(chatId, formatStats(db.getLeadStats()));
      break;
    }

    case '/today': {
      const leads = db.getTodayLeads();
      if (!leads.length) return sendMessage(chatId, '📭 No leads received today.');
      await sendMessage(
        chatId,
        `📅 <b>TODAY'S LEADS (${leads.length})</b>\n\n` + leads.map(formatLeadRow).join('\n\n—\n\n')
      );
      break;
    }

    case '/search': {
      if (!arg) return sendMessage(chatId, 'Usage: <code>/search &lt;name | phone | LeadID&gt;</code>');
      const leads = db.searchLeads(arg);
      if (!leads.length) return sendMessage(chatId, '🔍 No matches found.');
      await sendMessage(
        chatId,
        `🔍 <b>SEARCH RESULTS (${leads.length})</b>\n\n` + leads.map(formatLeadRow).join('\n\n—\n\n')
      );
      break;
    }

    case '/status': {
      const [leadId, status] = arg.split(/\s+/);
      if (!leadId || !status) {
        return sendMessage(
          chatId,
          `Usage: <code>/status &lt;LeadID&gt; &lt;Status&gt;</code>\nValid statuses: ${STATUSES.join(', ')}`
        );
      }
      const titleCase = STATUSES.find((s) => s.toLowerCase() === status.toLowerCase());
      if (!titleCase) {
        return sendMessage(chatId, `⚠️ Invalid status. Valid: ${STATUSES.join(', ')}`);
      }
      const updated = db.updateLeadStatus(leadId.trim(), titleCase);
      if (!updated) return sendMessage(chatId, `⚠️ Lead ${escapeHtml(leadId)} not found.`);
      await sendMessage(chatId, `✅ <b>${escapeHtml(updated.lead_id)}</b> → <b>${titleCase}</b>`);
      break;
    }

    case '/export': {
      const rows = db.getLeadsForExport(500);
      if (!rows.length) return sendMessage(chatId, '📭 Nothing to export.');
      const csv = toCsv(rows);
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('document', blob, `karma-leads-${Date.now()}.csv`);
      form.append('caption', `📊 ${rows.length} leads exported`);
      const res = await fetch(`${API}/sendDocument`, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) await sendMessage(chatId, '⚠️ Could not send the file. Try again later.');
      break;
    }

    case '/settings': {
      await sendMessage(
        chatId,
        [
          '⚙️ <b>BOT CONFIGURATION</b>',
          '',
          `Notifications chat configured: <b>${CHAT_ID ? 'Yes' : 'No'}</b>`,
          `Authorised admin IDs: <b>${ADMIN_IDS.length}</b>`,
          `Database: <b>SQLite (leads.db)</b>`,
          '',
          '🔒 Secrets are never shown or exposed.'
        ].join('\n')
      );
      break;
    }

    default:
      await sendMessage(chatId, `❓ Unknown command.\n\n${HELP_TEXT}`);
  }
}

/* ---------- Long-polling loop ---------- */
let polling = false;
let offset = 0;

async function poll() {
  if (!TOKEN || polling) return;
  polling = true;

  while (polling) {
    try {
      const res = await fetch(`${API}/getUpdates?timeout=25&offset=${offset}`, {
        signal: AbortSignal.timeout(40000)
      });
      const data = await res.json();
      if (!data.ok) {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }

      for (const update of data.result) {
        offset = update.update_id + 1;
        try {
          if (update.callback_query) {
            await handleCallbackQuery(update.callback_query);
          } else if (update.message && update.message.text) {
            await handleCommand(update.message);
          }
        } catch (err) {
          console.error('Update handling error:', err.message);
        }
      }
    } catch (err) {
      console.error('Polling error:', err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

function startBot() {
  if (!TOKEN) {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN not set — notifications and bot are disabled.');
    return;
  }
  if (!ADMIN_IDS.length) {
    console.warn('⚠️  ADMIN_TELEGRAM_IDS not set — bot commands will be denied for everyone.');
  }
  console.log('🤖 Telegram bot polling started.');
  poll().catch((e) => console.error('Bot crashed:', e));
}

function stopBot() {
  polling = false;
}

module.exports = { notifyNewLead, startBot, stopBot, isAdmin, tg };
