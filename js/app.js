/* ============================================================
   APP.JS — Visitor Site Controller (Arabic RTL)
   ============================================================ */

import {
  getSiteConfig, getCategories,
  getProject, incrementViewCount,
  onProjectsChange
} from './firebase.js';

/* ── State ── */
const state = {
  config:     null,
  categories: [],
  projects:   [],
  featured:   [],
  activeCategory: 'all',
  unsubscribe: null,
  /* image viewer */
  viewerImages: [],
  viewerIndex:  0,
};

/* ============================================================
   BOOT
   ============================================================ */
async function boot() {
  setupNav();
  setupSearch();
  setupProjectOverlay();
  setupImageViewer();
  setupScrollReveal();
  setupMobileMenu();

  try {
    const [config, categories] = await Promise.all([
      getSiteConfig(),
      getCategories(),
    ]);

    state.config     = config;
    state.categories = categories;

    renderConfig(config);
    renderCategories(categories);
    renderFilterTabs(categories);

    state.unsubscribe = onProjectsChange(projects => {
      state.projects = projects;
      renderFeatured(projects.filter(p => p.featured));
      renderArchive();
      renderCategories(state.categories);
    });

  } catch (err) {
    console.error('Boot error:', err);
    showToast('تعذّر تحميل المحتوى.', 'error');
    renderFallback();
  }
}

/* ============================================================
   SITE CONFIG
   ============================================================ */
function renderConfig(config) {
  if (!config) return;

  const { ownerName, ownerTitle, ownerBio, ownerPhoto,
          ownerEmail, socialLinks } = config;

  const navName = document.getElementById('nav-name');
  if (navName) navName.textContent = ownerName || 'الأرشيف';

  const heroNameLine = document.getElementById('hero-name-line');
  if (heroNameLine) heroNameLine.textContent = 'مرحباً، أنا —';

  const heroName = document.getElementById('hero-name');
  if (heroName) heroName.textContent = ownerName || '';

  const heroTaglineEl = document.getElementById('hero-tagline');
  if (heroTaglineEl) heroTaglineEl.textContent = ownerTitle || '';

  const heroBio = document.getElementById('hero-bio');
  if (heroBio) heroBio.textContent = ownerBio || '';

  const photo = document.getElementById('hero-photo');
  const photoPlaceholder = document.getElementById('hero-photo-placeholder');
  if (ownerPhoto && photo) {
    photo.src = ownerPhoto;
    photo.style.display = 'block';
    if (photoPlaceholder) photoPlaceholder.style.display = 'none';
  }

  renderSocialLinks(ownerEmail, socialLinks || []);

  const footerName = document.getElementById('footer-name');
  if (footerName) footerName.textContent = ownerName || 'الأرشيف';

  const contactBtn = document.getElementById('contact-email-btn');
  if (contactBtn && ownerEmail) {
    contactBtn.href = `mailto:${ownerEmail}`;
    contactBtn.textContent = 'أرسل رسالة';
  }

  const contactSocial = document.getElementById('contact-social');
  if (contactSocial) {
    contactSocial.innerHTML = '';
    (socialLinks || []).forEach(s => {
      const a = document.createElement('a');
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'social-link';
      a.innerHTML = `${socialIcon(s.platform)}<span>${s.platform}</span>`;
      contactSocial.appendChild(a);
    });
  }

  document.title = ownerName ? `${ownerName} — الأرشيف الرقمي` : 'الأرشيف الرقمي';

  const badge = document.getElementById('hero-badge');
  if (badge) badge.style.opacity = '1';
}

function renderSocialLinks(email, links) {
  const container = document.getElementById('hero-social');
  if (!container) return;
  container.innerHTML = '';

  if (email) {
    const a = document.createElement('a');
    a.href = `mailto:${email}`;
    a.className = 'social-link';
    a.innerHTML = `${socialIcon('email')}<span>بريد إلكتروني</span>`;
    container.appendChild(a);
  }

  links.forEach(l => {
    const a = document.createElement('a');
    a.href = l.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'social-link';
    a.innerHTML = `${socialIcon(l.platform)}<span>${l.platform}</span>`;
    container.appendChild(a);
  });
}

/* ============================================================
   FEATURED PROJECTS
   ============================================================ */
