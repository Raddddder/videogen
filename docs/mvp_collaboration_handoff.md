# MVP Collaboration Handoff

本文档面向后续协作开发者和 Codex，用来快速理解当前项目进度、模块边界、最小 MVP 缺口和排错方式。

## Overall MVP Goal

目标是跑通一条真实视频结构迁移链路：

```text
样例视频上传
-> Module A 解析样例结构 StructureDNA
-> Module B 理解用户素材 MaterialLibrary
-> Module C 生成迁移剪辑方案 EditPlan
-> Module D 前端展示分析过程、素材匹配和结果预览
```

当前最小 MVP 的重点不是最终自动渲染大片，而是稳定证明：

```text
真实视频可以上传
系统可以抽取样例结构
下游可以消费稳定 JSON
前端可以展示结构、素材缺口和方案
失败时能看到 debug_trace
```

## Current End-to-End Status

已完成：

- 前端可以上传真实样例视频。
- 后端可以保存上传文件并读取时长、分辨率、fps、音轨信息。
- FFmpeg/ffprobe 已接入，Dockerfile 已安装 ffmpeg。
- ASR 已切到 DashScope realtime，本地抽出 16k PCM wav 后通过 WebSocket 识别，不依赖公网文件 URL。
- 结构角色判断已接入 OpenAI-compatible LLM 调用，当前本地配置使用官方 Ark EP。
- `StructureDNA` 已增加 `confidence`、`analysis_reason`、`source_sentence_ids` 和顶层 `debug_trace`。
- ASR 和 LLM 都按 MVP 约定设计为 3 次重试，失败后保留低置信兜底输出。
- 镜头检测、封面抽帧属于非关键媒体步骤：失败会写入 `debug_trace`，主链路继续返回结构结果。
- ASR 返回空句子或无有效时间戳时，会退回时长/镜头兜底，不让 `segments` 为空。
- 前端已展示结构段、置信度和分析依据；暂不展示 `debug_trace`。

当前本地推荐配置：

```env
ASR_PROVIDER=dashscope_realtime
ASR_MODEL=fun-asr-realtime
LLM_PROVIDER=ark
LLM_MODEL=ep-20260508213828-7ntjl
LLM_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
```

真实密钥只放本地 `.env` 或部署 secret，不写入仓库。

## Stable JSON Contract

Module A 输出 `StructureDNA`，下游应以该 JSON 为准。

核心字段：

```json
{
  "video_id": "sample_uploaded",
  "source_type": "uploaded_video",
  "total_duration_sec": 30.0,
  "category": "product_talk",
  "structure_formula": "hook -> pain_point -> solution -> proof -> cta",
  "basic_info": {
    "width": 720,
    "height": 1280,
    "fps": 30.0,
    "shot_count": 5,
    "has_speech": true,
    "cover_frame_path": "outputs/case_001/sample_uploaded/cover.jpg"
  },
  "segments": [
    {
      "segment_id": "seg_001",
      "function": "hook",
      "time_range": [0.0, 3.2],
      "duration_sec": 3.2,
      "transcript": "终于知道这个锅刷为什么这么火了。",
      "confidence": 0.9,
      "analysis_reason": "开头提出疑问，吸引观众注意。",
      "source_sentence_ids": ["s1"]
    }
  ],
  "debug_trace": []
}
```

`cover_frame_path` 允许为 `null`。这表示结构分析已经完成，但封面帧抽取失败或被跳过；下游不应该因为封面为空而判定整条样例分析失败。

结构标签固定 7 类：

```text
hook
pain_point
setup
solution
proof
transition
cta
```

输出段数为 3 到 7 段，不强制 7 类全部出现。

## Debug Trace

`debug_trace` 位于 `StructureDNA` 顶层，用于工程排错，不在前端主界面展示。

事件格式：

```json
{
  "stage": "llm_role_classification",
  "status": "success",
  "attempt": 1,
  "provider": "ark",
  "model": "ep-20260508213828-7ntjl",
  "message": "结构模型输出 5 个段落",
  "latency_ms": 1300
}
```

常见 stage：

- `media_inspect`：ffprobe 读取视频元信息。
- `scene_detection`：ffmpeg 镜头切分。
- `asr`：ASR 调用与重试。
- `asr_fallback`：ASR 三次失败后的兜底。
- `llm_role_classification`：LLM 结构判断与重试。
- `role_fallback`：LLM 三次失败或未配置后的规则兜底。
- `cover_extraction`：封面帧抽取。

常见 status：

- `success`：该阶段完成。
- `retry`：该阶段失败但还会重试，主要用于 ASR/LLM。
- `fallback` 或 `used`：该阶段失败后已经走兜底逻辑，主链路仍会返回。
- `skipped`：该阶段因条件不满足跳过，例如视频无音轨。

## Module A: Sample Structure Analysis

当前位置：

- 入口：`backend/app/services/structure_analyzer.py`
- ASR：`backend/app/services/asr_service.py`
- 结构角色分类：`backend/app/services/structure_role_classifier.py`
- API：`POST /api/pipeline/upload-sample`

已完成：

