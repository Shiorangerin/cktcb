# 诡异故事集 (The Whispering Terminal)

## 仓库信息
- **Git remote**: `git@gitee.com:cktcbsbit/cktcbsbit.git`
- **Git 用户**: `catmeow <meow@gitee.com>`（已通过 `git config user.name/email` 设置，位于本仓库 `.git/config`）
- **部署**: Gitee Pages，`main` 分支根目录

## 项目结构
```
├── stories/*.md         ← 故事源文件（Markdown + YAML frontmatter）
├── story/*.html         ← 由 build.js 自动生成的故事详情页
├── about.md             ← 关于页内容
├── scripts/build.js     ← 构建脚本（零依赖，Node.js）
├── build.command        ← macOS 双击运行构建
├── js/
│   ├── data.js          ← 构建产物（勿手动编辑）
│   └── main.js          ← 前端渲染 + 交互逻辑
├── css/style.css        ← 全局样式（Whispering Terminal 终端主题）
├── index.html           ← 主页
├── authors.html         ← 按作者分类
└── about.html           ← 关于页
```

## 构建流程
1. 在 `stories/` 下新增或编辑 `.md` 文件
2. 运行 `node scripts/build.js`（或双击 `build.command`）
3. 浏览器打开 `index.html` 预览
4. `git push` 部署到 Gitee Pages

## 故事 .md 格式（海龟汤）
```markdown
---
title: 故事标题
author: 作者名
date: 2026-07-01
tags: [短篇, 日常诡异]
---

汤面内容（读者先看到的部分）...

=====

汤底内容（点击按钮后揭示的反转）...
```
- `=====` 分隔汤面和汤底，前后需要空行
- 无 `=====` 则全文视为汤面，不显示揭示按钮

## 标签映射
| 中文标签 | 终端标签 |
|---|---|
| 日常诡异 | `[CLASSIFIED]` |
| 都市怪谈 | `[COGNITOHAZARD]` |
| 悬疑 | `[ARCHIVE]` |
| 校园 | `[FIELD REPORT]` |
| 其他 | `[DOSSIER]` |
