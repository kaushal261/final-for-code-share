/**
 * admin.js — controls the Admin Dashboard SPA (dashboard-admin.html).
 * All data access goes through Supabase; RLS in sql/schema.sql enforces
 * that only the admin role can write to subjects/folders/code_files.
 */

let currentProfile = null;
let cachedSubjects = [];
let cachedFolders = [];
let cmEditor = null;
let pendingDelete = null; // { table, id, label }

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
(async function init() {
  currentProfile = await guardRoute('admin');
  if (!currentProfile) return; // guardRoute already redirected

  bindLogoutButtons();
  bindSidebarNav();
  bindMobileSidebar();
  populateLanguageSelects();
  bindModalForms();
  bindFileFilters();

  await loadSubjects();
  await refreshDashboardStats();
  await loadRecentFiles();

  navigateTo(location.hash ? location.hash.slice(1) : 'dashboard');
})();

// ---------------------------------------------------------------------------
// Sidebar / view navigation
// ---------------------------------------------------------------------------
function bindSidebarNav() {
  document.querySelectorAll('.sidebar-nav .nav-link[data-view]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(link.dataset.view);
      closeMobileSidebar();
    });
  });
}

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  subjects: 'Subjects',
  folders: 'Folders',
  files: 'Code Files',
  students: 'Students',
  settings: 'Settings'
};

async function navigateTo(view) {
  if (!VIEW_TITLES[view]) view = 'dashboard';
  document.querySelectorAll('.view-section').forEach((s) => s.classList.add('d-none'));
  document.getElementById('view-' + view).classList.remove('d-none');
  document.querySelectorAll('.sidebar-nav .nav-link[data-view]').forEach((l) => {
    l.classList.toggle('active', l.dataset.view === view);
  });
  document.getElementById('pageTitle').textContent = VIEW_TITLES[view];
  history.replaceState(null, '', '#' + view);
  renderTopbarActions(view);

  if (view === 'subjects') await loadSubjects(true);
  if (view === 'folders') await loadFoldersView();
  if (view === 'files') await loadFilesView();
  if (view === 'students') await loadStudents();
  if (view === 'settings') loadSettings();
}

