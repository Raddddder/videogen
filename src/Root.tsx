import "./index.css";
import {Composition} from "remotion";
import {MarketingRibbonVideo} from "./Composition";
import {StructurePreview} from "./StructurePreview";
import editPlanJson from "../mocks/edit_plan.sample.json";
import type {EditPlan} from "./structurePreviewTypes";

const editPlan = editPlanJson as unknown as EditPlan;
const structurePreviewDurationInFrames =
  Math.ceil(Math.max(...editPlan.timeline.map((item) => item.target_time_range[1]), 30)) * 30;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MarketingRibbonVideo"
        component={MarketingRibbonVideo}
        durationInFrames={540}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="StructurePreview"
        component={StructurePreview}
        durationInFrames={structurePreviewDurationInFrames}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{editPlan}}
      />
    </>
  );
};
