#!/usr/bin/env node
// Generates static SEO landing pages for every pass: /passes/<state>/<slug>/
// plus state hub pages, a master index, and sitemap.xml.
//
// Data source: scripts/passes-data.json, extracted from the app's STATES and
// PASS_ENDPOINTS structures. Re-extract and re-run when passes change.
//
// Usage: node scripts/generate-passes.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'passes-data.json'), 'utf8'));
const SITE = 'https://passchecker.app';
const APP_STORE = 'https://apps.apple.com/us/app/pass-checker/id6764229547';
const API = 'https://pass-checker-api.onrender.com';

// "Snoqualmie Pass I-90" -> "snoqualmie-pass" (route designator stripped)
function slugify(name) {
  return name
    .replace(/\s+(?:SR|I-|US|HWY|OR|CA|NV|ID|MT|WY|UT|CO|AZ|NM|AK|HI|VT|NH|ME|MA|PA|MD|WV|VA|KY|TN|NC|SC|GA|SD|OK|AR|TX)\s*\d+\w*$/i, '')
    .replace(/\s+(?:Richardson|South Klondike)\s+Hwy$/i, '')
    .replace(/\s+Hwy\s*\d+$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function routeOf(name) {
  const m = name.match(/\b((?:SR|I-|US|HWY)\s*\d+\w*|Hwy\s*\d+|[A-Z]{2}\s+\d+\w*|Richardson Hwy|South Klondike Hwy)$/);
  return m ? m[1] : null;
}

const css = `
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0a0a0a;--bg2:#111;--fg:#f1f3f7;--dim:#a1a6b0;--green:#22c55e;--red:#ef4444;--yellow:#eab308;--border:#1f2937;--mono:'Courier New',monospace;--sans:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
body{background:var(--bg);color:var(--fg);font-family:var(--sans);line-height:1.6;max-width:640px;margin:0 auto;padding:24px}
a{color:var(--green);text-decoration:none}a:hover{text-decoration:underline}
.crumb{font-family:var(--mono);font-size:11px;color:var(--dim);letter-spacing:1px;text-transform:uppercase;margin-bottom:28px}
.crumb a{color:var(--dim)}
h1{font-size:clamp(1.6rem,5vw,2.4rem);font-weight:800;letter-spacing:-0.02em;line-height:1.15;margin-bottom:8px}
.sub{color:var(--dim);font-size:14px;margin-bottom:28px}
.status-card{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:28px}
.status-label{font-family:var(--mono);font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--dim);margin-bottom:6px}
.status-word{font-size:44px;font-weight:900;letter-spacing:-1px;line-height:1}
.status-word.open{color:var(--green)}.status-word.closed{color:var(--red)}.status-word.restricted{color:var(--yellow)}.status-word.loading{color:var(--dim);font-size:22px;font-weight:400}
.meta{display:flex;gap:32px;margin-top:18px}
.meta div span{display:block}
.meta .lbl{font-family:var(--mono);font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--dim)}
.meta .val{font-size:19px;font-weight:700}
.events{margin-top:18px;border-top:1px solid var(--border);padding-top:14px;font-size:13px;color:var(--dim)}
.updated{font-family:var(--mono);font-size:10px;color:var(--dim);margin-top:14px;letter-spacing:1px}
.cta{display:block;text-align:center;background:var(--green);color:#000;font-weight:800;font-size:15px;padding:15px;border-radius:12px;margin:28px 0}
.cta:hover{opacity:.9;text-decoration:none}
.body-copy{color:var(--dim);font-size:14px;margin-bottom:14px}
.body-copy strong{color:var(--fg)}
h2{font-size:16px;font-weight:700;margin:28px 0 12px}
.sibs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:28px}
.sib{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px 13px;font-size:13px;color:var(--fg)}
.sib:hover{border-color:var(--green);text-decoration:none}
footer{border-top:1px solid var(--border);padding-top:18px;margin-top:36px;font-size:12px;color:var(--dim)}
footer .legal{font-size:11px;margin-top:8px}
`;

function head(title, desc, canonical) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="website">
<link rel="icon" href="/icon.png">
<style>${css}</style>
</head>
<body>`;
}

const footer = `<footer>
<div><a href="/">Pass Checker</a> shows live conditions for 168 mountain passes across 30 US states and 2 Canadian provinces. Washington and British Columbia are free forever.</div>
<div class="legal">For info only. Always verify with your local DOT before travel. &copy; ${new Date().getFullYear()} Mountain Media Digital LLC. Not affiliated with any government agency. <a href="/privacy.html">Privacy</a></div>
</footer>
</body></html>`;

function widgetScript(regionCode, passName) {
  return `<script>
(async function () {
  var el = document.getElementById('live-status');
  var setText = function (id, t) { var n = document.getElementById(id); if (n) n.textContent = t; };
  try {
    for (var i = 0; i < 10; i++) {
      var r = await fetch('${API}/passes/${regionCode}');
      var d = await r.json();
      if (d.data) {
        var p = d.data.find(function (x) { return x.name === ${JSON.stringify(passName)}; });
        if (!p) break;
        el.textContent = p.status === 'restricted' ? 'OPEN*' : p.status.toUpperCase();
        el.className = 'status-word ' + p.status;
        if (p.temp_f != null) setText('t-val', Math.round(p.temp_f) + '\\u00B0F');
        if (p.elevation_ft != null) setText('e-val', Number(p.elevation_ft).toLocaleString() + ' ft');
        if (p.updated) {
          var mins = Math.max(0, Math.round((Date.now() - new Date(p.updated)) / 60000));
          var rel = mins < 60 ? mins + ' min ago' : mins < 2880 ? Math.round(mins / 60) + ' hr ago' : Math.round(mins / 1440) + ' days ago';
          setText('u-val', 'Updated ' + rel);
        }
        var ev = (p.events || []).filter(function (e) { return e.type !== 'status'; });
        if (p.status === 'restricted' && ev.length) {
          document.getElementById('events').textContent = ev[0].description || 'Restrictions in effect.';
          document.getElementById('events').style.display = 'block';
        }
        return;
      }
      await new Promise(function (res) { setTimeout(res, 6000); });
    }
    el.textContent = 'See app for status';
    el.className = 'status-word loading';
  } catch (e) {
    el.textContent = 'See app for status';
    el.className = 'status-word loading';
  }
})();
</script>`;
}

function passPage(region, pass, siblings) {
  const route = routeOf(pass.name);
  const shortName = pass.name.replace(route || '', '').trim();
  const inState = region.country === 'CA' ? region.name : region.name;
  const title = `Is ${shortName} Open? Live ${pass.name} Conditions`;
  const desc = `Live ${shortName} road conditions: current open or closed status, summit temperature, and restrictions${route ? ` on ${route}` : ''} in ${inState}. Updated continuously from DOT data.`;
  const url = `${SITE}/passes/${region.code.toLowerCase()}/${slugify(pass.name)}/`;

  const corridor = pass.west && pass.east
    ? `<p class="body-copy"><strong>${shortName}</strong>${route ? ` on <strong>${route}</strong>` : ''} connects <strong>${pass.west}</strong> and <strong>${pass.east}</strong> in ${inState}. The live status above comes from official DOT data and refreshes continuously through the day.</p>`
    : `<p class="body-copy"><strong>${shortName}</strong>${route ? ` on <strong>${route}</strong>` : ''} is one of ${region.name}'s key mountain crossings. The live status above comes from official DOT data and refreshes continuously through the day.</p>`;

  const sibLinks = siblings
    .map(s => `<a class="sib" href="/passes/${region.code.toLowerCase()}/${slugify(s.name)}/">${s.name}</a>`)
    .join('');

  return head(title, desc, url) + `
<div class="crumb"><a href="/">Pass Checker</a> / <a href="/passes/">Passes</a> / <a href="/passes/${region.code.toLowerCase()}/">${region.name}</a></div>
<h1>Is ${shortName} open right now?</h1>
<p class="sub">${pass.name} &middot; ${inState}</p>
<div class="status-card">
  <div class="status-label">Current status</div>
  <div class="status-word loading" id="live-status">Checking&hellip;</div>
  <div class="meta">
    <div><span class="lbl">Temp</span><span class="val" id="t-val">&ndash;</span></div>
    <div><span class="lbl">Summit elev</span><span class="val" id="e-val">&ndash;</span></div>
  </div>
  <div class="events" id="events" style="display:none"></div>
  <div class="updated" id="u-val"></div>
</div>
<a class="cta" href="${APP_STORE}">Get live cameras &amp; alerts &mdash; Pass Checker on the App Store</a>
${corridor}
<p class="body-copy">The Pass Checker app adds live DOT camera feeds, summit temperatures from roadside weather stations, chain law and restriction details, and every other pass in ${region.name}${region.code === 'WA' || region.code === 'BC' ? ' free of charge' : ''}.</p>
<h2>Other ${region.name} passes</h2>
<div class="sibs">${sibLinks}</div>
${footer.replace('</body></html>', '')}
${widgetScript(region.code, pass.name)}
</body></html>`;
}

function statePage(region) {
  const title = `${region.name} Mountain Pass Conditions — Live Status`;
  const desc = `Live open/closed status for all ${region.passes.length} ${region.name} mountain passes: ${region.passes.slice(0, 4).map(p => p.name.replace(routeOf(p.name) || '', '').trim()).join(', ')} and more.`;
  const url = `${SITE}/passes/${region.code.toLowerCase()}/`;
  const links = region.passes
    .map(p => `<a class="sib" href="/passes/${region.code.toLowerCase()}/${slugify(p.name)}/">${p.name}</a>`)
    .join('');
  return head(title, desc, url) + `
<div class="crumb"><a href="/">Pass Checker</a> / <a href="/passes/">Passes</a></div>
<h1>${region.name} mountain passes</h1>
<p class="sub">${region.passes.length} passes with live conditions${region.code === 'WA' || region.code === 'BC' ? ' &middot; free in the app' : ''}</p>
<div class="sibs">${links}</div>
<a class="cta" href="${APP_STORE}">Get Pass Checker on the App Store</a>
${footer}`;
}

function indexPage(regions) {
  const title = `Mountain Pass Conditions — 168 Passes, Live Status`;
  const desc = `Live open/closed status for 168 mountain passes across 30 US states and 2 Canadian provinces. From Snoqualmie to the Coquihalla to Newfound Gap.`;
  const groups = regions
    .map(r => `<h2>${r.name}</h2><div class="sibs">${r.passes.map(p => `<a class="sib" href="/passes/${r.code.toLowerCase()}/${slugify(p.name)}/">${p.name}</a>`).join('')}</div>`)
    .join('');
  return head(title, desc, `${SITE}/passes/`) + `
<div class="crumb"><a href="/">Pass Checker</a></div>
<h1>Live mountain pass conditions</h1>
<p class="sub">168 passes &middot; 30 states &middot; 2 provinces</p>
<a class="cta" href="${APP_STORE}">Get Pass Checker on the App Store</a>
${groups}
${footer}`;
}

// ── Generate ────────────────────────────────────────────────────────────────
let count = 0;
const urls = [`${SITE}/`, `${SITE}/passes/`];

for (const region of DATA) {
  const stateDir = path.join(ROOT, 'passes', region.code.toLowerCase());
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'index.html'), statePage(region));
  urls.push(`${SITE}/passes/${region.code.toLowerCase()}/`);

  for (const pass of region.passes) {
    const siblings = region.passes.filter(p => p.name !== pass.name);
    const dir = path.join(stateDir, slugify(pass.name));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), passPage(region, pass, siblings));
    urls.push(`${SITE}/passes/${region.code.toLowerCase()}/${slugify(pass.name)}/`);
    count++;
  }
}

fs.writeFileSync(path.join(ROOT, 'passes', 'index.html'), indexPage(DATA));

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n') +
  `\n</urlset>\n`);

fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`Generated ${count} pass pages, ${DATA.length} state hubs, 1 index, sitemap (${urls.length} URLs), robots.txt`);
