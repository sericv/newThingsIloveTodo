/* ============================================================
   ADMIN.JS — Content Management System (Arabic RTL)
   ============================================================ */

import {
  login, logout, onAuth,
  getSiteConfig, saveSiteConfig, initSiteConfig,
  getCategories, createCategory, updateCategory, deleteCategory,
  getProjects, getProject, createProject, updateProject, deleteProject,
  createProjectsBatch,
  generateSlug,
} from '../js/firebase.js';

import { uploadToCloudinary, uploadManyToCloudinary } from '../js/cloudinary.js';

/* ── State ── */
const state = {
  user:       null,
  projects:   [],
  categories: [],
  config:     null,
  editingProjectId: null,
  editingCategoryId: null,
  galleryImages: [],
  coverImage:    null,
  profilePhoto:  null,
  journeyCount:  0,
  deleteTarget:  null,
  bulkFiles:     [],
};

/* ============================================================
   BOOT
   ============================================================ */
onAuth(async user => {
  state.user = user;
  if (user) {
    showShell();
    await loadData();
    renderSection('dashboard');
  } else {
    showAuthGate();
  }
});

/* ============================================================
   AUTH
   ============================================================ */
document.getElementById('login-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const email    = document.getElementById('login-email')?.value.trim();
  const password = document.getElementById('login-password')?.value;
  const errEl    = document.getElementById('login-error');

  clearAuthErrors();

  if (!email)    { setFieldError('login-email-error', 'البريد الإلكتروني مطلوب.'); return; }
  if (!password) { setFieldError('login-pass-error',  'كلمة المرور مطلوبة.'); return; }

  setLoading('login-btn', 'login-spinner', 'login-btn-text', true, 'جاري الدخول…');

  try {
    await login(email, password);
    /* onAuth callback handles showing shell */
  } catch (err) {
    const msg = authErrorMessage(err.code);
    if (errEl) { errEl.textContent = msg; errEl.classList.add('visible'); }
    setLoading('login-btn', 'login-spinner', 'login-btn-text', false, 'تسجيل الدخول');
  }
});

document.getElementById('password-toggle')?.addEventListener('click', () => {
  const input = document.getElementById('login-password');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
});

document.getElementById('logout-btn')?.addEventListener('click', async () => {
  await logout();
});

function clearAuthErrors() {
  const emailErr = document.getElementById('login-email-error');
  const passErr  = document.getElementById('login-pass-error');
  const errEl    = document.getElementById('login-error');
  if (emailErr) emailErr.textContent = '';
  if (passErr)  passErr.textContent  = '';
  if (errEl)    { errEl.textContent = ''; errEl.classList.remove('visible'); }
}

function authErrorMessage(code) {
  const map = {
    'auth/invalid-credential':     'بريد إلكتروني أو كلمة مرور غير صحيحة.',
    'auth/user-not-found':         'لا يوجد حساب بهذا البريد الإلكتروني.',
    'auth/wrong-password':         'كلمة المرور غير صحيحة.',
    'auth/too-many-requests':      'محاولات كثيرة جداً. حاول لاحقاً.',
    'auth/network-request-failed': 'خطأ في الشبكة. تحقق من الاتصال.',
  };
  return map[code] || 'فشل تسجيل الدخول. حاول مرة أخرى.';
}

/* ============================================================
   SHELL TOGGLE
   ============================================================ */
function showShell() {
  document.getElementById('auth-gate').style.display   = 'none';
  document.getElementById('admin-shell').hidden = false;
}

function showAuthGate() {
  document.getElementById('auth-gate').style.display   = '';
  document.getElementById('admin-shell').hidden = true;
}

/* ============================================================
   NAVIGATION
   ============================================================ */
document.querySelectorAll('.sidebar-link[data-section]').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    renderSection(link.dataset.section);
  });
});

document.getElementById('view-all-projects')?.addEventListener('click', () => renderSection('projects'));

function renderSection(name) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));

  const section = document.getElementById(`section-${name}`);
  if (section) section.classList.add('active');

  const link = document.querySelector(`.sidebar-link[data-section="${name}"]`);
  if (link) link.classList.add('active');

  if (name === 'dashboard')   renderDashboard();
  if (name === 'projects')    renderProjectsList();
  if (name === 'categories')  renderCategoriesList();
  if (name === 'site-config') renderConfigForm();
}

/* ============================================================
   LOAD DATA
   ============================================================ */
