# 爆款结构迁移引擎 / videogen

这是比赛项目的主目录。当前工程在原有 Remotion 动态海报项目 `videogen` 的基础上，新增了完整的「爆款结构迁移引擎」框架：FastAPI 后端、React 前端工作台、JSON Schema 契约、mock 数据、Remotion 结构预览和团队交接文档。

三位成员可以按上下游接口并行开发：

- 张旭宏：模块 A，样例视频解析与 `Structure DNA`。
- 吴隆正：模块 B/C，素材理解、缺口识别、方案生成、预览/导出。
- 管振凯：模块 D，前端产品、结构可视化、演示链路。

## 当前进度（更新于 2026-05-29）

主链路已从「mock 流水线」升级为**真实可跑、可演示的创作平台**。以下能力均已并入 `main`，并通过 `tsc` / `vite build` / `scripts/validate_contracts.py` / 真实端到端验证。

### 已完成

- **Module A 样例解析（真实）**：ffprobe 元信息、ffmpeg 镜头切分、ASR（SiliconFlow SenseVoice）、LLM 结构角色判断；上传真实视频即可解析为 `StructureDNA`（含 `confidence` / `analysis_reason`）。
- **Module B 素材理解（真实 + 视觉模型）**：`MaterialAnalyzer.analyze_files()` 用 ffprobe 得到真实时长/画幅/质量/裁剪风险，再用 VLM（SiliconFlow `Qwen3-VL`）给镜头类型、语义角色、标签打标；任何失败自动回退规则版。`Material` 新增 `preview_url` / `analysis_source`。
- **Module C 结构迁移**：真实槽位匹配、缺口识别、补全策略；多版本（`balanced` / `high_click` / `high_conversion`）在打分上**真正差异化**（高点击重节奏、高转化重证明/CTA/素材），不再只是改时长。
- **Module D 前端**：Apple 风格重设计；用户素材上传 + 真实预览缩略图 + 来源徽章；结果时间线预览播放器；**版本对比页**；**一键导出真实 9:16 mp4**。
- **真实 mp4 导出**：`MediaRenderer` 用 ffmpeg 把 Edit Plan 合成 1080×1920 H.264 成片（匹配片段裁剪、图片定格、缺口占位卡 + 静音轨拼接）。

### 新增接口

- `POST /api/materials/upload` — 上传用户素材文件 → 真实 `MaterialLibrary`
- `POST /api/pipeline/upload-all` — 样例视频 + 用户素材一把跑完 A→B→C
- `POST /api/pipeline/compare` — 返回三个 variant 的方案用于并排对比
- `POST /api/render/preview` — 从 `PipelineResult` 合成 `preview.mp4`

### 运行前提（重要）

- **Python 3.10+**：Module A 用了 3.10 语法（`int | None` 等），`backend/.venv` 必须用 3.10+ 重建，否则后端无法 import。
- **ffmpeg / ffprobe**：`brew install ffmpeg`（真实解析、抽帧、合成都依赖）。
- **`.env`**：`ASR_PROVIDER` / `LLM_PROVIDER` / `MATERIAL_VLM_*`，密钥只进 `.env`（见 `.env.example`）。当前默认 SiliconFlow 一把 key 同时驱动 ASR + LLM + VLM。
- 前端 `frontend/.env` 设 `VITE_API_BASE_URL=http://127.0.0.1:8000`。

### 仍待办 / 可选

- 接 **DashScope**（`fun-asr`，有句级时间戳）让 Module A 的 LLM 结构判断真正生效；当前 SiliconFlow ASR 无时间戳，结构判断退化为按时长兜底。
- mp4 **烧录中文字幕**（本地可用 PingFang 字体）。
- 真实文件对象存储 / 异步 job / 正式部署（按既定策略暂不做）。

## 比赛阶段 TODO

服务器部署先不作为当前比赛交付项。当前阶段的目标是把本地 demo 链路跑稳，并把未来上线需要的 Docker、环境变量和部署文档保留下来。

当前策略：

