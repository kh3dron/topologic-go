// Headless UI smoke test. Serves the production build (dist/) with `vite
// preview` and drives the landing, playground (chess + Go), and about pages in
// headless Chromium. Fails on page errors, console errors, or any assertion.
//
// Prereqs: npm run build
//          npm i --no-save playwright && npx playwright install chromium
// Run:     node scripts/smoke-ui.mjs

import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 5199;
const BASE = `http://localhost:${PORT}`;
const CHESS_SIZE = 8;
const GO_SIZE = 19;

const failures = [];
function check(cond, msg) {
  if (cond) console.log(`  ok   ${msg}`);
  else {
    failures.push(msg);
    console.error(`  FAIL ${msg}`);
  }
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server at ${url} not ready after ${timeoutMs}ms`);
}

// Click the visible plane instance that displays canonical board cell (R, C).
// Cells are laid out in a CSS grid; plane cell (r, c) is DOM index r*cols + c,
// and displays board cell project(r, c, size) (null = void).
async function clickCell(page, R, C, size) {
  return page.evaluate(
    ([R, C, size]) => {
      const board = document.getElementById('board');
      if (!board) return 'no #board';
      const cols = getComputedStyle(board).gridTemplateColumns.split(' ').length;
      const container = document.getElementById('board-container');
      const box = container.getBoundingClientRect();
      const cells = board.querySelectorAll('.square, .void-cell, .go-intersection');
      for (let i = 0; i < cells.length; i++) {
        const p = window.__topo.project(Math.floor(i / cols), i % cols, size);
        if (!p || p[0] !== R || p[1] !== C) continue;
        const rect = cells[i].getBoundingClientRect();
        if (rect.left < box.left || rect.right > box.right) continue;
        if (rect.top < box.top || rect.bottom > box.bottom) continue;
        cells[i].click();
        return true;
      }
      return `no visible cell displaying (${R},${C})`;
    },
    [R, C, size],
  );
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  detached: true,
});

let browser;
try {
  await waitForServer(BASE);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e}`));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`);
  });

  console.log('landing /');
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForSelector('#topo-list');
  if ((await page.locator('#topo-list button:visible').count()) === 0) {
    await page.locator('.topo-group-header').first().click();
  }
  const pickerButtons = await page.locator('#topo-list button:visible').count();
  check(pickerButtons > 0, `picker has entries (${pickerButtons})`);
  await page.locator('#topo-list button:visible').first().click();
  const detailName = (await page.locator('#detail-name').innerText()).trim();
  check(detailName.length > 0, `detail card populated ("${detailName}")`);
  const href = await page.locator('#play-btn').getAttribute('href');
  check(!!href && /(play|game)\.html/.test(href), `play button links somewhere (${href})`);

  console.log('playground /play.html?g=chess&t=classic');
  await page.goto(`${BASE}/play.html?g=chess&t=classic`, { waitUntil: 'load' });
  await page.waitForSelector('#board .square');
  const chessStatus0 = (await page.locator('#status').innerText()).trim();
  check(chessStatus0.length > 0, `status bar populated ("${chessStatus0}")`);
  check(await clickCell(page, 6, 4, CHESS_SIZE) === true, 'select e2 pawn');
  check(await clickCell(page, 4, 4, CHESS_SIZE) === true, 'move to e4');
  await page.waitForTimeout(100);
  const chessStatus1 = (await page.locator('#status').innerText()).trim();
  check(chessStatus1 !== chessStatus0, `status changed after move ("${chessStatus0}" -> "${chessStatus1}")`);

  console.log('playground /play.html?g=go&t=torus');
  await page.goto(`${BASE}/play.html?g=go&t=torus`, { waitUntil: 'load' });
  await page.waitForSelector('#board .go-intersection');
  const goStatus0 = (await page.locator('#status').innerText()).trim();
  check(goStatus0.length > 0, `status bar populated ("${goStatus0}")`);
  check(await clickCell(page, 3, 3, GO_SIZE) === true, 'place a stone at (3,3)');
  await page.waitForTimeout(100);
  const goStatus1 = (await page.locator('#status').innerText()).trim();
  check(goStatus1 !== goStatus0, `status changed after stone ("${goStatus0}" -> "${goStatus1}")`);

  console.log('about /about.html');
  await page.goto(`${BASE}/about.html`, { waitUntil: 'load' });
  await page.waitForSelector('#census-table');
  const catalogEntries = await page.locator('.catalog-entry').count();
  check(catalogEntries > 0, `catalog entries rendered (${catalogEntries})`);
  const censusRows = await page.locator('#census-table tr').count();
  check(censusRows > 1, `census table populated (${censusRows} rows)`);

  check(pageErrors.length === 0, `no page/console errors (${pageErrors.length})`);
  for (const e of pageErrors) console.error(`    ${e}`);
} catch (e) {
  failures.push(String(e));
  console.error(`FAIL ${e}`);
} finally {
  if (browser) await browser.close();
  try {
    process.kill(-server.pid);
  } catch {
    /* already dead */
  }
}

console.log(failures.length ? `\nSMOKE: FAIL (${failures.length})` : '\nSMOKE: PASS');
process.exit(failures.length ? 1 : 0);
