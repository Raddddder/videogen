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
