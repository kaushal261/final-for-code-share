/**
 * student.js — controls the Student Dashboard SPA (dashboard-student.html).
 * Students have read-only access: RLS in sql/schema.sql allows SELECT on
 * subjects/folders/code_files to any authenticated user, but blocks
 * INSERT/UPDATE/DELETE unless the profile role is 'admin'.
 */

let studentProfile = null;
let allSubjects = [];
let drillState = { subjectId: null, folderId: null }; // navigation state within Subjects view

(async function init() {
  studentProfile = await guardRoute('student');
  if (!studentProfile) return;

  document.getElementById('welcomeHeading').textContent = `Welcome, ${studentProfile.full_name || 'Student'} 👋`;
  document.getElementById('studentNameTag').innerHTML = `<i class="bi bi-mortarboard-fill me-1"></i>${escapeHtml(studentProfile.full_name || 'Student')}`;
  document.getElementById('settingsInfo').textContent = `Signed in as ${studentProfile.email}`;

  bindLogoutButtons();
  bindSidebarNav();
  bindMobileSidebar();
  populateLanguageSelects();
  applyGlobalViewerProtections();

  await loadStats();
  await loadSubjectsList();

  document.getElementById('quickSearchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const term = e.target.value.trim();
      navigateTo('search');
      document.getElementById('searchKeyword').value = term;
      runSearch();
    }
  });

  document.getElementById('searchGoBtn').addEventListener('click', runSearch);
  document.getElementById('changePasswordForm').addEventListener('submit', handlePasswordChange);

  navigateTo(location.hash ? location.hash.slice(1) : 'dashboard');
})();

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
const VIEW_TITLES = { dashboard: 'Dashboard', subjects: 'Subjects', search: 'Search', settings: 'Settings', code: 'Code Viewer' };

function bindSidebarNav() {
  document.querySelectorAll('.sidebar-nav .nav-link[data-view]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(link.dataset.view);
      closeMobileSidebar();
    });
  });
}

function navigateTo(view) {
  if (!VIEW_TITLES[view]) view = 'dashboard';
  document.querySelectorAll('.view-section').forEach((s) => s.classList.add('d-none'));
  document.getElementById('view-' + view).classList.remove('d-none');
  document.querySelectorAll('.sidebar-nav .nav-link[data-view]').forEach((l) => {
    l.classList.toggle('active', l.dataset.view === view);
  });
  document.getElementById('pageTitle').textContent = VIEW_TITLES[view];
  history.replaceState(null, '', '#' + view);

  if (view === 'subjects') {
    drillState = { subjectId: null, folderId: null };
    renderSubjectsPane();
  }
}

function bindMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    sidebar.classList.toggle('open');
    backdrop.classList.toggle('show');
  });
  backdrop.addEventListener('click', closeMobileSidebar);
}
function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('show');
}

function populateLanguageSelects() {
  const opts = SUPPORTED_LANGUAGES.map((l) => `<option value="${l.value}">${l.label}</option>`).join('');
  document.getElementById('searchLanguage').innerHTML += opts;
}

// ---------------------------------------------------------------------------
// Dashboard stats
// ---------------------------------------------------------------------------
async function loadStats() {
  const [{ count: subjCount }, { count: fileCount }] = await Promise.all([
    window.sbClient.from('subjects').select('*', { count: 'exact', head: true }),
    window.sbClient.from('code_files').select('*', { count: 'exact', head: true })
  ]);
  document.getElementById('statSubjects').textContent = subjCount ?? 0;
  document.getElementById('statFiles').textContent = fileCount ?? 0;
}

// ---------------------------------------------------------------------------
// Subjects -> Folders -> Files drill-down
// ---------------------------------------------------------------------------
async function loadSubjectsList() {
  const { data, error } = await window.sbClient.from('subjects').select('*').order('name');
  if (error) { showAppToast(friendlyError(error), 'error'); return; }
  allSubjects = data || [];
  const opts = allSubjects.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  document.getElementById('searchSubject').innerHTML += opts;
}

