// 大轩巴 — Cloudflare Worker（可选）
// 目的：把「单次使用」从「浏览器本地」升级为「全站级」——跨浏览器、跨设备都用过即废。
//
// 与前端 assets/js/downloads.js 共用同一套签名方案：
//   HMAC-SHA256( SECRET , file + "|" + exp + "|" + nonce )
//
// 已用 nonce 写入 KV（DXB_LINKS），TTL 设为链接剩余有效期，过期自动清理。
//
// 部署方式（任选其一）：
//   1) 独立 Worker + 自定义路由（推荐，最省事）：
//        wrangler deploy          （依赖本目录的 wrangler.toml）
//      把站点静态资源放到 R2 / Pages，再用路由把  your.domain/download.html*  指到本 Worker。
//   2) Cloudflare Pages Functions：
//      把本文件另存为  functions/download.html.js ，并改用 Pages Function 入口：
//        export async function onRequest(ctx){ return gate(ctx.request, ctx.env); }
//      （此时把下面 `export default` 块里的逻辑抽成一个 `gate(request, env)` 函数即可。）

const SECRET = 'dxb-ai-static-gate-v1';

function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(msg) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

async function gate(request, env) {
  const url = new URL(request.url);
  const file = url.searchParams.get('file');
  const exp = url.searchParams.get('exp');
  const nonce = url.searchParams.get('nonce');
  const sig = url.searchParams.get('sig');

  if (!file || !exp || !nonce || !sig) {
    return new Response('缺少参数', { status: 400 });
  }
  if (Date.now() > Number(exp)) {
    return new Response('链接已过期', { status: 410 });
  }
  if ((await hmac(file + '|' + exp + '|' + nonce)) !== sig) {
    return new Response('签名无效', { status: 403 });
  }

  // 单次使用：KV 中若存在该 nonce 则拒绝
  const kv = env && env.DXB_LINKS;
  if (kv) {
    if (await kv.get(nonce)) {
      return new Response('链接已使用', { status: 410 });
    }
    const ttl = Math.max(60, Math.floor((Number(exp) - Date.now()) / 1000));
    await kv.put(nonce, '1', { expirationTtl: ttl });
  }

  // 回源取真实文件（与静态站点同域；空格 / 中文已逐段编码）
  const realPath = '/' + file.split('/').map(encodeURIComponent).join('/');
  const upstream = await fetch(new URL(realPath, url.origin), request);
  if (!upstream.ok) {
    return new Response('文件不存在', { status: 404 });
  }

  const name = decodeURIComponent(file.split('/').pop());
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="' + encodeURIComponent(name) + '"',
      'Cache-Control': 'no-store'
    }
  });
}

export default {
  async fetch(request, env) {
    return gate(request, env);
  }
};
