# Git 版本控制与多端协作

更新：2026-10-27

## 当前状态

- 已初始化本地 main 仓库；用户已指定统一远程仓库 https://github.com/fuxianqiang01/bbx.git，配置为 origin。
- 首次连接时只读核对远程为空。main 推送后，其他设备可 clone；同步通过 Git pull/push 完成，不会自动更新篡改猴安装副本。
- 首次提交用于记录协作规则、浏览器工具、测试基础设施和安装版本登记，**不是远端最新版源码发布**。
- 全部 9 个远端脚本待用户导出，见 config/scripts.json。source/version/sha256 为空表示未接收审核，不能作为可发布版本。
- 当前 outputs/、patched/ 内有历史快照、客户取证及含真实样例的代码，保留在原处但默认不提交。根目录旧专项同样待审。这意味着其他设备暂时不能从首个提交还原完整运行环境。
- 新增或导入的工具、脚本、测试和脱敏夹具必须进入 Git；不能继续把浏览器编辑器或机器上的散落副本当成唯一源码。

## 目录职责

| 路径 | 用途 |
|---|---|
| scripts/（导入时建立） | 审核后的唯一脚本源码，使用固定模块文件名 |
| tools/ | 维护、检查和浏览器工具；已纳入 Git |
| config/scripts.json | 脚本身份、已观察安装版本、已接收源码版本、SHA-256及导入状态 |
| patched/ 指定四个公共辅助文件 | 旧测试入口的基础设施；不表示旧专项已经恢复 |
| outputs/、patched/ 其余内容 | 本机迁移材料，等待审核，不再追加新开发副本 |
| imports/ | 原始篡改猴导出暂存；不提交原始包和运行存储 |
| .local/、private/、.edge-debug/、artifacts/ | 本机配置、运行数据和证据，不进入 Git |
| .local-tools/ | 本机工具二进制，不进入 Git |

## 远端导入与建立源码基线

1. 导出截图中的全部 9 份 .user.js；同版本也要比较内容。原始导出放 imports/。
2. 核对名称、命名空间、版本和头部更新记录；逐份对照本地候选文件。早班远端 1.21.3、本地 1.21.5 不得按大小直接覆盖。
3. 审查凭据、真实手机号、订单标识、地址和历史注释中的业务数据。检测工具只作辅助，仍须人工审查；不得通过简单关闭检测来提交。
4. 将审核后的源码放 scripts/ 固定文件名，保留原 @namespace。如需外置硬编码配置，必须单独说明行为影响并验证。
5. 同步源码登记 source/version/sha256 和来源说明；未安装、未真机验证的内容明确标记。
6. 调整测试目标到已登记主源码，迁移脱敏夹具；历史快照专项与当前回归分开统计。
7. 语法、专项、全量结果分别记录。全量现有红条不能忽略，外部授权与真实写操作仍按 AGENTS.md 执行。
8. 每个模块独立提交，最后提交整体基线登记。业务验收前不打“已发布”标签，不自动刷新或覆盖远端业务浏览器。

## 每次开发

有远程仓库后：

~~~bash
git status --short
git fetch origin
git switch main
git pull --ff-only
git switch -c fix/issue-name
~~~

先处理工作区未提交改动。不要在未查看改动时自动 stash、覆盖文件或 reset。分支名按实际任务命名。

改动与验证完成后，只添加本次相关文件：

~~~bash
git diff
git add <本次改动的文件>
node tools/check-staged.cjs
git diff --cached --stat
git diff --cached
git commit -m "说明具体行为变化和原因"
~~~

提交前检查身份：git config user.name 和 git config user.email。首次基础设施提交由 Codex 自动化身份记录，后续每台设备配置实际开发者身份，不修改全局身份冒充用户。

每次提交记录问题、模块版本和验证结果；一个提交解决一个明确问题。正常回滚用 git revert <commit>，不删除公共历史。

## 发布与安装

- 开发以 Git 提交为准；篡改猴是运行副本。
- 一个模块只有一份登记主源码，历史通过 Git 查看；现有历史快照在迁移审核前仍保留。
- 脚本行为变化要同步 @version 与代码内部版本；固定文件名不再携带版本。迁移前旧地图文件命名规则仍按 AGENTS.md 执行。
- 通过验证后才创建模块标签，例如 flow-map/v1.9.45；标签不可复用或移动。
- 安装记录应包含模块、脚本版本、commit、源码 SHA-256、设备标识、安装时间和验收状态，不包含手机号、订单明细或凭据。
- 如现场紧急修改浏览器脚本，应立即导出并单独提交，经差异审查后回归主线，不能在另一个设备直接覆盖。
- 真机指派、报班、发车、改价、取消订单等仍须用户明确授权；Git 提交不授予业务操作权限。

## 建立远程仓库后

统一仓库地址为 https://github.com/fuxianqiang01/bbx.git；origin 已配置。更换地址前必须由用户指定，不得覆盖不相关仓库。

空仓库首次连接：

~~~bash
git remote add origin https://github.com/fuxianqiang01/bbx.git
git push -u origin main
~~~

其他设备使用 git clone https://github.com/fuxianqiang01/bbx.git，以后开发前 fetch/pull，完成后提交并推送。同一任务避免在多台设备同时修改同一分支。远程已有提交时先核对历史，不 force push。

## 当前环境工具

当前环境自带 PowerShell/Git 启动失败。已从 Git for Windows 官方 Release 下载便携 MinGit，仅放在 .local-tools/git/，已校验官方公布的 SHA-256；该二进制不提交。

本机可执行路径：.local-tools/git/cmd/git.exe。其他设备使用正常安装的 Git，无需复制这个目录。完整操作输出如可能含隐私，放 artifacts/ 而不提交。

便携 Git 来源：https://github.com/git-for-windows/git/releases/tag/v2.56.0.windows.4

归档 SHA-256：`e3bf78351fe777fba47ddee5950082f8a98bb0f02604fdc7ba3ee2cb68ffa877`。本次验证：8 个浏览器工具及检查工具语法编译通过，提交检查工具 6 组行为测试通过，9 个模块登记与忽略规则通过；未重跑业务全量回归。
