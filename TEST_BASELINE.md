# 测试基线核查

核查时间：2026-10-26

入口：`node patched/_run_all_tests.js`

2026-10-27 补充：本文件是本地 v1.9.29 的历史结果；远端已观察安装 v1.9.45，但源码待导出，不能将以下问题直接认定为远端现状。Git 首次提交尚未包含完整业务源码与旧专项。

## 结论

最近一次完整运行：

- 66 个套件；
- 已输出汇总的套件累计 **1888 条断言通过 / 0 条明确失败**；
- 但 **19 个套件没有输出结果行**，全量入口因此以退出码 1 结束；
- 因此当前状态应表述为“**1888 条通过，19 套件待恢复/待判定**”，不能表述为“全绿”。

单独复核 `patched/_test_flow_1924.js` 后确认：它检测到的 v1.9.24 终态闸缺失是**真实产品回退**，不是测试过期。

## 一、真实产品问题（P0）

### v1.9.24「已下车/已完成不进本次行程」在当前主源码中丢失

证据：

1. `outputs/bbx_flow_orderboard_v1.9.29.user.js` 文件头版本段为 1.9.29 → 1.9.28 → 1.9.27 → 1.9.26 → 1.9.25 → 1.9.23，**没有 1.9.24**。
2. 复查当前源码：
   - 缺 `FLOW_MAP_ASG_DROP_DONE`；
   - `FLOW_MAP_ASG_ST_DONE` **存在**，用于补行的非本日终态过滤；先前“该常量也缺失”的表述不准确；
   - 主链不排除终态，补行保留今天的终态，因此不能等同于 v1.9.24 的完整终态闸。
3. 全库原本没有 v1.9.24 产物；已从备份恢复：
   `outputs/bbx_flow_orderboard_v1.9.24.user.js`
4. `node patched/_test_flow_1924.js` 对恢复后的 v1.9.24 运行结果：
   **72 通过 / 0 失败**，证明该功能真实存在且行为符合定稿口径。
5. v1.9.29 缺完整终态闸。回退起点应对各版本源码逐一核对，不能将状态表已存在的版本描述为“两常量都缺失”。

用户原始口径：

- 「许家叶车上还有一个已下车的订单是11:40的，已经下车了不在是这个行程了」
- 「流水肯定不能删除，已经下车的订单，重要的是后面不要再出现这种情况，前面出现过好多次了」
- 「已完成一起处理」

风险：

- 当前 v1.9.29 可能再次把今天的已下车/已完成客单并入司机当前行程，导致车辆负载和分段判断错误。
- 这不是金额或流水口径问题；v1.9.24 只摘行程，金额流水必须保持原样。

建议处理：

1. 先对 v1.9.24 与 v1.9.29 做最小代码差异比对；
2. 在远端导入后确认仍需修复时，将主链、补行两处终态闸及缺失开关补入目标源码；复用已有状态表，核对 31/100 等枚举，保留开关回退能力；
3. 升到新版本并重新跑 1924 专项、1925/1929 相关专项和真机验证；
4. 未修复前，不要向用户宣称“1.9.24 已包含在 1.9.29 中”。

## 二、迁移问题（不涉及产品行为）

这些套件在旧工作区可运行，迁移后缺少旧路径、旧备份或夹具：

| 套件 | 当前原因 |
|---|---|
| `patched/_test_freeze_patch.js` | `BASE` 写死 `C:/Users/Administrator/WorkBuddy/bbx-ai-outbound/patched/` |
| `patched/_test_oneshot_clear.js` | 未迁移一次性产物 `outputs/清除本月流水缓存_一次性脚本.user.js` |
| `_test_ai_toggle.js` | 到仓库根找 `bbx_orderCenter_remark.user.js`，实际在 `patched/` |
| `_test_autodepart_157.js` | 写死旧绝对路径，且依赖 `bbx_orderCenter_remark.v1.15.6.bak.user.js` |
| `_test_maskphone.js` | 写死旧绝对路径，另依赖平台 CSV 夹具 |
| `_test_new_customer_gate.js` | 到根目录找主脚本，实际在 `patched/` |
| `_test_price_tip.js` | 写死 `WorkBuddy/bbx-ai-outbound` |
| `_test_red_rows.js` | 到根目录找主脚本和 `_center_trs.json` |
| `_test_remark_tip.js` | 写死 `WorkBuddy/bbx-ai-outbound` |
| `_test_station_match.js` | 到根目录找主脚本和 `_station_cases.json` |
| `_test_waiting_shortnumber.js` | 写死旧绝对路径；且“新版”指向 patched 旧副本，应改测 outputs 当前 base |

处置原则：把路径改为 `__dirname` / `patched` / `outputs` 相对路径，迁移必要夹具；不要把测试删掉来变绿。

## 三、测试夹具落后（产品已合法演进）

这些套件在 v1.9.26 增加 `preGpsSide` / `gpsSideNear` 后没有同步注入依赖：

| 套件 | 缺失符号 / 位置 |
|---|---|
| `patched/_test_flowboard_1643.js` | `PREGPS_ON`，行为夹具崩溃；此前还有两条司机栏旧文案断言失败 |
| `patched/_test_flow_1856.js` | `PREGPS_ON` |
| `patched/_test_flow_1915.js` | `preGpsSide` |
| `patched/_test_flow_1918.js` | `preGpsSide` |
| `patched/_test_flow_1920.js` | `preGpsSide` |
| `patched/_test_flow_1921.js` | `preGpsSide` |
| `patched/_test_flow_1922.js` | `gpsSideNear` |

处置原则：

- 这些套件验证的是 1.9.15～1.9.22 的历史行为，在其测试环境中应注入 `PREGPS_ON=false` 或返回 0 的 `preGpsSide`，使其回到当时口径；
- 或者明确只钉历史版本运行；
- 不能为了通过而改产品源码删除 GPS 优先逻辑。

## 四、运行纪律

1. 测试运行期间不要修改被测脚本，尤其不要改 `@version`/`VER`；否则同一轮会出现版本断言自相矛盾。
2. `_targets.js` 已改为只从本仓库 `outputs/`、`patched/` 选目标，不再读取桌面副本。
3. 全量入口把“无结果行”计为问题，这是正确行为；不要只看“0 失败”。
4. 恢复测试后重新记录基数，并把本文件更新为最终数字。
