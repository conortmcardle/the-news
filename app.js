const API_KEY = '9b7bdb55-08b6-4fff-a63a-e9ce90d413ca';
const API_BASE = 'https://content.guardianapis.com/search';
const REFRESH_INTERVAL = 5 * 60 * 1000;
const PAGE_SIZE = 30;

const CONTENT_SECTIONS = [
  { label: 'World News',  id: 'world',      api: 'world' },
  { label: 'UK News',     id: 'uk-news',    api: 'uk-news' },
  { label: 'Politics',   id: 'politics',   api: 'politics' },
  { label: 'Opinion',    id: 'opinion',    api: 'commentisfree' },
  { label: 'Business',   id: 'business',   api: 'business' },
  { label: 'Sport',      id: 'sport',      api: 'sport' },
  { label: 'Culture',    id: 'culture',    api: 'culture' },
  { label: 'Science',    id: 'science',    api: 'science' },
  { label: 'Technology', id: 'technology', api: 'technology' },
];

let refreshTimer = null;
let articlesCache = [];
let scrollBeforeDetail = 0;

// ── Initialise ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  var ua = navigator.userAgent || '';
  if (/Kindle|Silk/i.test(ua)) {
    window.location.replace('text.html');
    return;
  }

  setMastheadDate();
  buildSectionNav();
  fetchAllSections();
  refreshTimer = setInterval(fetchAllSections, REFRESH_INTERVAL);

  document.getElementById('masthead-home').addEventListener('click', (e) => {
    e.preventDefault();
    showFrontPage();
    fetchAllSections();
  });

  document.getElementById('detail-back').addEventListener('click', showFrontPage);
  document.getElementById('detail-back-bottom').addEventListener('click', showFrontPage);

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
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

// ── Section Navigation ──────────────────────────────────────
function buildSectionNav() {
  const nav = document.getElementById('section-nav');
  CONTENT_SECTIONS.forEach(section => {
    const btn = document.createElement('button');
    btn.textContent = section.label;
    btn.addEventListener('click', () => {
      const detail = document.getElementById('article-detail');
      if (!detail.hidden) {
        showFrontPage(null, false);
        setTimeout(() => scrollToSection(section.id), 50);
      } else {
        scrollToSection(section.id);
      }
    });
    nav.appendChild(btn);
  });
}

function scrollToSection(id) {
  const el = document.getElementById('section-' + id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Fetch All Sections ──────────────────────────────────────
async function fetchAllSections() {
  const grid = document.getElementById('article-grid');
  grid.innerHTML = '<div class="loading">Loading latest articles&hellip;</div>';

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 7);
  const fromDateStr = fromDate.toISOString().split('T')[0];

  const results = await Promise.all(
    CONTENT_SECTIONS.map(section =>
      fetch(`${API_BASE}?${new URLSearchParams({
        'api-key': API_KEY,
        'show-fields': 'headline,trailText,body,byline,thumbnail',
        'order-by': 'newest',
        'page-size': PAGE_SIZE,
        'from-date': fromDateStr,
        'section': section.api,
      })}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => ({ section, articles: data.response.results || [] }))
      .catch(() => ({ section, articles: [] }))
    )
  );

  articlesCache = results.flatMap(r => r.articles);
  renderAllSections(results);
}

// ── Render ──────────────────────────────────────────────────
function renderAllSections(sectionResults) {
  const grid = document.getElementById('article-grid');
  grid.innerHTML = '';

  sectionResults.forEach(({ section, articles }) => {
    const block = document.createElement('section');
    block.className = 'section-block';
    block.id = 'section-' + section.id;

    const heading = document.createElement('h2');
    heading.className = 'section-heading';
    heading.textContent = section.label;
    block.appendChild(heading);

    if (articles.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'section-empty';
      empty.textContent = 'No articles found.';
      block.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'article-list';
      articles.forEach(article => list.appendChild(createArticleRow(article)));
      block.appendChild(list);
    }

    grid.appendChild(block);
  });
}

function createArticleRow(article) {
  const fields = article.fields || {};
  const row = document.createElement('div');
  row.className = 'article-row';

  const headline = document.createElement('h3');
  headline.className = 'row-headline';
  const link = document.createElement('a');
  link.href = '#';
  link.textContent = fields.headline || article.webTitle;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    showArticleDetail(article);
  });
  headline.appendChild(link);
  row.appendChild(headline);

  const meta = document.createElement('div');
  meta.className = 'row-meta';
  if (fields.byline) {
    const byline = document.createElement('span');
    byline.className = 'row-byline';
    byline.textContent = fields.byline;
    meta.appendChild(byline);
    meta.appendChild(document.createTextNode(' · '));
  }
  const date = document.createElement('span');
  date.className = 'row-date';
  date.textContent = formatDate(article.webPublicationDate);
  meta.appendChild(date);
  row.appendChild(meta);

  const trail = stripHtml(fields.trailText || '');
  if (trail) {
    const excerpt = document.createElement('p');
    excerpt.className = 'row-excerpt';
    excerpt.textContent = truncate(trail, 180);
    row.appendChild(excerpt);
  }

  return row;
}

// ── Article Detail View ─────────────────────────────────────
function showArticleDetail(article, fromPopstate) {
  scrollBeforeDetail = window.scrollY;

  const fields = article.fields || {};
  const grid = document.getElementById('article-grid');
  const detail = document.getElementById('article-detail');

  clearInterval(refreshTimer);

  document.getElementById('detail-section').textContent = article.sectionName || '';
  document.getElementById('detail-headline').textContent = fields.headline || article.webTitle;
  document.getElementById('detail-byline').textContent = fields.byline || '';
  document.getElementById('detail-date').textContent = formatDate(article.webPublicationDate);
  document.getElementById('detail-source').href = article.webUrl;

  const figure = document.getElementById('detail-figure');
  const img = document.getElementById('detail-image');
  if (fields.thumbnail) {
    img.src = fields.thumbnail;
    img.alt = fields.headline || '';
    figure.hidden = false;
  } else {
    figure.hidden = true;
  }

  const bodyHtml = replaceVideoEmbeds(fields.body || '<p>Article body not available.</p>');
  document.getElementById('detail-body').innerHTML = bodyHtml;

  grid.hidden = true;
  detail.hidden = false;

  if (!fromPopstate) {
    history.pushState({ articleId: article.id }, '', '#article/' + article.id);
  }

  window.scrollTo(0, 0);
  document.querySelector('.broadsheet').scrollTop = 0;
}

function showFrontPage(e, fromPopstate) {
  if (e) e.preventDefault();
  const grid = document.getElementById('article-grid');
  const detail = document.getElementById('article-detail');

  grid.hidden = false;
  detail.hidden = true;

  refreshTimer = setInterval(fetchAllSections, REFRESH_INTERVAL);

  if (!fromPopstate) {
    history.pushState(null, '', window.location.pathname);
  }

  requestAnimationFrame(() => window.scrollTo(0, scrollBeforeDetail));
}

// ── Helpers ─────────────────────────────────────────────────
function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || '';
}

function replaceVideoEmbeds(html) {
  const container = document.createElement('div');
  container.innerHTML = html;

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

  container.querySelectorAll('embed, object').forEach(el => el.remove());

  return container.innerHTML;
}

function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  const trimmed = str.slice(0, maxLen);
  const lastSpace = trimmed.lastIndexOf(' ');
  return (lastSpace > 0 ? trimmed.slice(0, lastSpace) : trimmed) + '\u2026';
}