- 本地 FastAPI 跑 mock/半真实 pipeline；需要公网演示时，用 Cloudflare Tunnel 或 cpolar 临时暴露 `8000`。
- 不购买云服务器，不处理 Render 绑卡，不做 ICP 备案，不把域名和 HTTPS 作为比赛前置条件。
- 已保留 `backend/Dockerfile`、`.dockerignore`、`docs/deployment.md`，后续可以迁移到 Render、ECS、K8s 或校内服务器。
- 正式上线再补：文件对象存储、异步任务队列、生产 CORS 域名、ASR/LLM provider key、域名/HTTPS、日志和监控。

### 吴隆正 / wulongzheng 待办

> 状态：下表 P0 全部完成，P1 大部分完成（provider 配置抽象、对比报告/剪辑指导已落地）；最新进度见上方「当前进度」。剩 P2（异步 job、正式部署）按既定策略暂缓。

| 优先级 | 工作项 | 输入 | 输出 | 验收标准 |
| --- | --- | --- | --- | --- |
| P0 | 跑稳当前 demo 闭环 | `mocks/*.sample.json`、`config/defaults.json` | `outputs/case_001/*.json`、`editing_guide.md` | `python3 scripts/validate_contracts.py` 和 `python3 scripts/run_demo_pipeline.py` 通过 |
| P0 | Module B 素材理解规则落地 | 用户素材路径/URL、`TargetBrief` | `MaterialLibrary` | 每个素材有 `semantic_role`、`tags`、`usable_ranges`、`quality_score`、`crop_risk` |
| P0 | Module C 槽位匹配引擎 | `StructureDNA`、`MaterialLibrary`、`config/defaults.json` 权重 | `EditPlan.timeline[]` | 每个结构段都有匹配结果，`slot_status` 只能来自 schema 枚举 |
| P0 | 缺口识别与补全策略 | `weak_match` / `missing` 槽位 | `missing_slots[]`、`completion_strategy`、`supplement_instruction` | 能解释为什么缺、怎么补、补完对结构有什么影响 |
| P1 | 对比报告和剪辑指导完善 | `EditPlan` | `comparison_report.json`、`editing_guide.md` | 前端能直接展示，评委能看懂每段为什么这么剪 |
| P1 | provider 配置抽象 | `.env`、`config/defaults.json` | mock/真实 ASR、LLM 可切换的服务接口 | key 不进代码，业务层不直接读环境变量 |
| P1 | 本地公网演示方案 | 本地 `8000` 服务、Cloudflare Tunnel/cpolar | 临时公网 API URL | 本地前端设置 `VITE_API_BASE_URL` 后能打到公网 URL |
| P2 | 真实上传和 job API | 视频/图片/文案文件 | `job_id`、任务状态、产物路径 | 后续线上部署时可异步处理，不阻塞 HTTP 请求 |
| P2 | 正式服务器部署 | Docker image、环境变量、provider key | 公网 `/health`、线上 API base URL | 前端可从本地或线上访问正式后端 |

边界说明：Module A 的真实 ASR、镜头切分和 `StructureDNA` 生成主要由张旭宏负责；吴隆正这里优先保证能稳定消费 `StructureDNA`，并把素材理解、槽位匹配、缺口补全和方案输出做扎实。

## 一句话流程

```text
爆款样例视频
  -> Module A 结构拆解
  -> Structure DNA

用户素材 + 商品/主题信息
  -> Module B 素材理解
  -> Material Library

Structure DNA + Material Library + 目标变体
  -> Module C 结构迁移与方案生成
  -> Edit Plan + 缺口识别 + 补全策略 + 对比报告

Edit Plan + Report
  -> Module D 前端展示 / Remotion 预览 / 剪映草稿导出
```

## 赛题评分对照与分工

赛题原文见本地 `docs/origindescription.md`。该文件包含临时模型密钥信息，只作为本地参考，不提交到仓库。当前 README 与赛题方向一致，不另开 README v2；下面直接把赛题分值映射到现有 A/B/C/D 模块。

### 评分项一览

