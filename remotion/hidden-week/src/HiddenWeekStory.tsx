import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {mapShapes, storyStats, wards} from "./generatedData";

const WIDTH = 1280;
const HEIGHT = 720;
const lime = "#a3e635";
const teal = "#2dd4bf";
const yellow = "#facc15";
const orange = "#f97316";
const red = "#ef4444";
const ink = "#f8fafc";
const muted = "#cbd5e1";
const panel = "rgba(15, 23, 42, 0.84)";
const mapLand = "#f4fbf8";
const mapWater = "#d7eef5";
const mapLine = "#99b8bf";

type Ward = (typeof wards)[number];
type AnchoredWard = Ward & {x: number; y: number};
type Shape = (typeof mapShapes)[number];

const nf = new Intl.NumberFormat("en-GB");
const one = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;

const hexToRgb = (hex: string) => {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
};

const blend = (from: string, to: string, amount: number) => {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return `rgb(${Math.round(mix(a.r, b.r, amount))}, ${Math.round(mix(a.g, b.g, amount))}, ${Math.round(mix(a.b, b.b, amount))})`;
};

const ramp = (amount: number) => {
  const t = clamp(amount);
  if (t < 0.38) return blend("#34d399", yellow, t / 0.38);
  if (t < 0.72) return blend(yellow, orange, (t - 0.38) / 0.34);
  return blend(orange, red, (t - 0.72) / 0.28);
};

const centroidFromPath = (d: string) => {
  const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  let x = 0;
  let y = 0;
  let count = 0;
  for (let index = 0; index < numbers.length - 1; index += 2) {
    x += numbers[index];
    y += numbers[index + 1];
    count += 1;
  }
  return count ? {x: x / count, y: y / count, count} : {x: WIDTH / 2, y: HEIGHT / 2, count: 1};
};

const anchorKey = (ward: Pick<Ward, "ward" | "lad">) => `${ward.ward}|||${ward.lad}`;
const wardAnchors = new Map<string, {x: number; y: number; count: number}>();

for (const shape of mapShapes) {
  const centroid = centroidFromPath(shape.d);
  const key = `${shape.ward}|||${shape.lad}`;
  const current = wardAnchors.get(key) ?? {x: 0, y: 0, count: 0};
  current.x += centroid.x * centroid.count;
  current.y += centroid.y * centroid.count;
  current.count += centroid.count;
  wardAnchors.set(key, current);
}

const withAnchor = <T extends Ward>(ward: T): T & {x: number; y: number} => {
  const anchor = wardAnchors.get(anchorKey(ward));
  return {
    ...ward,
    x: anchor ? anchor.x / anchor.count : WIDTH / 2,
    y: anchor ? anchor.y / anchor.count : HEIGHT / 2,
  };
};

const anchoredWards = wards.map((ward) => withAnchor(ward));
const byWard = (name: string) => anchoredWards.find((ward) => ward.ward === name) as AnchoredWard;
const topBurden = withAnchor(storyStats.topWards[0] as Ward);
const stackFocus = byWard("Walker");
const lowFocus = byWard("North Jesmond");

const hoursExtent = wards.reduce(
  (acc, ward) => [Math.min(acc[0], ward.olderHours), Math.max(acc[1], ward.olderHours)],
  [Infinity, -Infinity],
);

const shapeExtent = mapShapes.reduce(
  (acc, shape) => [Math.min(acc[0], shape.olderHours), Math.max(acc[1], shape.olderHours)],
  [Infinity, -Infinity],
);

const normHours = (value: number) => (value - hoursExtent[0]) / (hoursExtent[1] - hoursExtent[0]);
const normShape = (shape: Shape) =>
  (shape.olderHours - shapeExtent[0]) / (shapeExtent[1] - shapeExtent[0]);

