const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const reports = path.resolve(process.env.JINGYU_REPORTS || path.join(root, 'reports', 'after'));
const competition = '校园软件创意设计赛';
const work = [];

async function tabTo(page, target, backwards = false) {
  await target.waitFor({timeout: 5000});
  for (let i = 0; i < 40; i++) {
    if (await target.evaluate(element => element === document.activeElement)) return;
    await page.keyboard.press(backwards ? 'Shift+Tab' : 'Tab');
  }
  throw Error('Tab 无法到达 ' + target);
}

async function activate(page, target, key = 'Enter') {
  await tabTo(page, target);
  await page.keyboard.press(key);
}

async function type(page, target, value) {
  await tabTo(page, target);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(value);
}

async function focused(target) {
  await target.evaluate(element => {
    if (element !== document.activeElement) throw Error('焦点未落在 ' + element.textContent);
  });
}

async function snapshot(cdp, name, role) {
  const {nodes} = await cdp.send('Accessibility.getFullAXTree');
  const node = nodes.find(node => !node.ignored && node.role?.value === role && node.name?.value === name);
  assert.ok(node, `无障碍树缺少 ${role} ${name}`);
  return {role, name, description: node.description?.value, properties: Object.fromEntries((node.properties || [])
    .filter(entry => entry.name !== 'value').map(entry => [entry.name, entry.value.value]))};
}

function button(scope, name) {
  return scope.getByRole('button', {name, exact: true});
}

