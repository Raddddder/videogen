import {Audio} from "@remotion/media";
import {
  AbsoluteFill,
  interpolate,
  interpolateColors,
  random,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const cnFont =
  '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';
const displayFont =
  '"Arial Black", "Impact", "Helvetica Neue Condensed", Arial, sans-serif';
const monoFont =
  '"Arial Narrow", "Helvetica Neue Condensed", "Roboto Condensed", Arial, sans-serif';

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const copy = {
  title: ["造物  逐空", "焕新"],
  meta: ["展览时间： 2026.05.09-11", "展览地点： 09C座一楼展厅"],
  department: ["产品设计系", "毕业", "作品展"],
  englishDepartment: [
    "Graduation Exhibition",
    "of Product",
    "Design Department",
  ],
  verticalWords: ["CREATION", "EMPTINESS", "RENEWAL"],
  year: "2026",
  logoCn: ["造物", "逐空", "焕新"],
  logoEn: ["GRADUATION", "EXHIBITION"],
  cornerLeft: ["PRODUCT DESIGN", "2026"],
  cornerCenter: ["Product Design", "2026"],
  watermark: "曹振凯 0084",
  ribbonPhrase:
    "PURSUIT OF EMPTINESS · RENEWAL · CREATION · OPEN SPACE · PRODUCT DESIGN · ",
};

const palettes = [
  {
    bg: "#f7f6f0",
    card: "rgba(248, 247, 241, 0.88)",
    text: "#24252a",
    muted: "rgba(36, 37, 42, 0.68)",
    accent: "#2457ea",
    ribbonA: "#2932f7",
    ribbonB: "#8f90ff",
    ribbonC: "#e3e5ff",
    ribbonText: "rgba(12, 15, 72, 0.72)",
    shadow: "rgba(37, 40, 156, 0.18)",
  },
  {
    bg: "#f4f8f6",
    card: "rgba(245, 250, 247, 0.88)",
    text: "#142625",
    muted: "rgba(20, 38, 37, 0.66)",
    accent: "#008f89",
    ribbonA: "#00a5a8",
    ribbonB: "#69f1cf",
    ribbonC: "#d7fff4",
    ribbonText: "rgba(4, 49, 51, 0.72)",
    shadow: "rgba(0, 136, 130, 0.17)",
  },
  {
    bg: "#f9f4f1",
    card: "rgba(250, 246, 242, 0.88)",
    text: "#2e2225",
    muted: "rgba(46, 34, 37, 0.66)",
    accent: "#de3d7c",
    ribbonA: "#ff4b8a",
    ribbonB: "#ffb05e",
    ribbonC: "#ffe3be",
    ribbonText: "rgba(73, 22, 40, 0.72)",
    shadow: "rgba(224, 72, 117, 0.17)",
  },
  {
    bg: "#f4f5fa",
    card: "rgba(245, 246, 252, 0.88)",
    text: "#1c2132",
    muted: "rgba(28, 33, 50, 0.66)",
    accent: "#5b49e6",
    ribbonA: "#1b2035",
    ribbonB: "#6f6dff",
    ribbonC: "#d9d8ff",
    ribbonText: "rgba(12, 15, 30, 0.72)",
    shadow: "rgba(28, 32, 53, 0.2)",
  },
];

type Palette = (typeof palettes)[number];

const getPalette = (frame: number, fps: number): Palette => {
  const segmentFrames = Math.round(4.5 * fps);
  const transitionFrames = Math.round(0.45 * fps);
  const segment = Math.floor(frame / segmentFrames) % palettes.length;
  const local = frame % segmentFrames;
  const current = palettes[segment];
  const next = palettes[(segment + 1) % palettes.length];

  if (local < segmentFrames - transitionFrames) {
    return current;
  }

  const range: [number, number] = [segmentFrames - transitionFrames, segmentFrames];
  return {
    bg: interpolateColors(local, range, [current.bg, next.bg]),
    card: current.card,
    text: interpolateColors(local, range, [current.text, next.text]),
    muted: interpolateColors(local, range, [current.muted, next.muted]),
    accent: interpolateColors(local, range, [current.accent, next.accent]),
    ribbonA: interpolateColors(local, range, [current.ribbonA, next.ribbonA]),
    ribbonB: interpolateColors(local, range, [current.ribbonB, next.ribbonB]),
    ribbonC: interpolateColors(local, range, [current.ribbonC, next.ribbonC]),
    ribbonText: current.ribbonText,
    shadow: current.shadow,
  };
};

const ribbonPaths = [
  "M -230 1650 C 90 1290, 360 1125, 665 984 C 1005 826, 1060 548, 786 338 C 610 204, 408 248, 430 456 C 456 632, 732 515, 1230 245",
];

export const MarketingRibbonVideo = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const palette = getPalette(frame, fps);

  return (
    <AbsoluteFill
      style={{
        background: palette.bg,
        color: palette.text,
        overflow: "hidden",
        fontFamily: cnFont,
        WebkitFontSmoothing: "antialiased",
        textRendering: "geometricPrecision",
      }}
    >
      <Audio
        src={staticFile("hazy-after-hours.mp3")}
        trimBefore={0}
        trimAfter={18 * fps}
        volume={(f) =>
          interpolate(f, [0, 1.2 * fps, 16.6 * fps, 18 * fps], [0, 0.82, 0.82, 0], clamp)
        }
      />
      <PaperTexture />
      <BackgroundMarks />
      <ScrollingTextCards palette={palette} />
      <RibbonField palette={palette} depth="front" />
      <BeatBar palette={palette} />
      <Vignette />
    </AbsoluteFill>
  );
};

