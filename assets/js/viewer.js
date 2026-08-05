/**
 * viewer.js
 * ---------------------------------------------------------------------------
 * Renders code as individually generated line elements (rather than one
 * plain <pre> text block) and applies a set of client-side measures that
 * discourage casual copying: disabled selection, blocked context menu,
 * blocked copy/cut/drag shortcuts, and a short warning toast.
 *
 * IMPORTANT — Honesty about limits:
 * These are UX deterrents only. Any determined user can still read the
 * screen, take a screenshot, use the browser dev tools, or transcribe the
 * code by hand. This file does NOT claim to make copying impossible, and
 * nothing here should be represented to users as unbreakable protection.
 * ---------------------------------------------------------------------------
 */

// ---- Minimal per-language tokenizer for visual syntax highlighting -------
// This is intentionally lightweight (regex-based) rather than pulling in a
// full highlighting engine, since the code is rendered token-by-token into
// custom DOM nodes anyway (not as a single selectable text blob).
const LANGUAGE_KEYWORDS = {
  c: ['int','char','float','double','void','if','else','for','while','do','return','struct','typedef','include','define','switch','case','break','continue','sizeof','static','const','unsigned','signed','long','short'],
  cpp: ['int','char','float','double','void','if','else','for','while','do','return','class','struct','public','private','protected','namespace','using','template','new','delete','try','catch','include','const','static','virtual','override','std','cout','cin'],
  java: ['public','private','protected','class','static','void','int','double','float','boolean','char','if','else','for','while','do','return','new','import','package','extends','implements','try','catch','finally','interface','this','super'],
  python: ['def','class','if','elif','else','for','while','return','import','from','as','with','try','except','finally','pass','break','continue','lambda','yield','None','True','False','and','or','not','in','is','self'],
  javascript: ['function','const','let','var','if','else','for','while','return','class','import','export','from','new','try','catch','finally','async','await','this','typeof','instanceof','null','undefined','true','false'],
  html: ['html','head','body','div','span','script','style','link','meta','title','href','src','class','id'],
  css: ['color','background','margin','padding','display','flex','grid','border','width','height','font','position','top','left','right','bottom'],
  php: ['<?php','function','if','else','elseif','foreach','for','while','return','class','public','private','protected','echo','print','require','include','new','static','$this','array'],
  sql: ['select','insert','update','delete','from','where','join','inner','left','right','outer','on','group','by','order','having','create','table','alter','drop','into','values','and','or','not','null','primary','key','foreign','references'],
  linux: ['sudo','apt','yum','cd','ls','mkdir','rm','cp','mv','chmod','chown','grep','find','echo','export','if','then','else','fi','for','do','done','while']
};

function tokenizeLine(line, lang) {
  const keywords = LANGUAGE_KEYWORDS[lang] || [];

  // Split off a trailing line comment first, working on the RAW (unescaped)
  // text so we never confuse a comment marker with escaped HTML entities.
  const commentPatterns = {
    c: /\/\/.*$/, cpp: /\/\/.*$/, java: /\/\/.*$/, javascript: /\/\/.*$/,
    python: /#.*$/, linux: /#.*$/, sql: /--.*$/, php: /(\/\/|#).*$/,
    html: null, css: null
  };
  const cPattern = commentPatterns[lang];
  let codePart = line;
  let commentPart = '';
  if (cPattern) {
    const m = line.match(cPattern);
    if (m) {
      codePart = line.slice(0, m.index);
      commentPart = line.slice(m.index);
    }
  }

  // Tokenize strings/numbers/keywords/function-calls in a SINGLE pass over
  // the raw text. This is important: doing sequential .replace() calls (the
  // old approach) re-scans text that already contains injected HTML from a
  // previous step, which can accidentally match keyword text sitting inside
  // that HTML (e.g. the word "class" inside a class="tok-str" attribute) and
  // corrupt the output. Matching once, left-to-right, on the original text
  // avoids that entirely.
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const groups = [];
  if (keywords.length) groups.push('(?<kw>\\b(?:' + keywords.map(escRe).join('|') + ')\\b)');
  groups.push('(?<str>"[^"]*"|\'[^\']*\')');
  groups.push('(?<num>\\b\\d+\\.?\\d*\\b)');
  groups.push('(?<fn>\\b[A-Za-z_][A-Za-z0-9_]*\\b(?=\\())');
  const tokenRe = new RegExp(groups.join('|'), 'g');

  let out = '';
  let lastIndex = 0;
  let match;
  while ((match = tokenRe.exec(codePart)) !== null) {
    out += escapeHtml(codePart.slice(lastIndex, match.index));
    const g = match.groups || {};
    if (g.kw) out += '<span class="tok-kw">' + escapeHtml(g.kw) + '</span>';
    else if (g.str) out += '<span class="tok-str">' + escapeHtml(g.str) + '</span>';
    else if (g.num) out += '<span class="tok-num">' + escapeHtml(g.num) + '</span>';
    else if (g.fn) out += '<span class="tok-fn">' + escapeHtml(g.fn) + '</span>';
    lastIndex = tokenRe.lastIndex;
    if (match.index === tokenRe.lastIndex) tokenRe.lastIndex++; // guard against zero-length matches
  }
  out += escapeHtml(codePart.slice(lastIndex));

  if (commentPart) {
    out += '<span class="tok-com">' + escapeHtml(commentPart) + '</span>';
  }
  return out;
}

