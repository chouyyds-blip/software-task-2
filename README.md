# 竞遇 · 视障友好适配

软件工程揭榜任务二，周玥妍。项目源自[大学生竞赛信息与组队管理系统](https://github.com/chouyyds-blip/jingyu/tree/68096302263bda20722940af0aeb3ef289081bf4)，独立运行版包含「用户与权限」「竞赛信息」两个个人负责模块。组队及报名数据表用于维护竞赛的原有完整性约束。

## 运行

安装 Python 3.10 或更高版本。项目运行使用标准库和 SQLite，启动后使用浏览器访问 <http://127.0.0.1:8000>。

```powershell
python server.py
```

本地演示账号为学生 `zhou`、管理员 `admin`，初始密码均为 `Demo123456`。首次启动会生成示例竞赛和本地数据库。可用 `--db data/another.db` 另建演示库。

## 适配

- 搜索与分类提供持久的可见标签，详情和编辑按钮在无障碍名称中带有竞赛标题。结果数和空结果通过单独的状态区反馈。
- 首个 Tab 可跳到主要内容。页面切换聚焦标题。弹窗进入标题，Esc 和关闭按钮可返回原入口。表单提交错误提供文字反馈并聚焦错误信息。
- 截止时间可以直接输入日期或本地日期时间，字段关联格式提示。已有报名的竞赛仍执行资格字段锁定。
- 模拟系统强制颜色时，使用系统颜色标出导航状态、键盘焦点、卡片和弹窗边界。

## 验证

安装 Node.js 20 或更高版本和 Microsoft Edge。浏览器测试会启动隔离服务和临时数据库，在 `reports/after` 生成截图与 JSON。可用 `JINGYU_REPORTS` 指定其他输出目录。

```powershell
npm install
npm test
python -m unittest discover -s tests -p 'test_*.py' -v
```

用 `git worktree add ../jingyu-baseline b739bef` 检出提取后的基线，在该目录运行 `python server.py --port 8001`。随后在适配版目录运行 `node tests/baseline.cjs http://127.0.0.1:8001` 复现基线取证。

- [改造前报告](reports/baseline/report.json) · [改造前截图](reports/baseline/01-search-focus.png)
- [改造后报告](reports/after/report.json) · [改造后截图目录](reports/after/)
- [键盘焦点](reports/after/01-search-focus.png) · [登录错误](reports/after/02-login-error.png) · [发布竞赛](reports/after/04-competition-form.png) · [强制颜色](reports/after/05-forced-colors.png)

项目通过 Windows 浏览器运行，适配参考 WCAG 2.2 中的键盘、焦点、名称与角色、状态消息要求。高对比度证据来自 Edge 的 `forced-colors` 模拟。NVDA 2026.3.1 已启动尝试，项目控件的实际朗读未能确认，读屏语义证据以 Edge 无障碍树记录为准。 [WCAG 2.2](https://www.w3.org/TR/WCAG22/) · [Microsoft Edge 无障碍测试文档](https://learn.microsoft.com/en-us/microsoft-edge/devtools-guide-chromium/accessibility/accessibility-testing-in-devtools)
