import {useEffect, useMemo, useRef, useState} from "react";
import {Button, Card, Input, Progress, Radio, Select, Slider, Tag, Textarea} from "tdesign-react";
import {CloudUploadIcon, PlayCircleIcon, RocketIcon} from "tdesign-icons-react";

import {assetUrl, compareVariants, fillGaps, getProject, inferBrief, interpretEdits, listProjects, regeneratePlan, renderPreview, runDemoPipeline, uploadMaterials, uploadSamplePipeline} from "./api";
import type {BriefInference, VariantComparison} from "./api";
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

type ViewKey = "overview" | "analysis" | "materials" | "plan" | "compare" | "acceptance";
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
  nlInstruction: string;
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
  {key: "compare", label: "版本对比"},
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
  nlInstruction: "",
};

const defaultDraft = buildDraftFromSession(demoSessions[0]);
const initialPipeline = buildEmptyPipeline(demoSessions[0]);

export function App() {
  const [sessions, setSessions] = useState<DemoSession[]>(demoSessions);
  const [data, setData] = useState<PipelineResult>(initialPipeline);
  const [activeView, setActiveView] = useState<ViewKey>("analysis");
  const [activeSessionId, setActiveSessionId] = useState(demoSessions[0].id);
  const [sessionResults, setSessionResults] = useState<Record<string, PipelineResult>>({});
  const [uploadedSamples, setUploadedSamples] = useState<Record<string, SamplePreview>>({});
  const [renderedPreviews, setRenderedPreviews] = useState<Record<string, string>>({});
  const [activeSegmentId, setActiveSegmentId] = useState(
    initialPipeline.edit_plan.timeline[0]?.target_segment_id ?? "",
  );
  const [loading, setLoading] = useState(false);
  const [sampleUploading, setSampleUploading] = useState(false);
  const [apiState, setApiState] = useState("示例会话 ready");
  const [activeVariant, setActiveVariant] = useState<VariantKey>(demoSessions[0].variant);
  const [draft, setDraft] = useState<WorkbenchDraft>(defaultDraft);
  const [briefInferring, setBriefInferring] = useState(false);
  const [materialUploading, setMaterialUploading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [filling, setFilling] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const sampleInputRef = useRef<HTMLInputElement>(null);
  const materialInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    listProjects()
      .then(async (projects) => {
        const details = await Promise.all(projects.map((project) => getProject(project.project_id)));
        if (!alive || details.length === 0) {
          return;
        }
        const restoredSessions = details.map((project, index) => (
          buildSessionFromStoredProject(project.pipeline, project.preview_url ?? undefined, index + 2)
        ));
        setSessions([demoSessions[0], ...restoredSessions]);
        setSessionResults((current) => {
          const next = {...current};
          details.forEach((project) => {
            next[`session_project_${project.project_id}`] = project.pipeline;
          });
          return next;
        });
        setRenderedPreviews((current) => {
          const next = {...current};
          details.forEach((project) => {
            if (project.preview_url) {
              next[`session_project_${project.project_id}`] = assetUrl(project.preview_url) ?? project.preview_url;
            }
          });
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const materialById = useMemo(() => {
    return new Map(data.material_library.materials.map((material) => [material.material_id, material]));
  }, [data.material_library.materials]);

  const segmentById = useMemo(() => {
    return new Map(data.structure_dna.segments.map((segment) => [segment.segment_id, segment]));
  }, [data.structure_dna.segments]);

  const totalSourceDuration = data.structure_dna.total_duration_sec;
  const totalTargetDuration = getTimelineDuration(data.edit_plan.timeline);
  const hasAnalyzedPlan = data.edit_plan.timeline.length > 0;
  const availableViewTabs = hasAnalyzedPlan ? viewTabs : viewTabs.filter((item) => item.key !== "overview");
  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? sessions[0];
  const currentSample = uploadedSamples[activeSessionId] ?? activeSession?.sample;
  const activeVariantConfig = variantConfigs.find((variant) => variant.id === activeVariant) ?? variantConfigs[0];
  const targetTitle = draft.productTitle.trim() || activeSession?.targetTitle || data.edit_plan.target_title;
  const renderedPreviewUrl = renderedPreviews[activeSessionId] ?? (
    data.edit_plan.exports.preview_video_path ? assetUrl(`/${data.edit_plan.exports.preview_video_path}`) : undefined
  );
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
    const snapshot = sessionResults[session.id];
    if (snapshot) {
      setData(snapshot);
      setActiveSegmentId(snapshot.edit_plan.timeline[0]?.target_segment_id ?? "");
      setActiveView(snapshot.edit_plan.timeline.length ? "overview" : "analysis");
    } else {
      const empty = buildEmptyPipeline(session);
      setData(empty);
      setActiveSegmentId("");
      setActiveView("analysis");
    }
    setApiState(`${session.caseId} ready`);
  };

  const handleCreateSession = () => {
    const id = `session_user_${Date.now()}`;
    const nextIndex = sessions.length + 1;
    const session = buildDraftSession(id, nextIndex);
    setSessions((current) => [session, ...current]);
    setActiveSessionId(id);
    setActiveVariant(session.variant);
    setDraft(buildDraftFromSession(session));
    setData(buildEmptyPipeline(session));
    setActiveSegmentId("");
    setActiveView("analysis");
    setApiState("新会话待上传分析");
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
      setSessionResults((current) => ({...current, [activeSessionId]: result}));
      setActiveSegmentId(result.edit_plan.timeline[0]?.target_segment_id ?? "");
      setApiState("backend synced");
    } catch (error) {
      setApiState(error instanceof Error ? error.message : "backend unavailable");
    } finally {
      setLoading(false);
    }
  };

  const applyBriefInference = (
    inferred: BriefInference,
    sessionId: string,
    baseData: PipelineResult = data,
  ): PipelineResult => {
    const nextData: PipelineResult = {
      ...baseData,
      edit_plan: {
        ...baseData.edit_plan,
        target_title: inferred.title,
      },
      material_library: {
        ...baseData.material_library,
        target: {
          title: inferred.title,
          category: inferred.category || baseData.material_library.target?.category || baseData.structure_dna.category || "product_talk",
          selling_points: inferred.selling_points,
        },
      },
    };

    setData(nextData);
    setSessionResults((current) => ({...current, [sessionId]: nextData}));
    setDraft((current) => ({
      ...current,
      productTitle: inferred.title,
      sellingPoints: inferred.selling_points.join("、"),
      materialBrief: inferred.material_brief,
    }));
    setSessions((current) => current.map((session) => (
      session.id === sessionId
        ? {
            ...session,
            targetTitle: inferred.title,
            sellingPoints: inferred.selling_points,
            materialBrief: inferred.material_brief,
            description: inferred.reason || session.description,
          }
        : session
    )));
    return nextData;
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
        targetTitle,
        targetCategory: data.material_library.target?.category,
        sellingPoints: draft.sellingPoints.split(/[、，,]/).map((item) => item.trim()).filter(Boolean),
        variant: data.edit_plan.variant,
      });
      const targetSessionId = sessions.some((session) => session.id === activeSessionId && session.id.startsWith("session_user_"))
        ? activeSessionId
        : `session_user_${Date.now()}`;
      const nextSession = buildSessionFromPipeline(result, file, targetSessionId, sessions.length + 1, activeVariant);
      setData(result);
      setSessions((current) => {
        const exists = current.some((session) => session.id === targetSessionId);
        if (exists) {
          return current.map((session) => session.id === targetSessionId ? nextSession : session);
        }
        return [nextSession, ...current];
      });
      setActiveSessionId(targetSessionId);
      setSessionResults((current) => ({...current, [targetSessionId]: result}));
      setActiveSegmentId(result.edit_plan.timeline[0]?.target_segment_id ?? "");
      setUploadedSamples((previous) => {
        const oldPreview = previous[targetSessionId];
        if (oldPreview?.videoSrc.startsWith("blob:")) {
          URL.revokeObjectURL(oldPreview.videoSrc);
        }
        return {
          ...previous,
          [targetSessionId]: {
          label: "Uploaded",
          videoSrc: previewUrl,
          fileName: file.name,
          durationLabel: `${formatSeconds(result.structure_dna.total_duration_sec)}s`,
          aspectRatio: result.structure_dna.basic_info
            ? `${result.structure_dna.basic_info.width} x ${result.structure_dna.basic_info.height}`
            : "uploaded",
          },
        };
      });
      setApiState("sample pipeline synced, inferring brief");
      setActiveView("analysis");
      try {
        const inferred = await inferBrief(result);
        applyBriefInference(inferred, targetSessionId, result);
        setApiState(`brief inferred (${Math.round(inferred.confidence * 100)})`);
      } catch (briefError) {
        setDraft(buildDraftFromSession(nextSession));
        setApiState(
          briefError instanceof Error
            ? `sample synced, ${briefError.message}`
            : "sample synced, brief infer failed",
        );
      }
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
      setData((current) => {
        const next = {...current, material_library: library};
        setSessionResults((snapshots) => ({...snapshots, [activeSessionId]: next}));
        return next;
      });
      setApiState(`materials analyzed (${library.materials.length})`);
      setActiveView("materials");
    } catch (error) {
      setApiState(error instanceof Error ? error.message : "material upload failed");
    } finally {
      setMaterialUploading(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setApiState("regenerating plan");
    try {
      const result = await regeneratePlan(
        data,
        {
          hook_rewrite: draft.hookRewrite,
          cta_text: draft.ctaText,
          packaging_style: draft.packagingStyle,
          pacing_intensity: draft.pacingIntensity,
          selling_points: draft.sellingPoints.split(/[、，,]/).map((s) => s.trim()).filter(Boolean),
        },
        activeVariant,
      );
      setData(result);
      setActiveSegmentId(result.edit_plan.timeline[0]?.target_segment_id ?? "");
      setApiState("plan regenerated");
    } catch (error) {
      setApiState(error instanceof Error ? error.message : "regenerate failed");
    } finally {
      setRegenerating(false);
    }
  };

  const handleFillGaps = async () => {
    setFilling(true);
    setApiState("AIGC 补全缺口中");
    try {
      const result = await fillGaps(data);
      setData(result);
      setSessionResults((current) => ({...current, [activeSessionId]: result}));
      setApiState("缺口已由 AIGC 补全");
    } catch (error) {
      setApiState(error instanceof Error ? error.message : "AIGC fill failed");
    } finally {
      setFilling(false);
    }
  };

  const handleInferBrief = async () => {
    setBriefInferring(true);
    setApiState("AI 生成目标信息中");
    try {
      const inferred = await inferBrief(data);
      applyBriefInference(inferred, activeSessionId);
      setApiState(`brief inferred (${Math.round(inferred.confidence * 100)})`);
    } catch (error) {
      setApiState(error instanceof Error ? error.message : "brief infer failed");
    } finally {
      setBriefInferring(false);
    }
  };

  const handleInterpret = async () => {
    if (!draft.nlInstruction.trim()) {
      return;
    }
    setInterpreting(true);
    setApiState("AI 解析改片指令中");
    try {
      const edits = await interpretEdits(draft.nlInstruction, targetTitle);
      setDraft((current) => ({
        ...current,
        hookRewrite: edits.hook_rewrite ?? current.hookRewrite,
        ctaText: edits.cta_text ?? current.ctaText,
        packagingStyle: edits.packaging_style ?? current.packagingStyle,
        pacingIntensity: edits.pacing_intensity ?? current.pacingIntensity,
        sellingPoints: edits.selling_points?.join("、") ?? current.sellingPoints,
      }));
      setApiState("AI 已解析，可微调后重生成");
    } catch (error) {
      setApiState(error instanceof Error ? error.message : "interpret failed");
    } finally {
      setInterpreting(false);
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

        <div className="session-panel">
          <div className="sidebar-section-title">
            <span>会话管理</span>
            <strong>{sessions.length}</strong>
          </div>
          <Button block className="session-create-button" theme="primary" onClick={handleCreateSession}>
            新建会话
          </Button>
          <div className="session-list">
            {sessions.map((session) => (
              <button
                key={session.id}
                className={session.id === activeSessionId ? "session-card active" : "session-card"}
                type="button"
                onClick={() => handleSelectSession(session)}
              >
                <span>{session.name}</span>
                <b>{session.targetTitle}</b>
                <small>{sessionStageLabels[session.stage]}</small>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div className="workspace-heading">
            <div>
              <p className="eyebrow">Module D Workspace</p>
              <h1>{targetTitle}</h1>
              <p className="workspace-subtitle">
                上传样例视频与用户素材，AI 自动完成结构拆解、素材匹配与方案生成。
              </p>
            </div>
            <Button
              className="primary-action workspace-demo-action"
              icon={<PlayCircleIcon />}
              loading={loading}
              theme="primary"
              type="button"
              onClick={handleRun}
            >
              {loading ? "生成中..." : "跑通 Demo 管线"}
            </Button>
          </div>

          <div className="workspace-topbar">
            <div className="flow-select-wrap">
              <span>当前流程</span>
              <Select
                className="flow-select"
                options={availableViewTabs.map((item) => ({label: item.label, value: item.key}))}
                value={activeView}
                onChange={(value) => setActiveView(value as ViewKey)}
              />
            </div>
            {hasAnalyzedPlan ? (
              <div className="status-strip" aria-label="槽位状态统计">
                {statusOrder.map((status) => (
                  <Tag key={status} shape="round" theme={statusThemes[status]} variant="light">
                    {statusLabels[status]} {statusCounts[status]}
                  </Tag>
                ))}
              </div>
            ) : (
              <div className="start-state-strip" aria-label="开始状态">
                <Tag shape="round" theme="primary" variant="light">等待样例视频</Tag>
                <span>先上传样例，AI 会生成 Structure DNA，然后再进入素材匹配。</span>
              </div>
            )}
          </div>

          {hasAnalyzedPlan ? (
            <div className="workspace-metrics">
              <Score label="结构一致" value={data.edit_plan.overall_score.structure_consistency} />
              <Score label="素材匹配" value={data.edit_plan.overall_score.material_fit} />
              <Score label="节奏匹配" value={data.edit_plan.overall_score.pacing_fit} />
              <div className="readiness-meter">
                <span>演示可用度</span>
                <strong>{readiness}</strong>
                <Progress color="#0f766e" label={false} percentage={readiness} size="small" theme="line" />
              </div>
            </div>
          ) : (
            <div className="workspace-start-guide">
              <section>
                <b>1 上传样例</b>
                <small>先让 AI 看懂模板视频</small>
              </section>
              <section>
                <b>2 复核结构</b>
                <small>确认 hook、痛点、铺垫、CTA 等槽位</small>
              </section>
              <section>
                <b>3 匹配素材</b>
                <small>再把你的素材放进对应槽位</small>
              </section>
            </div>
          )}
        </header>

        {activeView === "overview" && (
          <OverviewFlowView
            data={data}
            session={activeSession}
            sample={currentSample}
            draft={draft}
            activeVariantKey={activeVariant}
            activeVariant={activeVariantConfig}
            targetTitle={targetTitle}
            resultScript={resultScript}
            activeSegmentId={activeSegmentId}
            setActiveSegmentId={setActiveSegmentId}
            sampleUploading={sampleUploading}
            briefInferring={briefInferring}
            totalSourceDuration={totalSourceDuration}
            onDraftChange={(field, value) => setDraft((current) => ({...current, [field]: value}))}
            onInferBrief={handleInferBrief}
            onOpenAnalysis={() => setActiveView("analysis")}
            onOpenAcceptance={() => setActiveView("acceptance")}
            onOpenCompare={() => setActiveView("compare")}
            onOpenMaterials={() => setActiveView("materials")}
            onOpenPlan={() => setActiveView("plan")}
            onPickSample={() => sampleInputRef.current?.click()}
            onVariantChange={setActiveVariant}
          />
        )}
        {activeView === "analysis" && (
          <AnalysisView
            data={data}
            sample={currentSample}
            totalDuration={totalSourceDuration}
            sampleUploading={sampleUploading}
            onPickSample={() => sampleInputRef.current?.click()}
          />
        )}
        {activeView === "materials" && (
          <MaterialsView
            data={data}
            activeSegmentId={activeSegmentId}
            setActiveSegmentId={setActiveSegmentId}
            materialUploading={materialUploading}
            onUploadMaterials={() => materialInputRef.current?.click()}
            onFillGaps={handleFillGaps}
            filling={filling}
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
            onRegenerate={handleRegenerate}
            regenerating={regenerating}
            onInterpret={handleInterpret}
            interpreting={interpreting}
            renderedPreviewUrl={renderedPreviewUrl}
            onRendered={(url) => {
              setRenderedPreviews((current) => ({...current, [activeSessionId]: url}));
              setSessions((current) => current.map((session) => (
                session.id === activeSessionId
                  ? {
                      ...session,
                      stage: "preview",
                      status: "ready",
                      result: {...session.result, videoSrc: url, fileName: "preview.mp4", renderVersion: activeVariant},
                      artifacts: session.artifacts.map((artifact) => (
                        artifact.type === "video" ? {...artifact, state: "ready"} : artifact
                      )),
                    }
                  : session
              )));
            }}
          />
        )}
        {activeView === "compare" && (
          <CompareView data={data} onState={setApiState} />
        )}
        {activeView === "acceptance" && (
          <AcceptanceView
            modules={acceptanceModules}
            sessionCount={sessions.length}
            statusCounts={statusCounts}
            readiness={readiness}
          />
        )}
      </section>
    </main>
  );
}

function OverviewFlowView({
  data,
  session,
  sample,
  draft,
  activeVariantKey,
  activeVariant,
  targetTitle,
  resultScript,
  activeSegmentId,
  setActiveSegmentId,
  sampleUploading,
  briefInferring,
  totalSourceDuration,
  onDraftChange,
  onInferBrief,
  onOpenAnalysis,
  onOpenAcceptance,
  onOpenCompare,
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
  activeSegmentId: string;
  setActiveSegmentId: (id: string) => void;
  sampleUploading: boolean;
  briefInferring: boolean;
  totalSourceDuration: number;
  onDraftChange: (field: keyof WorkbenchDraft, value: string | number) => void;
  onInferBrief: () => void;
  onOpenAnalysis: () => void;
  onOpenAcceptance: () => void;
  onOpenCompare: () => void;
  onOpenMaterials: () => void;
  onOpenPlan: () => void;
  onPickSample: () => void;
  onVariantChange: (variant: VariantKey) => void;
}) {
  const firstSegment = data.structure_dna.segments[0];
  const firstGap = data.edit_plan.missing_slots[0];
  const hasPlan = data.edit_plan.timeline.length > 0;
  const readyArtifacts = hasPlan ? session?.artifacts.filter((artifact) => artifact.state === "ready").length ?? 0 : 0;
  const analysisHandoff = data.structure_dna.segments.slice(0, 4).map((segment) => ({
    id: segment.segment_id,
    label: functionLabels[segment.function],
    evidence: segment.analysis_reason ?? segment.visual_cue ?? segment.transcript,
    tags: segment.required_material_tags.slice(0, 3),
  }));
  const matchSummary = data.edit_plan.timeline.reduce(
    (acc, item) => {
      acc[item.slot_status] += 1;
      return acc;
    },
    {matched: 0, weak_match: 0, missing: 0, supplemented: 0} as Record<SlotStatus, number>,
  );
  const [editorTool, setEditorTool] = useState<EditorTool>("source_structure");

  const stageCards: Array<{key: ViewKey; label: string; detail: string; action: () => void}> = [
    {key: "analysis", label: "样例分析", detail: hasPlan ? `${data.structure_dna.segments.length} 个结构槽位` : "待上传样例视频", action: onOpenAnalysis},
    {key: "materials", label: "素材匹配", detail: hasPlan ? `${matchSummary.matched + matchSummary.supplemented} 已就绪 / ${matchSummary.weak_match + matchSummary.missing} 待处理` : "待上传用户素材", action: onOpenMaterials},
    {key: "plan", label: "方案输出", detail: hasPlan ? `${activeVariant.label} · ${activeVariant.pacing}` : "待生成方案", action: onOpenPlan},
    {key: "compare", label: "版本对比", detail: hasPlan ? "平衡 / 高点击 / 高转化" : "待生成后对比", action: onOpenCompare},
    {key: "acceptance", label: "验收清单", detail: hasPlan ? `${readyArtifacts}/${session?.artifacts.length ?? 4} 产物就绪` : "待产物生成", action: onOpenAcceptance},
  ];

  return (
    <div className="panel-grid overview-flow-grid">
      <Card bordered className="panel wide">
        <div className="material-head-row">
          <PanelTitle eyebrow="Overview" title="会话总览" />
          <Tag shape="round" theme={session ? sessionStatusThemes[session.status] : "primary"} variant="light">
            {session ? sessionStatusLabels[session.status] : "可演示"}
          </Tag>
        </div>
        <div className="workflow-summary-grid">
          <Info label="样例文件" value={sample?.fileName ?? data.structure_dna.video_id} />
          <Info label="模板时长" value={sample?.durationLabel ?? `${formatSeconds(totalSourceDuration)}s`} />
          <Info label="画面规格" value={data.structure_dna.basic_info ? `${data.structure_dna.basic_info.width} x ${data.structure_dna.basic_info.height}` : "待解析"} />
          <Info label="当前版本" value={activeVariant.label} />
        </div>
        <div className="mini-timeline">
          {data.structure_dna.segments.map((segment) => (
            <span key={segment.segment_id} style={{width: `${Math.max(segment.duration_ratio ?? 0.12, 0.08) * 100}%`}}>
              {functionLabels[segment.function]}
            </span>
          ))}
        </div>
        <div className="overview-stage-grid" aria-label="主流程阶段">
          {stageCards.map((stage) => (
            <button key={stage.key} type="button" onClick={stage.action}>
              <b>{stage.label}</b>
              <small>{stage.detail}</small>
            </button>
          ))}
        </div>
      </Card>

      <Card bordered className="panel">
        <div className="config-panel-head">
          <PanelTitle eyebrow="Brief" title="目标信息配置" />
          <Button loading={briefInferring} size="small" variant="outline" onClick={onInferBrief}>
            {briefInferring ? "AI 生成中" : "AI 生成"}
          </Button>
        </div>
        <div className="edit-control">
          <label className="field-stack">
            <span>标题 / 主题</span>
            <Input value={draft.productTitle} onChange={(value) => onDraftChange("productTitle", String(value))} />
          </label>
          <label className="field-stack">
            <span>核心卖点</span>
            <Input value={draft.sellingPoints} onChange={(value) => onDraftChange("sellingPoints", String(value))} />
          </label>
          <label className="field-stack">
            <span>素材情况说明</span>
            <Textarea
              autosize={{minRows: 3, maxRows: 4}}
              value={draft.materialBrief}
              onChange={(value) => onDraftChange("materialBrief", value)}
            />
          </label>
        </div>
      </Card>

      <Card bordered className="panel wide">
        <div className="material-head-row">
          <PanelTitle eyebrow="Template Editor" title="样例视频编辑器" />
          <Button icon={<CloudUploadIcon />} loading={sampleUploading} theme="primary" variant="outline" onClick={onPickSample}>
            {sampleUploading ? "解析样例中..." : "上传样例视频"}
          </Button>
        </div>
        <VideoEditorPreview
          caption={firstSegment?.transcript ?? "等待上传样例视频"}
          currentTool={editorTool}
          meta={sample?.aspectRatio ?? data.structure_dna.category ?? "product_talk"}
          onOpenPanel={onOpenAnalysis}
          onSelectTool={setEditorTool}
          onSelectTrack={(id) => {
            const linked = data.edit_plan.timeline.find((item) => item.segment_id === id);
            setActiveSegmentId(linked?.target_segment_id ?? id);
          }}
          onUseTool={() => onOpenAnalysis()}
          title={sample?.fileName ?? data.structure_dna.video_id}
          tools={sourceEditorTools}
          tone="source"
          tracks={data.structure_dna.segments.map((segment) => ({
            id: segment.segment_id,
            label: functionLabels[segment.function],
            status: "matched",
            selected: data.edit_plan.timeline.find((item) => item.target_segment_id === activeSegmentId)?.segment_id === segment.segment_id,
            detail: segment.transcript,
            weight: segment.duration_ratio ?? 0.12,
          }))}
          videoSrc={sample?.videoSrc}
        />
      </Card>

      <Card bordered className="panel">
        <PanelTitle eyebrow="Why" title="样例分析的作用" />
        <p className="workflow-role-copy">
          这一步不是最终报告，而是把模板视频拆成后续可执行的结构槽位。素材匹配、方案生成和验收都会消费这里产出的 Structure DNA。
        </p>
        <div className="workflow-role-flow" aria-label="样例分析在工作流中的作用">
          <section>
            <span className="status-dot matched" />
            <b>输入</b>
            <small>样例视频、口播、画面节奏</small>
          </section>
          <section>
            <span className="status-dot supplemented" />
            <b>AI 捕获</b>
            <small>{data.structure_dna.structure_formula || "等待解析结构公式"}</small>
          </section>
          <section>
            <span className={`status-dot ${firstGap ? "missing" : "matched"}`} />
            <b>输出</b>
            <small>{firstGap?.suggested_fix ?? "结构槽位已准备给素材匹配使用"}</small>
          </section>
        </div>
        <div className="handoff-list">
          {analysisHandoff.map((item) => (
            <article key={item.id}>
              <b>{item.label}</b>
              <small>{item.evidence}</small>
              <div className="tag-row">
                {item.tags.map((tag) => <span key={tag}>{tag}</span>)}
              </div>
            </article>
          ))}
        </div>
        <div className="script-handoff-preview">
          <b>生成脚本会继承</b>
          <small>{resultScript}</small>
        </div>
        <div className="workflow-actions">
          <Button theme="primary" onClick={onOpenAnalysis}>复核 Structure DNA</Button>
          <Button variant="outline" onClick={onOpenMaterials}>拿这些槽位去匹配素材</Button>
        </div>
      </Card>
    </div>
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
  activeSegmentId,
  setActiveSegmentId,
  sampleUploading,
  briefInferring,
  totalSourceDuration,
  onDraftChange,
  onFillGaps,
  onInferBrief,
  onOpenMaterials,
  onOpenPlan,
  onPickMaterials,
  onPickSample,
  onRegenerate,
  onRenderPreview,
  onVariantChange,
  filling,
  regenerating,
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
  activeSegmentId: string;
  setActiveSegmentId: (id: string) => void;
  sampleUploading: boolean;
  briefInferring: boolean;
  totalSourceDuration: number;
  onDraftChange: (field: keyof WorkbenchDraft, value: string | number) => void;
  onFillGaps: () => void;
  onInferBrief: () => void;
  onOpenMaterials: () => void;
  onOpenPlan: () => void;
  onPickMaterials: () => void;
  onPickSample: () => void;
  onRegenerate: () => void;
  onRenderPreview: () => void;
  onVariantChange: (variant: VariantKey) => void;
  filling: boolean;
  regenerating: boolean;
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
  const [editorTool, setEditorTool] = useState("source_structure");
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
              <div className="config-panel-head">
                <b>目标信息配置</b>
                <Button loading={briefInferring} size="small" variant="outline" onClick={onInferBrief}>
                  {briefInferring ? "AI 生成中" : "AI 生成"}
                </Button>
              </div>
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
            <VideoEditorPreview
              caption={firstSegment?.transcript ?? "等待上传样例视频"}
              currentTool={editorTool}
              meta={sample?.aspectRatio ?? data.structure_dna.category ?? "product_talk"}
              onOpenPanel={() => setActiveWorkflowStep("analysis")}
              onSelectTool={setEditorTool}
              onSelectTrack={(id) => {
                const linked = data.edit_plan.timeline.find((item) => item.segment_id === id);
                setActiveSegmentId(linked?.target_segment_id ?? id);
              }}
              onUseTool={(tool) => {
                setEditorTool(tool);
                setActiveWorkflowStep("analysis");
              }}
              title={sample?.fileName ?? data.structure_dna.video_id}
              tools={sourceEditorTools}
              tone="source"
              tracks={data.structure_dna.segments.map((segment) => ({
                id: segment.segment_id,
                label: functionLabels[segment.function],
                status: "matched",
                selected: data.edit_plan.timeline.find((item) => item.target_segment_id === activeSegmentId)?.segment_id === segment.segment_id,
                detail: segment.transcript,
                weight: segment.duration_ratio ?? 0.12,
              }))}
              videoSrc={sample?.videoSrc}
            />
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
            <VideoEditorPreview
              caption={resultScript}
              currentTool={editorTool}
              meta={`${activeVariant.label} / ${session?.result.renderVersion ?? data.edit_plan.variant}`}
              onOpenPanel={() => {
                if (editorTool === "result_export" || editorTool === "result_script") {
                  onOpenPlan();
                } else {
                  onOpenMaterials();
                }
              }}
              onSelectTool={setEditorTool}
              onSelectTrack={setActiveSegmentId}
              onUseTool={(tool) => {
                setEditorTool(tool);
                if (tool === "result_match" || tool === "result_fill") {
                  onOpenMaterials();
                } else {
                  onOpenPlan();
                }
              }}
              title={targetTitle}
              tools={resultEditorTools}
              tone="result"
              tracks={data.edit_plan.timeline.map((item) => ({
                id: item.target_segment_id,
                label: functionLabels[item.function],
                status: item.slot_status,
                selected: activeSegmentId === item.target_segment_id,
                detail: `${statusLabels[item.slot_status]} / ${item.completion_strategy}`,
                weight: Math.max(item.target_time_range[1] - item.target_time_range[0], 0.8),
              }))}
              videoSrc={session?.result.videoSrc}
            />
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

type EditorTrack = {
  detail: string;
  id: string;
  label: string;
  selected: boolean;
  status: SlotStatus;
  weight: number;
};

type EditorTool = string;

type EditorToolDef = {
  id: EditorTool;
  label: string;
  hint: string;
};

const sourceEditorTools: EditorToolDef[] = [
  {id: "source_visual", label: "画面解析", hint: "查看镜头切分、画幅和基础媒体信息"},
  {id: "source_asr", label: "ASR 脚本", hint: "查看样例口播转写和分句结构"},
  {id: "source_structure", label: "结构 DNA", hint: "进入结构分析，确认每个爆款槽位"},
];

const resultEditorTools: EditorToolDef[] = [
  {id: "result_match", label: "素材匹配", hint: "进入素材页，查看每个槽位匹配到的用户素材"},
  {id: "result_fill", label: "缺口补全", hint: "进入素材页，处理 missing / weak_match 槽位"},
  {id: "result_script", label: "方案脚本", hint: "进入方案页，编辑逐段脚本和包装策略"},
  {id: "result_export", label: "导出成片", hint: "进入方案页，合成 preview.mp4"},
];

function VideoEditorPreview({
  caption,
  currentTool,
  meta,
  onOpenPanel,
  onSelectTool,
  onSelectTrack,
  onUseTool,
  title,
  tools,
  tone,
  tracks,
  videoSrc,
}: {
  caption: string;
  currentTool: EditorTool;
  meta: string;
  onOpenPanel: () => void;
  onSelectTool: (tool: EditorTool) => void;
  onSelectTrack: (id: string) => void;
  onUseTool: (tool: EditorTool) => void;
  title: string;
  tools: EditorToolDef[];
  tone: "source" | "result";
  tracks: EditorTrack[];
  videoSrc?: string;
}) {
  const totalWeight = tracks.reduce((sum, item) => sum + Math.max(item.weight, 0.1), 0) || 1;
  const selectedTrack = tracks.find((track) => track.selected) ?? tracks[0];
  const activeTool = tools.find((tool) => tool.id === currentTool) ?? tools[0];
  return (
    <div className={`video-editor ${tone}`}>
      <div className="editor-topbar">
        <div className="window-dots" aria-hidden="true"><span /><span /><span /></div>
        <strong>{tone === "source" ? "样例编辑器" : "结果编辑器"}</strong>
        <small>{meta}</small>
      </div>
      <div className="editor-canvas">
        {videoSrc && (
          <video
            className="editor-video"
            controls
            loop
            muted
            playsInline
            preload="metadata"
            src={videoSrc}
          />
        )}
        {!videoSrc && <div className="editor-empty">等待视频</div>}
        <div className="editor-overlay">
          <span>{tone === "source" ? "Template" : "Generated"}</span>
          <b>{title}</b>
          <p>{selectedTrack?.detail || caption}</p>
        </div>
      </div>
      <div className="editor-toolbar" aria-label="视频编辑工具栏">
        {tools.map((tool) => (
          <button
            key={tool.id}
            className={(currentTool === tool.id || activeTool.id === tool.id) ? "active" : ""}
            type="button"
            onClick={() => {
              onSelectTool(tool.id);
              onUseTool(tool.id);
            }}
          >
            {tool.label}
          </button>
        ))}
      </div>
      <div className="editor-inspector">
        <div>
          <b>{selectedTrack?.label ?? "未选择片段"}</b>
          <small>{activeTool.hint}</small>
        </div>
        <button type="button" onClick={onOpenPanel}>
          打开面板
        </button>
      </div>
      <div className="editor-timeline" aria-label="剪辑时间线">
        <div className="track-label">结构轨</div>
        <div className="track-lane">
          {tracks.map((track) => (
            <button
              key={track.id}
              className={`track-clip ${track.status} ${track.selected ? "active" : ""}`}
              style={{width: `${Math.max((track.weight / totalWeight) * 100, 9)}%`}}
              title={track.label}
              type="button"
              onClick={() => onSelectTrack(track.id)}
            >
              {track.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AnalysisView({
  data,
  sample,
  totalDuration,
  sampleUploading,
  onPickSample,
}: {
  data: PipelineResult;
  sample?: SamplePreview;
  totalDuration: number;
  sampleUploading: boolean;
  onPickSample: () => void;
}) {
  const info = data.structure_dna.basic_info;
  const slotCount = data.structure_dna.segments.length;
  const handoffTags = Array.from(new Set(data.structure_dna.segments.flatMap((segment) => segment.required_material_tags))).slice(0, 8);
  const slotCountCopy = slotCount ? `把视频拆成 ${slotCount} 个 Structure DNA 槽位，每个槽位都有时间轴和判断依据。` : "上传样例后，这里会生成可复核的 Structure DNA 槽位。";
  const [editorTool, setEditorTool] = useState<EditorTool>("source_structure");
  const [activeSourceSegmentId, setActiveSourceSegmentId] = useState("");
  const firstSegment = data.structure_dna.segments[0];
  const selectedSourceSegmentId = activeSourceSegmentId || firstSegment?.segment_id || "";
  const sampleMeta = sample?.aspectRatio ?? (info ? `${info.width} x ${info.height}` : "等待导入");

  return (
    <div className="panel-grid">
      <Card bordered className="panel wide">
        <div className="material-head-row">
          <PanelTitle eyebrow="Workflow Role" title="样例分析在流程里的作用" />
          <Button icon={<CloudUploadIcon />} loading={sampleUploading} theme="primary" onClick={onPickSample}>
            {sampleUploading ? "解析样例中..." : "上传样例视频"}
          </Button>
        </div>
        <div className="analysis-role-grid">
          <section>
            <span>1</span>
            <b>看懂模板</b>
            <small>从样例视频里识别口播、画面动作、节奏和转化意图。</small>
          </section>
          <section>
            <span>2</span>
            <b>拆成槽位</b>
            <small>{slotCountCopy}</small>
          </section>
          <section>
            <span>3</span>
            <b>交给匹配</b>
            <small>下一步会按这些槽位寻找用户素材，缺口再用补拍、包装或 AIGC 补齐。</small>
          </section>
        </div>
        <div className="analysis-handoff-strip">
          <b>给素材匹配的需求标签</b>
          <div className="tag-row">
            {handoffTags.length ? handoffTags.map((tag) => <span key={tag}>{tag}</span>) : <span>等待 Structure DNA 输出</span>}
          </div>
        </div>
        {!slotCount && (
          <div className="analysis-empty-action">
            <b>从导入样例开始</b>
            <small>上传模板视频后，后端会跑样例解析、ASR 和结构拆分，生成这里的时间轴与槽位。</small>
            <Button icon={<CloudUploadIcon />} loading={sampleUploading} theme="primary" onClick={onPickSample}>
              {sampleUploading ? "正在上传解析..." : "选择样例视频"}
            </Button>
          </div>
        )}
      </Card>

      <Card bordered className="panel wide">
        <div className="material-head-row">
          <PanelTitle eyebrow="Imported Sample" title="导入样例预览" />
          <Button loading={sampleUploading} size="small" variant="outline" onClick={onPickSample}>
            {sample?.videoSrc ? "替换样例" : "导入样例"}
          </Button>
        </div>
        <VideoEditorPreview
          caption={firstSegment?.transcript ?? "导入样例后，这里会显示视频预览和结构轨。"}
          currentTool={editorTool}
          meta={sampleMeta}
          onOpenPanel={() => undefined}
          onSelectTool={setEditorTool}
          onSelectTrack={setActiveSourceSegmentId}
          onUseTool={setEditorTool}
          title={sample?.fileName ?? data.structure_dna.video_id}
          tools={sourceEditorTools}
          tone="source"
          tracks={data.structure_dna.segments.map((segment) => ({
            id: segment.segment_id,
            label: functionLabels[segment.function],
            status: "matched",
            selected: selectedSourceSegmentId === segment.segment_id,
            detail: `${formatRange(segment.time_range)} / ${segment.transcript || segment.visual_cue || "结构槽位"}`,
            weight: segment.duration_ratio ?? Math.max(segment.duration_sec, 0.8),
          }))}
          videoSrc={sample?.videoSrc}
        />
      </Card>

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
          <Info label="分辨率" value={info ? `${info.width} x ${info.height}` : "待解析"} />
          <Info label="帧率" value={info ? `${info.fps} fps` : "待解析"} />
          <Info label="自动镜头数" value={info ? String(info.shot_count) : "待解析"} />
          <Info label="口播" value={info ? (info.has_speech === false ? "否" : "是") : "待解析"} />
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
              <div className="slot-handoff-tags">
                <b>下一步匹配素材</b>
                <div className="tag-row">
                  {segment.required_material_tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              </div>
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
  aigc: "AIGC 补全",
};

function MaterialsView({
  data,
  activeSegmentId,
  setActiveSegmentId,
  materialUploading,
  onUploadMaterials,
  onFillGaps,
  filling,
}: {
  data: PipelineResult;
  activeSegmentId: string;
  setActiveSegmentId: (id: string) => void;
  materialUploading: boolean;
  onUploadMaterials: () => void;
  onFillGaps: () => void;
  filling: boolean;
}) {
  const materialById = useMemo(
    () => new Map(data.material_library.materials.map((material) => [material.material_id, material])),
    [data.material_library.materials],
  );
  const activeTimelineItem =
    data.edit_plan.timeline.find((item) => item.target_segment_id === activeSegmentId) ??
    data.edit_plan.timeline[0];
  const activeMaterial = activeTimelineItem?.selected_material_id
    ? materialById.get(activeTimelineItem.selected_material_id)
    : undefined;
  const activePreview = assetUrl(activeMaterial?.preview_url);
  const linkedSource = data.structure_dna.segments.find((segment) => segment.segment_id === activeTimelineItem?.segment_id);
  const candidateMaterials = data.material_library.materials
    .filter((material) => {
      if (!activeTimelineItem) {
        return false;
      }
      return material.semantic_role === activeTimelineItem.function || material.tags.some((tag) => linkedSource?.required_material_tags.includes(tag));
    })
    .sort((a, b) => b.quality_score - a.quality_score)
    .slice(0, 4);
  const managedStats = [
    {label: "总素材", value: data.material_library.materials.length},
    {label: "已落位", value: data.edit_plan.timeline.filter((item) => item.selected_material_id).length},
    {label: "待补位", value: data.edit_plan.timeline.filter((item) => item.slot_status === "missing" || item.slot_status === "weak_match").length},
  ];

  return (
    <div className="materials-workbench">
      <Card bordered className="panel material-library-panel">
        <div className="material-head-row">
          <PanelTitle eyebrow="Asset Manager" title="我的素材库" />
          <div className="material-head-actions">
            <Button
              icon={<RocketIcon />}
              loading={filling}
              variant="outline"
              onClick={onFillGaps}
            >
              {filling ? "AIGC 生成中..." : "AIGC 补全缺口"}
            </Button>
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
        </div>
        <div className="material-stats">
          {managedStats.map((item) => (
            <div key={item.label}>
              <b>{item.value}</b>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        <div className="material-grid manager-grid">
          {data.material_library.materials.map((material) => {
            const preview = assetUrl(material.preview_url);
            const usedBy = data.edit_plan.timeline.filter((item) => item.selected_material_id === material.material_id);
            return (
            <button
              key={material.material_id}
              className={`material-card material-card-button ${usedBy.length ? "is-used" : ""}`}
              type="button"
              onClick={() => {
                const linked = usedBy[0];
                if (linked) {
                  setActiveSegmentId(linked.target_segment_id);
                }
              }}
            >
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
              {usedBy.length > 0 && (
                <div className="used-by">
                  已用于 {usedBy.map((item) => functionLabels[item.function]).join("、")}
                </div>
              )}
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
            </button>
            );
          })}
        </div>
      </Card>

      <Card bordered className="panel slot-mapping-panel">
        <PanelTitle eyebrow="Slot Mapping" title="素材如何放进新视频" />
        <div className="placement-timeline" aria-label="素材落位时间线">
          {data.edit_plan.timeline.map((item) => (
            <button
              key={item.target_segment_id}
              className={activeSegmentId === item.target_segment_id ? "active" : ""}
              type="button"
              onClick={() => setActiveSegmentId(item.target_segment_id)}
            >
              <span className={`status-dot ${item.slot_status}`} />
              <div>
                <b>{functionLabels[item.function]}</b>
                <small>{formatRange(item.target_time_range)}</small>
              </div>
              <strong>{statusLabels[item.slot_status]}</strong>
            </button>
          ))}
        </div>
        <div className="mapping-board">
          {data.edit_plan.timeline.map((item) => {
            const source = data.structure_dna.segments.find((segment) => segment.segment_id === item.segment_id);
            const material = item.selected_material_id ? materialById.get(item.selected_material_id) : undefined;
            return (
              <button
                key={item.target_segment_id}
                className={activeSegmentId === item.target_segment_id ? "mapping-row active" : "mapping-row"}
                type="button"
                onClick={() => setActiveSegmentId(item.target_segment_id)}
              >
                <div className="mapping-source">
                  <span>样例结构</span>
                  <b>{functionLabels[item.function]}</b>
                  <small>{source?.visual_cue ?? source?.text_pattern ?? "结构占位"}</small>
                </div>
                <div className="mapping-arrow">→</div>
                <div className="mapping-target">
                  <span>用户素材</span>
                  <b>{material?.file_name ?? "待补素材"}</b>
                  <small>{item.completion_strategy}</small>
                </div>
                <Tag shape="round" size="small" theme={statusThemes[item.slot_status]} variant="light">
                  {statusLabels[item.slot_status]}
                </Tag>
              </button>
            );
          })}
        </div>
      </Card>

      <Card bordered className="panel placement-preview-panel">
        <PanelTitle eyebrow="Placement Preview" title="当前槽位预览" />
        {activeTimelineItem && (
          <div className="placement-preview">
            <div className={`placement-stage ${activeTimelineItem.slot_status}`}>
              {activePreview && activeMaterial?.type === "video_clip" && (
                <video className="placement-media" src={activePreview} muted loop autoPlay playsInline preload="metadata" />
              )}
              {activePreview && activeMaterial?.type === "image" && (
                <img className="placement-media" src={activePreview} alt={activeMaterial.file_name} />
              )}
              {!activePreview && (
                <div className="placement-empty">
                  <b>{statusLabels[activeTimelineItem.slot_status]}</b>
                  <span>{activeTimelineItem.supplement_instruction || "等待素材或 AIGC 补全"}</span>
                </div>
              )}
              <div className="placement-overlay">
                <span>{functionLabels[activeTimelineItem.function]}</span>
                <b>{activeTimelineItem.packaging.title_bar_text ?? data.edit_plan.target_title}</b>
                <p>{activeTimelineItem.packaging.subtitle ?? activeTimelineItem.script}</p>
              </div>
            </div>
            <div className="placement-inspector">
              <Info label="新视频时间" value={formatRange(activeTimelineItem.target_time_range)} />
              <Info label="选中素材" value={activeMaterial?.file_name ?? "待补素材"} />
              <Info label="匹配依据" value={activeTimelineItem.explanation} />
              <Info label="补全策略" value={activeTimelineItem.completion_strategy} />
              <Info label="原样例句" value={linkedSource?.transcript ?? "无"} />
            </div>
          </div>
        )}
        <div className="candidate-list">
          <b>候选素材</b>
          {candidateMaterials.length === 0 && <small>当前槽位没有可直接替换素材，建议 AIGC 补全或重新上传素材。</small>}
          {candidateMaterials.map((material) => (
            <section key={material.material_id}>
              <span>{material.file_name}</span>
              <Progress color="#0f766e" label={false} percentage={Math.round(material.quality_score * 100)} size="small" theme="line" />
            </section>
          ))}
        </div>
        <div className="gap-list compact">
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

function RenderExport({data, onRendered}: {data: PipelineResult; onRendered?: (url: string) => void}) {
  const [rendering, setRendering] = useState(false);
  const [url, setUrl] = useState<string | undefined>();
  const [error, setError] = useState("");

  const onRender = async () => {
    setRendering(true);
    setError("");
    setUrl(undefined);
    try {
      const res = await renderPreview(data);
      const nextUrl = `${assetUrl(res.preview_url) ?? ""}?t=${Date.now()}`;
      setUrl(nextUrl);
      onRendered?.(nextUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "render failed");
    } finally {
      setRendering(false);
    }
  };

  return (
    <div className="render-export">
      <Button
        icon={<RocketIcon />}
        loading={rendering}
        theme="primary"
        variant="outline"
        onClick={onRender}
      >
        {rendering ? "合成中..." : "导出 mp4"}
      </Button>
      {url && (
        <a className="render-link" href={url} target="_blank" rel="noreferrer">
          ✓ 查看成片
        </a>
      )}
      {error && <span className="render-error">需后端运行</span>}
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
  onRegenerate,
  regenerating,
  onInterpret,
  interpreting,
  renderedPreviewUrl,
  onRendered,
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
  onRegenerate: () => void;
  regenerating: boolean;
  onInterpret: () => void;
  interpreting: boolean;
  renderedPreviewUrl?: string;
  onRendered: (url: string) => void;
}) {
  return (
    <div className="plan-layout">
      <div className="plan-main">
        <Card bordered className="panel">
          <div className="material-head-row">
            <PanelTitle eyebrow="Preview" title="结果预览" />
            <RenderExport data={data} onRendered={onRendered} />
          </div>
          {renderedPreviewUrl && (
            <div className="rendered-video-shell">
              <video src={renderedPreviewUrl} controls playsInline preload="metadata" />
            </div>
          )}
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
            <label className="field-stack nl-edit">
              <span>✨ 一句话改片(AI 解析)</span>
              <Textarea
                autosize={{minRows: 2, maxRows: 3}}
                placeholder="例如：开头更有冲击力，节奏快一点，结尾强调限时优惠"
                value={draft.nlInstruction}
                onChange={(value) => onDraftChange("nlInstruction", value)}
              />
            </label>
            <Button
              block
              loading={interpreting}
              variant="outline"
              onClick={onInterpret}
            >
              {interpreting ? "AI 解析中..." : "AI 解析改动到下方"}
            </Button>
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
            <Button
              block
              icon={<RocketIcon />}
              loading={regenerating}
              theme="primary"
              onClick={onRegenerate}
            >
              {regenerating ? "重新生成中..." : "应用并重新生成方案"}
            </Button>
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

function CompareView({data, onState}: {data: PipelineResult; onState: (state: string) => void}) {
  const [comparison, setComparison] = useState<VariantComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    compareVariants(data)
      .then((res) => {
        if (active) {
          setComparison(res);
          onState("variants compared");
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "compare failed");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [onState, data]);

  if (loading) {
    return <div className="compare-hint">正在生成三个版本的方案…</div>;
  }
  if (error || !comparison) {
    return <div className="compare-hint">版本对比需要后端运行（{error || "无数据"}）。先点左上角“跑通 Demo 管线”。</div>;
  }

  return (
    <div className="compare-grid">
      {comparison.variants.map(({variant, edit_plan}) => {
        const config = variantConfigs.find((item) => item.id === variant);
        const counts = statusOrder.reduce<Record<SlotStatus, number>>(
          (acc, status) => {
            acc[status] = edit_plan.timeline.filter((item) => item.slot_status === status).length;
            return acc;
          },
          {matched: 0, weak_match: 0, missing: 0, supplemented: 0},
        );
        const score = edit_plan.overall_score;
        return (
          <Card bordered className="panel compare-col" key={variant}>
            <PanelTitle eyebrow={variant} title={config?.label ?? variant} />
            <p className="compare-focus">{config?.focus}</p>
            <div className="compare-bars">
              <ScoreBar label="结构一致" value={score.structure_consistency} />
              <ScoreBar label="素材匹配" value={score.material_fit} />
              <ScoreBar label="节奏匹配" value={score.pacing_fit} />
            </div>
            <div className="compare-status">
              {statusOrder.map((status) => (
                <Tag key={status} shape="round" theme={statusThemes[status]} variant="light">
                  {statusLabels[status]} {counts[status]}
                </Tag>
              ))}
            </div>
            <div className="compare-track">
              {edit_plan.timeline.map((item) => (
                <span key={item.target_segment_id} className={`compare-seg ${item.slot_status}`}>
                  {functionLabels[item.function]}
                </span>
              ))}
            </div>
            <div className="compare-config">
              <Info label="脚本基调" value={config?.scriptTone ?? "-"} />
              <Info label="节奏" value={config?.pacing ?? "-"} />
              <Info label="包装" value={config?.packaging ?? "-"} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function ScoreBar({label, value}: {label: string; value: number}) {
  return (
    <div className="score-bar">
      <span>{label}</span>
      <div className="score-bar-track">
        <span style={{width: `${Math.round(value * 100)}%`}} />
      </div>
      <b>{Math.round(value * 100)}</b>
    </div>
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

function Score({label, value}: {label: string; value: number | null}) {
  return (
    <div className="score">
      <span>{label}</span>
      <strong>{value === null ? "待分析" : Math.round(value * 100)}</strong>
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

function normalizeVariant(value: string): VariantKey {
  return variantConfigs.some((variant) => variant.id === value) ? value as VariantKey : "balanced";
}

function buildDraftFromSession(session: DemoSession): WorkbenchDraft {
  return {
    productTitle: session.targetTitle,
    sellingPoints: session.sellingPoints.join("、"),
    materialBrief: session.materialBrief,
    ...editDefaults,
  };
}

function buildDraftSession(id: string, index: number): DemoSession {
  return {
    id,
    name: `会话 ${String(index).padStart(2, "0")}`,
    caseId: id.replace(/^session_/, ""),
    targetTitle: "新建结构迁移会话",
    description: "从 0 上传样例视频，再补充用户素材，生成这一条会话自己的结构迁移结果。",
    status: "running",
    stage: "sample",
    variant: "balanced",
    materialCount: 0,
    gapProfile: "等待样例上传",
    sellingPoints: ["待填写"],
    materialBrief: "等待上传样例视频和用户素材。",
    artifacts: [
      {label: "Structure DNA", type: "json", state: "pending"},
      {label: "Material Library", type: "json", state: "pending"},
      {label: "Edit Plan", type: "json", state: "pending"},
      {label: "结果视频", type: "video", state: "pending"},
    ],
    oneStopCapture: demoSessions[0].oneStopCapture,
    sample: {
      label: "New",
      videoSrc: "",
      fileName: "等待上传",
      durationLabel: "-",
      aspectRatio: "待解析",
    },
    result: {
      label: "Generated",
      videoSrc: "/poster-demo-v5.mp4",
      fileName: "等待生成",
      renderVersion: "balanced",
    },
    inputs: {
      materials: [],
      aigc: [],
      creativeBrief: "上传样例后，AI 会自动捕获结构脚本和素材缺口。",
    },
  };
}

function buildEmptyPipeline(session: DemoSession): PipelineResult {
  return {
    structure_dna: {
      schema_version: "1.0",
      video_id: session.caseId,
      source_type: "uploaded_video",
      total_duration_sec: 0,
      category: "product_talk",
      structure_formula: "等待上传样例视频后由 AI 分析",
      segments: [],
      global_features: {
        pacing_pattern: "待分析",
        bgm_style: "待分析",
        overall_emotion_curve: [],
      },
    },
    material_library: {
      schema_version: "1.0",
      project_id: session.caseId,
      target: {
        title: session.targetTitle,
        category: "product_talk",
        selling_points: session.sellingPoints,
      },
      materials: [],
    },
    edit_plan: {
      schema_version: "1.0",
      project_id: session.caseId,
      source_structure_id: session.caseId,
      target_title: session.targetTitle,
      variant: session.variant,
      overall_score: {
        structure_consistency: 0,
        material_fit: 0,
        pacing_fit: 0,
      },
      timeline: [],
      missing_slots: [],
      exports: {
        editing_guide_path: null,
        comparison_report_path: null,
        preview_video_path: null,
        capcut_draft_path: null,
      },
    },
    comparison_report: {
      schema_version: "1.0",
      project_id: session.caseId,
      summary: {
        source_formula: "",
        target_formula: "",
        main_gap: "等待上传样例视频和用户素材后分析",
        main_fix: "上传后自动生成",
      },
      segment_mapping: [],
      review_notes: [],
    },
  };
}

function buildSessionFromPipeline(
  result: PipelineResult,
  file: File,
  id: string,
  index: number,
  variant: VariantKey,
): DemoSession {
  const statusCounts = result.edit_plan.timeline.reduce<Record<SlotStatus, number>>(
    (acc, item) => {
      acc[item.slot_status] += 1;
      return acc;
    },
    {matched: 0, weak_match: 0, missing: 0, supplemented: 0},
  );
  const sellingPoints = result.material_library.target?.selling_points ?? ["真实样例"];
  const stage: DemoSession["stage"] = result.edit_plan.timeline.length ? "plan" : "sample";
  const needsReview = statusCounts.missing > 0 || statusCounts.weak_match > 0;

  return {
    id,
    name: `会话 ${String(index).padStart(2, "0")}`,
    caseId: result.edit_plan.project_id,
    targetTitle: result.edit_plan.target_title,
    description: `${file.name} 已解析为 ${result.structure_dna.segments.length} 个结构段，当前有 ${statusCounts.missing} 个缺口。`,
    status: needsReview ? "needs_review" : "ready",
    stage,
    variant,
    materialCount: result.material_library.materials.length,
    gapProfile: needsReview ? `${statusCounts.missing} 缺口 / ${statusCounts.weak_match} 弱匹配` : "素材覆盖完整",
    sellingPoints,
    materialBrief: result.material_library.materials.length
      ? `已解析 ${result.material_library.materials.length} 个用户素材。`
      : "当前还没有用户素材，方案主要基于结构和补全建议。",
    artifacts: [
      {label: "Structure DNA", type: "json", state: "ready"},
      {label: "Material Library", type: "json", state: result.material_library.materials.length ? "ready" : "pending"},
      {label: "Edit Plan", type: "json", state: "ready"},
      {label: "结果视频", type: "video", state: "pending"},
    ],
    oneStopCapture: demoSessions[0].oneStopCapture,
    sample: {
      label: "Uploaded",
      videoSrc: "",
      fileName: file.name,
      durationLabel: `${formatSeconds(result.structure_dna.total_duration_sec)}s`,
      aspectRatio: result.structure_dna.basic_info
        ? `${result.structure_dna.basic_info.width} x ${result.structure_dna.basic_info.height}`
        : "uploaded",
    },
    result: {
      label: "Plan",
      videoSrc: "/poster-demo-v5.mp4",
      fileName: "等待导出 preview.mp4",
      renderVersion: variant,
    },
    inputs: {
      materials: result.material_library.materials.map((material) => material.file_name),
      aigc: result.edit_plan.missing_slots.map((slot) => slot.suggested_fix),
      creativeBrief: result.comparison_report.summary?.main_gap
        ?? result.edit_plan.missing_slots[0]?.suggested_fix
        ?? "真实样例已完成结构解析，可继续上传素材或导出预览。",
    },
  };
}

function buildSessionFromStoredProject(result: PipelineResult, previewUrl: string | undefined, index: number): DemoSession {
  const statusCounts = result.edit_plan.timeline.reduce<Record<SlotStatus, number>>(
    (acc, item) => {
      acc[item.slot_status] += 1;
      return acc;
    },
    {matched: 0, weak_match: 0, missing: 0, supplemented: 0},
  );
  const sellingPoints = result.material_library.target?.selling_points ?? [];
  return {
    id: `session_project_${result.edit_plan.project_id}`,
    name: `会话 ${String(index).padStart(2, "0")}`,
    caseId: result.edit_plan.project_id,
    targetTitle: result.edit_plan.target_title,
    description: result.comparison_report.summary?.main_gap ?? "真实项目会话",
    status: previewUrl ? "ready" : "needs_review",
    stage: previewUrl ? "preview" : "plan",
    variant: normalizeVariant(result.edit_plan.variant),
    materialCount: result.material_library.materials.length,
    gapProfile: `${statusCounts.missing} 缺素材 / ${statusCounts.weak_match} 弱匹配`,
    sellingPoints,
    materialBrief: result.material_library.materials.length
      ? `已解析 ${result.material_library.materials.length} 个用户素材。`
      : "尚未上传用户素材。",
    artifacts: [
      {label: "Structure DNA", type: "json", state: result.structure_dna.segments.length ? "ready" : "pending"},
      {label: "Material Library", type: "json", state: result.material_library.materials.length ? "ready" : "pending"},
      {label: "Edit Plan", type: "json", state: result.edit_plan.timeline.length ? "ready" : "pending"},
      {label: "结果视频", type: "video", state: previewUrl ? "ready" : "pending"},
    ],
    oneStopCapture: demoSessions[0].oneStopCapture,
    sample: {
      label: "Analyzed",
      videoSrc: "",
      fileName: result.structure_dna.video_id,
      durationLabel: `${formatSeconds(result.structure_dna.total_duration_sec)}s`,
      aspectRatio: result.structure_dna.basic_info
        ? `${result.structure_dna.basic_info.width} x ${result.structure_dna.basic_info.height}`
        : "已解析",
    },
    result: {
      label: previewUrl ? "Rendered" : "Plan",
      videoSrc: previewUrl ?? "",
      fileName: previewUrl ? "preview.mp4" : "待导出",
      renderVersion: result.edit_plan.variant,
    },
    inputs: {
      materials: result.material_library.materials.map((material) => material.file_name),
      aigc: result.edit_plan.missing_slots.map((slot) => slot.suggested_fix),
      creativeBrief: result.comparison_report.summary?.main_fix ?? "按 Structure DNA 生成方案",
    },
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
