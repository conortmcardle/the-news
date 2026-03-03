const API_KEY = 'bGQSx4VVAWAFVRs4FtSDspWvZwezjaiKFBPvh7TEOmffslPu';
const TOP_STORIES_BASE = 'https://api.nytimes.com/svc/topstories/v2';
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

const SECTIONS = [
  'All', 'World', 'U.S.', 'Politics', 'Opinion',
  'Business', 'Sports', 'Arts', 'Science', 'Technology'
];

const SECTION_MAP = {
  'All':        'home',
  'World':      'world',
  'U.S.':       'us',
  'Politics':   'politics',
  'Opinion':    'opinion',
  'Business':   'business',
  'Sports':     'sports',
  'Arts':       'arts',
  'Science':    'science',
  'Technology': 'technology'
};

let currentSection = 'All';
let refreshTimer = null;
let articlesCache = {};

// ── Initialise ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Auto-redirect Kindle browsers to text-only version
  var ua = navigator.userAgent || '';
  if (/Kindle|Silk/i.test(ua)) {
    window.location.replace('text.html');
    return;
  }

  setMastheadDate();
  buildSectionNav();
  fetchArticles();
  refreshTimer = setInterval(fetchArticles, REFRESH_INTERVAL);

  // Masthead home link
  document.getElementById('masthead-home').addEventListener('click', (e) => {
    e.preventDefault();
    currentSection = 'All';
    document.querySelectorAll('#section-nav button').forEach(b => b.classList.remove('active'));
    document.querySelector('#section-nav button').classList.add('active');
    showFrontPage();
    fetchArticles();
  });

  // Detail view back buttons
  document.getElementById('detail-back').addEventListener('click', showFrontPage);
  document.getElementById('detail-back-bottom').addEventListener('click', showFrontPage);

  // Handle browser back/forward
  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.articleUrl) {
      const allCached = Object.values(articlesCache).flat();
      const article = allCached.find(a => a.url === e.state.articleUrl);
      if (article) { showArticleDetail(article, true); return; }
    }
    showFrontPage(null, true);
  });
});

