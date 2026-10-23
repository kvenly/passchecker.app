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
// Passes in those regions that have no camera in the app (mirrors the empty
// camera lists in the app's index.html). Their pages must not promise webcams.
const NO_CAM_PASSES = new Set([
  'WA/Mt Baker SR 542', 'WA/Cayuse Pass SR 410', 'WA/Chinook Pass SR 410',
  'CA/Tioga Pass CA 120', 'CA/Monitor Pass CA 89', 'CA/Sonora Pass CA 108',
  'AK/Isabel Pass Richardson Hwy', 'AK/White Pass South Klondike Hwy',
  'ID/Fourth of July Pass I-90', 'ID/Galena Summit ID 75',
  'AZ/Mingus Mountain AZ 89A', 'AZ/Sitgreaves Pass AZ 66',
  'HI/Mauna Kea Access Road HI 200', 'HI/Saddle Road HI 200',
  'OR/McKenzie Pass OR 242',
  'CO/Tennessee Pass US 24', 'CO/Lizard Head Pass CO 145', 'CO/Trail Ridge Road US 34', 'CO/Rabbit Ears Pass US 40',
]);

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
  'CO/Independence Pass CO 82': { closes: 'early to mid November, or earlier if heavy snow arrives', reopens: 'the Thursday before Memorial Day', note: 'CDOT gates the highway east of Aspen and west of Twin Lakes. Vehicles over 35 feet are prohibited all year.' },
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
body{background:var(--bg);color:var(--fg);font-family:var(--sans);line-height:1.6}
nav.top{position:fixed;top:0;left:0;right:0;background:rgba(10,10,10,0.85);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid var(--border);padding:0 24px;z-index:100}
.nav-inner{max-width:960px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;height:52px}
.nav-logo{font-family:var(--mono);font-size:13px;font-weight:bold;color:var(--green);letter-spacing:0.04em}
.nav-logo:hover{text-decoration:none}
.nav-right{display:flex;align-items:center;gap:24px}
.nav-right a{font-size:14px;color:var(--dim);transition:color 0.2s}
.nav-right a:hover,.nav-right a.active{color:var(--fg);text-decoration:none}
.nav-dl{background:#16a34a;color:#fff !important;padding:7px 16px;border-radius:8px;font-weight:600;font-size:13px !important}
.nav-dl:hover{background:#15803d}
@media (max-width:600px){.nav-right .hide-sm{display:none}.nav-right{gap:16px}}
.page{max-width:640px;margin:0 auto;padding:84px 24px 40px}
.page.wide{max-width:960px}
.site-foot{background:var(--bg2);border-top:1px solid var(--border);padding:32px 24px;text-align:center;font-size:13px;color:#4b5563}
.site-foot .fi{max-width:960px;margin:0 auto;display:flex;flex-direction:column;gap:8px;align-items:center}
.site-foot .fl{font-family:var(--mono);font-size:13px;color:var(--green);font-weight:bold;letter-spacing:0.04em;margin-bottom:4px}
.site-foot a{color:#4b5563}
.site-foot a:hover{color:var(--green);text-decoration:none}
.site-foot .links{display:flex;gap:20px;flex-wrap:wrap;justify-content:center}
.site-foot .legal{font-size:12px;max-width:640px;line-height:1.6}
.hero{text-align:center;padding:48px 0 8px;position:relative}
.hero::before{content:'';position:absolute;left:-24px;right:-24px;top:-84px;bottom:0;background:radial-gradient(ellipse 80% 60% at 50% 0%,rgba(34,197,94,0.08) 0%,transparent 70%);pointer-events:none}
.hero > *{position:relative}
.eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:var(--green);margin-bottom:16px}
.hero h1{font-size:clamp(2rem,5.5vw,3.5rem);font-weight:800;letter-spacing:-0.03em;line-height:1.1;margin-bottom:18px}
.hero h1 span{color:var(--green)}
.hero p{font-size:1.0625rem;color:var(--dim);max-width:560px;margin:0 auto;line-height:1.75}
.stats{max-width:720px;margin:40px auto 0;display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:26px 0}
.stat{text-align:center;padding:0 12px;border-right:1px solid var(--border)}
.stat:last-child{border-right:0}
.stat-num{font-size:clamp(1.5rem,3vw,2rem);font-weight:800;color:var(--green);letter-spacing:-0.02em;line-height:1.1}
.stat-label{font-family:var(--mono);font-size:10px;color:var(--dim);letter-spacing:0.12em;text-transform:uppercase;margin-top:6px}
.legend{display:flex;gap:18px;justify-content:center;flex-wrap:wrap;margin:26px 0 8px;font-family:var(--mono);font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:var(--dim)}
.legend span{display:inline-flex;align-items:center;gap:7px}
.region-group{margin-top:40px}
.region-title{font-family:var(--mono);font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:var(--green);margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px}
.region-title a{color:var(--green)}
.region-title .count{color:#4b5563}
.pass-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}
.pass-pill{background:#161616;border:1px solid var(--border);border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px;color:var(--dim);font-family:var(--mono);font-size:13px;transition:border-color 0.2s,color 0.2s}
.pass-pill:hover{border-color:#16a34a;color:var(--fg);text-decoration:none}
.pass-dot{width:7px;height:7px;border-radius:50%;background:#4b5563;flex-shrink:0}
.pass-dot.open{background:var(--green)}.pass-dot.restricted{background:var(--yellow)}.pass-dot.closed{background:var(--red)}
.pass-pill .pname{flex:1;min-width:0}
.pass-pill .pst{font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#4b5563}
.pass-pill .pst.open{color:var(--green)}.pass-pill .pst.restricted{color:var(--yellow)}.pass-pill .pst.closed{color:var(--red)}
.note-row{margin-top:40px;font-size:13px;color:var(--dim);text-align:center}
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
`;

function head(title, desc, canonical, opts = {}) {
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
<meta property="og:image" content="${SITE}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="apple-itunes-app" content="app-id=6764229547">
<link rel="icon" href="/icon.png">
<style>${css}</style>
<script>
document.addEventListener('DOMContentLoaded', function () {
  var ua = navigator.userAgent;
  var hide = /android/i.test(ua) ? 'apps.apple.com' : /iphone|ipad|ipod/i.test(ua) ? 'play.google.com' : null;
  if (!hide) return;
  document.querySelectorAll('a.cta').forEach(function (a) { if (a.href.indexOf(hide) !== -1) a.style.display = 'none'; });
});
</script>
</head>
<body>
<nav class="top"><div class="nav-inner">
<a class="nav-logo" href="/">Pass Checker//</a>
<div class="nav-right">
<a href="/#features" class="hide-sm">Features</a>
<a href="/passes/"${opts.active === 'status' ? ' class="active"' : ''}>Live Status</a>
<a href="/accuracy/" class="hide-sm">Accuracy</a>
<a href="/#passes" class="hide-sm">Coverage</a>
<a href="${APP_STORE}" class="nav-dl">Download</a>
</div></div></nav>
<main class="page${opts.wide ? ' wide' : ''}">`;
}

const footer = `</main>
<footer class="site-foot"><div class="fi">
<div class="fl">Pass Checker//</div>
<div class="links"><a href="/passes/">Live Status</a><a href="/accuracy/">Accuracy Report</a><a href="/privacy.html">Privacy Policy</a><a href="/press/">Press Kit</a><a href="https://mountainmediadigital.com">Mountain Media Digital</a></div>
<div class="legal">Live conditions for ${TOTAL} mountain passes across 30 US states and 2 Canadian provinces. Washington and British Columbia are free forever. For info only; always verify with your local DOT before travel.</div>
<div>&copy; ${new Date().getFullYear()} Mountain Media Digital LLC &nbsp;&middot;&nbsp; Not affiliated with any government agency.</div>
</div></footer>
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
  const hasCams = CAM_REGIONS.has(region.code) && !NO_CAM_PASSES.has(`${region.code}/${pass.name}`);
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
<a class="cta" href="${APP_STORE}">Get live cameras and every pass on the App Store</a>
<a class="cta" href="${PLAY_STORE}">Get Pass Checker on Google Play</a>
${corridor}
${seasonBlock}
${hasCams ? `<h2>${shortName} webcams</h2>
<p class="body-copy">Live DOT webcams at and around ${shortName} stream in the Pass Checker app, so you can see the road surface for yourself before you commit to the drive. Camera views refresh continuously from official ${inState} DOT feeds.</p>` : ''}
<p class="body-copy">Pass Checker checks its own status against official DOT data every hour. See the <a href="/accuracy/">live accuracy report</a>.</p>
<p class="body-copy">The Pass Checker app adds ${hasCams ? 'live DOT camera feeds, ' : ''}summit temperatures from roadside weather stations, chain law and restriction details, and every other pass in ${region.name}${region.code === 'WA' || region.code === 'BC' ? ' free of charge' : ''}.</p>
<h2>Other ${region.name} passes</h2>
<div class="sibs">${sibLinks}</div>
${footer.replace('</body></html>', '')}
${widgetScript(region.code, pass.name)}
</body></html>`;
}

// Regions read straight from DOT feeds; their hub and index pills show live
// status. Other regions are fetched through the paid path, so the static
// pages leave them as plain links.
const LIVE_REGIONS = ['WA', 'BC', 'CO', 'CA', 'UT', 'ID', 'AZ'];

function pill(code, p) {
  return `<a class="pass-pill" href="/passes/${code.toLowerCase()}/${slugify(p.name)}/" data-r="${code}" data-p="${p.name.replace(/"/g, '&quot;')}"><span class="pass-dot"></span><span class="pname">${p.name}</span><span class="pst"></span></a>`;
}

function liveDotsScript(codes) {
  return `<script>
(function () {
  var API = '${API}';
  ${JSON.stringify(codes)}.forEach(function (code) {
    fetch(API + '/passes/' + code).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.data) return;
      var byName = {};
      d.data.forEach(function (p) { byName[p.name] = p.status; });
      document.querySelectorAll('.pass-pill[data-r="' + code + '"]').forEach(function (el) {
        var st = byName[el.getAttribute('data-p')];
        if (!st) return;
        el.querySelector('.pass-dot').className = 'pass-dot ' + st;
        var label = el.querySelector('.pst');
        label.className = 'pst ' + st;
        label.textContent = st === 'restricted' ? 'open*' : st;
      });
    }).catch(function () {});
  });
})();
</script>`;
}

function statePage(region) {
  const title = `${region.name} Mountain Pass Conditions: Live Status`;
  const desc = `Live open/closed status for all ${region.passes.length} ${region.name} mountain passes: ${region.passes.slice(0, 4).map(p => p.name.replace(routeOf(p.name) || '', '').trim()).join(', ')} and more.`;
  const url = `${SITE}/passes/${region.code.toLowerCase()}/`;
  const live = LIVE_REGIONS.includes(region.code);
  const free = region.code === 'WA' || region.code === 'BC';
  return head(title, desc, url, { wide: true, active: 'status' }) + `
<div class="crumb"><a href="/">Pass Checker</a> / <a href="/passes/">Live Status</a> / ${region.name}</div>
<div class="hero">
<div class="eyebrow">// ${region.name}${free ? ' &middot; free in the app' : ''}</div>
<h1>${region.name} mountain passes</h1>
<p>${region.passes.length} passes with live conditions from official ${region.country === 'CA' ? 'provincial' : 'state'} transportation data.${live ? ' Status below updates live.' : ' Open a pass for its live status.'}</p>
</div>
<div class="region-group"><div class="pass-list">${region.passes.map(p => pill(region.code, p)).join('')}</div></div>
<a class="cta" href="${APP_STORE}">Get Pass Checker on the App Store</a>
<a class="cta" href="${PLAY_STORE}">Get Pass Checker on Google Play</a>
${footer.replace('</body></html>', '')}
${live ? liveDotsScript([region.code]) : ''}
</body></html>`;
}

function indexPage(regions) {
  const title = `Mountain Pass Conditions: ${TOTAL} Passes, Live Status`;
  const desc = `Live open/closed status for ${TOTAL} mountain passes across 30 US states and 2 Canadian provinces. From Snoqualmie to the Coquihalla to Newfound Gap.`;
  const flag = r => (r.country === 'CA' ? '\u{1F1E8}\u{1F1E6}' : '\u{1F1FA}\u{1F1F8}');
  const groups = regions.map(r => `<div class="region-group">
<div class="region-title"><a href="/passes/${r.code.toLowerCase()}/">${flag(r)} ${r.name}${r.code === 'WA' || r.code === 'BC' ? ' (free)' : ''}</a><span class="count">${r.passes.length} pass${r.passes.length === 1 ? '' : 'es'}</span></div>
<div class="pass-list">${r.passes.map(p => pill(r.code, p)).join('')}</div>
</div>`).join('');
  return head(title, desc, `${SITE}/passes/`, { wide: true, active: 'status' }) + `
<div class="hero">
<div class="eyebrow">// live status</div>
<h1>Every pass.<br><span>Live.</span></h1>
<p>Open, restricted or closed for ${TOTAL} mountain passes, straight from official DOT data. Tap any pass for temperature, restrictions and its live page.</p>
<div class="stats">
<div class="stat"><div class="stat-num">${TOTAL}</div><div class="stat-label">Mountain passes</div></div>
<div class="stat"><div class="stat-num">32</div><div class="stat-label">States and provinces</div></div>
<div class="stat"><div class="stat-num">Hourly</div><div class="stat-label"><a href="/accuracy/">Accuracy checks</a></div></div>
</div>
<div class="legend"><span><span class="pass-dot open"></span>Open</span><span><span class="pass-dot restricted"></span>Open, restrictions</span><span><span class="pass-dot closed"></span>Closed</span><span><span class="pass-dot"></span>Open the pass to check</span></div>
</div>
<p class="note-row">Planning around a seasonal road? See <a href="/passes/seasonal-closures/">which passes close for the winter and when</a>.</p>
${groups}
<a class="cta" href="${APP_STORE}">Get Pass Checker on the App Store</a>
<a class="cta" href="${PLAY_STORE}">Get Pass Checker on Google Play</a>
${footer.replace('</body></html>', '')}
${liveDotsScript(LIVE_REGIONS)}
</body></html>`;
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
urls.push(`${SITE}/accuracy/`);

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n') +
  `\n</urlset>\n`);

fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`Generated ${count} pass pages, ${DATA.length} state hubs, 1 index, sitemap (${urls.length} URLs), robots.txt`);
