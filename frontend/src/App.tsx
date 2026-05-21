import {useMemo, useState} from "react";

import {runDemoPipeline} from "./api";
import {fallbackPipeline} from "./mockState";
import type {PipelineResult, SlotStatus, TimelineItem} from "./types";

const statusLabels: Record<SlotStatus, string> = {
  matched: "已匹配",
  weak_match: "弱匹配",
  missing: "缺素材",
  supplemented: "已补全",
};

const statusOrder: SlotStatus[] = ["matched", "weak_match", "missing", "supplemented"];

export function App() {
  const [data, setData] = useState<PipelineResult>(fallbackPipeline);
  const [activeView, setActiveView] = useState<"analysis" | "materials" | "plan">("analysis");
  const [loading, setLoading] = useState(false);
  const [apiState, setApiState] = useState("mock ready");

  const totalDuration = data.structure_dna.total_duration_sec;
  const statusCounts = useMemo(() => {
    return statusOrder.reduce<Record<SlotStatus, number>>(
      (acc, status) => {
        acc[status] = data.edit_plan.timeline.filter((item) => item.slot_status === status).length;
        return acc;
      },
      {matched: 0, weak_match: 0, missing: 0, supplemented: 0},
    );
  }, [data.edit_plan.timeline]);

  const handleRun = async () => {
    setLoading(true);
    setApiState("running");
    try {
      const result = await runDemoPipeline();
      setData(result);
      setApiState("backend synced");
    } catch (error) {
      setApiState(error instanceof Error ? error.message : "backend unavailable");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">DNA</span>
          <div>
            <strong>爆款结构迁移引擎</strong>
            <small>{apiState}</small>
          </div>
        </div>

        <button className="primary-action" type="button" onClick={handleRun} disabled={loading}>
          {loading ? "生成中..." : "跑通 Demo 管线"}
        </button>

        <nav className="view-tabs">
          <button className={activeView === "analysis" ? "active" : ""} onClick={() => setActiveView("analysis")}>
            样例分析
          </button>
          <button className={activeView === "materials" ? "active" : ""} onClick={() => setActiveView("materials")}>
            素材匹配
          </button>
          <button className={activeView === "plan" ? "active" : ""} onClick={() => setActiveView("plan")}>
            方案输出
          </button>
        </nav>

        <div className="score-stack">
          <Score label="结构一致" value={data.edit_plan.overall_score.structure_consistency} />
          <Score label="素材匹配" value={data.edit_plan.overall_score.material_fit} />
          <Score label="节奏匹配" value={data.edit_plan.overall_score.pacing_fit} />
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Structure Migration Workspace</p>
            <h1>{data.edit_plan.target_title}</h1>
          </div>
          <div className="status-strip">
            {statusOrder.map((status) => (
              <span key={status} className={`slot-pill ${status}`}>
                {statusLabels[status]} {statusCounts[status]}
              </span>
            ))}
          </div>
        </header>

        {activeView === "analysis" && (
          <AnalysisView data={data} totalDuration={totalDuration} />
        )}
        {activeView === "materials" && <MaterialsView data={data} />}
        {activeView === "plan" && <PlanView data={data} />}
      </section>
    </main>
  );
}

function AnalysisView({data, totalDuration}: {data: PipelineResult; totalDuration: number}) {
  return (
    <div className="panel-grid">
      <section className="panel wide">
        <PanelTitle eyebrow="Module A" title="样例结构 DNA" />
        <div className="formula">{data.structure_dna.structure_formula}</div>
        <Timeline totalDuration={totalDuration} items={data.structure_dna.segments.map((segment) => ({
          id: segment.segment_id,
          label: segment.function,
          range: segment.time_range,
          status: "matched" as SlotStatus,
        }))} />
      </section>

      <section className="panel">
        <PanelTitle eyebrow="Pacing" title="情绪曲线" />
        <div className="emotion-bars">
          {data.structure_dna.global_features.overall_emotion_curve.map((score, index) => (
            <span key={`${score}-${index}`} style={{height: `${score * 9}%`}} />
          ))}
        </div>
      </section>

      <section className="panel wide">
        <PanelTitle eyebrow="Segments" title="结构槽位" />
        <div className="segment-list">
          {data.structure_dna.segments.map((segment) => (
            <article key={segment.segment_id} className="segment-row">
              <b>{segment.function}</b>
              <p>{segment.transcript}</p>
              <small>{segment.required_material_tags.join(" / ")}</small>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function MaterialsView({data}: {data: PipelineResult}) {
  return (
    <div className="panel-grid">
      <section className="panel wide">
        <PanelTitle eyebrow="Module B" title="素材标签库" />
        <div className="material-grid">
          {data.material_library.materials.map((material) => (
            <article key={material.material_id} className="material-card">
              <div className="material-head">
                <b>{material.file_name}</b>
                <span>{Math.round(material.quality_score * 100)}%</span>
              </div>
              <p>{material.transcript || material.shot_type}</p>
              <div className="tag-row">
                {material.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <PanelTitle eyebrow="Gaps" title="素材缺口" />
        {data.edit_plan.missing_slots.map((slot) => (
          <div className="gap-card" key={slot.segment_id}>
            <b>{slot.function}</b>
            <p>{slot.impact}</p>
            <small>{slot.suggested_fix}</small>
          </div>
        ))}
      </section>
    </div>
  );
}

function PlanView({data}: {data: PipelineResult}) {
  return (
    <div className="panel-grid">
      <section className="panel wide">
        <PanelTitle eyebrow="Module C" title="新方案时间线" />
        <Timeline totalDuration={31.5} items={data.edit_plan.timeline.map((item) => ({
          id: item.target_segment_id,
          label: item.function,
          range: item.target_time_range,
          status: item.slot_status,
        }))} />
      </section>
      <section className="panel wide">
        <PanelTitle eyebrow="Edit Plan" title="逐段剪辑方案" />
        <div className="plan-list">
          {data.edit_plan.timeline.map((item) => (
            <PlanRow key={item.target_segment_id} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}

function PlanRow({item}: {item: TimelineItem}) {
  return (
    <article className="plan-row">
      <div>
        <span className={`slot-pill ${item.slot_status}`}>{statusLabels[item.slot_status]}</span>
        <b>{item.function}</b>
      </div>
      <p>{item.script}</p>
      <small>{item.explanation}</small>
    </article>
  );
}

function Timeline({
  totalDuration,
  items,
}: {
  totalDuration: number;
  items: Array<{id: string; label: string; range: [number, number]; status: SlotStatus}>;
}) {
  return (
    <div className="timeline">
      {items.map((item) => {
        const start = (item.range[0] / totalDuration) * 100;
        const width = ((item.range[1] - item.range[0]) / totalDuration) * 100;
        return (
          <div
            key={item.id}
            className={`timeline-block ${item.status}`}
            style={{left: `${start}%`, width: `${Math.max(width, 5)}%`}}
          >
            <span>{item.label}</span>
          </div>
        );
      })}
    </div>
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

function PanelTitle({eyebrow, title}: {eyebrow: string; title: string}) {
  return (
    <div className="panel-title">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
    </div>
  );
}
