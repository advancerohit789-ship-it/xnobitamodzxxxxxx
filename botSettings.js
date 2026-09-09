const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'bot-settings.json');
const DEFAULTS = {
  prefix: '.',
  botMode: 'public',
  automation: { autotyping: false, autoread: false, autostoryview: false },
  autoreact: false,
  groups: { antilink: {}, antigm: {}, antisticker: {}, welcome: {}, goodbye: {}, warnings: {} }
};

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '{}');
}
function cleanId(id) {
  return String(id || '').split(':')[0].replace(/[^0-9]/g, '');
}
function keyFor(botJid) {
  const k = cleanId(botJid);
  return k || 'unknown';
}
function cloneDefaults() { return JSON.parse(JSON.stringify(DEFAULTS)); }
function loadAll() {
  ensure();
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch { return {}; }
}
function saveAll(data) { ensure(); fs.writeFileSync(FILE, JSON.stringify(data, null, 2)); }
function get(botJid) {
  const all = loadAll();
  const key = keyFor(botJid);
  const current = all[key] || {};
  const d = cloneDefaults();
  const value = {
    ...d,
    ...current,
    automation: { ...d.automation, ...(current.automation || {}) },
    groups: { ...d.groups, ...(current.groups || {}) }
  };
  all[key] = value;
  saveAll(all);
  return value;
}
function update(botJid, updater) {
  const all = loadAll();
  const key = keyFor(botJid);
  const current = get(botJid);
  const next = typeof updater === 'function' ? updater(current) || current : { ...current, ...updater };
  all[key] = next;
  saveAll(all);
  return next;
}
function group(botJid, type) {
  const s = get(botJid);
  if (!s.groups[type]) s.groups[type] = {};
  return s.groups[type];
}
function setGroup(botJid, type, jid, value) {
  return update(botJid, s => {
    if (!s.groups[type]) s.groups[type] = {};
    if (value === undefined || value === false || value === null) delete s.groups[type][jid];
    else s.groups[type][jid] = value;
    return s;
  });
}

module.exports = { get, update, group, setGroup, keyFor };
