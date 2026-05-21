# 架构说明

## 分层原则

项目分为四层，避免框架层和业务层耦合：

- Framework：FastAPI 路由、CORS、配置加载、依赖注入。
- Contracts：Pydantic model 和 JSON Schema，定义跨模块输入输出。
- Application：把 A/B/C 模块串成用例，不写具体媒体或模型逻辑。
- Business Services：结构拆解、素材理解、方案生成、报告和导出。

API 层只做请求/响应转换。真实业务逻辑进入 `backend/app/services/`，端到端编排进入 `backend/app/application/`。

## 模块边界

### Module A: StructureAnalyzer

输入：

- 样例视频路径或 URL
- 项目 ID
- 配置中的 segment 枚举

输出：

- `StructureDNA`

后续替换点：

- FFmpeg 元数据
- 镜头切分
- ASR
- 多模态结构抽取

### Module B: MaterialAnalyzer

输入：

- 用户素材
- 商品/主题 brief

输出：

- `MaterialLibrary`

后续替换点：

- 关键帧抽取
- 视觉标签
- 可用片段筛选
- 质量分和裁剪风险

### Module C: PlanGenerator

输入：

- `StructureDNA`
- `MaterialLibrary`
- 目标变体

输出：

- `EditPlan`
- 缺口识别
- 补全策略

后续替换点：

- 规则召回
- LLM 排序解释
- 多版本生成
- 剪映草稿导出

### Module D: Frontend/Preview

输入：

- 后端 JSON
- 任务状态
- 预览视频/报告路径

输出：

- 样例分析页
- 素材匹配页
- 方案输出页
- Remotion 预览视频

## 配置化约定

- 枚举和权重放在 `config/defaults.json`。
- 跨模块字段放在 `schemas/`。
- 演示数据放在 `mocks/`。
- 真实密钥只走 `.env`，不写入代码。
- 业务策略优先注入服务，不写在路由里。
