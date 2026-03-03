const API_KEY = '9b7bdb55-08b6-4fff-a63a-e9ce90d413ca';
const API_BASE = 'https://content.guardianapis.com/search';
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const PAGE_SIZE = 30;

const SECTIONS = [
  'All', 'World news', 'UK news', 'Politics', 'Opinion',
  'Business', 'Sport', 'Culture', 'Science', 'Technology'
];

const SECTION_MAP = {
  'All': '',
  'World news': 'world',
  'UK news': 'uk-news',
  'Politics': 'politics',
  'Opinion': 'commentisfree',
  'Business': 'business',
  'Sport': 'sport',
  'Culture': 'culture',
  'Science': 'science',
  'Technology': 'technology'
};

let currentSection = 'All';
let refreshTimer = null;
let articlesCache = [];

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
    if (e.state && e.state.articleId) {
      const article = articlesCache.find(a => a.id === e.state.articleId);
      if (article) { showArticleDetail(article, true); return; }
    }
    showFrontPage(null, true);
  });
});

// ── Masthead Date ───────────────────────────────────────────
function setMastheadDate() {
  const el = document.getElementById('masthead-date');
  const now = new Date();
  el.textContent = now.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
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

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 7);
  const fromDateStr = fromDate.toISOString().split('T')[0];

  const params = new URLSearchParams({
    'api-key': API_KEY,
    'show-fields': 'headline,trailText,body,byline,thumbnail',
    'order-by': 'newest',
    'page-size': PAGE_SIZE,
    'from-date': fromDateStr
  });

  if (SECTION_MAP[currentSection]) {
    params.set('section', SECTION_MAP[currentSection]);
  }

  try {
    const res = await fetch(`${API_BASE}?${params}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    const articles = data.response.results || [];
    articlesCache = articles;
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
  const fields = article.fields || {};
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
  sectionEl.textContent = article.sectionName || '';
  el.appendChild(sectionEl);

  // Thumbnail for lead and secondary articles
  if (fields.thumbnail && index <= 2) {
    const img = document.createElement('img');
    img.className = 'article-image';
    img.src = fields.thumbnail;
    img.alt = fields.headline || article.webTitle;
    img.loading = 'lazy';
    el.appendChild(img);
  }

  // Headline (click opens interior page)
  const headlineEl = document.createElement('h2');
  headlineEl.className = 'article-headline';
  const link = document.createElement('a');
  link.href = '#';
  link.textContent = fields.headline || article.webTitle;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    showArticleDetail(article);
  });
  headlineEl.appendChild(link);
  el.appendChild(headlineEl);

  // Meta: byline + date
  const metaEl = document.createElement('div');
  metaEl.className = 'article-meta';

  if (fields.byline) {
    const byline = document.createElement('span');
    byline.className = 'article-byline';
    byline.textContent = fields.byline;
    metaEl.appendChild(byline);
  }

  const dateEl = document.createElement('span');
  dateEl.className = 'article-date';
  dateEl.textContent = formatDate(article.webPublicationDate);
  metaEl.appendChild(dateEl);

  el.appendChild(metaEl);

  // Body / trail text
  const bodyText = getBodyText(fields, index);
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
  const fields = article.fields || {};
  const grid = document.getElementById('article-grid');
  const detail = document.getElementById('article-detail');

  // Pause auto-refresh while reading
  clearInterval(refreshTimer);

  // Populate detail view
  document.getElementById('detail-section').textContent = article.sectionName || '';
  document.getElementById('detail-headline').textContent = fields.headline || article.webTitle;
  document.getElementById('detail-byline').textContent = fields.byline || '';
  document.getElementById('detail-date').textContent = formatDate(article.webPublicationDate);
  document.getElementById('detail-source').href = article.webUrl;

  // Image
  const figure = document.getElementById('detail-figure');
  const img = document.getElementById('detail-image');
  if (fields.thumbnail) {
    img.src = fields.thumbnail;
    img.alt = fields.headline || '';
    figure.hidden = false;
  } else {
    figure.hidden = true;
  }

  // Body — inject the full HTML from the API, replacing video embeds with links
  const bodyHtml = replaceVideoEmbeds(fields.body || '<p>Article body not available.</p>');
  document.getElementById('detail-body').innerHTML = bodyHtml;

  // Toggle views
  grid.hidden = true;
  detail.hidden = false;

  // Push history state
  if (!fromPopstate) {
    history.pushState({ articleId: article.id }, '', '#article/' + article.id);
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
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function getBodyText(fields, index) {
  const text = stripHtml(fields.trailText || '') || stripHtml(fields.body || '');
  if (!text) return '';

  if (index === 0) return truncate(text, 500);
  if (index <= 5) return truncate(text, 200);
  return truncate(text, 120);
}

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || '';
}

function replaceVideoEmbeds(html) {
  const container = document.createElement('div');
  container.innerHTML = html;

  // Replace iframes (YouTube, Vimeo, etc.)
  container.querySelectorAll('iframe').forEach(iframe => {
    const src = iframe.src || iframe.getAttribute('src') || '';
    if (src) {
      const link = document.createElement('a');
      link.href = src;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Watch video';
      link.style.cssText = 'display:block;color:#09357B;margin:0.5rem 0;font-style:italic;';
      iframe.replaceWith(link);
    } else {
      iframe.remove();
    }
  });

  // Replace <video> elements
  container.querySelectorAll('video').forEach(video => {
    const src = video.src || video.querySelector('source')?.src || '';
    if (src) {
      const link = document.createElement('a');
      link.href = src;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Watch video';
      link.style.cssText = 'display:block;color:#09357B;margin:0.5rem 0;font-style:italic;';
      video.replaceWith(link);
    } else {
      video.remove();
    }
  });

  // Remove embed and object elements
  container.querySelectorAll('embed, object').forEach(el => el.remove());

  return container.innerHTML;
}

function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  const trimmed = str.slice(0, maxLen);
  const lastSpace = trimmed.lastIndexOf(' ');
  return (lastSpace > 0 ? trimmed.slice(0, lastSpace) : trimmed) + '\u2026';
}
