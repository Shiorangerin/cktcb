#!/usr/bin/env node
/**
 * build.js — 诡异故事集静态站点构建脚本
 *
 * 零 npm 依赖，仅使用 Node 内置模块 (fs / path)。
 *
 * 流程：
 *   1. 读取 stories/ 下所有 .md 文件
 *   2. 自写 YAML frontmatter 解析器
 *   3. 提取 title / author / date / tags / excerpt / body
 *   4. 为每篇小说生成独立 HTML 页面（根目录，<slug>.html）
 *   5. 读取 about.md，提取 title / body
 *   6. 从故事数据聚合作者列表（去重，自动生成简介）
 *   7. 生成 js/data.js（全局变量 stories / authors / aboutPage）
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STORIES_DIR = path.join(ROOT, 'stories');
const ABOUT_FILE = path.join(ROOT, 'about.md');
const OUTPUT_FILE = path.join(ROOT, 'js', 'data.js');

/* ------------------------------------------------------------------ *
 * YAML frontmatter 解析（极简实现，仅支持本站所需子集）
 * ------------------------------------------------------------------ */
function parseFrontmatter(source) {
  const result = {};
  const lines = source.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (!value) { result[key] = ''; continue; }
    result[key] = parseScalar(value);
  }
  return result;
}

function parseScalar(raw) {
  let v = raw.trim();
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map(s => stripQuotes(s.trim())).filter(s => s !== '');
  }
  return stripQuotes(v);
}

