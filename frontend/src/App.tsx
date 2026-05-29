import {useEffect, useMemo, useRef, useState} from "react";
import type {ReactNode} from "react";
import {Button, Card, Input, Progress, Radio, Slider, Tag, Textarea} from "tdesign-react";
import {CloudUploadIcon, PlayCircleIcon, RocketIcon} from "tdesign-icons-react";

import {assetUrl, runDemoPipeline, uploadMaterials, uploadSamplePipeline} from "./api";
import {demoSessions} from "./demoSessions";
import type {DemoSession} from "./demoSessions";
import {fallbackPipeline} from "./mockState";
import type {
  Material,
  PipelineResult,
  SegmentFunction,
  SlotStatus,
  StructureSegment,
  TimelineItem,
} from "./types";

type ViewKey = "overview" | "analysis" | "materials" | "plan" | "acceptance";
type VariantKey = "balanced" | "high_click" | "high_conversion";
type SessionStatus = DemoSession["status"];
type SessionStage = DemoSession["stage"];

type SamplePreview = {
  label: string;
  videoSrc: string;
  fileName: string;
  durationLabel: string;
  aspectRatio: string;
};

type WorkbenchDraft = {
  productTitle: string;
  sellingPoints: string;
  materialBrief: string;
  hookRewrite: string;
  packagingStyle: string;
  ctaText: string;
  pacingIntensity: number;
};

type VariantConfig = {
  id: VariantKey;
  label: string;
  focus: string;
  scriptTone: string;
  pacing: string;
  packaging: string;
};

type AcceptanceModule = {
  owner: string;
  module: string;
  title: string;
  status: "ready" | "partial" | "next";
  scoreScope: string;
  scope: string[];
  inputs: string[];
  outputs: string[];
  checks: string[];
  testCommand: string;
};

const functionLabels: Record<SegmentFunction, string> = {
  hook: "开头钩子",
  pain_point: "痛点",
  setup: "铺垫",
  solution: "解决方案",
  proof: "效果证明",
  transition: "转场",
  cta: "转化 CTA",
};

const statusLabels: Record<SlotStatus, string> = {
  matched: "已匹配",
  weak_match: "弱匹配",
  missing: "缺素材",
  supplemented: "已补全",
};

const statusOrder: SlotStatus[] = ["matched", "weak_match", "missing", "supplemented"];

const statusThemes: Record<SlotStatus, "success" | "warning" | "danger" | "primary"> = {
  matched: "success",
  weak_match: "warning",
  missing: "danger",
  supplemented: "primary",
};

const sessionStatusLabels: Record<SessionStatus, string> = {
  ready: "可演示",
  running: "生成中",
  needs_review: "需复核",
};

const sessionStatusThemes: Record<SessionStatus, "success" | "warning" | "danger" | "primary"> = {
  ready: "success",
  running: "primary",
  needs_review: "warning",
};

const sessionStageLabels: Record<SessionStage, string> = {
  sample: "样例解析",
  materials: "素材理解",
  plan: "方案生成",
  preview: "结果预览",
};

const stageCards = [
  {id: "A", title: "样例结构拆解", detail: "解析 Structure DNA"},
  {id: "B", title: "用户素材理解", detail: "生成 Material Library"},
  {id: "C", title: "结构迁移生成", detail: "输出 Edit Plan 与缺口补全"},
  {id: "D", title: "前端会话演示", detail: "时间线、报告与导出产物"},
];

const viewTabs: Array<{key: ViewKey; label: string}> = [
  {key: "overview", label: "总览"},
  {key: "analysis", label: "样例分析"},
  {key: "materials", label: "素材匹配"},
  {key: "plan", label: "方案输出"},
  {key: "acceptance", label: "验收清单"},
];

const acceptanceModules: AcceptanceModule[] = [
  {
    owner: "张旭宏",
    module: "Module A",
    title: "样例视频解析与 Structure DNA",
    status: "partial",
    scoreScope: "约 15-20 分",
    scope: ["视频基础信息", "镜头切分检测", "ASR 与转写", "结构 / 功能 / 情绪曲线"],
    inputs: ["样例视频", "AnalyzeSampleRequest", "source_uri / uploaded file"],
    outputs: ["StructureDNA", "segments[]", "basic_info", "global_features"],
    checks: ["分段时间范围必须递增", "分段总时长需接近视频总时长", "结构输出需过 schema 校验"],
    testCommand: "python scripts\\validate_contracts.py",
  },
  {
    owner: "吴隆正",
    module: "Module B/C",
    title: "素材理解、槽位匹配与缺口补全",
    status: "ready",
    scoreScope: "约 45-50 分",
    scope: ["规则召回打分", "槽位匹配", "缺口识别", "补全策略", "对比报告输出"],
    inputs: ["StructureDNA", "TargetBrief", "material_uris[]", "variant"],
    outputs: ["MaterialLibrary", "EditPlan", "missing_slots[]", "comparison_report"],
    checks: ["5 个内置 case 全部跑通", "状态枚举来自 slot_status", "每个槽位都有匹配与补全解释"],
    testCommand: "python scripts\\run_demo_pipeline.py",
  },
  {
    owner: "管振凯",
    module: "Module D",
    title: "前端产品、结构可视化与演示链路",
    status: "ready",
    scoreScope: "约 30-35 分",
    scope: ["会话工作台", "样例分析展示", "素材匹配展示", "方案时间线展示", "缺口与补全可视化"],
    inputs: ["PipelineResult", "demoSessions", "sample/result video assets"],
    outputs: ["TDesign 工作台", "样例分析页", "素材匹配页", "方案输出页", "结构预览页"],
    checks: ["5 个会话可演示", "pipeline 一键跑通", "时间线可视化", "缺口报告展示"],
    testCommand: "npm --prefix frontend run build",
  },
];

const acceptanceStatusLabels: Record<AcceptanceModule["status"], string> = {
  ready: "已就绪",
  partial: "部分完成",
  next: "待开始",
};

const acceptanceStatusThemes: Record<AcceptanceModule["status"], "success" | "warning" | "primary"> = {
  ready: "success",
  partial: "warning",
  next: "primary",
};

const variantConfigs: VariantConfig[] = [
  {
    id: "balanced",
    label: "均衡版",
    focus: "结构、点击与转化之间保持均衡",
    scriptTone: "自然口播",
    pacing: "适中",
    packaging: "标题条 + 关键词高亮",
  },
  {
    id: "high_click",
    label: "高点击版",
    focus: "放大开头冲突与好奇心",
    scriptTone: "强钩子",
    pacing: "快节奏",
    packaging: "动态标题 + 节奏音效",
  },
  {
    id: "high_conversion",
    label: "高转化版",
    focus: "强化证明与购买理由",
    scriptTone: "强说服",
    pacing: "稳中偏慢",
    packaging: "信任背书 + CTA 强化",
  },
];