function renderFeatured(projects) {
  const grid = document.getElementById('featured-grid');
  if (!grid) return;

  grid.innerHTML = '';

  if (!projects.length) {
    const all = state.projects.filter(p => p.status === 'published').slice(0, 3);
    if (!all.length) {
      grid.innerHTML = '<p class="text-secondary text-sm">لا توجد مشاريع مميزة بعد.</p>';
      return;
    }
    all.forEach((p, i) => grid.appendChild(buildProjectCard(p, 'featured-card', i)));
    return;
  }

  projects.slice(0, 6).forEach((p, i) => {
    const card = buildProjectCard(p, 'featured-card', i);
    grid.appendChild(card);
  });

  revealItems(grid.querySelectorAll('.project-card'));
}

/* ============================================================
   CATEGORIES
   ============================================================ */
function renderCategories(categories) {
  const grid = document.getElementById('categories-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!categories.length) {
    grid.innerHTML = '<p class="text-secondary text-sm">لا توجد تصنيفات بعد.</p>';
    return;
  }

  // Count published projects per category from live project data,
  // since stored projectCount fields on category docs are not kept in sync.
  const counts = {};
  state.projects.forEach(p => {
    counts[p.categoryId] = (counts[p.categoryId] || 0) + 1;
  });

  categories.forEach((cat, i) => {
    const card = document.createElement('div');
    card.className = 'category-card reveal';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `تصفية حسب ${cat.name}`);
    card.dataset.categoryId = cat.id;
    card.innerHTML = `
      <div class="category-card-icon">${categoryIcon(cat.name)}</div>
      <div class="category-card-name">${escHtml(cat.name)}</div>
      <div class="category-card-count">${counts[cat.id] || 0} مشروع</div>
      ${cat.description ? `<div class="category-card-desc">${escHtml(cat.description)}</div>` : ''}
    `;
    card.addEventListener('click', () => filterByCategory(cat.id));
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') filterByCategory(cat.id); });
    grid.appendChild(card);
  });

  revealItems(grid.querySelectorAll('.category-card'));
}

/* ============================================================
   ARCHIVE & FILTERS
   ============================================================ */
function renderFilterTabs(categories) {
  const tabs = document.getElementById('filter-tabs');
  if (!tabs) return;

  tabs.innerHTML = '<button class="filter-tab active" data-category="all" role="tab" aria-selected="true">الكل</button>';

  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'filter-tab';
    btn.dataset.category = cat.id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', 'false');
    btn.textContent = cat.name;
    tabs.appendChild(btn);
  });

  tabs.addEventListener('click', e => {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    tabs.querySelectorAll('.filter-tab').forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    state.activeCategory = tab.dataset.category;
    renderArchive();
  });
}

function filterByCategory(categoryId) {
  state.activeCategory = categoryId;

  const tabs = document.getElementById('filter-tabs');
  if (tabs) {
    tabs.querySelectorAll('.filter-tab').forEach(t => {
      const isTarget = t.dataset.category === categoryId;
      t.classList.toggle('active', isTarget);
      t.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });
  }

  const archiveEl = document.getElementById('archive');
  if (archiveEl) archiveEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

  renderArchive();
}

function renderArchive() {
  const grid  = document.getElementById('archive-grid');
  const empty = document.getElementById('archive-empty');
  if (!grid) return;

  let projects = state.projects.filter(p => p.status === 'published');

  if (state.activeCategory !== 'all') {
    projects = projects.filter(p => p.categoryId === state.activeCategory);
  }

  grid.innerHTML = '';

  if (!projects.length) {
    if (empty) empty.hidden = false;
    return;
  }

  if (empty) empty.hidden = true;

  projects.forEach((p, i) => {
    const card = buildProjectCard(p, 'archive-card', i);
    grid.appendChild(card);
  });

  revealItems(grid.querySelectorAll('.project-card'));
}

/* ============================================================
   PROJECT CARD BUILDER
   ============================================================ */
function buildProjectCard(project, extraClass = '', index = 0) {
  const card = document.createElement('article');
  card.className = `project-card ${extraClass} reveal reveal-delay-${Math.min(index % 5 + 1, 5)}`;
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `عرض المشروع: ${project.title}`);
  card.dataset.projectId = project.id;

  const tagsHtml = (project.tags || []).slice(0, 3).map(t =>
    `<span class="tag">${escHtml(t)}</span>`
  ).join('');

  const featuredBadge = project.featured
    ? `<div class="project-card-featured-badge">مميز</div>`
    : '';

  const imgHtml = project.coverImage
    ? `<img class="project-card-img" src="${project.coverImage}" alt="${escHtml(project.title)}" loading="lazy" decoding="async" />`
    : `<div class="project-card-img-placeholder">
         <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
       </div>`;

  card.innerHTML = `
    <div class="project-card-img-wrap">
      ${imgHtml}
      ${featuredBadge}
    </div>
    <div class="project-card-body">
      ${project.categoryName ? `<div class="project-card-category">${escHtml(project.categoryName)}</div>` : ''}
      <h3 class="project-card-title">${escHtml(project.title || 'بدون عنوان')}</h3>
      <p class="project-card-desc">${escHtml(project.description || '')}</p>
      <div class="project-card-meta">
        <div class="project-card-tags">${tagsHtml}</div>
        ${project.date ? `<span class="project-card-date">${formatDate(project.date)}</span>` : ''}
      </div>
    </div>
  `;

  card.addEventListener('click', () => openProject(project.id));
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') openProject(project.id);
  });

  return card;
}