| 赛题评分项 | 分值 | 对应项目模块 | 当前落点 |
|---|---:|---|---|
| 1. 样例输入与基础解析 | 5 | Module A | `AnalyzeSampleRequest`、`StructureAnalyzer`、`StructureDNA.basic_info`、前端样例列 |
| 2. 结构拆解能力 | 10 | Module A | `segments[].function`、`time_range`、`text_pattern`、`packaging`、`global_features` |
| 3. 结构迁移生成能力 | 10 | Module C | `PlanGenerator`、`EditPlan.timeline`、脚本 / 时间线 / 包装建议 / 成片 demo |
| 4. 素材缺口识别 | 8 | Module C | `slot_status`、`gap_reason`、`missing_slots[]`、`comparison_report` |
| 5. 素材缺口补全 | 12 | Module C | `completion_strategy`，支持 `reorder` / `copy` / `packaging` / `aigc` / `reuse` |
| 6. 迁移过程可视化 | 10 | Module D | 前端三列会话：模板视频、AI 自动捕获、结果视频；展示映射和补全过程 |
| 7. 最终效果展示 | 10 | Module D / Remotion | `poster-demo-v5.mp4`、`StructurePreview`、前后对比和结果页 |
| 8. 画面包装能力 | 8 | Module A/C/D | 字幕密度、标题条、转场、强调元素、卖点卡片、包装建议展示 |
| 9. 多版本生成 | 4 | Module C | `variant`：`balanced` / `high_click` / `high_conversion` / `fast_pacing` / `premium` |
| 10. 真实素材适配 | 8 | Module B | `MaterialLibrary`、素材标签、可用片段、质量分、裁剪风险 |
| 11. 人工可调能力 | 8 | Module C/D | 后续通过目标变体、hook、卖点顺序、包装风格、节奏参数重生成 |
| 12. 创意与产品完成度 | 7 | 全链路 / Module D | 一站式产品形态、TDesign 工作台、过程解释、会话式案例展示 |
| 合计 | 100 |  |  |

加分项最高 10 分，重点对应：自然语言改片、真实素材 + AIGC 补全融合、结构迁移可解释性、封面 / 字幕 / 转场等完整包装链路、工程与交互完成度。

### 任务拆解对应关系

| 赛题任务 | 主要评分归属 | 当前设计对应 |
|---|---|---|
| 任务1：样例视频输入与解析 | 评分项 1，5 分 | Module A 解析样例；Module D 展示 sample 视频、时长、镜头数、封面/基础信息 |
| 任务2：结构拆解 | 评分项 2，10 分 | 至少覆盖脚本/段落结构、节奏结构、包装结构三类 |
| 任务3：新内容与素材输入 | 支撑评分项 3 和 10 | Module B 消费用户素材和商品/主题信息，判断素材是否支撑目标结构 |
| 任务4：结构迁移与结果生成 | 评分项 3，10 分 | Module C 输出脚本、时间线草案、包装建议和成片 demo |
| 任务5：素材缺口识别 | 评分项 4，8 分 | Module C 输出槽位缺口、影响和解释 |
| 任务6：素材缺口补全 | 评分项 5，12 分 | Module C 输出补全策略，当前 demo 展示包装 / 文案 / AIGC 补全思路 |
| 任务7：迁移过程可视化 | 评分项 6，10 分 | Module D 展示“抽取了什么、如何映射、哪里缺、如何补” |
| 任务8：结果可验证 | 评分项 7，10 分 | 提供结果视频 demo、时间线可视化和样例/结果对比 |
| 任务9：画面包装生成 | 评分项 8，8 分 | 字幕样式、标题条、卖点卡片、转场、强调元素 |
| 任务10：多版本生成 | 评分项 9，4 分 | `variant` 字段预留高点击 / 高转化 / 高节奏 / 高质感 |
| 任务11：真实素材适配 | 评分项 10，8 分 | Module B 做镜头分类、可用片段、主体/场景标签和素材推荐 |
| 任务12：人工可调 | 评分项 11，8 分 | 后续支持修改 hook、卖点顺序、包装风格、视频节奏、结尾表达 |
| 任务13：自然语言编辑 | 加分项 | 后续作为一句话改片能力，不影响 P0 闭环 |

### 成员分值承担范围

这是按模块主责估算的答辩分工，不是严格切分；部分评分项需要多人共同支撑。