async function loadData() {
  try {
    const [projects, categories, config] = await Promise.all([
      getProjects(),
      getCategories(),
      getSiteConfig(),
    ]);
    state.projects   = projects;
    state.categories = categories;
    state.config     = config;

    if (!config) {
      await initSiteConfig({
        ownerName:   '',
        ownerTitle:  '',
        ownerBio:    '',
        ownerPhoto:  '',
        ownerEmail:  '',
        socialLinks: [],
        heroTagline: '',
        heroSubtext: '',
      });
    }
  } catch (err) {
    console.error('Load error:', err);
    showToast('تعذّر تحميل البيانات.', 'error');
  }
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function renderDashboard() {
  const total     = state.projects.length;
  const published = state.projects.filter(p => p.status === 'published').length;
  const drafts    = state.projects.filter(p => p.status === 'draft').length;
  const featured  = state.projects.filter(p => p.featured).length;

  setEl('stat-total',     total);
  setEl('stat-published', published);
  setEl('stat-drafts',    drafts);
  setEl('stat-featured',  featured);

  const list = document.getElementById('recent-projects-list');
  if (!list) return;

  const recent = [...state.projects].sort((a, b) => {
    const da = a.createdAt?.seconds || 0;
    const db = b.createdAt?.seconds || 0;
    return db - da;
  }).slice(0, 5);

  list.innerHTML = recent.length
    ? `<div class="admin-list">${recent.map(p => buildListItem(p)).join('')}</div>`
    : '<p style="padding:1.5rem;text-align:center;color:var(--color-text-secondary);font-size:var(--text-sm)">لا توجد مشاريع بعد.</p>';

  list.querySelectorAll('[data-edit-project]').forEach(btn =>
    btn.addEventListener('click', () => openProjectForm(btn.dataset.editProject)));
}

/* ============================================================
   PROJECTS
   ============================================================ */
document.getElementById('new-project-btn')?.addEventListener('click',    () => openProjectForm(null));
document.getElementById('project-form-close')?.addEventListener('click', closeProjectForm);
document.getElementById('project-form-cancel')?.addEventListener('click', closeProjectForm);
document.getElementById('project-form')?.addEventListener('submit', saveProject);

document.getElementById('projects-search')?.addEventListener('input', debounce(() => renderProjectsList(), 200));
document.getElementById('projects-filter-status')?.addEventListener('change', () => renderProjectsList());

document.getElementById('project-featured')?.addEventListener('change', e => {
  const grp = document.getElementById('featured-order-group');
  if (grp) grp.style.display = e.target.checked ? '' : 'none';
});

function renderProjectsList() {
  const list = document.getElementById('projects-list');
  if (!list) return;

  const search = document.getElementById('projects-search')?.value.toLowerCase() || '';
  const status = document.getElementById('projects-filter-status')?.value || '';

  let projects = state.projects;
  if (status) projects = projects.filter(p => p.status === status);
  if (search) projects = projects.filter(p =>
    p.title?.toLowerCase().includes(search) ||
    p.categoryName?.toLowerCase().includes(search)
  );

  if (!projects.length) {
    list.innerHTML = '<p style="padding:2rem;text-align:center;color:var(--color-text-secondary);font-size:var(--text-sm)">لم يتم العثور على مشاريع.</p>';
    return;
  }

  list.innerHTML = `<div class="admin-list">${projects.map(p => buildListItem(p, true)).join('')}</div>`;

  list.querySelectorAll('[data-edit-project]').forEach(btn =>
    btn.addEventListener('click', () => openProjectForm(btn.dataset.editProject)));
  list.querySelectorAll('[data-delete-project]').forEach(btn =>
    btn.addEventListener('click', () => confirmDelete('project', btn.dataset.deleteProject, btn.dataset.deleteTitle)));
}

function buildListItem(project, showDelete = false) {
  const statusLabels = { published: 'منشور', draft: 'مسودة', archived: 'مؤرشف' };
  const statusLabel  = statusLabels[project.status] || project.status || 'مسودة';

  const thumb = project.coverImage
    ? `<img class="admin-list-thumb" src="${project.coverImage}" alt="" loading="lazy" />`
    : `<div class="admin-list-thumb-placeholder"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg></div>`;

  return `
    <div class="admin-list-item">
      ${thumb}
      <div class="admin-list-info">
        <div class="admin-list-title">${escHtml(project.title || 'بدون عنوان')}</div>
        <div class="admin-list-meta">
          ${project.categoryName ? `${escHtml(project.categoryName)} · ` : ''}
          ${formatDate(project.date)}
        </div>
      </div>
      <span class="status-badge status-${project.status || 'draft'}">${statusLabel}</span>
      <div class="admin-list-actions">
        <button class="icon-btn" data-edit-project="${project.id}" aria-label="تعديل ${escHtml(project.title)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        ${showDelete ? `<button class="icon-btn danger" data-delete-project="${project.id}" data-delete-title="${escHtml(project.title)}" aria-label="حذف ${escHtml(project.title)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>` : ''}
      </div>
    </div>
  `;
}

async function openProjectForm(projectId) {
  const panel = document.getElementById('project-form-panel');
  const form  = document.getElementById('project-form');
  if (!panel || !form) return;

  resetProjectForm();

  const categorySelect = document.getElementById('project-category');
  if (categorySelect) {
    categorySelect.innerHTML = '<option value="">— اختر التصنيف —</option>';
    state.categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      categorySelect.appendChild(opt);
    });
  }

  if (projectId) {
    state.editingProjectId = projectId;
    document.getElementById('project-form-title').textContent = 'تعديل المشروع';
    document.getElementById('project-id').value = projectId;

    try {
      const project = await getProject(projectId);
      if (!project) return;

      setVal('project-title',       project.title);
      setVal('project-status',      project.status || 'draft');
      setVal('project-category',    project.categoryId || '');
      setVal('project-date',        project.date || '');
      setVal('project-description', project.description || '');
      setVal('project-long-desc',   project.longDescription || '');
      setVal('project-tags',        (project.tags || []).join(', '));
      setVal('project-featured-order', project.featuredOrder || 1);

      const featuredCheck = document.getElementById('project-featured');
      if (featuredCheck) {
        featuredCheck.checked = !!project.featured;
        const grp = document.getElementById('featured-order-group');
        if (grp) grp.style.display = project.featured ? '' : 'none';
      }

      if (project.coverImage) {
        state.coverImage = project.coverImage;
        showImagePreview('cover', project.coverImage);
      }

      if (project.gallery?.length) {
        state.galleryImages = [...project.gallery];
        renderGalleryPreview();
      }

      renderLinks(project.links || []);
      renderJourneySections(project.journey || []);

    } catch (err) {
      showToast('تعذّر تحميل المشروع.', 'error');
      return;
    }
  } else {
    state.editingProjectId = null;
    document.getElementById('project-form-title').textContent = 'مشروع جديد';
    document.getElementById('project-id').value = '';
    document.getElementById('project-date').value = new Date().toISOString().split('T')[0];
    const grp = document.getElementById('featured-order-group');
    if (grp) grp.style.display = 'none';
    renderLinks([]);
    renderJourneySections([]);
  }

  panel.hidden = false;
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeProjectForm() {
  const panel = document.getElementById('project-form-panel');
  if (panel) panel.hidden = true;
  resetProjectForm();
}

function resetProjectForm() {
  document.getElementById('project-form')?.reset();
  state.editingProjectId = null;
  state.coverImage       = null;
  state.galleryImages    = [];
  state.journeyCount     = 0;

  hideImagePreview('cover');
  const galleryPreview = document.getElementById('gallery-preview');
  if (galleryPreview) galleryPreview.innerHTML = '';
  const journeyContainer = document.getElementById('journey-container');
  if (journeyContainer) journeyContainer.innerHTML = '';
  const linksContainer = document.getElementById('links-container');
  if (linksContainer) linksContainer.innerHTML = '';
}

async function saveProject(e) {
  e.preventDefault();

  const title = document.getElementById('project-title')?.value.trim();
  if (!title) {
    setFieldError('project-title-error', 'العنوان مطلوب.');
    return;
  }
  document.getElementById('project-title-error').textContent = '';

  /* Lock button immediately — prevent double submit */
  setLoading('project-save-btn', 'project-save-spinner', 'project-save-text', true, 'جاري الحفظ…');

  try {
    const categoryId = document.getElementById('project-category')?.value || '';
    const category   = state.categories.find(c => c.id === categoryId);

    const tagsRaw = document.getElementById('project-tags')?.value || '';
    const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);

    const featuredCheck = document.getElementById('project-featured');
    const featured = featuredCheck?.checked || false;

    const journey = collectJourney();
    const links   = collectLinks();

    const data = {
      title,
      slug:            generateSlug(title),
      status:          document.getElementById('project-status')?.value || 'draft',
      categoryId,
      categoryName:    category?.name || '',
      date:            document.getElementById('project-date')?.value || '',
      description:     document.getElementById('project-description')?.value.trim() || '',
      longDescription: document.getElementById('project-long-desc')?.value.trim() || '',
      tags,
      featured,
      featuredOrder:   featured ? parseInt(document.getElementById('project-featured-order')?.value) || 1 : 0,
      coverImage:      state.coverImage || '',
      gallery:         [...state.galleryImages],
      links,
      journey,
    };

    if (state.editingProjectId) {
      await updateProject(state.editingProjectId, data);
      const idx = state.projects.findIndex(p => p.id === state.editingProjectId);
      if (idx !== -1) state.projects[idx] = { id: state.editingProjectId, ...data };
    } else {
      const ref = await createProject(data);
      state.projects.unshift({ id: ref.id, ...data });
    }

    closeProjectForm();
    renderProjectsList();
    renderDashboard();
    showToast('تم حفظ المشروع بنجاح.', 'success');

  } catch (err) {
    console.error(err);
    showToast('تعذّر حفظ المشروع.', 'error');
  } finally {
    /* Always reset button — whether success or failure */
    setLoading('project-save-btn', 'project-save-spinner', 'project-save-text', false, 'حفظ المشروع');
  }
}

/* ── Journey ── */
document.getElementById('add-journey-btn')?.addEventListener('click', () => addJourneySection());

function addJourneySection(data = {}) {
  const container = document.getElementById('journey-container');
  if (!container) return;

  const id = `journey-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  state.journeyCount++;
  const num = state.journeyCount;

  /* Images for this stage live on the element itself — supports multiple per stage.
     Falls back to the legacy single `image` field for older projects. */
  const images = (data.gallery && data.gallery.length) ? [...data.gallery] : (data.image ? [data.image] : []);

  const div = document.createElement('div');
  div.className = 'journey-section-admin';
  div.dataset.journeyId = id;
  div._journeyImages = images;
  div.innerHTML = `
    <div class="journey-section-header">
      <span class="journey-section-number">المرحلة ${num}</span>
      <div class="journey-section-actions">
        <button type="button" class="icon-btn danger journey-remove-btn" aria-label="إزالة المرحلة">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
    <div class="admin-form" style="gap:var(--space-3)">
      <div class="form-group">
        <label class="form-label">عنوان المرحلة</label>
        <input type="text" class="form-input journey-title-input" placeholder="مثال: مرحلة البحث" value="${escHtml(data.title || '')}" />
      </div>
      <div class="form-group">
        <label class="form-label">الوصف</label>
        <textarea class="form-textarea journey-desc-input" rows="3" placeholder="ماذا حدث في هذه المرحلة…">${escHtml(data.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">صور المرحلة</label>
        <div class="image-upload-zone bulk-upload-zone journey-images-zone" data-journey-id="${id}">
          <input type="file" class="sr-only journey-images-input" accept="image/*" multiple aria-label="رفع صور المرحلة" />
          <div class="image-upload-placeholder">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span>إضافة صور (يمكن اختيار أكثر من صورة)</span>
          </div>
        </div>
        <div class="bulk-files-grid journey-images-grid"></div>
      </div>
      <input type="hidden" class="journey-order-data" value="${data.order || num}" />
    </div>
  `;

  const zone  = div.querySelector('.journey-images-zone');
  const input = div.querySelector('.journey-images-input');

  function renderJourneyImages() {
    const grid = div.querySelector('.journey-images-grid');
    if (!grid) return;
    grid.innerHTML = div._journeyImages.map((img, i) => `
      <div class="bulk-file-thumb-wrap">
        <img class="bulk-file-thumb" src="${img}" alt="صورة المرحلة ${i + 1}" loading="lazy" />
        <button type="button" class="gallery-thumb-remove" data-index="${i}" aria-label="إزالة الصورة ${i + 1}">×</button>
      </div>
    `).join('');

    grid.querySelectorAll('.gallery-thumb-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        div._journeyImages.splice(parseInt(btn.dataset.index), 1);
        renderJourneyImages();
      });
    });
  }

  async function addJourneyFiles(fileList) {
    const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;

    showToast('جاري رفع الصور…', 'default');

    try {
      const urls = await uploadManyToCloudinary(files, 'journey');
      div._journeyImages.push(...urls);
      renderJourneyImages();
    } catch (err) {
      console.error(err);
      showToast('تعذّر رفع بعض الصور.', 'error');
    }
  }

  zone?.addEventListener('click', () => input?.click());
  input?.addEventListener('change', e => {
    addJourneyFiles(e.target.files);
    e.target.value = '';
  });

  zone?.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone?.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone?.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    addJourneyFiles(e.dataTransfer?.files);
  });

  div.querySelector('.journey-remove-btn')?.addEventListener('click', () => div.remove());

  renderJourneyImages();
  container.appendChild(div);
}