/* ============================================================
   PROJECT FULLSCREEN OVERLAY
   ============================================================ */
function setupProjectOverlay() {
  const overlay  = document.getElementById('project-overlay');
  const backdrop = document.getElementById('project-backdrop');
  const closeBtn = document.getElementById('project-close-btn');

  if (!overlay) return;

  backdrop?.addEventListener('click', closeProject);
  closeBtn?.addEventListener('click', closeProject);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !overlay.hidden) closeProject();
  });
}

async function openProject(id) {
  const overlay = document.getElementById('project-overlay');
  const detail  = document.getElementById('project-detail');
  const panel   = document.getElementById('project-panel');
  if (!overlay || !detail) return;

  detail.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:5rem;color:var(--color-text-secondary);gap:var(--space-3)">
      <span style="width:18px;height:18px;border:2px solid var(--color-border);border-top-color:var(--color-primary);border-radius:50%;animation:spin 0.7s linear infinite;display:inline-block"></span>
      جاري التحميل…
    </div>`;

  overlay.hidden = false;
  document.body.style.overflow = 'hidden';

  if (panel) panel.scrollTop = 0;

  try {
    const project = await getProject(id);
    if (!project) { showToast('المشروع غير موجود.', 'error'); closeProject(); return; }

    incrementViewCount(id).catch(() => {});
    renderProjectDetail(project, detail);

  } catch (err) {
    console.error(err);
    showToast('تعذّر تحميل المشروع.', 'error');
    closeProject();
  }
}

function closeProject() {
  const overlay = document.getElementById('project-overlay');
  if (!overlay) return;
  overlay.hidden = true;
  document.body.style.overflow = '';
}

function renderProjectDetail(project, container) {
  const tagsHtml = (project.tags || []).map(t =>
    `<span class="tag tag-accent">${escHtml(t)}</span>`
  ).join('');

  const linksHtml = (project.links || []).map(l =>
    `<a href="${escHtml(l.url)}" target="_blank" rel="noopener noreferrer" class="project-detail-link">
       <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
       ${escHtml(l.label || 'عرض')}
     </a>`
  ).join('');

  /* Collect all gallery images for the viewer */
  const galleryImgs = project.gallery || [];

  const galleryHtml = galleryImgs.length
    ? `<div class="project-gallery">
         ${galleryImgs.map((img, i) =>
           `<img class="project-gallery-img" src="${img}" alt="صورة المعرض ${i+1}" loading="lazy" decoding="async" data-viewer-index="${i}" />`
         ).join('')}
       </div>`
    : '';

  const journeyHtml = (project.journey || []).length
    ? `<div class="project-journey">
         <div class="project-journey-label">مراحل المشروع</div>
         ${(project.journey || [])
           .sort((a, b) => (a.order || 0) - (b.order || 0))
           .map((section, i, arr) => buildJourneySection(section, i === arr.length - 1))
           .join('')}
       </div>`
    : '';

  /* Cover image — no forced crop, contain mode */
  const coverHtml = project.coverImage
    ? `<div class="project-cover-wrap">
         <img class="project-cover" src="${project.coverImage}" alt="${escHtml(project.title)}" loading="eager" decoding="async" />
       </div>`
    : `<div class="project-cover-placeholder">
         <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
       </div>`;

  container.innerHTML = `
    ${coverHtml}
    <div class="project-detail-body">
      ${project.categoryName ? `<div class="project-detail-category">${escHtml(project.categoryName)}</div>` : ''}
      <h2 class="project-detail-title">${escHtml(project.title || 'بدون عنوان')}</h2>

      <div class="project-detail-meta">
        ${project.date ? `<span class="project-detail-date">${formatDate(project.date)}</span>` : ''}
        <div class="project-detail-tags">${tagsHtml}</div>
        ${linksHtml ? `<div class="project-detail-links">${linksHtml}</div>` : ''}
      </div>

      <p class="project-detail-desc">${escHtml(project.longDescription || project.description || '')}</p>

      ${galleryHtml}
      ${journeyHtml}
    </div>
  `;

  /* Bind image viewer to gallery and journey images */
  const allViewerImgs = [];

  /* Cover image click opens viewer */
  const coverImg = container.querySelector('.project-cover');
  if (coverImg) {
    allViewerImgs.push(coverImg.src);
    const coverIdx = 0;
    coverImg.style.cursor = 'zoom-in';
    coverImg.addEventListener('click', () => openImageViewer([coverImg.src], 0));
  }

  /* Gallery images */
  const galleryElements = Array.from(container.querySelectorAll('.project-gallery-img'));
  const gallerySrcs = galleryElements.map(img => img.src);
  galleryElements.forEach((img, idx) => {
    img.addEventListener('click', () => openImageViewer(gallerySrcs, idx));
  });

  /* Journey images */
  container.querySelectorAll('.journey-image, .journey-gallery-img').forEach(img => {
    img.addEventListener('click', () => openImageViewer([img.src], 0));
  });

  /* Portrait detection for gallery images */
  galleryElements.forEach(img => {
    img.addEventListener('load', () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      if (ratio < 0.85) img.classList.add('img-portrait');
    }, { once: true });
  });
}

function buildJourneySection(section, isLast) {
  const imgHtml = section.image
    ? `<img class="journey-image" src="${section.image}" alt="${escHtml(section.title || 'صورة المرحلة')}" loading="lazy" />`
    : '';

  const galleryHtml = (section.gallery || []).length
    ? `<div class="journey-gallery">
         ${section.gallery.map(img =>
           `<img class="journey-gallery-img" src="${img}" alt="صورة المرحلة" loading="lazy" />`
         ).join('')}
       </div>`
    : '';

  return `
    <div class="journey-section">
      <div class="journey-timeline">
        <div class="journey-dot"></div>
        ${!isLast ? '<div class="journey-line"></div>' : ''}
      </div>
      <div class="journey-content">
        <h3 class="journey-title">${escHtml(section.title || '')}</h3>
        <p class="journey-desc">${escHtml(section.description || '')}</p>
        ${imgHtml}
        ${galleryHtml}
      </div>
    </div>
  `;
}

/* ============================================================
   FULLSCREEN IMAGE VIEWER
   ============================================================ */
function setupImageViewer() {
  const viewer   = document.getElementById('image-viewer');
  const backdrop = document.getElementById('image-viewer-backdrop');
  const closeBtn = document.getElementById('image-viewer-close');
  const prevBtn  = document.getElementById('image-viewer-prev');
  const nextBtn  = document.getElementById('image-viewer-next');

  if (!viewer) return;

  backdrop?.addEventListener('click', closeImageViewer);
  closeBtn?.addEventListener('click', closeImageViewer);

  prevBtn?.addEventListener('click', e => { e.stopPropagation(); navigateViewer(-1); });
  nextBtn?.addEventListener('click', e => { e.stopPropagation(); navigateViewer(1); });

  document.addEventListener('keydown', e => {
    if (viewer.hidden) return;
    if (e.key === 'Escape')     closeImageViewer();
    if (e.key === 'ArrowRight') navigateViewer(-1); /* RTL: right = prev */
    if (e.key === 'ArrowLeft')  navigateViewer(1);  /* RTL: left = next */
  });
}

function openImageViewer(images, startIndex = 0) {
  const viewer  = document.getElementById('image-viewer');
  const img     = document.getElementById('image-viewer-img');
  const prevBtn = document.getElementById('image-viewer-prev');
  const nextBtn = document.getElementById('image-viewer-next');

  if (!viewer || !img) return;

  state.viewerImages = images;
  state.viewerIndex  = startIndex;

  img.src = images[startIndex];
  viewer.hidden = false;
  document.body.style.overflow = 'hidden';

  const multi = images.length > 1;
  if (prevBtn) prevBtn.hidden = !multi;
  if (nextBtn) nextBtn.hidden = !multi;

  updateViewerCounter();
}

function navigateViewer(dir) {
  const len = state.viewerImages.length;
  if (len <= 1) return;
  state.viewerIndex = (state.viewerIndex + dir + len) % len;
  const img = document.getElementById('image-viewer-img');
  if (img) {
    img.style.animation = 'none';
    img.offsetHeight; /* reflow */
    img.style.animation = '';
    img.src = state.viewerImages[state.viewerIndex];
  }
  updateViewerCounter();
}

function updateViewerCounter() {
  const counter = document.getElementById('image-viewer-counter');
  if (!counter) return;
  if (state.viewerImages.length <= 1) { counter.textContent = ''; return; }
  counter.textContent = `${state.viewerIndex + 1} / ${state.viewerImages.length}`;
}

function closeImageViewer() {
  const viewer = document.getElementById('image-viewer');
  if (!viewer) return;
  viewer.hidden = true;
  /* Only restore scroll if project overlay is also closed */
  const overlay = document.getElementById('project-overlay');
  if (!overlay || overlay.hidden) {
    document.body.style.overflow = '';
  }
}

/* ============================================================
   NAVIGATION
   ============================================================ */
function setupNav() {
  const nav = document.getElementById('site-nav');
  if (!nav) return;

  const onScroll = throttle(() => {
    nav.classList.toggle('scrolled', window.scrollY > 10);
  }, 80);

  window.addEventListener('scroll', onScroll, { passive: true });

  const sections = ['hero', 'featured', 'categories', 'archive', 'contact'];
  const navLinks = document.querySelectorAll('.nav-link');

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navLinks.forEach(l => l.classList.toggle('active', l.getAttribute('href') === `#${id}`));
      }
    });
  }, { threshold: 0.4 });

  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  });
}

