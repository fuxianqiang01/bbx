# Codex 工作约定 — bbx-platform

本文件是 Codex 在本目录工作的强制入口。先读本文件，再读 `README.md` 和待改脚本文件头的最新版本段。

## 0. Git 与远端源码接收（2026-10-27）

- 用户已明确要求全部工具和脚本使用 Git 管理。本目录已初始化 main；统一远程仓库为 https://github.com/fuxianqiang01/bbx.git（origin），首次提交不是最新运行源码基线。
- 每次开始先检查 git status；新增开发产物必须提交 Git。完整流程见 GIT_WORKFLOW.md。
- 用户将导出 UU 远程显示屏 1 的全部脚本。截图已观察地图 1.9.45、VIP 1.9.1、排班通知 1.5.1、新单取数 1.6.0；源码尚未接收，登记见 config/scripts.json。
- 下表只代表当前本地迁移代码。旧版问题不能直接归因于远端新版；先接收和审查导出，再决定修复目标。
- outputs/、patched/ 历史内容及根目录旧专项默认不进入首次提交：包含取证材料和待审真实样例，原文件保留。审核后的脚本统一进入 scripts/ 固定文件名；切换时同步本文件和测试目标。
- 原始导出放 imports/（被忽略）；不提交运行存储、浏览器资料、凭据或客户信息。提交前运行 node tools/check-staged.cjs 并人工检查 git diff --cached。
- 用户已指定 origin 为 https://github.com/fuxianqiang01/bbx.git。后续多端使用该仓库；不擅自切换地址、创建公开仓库或改写公共历史。推送前仍须审查提交范围。

## 1. 唯一工作区与主源码（本地迁移基线）

只在 `C:/Users/Administrator/WorkBuddy/2026-10-26-22-46-29/bbx-platform` 内开发，不要读取或修改桌面、旧 WorkBuddy、D 盘备份里的同名脚本来代替本目录。

| 模块 | 当前唯一主源码 |
|---|---|
| 流水/订单地图 | `outputs/bbx_flow_orderboard_v1.9.29.user.js` |
| 来电查询、拨号、流水与订单面板 | `outputs/bbx_auto_call_query_v1.9.0.user.js` |
| 备注快捷修改/自动发车 | `patched/bbx_orderCenter_remark.user.js` |
| 订单管理增强 | `patched/bbx_orderManage_enhance.user.js` |

`patched/bbx_flow_orderboard.user.js` 是 v1.8.20，`patched/bbx_auto_call_query.user.js` 是 v1.8.22，均为旧兼容副本，不是当前主源码。`outputs/` 内其它版本是历史快照，不要批量修改。

## 2. 不可违反的规则

- 修改前先核对真实代码、真实接口或真机 DOM；不要凭旧文档猜现状。
- 默认“只动渲染，不动数据”；如确需改取数/提交，必须先说明依据、影响和回滚方式。
- 平台返回的价格、状态、错误原文不得擅自覆盖；失败不得伪装成功。
- 未获用户明确批准，不执行指派、改派、报班、改价、发车、取消订单等真实写操作。
- 当前 `FLOW_MAP_ASSIGN_LIVE=true`，手动指派会真写平台；`FLOW_MAP_AUTO_ENABLED=false`，自动派单默认干跑。测试时不得为图方便切换这些开关。
- 登录、滑块验证码、gps51 定位授权由用户完成；不要尝试绕过。
- 不提交 Cookie、token、手机号、订单详情、浏览器配置目录或 `.edge-debug/`。

## 3. 标准开发闭环

1. 记录问题、目标版本、复现步骤和验收口径。
2. 确认改的是上表主源码，运行 `node patched/_targets.js` 再核对一次。
3. 先补能复现问题的行为测试，再做最小根因修复；不只做正则存在性断言。
4. 地图脚本升版时，文件名、`@version`、`var VER` 三处同步，并保留文件头历史，追加本次用户原话、根因、改动和回滚口径。
5. 至少运行语法检查、专项测试、全量回归；测试红条必须分类，不能忽略或改写期望来制造假绿。
6. 真机完成用户登录和授权后，再走浏览器验收；保存截图、Console/接口证据及测试输出。
7. 更新 `README.md` 的当前版本、测试结果和待办，交付时列出文件变更、验证证据、未验项。

## 4. 常用命令

在本目录执行，Node.js 22 可直接运行，无 npm 依赖：

```bash
node patched/_targets.js
node --check outputs/bbx_flow_orderboard_v1.9.29.user.js
node patched/_test_neword.js
node patched/_test_neword29.js
node patched/_run_all_tests.js
```

全量回归当前不是全绿基线。先修迁移/夹具问题，再判断产品回归；不得把“无汇总”当作通过。单项历史专项也可能因后续合法需求变更而失败，必须逐条核对。

## 5. 浏览器/CDP

- 启动：`tools/start-edge-debug.bat`，调试端口 `9222`，使用独立 `.edge-debug` 配置，不接管日常浏览器。
- 用户登录 `man.bbxhc.com`，打开城际调度中心，确认篡改猴中的双脚本已更新并刷新页面。
- 在“订单情况”里单击带 `data-flow2cell` 的方向/时间格打开地图；v1.8.44 起地图是普通浏览器标签页。
- 只读探针：`node tools/cdp-eval.js tools/probe-readonly.js man.bbxhc.com`
- 宿主页截图：`node tools/cdp-shot.js shot-host.png full man.bbxhc.com`
- 真机写操作必须另行得到用户明确确认，不能用“跑测试”代替确认。

详细人工操作、地图验收和排障见 `README.md`。

## 6. 本地迁移基线待办（远端导入后重新判定）

先接收远端全部 9 个脚本、审查并建立 Git 源码基线；以下事项是旧代码发现，不代表远端最新版仍有同样问题。

1. **先确认并修复 v1.9.24 终态闸回退**：本地 v1.9.29 缺 `FLOW_MAP_ASG_DROP_DONE`；`FLOW_MAP_ASG_ST_DONE` 存在但只用于补行的非本日终态过滤，会把今天的已下车/已完成客单继续并入当前行程。恢复的 v1.9.24 产物专项 72/72 通过，详见 `TEST_BASELINE.md`。修复前不得宣称 1.9.24 已包含在 1.9.29。
2. 恢复全量测试：先修迁移路径/夹具、补 GPS 依赖桩，再处理真实产品断言；不得删套件制造假绿。
3. 完成 v1.9.29 新单提醒真机验收：近 5 分钟、跨线路（含日照↔青岛）、远期用车、30 秒刷新、5 分钟顶出、清空后不回填、失败降级。
4. 新需求未被用户明确提出前，不擅自扩展自动派单或改动平台提交口径。