function renderJourneySections(sections) {
  const container = document.getElementById('journey-container');
  if (!container) return;
  container.innerHTML = '';
  state.journeyCount = 0;
  sections.sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(s => addJourneySection(s));
}

function collectJourney() {
  return Array.from(document.querySelectorAll('.journey-section-admin')).map((div, i) => ({
    id:          div.dataset.journeyId,
    title:       div.querySelector('.journey-title-input')?.value.trim() || '',
    description: div.querySelector('.journey-desc-input')?.value.trim() || '',
    gallery:     [...(div._journeyImages || [])],
    order:       i + 1,
  }));
}

/* ── Links ── */
document.getElementById('add-link-btn')?.addEventListener('click', () => addLinkRow());

function addLinkRow(data = {}) {
  const container = document.getElementById('links-container');
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'link-row';
  div.innerHTML = `
    <input type="text" class="form-input link-label-input" placeholder="التسمية (مثال: GitHub)" value="${escHtml(data.label || '')}" />
    <input type="url"  class="form-input link-url-input"   placeholder="https://…" value="${escHtml(data.url || '')}" />
    <button type="button" class="icon-btn danger link-remove-btn" aria-label="إزالة الرابط">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>
  `;
  div.querySelector('.link-remove-btn')?.addEventListener('click', () => div.remove());
  container.appendChild(div);
}

