# 主功能实现说明

本文档用于统一团队对「爆款结构迁移引擎」主功能的理解。它不是比赛介绍文案，而是面向开发和答辩准备的实现口径：用户看到什么、系统内部怎么流、每个会话怎么区分、当前做到哪里、下一步怎么补。

## 1. 主功能一句话

用户提供一个爆款样例视频，再提供自己的商品 / 主题信息和素材。系统先把样例视频拆成可复用的结构，再理解用户素材是否能支撑这些结构槽位，最后生成一个新的短视频方案、缺口补全策略、过程解释和结果预览。

核心不是简单复刻样例，而是迁移样例的创作方法。

```text
样例视频
  -> 结构拆解
  -> Structure DNA

用户素材 + 商品信息
  -> 素材理解
  -> Material Library

Structure DNA + Material Library + 生成版本
  -> 槽位匹配 / 缺口识别 / 补全策略
  -> Edit Plan + Report + Preview

前端会话工作台
  -> 展示输入、阶段、状态、产物、三列迁移过程
```

## 2. 用户视角主流程

用户进入前端后看到的是一个会话工作台，而不是单次表单。

1. 在左侧选择一个会话。
2. 首屏看到该会话的当前状态、阶段、产物数量和主 pipeline。
3. 三列展示核心过程：
   - 左列：上传的模板视频 / 样例视频
   - 中列：AI 自动捕获出来的结构脚本
   - 右列：根据用户素材、AIGC 补全和迁移策略生成的结果视频 / 结果方案
4. 如果要看细节，可以切换到：
   - 样例分析
   - 素材匹配
   - 方案输出
5. 如果素材不足，系统需要明确展示：
   - 哪些槽位缺素材
   - 为什么当前素材不够
   - 用什么方式补全
   - 补全后对结果有什么影响

## 3. 会话模型

会话是前端组织 demo 和答辩案例的核心单位。后端新增的 material demo cases 可以直接映射成前端会话。

每个会话至少包含：

| 字段 | 含义 | 示例 |
| --- | --- | --- |
| `caseId` | 后端 case id | `air_fryer_missing_proof` |
| `targetTitle` | 目标视频主题 | `空气炸锅缺证明素材` |
| `description` | 会话说明 | `没有 proof/comparison 素材...` |
| `status` | 当前可演示状态 | `ready` / `needs_review` |
| `stage` | 当前 pipeline 阶段 | `sample` / `materials` / `plan` / `preview` |
| `variant` | 生成版本 | `balanced` / `high_click` / `high_conversion` |
| `materialCount` | 输入素材数量 | `3` |
| `gapProfile` | 缺口概况 | `缺证明素材` |
| `sellingPoints` | 商品或主题卖点 | `少油`、`外酥里嫩` |
| `artifacts` | 当前产物列表 | `Structure DNA`、`Edit Plan` |

状态定义：

| 状态 | 前端文案 | 含义 |
| --- | --- | --- |
| `ready` | 可演示 | 会话产物足够完整，可以用于答辩展示 |
| `running` | 生成中 | 后续接异步 job 后使用 |
| `needs_review` | 需复核 | 缺口较多或结果需要人工确认 |

阶段定义：

| 阶段 | 前端文案 | 说明 |
| --- | --- | --- |
| `sample` | 样例解析 | 已进入样例视频结构拆解 |
| `materials` | 素材理解 | 正在判断素材标签、质量、可用片段 |
| `plan` | 方案生成 | 已生成时间线、缺口和补全策略 |
| `preview` | 结果预览 | 已能展示结果视频或预览方案 |

## 4. 当前内置会话

来自 `mocks/material_demo_cases.json` 的 5 个 case 已经适合当作会话展示。