/**
 * Render `code` inside `containerEl` as individually generated line nodes.
 * @param {HTMLElement} containerEl
 * @param {string} code
 * @param {string} language
 */
function renderProtectedCode(containerEl, code, language) {
  containerEl.innerHTML = '';
  const lines = (code || '').replace(/\r\n/g, '\n').split('\n');

  const frag = document.createDocumentFragment();
  lines.forEach((line, idx) => {
    const row = document.createElement('div');
    row.className = 'code-line';

    const lineNo = document.createElement('span');
    lineNo.className = 'line-no';
    lineNo.textContent = String(idx + 1);

    const content = document.createElement('span');
    content.className = 'line-content';
    content.innerHTML = tokenizeLine(line, language) || '&nbsp;';

    row.appendChild(lineNo);
    row.appendChild(content);
    frag.appendChild(row);
  });
  containerEl.appendChild(frag);

  applyViewerProtections(containerEl);
}

/** Show the small "action blocked" toast. */
function flashCopyToast(message) {
  let toast = document.getElementById('copyToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'copyToast';
    toast.className = 'copy-toast';
    toast.innerHTML = '<i class="bi bi-shield-lock"></i><span class="msg"></span>';
    document.body.appendChild(toast);
  }
  toast.querySelector('.msg').textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

/**
 * Attach copy-discouragement listeners to a given viewer element.
 * Applied per-viewer so multiple viewers on a page (unlikely) stay isolated.
 */
function applyViewerProtections(viewerEl) {
  if (viewerEl._protected) return; // avoid double-binding
  viewerEl._protected = true;

  const block = (e, msg) => {
    e.preventDefault();
    e.stopPropagation();
    flashCopyToast(msg || 'That action is disabled on this viewer.');
    return false;
  };

  viewerEl.addEventListener('contextmenu', (e) => block(e, 'Right-click is disabled here.'));
  viewerEl.addEventListener('copy', (e) => block(e, 'Copying is disabled on this viewer.'));
  viewerEl.addEventListener('cut', (e) => block(e, 'Cutting is disabled on this viewer.'));
  viewerEl.addEventListener('dragstart', (e) => block(e, 'Dragging code out isn\u2019t allowed.'));
  viewerEl.addEventListener('drop', (e) => block(e, 'Dropping content here isn\u2019t allowed.'));
  viewerEl.addEventListener('selectstart', (e) => block(e));

  viewerEl.addEventListener('keydown', (e) => {
    const key = e.key ? e.key.toLowerCase() : '';
    const ctrlOrCmd = e.ctrlKey || e.metaKey;
    if (ctrlOrCmd && ['c', 'a', 'x', 'u', 's', 'p'].includes(key)) {
      block(e, 'Keyboard shortcut disabled on the code viewer.');
    }
    // PrintScreen can't be reliably blocked by JS — intentionally not claimed.
  });
}

/**
 * Global, page-wide protections (in addition to per-viewer ones) so that
 * shortcuts don't work even if focus is outside the viewer element while a
 * protected code page is open. Only call this on pages that show code.
 */
function applyGlobalViewerProtections() {
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.protected-viewer')) {
      e.preventDefault();
      flashCopyToast('Right-click is disabled here.');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!document.querySelector('.protected-viewer')) return;
    const key = e.key ? e.key.toLowerCase() : '';
    const ctrlOrCmd = e.ctrlKey || e.metaKey;
    if (ctrlOrCmd && ['c', 'a', 'x', 'u', 's'].includes(key)) {
      e.preventDefault();
      flashCopyToast('Keyboard shortcut disabled on the code viewer.');
    }
  });
}