function renderLinks(links) {
  const container = document.getElementById('links-container');
  if (!container) return;
  container.innerHTML = '';
  links.forEach(l => addLinkRow(l));
}

function collectLinks() {
  return Array.from(document.querySelectorAll('#links-container .link-row')).map(div => ({
    label: div.querySelector('.link-label-input')?.value.trim() || '',
    url:   div.querySelector('.link-url-input')?.value.trim()   || '',
  })).filter(l => l.url);
}

/* ── Cover Image ── */
setupImageUpload('cover-upload-zone', 'cover-file-input', 'cover');
setupImageUpload('photo-upload-zone', 'photo-file-input', 'photo');

/* ── Gallery Images ── */
document.getElementById('gallery-add-btn')?.addEventListener('click', () =>
  document.getElementById('gallery-file-input')?.click());

document.getElementById('gallery-file-input')?.addEventListener('change', async e => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  showToast('جاري رفع الصور…', 'default');

  try {
    const urls = await uploadManyToCloudinary(files, 'gallery');
    state.galleryImages.push(...urls);
    renderGalleryPreview();
  } catch (err) {
    console.error(err);
    showToast('تعذّر رفع بعض الصور.', 'error');
  }

  e.target.value = '';
});

function renderGalleryPreview() {
  const preview = document.getElementById('gallery-preview');
  if (!preview) return;
  preview.innerHTML = state.galleryImages.map((img, i) => `
    <div class="gallery-thumb-wrap">
      <img class="gallery-thumb" src="${img}" alt="معرض ${i + 1}" loading="lazy" />
      <button type="button" class="gallery-thumb-remove" data-index="${i}" aria-label="إزالة الصورة ${i + 1}">×</button>
    </div>
  `).join('');

  preview.querySelectorAll('.gallery-thumb-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      state.galleryImages.splice(parseInt(btn.dataset.index), 1);
      renderGalleryPreview();
    });
  });
}

