export type DemoSession = {
  id: string;
  name: string;
  targetTitle: string;
  sample: {
    label: string;
    videoSrc: string;
    fileName: string;
    durationLabel: string;
    aspectRatio: string;
  };
  result: {
    label: string;
    videoSrc: string;
    fileName: string;
    renderVersion: string;
  };
  inputs: {
    materials: string[];
    aigc: string[];
    creativeBrief: string;
  };
};

export const demoSessions: DemoSession[] = [
  {
    id: "session_air_fryer_v5",
    name: "会话 01",
    targetTitle: "空气炸锅结构迁移样例",
    sample: {
      label: "Sample",
      videoSrc: "/sample-55702300.mov",
      fileName: "55702300.mov",
      durationLabel: "18.4s",
      aspectRatio: "竖屏样例",
    },
    result: {
      label: "Result",
      videoSrc: "/poster-demo-v5.mp4",
      fileName: "poster-demo-v5.mp4",
      renderVersion: "v5",
    },
    inputs: {
      materials: ["口播片段", "商品过程镜头", "卖点文案", "CTA 片段"],
      aigc: ["证明段卖点卡片", "局部放大补镜", "结果字幕强化"],
      creativeBrief: "保留 sample 的反常识开头、痛点、解决方案、证明和 CTA 结构，用素材与 AIGC 补齐证明段。",
    },
  },
];
