# 大轩巴 静态站点 — 交付与部署说明

纯静态站点（HTML + CSS + JS，无后端），可直接推 **GitHub Pages** 或 **Cloudflare Pages**。
主题仅浅色 / 深色两档（无系统档、无彩色），单色克制风格。

## 目录结构（已整理，可直接上传）

```
.
├── .nojekyll                  # GitHub Pages 关闭 Jekyll 处理（保险）
├── index.html                # 首页：介绍「我」+ 可选产品网格（AI 是其中之一）
├── daxuanba-ai.html          # 大轩巴 AI 部署应用页：大图标介绍 + 下载中心
├── netdisk.html              # 产品页：DaXuanBa 网盘解析
├── vpn.html                  # 产品页：DaXuanBa VPN
├── browser.html              # 产品页：大轩巴浏览器
├── download.html             # 下载校验页（校验签名/有效期/是否已用 → 自动下载）
├── assets/
│   ├── css/style.css         # 约 1650 行设计系统（浅/深主题、卡片、表单、组件等）
│   ├── js/main.js            # 主题切换、导航、磁吸、滚动揭示等
│   ├── js/downloads.js       # 自动下载 + 过期 + 单次使用 引擎
│   └── img/                  # favicon / logo / 大图标（均单色 SVG）
├── daxuanba AI/              # ★ 你指定的文件夹，放可下载程序
│   ├── manifest.json         # 下载清单（文件列表 + 有效期）
│   └── 大轩巴AI-示例文件.txt  # 占位示例，验证流程用，可删
└── cloudflare/               # ★ 可选：上 Cloudflare 时用于「真·单次使用」
    ├── worker.js             # 服务端门禁（HMAC 校验 + KV 记录已用 nonce）
    └── wrangler.toml         # wrangler 部署配置（KV 绑定）
```

## 下载机制（已按反馈改为「自动下载」）

1. 用户在 `daxuanba-ai.html` 点 **「下载」**（不再是「获取链接 / 复制」）。
2. `downloads.js` 用 **Web Crypto HMAC-SHA256** 对 `文件路径 | 过期时间戳 | 随机nonce` 签名，
   生成 `download.html?file=…&exp=…&nonce=…&sig=…`，并在**新标签页**打开。
3. `download.html` 重新算签名并校验：
   - 签名错 / 参数缺失 → 「链接无效 / 不完整」
   - 当前时间 > 过期时间 → 「链接已过期」（默认 **15 分钟**）
   - 该 nonce 已被用过 → 「链接已使用」（**单次使用**）
   - 全部通过 → 浏览器**自动开始下载**，原页面保留。
4. 卡片下方提示：`链接 15 分钟内有效 · 仅限使用一次`。

> 已用 Node Web Crypto 端到端验证：正常链接通过；篡改签名、过期、缺参数、重复使用均被拒。

### 单次使用的边界（重要）
- **静态托管（GitHub / Cloudflare Pages）**：已用 nonce 记在**浏览器 localStorage**，
  同浏览器内第二次打开会被拒；换浏览器 / 隐身窗口仍可复用（静态站点无服务端状态，这是固有限制）。
- **全站级真·单次使用**：部署 Cloudflare 时启用 `cloudflare/worker.js`。它用同样签名方案校验，
  并把已用 nonce 写入 **KV（DXB_LINKS）**，做到跨浏览器、跨设备「用过即废」。

## 放你自己的安装包
把 `exe / dmg / AppImage` 丢进 `daxuanba AI/`，然后在 `daxuanba AI/manifest.json` 里
把对应条目的 `path` 指向你的文件名即可（示例清单已含 Windows/macOS/Linux 三项占位）。

## 部署

### GitHub Pages（先上传）
1. 推整个文件夹到仓库（仓库名随意）。
2. Settings → Pages → Source 选 `main` 分支根目录 → Save。
3. 站点地址形如 `https://<user>.github.io/<repo>/`（若用项目子路径，脚本已用相对路径兼容）。
4. `.nojekyll` 已就位，避免 Jekyll 误处理。

### Cloudflare Pages（更快、大文件友好，推荐正式发布）
- 连 GitHub 仓库一键部署；或本地 `wrangler pages deploy .`。
- CDN 全球加速，比 GitHub Pages 在大文件下载上更稳更快。

### 可选：Cloudflare Worker 真·单次使用
1. `npm i -g wrangler && wrangler login`
2. `wrangler kv namespace create DXB_LINKS` → 把返回的 id 填进 `cloudflare/wrangler.toml`
3. `wrangler deploy`（或作为 Pages Functions：把 `worker.js` 改成 `functions/download.html.js` 入口）
4. 用路由把 `your-domain.com/download.html*` 指向该 Worker。

## 代码量
CSS ≈ 1650 行，JS/HTML 若干，全站合计约 **3200+ 行**真实代码（无灌水）。

## 两点待你拍板
- **大图标**：当前是单色「大」字徽标（内联 SVG，`currentColor` 随深浅变化）。你说用另一个对话的图标，
  但我拿不到那个文件——直接覆盖 `assets/img/daxuanba-logo.svg` 或 AI 页里那段 `<svg class="ai-hero__logo">` 即可。
- **单次使用强度**：现在静态版是浏览器本地最佳努力。要全站级「用过即废」，按上面启用 Cloudflare Worker。