/* ── Image Upload Helper ── */
function setupImageUpload(zoneId, inputId, target) {
  const zone  = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  if (!zone || !input) return;

  zone.addEventListener('click', e => {
    if (e.target.closest('.image-remove-btn')) return;
    input.click();
  });

  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', async e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files?.[0];
    if (file) await processImageFile(file, target);
  });

  input.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (file) await processImageFile(file, target);
    e.target.value = '';
  });

  zone.querySelectorAll('.image-remove-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      hideImagePreview(target);
      if (target === 'cover') state.coverImage   = null;
      if (target === 'photo') state.profilePhoto = null;
    });
  });
}

async function processImageFile(file, target) {
  const progressEl  = document.getElementById(`${target}-progress`);
  const progressBar = document.getElementById(`${target}-progress-bar`);

  if (progressEl) { progressEl.hidden = false; if (progressBar) progressBar.style.width = '0%'; }

  try {
    const url = await uploadToCloudinary(file, target, pct => {
      if (progressBar) progressBar.style.width = `${pct}%`;
    });

    if (target === 'cover') state.coverImage   = url;
    if (target === 'photo') state.profilePhoto = url;

    showImagePreview(target, url);
  } catch (err) {
    console.error(err);
    showToast('فشل رفع الصورة.', 'error');
  } finally {
    setTimeout(() => {
      if (progressEl) progressEl.hidden = true;
      if (progressBar) progressBar.style.width = '0%';
    }, 600);
  }
}

function showImagePreview(target, src) {
  const placeholder = document.getElementById(`${target}-placeholder`);
  const previewWrap = document.getElementById(`${target}-preview-wrap`);
  const previewImg  = document.getElementById(`${target}-preview`);
  if (placeholder) placeholder.style.display = 'none';
  if (previewWrap) previewWrap.hidden = false;
  if (previewImg)  previewImg.src = src;
}

function hideImagePreview(target) {
  const placeholder = document.getElementById(`${target}-placeholder`);
  const previewWrap = document.getElementById(`${target}-preview-wrap`);
  if (placeholder) placeholder.style.display = '';
  if (previewWrap) previewWrap.hidden = true;
}

/* ============================================================
   BULK CREATE PROJECTS
   ============================================================ */
document.getElementById('bulk-create-btn')?.addEventListener('click',  openBulkForm);
document.getElementById('bulk-form-close')?.addEventListener('click',  closeBulkForm);
document.getElementById('bulk-form-cancel')?.addEventListener('click', closeBulkForm);
document.getElementById('bulk-form')?.addEventListener('submit', saveBulkProjects);

function openBulkForm() {
  const panel = document.getElementById('bulk-form-panel');
  if (!panel) return;

  resetBulkForm();

  const categorySelect = document.getElementById('bulk-category');
  if (categorySelect) {
    categorySelect.innerHTML = '<option value="">— اختر التصنيف —</option>';
    state.categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      categorySelect.appendChild(opt);
    });
  }

  panel.hidden = false;
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeBulkForm() {
  const panel = document.getElementById('bulk-form-panel');
  if (panel) panel.hidden = true;
  resetBulkForm();
}

