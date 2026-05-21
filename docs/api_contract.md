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

响应：

```json
{
  "structure_dna": {},
  "material_library": {},
  "edit_plan": {},
  "comparison_report": {}
}
```

这个接口用于前端和答辩演示，不代表最终真实处理链路。