function renderTopbarActions(view) {
  const holder = document.getElementById('topbarActions');
  holder.innerHTML = '';
  const buttons = {
    subjects: { label: 'New Subject', icon: 'bi-plus-lg', fn: () => openSubjectModal() },
    folders: { label: 'New Folder', icon: 'bi-plus-lg', fn: () => openFolderModal() },
    files: { label: 'New Code File', icon: 'bi-plus-lg', fn: () => openFileModal() }
  };
  const b = buttons[view];
  if (!b) return;
  const btn = document.createElement('button');
  btn.className = 'btn btn-teal';
  btn.innerHTML = `<i class="bi ${b.icon} me-1"></i>${b.label}`;
  btn.addEventListener('click', b.fn);
  holder.appendChild(btn);
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

// ---------------------------------------------------------------------------
// Language dropdown population
// ---------------------------------------------------------------------------
function populateLanguageSelects() {
  const opts = SUPPORTED_LANGUAGES.map((l) => `<option value="${l.value}">${l.label}</option>`).join('');
  document.getElementById('fileLanguage').innerHTML = opts;
  document.getElementById('fileLangFilter').innerHTML += opts;
}

// ---------------------------------------------------------------------------
// Dashboard stats + recent files
// ---------------------------------------------------------------------------
async function refreshDashboardStats() {
  const [{ count: subjCount }, { count: folderCount }, { count: fileCount }, { count: studentCount }] = await Promise.all([
    window.sbClient.from('subjects').select('*', { count: 'exact', head: true }),
    window.sbClient.from('folders').select('*', { count: 'exact', head: true }),
    window.sbClient.from('code_files').select('*', { count: 'exact', head: true }),
    window.sbClient.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student')
  ]);
  document.getElementById('statSubjects').textContent = subjCount ?? 0;
  document.getElementById('statFolders').textContent = folderCount ?? 0;
  document.getElementById('statFiles').textContent = fileCount ?? 0;
  document.getElementById('statStudents').textContent = studentCount ?? 0;
}

async function loadRecentFiles() {
  const holder = document.getElementById('recentFilesList');
  const { data, error } = await window.sbClient
    .from('code_files')
    .select('id, title, language, created_at, subjects(name)')
    .order('created_at', { ascending: false })
    .limit(6);

  if (error) { holder.innerHTML = `<p class="text-danger small">${friendlyError(error)}</p>`; return; }
  if (!data.length) { holder.innerHTML = `<div class="empty-state py-3"><i class="bi bi-inbox"></i>No code files yet.</div>`; return; }

  holder.innerHTML = data.map((f) => `
    <div class="code-file-row" onclick="openFileModal('${f.id}')">
      <div>
        <div class="cfr-title">${escapeHtml(f.title)}</div>
        <div class="cfr-meta">${escapeHtml(f.subjects?.name || 'No subject')} · ${formatDate(f.created_at)}</div>
      </div>
      <span class="lang-chip"><span class="dot"></span>${escapeHtml(getLanguageMeta(f.language).label)}</span>
    </div>
  `).join('');
}

// ---------------------------------------------------------------------------
// SUBJECTS
// ---------------------------------------------------------------------------
async function loadSubjects(renderGrid = false) {
  const { data, error } = await window.sbClient.from('subjects').select('*').order('created_at', { ascending: false });
  if (error) { showAppToast(friendlyError(error), 'error'); return; }
  cachedSubjects = data || [];

  // Keep dependent selects in sync
  const subjOpts = cachedSubjects.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  document.getElementById('folderSubjectId').innerHTML = subjOpts || '<option value="">No subjects yet</option>';
  document.getElementById('fileSubjectId').innerHTML = subjOpts || '<option value="">No subjects yet</option>';
  document.getElementById('folderSubjectFilter').innerHTML = '<option value="">All subjects</option>' + subjOpts;
  document.getElementById('fileSubjectFilter').innerHTML = '<option value="">All subjects</option>' + subjOpts;

  if (renderGrid) renderSubjectsGrid();
}

function renderSubjectsGrid() {
  const grid = document.getElementById('subjectsGrid');
  if (!cachedSubjects.length) {
    grid.innerHTML = `<div class="col-12"><div class="empty-state"><i class="bi bi-collection"></i>No subjects yet. Create your first subject to get started.</div></div>`;
    return;
  }
  grid.innerHTML = cachedSubjects.map((s) => `
    <div class="col-md-6 col-lg-4">
      <div class="entity-card fade-in-up">
        <div class="d-flex justify-content-between">
          <div class="entity-icon"><i class="bi bi-collection-fill"></i></div>
          <div class="dropdown">
            <button class="btn btn-sm btn-outline-teal border-0" data-bs-toggle="dropdown"><i class="bi bi-three-dots-vertical"></i></button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li><a class="dropdown-item" href="#" onclick="openSubjectModal('${s.id}');return false;"><i class="bi bi-pencil me-2"></i>Edit</a></li>
              <li><a class="dropdown-item text-danger" href="#" onclick="confirmDelete('subjects','${s.id}','${escapeHtml(s.name)}');return false;"><i class="bi bi-trash me-2"></i>Delete</a></li>
            </ul>
          </div>
        </div>
        <div class="entity-title">${escapeHtml(s.name)}</div>
        <div class="entity-meta">${escapeHtml(s.description || 'No description')}</div>
      </div>
    </div>
  `).join('');
}

function openSubjectModal(id) {
  const form = document.getElementById('subjectForm');
  form.reset();
  document.getElementById('subjectId').value = '';
  document.getElementById('subjectModalTitle').textContent = 'New Subject';
  if (id) {
    const s = cachedSubjects.find((x) => x.id === id);
    if (s) {
      document.getElementById('subjectId').value = s.id;
      document.getElementById('subjectName').value = s.name;
      document.getElementById('subjectDescription').value = s.description || '';
      document.getElementById('subjectModalTitle').textContent = 'Edit Subject';
    }
  }
  bootstrap.Modal.getOrCreateInstance(document.getElementById('subjectModal')).show();
}

async function saveSubject(e) {
  e.preventDefault();
  const id = document.getElementById('subjectId').value;
  const payload = {
    name: document.getElementById('subjectName').value.trim(),
    description: document.getElementById('subjectDescription').value.trim()
  };
  try {
    if (id) {
      const { error } = await window.sbClient.from('subjects').update(payload).eq('id', id);
      if (error) throw error;
      showAppToast('Subject updated.', 'success');
    } else {
      payload.created_by = currentProfile.id;
      const { error } = await window.sbClient.from('subjects').insert(payload);
      if (error) throw error;
      showAppToast('Subject created.', 'success');
    }
    bootstrap.Modal.getInstance(document.getElementById('subjectModal')).hide();
    await loadSubjects(true);
    await refreshDashboardStats();
  } catch (err) {
    showAppToast(friendlyError(err), 'error');
  }
}

// ---------------------------------------------------------------------------
// FOLDERS
// ---------------------------------------------------------------------------
async function loadFoldersView() {
  await loadFolders();
  renderFoldersGrid(document.getElementById('folderSubjectFilter').value);
}

async function loadFolders() {
  const { data, error } = await window.sbClient
    .from('folders')
    .select('*, subjects(name)')
    .order('created_at', { ascending: false });
  if (error) { showAppToast(friendlyError(error), 'error'); return; }
  cachedFolders = data || [];

  const opts = cachedFolders.map((f) => `<option value="${f.id}" data-subject="${f.subject_id}">${escapeHtml(f.name)}</option>`).join('');
  document.getElementById('fileFolderId').innerHTML = opts || '<option value="">No folders yet</option>';
}

function renderFoldersGrid(subjectFilter) {
  const grid = document.getElementById('foldersGrid');
  const list = subjectFilter ? cachedFolders.filter((f) => f.subject_id === subjectFilter) : cachedFolders;
  if (!list.length) {
    grid.innerHTML = `<div class="col-12"><div class="empty-state"><i class="bi bi-folder"></i>No folders found.</div></div>`;
    return;
  }
  grid.innerHTML = list.map((f) => `
    <div class="col-md-6 col-lg-4">
      <div class="entity-card fade-in-up">
        <div class="d-flex justify-content-between">
          <div class="entity-icon"><i class="bi bi-folder-fill"></i></div>
          <div class="dropdown">
            <button class="btn btn-sm btn-outline-teal border-0" data-bs-toggle="dropdown"><i class="bi bi-three-dots-vertical"></i></button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li><a class="dropdown-item" href="#" onclick="openFolderModal('${f.id}');return false;"><i class="bi bi-pencil me-2"></i>Edit</a></li>
              <li><a class="dropdown-item text-danger" href="#" onclick="confirmDelete('folders','${f.id}','${escapeHtml(f.name)}');return false;"><i class="bi bi-trash me-2"></i>Delete</a></li>
            </ul>
          </div>
        </div>
        <div class="entity-title">${escapeHtml(f.name)}</div>
        <div class="entity-meta">${escapeHtml(f.subjects?.name || 'Unknown subject')}</div>
      </div>
    </div>
  `).join('');
}

document.addEventListener('change', (e) => {
  if (e.target.id === 'folderSubjectFilter') renderFoldersGrid(e.target.value);
});

function openFolderModal(id) {
  const form = document.getElementById('folderForm');
  form.reset();
  document.getElementById('folderId').value = '';
  document.getElementById('folderModalTitle').textContent = 'New Folder';
  if (id) {
    const f = cachedFolders.find((x) => x.id === id);
    if (f) {
      document.getElementById('folderId').value = f.id;
      document.getElementById('folderSubjectId').value = f.subject_id;
      document.getElementById('folderName').value = f.name;
      document.getElementById('folderDescription').value = f.description || '';
      document.getElementById('folderModalTitle').textContent = 'Edit Folder';
    }
  }
  bootstrap.Modal.getOrCreateInstance(document.getElementById('folderModal')).show();
}

async function saveFolder(e) {
  e.preventDefault();
  const id = document.getElementById('folderId').value;
  const payload = {
    subject_id: document.getElementById('folderSubjectId').value,
    name: document.getElementById('folderName').value.trim(),
    description: document.getElementById('folderDescription').value.trim()
  };
  try {
    if (id) {
      const { error } = await window.sbClient.from('folders').update(payload).eq('id', id);
      if (error) throw error;
      showAppToast('Folder updated.', 'success');
    } else {
      payload.created_by = currentProfile.id;
      const { error } = await window.sbClient.from('folders').insert(payload);
      if (error) throw error;
      showAppToast('Folder created.', 'success');
    }
    bootstrap.Modal.getInstance(document.getElementById('folderModal')).hide();
    await loadFoldersView();
    await refreshDashboardStats();
  } catch (err) {
    showAppToast(friendlyError(err), 'error');
  }
}

// ---------------------------------------------------------------------------
// CODE FILES
// ---------------------------------------------------------------------------
let cachedFiles = [];

async function loadFilesView() {
  await loadFolders();
  await fetchFiles();
}

async function fetchFiles() {
  const holder = document.getElementById('filesList');
  holder.innerHTML = `<div class="skeleton" style="height:52px;" class="mb-2"></div>`;

  let query = window.sbClient
    .from('code_files')
    .select('id, title, language, description, subject_id, folder_id, created_at, subjects(name), folders(name)')
    .order('created_at', { ascending: false });

  const search = document.getElementById('fileSearchInput').value.trim();
  const lang = document.getElementById('fileLangFilter').value;
  const subj = document.getElementById('fileSubjectFilter').value;

  if (lang) query = query.eq('language', lang);
  if (subj) query = query.eq('subject_id', subj);
  if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,code.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) { holder.innerHTML = `<p class="text-danger small">${friendlyError(error)}</p>`; return; }
  cachedFiles = data || [];

  if (!cachedFiles.length) {
    holder.innerHTML = `<div class="empty-state"><i class="bi bi-file-earmark-code"></i>No code files match your filters.</div>`;
    return;
  }

  holder.innerHTML = cachedFiles.map((f) => `
    <div class="code-file-row fade-in-up">
      <div style="min-width:0;" onclick="openFileModal('${f.id}')" role="button">
        <div class="cfr-title">${escapeHtml(f.title)}</div>
        <div class="cfr-meta">${escapeHtml(f.subjects?.name || '—')} / ${escapeHtml(f.folders?.name || '—')} · ${formatDate(f.created_at)}</div>
      </div>
      <div class="d-flex align-items-center gap-2">
        <span class="lang-chip"><span class="dot"></span>${escapeHtml(getLanguageMeta(f.language).label)}</span>
        <button class="btn btn-sm btn-outline-teal" onclick="previewFile('${f.id}')" title="Preview"><i class="bi bi-eye"></i></button>
        <button class="btn btn-sm btn-outline-teal" onclick="openFileModal('${f.id}')" title="Edit"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-ghost-danger" onclick="confirmDelete('code_files','${f.id}','${escapeHtml(f.title)}')" title="Delete"><i class="bi bi-trash"></i></button>
      </div>
    </div>
  `).join('');
}