function resetBulkForm() {
  document.getElementById('bulk-form')?.reset();
  state.bulkFiles = [];
  renderBulkFilesPreview();

  const progressWrap = document.getElementById('bulk-progress');
  const progressBar  = document.getElementById('bulk-progress-bar');
  if (progressWrap) progressWrap.hidden = true;
  if (progressBar)  progressBar.style.width = '0%';

  const filesError = document.getElementById('bulk-files-error');
  if (filesError) filesError.textContent = '';
}

/* ── Multi-select + drag & drop image upload ── */
const bulkZone  = document.getElementById('bulk-upload-zone');
const bulkInput = document.getElementById('bulk-file-input');

bulkZone?.addEventListener('click', () => bulkInput?.click());

bulkZone?.addEventListener('dragover',  e => { e.preventDefault(); bulkZone.classList.add('drag-over'); });
bulkZone?.addEventListener('dragleave', () => bulkZone.classList.remove('drag-over'));
bulkZone?.addEventListener('drop', e => {
  e.preventDefault();
  bulkZone.classList.remove('drag-over');
  addBulkFiles(e.dataTransfer?.files);
});

bulkInput?.addEventListener('change', e => {
  addBulkFiles(e.target.files);
  e.target.value = '';
});

function addBulkFiles(fileList) {
  const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/'));
  if (!files.length) return;
  state.bulkFiles.push(...files);
  renderBulkFilesPreview();
}

function renderBulkFilesPreview() {
  const preview = document.getElementById('bulk-files-preview');
  if (!preview) return;

  if (!state.bulkFiles.length) {
    preview.innerHTML = '';
    return;
  }

  preview.innerHTML = `
    <div class="bulk-files-count">${state.bulkFiles.length} صورة محددة — سيتم إنشاء ${state.bulkFiles.length} مشروع</div>
    <div class="bulk-files-grid">
      ${state.bulkFiles.map((file, i) => `
        <div class="bulk-file-thumb-wrap">
          <img class="bulk-file-thumb" src="${URL.createObjectURL(file)}" alt="${escHtml(file.name)}" />
          <button type="button" class="gallery-thumb-remove" data-index="${i}" aria-label="إزالة">×</button>
        </div>
      `).join('')}
    </div>
  `;

  preview.querySelectorAll('.gallery-thumb-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      state.bulkFiles.splice(parseInt(btn.dataset.index), 1);
      renderBulkFilesPreview();
    });
  });
}

async function saveBulkProjects(e) {
  e.preventDefault();

  const title = document.getElementById('bulk-title')?.value.trim();
  if (!title) {
    setFieldError('bulk-title-error', 'العنوان مطلوب.');
    return;
  }
  document.getElementById('bulk-title-error').textContent = '';

  if (!state.bulkFiles.length) {
    setFieldError('bulk-files-error', 'الرجاء اختيار صورة واحدة على الأقل.');
    return;
  }
  document.getElementById('bulk-files-error').textContent = '';

  setLoading('bulk-save-btn', 'bulk-save-spinner', 'bulk-save-text', true, 'جاري الإنشاء…');

  const progressWrap    = document.getElementById('bulk-progress');
  const progressBar     = document.getElementById('bulk-progress-bar');
  const progressText    = document.getElementById('bulk-progress-text');
  const progressPercent = document.getElementById('bulk-progress-percent');

  if (progressWrap) progressWrap.hidden = false;
  if (progressText) progressText.textContent = 'جاري رفع الصور…';

  try {
    const categoryId = document.getElementById('bulk-category')?.value || '';
    const category   = state.categories.find(c => c.id === categoryId);

    const tagsRaw = document.getElementById('bulk-tags')?.value || '';
    const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);

    const coverImages = await uploadManyToCloudinary(state.bulkFiles, 'cover', pct => {
      if (progressBar)     progressBar.style.width = `${pct}%`;
      if (progressPercent) progressPercent.textContent = `${pct}%`;
    });

    if (progressText) progressText.textContent = 'جاري إنشاء المشاريع…';

    const baseData = {
      title,
      status:          document.getElementById('bulk-status')?.value || 'draft',
      categoryId,
      categoryName:    category?.name || '',
      date:            new Date().toISOString().split('T')[0],
      description:     '',
      longDescription: '',
      tags,
      featured:        false,
      featuredOrder:   0,
      gallery:         [],
      links:           [],
      journey:         [],
    };

    const ids = await createProjectsBatch(baseData, coverImages);

    ids.forEach((id, i) => {
      state.projects.unshift({ id, ...baseData, coverImage: coverImages[i] });
    });

    closeBulkForm();
    renderProjectsList();
    renderDashboard();
    showToast(`تم إنشاء ${ids.length} مشروع بنجاح.`, 'success');

  } catch (err) {
    console.error(err);
    showToast('تعذّر إنشاء المشاريع.', 'error');
  } finally {
    setLoading('bulk-save-btn', 'bulk-save-spinner', 'bulk-save-text', false, 'إنشاء المشاريع');
    if (progressWrap) progressWrap.hidden = true;
    if (progressBar)  progressBar.style.width = '0%';
  }
}