const ScrollingTextCards = ({palette}: {palette: Palette}) => {
  const frame = useCurrentFrame();
  const posterWidth = 1080;
  const posterHeight = 1920;
  const travel = posterWidth;
  const offset = Math.round((frame * 2.4) % travel);

  return (
    <AbsoluteFill style={{pointerEvents: "none"}}>
      {Array.from({length: 3}).map((_, index) => (
        <PosterTextPanel
          key={index}
          palette={palette}
          x={-offset + index * travel}
          width={posterWidth}
          height={posterHeight}
        />
      ))}
    </AbsoluteFill>
  );
};

const PosterTextPanel = ({
  palette,
  x,
  width,
  height,
}: {
  palette: Palette;
  x: number;
  width: number;
  height: number;
}) => {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width,
        height,
        transform: `translate3d(${x}px, 0, 0)`,
        background: "transparent",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, rgba(0,0,0,0.028) 1px, transparent 1px), linear-gradient(0deg, rgba(0,0,0,0.028) 1px, transparent 1px)",
          backgroundSize: "96px 96px",
          opacity: 0.28,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 68,
          top: 68,
          fontSize: 82,
          fontWeight: 900,
          lineHeight: 0.96,
          letterSpacing: 0,
          color: palette.text,
        }}
      >
        {copy.title[0]}
        <br />
        <span style={{paddingLeft: 132}}>{copy.title[1]}</span>
      </div>

      <div
        style={{
          position: "absolute",
          left: 508,
          top: 72,
          fontSize: 29,
          fontWeight: 850,
          lineHeight: 1.25,
          color: palette.text,
        }}
      >
        {copy.meta[0]}
        <br />
        {copy.meta[1]}
      </div>

      <div
        style={{
          position: "absolute",
          left: 116,
          top: 348,
          width: 300,
          fontSize: 45,
          fontWeight: 900,
          lineHeight: 1.28,
          textAlign: "center",
          color: palette.text,
        }}
      >
        {copy.department.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: 64,
          top: 584,
          width: 390,
          fontFamily: monoFont,
          fontSize: 39,
          fontWeight: 850,
          lineHeight: 1.08,
          textAlign: "center",
          color: palette.text,
        }}
      >
        {copy.englishDepartment.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: 150,
          top: 810,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          fontFamily: displayFont,
          fontSize: 61,
          lineHeight: 0.9,
          fontWeight: 900,
          color: palette.text,
        }}
      >
        {copy.verticalWords.map((word) => (
          <div key={word}>{word}</div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: 600,
          top: 1268,
          width: 360,
        }}
      >
        <div
          style={{
            fontFamily: displayFont,
            fontSize: 118,
            fontWeight: 900,
            lineHeight: 0.78,
            color: palette.accent,
            letterSpacing: 0,
          }}
        >
          {copy.year}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "104px 202px",
            columnGap: 22,
            alignItems: "start",
            marginTop: 20,
            color: palette.text,
          }}
        >
          <div
            style={{
              fontSize: 44,
              fontWeight: 900,
              lineHeight: 1.03,
              whiteSpace: "nowrap",
            }}
          >
            {copy.logoCn.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
          <div
            style={{
              fontSize: 29,
              fontWeight: 900,
              lineHeight: 1.15,
            }}
          >
            {copy.department.map((line) => (
              <div key={line}>{line}</div>
            ))}
            <div
              style={{
                fontFamily: monoFont,
                fontSize: 20,
                lineHeight: 1.02,
                marginTop: 14,
                letterSpacing: 0.5,
              }}
            >
              {copy.logoEn.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 86,
          bottom: 70,
          fontFamily: monoFont,
          fontSize: 19,
          fontWeight: 850,
          lineHeight: 1.1,
          color: palette.muted,
        }}
      >
        {copy.cornerLeft.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: 406,
          bottom: 52,
          fontFamily: monoFont,
          fontSize: 34,
          fontWeight: 850,
          lineHeight: 1.04,
          textAlign: "center",
          color: palette.muted,
        }}
      >
        {copy.cornerCenter.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    </div>
  );
};