| 成员 | 主责模块 | 直接承担分值 | 说明 |
|---|---|---:|---|
| 张旭宏 | Module A：样例视频解析与 `Structure DNA` | 约 15-20 分 | 主要覆盖样例输入基础解析 5 分、结构拆解 10 分，并支撑包装结构提取 |
| 吴隆正 | Module B/C：素材理解、缺口识别、方案生成、补全策略 | 约 45-50 分 | 主要覆盖结构迁移 10 分、缺口识别 8 分、缺口补全 12 分、真实素材适配 8 分、多版本 4 分及部分人工可调/包装能力 |
| 管振凯 | Module D：前端产品、过程可视化、结果展示 | 约 30-35 分 | 主要覆盖迁移过程可视化 10 分、最终效果展示 10 分、创意与产品完成度 7 分，并支撑包装展示和人工可调入口 |

## 目录结构

```text
videogen/
  backend/       FastAPI 后端骨架，包含 A/B/C mock 服务和 API
  frontend/      Vite + React 前端骨架，展示三页核心流程
  src/           Remotion compositions，包含原 MarketingRibbonVideo 和新增 StructurePreview
  schemas/       跨模块 JSON Schema
  mocks/         前后端和 Remotion 共用 mock 数据
  config/        统一枚举、打分权重、模型和导出配置
  docs/          架构、交接协议、安全边界
  scripts/       本地校验和 demo 管线脚本
  outputs/       运行产物目录
  public/        BGM、渲染视频和预览图片输出目录
```

## Pipeline 详细说明

整个系统的核心不是「直接生成视频」，而是把爆款视频拆成可复用的结构，再把这套结构迁移到用户自己的素材上。Pipeline 分成四个模块，每个模块只消费上游定义好的 JSON，并向下游输出稳定契约。

### 0. 配置与契约初始化

启动前先读取统一配置：

- `config/defaults.json`：放枚举、打分权重、默认模型、mock 文件路径和导出文件名。
- `schemas/structure_dna.schema.json`：Module A 输出契约。
- `schemas/material_library.schema.json`：Module B 输出契约。
- `schemas/edit_plan.schema.json`：Module C 输出契约。
- `mocks/*.sample.json`：前后端和 Remotion 并行开发用的稳定样例数据。

框架层只负责加载配置、注册路由和注入服务；业务规则不要写在 API 路由里。后续如果要改 segment 枚举、槽位状态、补全策略或打分权重，优先改 `config/defaults.json` 和 `schemas/`。

### 1. Module A：样例视频解析与 Structure DNA

负责人：张旭宏

输入：

- 爆款样例视频，建议竖屏、15-60 秒、口播带货或知识类。
- 可选 `source_uri`，本地文件或 URL。
- 统一 segment 枚举：`hook`、`pain_point`、`setup`、`solution`、`proof`、`transition`、`cta`。

当前 mock 接口：

```http
POST /api/samples/analyze
```

当前实现位置：

- `backend/app/services/structure_analyzer.py`
- `backend/app/prompts/module_a_structure.md`
- `mocks/structure_dna.sample.json`

真实实现要做的事：

1. 用 FFmpeg 读取视频基础信息：时长、宽高、fps、封面帧。
2. 做镜头切分：可以用 PySceneDetect，也可以先用简单帧差法。
3. 做 ASR：输出句子级时间戳即可，比赛 MVP 不必先追词级。
4. 抽关键帧：按镜头抽 1-2 张，不要固定每秒抽大量帧。
5. 调用多模态模型，把 transcript、关键帧和音频 cue 汇总成结构段落。
6. 校验输出 JSON：时间递增、segment 总时长接近视频总时长、function 来自枚举。

输出：`StructureDNA`

关键字段：

- `structure_formula`：例如 `hook -> pain_point -> solution -> proof -> cta`。
- `segments[].function`：该段承担的叙事功能。
- `segments[].time_range`：源视频中的时间范围。
- `segments[].required_material_tags`：下游匹配素材时需要的标签。
- `segments[].packaging`：字幕密度、标题条、转场、强调元素。
- `global_features`：整体节奏、BGM 风格、情绪曲线。