/* ============================================================
   CATEGORIES
   ============================================================ */
document.getElementById('new-category-btn')?.addEventListener('click',   () => openCategoryForm(null));
document.getElementById('category-form-close')?.addEventListener('click',  closeCategoryForm);
document.getElementById('category-form-cancel')?.addEventListener('click', closeCategoryForm);
document.getElementById('category-form')?.addEventListener('submit', saveCategory);

function renderCategoriesList() {
  const list = document.getElementById('categories-list');
  if (!list) return;

  if (!state.categories.length) {
    list.innerHTML = '<p style="padding:2rem;text-align:center;color:var(--color-text-secondary);font-size:var(--text-sm)">لا توجد تصنيفات بعد.</p>';
    return;
  }

  // Count all projects per category from live project data,
  // since stored projectCount fields on category docs are not kept in sync.
  const counts = {};
  state.projects.forEach(p => {
    counts[p.categoryId] = (counts[p.categoryId] || 0) + 1;
  });

  list.innerHTML = `
    <div class="admin-list" style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-xl);overflow:hidden">
      ${state.categories.map(c => `
        <div class="admin-list-item">
          <div class="admin-list-info">
            <div class="admin-list-title">${escHtml(c.name)}</div>
            <div class="admin-list-meta">${counts[c.id] || 0} مشروع · الترتيب: ${c.order || 1}${c.description ? ` · ${escHtml(c.description)}` : ''}</div>
          </div>
          <div class="admin-list-actions">
            <button class="icon-btn" data-edit-category="${c.id}" aria-label="تعديل ${escHtml(c.name)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-btn danger" data-delete-category="${c.id}" data-delete-title="${escHtml(c.name)}" aria-label="حذف ${escHtml(c.name)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  list.querySelectorAll('[data-edit-category]').forEach(btn =>
    btn.addEventListener('click', () => openCategoryForm(btn.dataset.editCategory)));
  list.querySelectorAll('[data-delete-category]').forEach(btn =>
    btn.addEventListener('click', () => confirmDelete('category', btn.dataset.deleteCategory, btn.dataset.deleteTitle)));
}

