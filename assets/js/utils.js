/**
 * utils.js — shared helpers used across auth/admin/student pages.
 */

/** Supported languages shown in dropdowns, with a CodeMirror mode + badge color hint. */
const SUPPORTED_LANGUAGES = [
  { value: 'c',          label: 'C',          cmMode: 'text/x-csrc' },
  { value: 'cpp',        label: 'C++',        cmMode: 'text/x-c++src' },
  { value: 'python',     label: 'Python',     cmMode: 'python' },
  { value: 'java',       label: 'Java',       cmMode: 'text/x-java' },
  { value: 'javascript', label: 'JavaScript', cmMode: 'javascript' },
  { value: 'html',       label: 'HTML',       cmMode: 'htmlmixed' },
  { value: 'css',        label: 'CSS',        cmMode: 'css' },
  { value: 'php',        label: 'PHP',        cmMode: 'application/x-httpd-php' },
  { value: 'sql',        label: 'SQL',        cmMode: 'sql' },
  { value: 'linux',      label: 'Linux / Shell', cmMode: 'shell' }
];

function getLanguageMeta(value) {
  return SUPPORTED_LANGUAGES.find((l) => l.value === value) || SUPPORTED_LANGUAGES[0];
}

/** Escape HTML so user code/text can never break out of markup. */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function debounce(fn, delay = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

/** Small toast notification system used across dashboards (not the copy-block toast). */
function showAppToast(message, type = 'info') {
  let holder = document.getElementById('appToastHolder');
  if (!holder) {
    holder = document.createElement('div');
    holder.id = 'appToastHolder';
    holder.style.position = 'fixed';
    holder.style.top = '18px';
    holder.style.right = '18px';
    holder.style.zIndex = '3000';
    holder.style.display = 'flex';
    holder.style.flexDirection = 'column';
    holder.style.gap = '10px';
    document.body.appendChild(holder);
  }
  const colors = {
    info: { bg: '#171e2c', border: '#232b3a', text: '#e7ecf3' },
    success: { bg: '#12261f', border: '#2fd9a3', text: '#bdf5e2' },
    error: { bg: '#2a1418', border: '#ef5566', text: '#ffd7dc' }
  };
  const c = colors[type] || colors.info;
  const el = document.createElement('div');
  el.textContent = message;
  el.style.background = c.bg;
  el.style.border = `1px solid ${c.border}`;
  el.style.color = c.text;
  el.style.padding = '12px 16px';
  el.style.borderRadius = '10px';
  el.style.fontSize = '0.86rem';
  el.style.boxShadow = '0 10px 30px rgba(0,0,0,0.4)';
  el.style.minWidth = '240px';
  el.style.opacity = '0';
  el.style.transform = 'translateY(-8px)';
  el.style.transition = 'opacity .2s ease, transform .2s ease';
  holder.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
  });
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-8px)';
    setTimeout(() => el.remove(), 200);
  }, 3200);
}

/** Friendly error message extractor for Supabase errors. */
function friendlyError(err) {
  if (!err) return 'Something went wrong. Please try again.';
  if (typeof err === 'string') return err;
  return err.message || 'Something went wrong. Please try again.';
}