### 2. Module B：用户素材理解与 Material Library

负责人：吴隆正

输入：

- 用户上传的视频、图片、文案或音频。
- 商品/主题信息，例如标题、品类、卖点。
- Module A 输出的结构要求可作为参考，但 B 模块不要直接决定最终剪辑方案。

当前 mock 接口：

```http
POST /api/materials/analyze
```

当前实现位置：

- `backend/app/services/material_analyzer.py`
- `backend/app/prompts/module_b_materials.md`
- `mocks/material_library.sample.json`

真实实现要做的事：

1. 按素材类型分流：视频抽关键帧和 ASR，图片做视觉标签，文案直接进入候选文案池。
2. 给每个素材打标签：`shot_type`、`semantic_role`、`tags`、`key_visuals`。
3. 评估可用范围：视频素材输出 `usable_ranges`。
4. 评估质量：清晰度、主体可见性、音频可用性、横竖屏裁剪风险。
5. 输出稳定的素材库 JSON，供 Module C 做槽位匹配。

输出：`MaterialLibrary`

关键字段：

- `materials[].material_id`：下游引用素材的唯一 ID。
- `materials[].semantic_role`：素材可能适合的叙事角色。
- `materials[].tags`：规则召回用的标签。
- `materials[].usable_ranges`：视频素材可裁剪区间。
- `materials[].quality_score`：素材质量分。
- `materials[].crop_risk`：横屏、主体偏移等裁剪风险。

### 3. Module C：结构迁移、槽位匹配、缺口补全

负责人：吴隆正

输入：

- `StructureDNA`
- `MaterialLibrary`
- 目标标题、目标变体，例如 `balanced`、`high_click`、`high_conversion`。

当前 mock 接口：

```http
POST /api/plans/generate
```

当前实现位置：

- `backend/app/services/plan_generator.py`
- `backend/app/services/report_service.py`
- `backend/app/prompts/module_c_plan.md`
- `mocks/edit_plan.sample.json`
- `mocks/comparison_report.sample.json`

真实实现建议分四步：

1. 规则召回候选素材。

   规则权重放在 `config/defaults.json`，不要写死在服务里：

   ```text
   score =
     shot_type_match * 0.30 +
     semantic_role_match * 0.30 +
     emotion_match * 0.15 +
     duration_match * 0.15 +
     quality_score * 0.10
   ```

2. LLM 排序与解释。

   给每个 segment 提供 top 3 候选素材，让模型选择最终素材、裁剪范围、风险提示和解释。模型只做判断和解释，不直接绕过 schema 乱生成。

3. 缺口识别与补全。

   每个槽位必须输出 `slot_status`：

   - `matched`：素材能直接支撑。
   - `weak_match`：素材可用但情绪、时长或画面弱。
   - `missing`：没有合适素材。
   - `supplemented`：通过文案、包装、AIGC 或复用补足。

   补全策略必须来自配置：

   - `direct_match`
   - `reorder`
   - `copy`
   - `packaging`
   - `aigc`
   - `reuse`

4. 生成最终时间线和报告。

   输出每段的目标时间、素材来源、文案、包装建议、缺口原因、补全策略和解释。

输出：`EditPlan`

关键字段：

- `overall_score`：结构一致性、素材匹配度、节奏匹配度。
- `timeline[]`：新视频逐段剪辑方案。
- `timeline[].slot_status`：槽位匹配状态。
- `timeline[].completion_strategy`：缺口处理方式。
- `missing_slots[]`：集中展示素材缺口、影响和建议修复。
- `exports`：报告、预览视频、剪映草稿等产物路径。

### 4. Module D：前端展示、过程可视化、Remotion 预览

负责人：管振凯

输入：

- `StructureDNA`
- `MaterialLibrary`
- `EditPlan`
- `comparison_report`

当前实现位置：

- `frontend/src/App.tsx`
- `frontend/src/types.ts`
- `frontend/src/mockState.ts`
- `src/StructurePreview.tsx`
- `src/Root.tsx`

前端四个视图：