function renderBreadcrumb() {
  const crumb = document.getElementById('subjectsBreadcrumb');
  const parts = [`<a href="#" onclick="drillState={subjectId:null,folderId:null};renderSubjectsPane();return false;">Subjects</a>`];
  if (drillState.subjectId) {
    const subj = allSubjects.find((s) => s.id === drillState.subjectId);
    parts.push(`<a href="#" onclick="drillState.folderId=null;renderSubjectsPane();return false;">${escapeHtml(subj?.name || '')}</a>`);
  }
  crumb.innerHTML = parts.join('<span class="sep">/</span>');
}

async function renderSubjectsPane() {
  renderBreadcrumb();
  const pane = document.getElementById('subjectsPane');
  pane.innerHTML = `<div class="col-12"><div class="skeleton" style="height:80px;"></div></div>`;

  if (!drillState.subjectId) {
    // Show subjects
    if (!allSubjects.length) {
      pane.innerHTML = `<div class="col-12"><div class="empty-state"><i class="bi bi-collection"></i>No subjects have been added yet.</div></div>`;
      return;
    }
    pane.innerHTML = allSubjects.map((s) => `
      <div class="col-md-6 col-lg-4">
        <div class="entity-card fade-in-up" onclick="drillState.subjectId='${s.id}';renderSubjectsPane();">
          <div class="entity-icon"><i class="bi bi-collection-fill"></i></div>
          <div class="entity-title">${escapeHtml(s.name)}</div>
          <div class="entity-meta">${escapeHtml(s.description || 'Tap to open')}</div>
        </div>
      </div>
    `).join('');
    return;
  }

  const { data: folders, error } = await window.sbClient
    .from('folders').select('*').eq('subject_id', drillState.subjectId).order('name');
  if (error) { pane.innerHTML = `<p class="text-danger small">${friendlyError(error)}</p>`; return; }

  if (!folders.length) {
    pane.innerHTML = `<div class="col-12"><div class="empty-state"><i class="bi bi-folder"></i>No folders in this subject yet.</div></div>`;
    return;
  }
  pane.innerHTML = folders.map((f) => `
    <div class="col-md-6 col-lg-4">
      <div class="entity-card fade-in-up" onclick='openFolder("${f.id}", ${JSON.stringify(f.name).replace(/'/g, "&#39;")})'>
        <div class="entity-icon"><i class="bi bi-folder-fill"></i></div>
        <div class="entity-title">${escapeHtml(f.name)}</div>
        <div class="entity-meta">${escapeHtml(f.description || 'Tap to open')}</div>
      </div>
    </div>
  `).join('');
}

