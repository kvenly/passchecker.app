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
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=app.passchecker';
const TOTAL = DATA.reduce((n, r) => n + r.passes.length, 0);
// Regions with live camera feeds in the app; their pages may say 'webcams'
const CAM_REGIONS = new Set(['WA', 'OR', 'CA', 'AK', 'ID', 'UT', 'AZ', 'NM', 'HI', 'WY', 'NV', 'MT', 'BC', 'AB', 'CO']);

// Passes that close for the winter. Windows are typical patterns, not
// promises: each agency sets the dates every year based on snowfall. Review
// this table each autumn.
const SEASONAL = {
  'WA/North Cascades SR 20': { closes: 'mid-November to early December', reopens: 'April or May', note: 'WSDOT closes the highway between Ross Dam Trailhead and Silver Star gate once avalanche chutes above the road load with snow.' },
  'WA/Chinook Pass SR 410': { closes: 'mid-November', reopens: 'late May, usually by Memorial Day weekend', note: 'WSDOT closes the pass at Crystal Mountain Boulevard on the west side and Morse Creek on the east side.' },
  'WA/Cayuse Pass SR 410': { closes: 'mid-November to early December', reopens: 'April or May', note: 'Cayuse usually closes within days of Chinook Pass and reopens a few weeks ahead of it.' },
  'OR/McKenzie Pass OR 242': { closes: 'early November, or sooner after the first heavy snow', reopens: 'mid-to-late June', note: 'The narrow lava-field highway is not plowed in winter. Vehicles over 35 feet are prohibited all year.' },
  'CA/Tioga Pass CA 120': { closes: 'November, with the first significant snowfall', reopens: 'late May or June, later after heavy winters', note: 'The closure covers Tioga Road through Yosemite National Park, from Crane Flat to the Tioga Pass entrance.' },
  'CA/Sonora Pass CA 108': { closes: 'November or December', reopens: 'May', note: 'Caltrans closes the pass east of Strawberry once snow makes the steep upper grades unsafe.' },
  'CA/Ebbetts Pass CA 4': { closes: 'November or December', reopens: 'May or June', note: 'The closure runs from Lake Alpine to the junction with CA 89.' },
  'CA/Monitor Pass CA 89': { closes: 'November or December', reopens: 'April, often the first Sierra pass to reopen', note: 'Monitor closes later and reopens earlier than Sonora, Ebbetts, and Tioga.' },
  'CO/Independence Pass CO 82': { closes: 'around November 7, or earlier if snow arrives', reopens: 'the Thursday before Memorial Day', note: 'CDOT gates the highway east of Aspen and west of Twin Lakes. Vehicles over 35 feet are prohibited all year.' },
  'CO/Trail Ridge Road US 34': { closes: 'mid-to-late October', reopens: 'late May, around Memorial Day weekend', note: 'Rocky Mountain National Park closes the road between Many Parks Curve and the Colorado River Trailhead.' },
  'UT/Bald Mountain Pass UT 150': { closes: 'November', reopens: 'late May, around Memorial Day', note: 'The Mirror Lake Highway is not plowed over the summit in winter and becomes a snowmobile route.' },
  'UT/Monte Cristo Summit UT 39': { closes: 'late November or December', reopens: 'May', note: 'UDOT closes UT 39 over the summit between the Ogden Valley side and Woodruff.' },
  'AK/Hatcher Pass AK 1': { closes: 'late September or October, with the first snow', reopens: 'around July 1', note: 'The gravel road over the summit closes. The paved road to Independence Mine on the Palmer side stays open in winter.' },
  'VT/Smugglers Notch VT 108': { closes: 'mid-October to mid-November, depending on snow', reopens: 'mid-May', note: 'The Notch section between Stowe and Jeffersonville is not plowed. Tractor trailers are prohibited all year.' },
  'VT/Hazens Notch VT 58': { closes: 'November', reopens: 'May', note: 'The unpaved Notch section between Montgomery Center and Lowell is not maintained in winter.' },
  'ME/Evans Notch ME 113': { closes: 'November', reopens: 'mid-May', note: 'The road through the White Mountain National Forest is gated and unplowed in winter.' },
  'SD/Needles Highway SD 87': { closes: 'with the first snow, usually by November', reopens: 'around April 1', note: 'Custer State Park closes the highway and its narrow tunnels for the winter.' },
  'AB/Highwood Pass Hwy 40': { closes: 'December 1', reopens: 'June 15', note: 'This closure is fixed by date every year to protect wildlife winter range, regardless of snow.' },
};
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
<div><a href="/">Pass Checker</a> shows live conditions for ${TOTAL} mountain passes across 30 US states and 2 Canadian provinces. Washington and British Columbia are free forever.</div>
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
  const hasCams = CAM_REGIONS.has(region.code);
  const title = hasCams
    ? `Is ${shortName} Open? Live Conditions & Webcams`
    : `Is ${shortName} Open? Live ${pass.name} Conditions`;
  let desc = `Live ${shortName} road conditions: current open or closed status${hasCams ? ', webcams' : ''}, summit temperature, and restrictions${route ? ` on ${route}` : ''} in ${inState}. Updated continuously from DOT data.`;
  const url = `${SITE}/passes/${region.code.toLowerCase()}/${slugify(pass.name)}/`;
  const season = SEASONAL[`${region.code}/${pass.name}`];
  const seasonAnswer = season
    ? `${shortName} closes every winter. Typical closing: ${season.closes}. Typical reopening: ${season.reopens}. ${season.note} Exact dates change every year, so check the live status before you go.`
    : '';
  if (season) desc += ` Typical winter closure: ${season.closes}.`;
  const seasonBlock = season
    ? `<h2>When does ${shortName} close for the winter?</h2>
<p class="body-copy">${seasonAnswer.replace(shortName, `<strong>${shortName}</strong>`)}</p>
<p class="body-copy">See every seasonal closure on the <a href="/passes/seasonal-closures/">winter pass closures list</a>.</p>
<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [{
          '@type': 'Question',
          name: `When does ${shortName} close for the winter?`,
          acceptedAnswer: { '@type': 'Answer', text: seasonAnswer },
        }],
      })}</script>`
    : '';

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
<a class="cta" href="${PLAY_STORE}">Get Pass Checker on Google Play</a>
${corridor}
${seasonBlock}
${hasCams ? `<h2>${shortName} webcams</h2>
<p class="body-copy">Live DOT webcams at and around ${shortName} stream in the Pass Checker app, so you can see the road surface for yourself before you commit to the drive. Camera views refresh continuously from official ${inState} DOT feeds.</p>` : ''}
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
<a class="cta" href="${PLAY_STORE}">Get Pass Checker on Google Play</a>
${footer}`;
}

function indexPage(regions) {
  const title = `Mountain Pass Conditions — ${TOTAL} Passes, Live Status`;
  const desc = `Live open/closed status for ${TOTAL} mountain passes across 30 US states and 2 Canadian provinces. From Snoqualmie to the Coquihalla to Newfound Gap.`;
  const groups = regions
    .map(r => `<h2>${r.name}</h2><div class="sibs">${r.passes.map(p => `<a class="sib" href="/passes/${r.code.toLowerCase()}/${slugify(p.name)}/">${p.name}</a>`).join('')}</div>`)
    .join('');
  return head(title, desc, `${SITE}/passes/`) + `