const sceneProgress = (frame: number, fps: number, start: number, end: number) =>
  interpolate(frame, [start * fps, end * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

const slowProgress = (frame: number, fps: number, start: number, end: number) =>
  interpolate(frame, [start * fps, end * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.sin),
  });

const opacityFor = (frame: number, fps: number, start: number, end: number) => {
  const fade = 0.8 * fps;
  return Math.min(
    interpolate(frame, [start * fps, start * fps + fade], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    interpolate(frame, [end * fps - fade, end * fps], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
};

const camera = (frame: number, fps: number) => {
  const toTop = slowProgress(frame, fps, 27, 39);
  const toWalker = slowProgress(frame, fps, 39, 53);
  const toLow = slowProgress(frame, fps, 53, 66);
  const home = slowProgress(frame, fps, 66, 76);

  if (frame >= 27 * fps && frame < 39 * fps) {
    return {
      scale: interpolate(toTop, [0, 1], [1.08, 5.65]),
      x: mix(WIDTH / 2, topBurden.x, toTop),
      y: mix(HEIGHT / 2, topBurden.y, toTop),
    };
  }

  if (frame >= 39 * fps && frame < 53 * fps) {
    return {
      scale: interpolate(toWalker, [0, 1], [5.05, 6.3]),
      x: mix(topBurden.x, stackFocus.x, toWalker),
      y: mix(topBurden.y, stackFocus.y, toWalker),
    };
  }

  if (frame >= 53 * fps && frame < 66 * fps) {
    return {
      scale: interpolate(toLow, [0, 1], [5.5, 6.1]),
      x: mix(stackFocus.x, lowFocus.x, toLow),
      y: mix(stackFocus.y, lowFocus.y, toLow),
    };
  }

  if (frame >= 66 * fps && frame < 76 * fps) {
    return {
      scale: interpolate(home, [0, 1], [5.15, 1.08]),
      x: mix(lowFocus.x, WIDTH / 2, home),
      y: mix(lowFocus.y, HEIGHT / 2, home),
    };
  }

  return {scale: 1.06, x: WIDTH / 2, y: HEIGHT / 2};
};

const Clock = ({progress}: {progress: number}) => {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayIndex = Math.min(6, Math.floor(progress * 7));
  const hour = Math.min(23, Math.floor((progress * 7 * 24) % 24));
  const hand = progress * 360 * 7 - 90;

  return (
    <div style={styles.clockWrap}>
      <svg width="170" height="170" viewBox="0 0 170 170">
        <circle cx="85" cy="85" r="76" fill="rgba(2,6,23,0.78)" stroke="rgba(226,232,240,0.18)" strokeWidth="2" />
        <circle
          cx="85"
          cy="85"
          r="64"
          fill="none"
          stroke={lime}
          strokeWidth="9"
          strokeDasharray={`${progress * 402} 402`}
          transform="rotate(-90 85 85)"
        />
        {Array.from({length: 12}).map((_, i) => {
          const angle = (i / 12) * Math.PI * 2;
          return (
            <line
              key={i}
              x1={85 + Math.cos(angle) * 52}
              y1={85 + Math.sin(angle) * 52}
              x2={85 + Math.cos(angle) * 62}
              y2={85 + Math.sin(angle) * 62}
              stroke="rgba(248,250,252,0.5)"
              strokeWidth="2"
            />
          );
        })}
        <line
          x1="85"
          y1="85"
          x2={85 + Math.cos((hand * Math.PI) / 180) * 50}
          y2={85 + Math.sin((hand * Math.PI) / 180) * 50}
          stroke={teal}
          strokeWidth="5"
          strokeLinecap="round"
        />
        <circle cx="85" cy="85" r="6" fill={ink} />
      </svg>
      <div>
        <strong>{days[dayIndex]}</strong>
        <span>{String(hour).padStart(2, "0")}:00</span>
      </div>
    </div>
  );
};

const ShapePath = ({
  shape,
  rise,
  highlight,
}: {
  shape: Shape;
  rise: number;
  highlight: boolean;
}) => {
  const norm = clamp(normShape(shape));
  const lift = rise * (5 + norm * 44 + (highlight ? 18 : 0));
  const fill = ramp(norm);
  const sideFill = blend("#5b7c82", "#7f1d1d", norm);
  const sideLayers = Math.max(0, Math.min(7, Math.round(lift / 8)));

  return (
    <g>
      <path
        d={shape.d}
        fill="rgba(13, 30, 36, 0.24)"
        opacity={0.08 + norm * 0.1}
        transform={`translate(${lift * 0.55}, ${lift * 0.62})`}
      />
      {Array.from({length: sideLayers}).map((_, index) => {
        const step = index + 1;
        return (
          <path
            key={step}
            d={shape.d}
            fill={sideFill}
            opacity={0.13 + norm * 0.12}
            stroke="rgba(8, 47, 73, 0.08)"
            strokeWidth={0.45}
            transform={`translate(${step * 0.9}, ${-lift + step * 4.8})`}
          />
        );
      })}
      <path
        d={shape.d}
        fill={fill}
        opacity={highlight ? 1 : 0.62 + norm * 0.28}
        stroke={highlight ? "rgba(15,23,42,0.96)" : "rgba(15,23,42,0.28)"}
        strokeWidth={highlight ? 1.35 : 0.42}
        transform={`translate(0, ${-lift})`}
      />
    </g>
  );
};

const WardColumn = ({ward, rise, active}: {ward: AnchoredWard; rise: number; active: boolean}) => {
  const norm = clamp(normHours(ward.olderHours));
  const height = rise * (5 + norm * 24);
  const width = active ? 5 : 3;
  const fill = ramp(norm);

  return (
    <g transform={`translate(${ward.x}, ${ward.y})`} opacity={active ? 0.9 : 0}>
      <rect
        x={-width / 2}
        y={-height}
        width={width}
        height={height}
        fill={fill}
        stroke="rgba(2,6,23,0.68)"
        strokeWidth="1"
      />
      <path
        d={`M ${-width * 1.4} ${-height} L 0 ${-height - width} L ${width * 1.4} ${-height} L 0 ${-height + width} Z`}
        fill={fill}
        stroke="rgba(248,250,252,0.55)"
        strokeWidth="1"
      />
    </g>
  );
};

const MapLayer = ({frame, fps}: {frame: number; fps: number}) => {
  const rise = sceneProgress(frame, fps, 19, 43);
  const cam = camera(frame, fps);
  const topScene = frame >= 29 * fps && frame < 39 * fps;
  const walkerScene = frame >= 39 * fps && frame < 53 * fps;
  const lowScene = frame >= 53 * fps && frame < 66 * fps;
  const stackScene = frame >= 66 * fps;

  return (
    <svg style={styles.mapSvg} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
      <defs>
        <linearGradient id="mapBackground" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ecfdf5" />
          <stop offset="48%" stopColor={mapLand} />
          <stop offset="100%" stopColor="#eef8ff" />
        </linearGradient>
        <pattern id="mapGrid" width="52" height="52" patternUnits="userSpaceOnUse">
          <path d="M 52 0 L 0 0 0 52" fill="none" stroke="rgba(12, 74, 110, 0.13)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill={mapWater} />
      <path
        d="M0 62 C154 35 246 70 362 45 C528 10 612 46 753 31 C916 14 1060 37 1280 7 L1280 720 L0 720 Z"
        fill="url(#mapBackground)"
      />
      <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="url(#mapGrid)" opacity="0.42" />
      <g opacity="0.38">
        <path d="M205 560 C305 496 405 492 526 432 C658 367 760 390 920 312" fill="none" stroke={mapLine} strokeWidth="4" strokeLinecap="round" />
        <path d="M230 222 C382 236 534 210 698 230 C812 244 914 220 1058 180" fill="none" stroke={mapLine} strokeWidth="2.2" strokeLinecap="round" />
        <path d="M480 662 C532 545 590 488 668 410 C742 337 792 260 842 118" fill="none" stroke={mapLine} strokeWidth="2" strokeLinecap="round" />
      </g>
      <g
        style={{
          transform: `translate(${WIDTH / 2}px, ${HEIGHT / 2}px) scale(${cam.scale}) translate(${-cam.x}px, ${-cam.y}px)`,
          transformOrigin: "0 0",
        }}
      >
        {mapShapes.map((shape) => {
          const highlight =
            (topScene && shape.ward === topBurden.ward && shape.lad === topBurden.lad) ||
            (walkerScene && shape.ward === stackFocus.ward && shape.lad === stackFocus.lad) ||
            (lowScene && shape.ward === lowFocus.ward && shape.lad === lowFocus.lad);
          return <ShapePath key={shape.code} shape={shape} rise={rise} highlight={highlight} />;
        })}
        {anchoredWards.map((ward) => {
          const active =
            storyStats.topWards.slice(0, 8).some((row) => row.code === ward.code) ||
            (stackScene && ward.stack > 5.5) ||
            (lowScene && ward.code === lowFocus.code);
          return <WardColumn key={ward.code} ward={ward} rise={rise} active={active} />;
        })}
      </g>
    </svg>
  );
};

const PlaceLabel = ({ward, side = "right"}: {ward: AnchoredWard; side?: "left" | "right"}) => (
  <div style={{...styles.placeLabel, ...(side === "left" ? {left: 72} : {right: 72})}}>
    <span>{ward.ward}, {ward.lad}</span>
    <strong>{one.format(ward.olderHours)} hrs/100 residents aged 65+</strong>
    <small>D{one.format(ward.decileMean)} · {one.format(ward.badHealth)}% bad/very bad health · {one.format(ward.limited)}% disability limited a lot</small>
  </div>
);

const ComparisonBars = ({progress}: {progress: number}) => {
  const high = storyStats.highFifth;
  const low = storyStats.lowFifth;
  const maxHours = Math.max(high.hours, low.hours);
  return (
    <div style={styles.comparison}>
      {[
        {label: "Highest older-care burden fifth", data: high, color: red},
        {label: "Lowest older-care burden fifth", data: low, color: "#34d399"},
      ].map((row) => (
        <div key={row.label} style={styles.barRow}>
          <div style={styles.barMeta}>
            <strong>{row.label}</strong>
            <span>D{one.format(row.data.decileMean)} average · {one.format(row.data.badHealth)}% bad health · {one.format(row.data.limited)}% disability limited a lot</span>
          </div>
          <div style={styles.barTrack}>
            <div
              style={{
                ...styles.barFill,
                width: `${(row.data.hours / maxHours) * progress * 100}%`,
                background: row.color,
              }}
            />
          </div>
          <b>{one.format(row.data.hours)} hrs/100</b>
        </div>
      ))}
    </div>
  );
};

export const HiddenWeekStory = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const clockProgress = sceneProgress(frame, fps, 7, 24);
  const totalHours = Math.round(storyStats.totalOlderHours * clockProgress);
  const titleOpacity = opacityFor(frame, fps, 0, 8.5);
  const clockOpacity = opacityFor(frame, fps, 7, 25.5);
  const mapOpacity = sceneProgress(frame, fps, 16, 22);
  const riseTextOpacity = opacityFor(frame, fps, 21, 34);
  const topOpacity = opacityFor(frame, fps, 31, 43);
  const stackOpacity = opacityFor(frame, fps, 43, 56);
  const lowOpacity = opacityFor(frame, fps, 56, 68);
  const compareOpacity = opacityFor(frame, fps, 68, 83);
  const limitOpacity = opacityFor(frame, fps, 83, 90);
  const compareProgress = sceneProgress(frame, fps, 69, 78);

  return (
    <AbsoluteFill style={styles.root}>
      <div style={styles.grid} />
      <div style={styles.vignette} />
      <div style={{...styles.mapWrap, opacity: mapOpacity}}>
        <MapLayer frame={frame} fps={fps} />
      </div>

      <div style={{...styles.titleCard, opacity: titleOpacity}}>
        <p style={styles.kicker}>Gerostats data story · 9 June 2026</p>
        <h1 style={styles.title}>The hidden week</h1>
        <p style={styles.lede}>Older people providing unpaid care across Tyne and Wear.</p>
      </div>

      <div style={{...styles.clockScene, opacity: clockOpacity}}>
        <Clock progress={clockProgress} />
        <div>
          <p style={styles.kicker}>The weekly clock</p>
          <h2 style={styles.bigNumber}>{nf.format(totalHours)}</h2>
          <p style={styles.body}>minimum care-hours provided by people aged 65+ each week.</p>
          <p style={styles.note}>{nf.format(storyStats.olderCarers)} older people are providing that unpaid care.</p>
        </div>
      </div>

      <div style={{...styles.panel, ...styles.rightPanel, opacity: riseTextOpacity}}>
        <p style={styles.kicker}>As the clock fills</p>
        <h2 style={styles.panelTitle}>The surface rises unevenly.</h2>
        <p style={styles.body}>Each raised area starts at LSOA level and is read through the ward it belongs to.  Height is minimum care-hours from people aged 65+ per 100 residents aged 65+.</p>
      </div>

      <div style={{opacity: topOpacity}}>
        <PlaceLabel ward={topBurden} />
        <div style={{...styles.panel, ...styles.leftPanel}}>
          <p style={styles.kicker}>Highest older-care burden</p>
          <h2 style={styles.panelTitle}>{topBurden.ward} rises first.</h2>
          <p style={styles.body}>The lower-bound burden is {one.format(topBurden.olderHours)} hours per 100 residents aged 65+.  It sits in a ward with D{one.format(topBurden.decileMean)} deprivation and {one.format(topBurden.badHealth)}% bad or very bad health.</p>
        </div>
      </div>

      <div style={{opacity: stackOpacity}}>
        <PlaceLabel ward={stackFocus} />
        <div style={{...styles.panel, ...styles.leftPanel}}>
          <p style={styles.kicker}>Intersectionality</p>
          <h2 style={styles.panelTitle}>Walker shows the intersection clearly.</h2>
          <p style={styles.body}>Older care, 50+ hour caring, deprivation, poor health and disability intersect here.  Imagine what would happen if this unpaid care stopped.</p>
        </div>
      </div>

      <div style={{opacity: lowOpacity}}>
        <PlaceLabel ward={lowFocus} side="left" />
        <div style={{...styles.panel, ...styles.rightPanel}}>
          <p style={styles.kicker}>A different local week</p>
          <h2 style={styles.panelTitle}>North Jesmond stays low.</h2>
          <p style={styles.body}>The lower-bound burden is {one.format(lowFocus.olderHours)} hours per 100 residents aged 65+, with lower area-level poor health and disability.  Same city-region, different load.</p>
        </div>
      </div>

      <div style={{...styles.stackScene, opacity: compareOpacity}}>
        <p style={styles.kicker}>What the data support</p>
        <h2 style={styles.panelTitle}>Older care intersects with deprivation, poor health and disability.</h2>
        <ComparisonBars progress={compareProgress} />
        <p style={styles.body}>This is area context, not an individual diagnosis: the data show where older care, deprivation, poor health and disability intersect.</p>
      </div>

      <div style={{...styles.limitScene, opacity: limitOpacity}}>
        <p style={styles.kicker}>Important measurement limit</p>
        <h2 style={styles.panelTitle}>Imagine if the hidden week stopped tomorrow.</h2>
        <p style={styles.body}>
          The formal system would have to see, fund and staff work that older people are currently doing quietly.  Provider age is known; recipient age is not.
        </p>
        <p style={styles.note}>The take-home is fragility: resilience has limits.</p>
      </div>
    </AbsoluteFill>
  );
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    background: "#020617",
    color: ink,
    fontFamily: "Inter, Arial, Helvetica, sans-serif",
    overflow: "hidden",
  },
  grid: {
    position: "absolute",
    inset: 0,
    backgroundImage:
      "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
    backgroundSize: "48px 48px",
  },
  vignette: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(circle at 76% 34%, rgba(45,212,191,0.08), transparent 32%), radial-gradient(circle at 18% 72%, rgba(163,230,53,0.08), transparent 28%), linear-gradient(90deg, rgba(2,6,23,0.9), rgba(2,6,23,0.22), rgba(2,6,23,0.88))",
  },
  mapWrap: {
    position: "absolute",
    inset: 0,
  },
  mapSvg: {
    width: "100%",
    height: "100%",
    display: "block",
  },
  titleCard: {
    position: "absolute",
    left: 72,
    top: 74,
    width: 770,
    padding: 34,
    border: "1px solid rgba(148,163,184,0.18)",
    borderRadius: 10,
    background: panel,
    boxShadow: "0 24px 70px rgba(0,0,0,0.38)",
  },
  kicker: {
    margin: "0 0 12px",
    color: lime,
    fontSize: 17,
    fontWeight: 900,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    fontSize: 104,
    lineHeight: 0.88,
    letterSpacing: 0,
  },
  lede: {
    margin: "22px 0 0",
    color: muted,
    fontSize: 31,
    lineHeight: 1.22,
  },
  clockScene: {
    position: "absolute",
    left: 78,
    top: 96,
    display: "grid",
    gridTemplateColumns: "190px 1fr",
    gap: 28,
    alignItems: "center",
    width: 930,
    padding: 30,
    border: "1px solid rgba(148,163,184,0.2)",
    borderRadius: 10,
    background: panel,
    boxShadow: "0 24px 70px rgba(0,0,0,0.34)",
  },
  clockWrap: {
    display: "grid",
    gridTemplateColumns: "170px 1fr",
    gap: 18,
    alignItems: "center",
  },
  bigNumber: {
    margin: 0,
    color: lime,
    fontSize: 82,
    lineHeight: 0.9,
    letterSpacing: 0,
  },
  body: {
    margin: 0,
    color: muted,
    fontSize: 24,
    lineHeight: 1.42,
  },
  note: {
    margin: "12px 0 0",
    color: "#94a3b8",
    fontSize: 19,
    lineHeight: 1.35,
  },
  panel: {
    position: "absolute",
    width: 430,
    padding: 24,
    border: "1px solid rgba(148,163,184,0.2)",
    borderTop: `3px solid ${lime}`,
    borderRadius: 10,
    background: "rgba(15,23,42,0.88)",
    boxShadow: "0 24px 70px rgba(0,0,0,0.34)",
  },
  leftPanel: {
    left: 72,
    bottom: 72,
  },
  rightPanel: {
    right: 72,
    top: 80,
  },
  panelTitle: {
    margin: "0 0 14px",
    color: ink,
    fontSize: 43,
    lineHeight: 0.98,
    letterSpacing: 0,
  },
  placeLabel: {
    position: "absolute",
    bottom: 72,
    width: 390,
    display: "grid",
    gap: 8,
    padding: 18,
    border: `1px solid rgba(163,230,53,0.36)`,
    borderRadius: 10,
    background: "rgba(2,6,23,0.82)",
    boxShadow: "0 18px 48px rgba(0,0,0,0.36)",
  },
  comparison: {
    display: "grid",
    gap: 18,
    margin: "22px 0",
  },
  barRow: {
    display: "grid",
    gridTemplateColumns: "280px 1fr 116px",
    gap: 16,
    alignItems: "center",
  },
  barMeta: {
    display: "grid",
    gap: 5,
    color: ink,
    fontSize: 18,
  },
  barTrack: {
    height: 18,
    borderRadius: 999,
    overflow: "hidden",
    background: "rgba(148,163,184,0.22)",
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
  },
  stackScene: {
    position: "absolute",
    left: 76,
    right: 76,
    bottom: 62,
    padding: 28,
    border: "1px solid rgba(148,163,184,0.2)",
    borderTop: `3px solid ${lime}`,
    borderRadius: 10,
    background: "rgba(15,23,42,0.9)",
    boxShadow: "0 24px 70px rgba(0,0,0,0.34)",
  },
  limitScene: {
    position: "absolute",
    left: 170,
    right: 170,
    top: 138,
    padding: 34,
    border: "1px solid rgba(148,163,184,0.22)",
    borderTop: `3px solid ${lime}`,
    borderRadius: 10,
    background: "rgba(15,23,42,0.92)",
    boxShadow: "0 24px 70px rgba(0,0,0,0.38)",
  },
};