async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'jingyu-test-'));
  const server = spawn(process.env.PYTHON || 'python', ['-u', 'server.py', '--port', '0', '--db', path.join(temp, 'test.db')], {cwd: root});
  server.stderr.resume();
  let browser;
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('服务器启动超时')), 8000);
      let output = '';
      server.on('error', reject);
      server.on('exit', code => {
        clearTimeout(timer);
        reject(new Error('服务器退出 ' + code));
      });
      server.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/http:\/\/127\.0\.0\.1:[1-9]\d*/);
        if (match) {
          clearTimeout(timer);
          resolve(match[0]);
        }
      });
    });
    await fs.mkdir(reports, {recursive: true});
    const headed = Boolean(process.env.JINGYU_HEADED);
    browser = await chromium.launch({
      channel: 'msedge', headless: !headed,
      args: headed ? ['--force-renderer-accessibility'] : [],
    });
    const context = await browser.newContext({baseURL: url, viewport: {width: 1280, height: 900}, locale: 'en-US'});
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const browserErrors = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Accessibility.enable');
    const evidence = [];
    const title = page.locator('#page-title');
    const modal = page.locator('#modal');
    const modalTitle = page.locator('#modal-title');
    const search = page.getByRole('searchbox', {name: '按竞赛名称搜索'});
    const category = page.getByRole('combobox', {name: '竞赛分类'});
    const detail = button(page, '查看详情：' + competition);
    const count = page.locator('#competition-count');
    await page.goto('/');
    if (headed) await page.bringToFront();
    await detail.waitFor();
    await page.keyboard.press('Tab');
    await focused(page.getByRole('link', {name: '跳到主要内容'}));
    await page.keyboard.press('Enter');
    await focused(title);
    await page.keyboard.press('Tab');
    await focused(search);
    assert.ok(await search.evaluate(el => parseFloat(getComputedStyle(el).outlineWidth) >= 2));
    await page.screenshot({path: path.join(reports, '01-search-focus.png')});
    await type(page, search, '校园软件');
    assert.equal(await count.innerText(), '共 1 项竞赛');
    await type(page, search, '没有这项竞赛');
    assert.equal(await count.innerText(), '暂无符合条件的竞赛');
    await type(page, search, '');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Tab');
    await focused(category);
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    assert.equal(await count.innerText(), '共 1 项竞赛');
    await page.keyboard.press('Home');
    assert.equal(await count.innerText(), '共 3 项竞赛');
    work.push('首个 Tab 可跳到正文，搜索与分类键盘可达，数量与空结果通过状态节点反馈。');
    evidence.push(await snapshot(cdp, '主导航', 'navigation'));
    evidence.push(await snapshot(cdp, '按竞赛名称搜索', 'searchbox'));
    evidence.push(await snapshot(cdp, '竞赛分类', 'combobox'));
    evidence.push(await snapshot(cdp, '查看详情：' + competition, 'button'));
    await activate(page, detail);
    await page.getByRole('dialog', {name: competition, exact: true}).waitFor();
    await focused(modalTitle);
    evidence.push(await snapshot(cdp, competition, 'dialog'));
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press(i % 3 ? 'Tab' : 'Shift+Tab');
      assert.equal(await modal.evaluate(el => el.contains(document.activeElement) || document.activeElement === document.body), true);
    }
    await page.keyboard.press('Escape');
    await modal.waitFor({state: 'hidden'});
    await focused(detail);
    await activate(page, detail);
    await activate(page, button(modal, '返回竞赛列表'));
    await focused(detail);
    work.push('详情弹窗按竞赛标题命名，打开后聚焦标题，背景控件在弹窗打开时不可聚焦，关闭后焦点回到原按钮。');

    const login = button(page.locator('#account'), '登录');
    async function signIn(username, password, expectError = false) {
      await activate(page, login);
      await type(page, modal.getByLabel('用户名'), username);
      await type(page, modal.getByLabel('密码', {exact: true}), password);
      await activate(page, button(modal, '登录'));
      if (expectError) {
        const error = modal.getByText('用户名或密码错误', {exact: true});
        await error.waitFor();
        await focused(error);
      } else {
        await modal.waitFor({state: 'hidden'});
        await focused(title);
      }
    }
    async function signOut() {
      await activate(page, button(page.locator('#account'), '退出'));
      await login.waitFor();
      await focused(login);
    }
    await signIn('zhou', 'WrongPassword1', true);
    await page.screenshot({path: path.join(reports, '02-login-error.png')});
    await activate(page, button(modal, '注册账号'));
    await focused(modalTitle);
    await type(page, modal.getByLabel('用户名'), 'keyboard_student');
    await type(page, modal.getByLabel('姓名'), '课程验收学生');
    await type(page, modal.getByLabel('密码', {exact: true}), 'LocalDemoPass1');
    await activate(page, button(modal, '注册并登录'));
    await modal.waitFor({state: 'hidden'});
    await activate(page, button(page, '个人资料'));
    assert.equal(await title.innerText(), '个人资料');
    await focused(title);
    await type(page, page.getByLabel('专业'), '计算机科学与技术');
    await type(page, page.getByLabel('年级'), '2024级');
    await type(page, page.getByLabel('技能与个人简介'), '课程项目界面验证');
    const saveProfile = button(page, '保存资料');
    await activate(page, saveProfile);
    await page.getByText('个人资料已更新', {exact: true}).waitFor();
    await focused(saveProfile);
    const changePassword = button(page, '修改密码');
    await activate(page, changePassword);
    await type(page, modal.getByLabel('当前密码'), 'WrongPassword1');
    await type(page, modal.getByLabel('新密码'), 'LocalDemoPass2');
    const savePassword = button(modal, '保存新密码');
    await activate(page, savePassword);
    const passwordError = modal.getByText('原密码不正确', {exact: true});
    await passwordError.waitFor();
    await focused(passwordError);
    await type(page, modal.getByLabel('当前密码'), 'LocalDemoPass1');
    await activate(page, savePassword);
    await modal.waitFor({state: 'hidden'});
    await focused(changePassword);
    await signOut();
    await signIn('keyboard_student', 'LocalDemoPass2');
    assert.equal(await page.getByLabel('专业').inputValue(), '计算机科学与技术');
    await page.screenshot({path: path.join(reports, '03-profile.png')});
    const forbidden = await page.request.post('/api/competitions', {data: {}});
    assert.equal(forbidden.status(), 403);
    await signOut();
    work.push('全键盘注册、登录、错误反馈、资料保存、修改密码、退出与重新登录通过；学生发布权限回归通过。');

    await signIn('admin', 'Demo123456');
    await activate(page, button(page, '发现竞赛'));
    const publish = button(page, '发布竞赛');
    await activate(page, publish);
    await focused(modalTitle);
    await type(page, modal.getByLabel('竞赛名称'), '无障碍课程验收赛');
    await type(page, modal.getByLabel('竞赛分类'), '软件开发');
    await type(page, modal.getByLabel('竞赛简介'), '用于复核竞赛发布、编辑与下架。');
    await type(page, modal.getByLabel('报名截止时间'), '2099-12-31 23:59');
    const deadlineNode = await snapshot(cdp, '报名截止时间', 'textbox');
    assert.match(deadlineNode.description, /2099-12-31/);
    evidence.push(deadlineNode);
    await type(page, modal.getByLabel('官网链接（选填）'), 'https://example.com/');
    await page.screenshot({path: path.join(reports, '04-competition-form.png')});
    await activate(page, button(modal, '保存竞赛'));
    await modal.waitFor({state: 'hidden'});
    await focused(publish);
    const edit = button(page, '编辑：无障碍课程验收赛');
    await activate(page, edit);
    await type(page, modal.getByLabel('竞赛简介'), '已更新课程验收说明。');
    const status = modal.getByLabel('发布状态');
    await tabTo(page, status);
    await page.keyboard.press('End');
    assert.equal(await status.inputValue(), '0');
    await activate(page, button(modal, '保存竞赛'));
    await modal.waitFor({state: 'hidden'});
    await focused(edit);
    assert.match(await edit.locator('xpath=ancestor::article').innerText(), /已下架/);
    await signOut();
    assert.equal(await page.getByRole('heading', {name: '无障碍课程验收赛'}).count(), 0);
    await page.locator('#toast:not(.visible)').waitFor({state: 'attached'});
    work.push('全键盘发布、编辑、下架竞赛通过，管理员可见已下架文字，退出后访客看不到下架项。');

    await page.emulateMedia({forcedColors: 'active'});
    assert.equal(await page.evaluate(() => matchMedia('(forced-colors: active)').matches), true);
    assert.ok(await page.locator('.nav-item[aria-current=page]').evaluate(el => parseFloat(getComputedStyle(el).borderTopWidth) >= 1.5));
    await tabTo(page, detail);
    assert.ok(await detail.evaluate(el => parseFloat(getComputedStyle(el).outlineWidth) >= 2));
    await page.screenshot({path: path.join(reports, '05-forced-colors.png')});
    await activate(page, detail);
    assert.equal(await modal.evaluate(el => getComputedStyle(el).borderTopStyle), 'solid');
    await page.screenshot({path: path.join(reports, '06-forced-colors-dialog.png')});
    await page.keyboard.press('Escape');
    await focused(detail);
    await page.setViewportSize({width: 320, height: 800});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await activate(page, detail);
    assert.equal(await modal.evaluate(el => el.getBoundingClientRect().width <= innerWidth), true);
    await page.keyboard.press('Escape');
    work.push('模拟强制颜色下，导航、焦点和弹窗边界可辨，详情仍可用键盘开关；320 CSS 像素宽列表无页面横向滚动。');
    assert.deepEqual(browserErrors, []);
    await fs.writeFile(path.join(reports, 'report.json'), JSON.stringify({
      executedAt: new Date().toISOString(), browser: 'Microsoft Edge ' + browser.version(),
      platform: os.version(), playwright: require('playwright/package.json').version,
      passed: true, checks: work, accessibilityTree: evidence
    }, null, 2) + '\n');
    console.log(work.join('\n'));
  } finally {
    await browser?.close();
    if (server.exitCode === null && server.pid) {
      const stopped = once(server, 'exit');
      server.kill();
      await stopped;
    }
    await fs.rm(temp, {recursive: true, force: true});
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
