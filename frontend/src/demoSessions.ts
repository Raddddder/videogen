export type DemoSession = {
  id: string;
  name: string;
  targetTitle: string;
  oneStopCapture: {
    mode: "auto_capture";
    userInputs: string[];
    aiCaptured: Array<{
      module: "A" | "B" | "C";
      title: string;
      output: string;
      dimensions: string[];
    }>;
    askUserOnlyWhen: string[];
  };
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
    oneStopCapture: {
      mode: "auto_capture",
      userInputs: ["爆款样例视频", "用户素材", "可选商品/主题信息"],
      aiCaptured: [
        {
          module: "A",
          title: "样例视频解析",
          output: "Structure DNA",
          dimensions: ["结构公式", "分段功能", "文案模式", "字幕包装", "节奏与情绪曲线"],
        },
        {
          module: "B",
          title: "用户素材理解",
          output: "Material Library",
          dimensions: ["素材类型", "语义角色", "可用片段", "质量分", "裁剪风险"],
        },
        {
          module: "C",
          title: "方案生成",
          output: "Edit Plan",
          dimensions: ["槽位匹配", "缺口识别", "AIGC 补全策略", "目标时间线", "对比报告"],
        },
      ],
      askUserOnlyWhen: ["商品信息缺失", "目标平台冲突", "素材授权不清", "AI 推断置信度低"],
    },
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