async function openFolder(folderId, folderName) {
  drillState.folderId = folderId;
  const crumb = document.getElementById('subjectsBreadcrumb');
  const subj = allSubjects.find((s) => s.id === drillState.subjectId);
  crumb.innerHTML = `
    <a href="#" onclick="drillState={subjectId:null,folderId:null};renderSubjectsPane();return false;">Subjects</a>
    <span class="sep">/</span>
    <a href="#" onclick="drillState.folderId=null;renderSubjectsPane();return false;">${escapeHtml(subj?.name || '')}</a>
    <span class="sep">/</span>${escapeHtml(folderName)}
  `;

  const pane = document.getElementById('subjectsPane');
  pane.innerHTML = `<div class="col-12"><div class="skeleton" style="height:60px;"></div></div>`;

  const { data: files, error } = await window.sbClient
    .from('code_files').select('id, title, language, description, created_at')
    .eq('folder_id', folderId).order('title');

  if (error) { pane.innerHTML = `<p class="text-danger small">${friendlyError(error)}</p>`; return; }
  if (!files.length) {
    pane.innerHTML = `<div class="col-12"><div class="empty-state"><i class="bi bi-file-earmark-code"></i>No code files in this folder yet.</div></div>`;
    return;
  }

  pane.innerHTML = `<div class="col-12">` + files.map((f) => `
    <div class="code-file-row fade-in-up" onclick="viewCodeFile('${f.id}')">
      <div>
        <div class="cfr-title">${escapeHtml(f.title)}</div>
        <div class="cfr-meta">${escapeHtml(f.description || 'No description')}</div>
      </div>
      <span class="lang-chip"><span class="dot"></span>${escapeHtml(getLanguageMeta(f.language).label)}</span>
    </div>
  `).join('') + `</div>`;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
async function runSearch() {
  const holder = document.getElementById('searchResults');
  holder.innerHTML = `<div class="skeleton" style="height:52px;"></div>`;

  const keyword = document.getElementById('searchKeyword').value.trim();
  const lang = document.getElementById('searchLanguage').value;
  const subjectId = document.getElementById('searchSubject').value;

  let query = window.sbClient
    .from('code_files')
    .select('id, title, language, description, created_at, subjects(name), folders(name)')
    .order('title');

  if (lang) query = query.eq('language', lang);
  if (subjectId) query = query.eq('subject_id', subjectId);
  if (keyword) query = query.or(`title.ilike.%${keyword}%,description.ilike.%${keyword}%,code.ilike.%${keyword}%`);

  const { data, error } = await query;
  if (error) { holder.innerHTML = `<p class="text-danger small">${friendlyError(error)}</p>`; return; }

  if (!data.length) {
    holder.innerHTML = `<div class="empty-state"><i class="bi bi-search"></i>No code files matched your search.</div>`;
    return;
  }

  holder.innerHTML = data.map((f) => `
    <div class="code-file-row fade-in-up" onclick="viewCodeFile('${f.id}')">
      <div>
        <div class="cfr-title">${escapeHtml(f.title)}</div>
        <div class="cfr-meta">${escapeHtml(f.subjects?.name || '—')} / ${escapeHtml(f.folders?.name || '—')}</div>
      </div>
      <span class="lang-chip"><span class="dot"></span>${escapeHtml(getLanguageMeta(f.language).label)}</span>
    </div>
  `).join('');
}

// ---------------------------------------------------------------------------
// Protected code viewer
// ---------------------------------------------------------------------------
async function viewCodeFile(id) {
  const { data: f, error } = await window.sbClient.from('code_files').select('*, subjects(name), folders(name)').eq('id', id).single();
  if (error) { showAppToast(friendlyError(error), 'error'); return; }

  document.getElementById('codeTitle').textContent = f.title;
  document.getElementById('codeDescription').textContent = f.description || 'No description provided.';
  document.getElementById('codeLangChip').querySelector('span:last-child').textContent = getLanguageMeta(f.language).label;
  const lineCount = (f.code || '').split('\n').length;
  document.getElementById('codeLineCount').textContent = `${lineCount} line${lineCount === 1 ? '' : 's'}`;
  document.getElementById('codeBreadcrumb').innerHTML = `
    <a href="#" onclick="navigateTo('subjects');return false;">Subjects</a>
    <span class="sep">/</span>${escapeHtml(f.subjects?.name || '—')}
    <span class="sep">/</span>${escapeHtml(f.folders?.name || '—')}
    <span class="sep">/</span>${escapeHtml(f.title)}
  `;

  document.querySelectorAll('.view-section').forEach((s) => s.classList.add('d-none'));
  document.getElementById('view-code').classList.remove('d-none');
  document.getElementById('pageTitle').textContent = f.title;

  renderProtectedCode(document.getElementById('codeViewer'), f.code, f.language, { maskLines: true });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
async function handlePasswordChange(e) {
  e.preventDefault();
  const alertBox = document.getElementById('settingsAlert');
  alertBox.classList.remove('show', 'error', 'success');
  const newPassword = document.getElementById('newPassword').value;
  try {
    const { error } = await window.sbClient.auth.updateUser({ password: newPassword });
    if (error) throw error;
    alertBox.textContent = 'Password updated successfully.';
    alertBox.classList.add('show', 'success');
    document.getElementById('newPassword').value = '';
  } catch (err) {
    alertBox.textContent = friendlyError(err);
    alertBox.classList.add('show', 'error');
  }
}