| 会话 | case id | 场景 | 状态 | 阶段 | 价值 |
| --- | --- | --- | --- | --- | --- |
| 会话 01 | `air_fryer_balanced` | 空气炸锅素材较完整 | 可演示 | 结果预览 | 展示正常闭环 |
| 会话 02 | `air_fryer_missing_proof` | 空气炸锅缺证明素材 | 需复核 | 方案生成 | 展示缺口识别和 AIGC 补全 |
| 会话 03 | `beauty_sunscreen_conversion` | 防晒霜转化型带货 | 可演示 | 结果预览 | 展示跨品类和高转化版本 |
| 会话 04 | `english_course_knowledge` | 英语口语课知识转化 | 可演示 | 方案生成 | 展示知识课迁移和高点击版本 |
| 会话 05 | `weak_materials_stress_test` | 弱素材压力测试 | 需复核 | 素材理解 | 展示弱素材、missing、weak_match |

这些会话覆盖了答辩中最需要证明的几类能力：

- 正常素材闭环
- 缺证明素材
- 跨品类迁移
- 多版本生成
- 弱素材压力测试

## 5. Pipeline 实现

### Module A：样例视频结构拆解

输入：

- 样例视频
- `AnalyzeSampleRequest`

输出：

- `StructureDNA`

关键字段：

- `structure_formula`
- `segments[]`
- `segments[].function`
- `segments[].time_range`
- `segments[].transcript`
- `segments[].packaging`
- `global_features`

当前实现：

- 已支持 mock Structure DNA。
- 已支持上传样例视频并用 `ffprobe / ffmpeg` 获取基础信息和封面。
- 真实 ASR、镜头切分、字幕样式提取后续继续加强。

### Module B：用户素材理解

输入：

- `TargetBrief`
- `material_uris[]`

输出：

- `MaterialLibrary`

关键字段：

- `materials[].type`
- `materials[].semantic_role`
- `materials[].tags`
- `materials[].usable_ranges`
- `materials[].quality_score`
- `materials[].crop_risk`

当前实现：

- 已有规则型素材分析。
- 根据文件名、文本内容、后缀和关键词推断素材类型、语义角色、标签、时长、画幅、质量和裁剪风险。

### Module C：结构迁移与方案生成

输入：

- `StructureDNA`
- `MaterialLibrary`
- `variant`

输出：

- `EditPlan`
- `missing_slots[]`
- `comparison_report`

关键逻辑：

1. 遍历 Structure DNA 中的每个结构段。
2. 为每个段落从 Material Library 中选择候选素材。
3. 根据镜头类型、语义角色、情绪、时长、质量分打分。
4. 输出槽位状态：
   - `matched`
   - `weak_match`
   - `missing`
   - `supplemented`
5. 对弱匹配或缺失槽位生成补全策略：
   - `direct_match`
   - `packaging`
   - `copy`
   - `aigc`
   - `reuse`
6. 生成目标时间线、脚本、包装建议和解释。

### Module D：前端会话工作台

输入：

- 会话列表
- `PipelineResult`
- 样例视频和结果视频资源

输出：

- 一屏总览
- 会话状态
- 三列迁移过程
- 样例分析页
- 素材匹配页
- 方案输出页

当前实现：

- 左侧会话队列展示 5 个 case。
- 每个会话展示状态、阶段、缺口概况和产物数量。
- 总览页一屏展示：
  - A/B/C/D pipeline
  - 当前会话
  - 用户输入
  - 生成策略
  - 产物与缺口
  - 三列迁移过程
- 方案输出页展示多版本和人工可调：
  - 平衡版
  - 高点击版
  - 高转化版
  - Hook 改写
  - 包装风格
  - CTA 文案
  - 节奏强度

## 6. 前后端接口关系

当前建议保留三层接口。

### 固定 demo

```http
POST /api/pipeline/demo
```

用于最稳的答辩兜底演示。

### 半真实素材 demo

```http
POST /api/pipeline/material-demo
```

用户传目标信息和素材 URI 列表，后端返回完整 `PipelineResult`。

