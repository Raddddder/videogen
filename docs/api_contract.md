# API 契约

## Health

`GET /health`

返回运行状态、环境和当前模型配置。

## Module A

`POST /api/samples/analyze`

请求：

```json
{
  "project_id": "case_001",
  "video_id": "sample_001",
  "source_uri": "uploads/sample.mp4",
  "use_mock": true
}
```

响应：`StructureDNA`

真实上传路径会先用 FFmpeg 抽音频，再根据 `ASR_PROVIDER` 决定是否调用 ASR。当前支持：

- `ASR_PROVIDER=mock`：不调用外部模型，只保留待 ASR 占位。
- `ASR_PROVIDER=siliconflow`：调用 SiliconFlow `POST /v1/audio/transcriptions`，默认模型 `FunAudioLLM/SenseVoiceSmall`。
- `ASR_PROVIDER=dashscope`：调用阿里百炼 DashScope `fun-asr`，解析返回的句子/词级时间戳，并优先用 ASR 时间戳生成 `StructureDNA.segments[].time_range`。
- `ASR_PROVIDER=dashscope_realtime`：调用阿里百炼 DashScope 实时 ASR SDK / WebSocket，默认模型 `fun-asr-realtime`。该路径由后端先抽出本地 16k PCM wav 音频，再直接流式识别，不依赖公网文件 URL。

DashScope `fun-asr` 的异步接口需要 `file_urls`，因此本地开发不能只给它 `127.0.0.1` 文件地址。部署后需要配置 `ASR_PUBLIC_BASE_URL`，让后端 `/outputs/...` 文件能被 DashScope 公网访问；或者先把抽取出的音频上传到 OSS，再把 OSS URL 传给 ASR。项目默认把上传样例视频限制为 50MB，避免前端传入模型无法处理的大文件。

结构角色判断由 `LLM_PROVIDER` 控制。推荐比赛演示使用官方 Ark EP：`LLM_PROVIDER=ark` + `LLM_MODEL=ep-20260508213828-7ntjl`，让模型把 ASR 句子列表输出成规范 JSON，再由后端合并为 `StructureDNA.segments`。每段会额外带上：

- `confidence`：结构角色置信度，0 到 1。
- `analysis_reason`：模型或规则判断依据。
- `source_sentence_ids`：该结构段对应的 ASR 句子 ID。

顶层 `debug_trace` 会记录媒体解析、ASR、LLM 分类、兜底等阶段的状态、重试次数和耗时，供协作开发和排错使用。

`basic_info.cover_frame_path` 允许为 `null`。封面抽帧失败时不会中断结构分析，后端会在 `debug_trace` 里记录 `cover_extraction fallback` 并继续返回 `StructureDNA`。镜头检测失败同理，会记录 `scene_detection fallback` 并退回 ASR/时长兜底。

## Module B

`POST /api/materials/analyze`

请求：

```json
{
  "project_id": "case_001",
  "target": {
    "title": "新品空气炸锅带货短视频",
    "category": "product_talk",
    "selling_points": ["少油", "外酥里嫩"]
  },
  "material_uris": ["uploads/a.mp4"],
  "use_mock": true
}
```

响应：`MaterialLibrary`

## Module C

`POST /api/plans/generate`

请求：

```json
{
  "project_id": "case_001",
  "target_title": "新品空气炸锅带货短视频",
  "variant": "balanced",
  "use_mock": true
}
```

响应：`EditPlan`

## Demo Pipeline

`POST /api/pipeline/demo`

固定演示链路：mock `StructureDNA` + mock `MaterialLibrary` + 规则生成 `EditPlan`。默认目标为「新品空气炸锅带货短视频」，卖点为「少油 / 外酥里嫩 / 一键预热 / 易清洗」。

响应：

```json
{
  "structure_dna": {},
  "material_library": {},
  "edit_plan": {},
  "comparison_report": {}
}
```

## Uploaded Sample Pipeline

`POST /api/pipeline/upload-sample`

表单上传真实样例视频，并立刻跑完整同步链路：真实 `StructureDNA` + 当前素材库规则 + 新 `EditPlan` + `comparison_report`。当前如果没有传 `material_uris`，后端会继续使用 mock 素材库，只保证样例视频解析和下游方案同步刷新。

Form Data：

```text
file=<video file>
project_id=case_001
video_id=sample_uploaded
target_title=新品空气炸锅带货短视频
target_category=product_talk
selling_points=少油,外酥里嫩
material_uris=assets/a.mp4,assets/b.jpg
variant=balanced
```

响应：`PipelineResult`

## Material Demo Pipeline

`POST /api/pipeline/material-demo`

半真实比赛演示链路：用户传目标信息和素材 URI 列表，系统使用 mock `StructureDNA`，再通过真实规则生成 `MaterialLibrary`、`EditPlan` 和 `comparison_report`。

请求：

```json
{
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
}
```

响应：`PipelineResult`

这个接口适合比赛演示「不是只能吃 mock，而是能根据用户输入素材列表生成完整剪辑方案」。正式上传和异步 job 接口后续再补。

## Material Demo Cases

`GET /api/pipeline/material-demo/cases`

返回内置半真实 demo case 列表。当前包含：

- `air_fryer_balanced`
- `air_fryer_missing_proof`
- `beauty_sunscreen_conversion`
- `english_course_knowledge`
- `weak_materials_stress_test`

`POST /api/pipeline/material-demo/cases/{case_id}`

按 case ID 直接运行完整半真实链路，响应同样是 `PipelineResult`。例如：

```bash
curl -X POST http://127.0.0.1:8000/api/pipeline/material-demo/cases/beauty_sunscreen_conversion \
  -H 'Content-Type: application/json'
```