/* ============================================================
   MOBILE MENU
   ============================================================ */
function setupMobileMenu() {
  const nav  = document.getElementById('site-nav');
  const btn  = document.getElementById('mobile-menu-btn');
  const menu = document.getElementById('mobile-menu');
  if (!nav || !btn || !menu) return;

  btn.addEventListener('click', () => {
    const open = nav.classList.toggle('menu-open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
  });

  menu.querySelectorAll('.mobile-nav-link').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('menu-open');
      btn.setAttribute('aria-expanded', 'false');
      menu.setAttribute('aria-hidden', 'true');
    });
  });
}

/* ============================================================
   SEARCH
   ============================================================ */
function setupSearch() {
  const overlay  = document.getElementById('search-overlay');
  const backdrop = document.getElementById('search-backdrop');
  const input    = document.getElementById('search-input');
  const results  = document.getElementById('search-results');
  const openBtn  = document.getElementById('search-toggle-btn');
  const closeBtn = document.getElementById('search-close-btn');

  if (!overlay) return;

  function openSearch() {
    overlay.hidden = false;
    input?.focus();
  }

  function closeSearch() {
    overlay.hidden = true;
    if (input) input.value = '';
    if (results) results.innerHTML = '';
  }

  openBtn?.addEventListener('click', openSearch);
  backdrop?.addEventListener('click', closeSearch);
  closeBtn?.addEventListener('click', closeSearch);

  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
    if (e.key === 'Escape' && !overlay.hidden) closeSearch();
  });

  input?.addEventListener('input', debounce(e => {
    const q = e.target.value.trim();
    if (!q) { results.innerHTML = ''; return; }
    performSearch(q, results);
  }, 200));
}

