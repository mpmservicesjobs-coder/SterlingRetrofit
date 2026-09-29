// Builds the Offload A5 flyer: injects QR + coverage map, renders a print PDF (with bleed) and PNG previews.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = process.argv[2] || 'out';
fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true });

// Fonts
const fs_ = 'node_modules/@fontsource';
for (const f of [
  'anton/files/anton-latin-400-normal.woff2',
  'barlow-condensed/files/barlow-condensed-latin-600-normal.woff2',
  'barlow-condensed/files/barlow-condensed-latin-700-normal.woff2',
  'barlow-condensed/files/barlow-condensed-latin-800-normal.woff2',
  'barlow/files/barlow-latin-500-normal.woff2',
  'barlow/files/barlow-latin-700-normal.woff2',
]) fs.copyFileSync(path.join(fs_, f), path.join(OUT, 'fonts', path.basename(f)));
for (const f of ['logo-light.png', 'logo-dark.png']) fs.copyFileSync(f, path.join(OUT, f));

// Coverage map (miles from Leeds centre, x east / y south)
const LEEDS = [53.800, -1.549];
const towns = [
  ['Bradford', 53.795, -1.759, 'l'], ['Wakefield', 53.683, -1.499, 'r'], ['Harrogate', 53.992, -1.541, 'r'],
  ['Wetherby', 53.928, -1.386, 'r'], ['Otley', 53.905, -1.691, 'l'], ['Ilkley', 53.925, -1.822, 'l'],
  ['Garforth', 53.793, -1.388, 'r'],
  ['Castleford', 53.725, -1.362, 'r'], ['Tadcaster', 53.884, -1.262, 'r'],
  ['Dewsbury', 53.691, -1.633, 'l'], ['Huddersfield', 53.645, -1.780, 'l'], ['Halifax', 53.721, -1.860, 'l'],
  ['York', 53.960, -1.081, 'l'], ['Selby', 53.784, -1.067, 'l'],
];
const W = 60, H = 44, cx = 28, cy = 23, k = 1.0; // units per mile
const toXY = (lat, lon) => [cx + (lon - LEEDS[1]) * 40.8 * k, cy - (lat - LEEDS[0]) * 69 * k];
let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Barlow Condensed" font-weight="700">
<defs><clipPath id="mc"><rect width="${W}" height="${H}" rx="1.6"/></clipPath>
<pattern id="dots" width="2" height="2" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".18" fill="#C9CCBF"/></pattern></defs>
<g clip-path="url(#mc)">
<rect width="${W}" height="${H}" fill="#EEF0E8"/><rect width="${W}" height="${H}" fill="url(#dots)"/>
<circle cx="${cx}" cy="${cy}" r="${20 * k}" fill="#CCFA0D" fill-opacity=".38" stroke="#8FB400" stroke-width=".35"/>
<circle cx="${cx}" cy="${cy}" r="${10 * k}" fill="#CCFA0D" fill-opacity=".55" stroke="#8FB400" stroke-width=".3" stroke-dasharray="1 .8"/>`;
// Motorway hints (approximate, stylised)
const road = (pts, label, at) => {
  s += `<polyline points="${pts.map(p => toXY(...p).map(v => v.toFixed(2)).join(',')).join(' ')}" fill="none" stroke="#fff" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>`;
  s += `<polyline points="${pts.map(p => toXY(...p).map(v => v.toFixed(2)).join(',')).join(' ')}" fill="none" stroke="#9EA394" stroke-width=".4" stroke-linecap="round" stroke-linejoin="round"/>`;
  const [x, y] = toXY(...at);
  if (0) s += `<rect x="${(x - 2.6).toFixed(2)}" y="${(y - 1.1).toFixed(2)}" width="5.2" height="2.2" rx=".4" fill="#0E0F0C"/><text x="${x.toFixed(2)}" y="${(y + .62).toFixed(2)}" font-size="1.7" fill="#fff" text-anchor="middle">${label}</text>`;
};
road([[53.62, -1.98], [53.70, -1.75], [53.745, -1.56], [53.72, -1.35], [53.70, -1.15], [53.70, -0.95]], 'M62', [53.712, -1.24]);
road([[53.55, -1.47], [53.66, -1.51], [53.745, -1.52], [53.80, -1.43], [53.84, -1.33]], 'M1', [53.615, -1.495]);
road([[53.60, -1.29], [53.75, -1.33], [53.90, -1.33], [54.05, -1.40]], 'A1(M)', [54.00, -1.38]);
for (const [n, la, lo, side] of towns) {
  const [x, y] = toXY(la, lo);
  const tx = side === 'l' ? x - 1.1 : x + 1.1;
  s += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r=".62" fill="#0E0F0C"/>`;
  s += `<text x="${tx.toFixed(2)}" y="${(y + .62).toFixed(2)}" font-size="1.85" fill="#0E0F0C" text-anchor="${side === 'l' ? 'end' : 'start'}" paint-order="stroke" stroke="#EEF0E8" stroke-width=".5">${n}</text>`;
}
s += `<circle cx="${cx}" cy="${cy}" r="2.4" fill="#0E0F0C"/><circle cx="${cx}" cy="${cy}" r="1.1" fill="#CCFA0D"/>
<rect x="${cx - 5.3}" y="${cy + 3}" width="10.6" height="3.4" rx=".6" fill="#0E0F0C"/><text x="${cx}" y="${cy + 5.55}" font-size="2.6" font-weight="800" fill="#CCFA0D" text-anchor="middle" letter-spacing=".15">LEEDS</text>
<g transform="translate(1.5 ${H - 5.5})"><rect width="24.5" height="4.2" rx=".6" fill="#fff" fill-opacity=".9"/>
<circle cx="2" cy="2.1" r="1.1" fill="#CCFA0D" stroke="#8FB400" stroke-width=".25"/><text x="3.6" y="2.75" font-size="1.75" fill="#0E0F0C">Approx. 20-mile core area</text></g>
</g><rect width="${W}" height="${H}" rx="1.6" fill="none" stroke="#DADDD2" stroke-width=".3"/></svg>`;