<div class="crumb"><a href="/">Pass Checker</a></div>
<h1>Live mountain pass conditions</h1>
<p class="sub">${TOTAL} passes &middot; 30 states &middot; 2 provinces</p>
<p class="body-copy">Planning around a seasonal road? See <a href="/passes/seasonal-closures/">which passes close for the winter and when</a>.</p>
<a class="cta" href="${APP_STORE}">Get Pass Checker on the App Store</a>
<a class="cta" href="${PLAY_STORE}">Get Pass Checker on Google Play</a>
${groups}
${footer}`;
}


function seasonalPage(regions) {
  const title = `Mountain Passes That Close for Winter: Typical Closing Dates`;
  const desc = `Which mountain passes close for the winter and when: Independence Pass, Trail Ridge Road, Tioga, Sonora, North Cascades, Chinook, McKenzie and more, with live open or closed status.`;
  const rows = [];
  for (const r of regions) {
    for (const p of r.passes) {
      const s = SEASONAL[`${r.code}/${p.name}`];
      if (!s) continue;
      rows.push(`<h2><a href="/passes/${r.code.toLowerCase()}/${slugify(p.name)}/">${p.name}</a>, ${r.name}</h2>
<p class="body-copy"><strong>Typically closes:</strong> ${s.closes}<br><strong>Typically reopens:</strong> ${s.reopens}</p>
<p class="body-copy">${s.note}</p>`);
    }
  }
  return head(title, desc, `${SITE}/passes/seasonal-closures/`) + `
<div class="crumb"><a href="/">Pass Checker</a> / <a href="/passes/">Passes</a></div>
<h1>Mountain passes that close for winter</h1>
<p class="sub">${rows.length} seasonal closures &middot; typical dates &middot; live status on each pass page</p>
<p class="body-copy">Most mountain passes are plowed and stay open all winter. These ${rows.length} are not: each one is gated when the snow arrives and stays shut until spring. The windows below are typical patterns from past seasons. The agency that maintains each road sets the actual dates every year, so open a pass page for its live status.</p>
<a class="cta" href="${APP_STORE}">Get Pass Checker on the App Store</a>
<a class="cta" href="${PLAY_STORE}">Get Pass Checker on Google Play</a>
${rows.join('\n')}
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
fs.mkdirSync(path.join(ROOT, 'passes', 'seasonal-closures'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'passes', 'seasonal-closures', 'index.html'), seasonalPage(DATA));
urls.push(`${SITE}/passes/seasonal-closures/`);

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n') +
  `\n</urlset>\n`);

fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`Generated ${count} pass pages, ${DATA.length} state hubs, 1 index, sitemap (${urls.length} URLs), robots.txt`);
