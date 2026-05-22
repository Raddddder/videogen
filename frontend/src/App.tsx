import {useMemo, useRef, useState} from "react";
import type {ReactNode} from "react";
import {Button, Card, Input, Progress, Radio, Slider, Tag, Tabs, Textarea} from "tdesign-react";
import {CloudUploadIcon, PlayCircleIcon, RocketIcon} from "tdesign-icons-react";

import {runDemoPipeline, uploadSampleVideo} from "./api";
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

type ViewKey = "overview" | "analysis" | "materials" | "plan";
type VariantKey = "balanced" | "high_click" | "high_conversion";

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

const stageCards = [
  {id: "A", title: "样例视频解析", detail: "输出 Structure DNA"},
  {id: "B", title: "用户素材理解", detail: "输出 Material Library"},
  {id: "C", title: "结构迁移生成", detail: "输出 Edit Plan 与对比报告"},
  {id: "D", title: "前端展示预览", detail: "展示过程、缺口、结果视频"},
];

const variantConfigs: VariantConfig[] = [
  {
    id: "balanced",
    label: "平衡版",
    focus: "保留样例结构，优先保证素材自然衔接",
    scriptTone: "稳妥解释",
    pacing: "中速",
    packaging: "标题条 + 重点字幕",
  },
  {
    id: "high_click",
    label: "高点击版",
    focus: "强化前三秒反差和痛点刺激",
    scriptTone: "强钩子",
    pacing: "快节奏",
    packaging: "大字钩子 + 快切强调",
  },
  {
    id: "high_conversion",
    label: "高转化版",
    focus: "强化证明段和购买理由",
    scriptTone: "强信任",
    pacing: "稳中偏快",
    packaging: "卖点卡片 + CTA 强化",
  },
];

const defaultDraft: WorkbenchDraft = {
  productTitle: "空气炸锅结构迁移样例",
  sellingPoints: "少油酥脆、清洗方便、适合上班族晚餐",
  materialBrief: "已有口播、商品过程镜头、成品展示；缺少明确证明段和强 CTA 收口镜头。",
  hookRewrite: "为什么你做空气炸锅总是干柴？其实少了这一步。",
  packagingStyle: "清爽实用风：白底标题条、绿色卖点标签、关键步骤放大",
  ctaText: "评论区领取同款做法，今晚就能复刻。",
  pacingIntensity: 72,
};

export function App() {
  const [data, setData] = useState<PipelineResult>(fallbackPipeline);
  const [activeView, setActiveView] = useState<ViewKey>("overview");
  const [activeSegmentId, setActiveSegmentId] = useState(
    fallbackPipeline.edit_plan.timeline[0]?.target_segment_id ?? "",
  );
  const [loading, setLoading] = useState(false);
  const [sampleUploading, setSampleUploading] = useState(false);
  const [apiState, setApiState] = useState("mock ready");
  const [uploadedSample, setUploadedSample] = useState<SamplePreview | undefined>();
  const [activeVariant, setActiveVariant] = useState<VariantKey>("balanced");
  const [draft, setDraft] = useState<WorkbenchDraft>(defaultDraft);
  const sampleInputRef = useRef<HTMLInputElement>(null);

  const materialById = useMemo(() => {
    return new Map(data.material_library.materials.map((material) => [material.material_id, material]));
  }, [data.material_library.materials]);

  const segmentById = useMemo(() => {
    return new Map(data.structure_dna.segments.map((segment) => [segment.segment_id, segment]));
  }, [data.structure_dna.segments]);

  const totalSourceDuration = data.structure_dna.total_duration_sec;
  const totalTargetDuration = getTimelineDuration(data.edit_plan.timeline);
  const activeSession = demoSessions[0];
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
      const structureDna = await uploadSampleVideo(file, {
        projectId: data.edit_plan.project_id || "case_001",
        videoId,
      });
      setData((current) => ({
        ...current,
        structure_dna: structureDna,
        edit_plan: {
          ...current.edit_plan,
          source_structure_id: structureDna.video_id,
        },
      }));
      setUploadedSample((previous) => {
        if (previous?.videoSrc.startsWith("blob:")) {
          URL.revokeObjectURL(previous.videoSrc);
        }
        return {
          label: "Uploaded",
          videoSrc: previewUrl,
          fileName: file.name,
          durationLabel: `${formatSeconds(structureDna.total_duration_sec)}s`,
          aspectRatio: structureDna.basic_info
            ? `${structureDna.basic_info.width} x ${structureDna.basic_info.height}`
            : "uploaded",
        };
      });
      setApiState("sample analyzed");
      setActiveView("overview");
    } catch (error) {
      URL.revokeObjectURL(previewUrl);
      setApiState(error instanceof Error ? error.message : "sample upload failed");
    } finally {
      setSampleUploading(false);
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

        <Tabs
          className="view-tabs tdesign-view-tabs"
          theme="card"
          value={activeView}
          onChange={(value) => setActiveView(value as ViewKey)}
        >
          <Tabs.TabPanel label="总览" value="overview" />
          <Tabs.TabPanel label="样例分析" value="analysis" />
          <Tabs.TabPanel label="素材匹配" value="materials" />
          <Tabs.TabPanel label="方案输出" value="plan" />
        </Tabs>

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
              一站式输入样例视频和用户素材，AI 自动捕获结构、素材、缺口和生成方案。
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
            activeVariant={activeVariantConfig}
            targetTitle={targetTitle}
            resultScript={resultScript}
            materialById={materialById}
            sampleUploading={sampleUploading}
            totalSourceDuration={totalSourceDuration}
            totalTargetDuration={totalTargetDuration}
            onDraftChange={(field, value) => setDraft((current) => ({...current, [field]: value}))}
            onPickSample={() => sampleInputRef.current?.click()}
          />
        )}
        {activeView === "analysis" && (
          <AnalysisView data={data} totalDuration={totalSourceDuration} />
        )}
        {activeView === "materials" && (
          <MaterialsView data={data} activeSegmentId={activeSegmentId} setActiveSegmentId={setActiveSegmentId} />
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
      </section>
    </main>
  );
}