- 上传样例视频后自动跑完整 pipeline。
- 使用 ffprobe 读媒体元信息。
- 使用 ffmpeg 抽封面、抽音频、检测镜头切点。
- DashScope realtime ASR 支持本地音频输入。
- Ark/Doubao LLM 将 ASR 句子列表转换为结构段 JSON。
- ASR/LLM 失败后保留低置信兜底。
- 镜头检测失败会记录 `scene_detection fallback`，后续按 ASR/时长兜底继续。
- 封面抽帧失败会记录 `cover_extraction fallback`，`cover_frame_path=null`，不打断结构分析。
- LLM 未覆盖的 ASR 句子会按真实句子位置补齐角色，不按已有段落数量误判位置。
- 输出字段包含置信度、判断依据和句子来源。

离最小 MVP 还差：

- 补充 3 到 5 个真实带货样例的回归输出 JSON。
- 调优 LLM prompt，让 `setup`、`transition` 不被滥用。
- 对 ASR 噪声、BGM、人声弱的视频建立明确测试样例。
- 记录 LLM 三次重试后兜底的真实前端表现。

建议下一步：

- 增加一个轻量脚本，批量跑 `outputs/test-videos/*.mp4` 并保存 `StructureDNA` 输出。
- 建立人工标注对比表：模型 role、人工 role、是否接受。

## Module B: Material Understanding

当前位置：

- 入口：`backend/app/services/material_analyzer.py`
- 输出：`MaterialLibrary`

已完成：

- 支持 mock/规则素材库。
- 能根据素材 URI 生成基础 `Material` 条目。
- 已有素材类型、语义角色、标签、质量分和裁剪风险字段。

离最小 MVP 还差：

- 真实素材上传入口还不完整。
- 视频素材没有真正做 ASR/视觉理解。
- 图片素材没有真实多模态识别。
- `semantic_role` 现在更多是规则/文件名推断，尚未和 Module A 的结构段稳定匹配。

建议下一步：

- 先支持用户上传 3 到 5 个素材文件并生成 MaterialLibrary。
- 对视频素材复用 Module A 的 ASR/ffprobe 基础能力。
- 对图片/视频关键帧先做低成本标签，不急着上复杂多模态。

## Module C: Edit Plan Generation

当前位置：

- 入口：`backend/app/services/plan_generator.py`
- 输出：`EditPlan` 和 `comparison_report`

已完成：

- 可以消费 `StructureDNA` 和 `MaterialLibrary`。
- 已有按结构槽位匹配素材的规则。
- 已输出 timeline、missing_slots、exports 等字段。

离最小 MVP 还差：

- 当前匹配策略仍偏规则，没有充分使用 `confidence` 和 `analysis_reason`。
- 缺少对 `setup`、`transition` 的专门处理策略。
- 缺少真实素材不足时的清晰补拍/补素材建议。
- exports 里实际渲染产物还未真正生成。

建议下一步：

- timeline 生成时优先信任 Module A 的 `function` 和 `time_range`。
- 对低置信结构段降低匹配权重，或者在 explanation 中提示。
- 把 `missing_slots` 做成前端可直接展示的补素材列表。

## Module D: Frontend Display

当前位置：

- 入口：`frontend/src/App.tsx`
- API：`frontend/src/api.ts`

已完成：

- 上传样例视频入口可用。
- 总览、样例分析、素材匹配、方案输出四个视图已存在。
- 样例结构段展示时间范围、角色、原文、置信度和判断依据。
- 前端可消费真实 `PipelineResult`。

离最小 MVP 还差：

- 真实素材上传/素材库视图还未完整产品化。
- debug_trace 暂不展示，后续如需排错页面可新增折叠区。
- 结果视频预览仍偏 demo/mock，不是实际渲染成片。
- 低置信兜底可再增加明显视觉标识。

建议下一步：

- 先保持页面简单，不急着加 debug tab。
- 在样例分析页保留 confidence 和 analysis_reason，这是当前最有价值的可解释展示。
- 等 Module C exports 稳定后，再补真实渲染预览。

## Backend API And Deployment

已完成：

- FastAPI 基础服务可运行。
- `/api/pipeline/upload-sample` 支持真实样例视频上传并返回完整 `PipelineResult`。
- `/outputs` 已挂载静态目录。
- Dockerfile 已安装 ffmpeg。
- `.env.example` 已列出 ASR/LLM/FFmpeg 配置。

离最小 MVP 还差：

- 部署 secret 需要在 Render/服务器上配置，不要提交到 git。
- 上传文件大小、错误信息、超时策略还需要在部署环境复测。
- 如果部署环境 ASR/LLM 访问失败，需要通过 `debug_trace` 判断是哪一段失败。

建议下一步：

- 部署前先跑 `/health`，确认 `model_provider`、`model_name`、`asr_provider`、`asr_model` 正确。
- 用同一个 30 秒视频分别在本地和线上跑一次，比较 `StructureDNA` 输出。

## Recommended MVP Order

1. Module A 固定输出契约并收集真实样例输出。
2. Module B 接真实素材上传，生成可用 MaterialLibrary。
3. Module C 使用真实 StructureDNA + MaterialLibrary 生成 EditPlan。
4. Module D 展示真实素材匹配和缺口。
5. 最后再做真实视频渲染/导出。

## Current Known Limits

- MVP 暂不做样例视频的深度多模态理解。
- `visual_cue` 和 `shot_type` 目前主要来自规则、时长、方向和镜头切分。
- 对纯音乐、无口播、多人混说的视频，结构判断会低置信兜底。
- LLM 输出虽然要求 JSON，但仍需保留重试和规则兜底。