适合下一步把前端会话真正接到后端规则 pipeline。

### 内置 case

```http
GET /api/pipeline/material-demo/cases
POST /api/pipeline/material-demo/cases/{case_id}
```

用于比赛演示和回归测试。前端当前已经把这些 case 静态映射为会话，下一步可以直接调用这些接口。

## 7. 前端会话切换的目标行为

点击左侧某个会话后，前端应该更新：

1. 页面标题。
2. case id。
3. 当前状态。
4. 当前阶段。
5. 商品卖点。
6. 素材状态。
7. 生成版本。
8. 产物列表。
9. 缺口摘要。
10. 三列中的结果脚本和版本标签。

当前已经完成静态会话切换。

下一步要完成接口级切换：

```text
点击会话
  -> POST /api/pipeline/material-demo/cases/{case_id}
  -> setData(PipelineResult)
  -> 更新 Structure DNA / Material Library / Edit Plan / Report
  -> 更新总览、素材匹配、方案输出
```

## 8. 产物模型

产物不是只有最终视频，至少应拆成四类：

| 产物 | 来源 | 用途 |
| --- | --- | --- |
| `Structure DNA` | Module A | 证明样例被拆成结构 |
| `Material Library` | Module B | 证明用户素材被理解和筛选 |
| `Edit Plan` | Module C | 证明结构迁移、槽位匹配和补全策略 |
| `Preview Video` | Module D / Remotion | 证明结果可展示 |
| `Editing Guide` | Module C | 给评委解释每段为什么这么剪 |
| `CapCut Draft` | 后续导出 | 对接剪映草稿或真实剪辑工具 |

前端会话卡片显示产物数量，总览显示核心产物标签，方案输出页展示更细的导出状态。

## 9. 当前已实现

已实现：

- FastAPI 基础接口。
- 固定 demo pipeline。
- material demo cases。
- 规则型素材理解。
- 规则型槽位匹配和缺口补全。
- 前端一屏总览。
- 前端三列迁移展示。
- 前端会话队列。
- 前端多版本和人工可调入口。
- README 评分映射。

部分实现：

- 上传样例视频后可解析基础媒体信息。
- 会话切换目前优先使用前端静态映射，尚未完全调用 case API 更新 `PipelineResult`。
- 结果视频当前仍使用 demo 视频资源，不是每个 case 独立渲染。

待实现：

- 前端会话点击后调用 `/api/pipeline/material-demo/cases/{case_id}`。
- 用户素材真实上传后进入 `material_uris[]`。
- 每个 case 生成独立预览视频。
- 人工可调参数真正回传 Module C 重新生成方案。
- 自然语言改片。
- 异步 job 和产物管理。

## 10. 下一步开发顺序

推荐按这个顺序做，最容易让答辩效果变硬。

1. 前端会话接后端 case API。
2. 把 `PipelineResult` 和当前会话绑定，切换会话时真正更新素材匹配和方案输出。
3. 把多版本按钮接到 `/api/pipeline/material-demo` 的 `variant`。
4. 把人工可调字段映射为 plan generation 参数。
5. 为每个 case 生成独立 preview video 或 Remotion preview。
6. 增加导出产物管理：报告、剪辑指导、预览视频、草稿路径。

## 11. 答辩讲法

答辩时不要说“我们做了一个视频生成工具”，建议说：

我们做的是一个爆款结构迁移工作台。系统把优质样例拆成 Structure DNA，再理解用户自己的素材，判断哪些结构槽位能直接匹配、哪些弱匹配、哪些缺失。对于缺失部分，系统会给出包装、文案、AIGC 或复用补全策略，最后生成新的 Edit Plan 和结果预览。前端用会话方式展示不同素材条件下的迁移过程和产物状态，评委可以直接看到系统不是只跑一个 mock，而是能处理完整素材、缺证明素材、跨品类和弱素材压力测试。