1. 总览工作台：三列展示模板视频、AI 自动捕获脚本、结果视频，并提供商品 / 主题、核心卖点、素材状态等一站式输入。
2. 样例分析页：展示结构公式、源视频 segment 时间线、情绪曲线、每段文案模式、包装信息。
3. 素材匹配页：展示素材卡片、标签、质量分、裁剪风险，以及当前素材能否覆盖目标结构槽位。
4. 方案输出页：展示新方案时间线、槽位状态、缺口原因、补全策略、逐段剪辑指导、整体评分、多版本策略和人工可调参数。

Remotion compositions：

- `MarketingRibbonVideo`：原有动态海报实验，保留不动。
- `StructurePreview`：新增结构迁移预览，消费 `mocks/edit_plan.sample.json`，用颜色表达 `slot_status`。

### 5. 端到端 Demo Pipeline

当前后端提供一个演示聚合接口：

```http
POST /api/pipeline/demo
```

它会按顺序执行：

```text
AnalyzeSampleRequest
  -> StructureAnalyzer.analyze()
  -> StructureDNA

AnalyzeMaterialsRequest
  -> MaterialAnalyzer.analyze()
  -> MaterialLibrary

GeneratePlanRequest + StructureDNA + MaterialLibrary
  -> PlanGenerator.generate()
  -> EditPlan

EditPlan
  -> ReportService.comparison_report()
  -> comparison_report
```

对应代码：

- `backend/app/application/pipeline.py`
- `backend/app/api/routes.py`

本地产物脚本：

```bash
python3 scripts/run_demo_pipeline.py
```

这个脚本会把 mock 闭环产物写入：

```text
outputs/case_001/
  structure_dna.json
  material_library.json
  edit_plan.json
  comparison_report.json
  editing_guide.md
```

## 快速启动

前置依赖：**Python 3.10+** 和 **ffmpeg**（`brew install ffmpeg`）。复制 `.env.example` 为 `.env` 并填好 provider key。

后端：

```bash
cd /Users/longzheng.wu/Desktop/videogen
python3.10 -m venv backend/.venv          # 必须 3.10+，3.9 会无法 import
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
PYTHONPATH=backend python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

前端（先建 `frontend/.env`，内容 `VITE_API_BASE_URL=http://127.0.0.1:8000`）：

```bash
cd /Users/longzheng.wu/Desktop/videogen
npm --prefix frontend install
npm --prefix frontend run dev             # http://127.0.0.1:5173
```

Remotion Studio：

```bash
cd /Users/longzheng.wu/Desktop/videogen
npm install
npm run dev
```

渲染原动态海报：

```bash
npm run render
```

渲染结构迁移预览：

```bash
npm run render:structure
```

轻量校验：

```bash
cd /Users/longzheng.wu/Desktop/videogen
python3 scripts/validate_contracts.py
python3 scripts/run_demo_pipeline.py
```

## API 调用顺序

