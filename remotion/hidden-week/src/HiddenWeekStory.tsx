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
const cyan = "#38bdf8";
const ink = "#f8fafc";
const muted = "#94a3b8";
const panel = "rgba(15, 23, 42, 0.78)";

type Ward = (typeof wards)[number];

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

const byWard = (name: string) => wards.find((ward) => ward.ward === name) as Ward;
const highFocus = byWard("Redhill");
const lowFocus = byWard("North Jesmond");

const hoursExtent = wards.reduce(
  (acc, ward) => [Math.min(acc[0], ward.hours), Math.max(acc[1], ward.hours)],
  [Infinity, -Infinity],
);

const shapeExtent = mapShapes.reduce(
  (acc, shape) => [Math.min(acc[0], shape.hours), Math.max(acc[1], shape.hours)],
  [Infinity, -Infinity],
);

const rForWard = (ward: Ward, progress = 1) => {
  const norm = (ward.hours - hoursExtent[0]) / (hoursExtent[1] - hoursExtent[0]);
  return (5 + Math.sqrt(norm) * 28) * progress;
};

const sceneProgress = (frame: number, fps: number, start: number, end: number) =>
  interpolate(frame, [start * fps, end * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

const opacityFor = (frame: number, fps: number, start: number, end: number) => {
  const fade = 0.45 * fps;
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

const mapCamera = (frame: number, fps: number) => {
  const high = sceneProgress(frame, fps, 18, 25);
  const low = sceneProgress(frame, fps, 25, 31);
  const returnHome = sceneProgress(frame, fps, 31, 36);

  if (frame >= 18 * fps && frame < 25 * fps) {
    const scale = interpolate(high, [0, 1], [1.08, 2.55]);
    return {scale, x: highFocus.x, y: highFocus.y};
  }

  if (frame >= 25 * fps && frame < 31 * fps) {
    const scale = interpolate(low, [0, 1], [1.9, 2.9]);
    const x = mix(highFocus.x, lowFocus.x, low);
    const y = mix(highFocus.y, lowFocus.y, low);
    return {scale, x, y};
  }

  if (frame >= 31 * fps && frame < 36 * fps) {
    const scale = interpolate(returnHome, [0, 1], [2.05, 1.08]);
    const x = mix(lowFocus.x, WIDTH / 2, returnHome);
    const y = mix(lowFocus.y, HEIGHT / 2, returnHome);
    return {scale, x, y};
  }

  return {scale: 1.06, x: WIDTH / 2, y: HEIGHT / 2};
};

const Clock = ({progress}: {progress: number}) => {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const day = days[Math.min(6, Math.floor(progress * 7))];
  const hour = Math.min(23, Math.floor((progress * 7 * 24) % 24));
  const hand = progress * 360 * 7 - 90;
  return (
    <div style={styles.clockWrap}>
      <svg width="154" height="154" viewBox="0 0 154 154">
        <circle cx="77" cy="77" r="68" fill="rgba(2,6,23,0.76)" stroke="rgba(226,232,240,0.18)" strokeWidth="2" />
        <circle
          cx="77"
          cy="77"
          r="58"
          fill="none"
          stroke={lime}
          strokeWidth="8"
          strokeDasharray={`${progress * 364} 364`}
          transform="rotate(-90 77 77)"
          opacity="0.95"
        />
        {Array.from({length: 12}).map((_, i) => {
          const angle = (i / 12) * Math.PI * 2;
          return (
            <line
              key={i}
              x1={77 + Math.cos(angle) * 48}
              y1={77 + Math.sin(angle) * 48}
              x2={77 + Math.cos(angle) * 56}
              y2={77 + Math.sin(angle) * 56}
              stroke="rgba(248,250,252,0.5)"
              strokeWidth="2"
            />
          );
        })}
        <line
          x1="77"
          y1="77"
          x2={77 + Math.cos((hand * Math.PI) / 180) * 44}
          y2={77 + Math.sin((hand * Math.PI) / 180) * 44}
          stroke={teal}
          strokeWidth="5"
          strokeLinecap="round"
        />
        <circle cx="77" cy="77" r="6" fill={ink} />
      </svg>
      <div>
        <strong>{day}</strong>
        <span>{String(hour).padStart(2, "0")}:00</span>
      </div>
    </div>
  );
};

const MapLayer = ({frame, fps}: {frame: number; fps: number}) => {
  const rise = sceneProgress(frame, fps, 11, 18);
  const cam = mapCamera(frame, fps);
  const highScene = frame >= 18 * fps && frame < 25 * fps;
  const lowScene = frame >= 25 * fps && frame < 31 * fps;
  const stackScene = frame >= 31 * fps;

  return (
    <svg style={styles.mapSvg} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
      <defs>
        <radialGradient id="careGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={teal} stopOpacity="0.55" />
          <stop offset="100%" stopColor={teal} stopOpacity="0" />
        </radialGradient>
      </defs>
      <g
        style={{
          transform: `translate(${WIDTH / 2}px, ${HEIGHT / 2}px) scale(${cam.scale}) translate(${-cam.x}px, ${-cam.y}px)`,
          transformOrigin: "0 0",
        }}
      >
        {mapShapes.map((shape) => {
          const norm = (shape.hours - shapeExtent[0]) / (shapeExtent[1] - shapeExtent[0]);
          const fill = blend("#0f172a", "#7f1d1d", clamp(norm * 1.05));
          return (
            <path
              key={shape.code}
              d={shape.d}
              fill={fill}
              opacity={0.22 + norm * 0.42}
              stroke="rgba(148,163,184,0.16)"
              strokeWidth="0.7"
            />
          );
        })}

        {wards.map((ward, index) => {
          const stagger = clamp((rise * 1.2 - index / wards.length) / 0.45);
          const active =
            (highScene && storyStats.topWards.slice(0, 5).some((w) => w.code === ward.code)) ||
            (lowScene && storyStats.lowWards.slice(0, 5).some((w) => w.code === ward.code)) ||
            (stackScene && ward.stack > 4.1);
          const radius = rForWard(ward, frame < 18 * fps ? stagger : 1);
          const norm = (ward.hours - hoursExtent[0]) / (hoursExtent[1] - hoursExtent[0]);
          return (
            <g key={ward.code}>
              {active ? (
                <circle cx={ward.x} cy={ward.y} r={radius + 12} fill="url(#careGlow)" opacity="0.56" />
              ) : null}
              <circle
                cx={ward.x}
                cy={ward.y}
                r={radius}
                fill={blend("#2dd4bf", "#a3e635", norm)}
                opacity={active ? 0.98 : 0.52}
                stroke={active ? ink : "rgba(15,23,42,0.7)"}
                strokeWidth={active ? 2.5 : 1}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
};

const Label = ({ward, side = "right"}: {ward: Ward; side?: "left" | "right"}) => (
  <div style={{...styles.placeLabel, ...(side === "left" ? {left: 72} : {right: 72})}}>
    <span>{ward.ward}, {ward.lad}</span>
    <strong>{one.format(ward.hours)} hrs/100 residents</strong>
    <small>D{ward.decileMean} · {one.format(ward.badHealth)}% bad/very bad health · {one.format(ward.limited)}% disability limited a lot</small>
  </div>
);

const ComparisonBars = ({progress}: {progress: number}) => {
  const high = storyStats.highFifth;
  const low = storyStats.lowFifth;
  const maxHours = Math.max(high.hours, low.hours);
  return (
    <div style={styles.comparison}>
      {[
        {label: "Highest care-burden fifth", data: high, color: lime},
        {label: "Lowest care-burden fifth", data: low, color: teal},
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

  const clockProgress = sceneProgress(frame, fps, 4, 11);
  const totalHours = Math.round(storyStats.totalHours * clockProgress);
  const titleOpacity = opacityFor(frame, fps, 0, 4.4);
  const clockOpacity = opacityFor(frame, fps, 3.8, 11.4);
  const mapOpacity = sceneProgress(frame, fps, 9.5, 12.5);
  const mapTextOpacity = opacityFor(frame, fps, 11, 18);
  const highOpacity = opacityFor(frame, fps, 18, 25);
  const lowOpacity = opacityFor(frame, fps, 25, 31);
  const stackOpacity = opacityFor(frame, fps, 31, 37);
  const limitOpacity = opacityFor(frame, fps, 37, 41);
  const compareProgress = sceneProgress(frame, fps, 31.5, 35);

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
        <p style={styles.lede}>A minimum of unpaid care across Tyne and Wear, counted cautiously from Census 2021.</p>
      </div>

      <div style={{...styles.clockScene, opacity: clockOpacity}}>
        <Clock progress={clockProgress} />
        <div>
          <p style={styles.kicker}>The weekly clock</p>
          <h2 style={styles.bigNumber}>{nf.format(totalHours)}</h2>
          <p style={styles.body}>minimum unpaid care-hours delivered by residents aged 5+ each week.</p>
          <p style={styles.note}>{nf.format(storyStats.fteWeeks)} full-time working weeks, every week.</p>
        </div>
      </div>

      <div style={{...styles.panel, ...styles.rightPanel, opacity: mapTextOpacity}}>
        <p style={styles.kicker}>Every circle is a ward</p>
        <h2 style={styles.panelTitle}>The work rises unevenly.</h2>
        <p style={styles.body}>Circles grow by minimum care-hours per 100 residents. The map is ward-level, with small-area patterns underneath.</p>
      </div>

      <div style={{opacity: highOpacity}}>
        <Label ward={highFocus} />
        <div style={{...styles.panel, ...styles.leftPanel}}>
          <p style={styles.kicker}>Where the burden is high</p>
          <h2 style={styles.panelTitle}>Redhill sits at the top.</h2>
          <p style={styles.body}>High care is not floating above local conditions: here it sits with D{highFocus.decileMean} deprivation, {one.format(highFocus.badHealth)}% bad or very bad health, and {one.format(highFocus.limited)}% disability limited a lot.</p>
        </div>
      </div>

      <div style={{opacity: lowOpacity}}>
        <Label ward={lowFocus} side="left" />
        <div style={{...styles.panel, ...styles.rightPanel}}>
          <p style={styles.kicker}>Where the burden is low</p>
          <h2 style={styles.panelTitle}>North Jesmond is a different week.</h2>
          <p style={styles.body}>The minimum burden is {one.format(lowFocus.hours)} hours per 100 residents, with lower reported poor health and disability. It is not the same social load.</p>
        </div>
      </div>

      <div style={{...styles.stackScene, opacity: stackOpacity}}>
        <p style={styles.kicker}>The precarious storyline</p>
        <h2 style={styles.panelTitle}>If informal care falters, the risk is not evenly spread.</h2>
        <ComparisonBars progress={compareProgress} />
        <p style={styles.body}>The data support the pattern: high-burden wards are more deprived on average and carry substantially more bad health and disability.</p>
      </div>

      <div style={{...styles.limitScene, opacity: limitOpacity}}>
        <p style={styles.kicker}>Important measurement limit</p>
        <h2 style={styles.panelTitle}>This is not care for 65+ recipients only.</h2>
        <p style={styles.body}>
          Census TS039 measures residents providing unpaid care and the hours they provide. It does not tell us the age of the person receiving care, so a 65+ recipient-only animation would need another source or a clearly labelled model.
        </p>
        <p style={styles.note}>Honest numbers first. Better estimates can be planted later.</p>
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
      "radial-gradient(circle at 76% 34%, rgba(45,212,191,0.18), transparent 32%), radial-gradient(circle at 18% 72%, rgba(163,230,53,0.13), transparent 28%), linear-gradient(90deg, rgba(2,6,23,0.92), rgba(2,6,23,0.52), rgba(2,6,23,0.92))",
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
    fontSize: 18,
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
    color: "#cbd5e1",
    fontSize: 31,
    lineHeight: 1.22,
  },
  clockScene: {
    position: "absolute",
    left: 78,
    top: 104,
    display: "grid",
    gridTemplateColumns: "180px 1fr",
    gap: 28,
    alignItems: "center",
    width: 780,
    padding: 34,
    border: "1px solid rgba(148,163,184,0.18)",
    borderRadius: 10,
    background: panel,
    boxShadow: "0 24px 70px rgba(0,0,0,0.38)",
  },
  clockWrap: {
    display: "grid",
    gap: 12,
    justifyItems: "center",
    color: ink,
    fontSize: 24,
    fontWeight: 900,
  },
  bigNumber: {
    margin: 0,
    color: ink,
    fontSize: 78,
    lineHeight: 0.94,
  },
  body: {
    margin: "12px 0 0",
    color: "#cbd5e1",
    fontSize: 25,
    lineHeight: 1.32,
  },
  note: {
    margin: "16px 0 0",
    color: muted,
    fontSize: 20,
    lineHeight: 1.35,
  },
  panel: {
    position: "absolute",
    width: 472,
    padding: 26,
    border: "1px solid rgba(148,163,184,0.18)",
    borderRadius: 10,
    background: panel,
    boxShadow: "0 24px 70px rgba(0,0,0,0.38)",
  },
  rightPanel: {
    right: 64,
    top: 76,
  },
  leftPanel: {
    left: 64,
    top: 76,
  },
  panelTitle: {
    margin: 0,
    fontSize: 45,
    lineHeight: 1.02,
  },
  placeLabel: {
    position: "absolute",
    bottom: 54,
    width: 500,
    padding: 20,
    border: "1px solid rgba(163,230,53,0.36)",
    borderRadius: 10,
    background: "rgba(2, 6, 23, 0.78)",
    boxShadow: "0 18px 48px rgba(0,0,0,0.42)",
  },
  stackScene: {
    position: "absolute",
    left: 72,
    right: 72,
    bottom: 58,
    padding: 28,
    border: "1px solid rgba(148,163,184,0.18)",
    borderRadius: 10,
    background: "rgba(2, 6, 23, 0.84)",
    boxShadow: "0 24px 70px rgba(0,0,0,0.38)",
  },
  comparison: {
    display: "grid",
    gap: 16,
    marginTop: 20,
  },
  barRow: {
    display: "grid",
    gridTemplateColumns: "390px 1fr 130px",
    gap: 18,
    alignItems: "center",
  },
  barMeta: {
    display: "grid",
    gap: 4,
    fontSize: 18,
    color: muted,
  },
  barTrack: {
    height: 28,
    borderRadius: 999,
    background: "rgba(148,163,184,0.16)",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
  },
  limitScene: {
    position: "absolute",
    left: 170,
    top: 134,
    width: 940,
    padding: 38,
    border: "1px solid rgba(148,163,184,0.18)",
    borderRadius: 10,
    background: "rgba(2, 6, 23, 0.9)",
    boxShadow: "0 24px 70px rgba(0,0,0,0.38)",
  },
};