const qr = fs.readFileSync('qr-wa.svg', 'utf8');
const html = fs.readFileSync('flyer.html', 'utf8').replaceAll('{{QR}}', qr).replace('{{MAP}}', s);
fs.writeFileSync(path.join(OUT, 'flyer.html'), html);

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ deviceScaleFactor: 3 });
  await p.goto('file://' + path.resolve(OUT, 'flyer.html'));
  await p.waitForSelector('body[data-ready]');
  await p.pdf({ path: path.join(OUT, 'Offload-A5-Flyer-PRINT-bleed.pdf'), width: (437/72)+'in', height: (613/72)+'in', printBackground: true, preferCSSPageSize: true });
  const pages = await p.$$('.page');
  const names = ['front', 'back'];
  for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: path.join(OUT, `preview-${names[i]}.png`) });
  // overflow check
  const issues = await p.evaluate(() => [...document.querySelectorAll('.safe *, .contact *')].filter(e => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').map(e => e.className));
  console.log('overflow:', issues);
  await b.close();
  // Trim the PDF MediaBox to exactly 154 x 216 mm (A5 + 3 mm bleed); also set TrimBox/BleedBox for the printer.
  require('child_process').execFileSync('python3', ['-c', `
import pymupdf,sys
f=sys.argv[1]; d=pymupdf.open(f)
W=154/25.4*72; H=216/25.4*72; T=3/25.4*72
for p in d:
    h=p.mediabox.height; y0=h-H
    box=lambda x0,y0_,x1,y1: '[%.3f %.3f %.3f %.3f]'%(x0,y0_,x1,y1)
    for k in ('MediaBox','CropBox','BleedBox'): d.xref_set_key(p.xref,k,box(0,y0,W,h))
    d.xref_set_key(p.xref,'TrimBox',box(T,y0+T,W-T,h-T))
d.save(f+'.tmp',garbage=3,deflate=True); import os; os.replace(f+'.tmp',f)
`, path.join(OUT, 'Offload-A5-Flyer-PRINT-bleed.pdf')]);
})();
