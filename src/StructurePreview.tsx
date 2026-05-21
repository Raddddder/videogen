import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from "remotion";

import type {EditPlan, SlotStatus, TimelineItem} from "./structurePreviewTypes";

const statusColor: Record<SlotStatus, string> = {
  matched: "#047857",
  weak_match: "#b45309",
  missing: "#b42318",
  supplemented: "#1d4ed8",
};

const statusLabel: Record<SlotStatus, string> = {
  matched: "已匹配",
  weak_match: "弱匹配",
  missing: "缺素材",
  supplemented: "已补全",
};

export const StructurePreview = ({editPlan}: {editPlan: EditPlan}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const time = frame / fps;
  const active = getActiveSegment(editPlan.timeline, time);
  const progress = interpolate(
    time,
    [0, Math.max(...editPlan.timeline.map((item) => item.target_time_range[1]))],
    [0, 1],
    {extrapolateLeft: "clamp", extrapolateRight: "clamp"},
  );

  return (
    <AbsoluteFill
      style={{
        background: "#eef1f6",
        color: "#172033",
        fontFamily:
          '"PingFang SC", "Microsoft YaHei", Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, rgba(37,99,235,0.08) 1px, transparent 1px), linear-gradient(0deg, rgba(15,118,110,0.07) 1px, transparent 1px)",
          backgroundSize: "90px 90px",
        }}
      />

      <div style={{position: "absolute", left: 72, top: 86, right: 72}}>
        <div style={{fontSize: 30, fontWeight: 900, color: "#0f766e"}}>STRUCTURE PREVIEW</div>
        <h1 style={{margin: "18px 0 0", fontSize: 74, lineHeight: 1.05, letterSpacing: 0}}>
          {editPlan.target_title}
        </h1>
      </div>

      <div
        style={{
          position: "absolute",
          left: 72,
          top: 360,
          right: 72,
          height: 1040,
          border: "2px solid #d7dde8",
          borderRadius: 28,
          background: "#ffffff",
          boxShadow: "0 40px 90px rgba(15,23,42,0.12)",
          overflow: "hidden",
        }}
      >
        {active ? <ActiveSegment item={active} /> : null}
      </div>

      <TimelineStrip editPlan={editPlan} progress={progress} />
      <ScoreBlock editPlan={editPlan} />
    </AbsoluteFill>
  );
};

const ActiveSegment = ({item}: {item: TimelineItem}) => {
  const color = statusColor[item.slot_status];
  return (
    <div style={{position: "absolute", inset: 0, padding: 54}}>
      <div
        style={{
          display: "inline-flex",
          padding: "10px 22px",
          borderRadius: 999,
          background: color,
          color: "#ffffff",
          fontSize: 30,
          fontWeight: 900,
        }}
      >
        {item.function} / {statusLabel[item.slot_status]}
      </div>

      <div
        style={{
          marginTop: 82,
          fontSize: 76,
          lineHeight: 1.14,
          fontWeight: 950,
          letterSpacing: 0,
        }}
      >
        {item.script}
      </div>

      <div
        style={{
          position: "absolute",
          left: 54,
          right: 54,
          bottom: 210,
          padding: 30,
          borderRadius: 22,
          background: "#f6f8fb",
          fontSize: 34,
          lineHeight: 1.42,
          color: "#344054",
        }}
      >
        {item.explanation}
      </div>

      <div
        style={{
          position: "absolute",
          left: 54,
          right: 54,
          bottom: 72,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 18,
          fontSize: 28,
        }}
      >
        <InfoBox label="包装" value={item.packaging.title_bar_text || item.packaging.subtitle || "none"} />
        <InfoBox label="补全" value={item.supplement_instruction || item.completion_strategy} />
      </div>
    </div>
  );
};

const TimelineStrip = ({editPlan, progress}: {editPlan: EditPlan; progress: number}) => {
  const total = Math.max(...editPlan.timeline.map((item) => item.target_time_range[1]));
  return (
    <div style={{position: "absolute", left: 72, right: 72, bottom: 260}}>
      <div style={{height: 18, borderRadius: 999, background: "#cbd5e1", overflow: "hidden"}}>
        <div style={{width: `${progress * 100}%`, height: "100%", background: "#172033"}} />
      </div>
      <div style={{position: "relative", height: 110, marginTop: 20}}>
        {editPlan.timeline.map((item) => {
          const start = (item.target_time_range[0] / total) * 100;
          const width = ((item.target_time_range[1] - item.target_time_range[0]) / total) * 100;
          return (
            <div
              key={item.target_segment_id}
              style={{
                position: "absolute",
                left: `${start}%`,
                width: `${width}%`,
                top: 0,
                height: 86,
                padding: 16,
                borderRadius: 16,
                background: statusColor[item.slot_status],
                color: "#ffffff",
                fontSize: 25,
                fontWeight: 900,
                overflow: "hidden",
              }}
            >
              {item.function}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ScoreBlock = ({editPlan}: {editPlan: EditPlan}) => {
  return (
    <div
      style={{
        position: "absolute",
        left: 72,
        right: 72,
        bottom: 72,
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 18,
      }}
    >
      <InfoBox label="结构一致" value={`${Math.round(editPlan.overall_score.structure_consistency * 100)}%`} />
      <InfoBox label="素材匹配" value={`${Math.round(editPlan.overall_score.material_fit * 100)}%`} />
      <InfoBox label="节奏匹配" value={`${Math.round(editPlan.overall_score.pacing_fit * 100)}%`} />
    </div>
  );
};

const InfoBox = ({label, value}: {label: string; value: string}) => {
  return (
    <div
      style={{
        padding: "20px 22px",
        borderRadius: 18,
        background: "#ffffff",
        border: "2px solid #d7dde8",
      }}
    >
      <div style={{fontSize: 22, color: "#667085", fontWeight: 800}}>{label}</div>
      <div style={{fontSize: 34, color: "#172033", fontWeight: 950, marginTop: 4}}>{value}</div>
    </div>
  );
};

const getActiveSegment = (items: TimelineItem[], time: number) => {
  return items.find((item) => time >= item.target_time_range[0] && time < item.target_time_range[1]) || items[0];
};