function openCategoryForm(categoryId) {
  const panel = document.getElementById('category-form-panel');
  if (!panel) return;

  document.getElementById('category-form')?.reset();

  if (categoryId) {
    state.editingCategoryId = categoryId;
    document.getElementById('category-form-title').textContent = 'تعديل التصنيف';
    document.getElementById('category-id').value = categoryId;
    const cat = state.categories.find(c => c.id === categoryId);
    if (cat) {
      setVal('category-name',        cat.name);
      setVal('category-order',       cat.order || 1);
      setVal('category-description', cat.description || '');
    }
  } else {
    state.editingCategoryId = null;
    document.getElementById('category-form-title').textContent = 'تصنيف جديد';
    document.getElementById('category-id').value = '';
  }

  panel.hidden = false;
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeCategoryForm() {
  const panel = document.getElementById('category-form-panel');
  if (panel) panel.hidden = true;
  state.editingCategoryId = null;
}

async function saveCategory(e) {
  e.preventDefault();
  const name = document.getElementById('category-name')?.value.trim();
  if (!name) { setFieldError('category-name-error', 'الاسم مطلوب.'); return; }
  document.getElementById('category-name-error').textContent = '';

  setLoading('category-save-btn', 'category-save-spinner', 'category-save-text', true, 'جاري الحفظ…');

  try {
    const data = {
      name,
      slug:        generateSlug(name),
      order:       parseInt(document.getElementById('category-order')?.value) || 1,
      description: document.getElementById('category-description')?.value.trim() || '',
    };

    if (state.editingCategoryId) {
      await updateCategory(state.editingCategoryId, data);
      const idx = state.categories.findIndex(c => c.id === state.editingCategoryId);
      if (idx !== -1) state.categories[idx] = { ...state.categories[idx], ...data };
    } else {
      const ref = await createCategory(data);
      state.categories.push({ id: ref.id, projectCount: 0, ...data });
    }

    closeCategoryForm();
    renderCategoriesList();
    showToast('تم حفظ التصنيف بنجاح.', 'success');

  } catch (err) {
    console.error(err);
    showToast('تعذّر حفظ التصنيف.', 'error');
  } finally {
    setLoading('category-save-btn', 'category-save-spinner', 'category-save-text', false, 'حفظ التصنيف');
  }
}

/* ============================================================
   SITE CONFIG
   ============================================================ */
document.getElementById('site-config-form')?.addEventListener('submit', saveSiteConfigForm);
document.getElementById('add-social-btn')?.addEventListener('click', () => addSocialLink());

function renderConfigForm() {
  const config = state.config || {};
  setVal('config-name',  config.ownerName  || '');
  setVal('config-title', config.ownerTitle || '');
  setVal('config-bio',   config.ownerBio   || '');
  setVal('config-email', config.ownerEmail || '');

  if (config.ownerPhoto) {
    state.profilePhoto = config.ownerPhoto;
    showImagePreview('photo', config.ownerPhoto);
  }

  const container = document.getElementById('social-links-container');
  if (container) {
    container.innerHTML = '';
    (config.socialLinks || []).forEach(s => addSocialLink(s));
  }
}

function addSocialLink(data = {}) {
  const container = document.getElementById('social-links-container');
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'link-row';
  div.innerHTML = `
    <input type="text" class="form-input social-platform-input" placeholder="المنصة (GitHub، Twitter…)" value="${escHtml(data.platform || '')}" style="max-width:180px" />
    <input type="url"  class="form-input social-url-input"       placeholder="https://…" value="${escHtml(data.url || '')}" />
    <button type="button" class="icon-btn danger social-remove-btn" aria-label="إزالة">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>
  `;
  div.querySelector('.social-remove-btn')?.addEventListener('click', () => div.remove());
  container.appendChild(div);
}

async function saveSiteConfigForm(e) {
  e.preventDefault();
  setLoading('config-save-btn', 'config-save-spinner', 'config-save-text', true, 'جاري الحفظ…');

  try {
    /* Scope selector to social-links-container to avoid catching project link rows */
    const socialRows = document.querySelectorAll('#social-links-container .link-row');
    const socialLinks = Array.from(socialRows).map(div => ({
      platform: div.querySelector('.social-platform-input')?.value.trim() || '',
      url:      div.querySelector('.social-url-input')?.value.trim() || '',
    })).filter(l => l.platform && l.url);

    const data = {
      ownerName:   document.getElementById('config-name')?.value.trim()  || '',
      ownerTitle:  document.getElementById('config-title')?.value.trim() || '',
      ownerBio:    document.getElementById('config-bio')?.value.trim()   || '',
      ownerEmail:  document.getElementById('config-email')?.value.trim() || '',
      ownerPhoto:  state.profilePhoto || state.config?.ownerPhoto || '',
      socialLinks,
    };

    await saveSiteConfig(data);
    state.config = { ...state.config, ...data };
    showToast('تم حفظ الملف الشخصي بنجاح.', 'success');

  } catch (err) {
    console.error(err);
    showToast('تعذّر حفظ الملف الشخصي.', 'error');
  } finally {
    setLoading('config-save-btn', 'config-save-spinner', 'config-save-text', false, 'حفظ التغييرات');
  }
}

/* ============================================================
   DELETE CONFIRMATION
   ============================================================ */
function confirmDelete(type, id, name) {
  const modal   = document.getElementById('delete-modal');
  const textEl  = document.getElementById('delete-modal-text');
  const titleEl = document.getElementById('delete-modal-title');
  if (!modal) return;

  const typeLabel = type === 'project' ? 'المشروع' : 'التصنيف';
  if (titleEl) titleEl.textContent = `حذف ${typeLabel}`;
  if (textEl)  textEl.textContent  = `هل أنت متأكد من حذف "${name}"؟ لا يمكن التراجع عن هذا الإجراء.`;

  state.deleteTarget = { type, id };
  modal.hidden = false;
}

document.getElementById('delete-cancel')?.addEventListener('click', () => {
  document.getElementById('delete-modal').hidden = true;
  state.deleteTarget = null;
});

document.getElementById('delete-confirm')?.addEventListener('click', async () => {
  if (!state.deleteTarget) return;
  setLoading('delete-confirm', 'delete-spinner', 'delete-confirm-text', true, 'جاري الحذف…');

  try {
    const { type, id } = state.deleteTarget;
    if (type === 'project') {
      await deleteProject(id);
      state.projects = state.projects.filter(p => p.id !== id);
      renderProjectsList();
      renderDashboard();
    } else if (type === 'category') {
      await deleteCategory(id);
      state.categories = state.categories.filter(c => c.id !== id);
      renderCategoriesList();
    }
    document.getElementById('delete-modal').hidden = true;
    showToast('تم الحذف بنجاح.', 'success');
  } catch (err) {
    console.error(err);
    showToast('تعذّر الحذف.', 'error');
  } finally {
    setLoading('delete-confirm', 'delete-spinner', 'delete-confirm-text', false, 'حذف');
    state.deleteTarget = null;
  }
});

/* ============================================================
   UTILITIES
   ============================================================ */
function showToast(message, type = 'default') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function setLoading(btnId, spinnerId, textId, loading, text) {
  const btn     = document.getElementById(btnId);
  const spinner = document.getElementById(spinnerId);
  const textEl  = document.getElementById(textId);
  if (btn)     btn.disabled   = loading;
  if (spinner) spinner.hidden = !loading;
  if (textEl)  textEl.textContent = text;
}

function setFieldError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.type === 'checkbox') el.checked = !!val;
  else el.value = val ?? '';
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try { return new Date(dateStr).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short' }); }
  catch { return dateStr; }
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