// ── Masthead Date ───────────────────────────────────────────
function setMastheadDate() {
  const el = document.getElementById('masthead-date');
  const now = new Date();
  el.textContent = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

// ── Section Navigation ──────────────────────────────────────
function buildSectionNav() {
  const nav = document.getElementById('section-nav');
  SECTIONS.forEach(section => {
    const btn = document.createElement('button');
    btn.textContent = section;
    if (section === currentSection) btn.classList.add('active');
    btn.addEventListener('click', () => {
      currentSection = section;
      nav.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // If on interior page, return to front page first
      const detail = document.getElementById('article-detail');
      if (!detail.hidden) {
        showFrontPage(null, false);
      }
      fetchArticles();
    });
    nav.appendChild(btn);
  });
}

// ── Fetch Articles ──────────────────────────────────────────
async function fetchArticles() {
  const grid = document.getElementById('article-grid');
  grid.innerHTML = '<div class="loading">Loading latest articles&hellip;</div>';

  const sectionSlug = SECTION_MAP[currentSection];
  const url = `${TOP_STORIES_BASE}/${sectionSlug}.json?api-key=${API_KEY}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    const articles = (data.results || []).filter(a => a.title && a.title.trim() !== '');
    articlesCache[sectionSlug] = articles;
    renderArticles(articles);
  } catch (err) {
    grid.innerHTML = `<div class="loading">Failed to load articles. ${err.message}</div>`;
  }
}

// ── Render Articles ─────────────────────────────────────────
function renderArticles(articles) {
  const grid = document.getElementById('article-grid');
  grid.innerHTML = '';

  if (articles.length === 0) {
    grid.innerHTML = '<div class="loading">No articles found.</div>';
    return;
  }

  articles.forEach((article, i) => {
    const el = createArticleElement(article, i);
    grid.appendChild(el);
  });
}

function createArticleElement(article, index) {
  const el = document.createElement('article');
  el.className = 'article';

  // Assign layout class based on position
  if (index === 0) {
    el.classList.add('article--lead');
  } else if (index === 1 || index === 2) {
    el.classList.add('article--secondary');
  } else if (index >= 3 && index <= 5) {
    el.classList.add('article--tertiary');
  } else {
    el.classList.add('article--standard');
  }

  // Section label
  const sectionEl = document.createElement('span');
  sectionEl.className = 'article-section';
  sectionEl.textContent = capitalizeSection(article.section, article.subsection);
  el.appendChild(sectionEl);

  // Thumbnail for lead and secondary articles
  const imageUrl = getImageUrl(article);
  if (imageUrl && index <= 2) {
    const img = document.createElement('img');
    img.className = 'article-image';
    img.src = imageUrl;
    img.alt = article.title || '';
    img.loading = 'lazy';
    el.appendChild(img);
  }

  // Headline (click opens interior page)
  const headlineEl = document.createElement('h2');
  headlineEl.className = 'article-headline';
  const link = document.createElement('a');
  link.href = '#';
  link.textContent = article.title || '';
  link.addEventListener('click', (e) => {
    e.preventDefault();
    showArticleDetail(article);
  });
  headlineEl.appendChild(link);
  el.appendChild(headlineEl);

  // Meta: byline + date
  const metaEl = document.createElement('div');
  metaEl.className = 'article-meta';

  if (article.byline) {
    const byline = document.createElement('span');
    byline.className = 'article-byline';
    byline.textContent = article.byline;
    metaEl.appendChild(byline);
  }

  const dateEl = document.createElement('span');
  dateEl.className = 'article-date';
  dateEl.textContent = formatDate(article.published_date);
  metaEl.appendChild(dateEl);

  el.appendChild(metaEl);

  // Body / abstract text
  const bodyText = getBodyText(article, index);
  if (bodyText) {
    const bodyEl = document.createElement('p');
    bodyEl.className = 'article-body';
    bodyEl.textContent = bodyText;
    el.appendChild(bodyEl);
  }

  return el;
}

// ── Article Detail View ─────────────────────────────────────
function showArticleDetail(article, fromPopstate) {
  const grid = document.getElementById('article-grid');
  const detail = document.getElementById('article-detail');

  // Pause auto-refresh while reading
  clearInterval(refreshTimer);

  // Populate detail view
  document.getElementById('detail-section').textContent =
    capitalizeSection(article.section, article.subsection);
  document.getElementById('detail-headline').textContent = article.title || '';
  document.getElementById('detail-byline').textContent = article.byline || '';
  document.getElementById('detail-date').textContent = formatDate(article.published_date);
  document.getElementById('detail-source').href = article.url;

  // Image
  const figure = document.getElementById('detail-figure');
  const img = document.getElementById('detail-image');
  const imageUrl = getImageUrl(article);
  if (imageUrl) {
    img.src = imageUrl;
    img.alt = article.title || '';
    figure.hidden = false;
  } else {
    figure.hidden = true;
  }

  // Body — only abstract available from NYT API
  const bodyEl = document.getElementById('detail-body');
  if (article.abstract) {
    bodyEl.innerHTML = `<p>${escapeHtml(article.abstract)}</p>`;
  } else {
    bodyEl.innerHTML = '<p>Article preview not available.</p>';
  }

  // CTA link to full article
  document.getElementById('cta-link').href = article.url;

  // Toggle views
  grid.hidden = true;
  detail.hidden = false;

  // Push history state
  if (!fromPopstate) {
    history.pushState({ articleUrl: article.url }, '', '#article');
  }

  scrollToTop();
}

function showFrontPage(e, fromPopstate) {
  if (e) e.preventDefault();
  const grid = document.getElementById('article-grid');
  const detail = document.getElementById('article-detail');

  grid.hidden = false;
  detail.hidden = true;

  // Resume auto-refresh
  refreshTimer = setInterval(fetchArticles, REFRESH_INTERVAL);

  if (!fromPopstate) {
    history.pushState(null, '', window.location.pathname);
  }

  scrollToTop();
}

function scrollToTop() {
  window.scrollTo(0, 0);
  document.querySelector('.broadsheet').scrollTop = 0;
}

// ── Helpers ─────────────────────────────────────────────────
function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

function getBodyText(article, index) {
  const text = article.abstract || '';
  if (!text) return '';
  if (index === 0) return truncate(text, 500);
  if (index <= 5) return truncate(text, 200);
  return truncate(text, 120);
}

function getImageUrl(article) {
  if (!article.multimedia || article.multimedia.length === 0) return null;
  const preferred = article.multimedia.find(m =>
    m.format === 'Super Jumbo' || m.format === 'superJumbo' || m.format === 'threeByTwoSmallAt2X'
  );
  return preferred ? preferred.url : article.multimedia[0].url;
}

function capitalizeSection(section, subsection) {
  const display = subsection || section || '';
  return display.charAt(0).toUpperCase() + display.slice(1);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  const trimmed = str.slice(0, maxLen);
  const lastSpace = trimmed.lastIndexOf(' ');
  return (lastSpace > 0 ? trimmed.slice(0, lastSpace) : trimmed) + '\u2026';
}