function stripQuotes(v) {
  if (typeof v !== 'string') return v;
  if ((v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

/* ------------------------------------------------------------------ *
 * 拆分 .md 文件为 frontmatter + body
 * ------------------------------------------------------------------ */
function splitFrontmatter(content) {
  const match = content.match(/^\s*---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) return { frontmatter: {}, body: content.trim() };
  const fm = parseFrontmatter(match[1]);
  const body = content.slice(match[0].length).trim();
  return { frontmatter: fm, body };
}

/* ------------------------------------------------------------------ *
 * 简易 Markdown body → HTML（段落 / 标题 / 列表 / 强调 / 链接）
 * ------------------------------------------------------------------ */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineMdToHtml(s) {
  let t = escapeHtml(s);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return t;
}

function mdBodyToHtml(md) {
  if (!md) return '';
  const lines = String(md).split(/\r?\n/);
  const out = [];
  let para = [];
  let listType = null;
  let listItems = [];

  function flushPara() {
    if (para.length) {
      out.push('<p>' + inlineMdToHtml(para.join(' ')) + '</p>');
      para = [];
    }
  }
  function flushList() {
    if (listType) {
      const tag = listType;
      out.push('<' + tag + '>' + listItems.map(li => '<li>' + inlineMdToHtml(li) + '</li>').join('') + '</' + tag + '>');
      listType = null;
      listItems = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') { flushPara(); flushList(); continue; }

    const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara(); flushList();
      out.push('<h' + h[1].length + '>' + inlineMdToHtml(h[2]) + '</h' + h[1].length + '>');
      continue;
    }

    const ul = trimmed.match(/^[-*+]\s+(.*)$/);
    if (ul) {
      flushPara();
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(ul[1]);
      continue;
    }

    const ol = trimmed.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      flushPara();
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(ol[1]);
      continue;
    }

    if (listType) flushList();
    para.push(trimmed);
  }
  flushPara();
  flushList();
  return out.join('\n');
}

/* ------------------------------------------------------------------ *
 * 生成摘要
 * ------------------------------------------------------------------ */
function makeExcerpt(body, max) {
  const maxLen = typeof max === 'number' ? max : 100;
  if (!body) return '';
  const text = body.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.filter(t => String(t).trim() !== '').map(String);
  if (typeof tags === 'string' && tags.trim() !== '') {
    return tags.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function normalizeDate(date) {
  if (date && typeof date === 'string' && /\d{4}-\d{2}-\d{2}/.test(date)) {
    return date.slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ *
 * 拆分 body 为汤面 / 汤底（海龟汤格式）
 * 以单独一行 ===== 作为分隔，前为汤面，后为汤底
 * ------------------------------------------------------------------ */
function splitBody(body) {
  const parts = body.split(/\n=====\n/);
  if (parts.length >= 2) {
    return { surface: parts[0].trim(), bottom: parts.slice(1).join('\n=====\n').trim() };
  }
  return { surface: body.trim(), bottom: null };
}

/* ------------------------------------------------------------------ *
 * 读取并解析单个故事文件
 * ------------------------------------------------------------------ */
function loadStory(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, body } = splitFrontmatter(raw);
  const { surface, bottom } = splitBody(body);
  const slug = path.basename(filePath, '.md');
  const title = (frontmatter.title || slug).trim();
  const author = (frontmatter.author || '佚名').trim();
  const date = normalizeDate(frontmatter.date);
  const tags = normalizeTags(frontmatter.tags);
  const excerpt = makeExcerpt(surface, 100);
  return { slug, title, author, date, tags, excerpt, body, surface, bottom };
}

/* ------------------------------------------------------------------ *
 * 故事标签 → 终端 clearance 标签
 * ------------------------------------------------------------------ */
function mapStoryClearance(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return 'DOSSIER';
  for (const raw of tags) {
    const t = String(raw).toLowerCase();
    if (t.includes('日常诡异')) return 'CLASSIFIED';
    if (t.includes('都市怪谈')) return 'COGNITOHAZARD';
    if (t.includes('悬疑'))     return 'ARCHIVE';
    if (t.includes('校园'))     return 'FIELD REPORT';
  }
  return 'DOSSIER';
}

/* ------------------------------------------------------------------ *
 * 生成故事详情页 HTML
 * ------------------------------------------------------------------ */
function storyPageHtml(story) {
  const clearanceTag = mapStoryClearance(story.tags);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(story.title)} &mdash; ARCHIVE RECORD</title>
  <link rel="stylesheet" href="../css/style.css">
</head>
<body>
  <nav>
    <ul>
      <li><a href="../index.html">主页</a></li>
      <li><a href="../authors.html">按作者</a></li>
      <li><a href="../about.html">关于</a></li>
    </ul>
    <button class="candlelight-toggle" title="蜡烛光模式" aria-label="切换蜡烛光模式">CANDLELIGHT</button>
  </nav>

  <div class="container story-detail">
    <div class="clearance-badge">&#x25cf; ARCHIVE RECORD #${String(story.id).padStart(3,'0')} &mdash; ACCESS GRANTED</div>

    <div class="story-back"><a href="../index.html">&larr; RETURN TO INDEX</a></div>

    <h1 class="story-detail-title">${escapeHtml(story.title)}</h1>

    <div class="story-detail-meta">
      <span class="story-author">AUTHOR: ${escapeHtml(story.author)}</span>
      <span class="story-date">DATE: ${escapeHtml(story.date)}</span>
      <span class="clearance-tag">[${clearanceTag}]</span>
    </div>

    <div class="story-detail-body">
      <div class="story-surface" id="story-surface">
        ${mdBodyToHtml(story.surface)}
      </div>
      ${story.bottom ? `
      <div class="reveal-section">
        <button class="reveal-btn" id="reveal-btn">[ REVEAL TRUTH ]</button>
      </div>
      <div class="story-bottom" id="story-bottom">
        ${mdBodyToHtml(story.bottom)}
      </div>
      ` : ''}
    </div>

    <div class="story-back" style="margin-top:3rem;"><a href="../index.html">&larr; RETURN TO INDEX</a></div>
  </div>

  <footer>[ END OF RECORD ]</footer>
  <div class="easter-egg">IT'S WATCHING BACK.</div>

  <script src="../js/data.js"></script>
  <script src="../js/main.js"></script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ *
 * 生成作者简介
 * ------------------------------------------------------------------ */
function defaultBio(name) {
  if (!name || name === '佚名') return '神秘投稿人，身份不详。';
  return `${name} 的作品，收录于群友诡异小说集。`;
}

/* ------------------------------------------------------------------ *
 * 从故事列表聚合作者（去重，附带作品数）
 * ------------------------------------------------------------------ */
function buildAuthors(storyList) {
  const seen = new Map();
  for (const s of storyList) {
    if (!seen.has(s.author)) {
      seen.set(s.author, { name: s.author, bio: defaultBio(s.author), count: 0 });
    }
    seen.get(s.author).count += 1;
  }
  return Array.from(seen.values());
}

/* ------------------------------------------------------------------ *
 * JS 字面量序列化
 * ------------------------------------------------------------------ */
function jsValue(v) {
  return JSON.stringify(v);
}

/* ------------------------------------------------------------------ *
 * 生成 data.js 内容
 * ------------------------------------------------------------------ */
function buildDataJs(storyList, authors, about) {
  const lines = [];
  lines.push('/**');
  lines.push(' * 故事数据（由 scripts/build.js 自动生成，请勿手动编辑）');
  lines.push(' * 修改 stories/*.md 或 about.md 后运行 ./build.command 重新生成。');
  lines.push(' */');
  lines.push('');
  lines.push('const stories = [');

  if (storyList.length === 0) {
    lines.push('  // 暂无故事，请在 stories/ 目录新增 .md 文件后重新构建');
  }

  storyList.forEach((s, idx) => {
    const comma = idx === storyList.length - 1 ? '' : ',';
    lines.push('  {');
    lines.push(`    id: ${s.id},`);
    lines.push(`    slug: ${jsValue(s.slug)},`);
    lines.push(`    title: ${jsValue(s.title)},`);
    lines.push(`    author: ${jsValue(s.author)},`);
    lines.push(`    date: ${jsValue(s.date)},`);
    lines.push(`    tags: ${jsValue(s.tags)},`);
    lines.push(`    excerpt: ${jsValue(s.excerpt)},`);
    lines.push(`    url: ${jsValue('story/' + s.slug + '.html')},`);
    lines.push(`    body: ${jsValue(s.body)},`);
    lines.push(`    surface: ${jsValue(s.surface)},`);
    lines.push(`    bottom: ${jsValue(s.bottom)}`);
    lines.push(`  }${comma}`);
  });

  lines.push('];');
  lines.push('');

  lines.push('const authors = [');
  if (authors.length === 0) {
    lines.push('  // 暂无作者');
  }
  authors.forEach((a, idx) => {
    const comma = idx === authors.length - 1 ? '' : ',';
    lines.push('  {');
    lines.push(`    name: ${jsValue(a.name)},`);
    lines.push(`    bio: ${jsValue(a.bio)},`);
    lines.push(`    count: ${a.count}`);
    lines.push(`  }${comma}`);
  });
  lines.push('];');
  lines.push('');

  lines.push('const aboutPage = {');
  lines.push(`  title: ${jsValue(about.title)},`);
  lines.push(`  body: ${jsValue(about.body)}`);
  lines.push('};');
  lines.push('');

  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */
function main() {
  // 1. 收集故事文件
  let storyFiles = [];
  if (fs.existsSync(STORIES_DIR)) {
    storyFiles = fs
      .readdirSync(STORIES_DIR)
      .filter(f => f.toLowerCase().endsWith('.md'))
      .sort();
  }

  // 2. 读取并解析每个故事
  const storyList = storyFiles.map(f => loadStory(path.join(STORIES_DIR, f)));

  // 3. 按日期降序排序，分配 id
  storyList.sort((a, b) => b.date.localeCompare(a.date));
  storyList.forEach((s, idx) => { s.id = idx + 1; });

  // 4. 为每篇小说生成独立 HTML 页面（story/ 子目录）
  const storyOutDir = path.join(ROOT, 'story');
  fs.mkdirSync(storyOutDir, { recursive: true });
  let generatedPages = 0;
  storyList.forEach(s => {
    const html = storyPageHtml(s);
    const outPath = path.join(storyOutDir, s.slug + '.html');
    fs.writeFileSync(outPath, html, 'utf8');
    generatedPages++;
  });

  // 5. 聚合作者
  const authors = buildAuthors(storyList);

  // 6. 读取 about.md
  let about = { title: '关于本站', body: '' };
  if (fs.existsSync(ABOUT_FILE)) {
    const raw = fs.readFileSync(ABOUT_FILE, 'utf8');
    const { frontmatter, body } = splitFrontmatter(raw);
    about = { title: (frontmatter.title || '关于本站').trim(), body: body || '' };
  }

  // 7. 生成 data.js
  const output = buildDataJs(storyList, authors, about);
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, output, 'utf8');

  // 8. 汇报
  console.log('构建完成：');
  console.log(`  故事：${storyList.length} 篇`);
  console.log(`  页面：${generatedPages} 个详情页`);
  console.log(`  作者：${authors.length} 位`);
  console.log(`  关于页：${about.title}`);
  console.log(`  输出：${path.relative(ROOT, OUTPUT_FILE)}`);
  if (storyList.length === 0) {
    console.log('  提示：stories/ 目录为空，已生成空数据。');
  }
}

main();
