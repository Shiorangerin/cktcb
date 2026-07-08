(function () {
  // ------------------------------------------------------------------
  //  Initialisation blocks — candlelight, nav-hide, easter egg
  // ------------------------------------------------------------------

  // --- Candlelight mode ---
  (function initCandlelight() {
    const btn = document.querySelector('.candlelight-toggle');
    if (!btn) return;
    if (localStorage.getItem('candlelight-mode') === 'on') {
      document.body.classList.add('candlelight');
    }
    btn.addEventListener('click', () => {
      document.body.classList.toggle('candlelight');
      const state = document.body.classList.contains('candlelight') ? 'on' : 'off';
      localStorage.setItem('candlelight-mode', state);
    });
  })();

  // --- Auto-hide nav on scroll ---
  (function initNavHide() {
    const nav = document.querySelector('nav');
    if (!nav) return;
    let lastY = 0;
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const y = window.scrollY;
          if (y > 80 && y > lastY) {
            nav.setAttribute('data-hidden', '');
          } else {
            nav.removeAttribute('data-hidden');
          }
          lastY = y;
          ticking = false;
        });
        ticking = true;
      }
    });
  })();

  // --- Easter egg reveal ---
  (function initEasterEgg() {
    const el = document.querySelector('.easter-egg');
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });
    obs.observe(el);
  })();

  // --- Tag-to-clearance mapper (receives the full tags array) ---
  function mapTag(tags) {
    const arr = Array.isArray(tags) ? tags : [tags];
    for (const raw of arr) {
      const t = String(raw).toLowerCase();
      if (t.includes('日常诡异')) return 'CLASSIFIED';
      if (t.includes('都市怪谈')) return 'COGNITOHAZARD';
      if (t.includes('悬疑'))     return 'ARCHIVE';
      if (t.includes('校园'))     return 'FIELD REPORT';
    }
    return 'DOSSIER';
  }

  // ------------------------------------------------------------------
  //  Markdown helpers (kept verbatim from the original)
  // ------------------------------------------------------------------

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function inlineMd(s) {
    let t = escapeHtml(s);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return t;
  }

  function mdToHtml(md) {
    if (!md) return '';
    const lines = String(md).split(/\r?\n/);
    const html = [];
    let i = 0;
    let para = [];
    let listType = null;
    let listItems = [];

    function flushPara() {
      if (para.length) {
        html.push('<p>' + inlineMd(para.join(' ')) + '</p>');
        para = [];
      }
    }
    function flushList() {
      if (listType) {
        const tag = listType;
        html.push('<' + tag + '>' + listItems.map(li => '<li>' + inlineMd(li) + '</li>').join('') + '</' + tag + '>');
        listType = null;
        listItems = [];
      }
    }

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed === '') {
        flushPara();
        flushList();
        i++;
        continue;
      }

      const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        flushPara();
        flushList();
        const level = h[1].length;
        html.push('<h' + level + '>' + inlineMd(h[2]) + '</h' + level + '>');
        i++;
        continue;
      }

      const ul = trimmed.match(/^[-*+]\s+(.*)$/);
      if (ul) {
        flushPara();
        if (listType && listType !== 'ul') flushList();
        listType = 'ul';
        listItems.push(ul[1]);
        i++;
        continue;
      }

      const ol = trimmed.match(/^\d+\.\s+(.*)$/);
      if (ol) {
        flushPara();
        if (listType && listType !== 'ol') flushList();
        listType = 'ol';
        listItems.push(ol[1]);
        i++;
        continue;
      }

      if (listType) flushList();
      para.push(trimmed);
      i++;
    }
    flushPara();
    flushList();
    return html.join('\n');
  }

  // ------------------------------------------------------------------
  //  Page renderers
  // ------------------------------------------------------------------

  /** Home — story cards */
  function renderHome() {
    const list = document.getElementById('story-list');
    if (!list) return;
    if (!stories || stories.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>NO ARCHIVE RECORDS FOUND</p></div>';
      return;
    }
    const sorted = [...stories].sort((a, b) => b.date.localeCompare(a.date));
    list.innerHTML = sorted.map(s => {
      const clearanceTag = mapTag(s.tags);
      return `
      <article class="story-card">
        <div class="story-card-header">
          <span class="clearance-tag">[${clearanceTag}]</span>
          <span class="story-date">${s.date}</span>
        </div>
        <h2 class="story-card-title"><a href="${s.url}">${escapeHtml(s.title)}</a></h2>
        <p class="story-card-excerpt">${escapeHtml(s.excerpt)}</p>
        <div class="story-card-footer">
          <span class="story-author">AUTHOR: ${escapeHtml(s.author)}</span>
        </div>
      </article>`;
    }).join('');
  }

  /** Authors — dossiers */
  function renderAuthors() {
    const container = document.getElementById('authors-container');
    if (!container) return;
    if (!authors || authors.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>NO PERSONNEL RECORDS FOUND</p></div>';
      return;
    }
    container.innerHTML = authors.map(a => {
      const items = stories.filter(s => s.author === a.name);
      return `
      <section class="author-dossier">
        <h2 class="author-dossier-name">${escapeHtml(a.name)} <span class="dossier-count">[${items.length} RECORDS]</span></h2>
        <p class="author-dossier-bio">${escapeHtml(a.bio)}</p>
        ${items.length === 0 ? '<p class="empty-state">NO RECORDS</p>' : items.map(s => {
          const clearanceTag = mapTag(s.tags);
          return `
            <article class="story-card">
              <div class="story-card-header">
                <span class="clearance-tag">[${clearanceTag}]</span>
                <span class="story-date">${s.date}</span>
              </div>
              <h2 class="story-card-title"><a href="${s.url}">${escapeHtml(s.title)}</a></h2>
              <p class="story-card-excerpt">${escapeHtml(s.excerpt)}</p>
            </article>`;
        }).join('')}
      </section>`;
    }).join('');
  }

  /** About — terminal-style with English empty states */
  function renderAbout() {
    const titleEl = document.getElementById('about-title');
    const contentEl = document.getElementById('about-content');
    const authorsEl = document.getElementById('about-authors');

    // Title (the h1 in site-header gets overwritten with the real about title)
    if (titleEl && typeof aboutPage !== 'undefined' && aboutPage.title) {
      titleEl.textContent = aboutPage.title;
    }

    // Body (Markdown → HTML)
    if (contentEl) {
      const body = (typeof aboutPage !== 'undefined' && aboutPage.body) ? aboutPage.body : '';
      contentEl.innerHTML = body ? mdToHtml(body) : '<p class="empty-state">NO TRANSMISSION</p>';
    }

    // Author index
    if (authorsEl) {
      if (!authors || authors.length === 0) {
        authorsEl.innerHTML = '<p class="empty-state">NO PERSONNEL INDEX</p>';
        return;
      }
      authorsEl.innerHTML = authors.map(a => {
        const count = a.count != null ? a.count : stories.filter(s => s.author === a.name).length;
        return `
          <div class="about-author-row">
            <span class="name">${escapeHtml(a.name)}</span>
            <span class="count">${count} RECORDS</span>
          </div>
        `;
      }).join('');
    }
  }

  // ------------------------------------------------------------------
  //  海龟汤：汤面 → 汤底揭示
  // ------------------------------------------------------------------
  function initReveal() {
    const btn = document.getElementById('reveal-btn');
    const surface = document.getElementById('story-surface');
    const bottom = document.getElementById('story-bottom');
    if (!btn || !surface || !bottom) return;

    btn.addEventListener('click', () => {
      surface.classList.add('dissolving');
      btn.classList.add('revealed');
      btn.textContent = '[ TRUTH REVEALED ]';

      surface.addEventListener('animationend', () => {
        surface.classList.add('dissolved');
        bottom.classList.add('visible');
        bottom.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, { once: true });
    });
  }

  // ------------------------------------------------------------------
  //  Bootstrap
  // ------------------------------------------------------------------
  renderHome();
  renderAuthors();
  renderAbout();
  initReveal();
})();
