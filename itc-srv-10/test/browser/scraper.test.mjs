import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createScraper } from '../../src/scraper.mjs';

test('real Chromium extracts staff pagination, users and leave tables from a fixture site', async (t) => {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Content-Type', 'text/html');
    if (url.pathname === '/') {
      res.end('<form action="/login" method="post"><input name="txtUsername"><input name="txtPassword" type="password"><input type="submit"></form>');
    } else if (url.pathname === '/login') {
      req.resume(); res.writeHead(302, { Location: '/home' }); res.end();
    } else if (url.pathname === '/Users/List') {
      const second = url.searchParams.has('page');
      res.end(`<table><tbody><tr><td>${second ? '2' : '1'}</td><td>Fixture staff</td></tr></tbody></table>${second ? '' : '<li id="MainContent_gvStaff_next"><a href="?page=2">Next</a></li>'}`);
    } else if (url.pathname === '/Leaves/BalanceLogs') {
      const employee = url.searchParams.get('employee') || '1';
      res.end(`<select name="ctl00$MainContent$ddlYear"><option value="2026">2026</option></select>
        <select id="MainContent_ucUsersListWithFilter_ddlUsers" name="ctl00$MainContent$ucUsersListWithFilter$ddlUsers" onchange="location.search='employee='+this.value">
        <option value="1" ${employee === '1' ? 'selected' : ''}>One</option><option value="2" ${employee === '2' ? 'selected' : ''}>Two</option></select>
        <table id="MainContent_gvLogs"><thead><tr><th></th><th>Period</th></tr></thead><tbody><tr><td>${employee}</td><td>2026-09-30</td></tr></tbody></table>
        <table id="MainContent_gvBalances"><thead><tr><th></th><th>Balance</th></tr></thead><tbody><tr><td>Annual</td><td>${employee}</td></tr></tbody></table>`);
    } else res.end('Home');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const scraper = createScraper({ url: `http://127.0.0.1:${server.address().port}`, user: 'fixture', password: 'fixture' });
  t.after(async () => { await scraper.close(); await new Promise(resolve => server.close(resolve)); });
  const signal = AbortSignal.timeout(45000);
  assert.deepEqual(await scraper.execute('pitstop-data', {}, signal), { success: true, rows: [['1', 'Fixture staff'], ['2', 'Fixture staff']] });
  assert.deepEqual(await scraper.execute('leave-users', {}, signal), { success: true, users: [{ value: '1', text: 'One' }, { value: '2', text: 'Two' }] });
  const leaves = await scraper.execute('employee-leaves', { year: '2026', employeeId: '2' }, signal);
  assert.equal(leaves.employee, 'Two');
  assert.deepEqual(leaves.logs, [{ '#': '2', Period: '2026-09-30' }]);
  assert.deepEqual(leaves.balances, [{ 'Leave Type': 'Annual', Balance: '2' }]);
});