function bindFileFilters() {
  document.getElementById('fileSearchInput').addEventListener('input', debounce(fetchFiles, 350));
  document.getElementById('fileLangFilter').addEventListener('change', fetchFiles);
  document.getElementById('fileSubjectFilter').addEventListener('change', fetchFiles);
  document.getElementById('fileFilterReset').addEventListener('click', () => {
    document.getElementById('fileSearchInput').value = '';
    document.getElementById('fileLangFilter').value = '';
    document.getElementById('fileSubjectFilter').value = '';
    fetchFiles();
  });
}

function ensureEditor() {
  if (cmEditor) return cmEditor;
  cmEditor = CodeMirror.fromTextArea(document.getElementById('fileCodeEditor'), {
    lineNumbers: true,
    theme: 'dracula',
    mode: 'javascript',
    indentUnit: 4,
    tabSize: 4,
    viewportMargin: Infinity
  });
  return cmEditor;
}

async function openFileModal(id) {
  await loadFolders(); // ensure folder dropdown is fresh
  const form = document.getElementById('fileForm');
  form.reset();
  document.getElementById('fileId').value = '';
  document.getElementById('fileModalTitle').textContent = 'New Code File';
  const editor = ensureEditor();
  editor.setValue('');

  if (id) {
    const { data: f, error } = await window.sbClient.from('code_files').select('*').eq('id', id).single();
    if (error) { showAppToast(friendlyError(error), 'error'); return; }
    document.getElementById('fileId').value = f.id;
    document.getElementById('fileTitle').value = f.title;
    document.getElementById('fileLanguage').value = f.language;
    document.getElementById('fileSubjectId').value = f.subject_id || '';
    document.getElementById('fileFolderId').value = f.folder_id || '';
    document.getElementById('fileDescription').value = f.description || '';
    editor.setValue(f.code || '');
    document.getElementById('fileModalTitle').textContent = 'Edit Code File';
  }

  setEditorMode(document.getElementById('fileLanguage').value);
  bootstrap.Modal.getOrCreateInstance(document.getElementById('fileModal')).show();
  setTimeout(() => editor.refresh(), 200);
}

