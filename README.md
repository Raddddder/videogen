# 爆款结构迁移引擎 / videogen

这是比赛项目的主目录。当前工程在原有 Remotion 动态海报项目 `videogen` 的基础上，新增了完整的「爆款结构迁移引擎」框架：FastAPI 后端、React 前端工作台、JSON Schema 契约、mock 数据、Remotion 结构预览和团队交接文档。

三位成员可以按上下游接口并行开发：

- 张旭宏：模块 A，样例视频解析与 `Structure DNA`。
- 吴隆正：模块 B/C，素材理解、缺口识别、方案生成、预览/导出。
- 管振凯：模块 D，前端产品、结构可视化、演示链路。

## 比赛阶段 TODO

服务器部署先不作为当前比赛交付项。当前阶段的目标是把本地 demo 链路跑稳，并把未来上线需要的 Docker、环境变量和部署文档保留下来。

当前策略：

- 本地 FastAPI 跑 mock/半真实 pipeline；需要公网演示时，用 Cloudflare Tunnel 或 cpolar 临时暴露 `8000`。
- 不购买云服务器，不处理 Render 绑卡，不做 ICP 备案，不把域名和 HTTPS 作为比赛前置条件。
- 已保留 `backend/Dockerfile`、`.dockerignore`、`docs/deployment.md`，后续可以迁移到 Render、ECS、K8s 或校内服务器。
- 正式上线再补：文件对象存储、异步任务队列、生产 CORS 域名、ASR/LLM provider key、域名/HTTPS、日志和监控。

### 吴隆正 / wulongzheng 待办

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

前端三页：

1. 样例分析页：展示结构公式、源视频 segment 时间线、情绪曲线、每段文案模式、包装信息。
2. 素材匹配页：展示素材卡片、标签、质量分、裁剪风险，以及当前素材能否覆盖目标结构槽位。
3. 方案输出页：展示新方案时间线、槽位状态、缺口原因、补全策略、逐段剪辑指导和整体评分。

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

后端：

```bash
cd /Users/longzheng.wu/Desktop/videogen
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
npm run backend:dev
```

前端：

```bash
cd /Users/longzheng.wu/Desktop/videogen
npm --prefix frontend install
npm run frontend:dev
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
