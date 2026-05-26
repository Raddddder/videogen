import {useMemo, useRef, useState} from "react";
import type {ReactNode} from "react";
import {Button, Card, Input, Progress, Radio, Slider, Tag, Textarea} from "tdesign-react";
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
  hook: "????",
  pain_point: "??",
  setup: "??",
  solution: "????",
  proof: "????",
  transition: "??",
  cta: "?? CTA",
};

const statusLabels: Record<SlotStatus, string> = {
  matched: "???",
  weak_match: "???",
  missing: "???",
  supplemented: "???",
};

const statusOrder: SlotStatus[] = ["matched", "weak_match", "missing", "supplemented"];

const statusThemes: Record<SlotStatus, "success" | "warning" | "danger" | "primary"> = {
  matched: "success",
  weak_match: "warning",
  missing: "danger",
  supplemented: "primary",
};

const sessionStatusLabels: Record<SessionStatus, string> = {
  ready: "???",
  running: "???",
  needs_review: "???",
};

const sessionStatusThemes: Record<SessionStatus, "success" | "warning" | "danger" | "primary"> = {
  ready: "success",
  running: "primary",
  needs_review: "warning",
};

const sessionStageLabels: Record<SessionStage, string> = {
  sample: "????",
  materials: "????",
  plan: "????",
  preview: "????",
};

const stageCards = [
  {id: "A", title: "??????", detail: "?? Structure DNA"},
  {id: "B", title: "??????", detail: "?? Material Library"},
  {id: "C", title: "??????", detail: "?? Edit Plan ?????"},
  {id: "D", title: "??????", detail: "????????????"},
];

const viewTabs: Array<{key: ViewKey; label: string}> = [
  {key: "overview", label: "??"},
  {key: "analysis", label: "????"},
  {key: "materials", label: "????"},
  {key: "plan", label: "????"},
  {key: "acceptance", label: "????"},
];

const acceptanceModules: AcceptanceModule[] = [
  {
    owner: "???",
    module: "Module A",
    title: "??????? Structure DNA",
    status: "partial",
    scoreScope: "? 15-20 ?",
    scope: ["??????", "??????", "??????", "?? / ?? / ????"],
    inputs: ["????", "AnalyzeSampleRequest", "source_uri / uploaded file"],
    outputs: ["StructureDNA", "segments[]", "basic_info", "global_features"],
    checks: ["???????????", "????????????????", "?????? schema ??"],
    testCommand: "python scripts\\validate_contracts.py",
  },
  {
    owner: "???",
    module: "Module B/C",
    title: "??????????????",
    status: "ready",
    scoreScope: "? 45-50 ?",
    scope: ["?????", "????", "????", "????", "?????"],
    inputs: ["StructureDNA", "TargetBrief", "material_uris[]", "variant"],
    outputs: ["MaterialLibrary", "EditPlan", "missing_slots[]", "comparison_report"],
    checks: ["5 ??? case ????", "???? slot_status", "??????????????"],
    testCommand: "python scripts\\run_demo_pipeline.py",
  },
  {
    owner: "???",
    module: "Module D",
    title: "????????????????",
    status: "ready",
    scoreScope: "? 30-35 ?",
    scope: ["????", "????", "??????", "?????", "??????"],
    inputs: ["PipelineResult", "demoSessions", "sample/result video assets"],
    outputs: ["TDesign ???", "????", "????", "????", "?????"],
    checks: ["5 ??????", "pipeline ????", "??????", "??????"],
    testCommand: "npm --prefix frontend run build",
  },
];

const acceptanceStatusLabels: Record<AcceptanceModule["status"], string> = {
  ready: "???",
  partial: "????",
  next: "???",
};

const acceptanceStatusThemes: Record<AcceptanceModule["status"], "success" | "warning" | "primary"> = {
  ready: "success",
  partial: "warning",
  next: "primary",
};