const RibbonField = ({
  palette,
  depth,
}: {
  palette: Palette;
  depth: "back" | "front";
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const beat = (Math.sin((frame / fps) * Math.PI * 4) + 1) / 2;
  const isFront = depth === "front";
  const baseOpacity = isFront ? 0.5 : 0.72;

  return (
    <svg
      viewBox="0 0 1080 1920"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "visible",
        pointerEvents: "none",
        opacity: baseOpacity,
      }}
    >
      <defs>
        <linearGradient id={`ribbon-${depth}`} x1="0%" x2="100%" y1="0%" y2="0%">
          <stop offset="0%" stopColor={palette.ribbonC} stopOpacity="0.22" />
          <stop offset="34%" stopColor={palette.ribbonB} stopOpacity="0.68" />
          <stop offset="62%" stopColor={palette.ribbonA} stopOpacity="0.9" />
          <stop offset="100%" stopColor={palette.ribbonC} stopOpacity="0.28" />
        </linearGradient>
        <linearGradient id={`shine-${depth}`} x1="0%" x2="100%" y1="0%" y2="0%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ribbonPaths.map((path, index) => (
        <RibbonLayer
          key={`${depth}-${path}`}
          id={`${depth}-${index}`}
          path={path}
          palette={palette}
          depth={depth}
          index={index}
          beat={beat}
        />
      ))}
    </svg>
  );
};

const RibbonLayer = ({
  id,
  path,
  palette,
  depth,
  index,
  beat,
}: {
  id: string;
  path: string;
  palette: Palette;
  depth: "back" | "front";
  index: number;
  beat: number;
}) => {
  const frame = useCurrentFrame();
  const phase = index * 92 + (depth === "front" ? 130 : 0);
  const rotate = Math.sin((frame + phase) / 58) * 7 + frame * 0.018 * (index % 2 === 0 ? 1 : -1);
  const shiftY = ((frame * (1.9 + index * 0.28) + phase) % 420) - 210;
  const shiftX = Math.sin((frame + phase) / 45) * 28;
  const scale = 1 + Math.sin((frame + phase) / 72) * 0.035;
  const textShift = ((frame * (4.6 + index) + phase * 7) % 2100) - 700;
  const width = 76 + index * 12 + beat * 5;
  const alpha = depth === "front" ? 0.58 - index * 0.09 : 0.74 - index * 0.08;
  const transform = `translate(${shiftX.toFixed(2)} ${shiftY.toFixed(2)}) rotate(${rotate.toFixed(
    3,
  )} 540 960) scale(${scale.toFixed(4)} 1)`;

  return (
    <g transform={transform}>
      <defs>
        <path id={`path-${id}`} d={path} />
      </defs>
      <path
        d={path}
        fill="none"
        stroke={palette.shadow}
        strokeWidth={width + 18}
        strokeLinecap="round"
        opacity={0.55 * alpha}
        transform="translate(0 24)"
      />
      <path
        d={path}
        fill="none"
        stroke={`url(#ribbon-${depth})`}
        strokeWidth={width}
        strokeLinecap="round"
        opacity={alpha}
      />
      <path
        d={path}
        fill="none"
        stroke={`url(#shine-${depth})`}
        strokeWidth={Math.max(18, width * 0.28)}
        strokeLinecap="round"
        opacity={0.45}
        strokeDasharray="260 560"
        strokeDashoffset={-frame * (2.6 + index)}
      />
      <text
        fontFamily={monoFont}
        fontSize={36 + index * 3}
        fontWeight="800"
        letterSpacing="5"
        fill={palette.ribbonText}
        opacity={0.72}
      >
        <textPath href={`#path-${id}`} startOffset={`${textShift}px`}>
          {copy.ribbonPhrase.repeat(12)}
        </textPath>
      </text>
    </g>
  );
};

const BeatBar = ({palette}: {palette: Palette}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const beat = (Math.sin((frame / fps) * Math.PI * 4) + 1) / 2;

  return (
    <div
      style={{
        position: "absolute",
        right: 88,
        bottom: 78,
        width: 118,
        height: 5,
      }}
    >
      <div
        style={{
          width: 118,
          height: 5,
          background: `linear-gradient(90deg, ${palette.ribbonA}, ${palette.ribbonB})`,
          transform: `scaleX(${0.55 + beat * 0.45})`,
          transformOrigin: "left center",
        }}
      />
    </div>
  );
};

const BackgroundMarks = () => {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "linear-gradient(90deg, rgba(0,0,0,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(0,0,0,0.035) 1px, transparent 1px)",
        backgroundSize: "96px 96px",
        opacity: 0.12,
      }}
    />
  );
};

const PaperTexture = () => {
  return (
    <AbsoluteFill>
      {Array.from({length: 70}).map((_, index) => {
        const size = 1 + random(`size-${index}`) * 2.2;
        const left = random(`left-${index}`) * 100;
        const top = random(`top-${index}`) * 100;
        const opacity = 0.035 + random(`opacity-${index}`) * 0.035;

        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: `${top}%`,
              width: size,
              height: size,
              borderRadius: 999,
              background: `rgba(0, 0, 0, ${opacity})`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

const Vignette = () => {
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        background:
          "linear-gradient(180deg, rgba(0,0,0,0.04), transparent 13%, transparent 80%, rgba(0,0,0,0.1)), radial-gradient(circle at 50% 48%, transparent 52%, rgba(0,0,0,0.07) 100%)",
        mixBlendMode: "multiply",
      }}
    />
  );
};
