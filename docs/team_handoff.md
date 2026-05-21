# 团队交接协议

## 张旭宏 -> 吴隆正

交付：

- `structure_dna.json`
- 结构拆解 prompt
- 1-2 个稳定 demo 样例

验收：

- JSON 能被 `StructureDNA` 解析。
- `segments[].time_range` 递增。
- `segments[].function` 来自配置枚举。
- 每段都有 `required_material_tags` 和 `packaging`。

## 吴隆正 -> 管振凯

交付：

- `material_library.json`
- `edit_plan.json`
- `comparison_report.json`
- `editing_guide.md`
- 可选 `preview.mp4` / `draft_content.json`

验收：

- 每个 source segment 都有 target segment。
- `slot_status` 能区分匹配、弱匹配、缺失和补全。
- 素材缺口必须有影响说明和建议修复。
- 前端不需要读业务代码，只消费 JSON。

## 管振凯 -> 全员

交付：

- 字段缺口清单
- 页面截图
- 演示脚本

验收：

- 评委能看到：抽取了什么、如何映射、哪里缺素材、如何补全。
- 演示不依赖现场模型实时成功。

## 接口变更规则

- 字段可以新增，但不能直接改名或改类型。
- 枚举变更必须先改 `config/defaults.json` 和 `schemas/`。
- mock 数据必须和 schema 同步。
- 每次变更后运行 `python3 scripts/validate_contracts.py`。
