export type DemoSession = {
  id: string;
  name: string;
  targetTitle: string;
  caseId: string;
  description: string;
  status: "ready" | "running" | "needs_review";
  stage: "sample" | "materials" | "plan" | "preview";
  variant: "balanced" | "high_click" | "high_conversion";
  materialCount: number;
  gapProfile: string;
  sellingPoints: string[];
  materialBrief: string;
  artifacts: Array<{
    label: string;
    type: "json" | "video" | "guide" | "draft";
    state: "ready" | "mock" | "pending";
  }>;
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
    caseId: "air_fryer_balanced",
    targetTitle: "空气炸锅结构迁移样例",
    description: "hook、solution、proof、cta 都有素材，pain_point 复用 hook 并靠包装补强。",
    status: "ready",
    stage: "preview",
    variant: "balanced",
    materialCount: 4,
    gapProfile: "痛点弱匹配",
    sellingPoints: ["少油", "外酥里嫩"],
    materialBrief: "素材较完整：口播、过程镜头、证明图和 CTA 片段都在，痛点段靠包装补强。",
    artifacts: [
      {label: "Structure DNA", type: "json", state: "ready"},
      {label: "Material Library", type: "json", state: "ready"},
      {label: "Edit Plan", type: "json", state: "ready"},
      {label: "结果视频", type: "video", state: "mock"},
    ],
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
  {
    id: "session_air_fryer_missing_proof",
    name: "会话 02",
    caseId: "air_fryer_missing_proof",
    targetTitle: "空气炸锅缺证明素材",
    description: "没有 proof/comparison 素材，需要识别证明段缺口并给出补拍或 AIGC 建议。",
    status: "needs_review",
    stage: "plan",
    variant: "balanced",
    materialCount: 3,
    gapProfile: "缺证明素材",
    sellingPoints: ["少油", "外酥里嫩", "易清洗"],
    materialBrief: "已有 hook、过程镜头和 CTA，缺少前后对比或结果证明镜头。",
    artifacts: [
      {label: "Structure DNA", type: "json", state: "ready"},
      {label: "Material Library", type: "json", state: "ready"},
      {label: "Edit Plan", type: "json", state: "ready"},
      {label: "AIGC 补全建议", type: "guide", state: "ready"},
    ],
    oneStopCapture: demoSessionsBaseCapture(),
    sample: {
      label: "Sample",
      videoSrc: "/sample-55702300.mov",
      fileName: "55702300.mov",
      durationLabel: "18.4s",
      aspectRatio: "竖屏样例",
    },
    result: {
      label: "Plan",
      videoSrc: "/poster-demo-v5.mp4",
      fileName: "proof-gap-plan.mp4",
      renderVersion: "balanced",
    },
    inputs: {
      materials: ["hook 口播", "商品过程镜头", "CTA 片段"],
      aigc: ["证明段前后对比", "卖点卡片", "局部放大补镜"],
      creativeBrief: "保留样例五段结构，证明段缺素材时用 AIGC 对比图和文案卡片补齐可信度。",
    },
  },
  {
    id: "session_beauty_sunscreen_conversion",
    name: "会话 03",
    caseId: "beauty_sunscreen_conversion",
    targetTitle: "防晒霜转化型带货",
    description: "美妆护肤场景，素材覆盖痛点、涂抹过程、前后对比和购买 CTA。",
    status: "ready",
    stage: "preview",
    variant: "high_conversion",
    materialCount: 5,
    gapProfile: "素材覆盖完整",
    sellingPoints: ["轻薄不搓泥", "通勤防晒", "敏感肌可用"],
    materialBrief: "素材覆盖脸部开场、晒伤痛点、涂抹过程、前后对比和购买 CTA。",
    artifacts: [
      {label: "Structure DNA", type: "json", state: "ready"},
      {label: "Material Library", type: "json", state: "ready"},
      {label: "高转化 Edit Plan", type: "json", state: "ready"},
      {label: "剪辑指导", type: "guide", state: "ready"},
    ],
    oneStopCapture: demoSessionsBaseCapture(),
    sample: {
      label: "Sample",
      videoSrc: "/sample-55702300.mov",
      fileName: "55702300.mov",
      durationLabel: "18.4s",
      aspectRatio: "竖屏样例",
    },
    result: {
      label: "Preview",
      videoSrc: "/poster-demo-v5.mp4",
      fileName: "sunscreen-conversion-preview.mp4",
      renderVersion: "high_conversion",
    },
    inputs: {
      materials: ["脸部开场", "晒伤痛点", "涂抹过程", "前后对比", "购买 CTA"],
      aigc: ["功效字幕", "信任背书卡", "购买理由强化"],
      creativeBrief: "把样例结构迁移到防晒霜带货，强化证明段和购买理由。",
    },
  },
  {
    id: "session_english_course_knowledge",
    name: "会话 04",
    caseId: "english_course_knowledge",
    targetTitle: "英语口语课知识转化",
    description: "知识课/课程售卖场景，教程、反馈文案和报名 CTA 组合成结构迁移方案。",
    status: "ready",
    stage: "plan",
    variant: "high_click",
    materialCount: 5,
    gapProfile: "文案素材补证明",
    sellingPoints: ["三步纠音", "真人反馈", "免费体验课"],
    materialBrief: "素材有教程、反馈文案和报名 CTA，适合从带货结构迁移到知识转化。",
    artifacts: [
      {label: "Structure DNA", type: "json", state: "ready"},
      {label: "Material Library", type: "json", state: "ready"},
      {label: "高点击 Edit Plan", type: "json", state: "ready"},
      {label: "预览视频", type: "video", state: "pending"},
    ],
    oneStopCapture: demoSessionsBaseCapture(),
    sample: {
      label: "Sample",
      videoSrc: "/sample-55702300.mov",
      fileName: "55702300.mov",
      durationLabel: "18.4s",
      aspectRatio: "竖屏样例",
    },
    result: {
      label: "Plan",
      videoSrc: "/poster-demo-v5.mp4",
      fileName: "course-high-click-plan.mp4",
      renderVersion: "high_click",
    },
    inputs: {
      materials: ["开场口播", "发音痛点", "教程录屏", "学员反馈文案", "报名 CTA"],
      aigc: ["课程步骤卡", "学员反馈卡", "报名按钮动效"],
      creativeBrief: "用高点击开头承接知识焦虑，再把 proof 段改成学员反馈和体验课 CTA。",
    },
  },
  {
    id: "session_weak_materials_stress_test",
    name: "会话 05",
    caseId: "weak_materials_stress_test",
    targetTitle: "弱素材压力测试",
    description: "素材质量和语义都偏弱，用来展示 missing/weak_match 和补全策略是否清楚。",
    status: "needs_review",
    stage: "materials",
    variant: "balanced",
    materialCount: 3,
    gapProfile: "多槽位弱匹配",
    sellingPoints: ["省时", "高颜值"],
    materialBrief: "只有随机 b-roll、横屏模糊产品图和音频，适合演示缺口识别和补全解释。",
    artifacts: [
      {label: "Structure DNA", type: "json", state: "ready"},
      {label: "Material Library", type: "json", state: "ready"},
      {label: "缺口报告", type: "guide", state: "ready"},
      {label: "结果视频", type: "video", state: "pending"},
    ],
    oneStopCapture: demoSessionsBaseCapture(),
    sample: {
      label: "Sample",
      videoSrc: "/sample-55702300.mov",
      fileName: "55702300.mov",
      durationLabel: "18.4s",
      aspectRatio: "竖屏样例",
    },
    result: {
      label: "Risk",
      videoSrc: "/poster-demo-v5.mp4",
      fileName: "weak-materials-risk-plan.mp4",
      renderVersion: "balanced",
    },
    inputs: {
      materials: ["随机 b-roll", "横屏模糊产品图", "音频口播"],
      aigc: ["核心卖点镜头", "证明段", "CTA 收口"],
      creativeBrief: "明确指出素材不足，不硬剪；用结构重排、AIGC 镜头和包装卡片补齐。",
    },
  },
];

function demoSessionsBaseCapture(): DemoSession["oneStopCapture"] {
  return {
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
  };
}
