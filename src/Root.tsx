import "./index.css";
import { Composition } from "remotion";
import { MarketingRibbonVideo } from "./Composition";

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
    </>
  );
};