function OverviewView({
  data,
  session,
  sample,
  draft,
  activeVariant,
  targetTitle,
  resultScript,
  materialById,
  sampleUploading,
  totalSourceDuration,
  totalTargetDuration,
  onDraftChange,
  onPickSample,
}: {
  data: PipelineResult;
  session?: DemoSession;
  sample?: SamplePreview;
  draft: WorkbenchDraft;
  activeVariant: VariantConfig;
  targetTitle: string;
  resultScript: string;
  materialById: Map<string, Material>;
  sampleUploading: boolean;
  totalSourceDuration: number;
  totalTargetDuration: number;
  onDraftChange: (field: keyof WorkbenchDraft, value: string | number) => void;
  onPickSample: () => void;
}) {
  const report = data.comparison_report.summary;
  const firstSegment = data.structure_dna.segments[0];
  const selectedMaterials = data.edit_plan.timeline
    .map((item) => item.selected_material_id ? materialById.get(item.selected_material_id) : undefined)
    .filter((material): material is Material => Boolean(material));

  return (
    <div className="view-stack">
      <section className="migration-board">
        <Card bordered className="migration-column template-column">
          <PanelTitle eyebrow="Input 01" title="上传的模板视频" />
          <Button
            block
            icon={<CloudUploadIcon />}
            loading={sampleUploading}
            variant="outline"
            onClick={onPickSample}
          >
            {sampleUploading ? "上传分析中..." : sample?.fileName ?? "上传模板视频"}
          </Button>
          <PhonePreview tone="source" videoSrc={sample?.videoSrc}>
            <div className="phone-badge">{sample?.label ?? "Template"}</div>
            <strong>{sample?.fileName ?? data.structure_dna.video_id}</strong>
            <span>{sample?.aspectRatio ?? data.structure_dna.category ?? "product_talk"}</span>
            <p>{firstSegment?.transcript ?? "等待上传模板视频"}</p>
          </PhonePreview>
          <div className="column-metrics">
            <Info label="模板时长" value={sample?.durationLabel ?? `${formatSeconds(totalSourceDuration)}s`} />
            <Info label="画面规格" value={data.structure_dna.basic_info ? `${data.structure_dna.basic_info.width} x ${data.structure_dna.basic_info.height}` : "9:16"} />
            <Info label="镜头数量" value={String(data.structure_dna.basic_info?.shot_count ?? data.structure_dna.segments.length)} />
          </div>
          <div className="mini-timeline">
            {data.structure_dna.segments.map((segment) => (
              <span key={segment.segment_id} style={{width: `${Math.max(segment.duration_ratio ?? 0.12, 0.08) * 100}%`}}>
                {functionLabels[segment.function]}
              </span>
            ))}
          </div>
        </Card>

        <Card bordered className="migration-column script-column">
          <PanelTitle eyebrow="Analysis 02" title="AI 自动捕获" />
          <div className="script-formula">{data.structure_dna.structure_formula}</div>
          <div className="auto-capture-panel">
            <b>用户只需要提供</b>
            <div className="input-chip-row">
              {(session?.oneStopCapture.userInputs ?? ["样例视频", "用户素材"]).map((input) => (
                <span key={input}>{input}</span>
              ))}
            </div>
          </div>
          <div className="script-scroll">
            {data.structure_dna.segments.map((segment, index) => (
              <section className="script-beat" key={segment.segment_id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <b>{functionLabels[segment.function]}</b>
                  <p>{segment.transcript}</p>
                  <small>{segment.text_pattern} / {segment.packaging.subtitle_style}</small>
                </div>
              </section>
            ))}
          </div>
          <div className="creative-note">
            <b>AI 捕获后生成的创意判断</b>
            <p>{report?.main_gap ?? "先保留模板结构，再按素材强弱决定补全策略。"}</p>
            <small>{report?.main_fix ?? "用包装、文案卡片或 AIGC 镜头补齐缺口。"}</small>
          </div>
        </Card>

        <Card bordered className="migration-column result-column">
          <PanelTitle eyebrow="Output 03" title="生成的结果视频" />
          <Button block icon={<RocketIcon />} theme="primary" variant="outline">
            {session?.result.fileName ?? "生成结果视频"}
          </Button>
          <PhonePreview tone="result" videoSrc={session?.result.videoSrc}>
            <div className="phone-badge">{session?.result.label ?? "Generated"}</div>
            <strong>{targetTitle}</strong>
            <span>{activeVariant.label} / {session?.result.renderVersion ?? data.edit_plan.variant}</span>
            <p>{resultScript}</p>
          </PhonePreview>
          <div className="generation-inputs">
            <b>README 对应产物</b>
            <div className="input-chip-row">
              <span>Structure DNA</span>
              <span>Material Library</span>
              <span>Edit Plan</span>
            </div>
            <p>{session?.inputs.creativeBrief ?? "根据分析脚本和素材状态生成结果视频。"}</p>
          </div>
          <div className="capture-stack">
            {(session?.oneStopCapture.aiCaptured ?? []).map((capture) => (
              <section key={capture.module}>
                <span>{capture.module}</span>
                <div>
                  <b>{capture.title}</b>
                  <small>{capture.output}</small>
                </div>
              </section>
            ))}
          </div>
          <div className="result-stack">
            {data.edit_plan.timeline.map((item) => (
              <section key={item.target_segment_id}>
                <span className={`status-dot ${item.slot_status}`} />
                <b>{functionLabels[item.function]}</b>
                <small>{materialById.get(item.selected_material_id ?? "")?.file_name ?? item.completion_strategy}</small>
              </section>
            ))}
          </div>
        </Card>
      </section>

      <Card bordered className="panel">
        <PanelTitle eyebrow="One-stop Input" title="用户素材与商品信息" />
        <div className="input-board">
          <label className="field-stack">
            <span>商品 / 主题</span>
            <Input
              clearable
              value={draft.productTitle}
              onChange={(value) => onDraftChange("productTitle", String(value))}
            />
          </label>
          <label className="field-stack">
            <span>核心卖点</span>
            <Textarea
              autosize={{minRows: 3, maxRows: 4}}
              value={draft.sellingPoints}
              onChange={(value) => onDraftChange("sellingPoints", value)}
            />
          </label>
          <label className="field-stack">
            <span>当前素材状态</span>
            <Textarea
              autosize={{minRows: 3, maxRows: 4}}
              value={draft.materialBrief}
              onChange={(value) => onDraftChange("materialBrief", value)}
            />
          </label>
          <div className="capture-summary">
            <b>AI 需要自己捕获</b>
            <div className="input-chip-row">
              {(session?.oneStopCapture.aiCaptured ?? []).flatMap((capture) => capture.dimensions.slice(0, 2)).map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card bordered className="panel">
        <PanelTitle eyebrow="Pipeline" title="四段式演示链路" />
        <p className="pipeline-copy">
          README 里的 A/B/C/D 模块仍然保留边界；对用户来说是一站式，对系统来说是稳定 JSON 契约逐层传递。
        </p>
        <div className="stage-strip">
          {stageCards.map((stage) => (
            <article className="stage-card" key={stage.id}>
              <span>{stage.id}</span>
              <b>{stage.title}</b>
              <small>{stage.detail}</small>
            </article>
          ))}
        </div>
      </Card>
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
          <Info label="镜头数" value={info ? String(info.shot_count) : String(data.structure_dna.segments.length)} />
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
              <small>{segment.required_material_tags.join(" / ")}</small>
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

function MaterialsView({
  data,
  activeSegmentId,
  setActiveSegmentId,
}: {
  data: PipelineResult;
  activeSegmentId: string;
  setActiveSegmentId: (id: string) => void;
}) {
  return (
    <div className="panel-grid">
      <Card bordered className="panel wide">
        <PanelTitle eyebrow="Module B" title="素材标签库" />
        <div className="material-grid">
          {data.material_library.materials.map((material) => (
            <article key={material.material_id} className="material-card">
              <div className="material-head">
                <b>{material.file_name}</b>
                <span>{Math.round(material.quality_score * 100)}%</span>
              </div>
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
          ))}
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
          <PanelTitle eyebrow="Variants" title="多版本生成" />
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
              <Info label="脚本策略" value={activeVariantConfig.scriptTone} />
              <Info label="节奏策略" value={activeVariantConfig.pacing} />
              <Info label="包装策略" value={activeVariantConfig.packaging} />
            </div>
          </div>
        </Card>

        <Card bordered className="panel">
          <PanelTitle eyebrow="Human Edit" title="人工可调" />
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
  const script = baseScript || "等待生成";
  return `${script}｜${variant.focus}`;
}

function buildVideoId(fileName: string) {
  return fileName
    .replace(/\.[^/.]+$/, "")
    .replace(/[^\w-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "sample_uploaded";
}