document.addEventListener('change', (e) => {
  if (e.target.id === 'fileLanguage') setEditorMode(e.target.value);
});

function setEditorMode(langValue) {
  if (!cmEditor) return;
  cmEditor.setOption('mode', getLanguageMeta(langValue).cmMode);
}

async function saveFile(e) {
  e.preventDefault();
  const id = document.getElementById('fileId').value;
  const payload = {
    title: document.getElementById('fileTitle').value.trim(),
    language: document.getElementById('fileLanguage').value,
    subject_id: document.getElementById('fileSubjectId').value,
    folder_id: document.getElementById('fileFolderId').value,
    description: document.getElementById('fileDescription').value.trim(),
    code: cmEditor ? cmEditor.getValue() : ''
  };
  if (!payload.code.trim()) {
    showAppToast('Please paste or type some code before saving.', 'error');
    return;
  }
  try {
    if (id) {
      const { error } = await window.sbClient.from('code_files').update(payload).eq('id', id);
      if (error) throw error;
      showAppToast('Code file updated.', 'success');
    } else {
      payload.created_by = currentProfile.id;
      const { error } = await window.sbClient.from('code_files').insert(payload);
      if (error) throw error;
      showAppToast('Code file saved.', 'success');
    }
    bootstrap.Modal.getInstance(document.getElementById('fileModal')).hide();
    await fetchFiles();
    await refreshDashboardStats();
    await loadRecentFiles();
  } catch (err) {
    showAppToast(friendlyError(err), 'error');
  }
}