function performSearch(query, container) {
  const q = query.toLowerCase();
  const matches = state.projects
    .filter(p => p.status === 'published')
    .filter(p =>
      p.title?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.tags?.some(t => t.toLowerCase().includes(q)) ||
      p.categoryName?.toLowerCase().includes(q)
    )
    .slice(0, 8);

  if (!matches.length) {
    container.innerHTML = `<div class="search-empty">لا نتائج لـ "${escHtml(query)}"</div>`;
    return;
  }

  container.innerHTML = matches.map(p => `
    <div class="search-result-item" role="button" tabindex="0" data-project-id="${p.id}">
      ${p.coverImage
        ? `<img class="search-result-thumb" src="${p.coverImage}" alt="" loading="lazy" />`
        : `<div class="search-result-thumb" style="background:var(--color-bg-alt)"></div>`}
      <div class="search-result-info">
        <div class="search-result-title">${escHtml(p.title || 'بدون عنوان')}</div>
        <div class="search-result-cat">${escHtml(p.categoryName || '')}</div>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.search-result-item').forEach(item => {
    const handler = () => {
      document.getElementById('search-overlay').hidden = true;
      openProject(item.dataset.projectId);
    };
    item.addEventListener('click', handler);
    item.addEventListener('keydown', e => { if (e.key === 'Enter') handler(); });
  });
}

/* ============================================================
   SCROLL REVEAL
   ============================================================ */
function setupScrollReveal() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  window._revealObserver = observer;
}

function revealItems(elements) {
  const observer = window._revealObserver;
  elements.forEach(el => {
    el.classList.remove('visible');
    if (observer) observer.observe(el);
  });
}

/* ============================================================
   TOAST
   ============================================================ */
function showToast(message, type = 'default') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toast-out 0.3s var(--ease-in) forwards';
    toast.addEventListener('animationend', () => toast.remove());
  }, 3500);
}

/* ============================================================
   FALLBACK
   ============================================================ */
function renderFallback() {
  const featuredGrid = document.getElementById('featured-grid');
  if (featuredGrid) {
    featuredGrid.innerHTML = '<p class="text-secondary text-sm" style="padding:2rem">تعذّر تحميل المشاريع. يرجى التحقق من الاتصال.</p>';
  }
}

/* ============================================================
   UTILITIES
   ============================================================ */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short' });
  } catch { return dateStr; }
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function throttle(fn, ms) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) { last = now; fn(...args); }
  };
}

function socialIcon(platform) {
  const name = (platform || '').toLowerCase();
  const icons = {
    email: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
    github: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>`,
    twitter: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    linkedin: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`,
    instagram: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`,
    behance: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7.803 5.731c.589 0 1.119.051 1.605.155.483.103.895.273 1.243.508.343.235.611.547.804.939.191.391.288.871.288 1.443 0 .619-.141 1.143-.425 1.566-.283.423-.7.775-1.254 1.05.757.219 1.318.601 1.688 1.148.369.546.554 1.206.554 1.976 0 .625-.12 1.161-.356 1.612-.237.449-.558.817-.966 1.102-.406.283-.871.491-1.393.625-.522.135-1.063.202-1.629.202H2V5.731h5.803zm-.351 4.972c.48 0 .878-.114 1.192-.345.312-.23.469-.604.469-1.118 0-.286-.051-.522-.151-.707-.103-.183-.24-.33-.416-.437-.175-.109-.378-.184-.607-.227-.23-.043-.469-.065-.719-.065H4.645v2.899h2.807zm.151 5.239c.267 0 .521-.025.762-.073.243-.049.455-.132.636-.251.182-.12.327-.282.436-.486.109-.205.162-.462.162-.77 0-.617-.173-1.057-.518-1.319-.346-.262-.798-.393-1.359-.393H4.645v3.292h2.958zm9.726.11c.267.312.68.468 1.236.468.383 0 .713-.098.994-.294.279-.196.451-.405.512-.625h2.162c-.346 1.049-.877 1.801-1.594 2.253-.717.452-1.582.678-2.596.678-.705 0-1.342-.109-1.906-.328-.567-.218-1.045-.535-1.438-.948-.391-.412-.69-.906-.898-1.478-.208-.572-.312-1.201-.312-1.888 0-.666.108-1.283.325-1.852.218-.567.524-1.058.918-1.472.393-.415.863-.737 1.41-.968.546-.231 1.147-.346 1.803-.346.735 0 1.38.143 1.938.432.558.288 1.022.675 1.392 1.163.37.488.635 1.046.795 1.677.158.631.212 1.286.164 1.961h-6.441c.037.573.218 1.04.536 1.354zm2.163-4.447c-.215-.274-.583-.41-1.106-.41-.323 0-.594.053-.813.16-.218.107-.394.24-.526.401-.133.161-.227.336-.283.524-.056.188-.09.365-.1.532h3.272c-.083-.584-.229-1.007-.444-1.207zm-3.963-5.625h4.826v1.178h-4.826V6.23z"/></svg>`,
    dribbble: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/></svg>`,
  };
  return icons[name] || `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
}

function categoryIcon(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('web') || n.includes('موقع') || n.includes('ويب')) return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
  if (n.includes('design') || n.includes('تصميم') || n.includes('ui')) return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="0.5" fill="currentColor"/><circle cx="17.5" cy="10.5" r="0.5" fill="currentColor"/><circle cx="8.5" cy="7.5" r="0.5" fill="currentColor"/><circle cx="6.5" cy="12.5" r="0.5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>`;
  if (n.includes('photo') || n.includes('تصوير')) return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`;
  if (n.includes('bot') || n.includes('ai') || n.includes('ذكاء') || n.includes('روبوت')) return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`;
  if (n.includes('report') || n.includes('تقرير')) return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`;
}

/* ── Boot ── */
boot();