const variantConfigs: VariantConfig[] = [
  {
    id: "balanced",
    label: "???",
    focus: "?????????????????",
    scriptTone: "????",
    pacing: "??",
    packaging: "??? + ????",
  },
  {
    id: "high_click",
    label: "????",
    focus: "????????????",
    scriptTone: "???",
    pacing: "???",
    packaging: "???? + ????",
  },
  {
    id: "high_conversion",
    label: "????",
    focus: "??????????",
    scriptTone: "???",
    pacing: "????",
    packaging: "???? + CTA ??",
  },
];

const editDefaults = {
  hookRewrite: "??????????????????????",
  packagingStyle: "?????????????????????????",
  ctaText: "?????????????????",
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
  const sampleInputRef = useRef<HTMLInputElement>(null);

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
            <strong>????????</strong>
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
          {loading ? "???..." : "?? Demo ??"}
        </Button>

        <div className="session-panel">
          <div className="sidebar-section-title">
            <span>????</span>
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
                  <em>{session.artifacts.length} ??</em>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="view-tabs" aria-label="?????">
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
          <Score label="????" value={data.edit_plan.overall_score.structure_consistency} />
          <Score label="????" value={data.edit_plan.overall_score.material_fit} />
          <Score label="????" value={data.edit_plan.overall_score.pacing_fit} />
          <div className="readiness-meter">
            <span>?????</span>
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
              ???????????????AI ??????????????????
            </p>
          </div>
          <div className="status-strip" aria-label="??????">
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
  const sellingPoints = draft.sellingPoints.split(/[?,?]/).map((item) => item.trim()).filter(Boolean).slice(0, 3);
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
      <section className="workflow-runway" aria-label="?????">
        <button
          className={activeWorkflowStep === "input" ? "workflow-runway-step current" : "workflow-runway-step done"}
          type="button"
          onClick={() => setActiveWorkflowStep("input")}
        >
          <span>1</span>
          <div>
            <b>????</b>
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
            <b>????</b>
            <small>{matchSummary.matched} ??? / {matchSummary.weak_match + matchSummary.missing} ???</small>
          </div>
        </button>
        <button
          className={activeWorkflowStep === "output" ? "workflow-runway-step current" : "workflow-runway-step next"}
          type="button"
          onClick={() => setActiveWorkflowStep("output")}
        >
          <span>3</span>
          <div>
            <b>??</b>
            <small>{activeVariant.label}</small>
          </div>
        </button>
      </section>

      <section className="workflow-stack" aria-label="????????">
        {activeWorkflowStep === "input" && (
        <article className="workflow-card step-one is-current">
          <div className="workflow-index">
            <span>01</span>
            <b>????</b>
            <small>??????????????</small>
          </div>
          <div className="workflow-content">
            <PanelTitle eyebrow="Step 01" title="??????? Structure DNA" />
            <div className="workflow-summary-grid">
              <Info label="????" value={sample?.fileName ?? data.structure_dna.video_id} />
              <Info label="????" value={sample?.durationLabel ?? `${formatSeconds(totalSourceDuration)}s`} />
              <Info label="????" value={data.structure_dna.basic_info ? `${data.structure_dna.basic_info.width} x ${data.structure_dna.basic_info.height}` : "9:16"} />
              <Info label="????" value={String(data.structure_dna.basic_info?.shot_count ?? data.structure_dna.segments.length)} />
            </div>
            <div className="workflow-config-panel">
              <b>??????</b>
              <div className="config-grid">
                <label className="field-stack">
                  <span>?? / ??</span>
                  <Input
                    value={draft.productTitle}
                    onChange={(value) => onDraftChange("productTitle", String(value))}
                  />
                </label>
                <label className="field-stack">
                  <span>????</span>
                  <Input
                    value={draft.sellingPoints}
                    onChange={(value) => onDraftChange("sellingPoints", String(value))}
                  />
                </label>
                <label className="field-stack config-grid-wide">
                  <span>??????</span>
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
            <Button theme="primary" onClick={() => setActiveWorkflowStep("analysis")}>????????</Button>
          </div>
          <div className="workflow-media">
            <Button
              block
              icon={<CloudUploadIcon />}
              loading={sampleUploading}
              variant="outline"
              onClick={onPickSample}
            >
              {sampleUploading ? "?????..." : "??????"}
            </Button>
            <PhonePreview tone="source" videoSrc={sample?.videoSrc}>
              <div className="phone-badge">{sample?.label ?? "Template"}</div>
              <strong>{sample?.fileName ?? data.structure_dna.video_id}</strong>
              <span>{sample?.aspectRatio ?? data.structure_dna.category ?? "product_talk"}</span>
              <p>{firstSegment?.transcript ?? "????????"}</p>
            </PhonePreview>
          </div>
        </article>
        )}

        {activeWorkflowStep === "analysis" && (
        <article className="workflow-card step-two is-current">
          <div className="workflow-index">
            <span>02</span>
            <b>????</b>
            <small>??????????????</small>
          </div>
          <div className="workflow-content">
            <PanelTitle eyebrow="Step 02" title="???????????" />
            <div className="script-formula">{data.structure_dna.structure_formula}</div>
            <div className="auto-capture-panel">
              <b>????????</b>
              <div className="input-chip-row">
                <span>Structure DNA</span>
                <span>Material Library</span>
                <span>Slot Mapping</span>
                <span>Gap Report</span>
              </div>
            </div>
            <div className="workflow-config-panel">
              <b>??????</b>
              <div className="config-grid">
                <label className="field-stack">
                  <span>????</span>
                  <Radio.Group
                    options={[
                      {label: "??", value: "fast"},
                      {label: "??", value: "balanced"},
                      {label: "??", value: "deep"},
                    ]}
                    theme="button"
                    value={analysisDepth}
                    variant="default-filled"
                    onChange={(value) => setAnalysisDepth(String(value))}
                  />
                </label>
                <label className="field-stack">
                  <span>????? {gapStrictness}</span>
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
                  <span>????</span>
                  <div className="toggle-chip-row">
                    {[
                      ["hook", "Hook"],
                      ["pacing", "??"],
                      ["proof", "??"],
                      ["gap", "??"],
                      ["visual", "??"],
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
              <b>??????</b>
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
                    <small>{segment.text_pattern} / {segment.packaging.subtitle_style}</small>
                  </div>
                </section>
              ))}
            </div>
          </div>
          <div className="workflow-side">
            <div className="workflow-session-card">
              <span>????</span>
              <b>{session?.name} / {session?.caseId}</b>
              <div className="input-chip-row">
                <Tag shape="round" theme={session ? sessionStatusThemes[session.status] : "primary"} variant="light">
                  {session ? sessionStatusLabels[session.status] : "???"}
                </Tag>
                <span>{session ? sessionStageLabels[session.stage] : "????"}</span>
              </div>
              <div className="input-chip-row">
                {sellingPoints.map((point) => <span key={point}>{point}</span>)}
              </div>
              <small>{session?.description ?? "????????????????????"}</small>
            </div>
            <div className="creative-note">
              <b>????</b>
              <p>{report?.main_gap ?? "?????????????????????"}</p>
            </div>
            <div className="workflow-actions">
              <Button variant="outline" onClick={() => setActiveWorkflowStep("input")}>??????</Button>
              <Button variant="outline" onClick={onOpenMaterials}>????</Button>
              <Button theme="primary" onClick={() => setActiveWorkflowStep("output")}>??????</Button>
            </div>
          </div>
        </article>
        )}

        {activeWorkflowStep === "output" && (
        <article className="workflow-card step-three is-current">
          <div className="workflow-index">
            <span>03</span>
            <b>??</b>
            <small>???????AIGC ?????</small>
          </div>
          <div className="workflow-content">
            <PanelTitle eyebrow="Step 03" title="??????????" />
            <div className="workflow-config-panel">
              <b>????</b>
              <div className="config-grid">
                <label className="field-stack config-grid-wide">
                  <span>????</span>
                  <Radio.Group
                    options={variantConfigs.map((variant) => ({label: variant.label, value: variant.id}))}
                    theme="button"
                    value={activeVariantKey}
                    variant="default-filled"
                    onChange={(value) => onVariantChange(value as VariantKey)}
                  />
                </label>
                <label className="field-stack config-grid-wide">
                  <span>Hook ??</span>
                  <Textarea
                    autosize={{minRows: 2, maxRows: 3}}
                    value={draft.hookRewrite}
                    onChange={(value) => onDraftChange("hookRewrite", value)}
                  />
                </label>
                <label className="field-stack">
                  <span>????</span>
                  <Input
                    value={draft.packagingStyle}
                    onChange={(value) => onDraftChange("packagingStyle", String(value))}
                  />
                </label>
                <label className="field-stack">
                  <span>CTA ??</span>
                  <Input
                    value={draft.ctaText}
                    onChange={(value) => onDraftChange("ctaText", String(value))}
                  />
                </label>
                <label className="field-stack">
                  <span>???? {draft.pacingIntensity}</span>
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
                  <span>AIGC ???? {aigcAssist}</span>
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
              <Info label="????" value={targetTitle} />
              <Info label="????" value={activeVariant.label} />
              <Info label="????" value={activeVariant.pacing} />
              <Info label="????" value={`${readyArtifacts}/${session?.artifacts.length ?? 4} ???`} />
            </div>
            <div className="generation-inputs">
              <b>????</b>
              <div className="input-chip-row">
                <span>Structure DNA</span>
                <span>Material Library</span>
                <span>Edit Plan</span>
                <span>AIGC ??</span>
              </div>
              <p>{firstGap ? firstGap.suggested_fix : session?.inputs.creativeBrief ?? "??????????????????"}</p>
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
              {session?.result.fileName ?? "??????"}
            </Button>
            <PhonePreview tone="result" videoSrc={session?.result.videoSrc}>
              <div className="phone-badge">{session?.result.label ?? "Generated"}</div>
              <strong>{targetTitle}</strong>
              <span>{activeVariant.label} / {session?.result.renderVersion ?? data.edit_plan.variant}</span>
              <p>{resultScript}</p>
            </PhonePreview>
          </div>
          <div className="workflow-actions workflow-actions-wide">
            <Button variant="outline" onClick={() => setActiveWorkflowStep("analysis")}>??????</Button>
            <Button theme="primary" onClick={onOpenPlan}>??????</Button>
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
        <PanelTitle eyebrow="Module A" title="???? DNA" />
        <div className="formula">{data.structure_dna.structure_formula}</div>
        <Timeline totalDuration={totalDuration} items={data.structure_dna.segments.map((segment) => ({
          id: segment.segment_id,
          label: functionLabels[segment.function],
          range: segment.time_range,
          status: "matched" as SlotStatus,
        }))} />
      </Card>

      <Card bordered className="panel">
        <PanelTitle eyebrow="Source" title="??????" />
        <div className="info-list">
          <Info label="???" value={info ? `${info.width} x ${info.height}` : "mock"} />
          <Info label="??" value={info ? `${info.fps} fps` : "mock"} />
          <Info label="???" value={info ? String(info.shot_count) : String(data.structure_dna.segments.length)} />
          <Info label="??" value={info?.has_speech === false ? "?" : "?"} />
        </div>
      </Card>

      <Card bordered className="panel wide">
        <PanelTitle eyebrow="Segments" title="????" />
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
        <PanelTitle eyebrow="Pacing" title="????" />
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
        <PanelTitle eyebrow="Module B" title="?????" />
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
                <span>???? {material.crop_risk}</span>
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
        <PanelTitle eyebrow="Slots" title="????" />
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
        <PanelTitle eyebrow="Gaps" title="????" />
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
          <PanelTitle eyebrow="Module C" title="??????" />
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
          <PanelTitle eyebrow="Edit Plan" title="??????" />
          <div className="plan-list">
            {data.edit_plan.timeline.map((item) => (
              <PlanRow key={item.target_segment_id} item={item} onSelect={setActiveSegmentId} />
            ))}
          </div>
        </Card>
      </div>

      <div className="plan-side">
        <Card bordered className="panel">
          <PanelTitle eyebrow="Variants" title="?????" />
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
              <Info label="????" value={activeVariantConfig.scriptTone} />
              <Info label="????" value={activeVariantConfig.pacing} />
              <Info label="????" value={activeVariantConfig.packaging} />
            </div>
          </div>
        </Card>

        <Card bordered className="panel">
          <PanelTitle eyebrow="Human Edit" title="????" />
          <div className="edit-control">
            <label className="field-stack">
              <span>Hook ??</span>
              <Textarea
                autosize={{minRows: 2, maxRows: 3}}
                value={draft.hookRewrite}
                onChange={(value) => onDraftChange("hookRewrite", value)}
              />
            </label>
            <label className="field-stack">
              <span>????</span>
              <Input
                value={draft.packagingStyle}
                onChange={(value) => onDraftChange("packagingStyle", String(value))}
              />
            </label>
            <label className="field-stack">
              <span>CTA ??</span>
              <Input
                value={draft.ctaText}
                onChange={(value) => onDraftChange("ctaText", String(value))}
              />
            </label>
            <label className="field-stack">
              <span>???? {draft.pacingIntensity}</span>
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
          <PanelTitle eyebrow="Inspector" title="????" />
          {activeTimelineItem && (
            <div className="inspector">
              <Tag shape="round" theme={statusThemes[activeTimelineItem.slot_status]} variant="light">
                {statusLabels[activeTimelineItem.slot_status]}
              </Tag>
              <h2>{functionLabels[activeTimelineItem.function]}</h2>
              <p>{getAdjustedScript(activeTimelineItem.script, draft, activeVariantConfig, activeTimelineItem.function)}</p>
              <Info label="????" value={activeSourceSegment?.transcript ?? "?"} />
              <Info label="????" value={activeMaterial?.file_name ?? "????"} />
              <Info label="????" value={formatRange(activeTimelineItem.target_time_range)} />
              <Info label="????" value={`${activeTimelineItem.completion_strategy} / ${activeVariantConfig.packaging}`} />
            </div>
          )}
        </Card>

        <Card bordered className="panel">
          <PanelTitle eyebrow="Exports" title="?????" />
          <div className="export-list">
            {Object.entries(data.edit_plan.exports).map(([key, value]) => (
              <Info key={key} label={key.replace(/_/g, " ")} value={value ?? "???"} />
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
          <span>?????</span>
          <strong>{modules.length}</strong>
          <small>A / B+C / D ????</small>
        </article>
        <article>
          <span>?? case</span>
          <strong>{sessionCount}</strong>
          <small>???????????????</small>
        </article>
        <article>
          <span>????</span>
          <strong>{statusCounts.matched + statusCounts.supplemented}/{Object.values(statusCounts).reduce((sum, value) => sum + value, 0)}</strong>
          <small>matched + supplemented</small>
        </article>
        <article>
          <span>?????</span>
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

            <AcceptanceList title="????" items={item.scope} />
            <AcceptanceList title="??" items={item.inputs} />
            <AcceptanceList title="??" items={item.outputs} />
            <AcceptanceList title="????" items={item.checks} />

            <div className="acceptance-command">
              <span>????</span>
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
    sellingPoints: session.sellingPoints.join("?"),
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
  const script = baseScript || "????";
  return `${script}?${variant.focus}`;
}

function buildVideoId(fileName: string) {
  return fileName
    .replace(/\.[^/.]+$/, "")
    .replace(/[^\w-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "sample_uploaded";
}
