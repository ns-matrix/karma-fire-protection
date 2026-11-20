/* ============================================
   SERVER-SIDE VALIDATION & SANITISATION
   Never trust frontend input.
   ============================================ */
'use strict';

const PATTERNS = {
  name: /^[A-Za-z][A-Za-z .'\-]{1,60}$/,
  phone: /^\+?[0-9][0-9 \-]{6,18}[0-9]$/,
  email: /^[^\s@]{1,64}@[^\s@]{1,190}\.[A-Za-z]{2,20}$/
};

const ALLOWED_SERVICES = [
  'Fire Hydrant System',
  'Fire Alarm System',
  'Fire Sprinkler System',
  'Fire Suppression System',
  'Installation',
  'Maintenance',
  'Inspection',
  'Other'
];

const ALLOWED_BUILDING_TYPES = [
  'Commercial Building',
  'Industrial / Factory',
  'Residential Society',
  'Hospital / Healthcare',
  'Hotel / Restaurant',
  'Warehouse / Logistics',
  'Educational Institution',
  'Other'
];

const ALLOWED_CONTACT_METHODS = ['Phone Call', 'WhatsApp', 'Email'];

/* Strip control chars, collapse whitespace, trim, cap length */
function clean(value, maxLen) {
  if (typeof value !== 'string') return '';
  const out = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return out.slice(0, maxLen);
}

/* Escape for Telegram HTML parse mode */
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function validateLead(raw) {
  const errors = [];

  const name = clean(raw.name, 60);
  const phoneRaw = clean(raw.phone, 25);
  const phone = phoneRaw.replace(/[\s\-]/g, '');
  const email = clean(raw.email, 100).toLowerCase();
  const company = clean(raw.company, 80);
  const buildingType = clean(raw.building_type, 60);
  const service = clean(raw.service, 60);
  const location = clean(raw.location, 120);
  const message = clean(raw.message, 2000);
  const contactMethod = clean(raw.contact_method, 20);
  const consent = raw.consent === true || raw.consent === 'yes' || raw.consent === 'true' || raw.consent === 1;

  if (!name || !PATTERNS.name.test(name)) errors.push({ field: 'name', message: 'Please enter a valid name.' });
  if (!phone || !PATTERNS.phone.test(phone) || phone.replace(/\D/g, '').length < 7 || phone.replace(/\D/g, '').length > 15) {
    errors.push({ field: 'phone', message: 'Please enter a valid phone number.' });
  }
  if (!email || !PATTERNS.email.test(email)) errors.push({ field: 'email', message: 'Please enter a valid email address.' });
  if (!service || !ALLOWED_SERVICES.includes(service)) errors.push({ field: 'service', message: 'Please choose a valid service.' });
  if (!location || location.length < 3) errors.push({ field: 'location', message: 'Please enter the project location.' });
  if (buildingType && !ALLOWED_BUILDING_TYPES.includes(buildingType)) {
    errors.push({ field: 'building_type', message: 'Please choose a valid building type.' });
  }
  if (contactMethod && !ALLOWED_CONTACT_METHODS.includes(contactMethod)) {
    errors.push({ field: 'contact_method', message: 'Please choose a valid contact method.' });
  }
  if (!consent) errors.push({ field: 'consent', message: 'Consent is required to be contacted.' });

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    data: {
      name,
      phone,
      email,
      company: company || null,
      building_type: buildingType || null,
      service,
      location,
      message: message || null,
      contact_method: contactMethod || 'Phone Call',
      consent: true,
      source: clean(raw.source, 80) || 'Website'
    }
  };
}

module.exports = { validateLead, clean, escapeHtml, ALLOWED_SERVICES };