const editDefaults = {
  hookRewrite: "很多人第一次用这个产品，第一步就容易做错",
  packagingStyle: "标题条 + 关键词高亮 + 节奏音效，弱匹配段加转场",
  ctaText: "想少踩坑就先收藏，链接我放在下面了",
  pacingIntensity: 72,
};

const defaultDraft = buildDraftFromSession(demoSessions[0]);

export function App() {
  const [data, setData] = useState<PipelineResult>(fallbackPipeline);
  const [activeView, setActiveView] = useState<ViewKey>("overview");
  const [activeSessionId, setActiveSessionId] = useState(demoSessions[0].id);
  const [activeSegmentId, setActiveSegmentId] = useState(
    fallbackPipeline.edit_plan.timeline[0]?.target_segment_id ?? "",
  );
  const [loading, setLoading] = useState(false);
  const [sampleUploading, setSampleUploading] = useState(false);
  const [apiState, setApiState] = useState("mock ready");
  const [uploadedSample, setUploadedSample] = useState<SamplePreview | undefined>();
  const [activeVariant, setActiveVariant] = useState<VariantKey>(demoSessions[0].variant);
  const [draft, setDraft] = useState<WorkbenchDraft>(defaultDraft);
  const [materialUploading, setMaterialUploading] = useState(false);
  const sampleInputRef = useRef<HTMLInputElement>(null);
  const materialInputRef = useRef<HTMLInputElement>(null);

  const materialById = useMemo(() => {
    return new Map(data.material_library.materials.map((material) => [material.material_id, material]));
  }, [data.material_library.materials]);

  const segmentById = useMemo(() => {
    return new Map(data.structure_dna.segments.map((segment) => [segment.segment_id, segment]));
  }, [data.structure_dna.segments]);

  const totalSourceDuration = data.structure_dna.total_duration_sec;
  const totalTargetDuration = getTimelineDuration(data.edit_plan.timeline);
  const activeSession = demoSessions.find((session) => session.id === activeSessionId) ?? demoSessions[0];
  const currentSample = uploadedSample ?? activeSession?.sample;
  const activeVariantConfig = variantConfigs.find((variant) => variant.id === activeVariant) ?? variantConfigs[0];
  const targetTitle = draft.productTitle.trim() || activeSession?.targetTitle || data.edit_plan.target_title;
  const resultScript = getAdjustedScript(data.edit_plan.timeline[0]?.script, draft, activeVariantConfig, "hook");
  const activeTimelineItem = data.edit_plan.timeline.find((item) => item.target_segment_id === activeSegmentId)
    ?? data.edit_plan.timeline[0];
  const activeSourceSegment = activeTimelineItem ? segmentById.get(activeTimelineItem.segment_id) : undefined;
  const activeMaterial = activeTimelineItem?.selected_material_id
    ? materialById.get(activeTimelineItem.selected_material_id)
    : undefined;

  const handleSelectSession = (session: DemoSession) => {
    setActiveSessionId(session.id);
    setActiveVariant(session.variant);
    setDraft(buildDraftFromSession(session));
    setActiveView("overview");
    setApiState(`${session.caseId} ready`);
  };

  const statusCounts = useMemo(() => {
    return statusOrder.reduce<Record<SlotStatus, number>>(
      (acc, status) => {
        acc[status] = data.edit_plan.timeline.filter((item) => item.slot_status === status).length;
        return acc;
      },
      {matched: 0, weak_match: 0, missing: 0, supplemented: 0},
    );
  }, [data.edit_plan.timeline]);

  const readiness = Math.round(
    ((statusCounts.matched + statusCounts.supplemented * 0.85 + statusCounts.weak_match * 0.55)
      / Math.max(data.edit_plan.timeline.length, 1))
      * 100,
  );

  const handleRun = async () => {
    setLoading(true);
    setApiState("running");
    try {
      const result = await runDemoPipeline();
      setData(result);
      setActiveSegmentId(result.edit_plan.timeline[0]?.target_segment_id ?? "");
      setApiState("backend synced");
    } catch (error) {
      setApiState(error instanceof Error ? error.message : "backend unavailable");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSample = async (file: File) => {
    const previewUrl = URL.createObjectURL(file);
    const videoId = buildVideoId(file.name);
    setSampleUploading(true);
    setApiState("uploading sample");
    try {
      const result = await uploadSamplePipeline(file, {
        projectId: data.edit_plan.project_id || "case_001",
        videoId,
        targetTitle: data.edit_plan.target_title,
        targetCategory: data.material_library.target?.category,
        sellingPoints: data.material_library.target?.selling_points,
        variant: data.edit_plan.variant,
      });
      setData(result);
      setActiveSegmentId(result.edit_plan.timeline[0]?.target_segment_id ?? "");
      setUploadedSample((previous) => {
        if (previous?.videoSrc.startsWith("blob:")) {
          URL.revokeObjectURL(previous.videoSrc);
        }
        return {
          label: "Uploaded",
          videoSrc: previewUrl,
          fileName: file.name,
          durationLabel: `${formatSeconds(result.structure_dna.total_duration_sec)}s`,
          aspectRatio: result.structure_dna.basic_info
            ? `${result.structure_dna.basic_info.width} x ${result.structure_dna.basic_info.height}`
            : "uploaded",
        };
      });
      setApiState("sample pipeline synced");
      setActiveView("overview");
    } catch (error) {
      URL.revokeObjectURL(previewUrl);
      setApiState(error instanceof Error ? error.message : "sample upload failed");
    } finally {
      setSampleUploading(false);
    }
  };

  const handleSelectMaterials = async (files: File[]) => {
    if (!files.length) {
      return;
    }
    setMaterialUploading(true);
    setApiState(`analyzing ${files.length} materials`);
    try {
      const library = await uploadMaterials(files, {
        projectId: data.edit_plan.project_id || "case_001",
        targetTitle: targetTitle,
        targetCategory: data.material_library.target?.category,
        sellingPoints: data.material_library.target?.selling_points,
      });
      setData((current) => ({...current, material_library: library}));
      setApiState(`materials analyzed (${library.materials.length})`);
      setActiveView("materials");
    } catch (error) {
      setApiState(error instanceof Error ? error.message : "material upload failed");
    } finally {
      setMaterialUploading(false);
    }
  };

  return (
    <main className="app-shell">
      <input
        ref={sampleInputRef}
        accept="video/mp4,video/quicktime,video/webm,.mov,.m4v"
        className="hidden-file-input"
        type="file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) {
            void handleSelectSample(file);
          }
        }}
      />
      <input
        ref={materialInputRef}
        accept="video/*,image/*,.txt,.md,.csv,audio/*"
        className="hidden-file-input"
        multiple
        type="file"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          void handleSelectMaterials(files);
        }}
      />
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">D</span>
          <div>
            <strong>爆款结构迁移引擎</strong>
            <small>{apiState}</small>
          </div>
        </div>

        <Button
          block
          className="primary-action"
          icon={<PlayCircleIcon />}
          loading={loading}
          theme="primary"
          type="button"
          onClick={handleRun}
        >
          {loading ? "生成中..." : "跑通 Demo 管线"}
        </Button>

        <div className="session-panel">
          <div className="sidebar-section-title">
            <span>演示会话</span>
            <strong>{demoSessions.length}</strong>
          </div>
          <div className="session-list">
            {demoSessions.map((session) => (
              <button
                key={session.id}
                className={session.id === activeSessionId ? "session-card active" : "session-card"}
                type="button"
                onClick={() => handleSelectSession(session)}
              >
                <span>{session.name}</span>
                <b>{session.targetTitle}</b>
                <small>{sessionStageLabels[session.stage]} / {session.gapProfile}</small>
                <div>
                  <Tag shape="round" theme={sessionStatusThemes[session.status]} variant="light">
                    {sessionStatusLabels[session.status]}
                  </Tag>
                  <em>{session.artifacts.length} 产物</em>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="view-tabs" aria-label="视图切换导航">
          {viewTabs.map((item) => (
            <Button
              key={item.key}
              className={activeView === item.key ? "active" : ""}
              variant={activeView === item.key ? "base" : "outline"}
              onClick={() => setActiveView(item.key)}
            >
              {item.label}
            </Button>
          ))}
        </div>

        <div className="score-stack">
          <Score label="结构一致" value={data.edit_plan.overall_score.structure_consistency} />
          <Score label="素材匹配" value={data.edit_plan.overall_score.material_fit} />
          <Score label="节奏匹配" value={data.edit_plan.overall_score.pacing_fit} />
          <div className="readiness-meter">
            <span>演示可用度</span>
            <strong>{readiness}</strong>
            <Progress color="#0f766e" label={false} percentage={readiness} size="small" theme="line" />
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Module D Workspace</p>
            <h1>{targetTitle}</h1>
            <p className="workspace-subtitle">
              上传样例视频与用户素材，AI 自动完成结构拆解、素材匹配与方案生成。
            </p>
          </div>
          <div className="status-strip" aria-label="槽位状态统计">
            {statusOrder.map((status) => (
              <Tag key={status} shape="round" theme={statusThemes[status]} variant="light">
                {statusLabels[status]} {statusCounts[status]}
              </Tag>
            ))}
          </div>
        </header>

        {activeView === "overview" && (
          <OverviewView
            data={data}
            session={activeSession}
            sample={currentSample}
            draft={draft}
            activeVariantKey={activeVariant}
            activeVariant={activeVariantConfig}
            targetTitle={targetTitle}
            resultScript={resultScript}
            materialById={materialById}
            sampleUploading={sampleUploading}
            totalSourceDuration={totalSourceDuration}
            onDraftChange={(field, value) => setDraft((current) => ({...current, [field]: value}))}
            onOpenMaterials={() => setActiveView("materials")}
            onOpenPlan={() => setActiveView("plan")}
            onPickSample={() => sampleInputRef.current?.click()}
            onVariantChange={setActiveVariant}
          />
        )}
        {activeView === "analysis" && (
          <AnalysisView data={data} totalDuration={totalSourceDuration} />
        )}
        {activeView === "materials" && (
          <MaterialsView
            data={data}
            activeSegmentId={activeSegmentId}
            setActiveSegmentId={setActiveSegmentId}
            materialUploading={materialUploading}
            onUploadMaterials={() => materialInputRef.current?.click()}
          />
        )}
        {activeView === "plan" && (
          <PlanView
            data={data}
            totalDuration={totalTargetDuration}
            activeSegmentId={activeSegmentId}
            activeTimelineItem={activeTimelineItem}
            activeSourceSegment={activeSourceSegment}
            activeMaterial={activeMaterial}
            activeVariant={activeVariant}
            activeVariantConfig={activeVariantConfig}
            draft={draft}
            onVariantChange={setActiveVariant}
            onDraftChange={(field, value) => setDraft((current) => ({...current, [field]: value}))}
            setActiveSegmentId={setActiveSegmentId}
          />
        )}
        {activeView === "acceptance" && (
          <AcceptanceView
            modules={acceptanceModules}
            sessionCount={demoSessions.length}
            statusCounts={statusCounts}
            readiness={readiness}
          />
        )}
      </section>
    </main>
  );
}

function OverviewView({
  data,
  session,
  sample,
  draft,
  activeVariantKey,
  activeVariant,
  targetTitle,
  resultScript,
  materialById,
  sampleUploading,
  totalSourceDuration,
  onDraftChange,
  onOpenMaterials,
  onOpenPlan,
  onPickSample,
  onVariantChange,
}: {
  data: PipelineResult;
  session?: DemoSession;
  sample?: SamplePreview;
  draft: WorkbenchDraft;
  activeVariantKey: VariantKey;
  activeVariant: VariantConfig;
  targetTitle: string;
  resultScript: string;
  materialById: Map<string, Material>;
  sampleUploading: boolean;
  totalSourceDuration: number;
  onDraftChange: (field: keyof WorkbenchDraft, value: string | number) => void;
  onOpenMaterials: () => void;
  onOpenPlan: () => void;
  onPickSample: () => void;
  onVariantChange: (variant: VariantKey) => void;
}) {
  const report = data.comparison_report.summary;
  const firstSegment = data.structure_dna.segments[0];
  const sellingPoints = draft.sellingPoints.split(/[、，,]/).map((item) => item.trim()).filter(Boolean).slice(0, 3);
  const firstGap = data.edit_plan.missing_slots[0];
  const readyArtifacts = session?.artifacts.filter((artifact) => artifact.state === "ready").length ?? 0;
  const matchSummary = data.edit_plan.timeline.reduce(
    (acc, item) => {
      acc[item.slot_status] += 1;
      return acc;
    },
    {matched: 0, weak_match: 0, missing: 0, supplemented: 0} as Record<SlotStatus, number>,
  );
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<"input" | "analysis" | "output">("input");
  const [analysisDepth, setAnalysisDepth] = useState("balanced");
  const [captureFocus, setCaptureFocus] = useState(["hook", "pacing", "proof", "gap"]);
  const [gapStrictness, setGapStrictness] = useState(72);
  const [aigcAssist, setAigcAssist] = useState(65);
  const toggleCaptureFocus = (value: string) => {
    setCaptureFocus((current) => (
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    ));
  };

  return (
    <div className="workflow-dashboard">
      <section className="workflow-runway" aria-label="生成流程导航">
        <button
          className={activeWorkflowStep === "input" ? "workflow-runway-step current" : "workflow-runway-step done"}
          type="button"
          onClick={() => setActiveWorkflowStep("input")}
        >
          <span>1</span>
          <div>
            <b>样例输入</b>
            <small>{sample?.fileName ?? data.structure_dna.video_id}</small>
          </div>
        </button>
        <button
          className={activeWorkflowStep === "analysis" ? "workflow-runway-step current" : "workflow-runway-step done"}
          type="button"
          onClick={() => setActiveWorkflowStep("analysis")}
        >
          <span>2</span>
          <div>
            <b>结构分析</b>
            <small>{matchSummary.matched} 已匹配 / {matchSummary.weak_match + matchSummary.missing} 待补全</small>
          </div>
        </button>
        <button
          className={activeWorkflowStep === "output" ? "workflow-runway-step current" : "workflow-runway-step next"}
          type="button"
          onClick={() => setActiveWorkflowStep("output")}
        >
          <span>3</span>
          <div>
            <b>输出</b>
            <small>{activeVariant.label}</small>
          </div>
        </button>
      </section>

      <section className="workflow-stack" aria-label="三步生成工作流">
        {activeWorkflowStep === "input" && (
        <article className="workflow-card step-one is-current">
          <div className="workflow-index">
            <span>01</span>
            <b>样例输入</b>
            <small>上传爆款样例视频并解析结构</small>
          </div>
          <div className="workflow-content">
            <PanelTitle eyebrow="Step 01" title="解析样例视频为 Structure DNA" />
            <div className="workflow-summary-grid">
              <Info label="样例文件" value={sample?.fileName ?? data.structure_dna.video_id} />
              <Info label="模板时长" value={sample?.durationLabel ?? `${formatSeconds(totalSourceDuration)}s`} />
              <Info label="画面规格" value={data.structure_dna.basic_info ? `${data.structure_dna.basic_info.width} x ${data.structure_dna.basic_info.height}` : "9:16"} />
              <Info label="自动镜头数" value={String(data.structure_dna.basic_info?.shot_count ?? data.structure_dna.segments.length)} />
            </div>
            <div className="workflow-config-panel">
              <b>目标信息配置</b>
              <div className="config-grid">
                <label className="field-stack">
                  <span>标题 / 主题</span>
                  <Input
                    value={draft.productTitle}
                    onChange={(value) => onDraftChange("productTitle", String(value))}
                  />
                </label>
                <label className="field-stack">
                  <span>核心卖点</span>
                  <Input
                    value={draft.sellingPoints}
                    onChange={(value) => onDraftChange("sellingPoints", String(value))}
                  />
                </label>
                <label className="field-stack config-grid-wide">
                  <span>素材情况说明</span>
                  <Textarea
                    autosize={{minRows: 2, maxRows: 3}}
                    value={draft.materialBrief}
                    onChange={(value) => onDraftChange("materialBrief", value)}
                  />
                </label>
              </div>
            </div>
            <div className="mini-timeline">
              {data.structure_dna.segments.map((segment) => (
                <span key={segment.segment_id} style={{width: `${Math.max(segment.duration_ratio ?? 0.12, 0.08) * 100}%`}}>
                  {functionLabels[segment.function]}
                </span>
              ))}
            </div>
            <Button theme="primary" onClick={() => setActiveWorkflowStep("analysis")}>进入结构分析步骤</Button>
          </div>
          <div className="workflow-media">
            <Button
              block
              icon={<CloudUploadIcon />}
              loading={sampleUploading}
              variant="outline"
              onClick={onPickSample}
            >
              {sampleUploading ? "解析样例中..." : "上传样例视频"}
            </Button>
            <PhonePreview tone="source" videoSrc={sample?.videoSrc}>
              <div className="phone-badge">{sample?.label ?? "Template"}</div>
              <strong>{sample?.fileName ?? data.structure_dna.video_id}</strong>
              <span>{sample?.aspectRatio ?? data.structure_dna.category ?? "product_talk"}</span>
              <p>{firstSegment?.transcript ?? "等待上传样例视频"}</p>
            </PhonePreview>
          </div>
        </article>
        )}

        {activeWorkflowStep === "analysis" && (
        <article className="workflow-card step-two is-current">
          <div className="workflow-index">
            <span>02</span>
            <b>结构分析</b>
            <small>AI 自动捕获结构脚本与匹配</small>
          </div>
          <div className="workflow-content">
            <PanelTitle eyebrow="Step 02" title="自动捕获的结构脚本与匹配" />
            <div className="script-formula">{data.structure_dna.structure_formula}</div>
            <div className="auto-capture-panel">
              <b>自动捕获的产物</b>
              <div className="input-chip-row">
                <span>Structure DNA</span>
                <span>Material Library</span>
                <span>Slot Mapping</span>
                <span>Gap Report</span>
              </div>
            </div>
            <div className="workflow-config-panel">
              <b>结构分析配置</b>
              <div className="config-grid">
                <label className="field-stack">
                  <span>分析深度</span>
                  <Radio.Group
                    options={[
                      {label: "快速", value: "fast"},
                      {label: "均衡", value: "balanced"},
                      {label: "深度", value: "deep"},
                    ]}
                    theme="button"
                    value={analysisDepth}
                    variant="default-filled"
                    onChange={(value) => setAnalysisDepth(String(value))}
                  />
                </label>
                <label className="field-stack">
                  <span>缺口严格度 {gapStrictness}</span>
                  <Slider
                    label="${value}"
                    max={100}
                    min={30}
                    step={1}
                    value={gapStrictness}
                    onChange={(value) => setGapStrictness(Array.isArray(value) ? value[0] : value)}
                  />
                </label>
                <div className="field-stack config-grid-wide">
                  <span>捕获重点</span>
                  <div className="toggle-chip-row">
                    {[
                      ["hook", "Hook"],
                      ["pacing", "节奏"],
                      ["proof", "证明"],
                      ["gap", "缺口"],
                      ["visual", "画面"],
                      ["cta", "CTA"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        className={captureFocus.includes(value) ? "toggle-chip active" : "toggle-chip"}
                        type="button"
                        onClick={() => toggleCaptureFocus(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="matching-board">
              <b>槽位匹配概览</b>
              <div className="result-stack">
                {data.edit_plan.timeline.slice(0, 5).map((item) => (
                  <section key={item.target_segment_id}>
                    <span className={`status-dot ${item.slot_status}`} />
                    <b>{functionLabels[item.function]}</b>
                    <small>{statusLabels[item.slot_status]} / {materialById.get(item.selected_material_id ?? "")?.file_name ?? item.completion_strategy}</small>
                  </section>
                ))}
              </div>
            </div>
            <div className="script-scroll workflow-script-list">
              {data.structure_dna.segments.slice(0, 4).map((segment, index) => (
                <section className="script-beat" key={segment.segment_id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <b>{functionLabels[segment.function]}</b>
                    <p>{segment.transcript}</p>
                    <small>{segment.visual_cue ?? segment.text_pattern} / {segment.pacing}</small>
                  </div>
                </section>
              ))}
            </div>
          </div>
          <div className="workflow-side">
            <div className="workflow-session-card">
              <span>当前会话</span>
              <b>{session?.name} / {session?.caseId}</b>
              <div className="input-chip-row">
                <Tag shape="round" theme={session ? sessionStatusThemes[session.status] : "primary"} variant="light">
                  {session ? sessionStatusLabels[session.status] : "可演示"}
                </Tag>
                <span>{session ? sessionStageLabels[session.stage] : "样例解析"}</span>
              </div>
              <div className="input-chip-row">
                {sellingPoints.map((point) => <span key={point}>{point}</span>)}
              </div>
              <small>{session?.description ?? "展示当前会话的结构迁移与缺口补全过程"}</small>
            </div>
            <div className="creative-note">
              <b>创意判断</b>
              <p>{report?.main_gap ?? "先保留模板结构，再按素材强弱决定补全策略。"}</p>
            </div>
            <div className="workflow-actions">
              <Button variant="outline" onClick={() => setActiveWorkflowStep("input")}>返回样例输入</Button>
              <Button variant="outline" onClick={onOpenMaterials}>素材匹配</Button>
              <Button theme="primary" onClick={() => setActiveWorkflowStep("output")}>进入结果生成</Button>
            </div>
          </div>
        </article>
        )}

        {activeWorkflowStep === "output" && (
        <article className="workflow-card step-three is-current">
          <div className="workflow-index">
            <span>03</span>
            <b>输出</b>
            <small>结合素材、AIGC 与迁移策略</small>
          </div>
          <div className="workflow-content">
            <PanelTitle eyebrow="Step 03" title="生成结果视频与剪辑方案" />
            <div className="workflow-config-panel">
              <b>生成配置</b>
              <div className="config-grid">
                <label className="field-stack config-grid-wide">
                  <span>生成版本</span>
                  <Radio.Group
                    options={variantConfigs.map((variant) => ({label: variant.label, value: variant.id}))}
                    theme="button"
                    value={activeVariantKey}
                    variant="default-filled"
                    onChange={(value) => onVariantChange(value as VariantKey)}
                  />
                </label>
                <label className="field-stack config-grid-wide">
                  <span>Hook 改写</span>
                  <Textarea
                    autosize={{minRows: 2, maxRows: 3}}
                    value={draft.hookRewrite}
                    onChange={(value) => onDraftChange("hookRewrite", value)}
                  />
                </label>
                <label className="field-stack">
                  <span>包装风格</span>
                  <Input
                    value={draft.packagingStyle}
                    onChange={(value) => onDraftChange("packagingStyle", String(value))}
                  />
                </label>
                <label className="field-stack">
                  <span>CTA 文案</span>
                  <Input
                    value={draft.ctaText}
                    onChange={(value) => onDraftChange("ctaText", String(value))}
                  />
                </label>
                <label className="field-stack">
                  <span>节奏强度 {draft.pacingIntensity}</span>
                  <Slider
                    label="${value}"
                    max={100}
                    min={30}
                    step={1}
                    value={draft.pacingIntensity}
                    onChange={(value) => onDraftChange("pacingIntensity", Array.isArray(value) ? value[0] : value)}
                  />
                </label>
                <label className="field-stack">
                  <span>AIGC 补全强度 {aigcAssist}</span>
                  <Slider
                    label="${value}"
                    max={100}
                    min={0}
                    step={1}
                    value={aigcAssist}
                    onChange={(value) => setAigcAssist(Array.isArray(value) ? value[0] : value)}
                  />
                </label>
              </div>
            </div>
            <div className="workflow-summary-grid">
              <Info label="目标主题" value={targetTitle} />
              <Info label="生成版本" value={activeVariant.label} />
              <Info label="节奏风格" value={activeVariant.pacing} />
              <Info label="产物就绪" value={`${readyArtifacts}/${session?.artifacts.length ?? 4} 已就绪`} />
            </div>
            <div className="generation-inputs">
              <b>生成依据</b>
              <div className="input-chip-row">
                <span>Structure DNA</span>
                <span>Material Library</span>
                <span>Edit Plan</span>
                <span>AIGC 补全</span>
              </div>
              <p>{firstGap ? firstGap.suggested_fix : session?.inputs.creativeBrief ?? "根据结构脚本与素材状态生成结果方案"}</p>
            </div>
            <div className="result-stack">
              {data.edit_plan.timeline.slice(0, 4).map((item) => (
                <section key={item.target_segment_id}>
                  <span className={`status-dot ${item.slot_status}`} />
                  <b>{functionLabels[item.function]}</b>
                  <small>{materialById.get(item.selected_material_id ?? "")?.file_name ?? item.completion_strategy}</small>
                </section>
              ))}
            </div>
          </div>
          <div className="workflow-media">
            <Button block icon={<RocketIcon />} theme="primary" variant="outline" onClick={onOpenPlan}>
              {session?.result.fileName ?? "生成结果视频"}
            </Button>
            <PhonePreview tone="result" videoSrc={session?.result.videoSrc}>
              <div className="phone-badge">{session?.result.label ?? "Generated"}</div>
              <strong>{targetTitle}</strong>
              <span>{activeVariant.label} / {session?.result.renderVersion ?? data.edit_plan.variant}</span>
              <p>{resultScript}</p>
            </PhonePreview>
          </div>
          <div className="workflow-actions workflow-actions-wide">
            <Button variant="outline" onClick={() => setActiveWorkflowStep("analysis")}>返回结构分析</Button>
            <Button theme="primary" onClick={onOpenPlan}>查看完整方案</Button>
          </div>
        </article>
        )}
      </section>
    </div>
  );
}

function PhonePreview({
  children,
  tone,
  videoSrc,
}: {
  children: ReactNode;
  tone: "source" | "result";
  videoSrc?: string;
}) {
  return (
    <div className={`phone-preview ${tone}`}>
      <div className="phone-screen">
        {videoSrc && (
          <video
            className="phone-video"
            controls
            loop
            muted
            playsInline
            preload="metadata"
            src={videoSrc}
          />
        )}
        <div className="phone-overlay">{children}</div>
      </div>
    </div>
  );
}

function AnalysisView({data, totalDuration}: {data: PipelineResult; totalDuration: number}) {
  const info = data.structure_dna.basic_info;

  return (
    <div className="panel-grid">
      <Card bordered className="panel wide">
        <PanelTitle eyebrow="Module A" title="样例结构 DNA" />
        <div className="formula">{data.structure_dna.structure_formula}</div>
        <Timeline totalDuration={totalDuration} items={data.structure_dna.segments.map((segment) => ({
          id: segment.segment_id,
          label: functionLabels[segment.function],
          range: segment.time_range,
          status: "matched" as SlotStatus,
        }))} />
      </Card>

      <Card bordered className="panel">
        <PanelTitle eyebrow="Source" title="视频基础信息" />
        <div className="info-list">
          <Info label="分辨率" value={info ? `${info.width} x ${info.height}` : "mock"} />
          <Info label="帧率" value={info ? `${info.fps} fps` : "mock"} />
          <Info label="自动镜头数" value={info ? String(info.shot_count) : String(data.structure_dna.segments.length)} />
          <Info label="口播" value={info?.has_speech === false ? "否" : "是"} />
        </div>
      </Card>

      <Card bordered className="panel wide">
        <PanelTitle eyebrow="Segments" title="结构槽位" />
        <div className="segment-list">
          {data.structure_dna.segments.map((segment) => (
            <article key={segment.segment_id} className="segment-row">
              <div>
                <b>{functionLabels[segment.function]}</b>
                <span>{formatRange(segment.time_range)}</span>
              </div>
              <p>{segment.transcript}</p>
              {segment.confidence !== undefined && (
                <small>
                  置信度 {Math.round(segment.confidence * 100)}% · {segment.analysis_reason ?? "结构模型判断"}
                </small>
              )}
              <small>{segment.visual_cue ?? segment.required_material_tags.join(" / ")}</small>
            </article>
          ))}
        </div>
      </Card>

      <Card bordered className="panel">
        <PanelTitle eyebrow="Pacing" title="情绪曲线" />
        <div className="emotion-bars">
          {data.structure_dna.global_features.overall_emotion_curve.map((score, index) => (
            <span key={`${score}-${index}`} style={{height: `${score * 9}%`}} title={`${score}`} />
          ))}
        </div>
      </Card>
    </div>
  );
}

const materialSourceLabels: Record<NonNullable<Material["analysis_source"]>, string> = {
  vlm: "AI 视觉识别",
  rule: "规则推断",
  mock: "示例数据",
};

function MaterialsView({
  data,
  activeSegmentId,
  setActiveSegmentId,
  materialUploading,
  onUploadMaterials,
}: {
  data: PipelineResult;
  activeSegmentId: string;
  setActiveSegmentId: (id: string) => void;
  materialUploading: boolean;
  onUploadMaterials: () => void;
}) {
  return (
    <div className="panel-grid">
      <Card bordered className="panel wide">
        <div className="material-head-row">
          <PanelTitle eyebrow="Module B" title="素材标签库" />
          <Button
            icon={<CloudUploadIcon />}
            loading={materialUploading}
            theme="primary"
            variant="outline"
            onClick={onUploadMaterials}
          >
            {materialUploading ? "AI 解析中..." : "上传我的素材"}
          </Button>
        </div>
        <div className="material-grid">
          {data.material_library.materials.map((material) => {
            const preview = assetUrl(material.preview_url);
            return (
            <article key={material.material_id} className="material-card">
              {preview && material.type === "video_clip" && (
                <video className="material-preview" src={preview} muted loop playsInline preload="metadata" />
              )}
              {preview && material.type === "image" && (
                <img className="material-preview" src={preview} alt={material.file_name} />
              )}
              <div className="material-head">
                <b>{material.file_name}</b>
                <span>{Math.round(material.quality_score * 100)}%</span>
              </div>
              {material.analysis_source && (
                <Tag
                  shape="round"
                  size="small"
                  theme={material.analysis_source === "vlm" ? "success" : "default"}
                  variant="light"
                >
                  {materialSourceLabels[material.analysis_source]}
                </Tag>
              )}
              <p>{material.transcript || material.shot_type}</p>
              <div className="material-meta">
                <span>{material.type}</span>
                <span>{material.aspect_ratio ?? "auto"}</span>
                <span>裁剪风险 {material.crop_risk}</span>
              </div>
              <div className="tag-row">
                {material.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </article>
            );
          })}
        </div>
      </Card>

      <Card bordered className="panel">
        <PanelTitle eyebrow="Slots" title="槽位检查" />
        <div className="slot-list">
          {data.edit_plan.timeline.map((item) => (
            <button
              key={item.target_segment_id}
              className={activeSegmentId === item.target_segment_id ? "active" : ""}
              type="button"
              onClick={() => setActiveSegmentId(item.target_segment_id)}
            >
              <span className={`status-dot ${item.slot_status}`} />
              <b>{functionLabels[item.function]}</b>
              <small>{statusLabels[item.slot_status]}</small>
            </button>
          ))}
        </div>
      </Card>

      <Card bordered className="panel">
        <PanelTitle eyebrow="Gaps" title="素材缺口" />
        <div className="gap-list">
          {data.edit_plan.missing_slots.map((slot) => (
            <div className="gap-card" key={slot.segment_id}>
              <b>{slot.function}</b>
              <p>{slot.impact}</p>
              <small>{slot.suggested_fix}</small>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function TimelinePreview({data, totalDuration}: {data: PipelineResult; totalDuration: number}) {
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timeline = data.edit_plan.timeline;
  const materials = useMemo(
    () => new Map(data.material_library.materials.map((m) => [m.material_id, m])),
    [data.material_library.materials],
  );

  useEffect(() => {
    if (!playing) {
      return;
    }
    const id = window.setInterval(() => {
      setElapsed((prev) => {
        const next = Number((prev + 0.1).toFixed(1));
        return next >= totalDuration ? 0 : next;
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [playing, totalDuration]);

  const current =
    timeline.find((item) => elapsed >= item.target_time_range[0] && elapsed < item.target_time_range[1]) ??
    timeline[0];
  const material = current?.selected_material_id ? materials.get(current.selected_material_id) : undefined;
  const preview = assetUrl(material?.preview_url);
  const subtitle = current?.packaging?.subtitle ?? current?.script ?? "";
  const titleBar = current?.packaging?.title_bar_text ?? "";

  return (
    <div className="preview-player">
      <div className={`preview-stage ${current ? current.slot_status : ""}`}>
        {preview && material?.type === "video_clip" && (
          <video className="preview-media" src={preview} muted loop autoPlay playsInline preload="metadata" />
        )}
        {preview && material?.type === "image" && (
          <img className="preview-media" src={preview} alt={material.file_name} />
        )}
        {!preview && <div className="preview-placeholder">AIGC 待补 · {current ? functionLabels[current.function] : ""}</div>}
        <div className="preview-overlay">
          {titleBar && <div className="preview-title-bar">{titleBar}</div>}
          <div className="preview-function">{current ? functionLabels[current.function] : ""}</div>
          {subtitle && <div className="preview-subtitle">{subtitle}</div>}
        </div>
      </div>
      <div className="preview-controls">
        <Button
          icon={<PlayCircleIcon />}
          shape="circle"
          theme="primary"
          variant={playing ? "base" : "outline"}
          onClick={() => setPlaying((value) => !value)}
        />
        <div className="preview-track">
          {timeline.map((item) => {
            const start = (item.target_time_range[0] / totalDuration) * 100;
            const width = ((item.target_time_range[1] - item.target_time_range[0]) / totalDuration) * 100;
            return (
              <button
                key={item.target_segment_id}
                className={`preview-seg ${item.slot_status} ${current?.target_segment_id === item.target_segment_id ? "active" : ""}`}
                style={{left: `${start}%`, width: `${Math.max(width, 4)}%`}}
                title={functionLabels[item.function]}
                type="button"
                onClick={() => setElapsed(item.target_time_range[0])}
              />
            );
          })}
          <span className="preview-playhead" style={{left: `${(elapsed / totalDuration) * 100}%`}} />
        </div>
        <span className="preview-time">{elapsed.toFixed(1)} / {totalDuration.toFixed(1)}s</span>
      </div>
    </div>
  );
}

function PlanView({
  data,
  totalDuration,
  activeSegmentId,
  activeTimelineItem,
  activeSourceSegment,
  activeMaterial,
  activeVariant,
  activeVariantConfig,
  draft,
  onVariantChange,
  onDraftChange,
  setActiveSegmentId,
}: {
  data: PipelineResult;
  totalDuration: number;
  activeSegmentId: string;
  activeTimelineItem?: TimelineItem;
  activeSourceSegment?: StructureSegment;
  activeMaterial?: Material;
  activeVariant: VariantKey;
  activeVariantConfig: VariantConfig;
  draft: WorkbenchDraft;
  onVariantChange: (variant: VariantKey) => void;
  onDraftChange: (field: keyof WorkbenchDraft, value: string | number) => void;
  setActiveSegmentId: (id: string) => void;
}) {
  return (
    <div className="plan-layout">
      <div className="plan-main">
        <Card bordered className="panel">
          <PanelTitle eyebrow="Preview" title="结果预览" />
          <TimelinePreview data={data} totalDuration={totalDuration} />
        </Card>

        <Card bordered className="panel">
          <PanelTitle eyebrow="Module C" title="新方案时间线" />
          <Timeline
            totalDuration={totalDuration}
            activeId={activeSegmentId}
            onSelect={setActiveSegmentId}
            items={data.edit_plan.timeline.map((item) => ({
              id: item.target_segment_id,
              label: functionLabels[item.function],
              range: item.target_time_range,
              status: item.slot_status,
            }))}
          />
        </Card>

        <Card bordered className="panel">
          <PanelTitle eyebrow="Edit Plan" title="逐段剪辑方案" />
          <div className="plan-list">
            {data.edit_plan.timeline.map((item) => (
              <PlanRow key={item.target_segment_id} item={item} onSelect={setActiveSegmentId} />
            ))}
          </div>
        </Card>
      </div>

      <div className="plan-side">
        <Card bordered className="panel">
          <PanelTitle eyebrow="Variants" title="版本生成控制" />
          <div className="variant-control">
            <Radio.Group
              options={variantConfigs.map((variant) => ({label: variant.label, value: variant.id}))}
              theme="button"
              value={activeVariant}
              variant="default-filled"
              onChange={(value) => onVariantChange(value as VariantKey)}
            />
            <div className="variant-detail">
              <b>{activeVariantConfig.focus}</b>
              <Info label="脚本基调" value={activeVariantConfig.scriptTone} />
              <Info label="节奏风格" value={activeVariantConfig.pacing} />
              <Info label="包装方式" value={activeVariantConfig.packaging} />
            </div>
          </div>
        </Card>

        <Card bordered className="panel">
          <PanelTitle eyebrow="Human Edit" title="人工微调" />
          <div className="edit-control">
            <label className="field-stack">
              <span>Hook 改写</span>
              <Textarea
                autosize={{minRows: 2, maxRows: 3}}
                value={draft.hookRewrite}
                onChange={(value) => onDraftChange("hookRewrite", value)}
              />
            </label>
            <label className="field-stack">
              <span>包装风格</span>
              <Input
                value={draft.packagingStyle}
                onChange={(value) => onDraftChange("packagingStyle", String(value))}
              />
            </label>
            <label className="field-stack">
              <span>CTA 文案</span>
              <Input
                value={draft.ctaText}
                onChange={(value) => onDraftChange("ctaText", String(value))}
              />
            </label>
            <label className="field-stack">
              <span>节奏强度 {draft.pacingIntensity}</span>
              <Slider
                label="${value}"
                max={100}
                min={30}
                step={1}
                value={draft.pacingIntensity}
                onChange={(value) => onDraftChange("pacingIntensity", Array.isArray(value) ? value[0] : value)}
              />
            </label>
          </div>
        </Card>

        <Card bordered className="panel">
          <PanelTitle eyebrow="Inspector" title="选中槽位" />
          {activeTimelineItem && (
            <div className="inspector">
              <Tag shape="round" theme={statusThemes[activeTimelineItem.slot_status]} variant="light">
                {statusLabels[activeTimelineItem.slot_status]}
              </Tag>
              <h2>{functionLabels[activeTimelineItem.function]}</h2>
              <p>{getAdjustedScript(activeTimelineItem.script, draft, activeVariantConfig, activeTimelineItem.function)}</p>
              <Info label="样例原句" value={activeSourceSegment?.transcript ?? "无"} />
              <Info label="结构依据" value={activeSourceSegment?.analysis_reason ?? "未输出"} />
              <Info label="选中素材" value={activeMaterial?.file_name ?? "待补素材"} />
              <Info label="目标区间" value={formatRange(activeTimelineItem.target_time_range)} />
              <Info label="补全策略" value={`${activeTimelineItem.completion_strategy} / ${activeVariantConfig.packaging}`} />
            </div>
          )}
        </Card>

        <Card bordered className="panel">
          <PanelTitle eyebrow="Exports" title="交付物状态" />
          <div className="export-list">
            {Object.entries(data.edit_plan.exports).map(([key, value]) => (
              <Info key={key} label={key.replace(/_/g, " ")} value={value ?? "待生成"} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function PlanRow({item, onSelect}: {item: TimelineItem; onSelect: (id: string) => void}) {
  return (
    <button className="plan-row" type="button" onClick={() => onSelect(item.target_segment_id)}>
      <div>
        <Tag shape="round" theme={statusThemes[item.slot_status]} variant="light">
          {statusLabels[item.slot_status]}
        </Tag>
        <b>{functionLabels[item.function]}</b>
        <small>{formatRange(item.target_time_range)}</small>
      </div>
      <p>{item.script}</p>
      <small>{item.explanation}</small>
    </button>
  );
}

function AcceptanceView({
  modules,
  sessionCount,
  statusCounts,
  readiness,
}: {
  modules: AcceptanceModule[];
  sessionCount: number;
  statusCounts: Record<SlotStatus, number>;
  readiness: number;
}) {
  return (
    <div className="acceptance-view">
      <section className="acceptance-summary">
        <article>
          <span>验收模块数</span>
          <strong>{modules.length}</strong>
          <small>A / B+C / D 三方验收</small>
        </article>
        <article>
          <span>演示 case</span>
          <strong>{sessionCount}</strong>
          <small>覆盖正常、缺口与弱素材等场景</small>
        </article>
        <article>
          <span>覆盖槽位</span>
          <strong>{statusCounts.matched + statusCounts.supplemented}/{Object.values(statusCounts).reduce((sum, value) => sum + value, 0)}</strong>
          <small>matched + supplemented</small>
        </article>
        <article>
          <span>演示可用度</span>
          <strong>{readiness}</strong>
          <Progress color="#0f766e" label={false} percentage={readiness} size="small" theme="line" />
        </article>
      </section>

      <section className="acceptance-grid">
        {modules.map((item) => (
          <Card bordered className="panel acceptance-card" key={item.module}>
            <div className="acceptance-card-head">
              <div>
                <span>{item.module}</span>
                <h2>{item.title}</h2>
                <small>{item.owner} / {item.scoreScope}</small>
              </div>
              <Tag shape="round" theme={acceptanceStatusThemes[item.status]} variant="light">
                {acceptanceStatusLabels[item.status]}
              </Tag>
            </div>

            <AcceptanceList title="覆盖范围" items={item.scope} />
            <AcceptanceList title="输入" items={item.inputs} />
            <AcceptanceList title="输出" items={item.outputs} />
            <AcceptanceList title="验收检查" items={item.checks} />

            <div className="acceptance-command">
              <span>验收命令</span>
              <code>{item.testCommand}</code>
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}

function AcceptanceList({title, items}: {title: string; items: string[]}) {
  return (
    <div className="acceptance-list">
      <b>{title}</b>
      <div>
        {items.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </div>
  );
}

function Timeline({
  totalDuration,
  items,
  activeId,
  onSelect,
}: {
  totalDuration: number;
  items: Array<{id: string; label: string; range: [number, number]; status: SlotStatus}>;
  activeId?: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="timeline">
      {items.map((item) => {
        const start = (item.range[0] / totalDuration) * 100;
        const width = ((item.range[1] - item.range[0]) / totalDuration) * 100;
        return (
          <button
            key={item.id}
            className={`timeline-block ${item.status} ${activeId === item.id ? "active" : ""}`}
            style={{left: `${start}%`, width: `${Math.max(width, 5)}%`}}
            type="button"
            onClick={() => onSelect?.(item.id)}
          >
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Metric({label, value, note}: {label: string; value: string; note: string}) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function Score({label, value}: {label: string; value: number}) {
  return (
    <div className="score">
      <span>{label}</span>
      <strong>{Math.round(value * 100)}</strong>
    </div>
  );
}

function Info({label, value}: {label: string; value: string}) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PanelTitle({eyebrow, title}: {eyebrow: string; title: string}) {
  return (
    <div className="panel-title">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
    </div>
  );
}

function getTimelineDuration(timeline: TimelineItem[]) {
  return timeline.reduce((max, item) => Math.max(max, item.target_time_range[1]), 1);
}

function formatRange(range: [number, number]) {
  return `${formatSeconds(range[0])}s - ${formatSeconds(range[1])}s`;
}

function formatSeconds(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function buildDraftFromSession(session: DemoSession): WorkbenchDraft {
  return {
    productTitle: session.targetTitle,
    sellingPoints: session.sellingPoints.join("、"),
    materialBrief: session.materialBrief,
    ...editDefaults,
  };
}

function getAdjustedScript(
  baseScript: string | undefined,
  draft: WorkbenchDraft,
  variant: VariantConfig,
  segmentFunction?: SegmentFunction,
) {
  if (segmentFunction === "hook" && draft.hookRewrite.trim()) {
    return `${draft.hookRewrite.trim()} (${variant.scriptTone})`;
  }
  if (segmentFunction === "cta" && draft.ctaText.trim()) {
    return draft.ctaText.trim();
  }
  const script = baseScript || "待生成脚本";
  return `${script}·${variant.focus}`;
}

function buildVideoId(fileName: string) {
  return fileName
    .replace(/\.[^/.]+$/, "")
    .replace(/[^\w-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "sample_uploaded";
}
