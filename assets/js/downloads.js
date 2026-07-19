/* ============================================================================
   大轩巴 — downloads.js
   自动下载 + 实时过期 + 单次使用，全部由前端 JS 控制。

   工作流程（无需后端，GitHub Pages / Cloudflare Pages 都能跑）：
     1. 选定文件后，生成  data = file + "|" + 过期时间戳 + "|" + 随机 nonce
     2. 用 HMAC-SHA256（Web Crypto，安全上下文）给 data 签名；
        本地 file:// 预览时自动降级为兼容哈希。
     3. 拼出  download.html?file=<enc>&exp=<ts>&nonce=<hex>&sig=<hex>
     4. 立即在新标签页打开该地址 —— download.html 重新算签名并校验
        时间戳与「是否已使用」。通过则自动开始下载，否则提示失效。

   「单次使用」说明：
     - 静态托管下，nonce 的使用记录在浏览器 localStorage，
       同一链接在该浏览器内第二次打开会被拒绝（换位/隐身仍可复用，
       这是静态托管的固有限制）。
     - 真正全站级别的「用过即废」需要服务端状态：部署 Cloudflare 时
       用 R2 + Worker（见 cloudflare/worker.js）在 KV 里记录 nonce 即可。
   ========================================================================== */
(function () {
  'use strict';

  const SECRET = 'dxb-ai-static-gate-v1';          // 客户端签名密钥
  const TTL_MIN = 15;                               // 链接默认有效期（分钟）
  const USE_CRYPTO = !!(window.crypto && window.crypto.subtle);
  const USED_KEY = 'dxb_used_nonces_v1';           // 单次使用记录键

  /* ---- 内置兜底清单（fetch 失败时，例如本地 file:// 预览） ---- */
  const EMBEDDED = {
    appName: '大轩巴 AI 部署', publisher: '大轩巴', latest: '1.0.1', linkTtlMinutes: TTL_MIN,
    baseUrl: 'https://github.com/daxuanba/daxuanba.github.io/releases/download',
    versions: [
      {
        version: '1.0.1', date: '2026-07-19', channel: 'latest',
        files: [
          { id: 'win-setup', name: 'Daxuanba-Setup-1.0.1.exe', file: 'Daxuanba-Setup-1.0.1.exe', platform: 'windows', label: 'Windows 安装包', desc: 'Windows 64 位安装程序，一键安装。', size: '78 MB', primary: true },
          { id: 'mac-dmg', name: 'Daxuanba-1.0.1-arm64.dmg', file: 'Daxuanba-1.0.1-arm64.dmg', platform: 'macos', label: 'macOS 安装包（Apple Silicon）', desc: 'macOS ARM64 (M1/M2/M3) 安装镜像。', size: '94 MB', primary: false },
          { id: 'linux-appimage', name: 'Daxuanba-1.0.1.AppImage', file: 'Daxuanba-1.0.1.AppImage', platform: 'linux', label: 'Linux 便携版', desc: 'Linux AppImage 便携版，无需安装直接运行。', size: '103 MB', primary: false }
        ]
      },
      {
        version: '1.0.0', date: '2026-07-09', channel: 'history',
        files: [
          { id: 'win-setup', name: 'Daxuanba-Setup-1.0.0.exe', file: 'Daxuanba-Setup-1.0.0.exe', platform: 'windows', label: 'Windows 安装包', desc: 'Windows 64 位安装程序，一键安装。', size: '78 MB', primary: true },
          { id: 'mac-dmg', name: 'Daxuanba-1.0.0-arm64.dmg', file: 'Daxuanba-1.0.0-arm64.dmg', platform: 'macos', label: 'macOS 安装包（Apple Silicon）', desc: 'macOS ARM64 (M1/M2/M3) 安装镜像。', size: '95 MB', primary: false },
          { id: 'linux-appimage', name: 'Daxuanba-1.0.0.AppImage', file: 'Daxuanba-1.0.0.AppImage', platform: 'linux', label: 'Linux 便携版', desc: 'Linux AppImage 便携版，无需安装直接运行。', size: '104 MB', primary: false }
        ]
      }
    ]
  };

  /* ---- 平台图标 ---- */
  const ICONS = {
    windows: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 5.1 10.3 4v7.2H3V5.1zm0 13.8L10.3 20V12.8H3v6.1zm9.7-15.3L21 3v8.2h-8.3V3.6zM21 12.8V21l-8.3-1.2v-6.4H21z"/></svg>',
    macos: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.4 12.6c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.6-1.3-.1-2.5.7-3.1.7-.6 0-1.6-.7-2.7-.7-1.4 0-2.7.8-3.4 2.1-1.5 2.5-.4 6.3 1 8.4.7 1 1.6 2.1 2.7 2.1 1.1 0 1.5-.7 2.8-.7s1.6.7 2.8.7c1.2 0 1.9-1 2.6-2 .8-1.2 1.2-2.3 1.2-2.4-.1 0-2.3-.9-2.3-3.6zM14.3 5.9c.6-.8 1-1.9.9-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2-.5 2.8-1.3z"/></svg>',
    linux: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c-1.7 0-3 1.4-3 3 0 .5.1 1 .4 1.4-1.2 1-2 2.6-2 4.4 0 .8.1 1.4.3 2L6 14c-.6.6-1 1.4-1 2.3 0 1 .4 1.6.8 2-.3.4-.5.9-.5 1.5 0 1.3 1 2.2 2.4 2.2.9 0 1.6-.3 2.1-.8.5.1 1 .2 1.7.2h1.4c.7 0 1.2-.1 1.7-.2.5.5 1.2.8 2.1.8 1.4 0 2.4-.9 2.4-2.2 0-.6-.2-1.1-.5-1.5.4-.4.8-1 0-2 .3-.6.8-1.2.8-2.3 0-.9-.4-1.7-1-2.3l-.8-.2c.2-.6.3-1.2.3-2 0-1.8-.8-3.4-2-4.4.3-.4.4-.9.4-1.4 0-1.6-1.3-3-3-3z"/></svg>',
    all: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>'
  };

  /* ---- 签名 ---- */
  async function sign(message) {
    if (USE_CRYPTO) {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const buf = await crypto.subtle.sign('HMAC', key, enc.encode(message));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // 降级（file:// 等）：仅用于本地预览，非安全。
    let h = 0x811c9dc5;
    const s = message + '|' + SECRET;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  /* ---- 随机 nonce（保证每条链接唯一，支撑单次使用） ---- */
  function randomNonce() {
    try {
      const a = new Uint8Array(12);
      (window.crypto || { getRandomValues: (x) => x }).getRandomValues(a);
      return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      return Date.now().toString(16) + Math.random().toString(16).slice(2, 10);
    }
  }

  /* ---- 生成签名令牌（当前页内联下载用，不再构造跳转 URL） ---- */
  function signFile(file, ttlMinutes) {
    const exp = Date.now() + ttlMinutes * 60 * 1000;
    const nonce = randomNonce();
    return sign(file + '|' + exp + '|' + nonce).then(sig => ({ file: file, exp: exp, sig: sig, nonce: nonce }));
  }

  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ---- 校验（在 download.html 侧调用） ---- */
  async function validate(params) {
    const { file, exp, sig, nonce } = params;
    if (!file || !exp || !sig || !nonce) return { ok: false, reason: 'missing' };
    const now = Date.now();
    if (now > Number(exp)) return { ok: false, reason: 'expired' };
    const expected = await sign(file + '|' + exp + '|' + nonce);
    if (expected !== sig) return { ok: false, reason: 'badsig' };
    return { ok: true, file };
  }

  /* ---- 单次使用记录（浏览器本地，静态托管最佳努力） ---- */
  function isNonceUsed(nonce) {
    try {
      const arr = JSON.parse(localStorage.getItem(USED_KEY) || '[]');
      return Array.isArray(arr) && arr.indexOf(nonce) !== -1;
    } catch (e) { return false; }
  }
  function markNonceUsed(nonce) {
    try {
      const arr = JSON.parse(localStorage.getItem(USED_KEY) || '[]');
      if (Array.isArray(arr) && arr.indexOf(nonce) === -1) arr.push(nonce);
      localStorage.setItem(USED_KEY, JSON.stringify(arr.slice(-500)));
    } catch (e) {}
  }

  /* ---- 读取版本清单（versions.json） ---- */
  async function getVersions() {
    try {
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, 8000);
      const res = await fetch('versions.json', { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.json();
      if (!data.versions || !data.versions.length) throw new Error('empty');
      return data;
    } catch (e) {
      return EMBEDDED;
    }
  }

  function resolveLatest(data) {
    const v = (data.versions || []).find(function (x) { return x.version === data.latest; });
    return v || data.versions[0];
  }

  function fileUrl(data, version, file) {
    const base = data.baseUrl || 'https://github.com/daxuanba/daxuanba.github.io/releases/download';
    return base + '/v' + version + '/' + file;
  }

  /* ---- 单文件卡片 ---- */
  function renderFileCard(f, ttl, isHistory) {
    const card = document.createElement('div');
    card.className = 'download-card' + (f.primary && !isHistory ? ' download-card--primary' : '');
    card.dataset.file = f.path;
    card.dataset.ttl = String(ttl);
    card.innerHTML = `
      <div class="download-card__head">
        <div class="download-card__plat">${ICONS[f.platform] || ICONS.all}</div>
        <div>
          <h3>${escapeHtml(f.name)}</h3>
          <div class="meta">${escapeHtml(f.label || '')} · <span class="size">${escapeHtml(f.size || '')}</span></div>
        </div>
      </div>
      <p class="desc">${escapeHtml(f.desc || '')}</p>
      <div class="row gap-2 wrap">
        <span class="magnetic" data-strength="0.3"><button class="btn btn--primary download" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          <span>下载</span></button></span>
      </div>
      <div class="download-card__note">链接 ${ttl} 分钟内有效 · 仅限使用一次</div>`;
    wireCard(card, f, ttl);
    return card;
  }

  /* ---- 渲染「最新版本」卡片 ---- */
  async function renderLatest(container) {
    if (!container) return;
    container.innerHTML = '';   // 立即清掉骨架屏，避免卡在"获取中"
    const data = await getVersions();
    const ttl = data.linkTtlMinutes || TTL_MIN;
    const v = resolveLatest(data);
    const badge = document.getElementById('latestVersion');
    if (badge) badge.textContent = 'v' + v.version;
    const sub = document.getElementById('latestDate');
    if (sub && v.date) sub.textContent = v.date;
    container.innerHTML = '';
    (v.files || []).forEach(function (f) {
      f.path = fileUrl(data, v.version, f.file);
      container.appendChild(renderFileCard(f, ttl, false));
    });
    document.dispatchEvent(new Event('dxb:cards-rendered'));
  }

  /* ---- 渲染「历史版本」折叠列表 ---- */
  async function renderHistory(container) {
    if (!container) return;
    const data = await getVersions();
    const ttl = data.linkTtlMinutes || TTL_MIN;
    const hist = (data.versions || []).filter(function (x) { return x.version !== data.latest; });
    container.innerHTML = '';
    if (!hist.length) { container.style.display = 'none'; return; }
    hist.forEach(function (v) {
      const item = document.createElement('div');
      item.className = 'version-item';
      item.innerHTML = `
        <button class="version-item__head" type="button" aria-expanded="false">
          <span class="version-item__name">v${escapeHtml(v.version)}</span>
          <span class="version-item__date">${escapeHtml(v.date || '')}</span>
          <span class="version-item__chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span>
        </button>
        <div class="version-item__body"></div>`;
      const body = item.querySelector('.version-item__body');
      (v.files || []).forEach(function (f) {
        f.path = fileUrl(data, v.version, f.file);
        body.appendChild(renderFileCard(f, ttl, true));
      });
      const head = item.querySelector('.version-item__head');
      head.addEventListener('click', function () {
        const open = item.classList.toggle('is-open');
        head.setAttribute('aria-expanded', String(open));
      });
      container.appendChild(item);
    });
  }

  /* ---- 旧渲染入口（兼容） ---- */
  async function renderCards(container) {
    return renderLatest(container);
  }

  function wireCard(card, f, ttl) {
    const dlBtn = card.querySelector('.download');
    if (!dlBtn) return;
    dlBtn.addEventListener('click', async () => {
      const label = dlBtn.querySelector('span');
      if (label) label.textContent = '正在准备…';
      dlBtn.disabled = true;
      try {
        const token = await signFile(f.path, ttl);
        const data = { file: token.file, exp: String(token.exp), sig: token.sig, nonce: token.nonce };
        // 在当前页覆盖层内联校验 + 直接下载，不再跳转 download.html
        Overlay.open();
        await wait(260);
        const r = await validate(data);
        if (!r.ok) { Overlay.fail(r.reason); return; }
        if (isNonceUsed(data.nonce)) { Overlay.fail('used'); return; }
        markNonceUsed(data.nonce);
        const name = f.name || decodeURIComponent(f.path).split('/').pop();
        Overlay.downloading(name);
        triggerDownload(f.path, name);
        setTimeout(function () { Overlay.close(); }, 2600);
      } catch (e) {
        Overlay.fail('badsig');
        if (window.dxbToast) window.dxbToast('生成下载地址失败，请重试');
      }
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---- 当前页下载覆盖层（替代跳转 download.html） ---- */
  const Overlay = (function () {
    const el = function () { return document.getElementById('dlOverlay'); };
    const $ = function (id) { return document.getElementById(id); };
    const ICON_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>';
    const ICON_ERR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>';

    function open() {
      const o = el(); if (!o) return;
      o.classList.remove('is-error');
      $('dlCard').classList.remove('handler--error');
      $('dlSpinner').style.display = '';
      $('dlBar').style.display = '';
      $('dlActions').style.display = 'none';
      $('dlIcon').innerHTML = ICON_OK;
      $('dlTitle').textContent = '正在校验下载…';
      $('dlDesc').textContent = '验证签名、有效期与单次使用状态。';
      o.classList.add('show');
      o.setAttribute('aria-hidden', 'false');
    }
    function downloading(name) {
      $('dlSpinner').style.display = 'none';
      $('dlBar').style.display = 'none';
      $('dlTitle').textContent = '验证通过，正在下载';
      $('dlDesc').textContent = name + ' · 浏览器会自动开始下载；若没有反应，请点「关闭」后重试。';
      if ($('dlRetry')) $('dlRetry').style.display = 'none';
      if ($('dlClose')) $('dlClose').style.display = '';
      $('dlActions').style.display = 'flex';
    }
    function fail(reason) {
      $('dlSpinner').style.display = 'none';
      $('dlBar').style.display = 'none';
      $('dlCard').classList.add('handler--error');
      $('dlIcon').innerHTML = ICON_ERR;
      const map = {
        expired: ['链接已过期', '这条下载地址已超过有效期（默认 15 分钟），已自动作废。请点「重新下载」生成新链接。'],
        used: ['链接已使用', '这条下载地址仅限使用一次，已经被使用过了。点「重新下载」获取一条新链接。'],
        badsig: ['链接无效', '签名校验未通过或参数被篡改，链接不可信。请重新获取。'],
        missing: ['链接不完整', '缺少必要参数，链接可能不完整。请重新获取。']
      };
      const m = map[reason] || map.missing;
      $('dlTitle').textContent = m[0];
      $('dlDesc').textContent = m[1];
      if ($('dlRetry')) $('dlRetry').style.display = '';
      if ($('dlClose')) $('dlClose').style.display = '';
      $('dlActions').style.display = 'flex';
    }
    function restoreButtons() {
      const btns = document.querySelectorAll('.download-card .download');
      btns.forEach(function (b) {
        b.disabled = false;
        const s = b.querySelector('span'); if (s) s.textContent = '下载';
      });
    }
    function close() {
      const o = el(); if (!o) return;
      o.classList.remove('show');
      o.setAttribute('aria-hidden', 'true');
      restoreButtons();
    }
    function init() {
      const c = $('dlClose'); if (c) c.addEventListener('click', close);
      const r = $('dlRetry'); if (r) r.addEventListener('click', close);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
    return { open: open, fail: fail, downloading: downloading, close: close };
  })();

  /* ---- 在当前页直接触发下载 ---- */
  function triggerDownload(file, name) {
    const raw = decodeURIComponent(file);
    const nm = name || raw.split('/').pop();
    const href = /^https?:\/\//i.test(raw) ? raw : raw.split('/').map(encodeURIComponent).join('/');
    const a = document.createElement('a');
    a.href = href; a.setAttribute('download', nm);
    document.body.appendChild(a);
    setTimeout(function () { a.click(); a.remove(); }, 350);
  }

  window.DXB = { signFile, validate, getVersions, renderLatest, renderHistory, getManifest: getVersions, renderCards: renderLatest, ICONS, sign, isNonceUsed, markNonceUsed, Overlay, triggerDownload };
})();