```bash
# 1. 健康检查
curl http://127.0.0.1:8000/health

# 2. 样例结构拆解
curl -X POST http://127.0.0.1:8000/api/samples/analyze   -H 'Content-Type: application/json'   -d '{"project_id":"case_001","video_id":"sample_001","use_mock":true}'

# 3. 用户素材理解
curl -X POST http://127.0.0.1:8000/api/materials/analyze   -H 'Content-Type: application/json'   -d '{"project_id":"case_001","target":{"title":"新品空气炸锅带货短视频","category":"product_talk","selling_points":["少油","外酥里嫩"]},"use_mock":true}'

# 4. 方案生成
curl -X POST http://127.0.0.1:8000/api/plans/generate   -H 'Content-Type: application/json'   -d '{"project_id":"case_001","target_title":"新品空气炸锅带货短视频","variant":"balanced","use_mock":true}'

# 5. 一键固定 demo 管线
curl -X POST http://127.0.0.1:8000/api/pipeline/demo   -H 'Content-Type: application/json'

# 6. 半真实素材输入 demo
curl -X POST http://127.0.0.1:8000/api/pipeline/material-demo \
  -H 'Content-Type: application/json' \
  -d '{
    "project_id": "case_real_001",
    "target": {
      "title": "空气炸锅带货短视频",
      "category": "product_talk",
      "selling_points": ["少油", "外酥里嫩"]
    },
    "material_uris": [
      "assets/hook_talking_head_9x16_5s.mp4",
      "assets/product_demo_process_12s.mp4",
      "assets/proof_before_after_food_4x5.jpg",
      "assets/final_cta_link_6s.mov"
    ],
    "variant": "balanced"
  }'

# 7. 查看内置半真实 demo cases
curl http://127.0.0.1:8000/api/pipeline/material-demo/cases

# 8. 运行某个内置 case
curl -X POST http://127.0.0.1:8000/api/pipeline/material-demo/cases/air_fryer_balanced \
  -H 'Content-Type: application/json'

# 9. 真实链路：上传用户素材（多文件）-> 真实 MaterialLibrary
curl -X POST http://127.0.0.1:8000/api/materials/upload \
  -F project_id=case_real -F target_title=空气炸锅带货 -F selling_points=少油,外酥里嫩 \
  -F files=@your_clip.mp4 -F files=@your_image.jpg -F files=@selling_copy.txt

# 10. 真实链路：样例视频 + 用户素材一把跑完 A->B->C
curl -X POST http://127.0.0.1:8000/api/pipeline/upload-all \
  -F project_id=case_real -F video_id=s1 -F variant=balanced \
  -F sample=@sample.mov -F materials=@your_clip.mp4 -F materials=@your_image.jpg

# 11. 三版方案并排对比
curl -X POST http://127.0.0.1:8000/api/pipeline/compare

# 12. 从方案合成真实 9:16 preview.mp4（body 为 PipelineResult）
curl -X POST http://127.0.0.1:8000/api/render/preview \
  -H 'Content-Type: application/json' -d @pipeline_result.json
```

内置 case ID：

- `air_fryer_balanced`：空气炸锅素材较完整。
- `air_fryer_missing_proof`：空气炸锅缺证明素材。
- `beauty_sunscreen_conversion`：防晒霜高转化带货。
- `english_course_knowledge`：英语口语课知识转化。
- `weak_materials_stress_test`：弱素材压力测试。

## 校验与验收

每次改 schema、mock 或跨模块字段后，都要跑：

```bash
python3 scripts/validate_contracts.py
```

它会检查：

- 三个 mock JSON 是否有关键字段。
- `StructureDNA.segments[].time_range` 是否递增。
- `EditPlan.timeline[].target_time_range` 是否递增。
- `EditPlan` 是否覆盖了所有源结构 segment。

前端构建：

```bash
npm --prefix frontend run build
```

Remotion/TypeScript 检查：

```bash
npm run lint
```

## 开发约定

- 不把业务规则写死在路由里。
- 枚举、权重、默认路径优先放到 `config/defaults.json`。
- 跨模块字段优先改 `schemas/`，再同步 Pydantic types 和前端 types。
- mock 数据必须能被前端直接消费，避免前端等待真实模型。
- 模型输出必须先过 schema/Pydantic 校验，再进入下游。
- 密钥只走 `.env` 或部署 Secret，不进入代码和文档。
- 真实导出失败时，保留 `EditPlan`、`editing_guide.md` 和 Remotion 预览作为兜底。

## 后续替换 mock 的顺序

推荐按风险从低到高替换：

1. 先把 Module B 的素材标签从 mock 换成真实文件元数据和简单规则。
2. 再把 Module C 的规则召回和缺口识别做实，不急着接复杂模型。
3. 接入 Module A 的 FFmpeg/ASR/关键帧，先产出稳定结构 JSON。
4. 接入多模态模型做结构修正和解释。
5. 接入 Remotion 从 `outputs/case_001/edit_plan.json` 渲染真实预览视频。
6. 最后尝试剪映草稿 JSON，失败也不影响主链路展示。

## BGM

原项目 bundled demo track 是 Mixkit 的 “Hazy After Hours”。

- Source: https://mixkit.co/free-stock-music/tag/fashion/
- Asset URL: https://assets.mixkit.co/music/132/132.mp3
- License: https://mixkit.co/license/

MIT license applies to source code. Bundled music remains under Mixkit's license.