async function previewFile(id) {
  const { data: f, error } = await window.sbClient.from('code_files').select('*').eq('id', id).single();
  if (error) { showAppToast(friendlyError(error), 'error'); return; }
  document.getElementById('previewTitle').textContent = f.title;
  document.getElementById('previewDescription').textContent = f.description || '';
  document.getElementById('previewLangChip').querySelector('span:last-child').textContent = getLanguageMeta(f.language).label;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('previewModal')).show();
  renderProtectedCode(document.getElementById('previewViewer'), f.code, f.language);
}

// ---------------------------------------------------------------------------
// STUDENTS (read-only list)
// ---------------------------------------------------------------------------
async function loadStudents() {
  const tbody = document.getElementById('studentsTableBody');
  const { data, error } = await window.sbClient
    .from('profiles')
    .select('id, full_name, email, role, created_at')
    .order('created_at', { ascending: false });

  if (error) { tbody.innerHTML = `<tr><td colspan="4" class="text-danger">${friendlyError(error)}</td></tr>`; return; }
  if (!data.length) { tbody.innerHTML = `<tr><td colspan="4" class="text-muted-2">No accounts yet.</td></tr>`; return; }

  tbody.innerHTML = data.map((p) => `
    <tr>
      <td>${escapeHtml(p.full_name || '—')}</td>
      <td>${escapeHtml(p.email)}</td>
      <td><span class="badge rounded-pill badge-role-${p.role}">${p.role}</span></td>
      <td class="text-muted-2">${formatDate(p.created_at)}</td>
    </tr>
  `).join('');
}

// ---------------------------------------------------------------------------
// SETTINGS
// ---------------------------------------------------------------------------
function loadSettings() {
  document.getElementById('settingsAdminEmail').textContent = `Signed in as ${currentProfile.email}`;
}

document.getElementById('changePasswordForm')?.addEventListener('submit', async (e) => {
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
});

// ---------------------------------------------------------------------------
// Delete confirmation (shared across subjects/folders/code_files)
// ---------------------------------------------------------------------------
function confirmDelete(table, id, label) {
  pendingDelete = { table, id };
  document.getElementById('confirmMessage').textContent = `Delete "${label}"? This cannot be undone.`;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('confirmModal')).show();
}

document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
  if (!pendingDelete) return;
  const { table, id } = pendingDelete;
  try {
    const { error } = await window.sbClient.from(table).delete().eq('id', id);
    if (error) throw error;
    showAppToast('Deleted successfully.', 'success');
    bootstrap.Modal.getInstance(document.getElementById('confirmModal')).hide();

    if (table === 'subjects') { await loadSubjects(true); await loadFoldersView().catch(() => {}); }
    if (table === 'folders') await loadFoldersView();
    if (table === 'code_files') await fetchFiles();
    await refreshDashboardStats();
    await loadRecentFiles();
  } catch (err) {
    showAppToast(friendlyError(err), 'error');
  }
  pendingDelete = null;
});

// ---------------------------------------------------------------------------
// Modal form bindings
// ---------------------------------------------------------------------------
function bindModalForms() {
  document.getElementById('subjectForm').addEventListener('submit', saveSubject);
  document.getElementById('folderForm').addEventListener('submit', saveFolder);
  document.getElementById('fileForm').addEventListener('submit', saveFile);
  document.getElementById('fileModal').addEventListener('shown.bs.modal', () => ensureEditor().refresh());
}
