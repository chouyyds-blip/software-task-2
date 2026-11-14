const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');

async function main() {
  const baseURL = process.argv[2];
  if (!baseURL) throw Error('请传入提取版基线服务的地址，例如 http://127.0.0.1:8001');
  const browser = await chromium.launch({channel: 'msedge'});
  try {
    const page = await browser.newPage({baseURL, viewport: {width: 1280, height: 900}});
    await page.goto('/');
    await page.getByRole('heading', {name: '校园软件创意设计赛'}).waitFor();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    const cdp = await page.context().newCDPSession(page);
    const {nodes} = await cdp.send('Accessibility.getFullAXTree');
    const detailNames = nodes.filter(n => !n.ignored && n.role?.value === 'button' &&
      n.name?.value.includes('查看详情')).map(n => n.name.value);
    assert.ok(detailNames.length > 1 && new Set(detailNames).size === 1);
    const searchHasVisibleLabel = await page.locator('label[for=search]').count() > 0;
    const mainContentIsLive = await page.locator('#content').getAttribute('aria-live') === 'polite';
    assert.equal(searchHasVisibleLabel, false);
    assert.equal(mainContentIsLive, true);
    const directory = path.join(__dirname, '..', 'reports', 'baseline');
    await fs.mkdir(directory, {recursive: true});
    await page.screenshot({path: path.join(directory, '01-search-focus.png')});
    await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify({
      executedAt: new Date().toISOString(), browser: 'Microsoft Edge ' + browser.version(),
      detailNames, searchHasVisibleLabel, mainContentIsLive,
      findings: ['多个详情按钮在无障碍树中同名。', '搜索框已有无障碍名称，页面缺少对应的持久可见标签。', '整个正文容器是 live region，缺少独立的结果反馈区域。'],
    }, null, 2) + '\n');
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
