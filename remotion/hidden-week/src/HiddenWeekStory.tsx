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

const ink = "#07111f";
const white = "#f8fafc";
const muted = "#475569";
const softText = "#dbeafe";
const lime = "#a3e635";
const teal = "#2dd4bf";
const red = "#b91c1c";
const deepPanel = "rgba(2, 6, 23, 0.87)";
const mapWater = "#dff2f6";
const mapLand = "#f7fbf8";
const mapLine = "#94a3b8";
const rampColours = ["#0f766e", "#22c55e", "#a3e635", "#facc15", "#fb923c", "#b91c1c"];

type Ward = (typeof wards)[number];
type Shape = (typeof mapShapes)[number];
type AnchoredWard = Ward & {x: number; y: number};
type Point = {x: number; y: number};
type CameraState = {scale: number; x: number; y: number};

const nf = new Intl.NumberFormat("en-GB");
const one = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

const fullTimePlusCounts = new Map<string, number>([
  ["E05001154", 159],
  ["E05001073", 108],
  ["E05011458", 141],
  ["E05001163", 150],
]);

const topSmallAreaStats = {
  code: "E01008201",
  ward: "Deckham",
  lad: "Gateshead",
  hoursPer100: 795.8,
  hoursTotal: 1504,
  carers: 40,
  fullTimePlus: 26,
  fullTimePlusPct: 13.8,
  decile: 1,
  badHealth: 10.2,
  limited: 12.8,
};

const lsoaHourStops = [11.5, 238.6, 308.2, 371.5, 436, 795.8];

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

const interpolateColour = (colours: string[], value: number) => {
  const t = clamp(value);
  const scaled = t * (colours.length - 1);
  const left = Math.floor(scaled);
  const right = Math.min(colours.length - 1, left + 1);
  return blend(colours[left], colours[right], scaled - left);
};

const interpolateStops = (domain: number[], range: number[], value: number) => {
  if (!Number.isFinite(value)) return range[0];
  if (value <= domain[0]) return range[0];
  for (let index = 1; index < domain.length; index += 1) {
    if (value <= domain[index]) {
      const left = domain[index - 1];
      const right = domain[index];
      const amount = clamp((value - left) / (right - left || 1e-12));
      return mix(range[index - 1], range[index], amount);
    }
  }
  return range[range.length - 1];
};

const normByStops = (value: number) =>
  interpolateStops(
    lsoaHourStops,
    lsoaHourStops.map((_, index) => index / (lsoaHourStops.length - 1)),
    value,
  );

const fillForHours = (value: number) => interpolateColour(rampColours, normByStops(value));

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

const shapeCentres = new Map<string, Point & {count: number}>();
for (const shape of mapShapes) {
  shapeCentres.set(shape.code, centroidFromPath(shape.d));
}

const anchorKey = (ward: Pick<Ward, "ward" | "lad">) => `${ward.ward}|||${ward.lad}`;
const wardAnchors = new Map<string, Point & {count: number}>();

for (const shape of mapShapes) {
  const centre = shapeCentres.get(shape.code) ?? centroidFromPath(shape.d);
  const key = `${shape.ward}|||${shape.lad}`;
  const current = wardAnchors.get(key) ?? {x: 0, y: 0, count: 0};
  current.x += centre.x * centre.count;
  current.y += centre.y * centre.count;
  current.count += centre.count;
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
const findWard = (name: string, lad?: string) =>
  anchoredWards.find((ward) => ward.ward === name && (!lad || ward.lad === lad)) as AnchoredWard;

const byHours = [...anchoredWards].sort((a, b) => b.olderHours - a.olderHours);
const byStack = [...anchoredWards].sort((a, b) => b.stack - a.stack);
const byHeavy = [...anchoredWards].sort((a, b) => b.olderHeavy - a.olderHeavy);
const rankFor = (rows: AnchoredWard[], ward: Ward) =>
  rows.findIndex((row) => row.code === ward.code) + 1;

const castle = withAnchor(storyStats.topWards[0] as Ward);
const deckham = findWard("Deckham", "Gateshead");
const walker = findWard("Walker", "Newcastle");
const redhill = findWard("Redhill", "Sunderland");
const northJesmond = findWard("North Jesmond", "Newcastle");
const topSmallArea = mapShapes.find((shape) => shape.code === topSmallAreaStats.code) as Shape;
const topSmallAreaCentre = shapeCentres.get(topSmallArea.code) ?? centroidFromPath(topSmallArea.d);
const highWardKeys = new Set(storyStats.topWards.slice(0, 10).map(anchorKey));

const ease = (frame: number, fps: number, start: number, end: number) =>
  interpolate(frame, [start * fps, end * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

const softEase = (frame: number, fps: number, start: number, end: number) =>
  interpolate(frame, [start * fps, end * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.sin),
  });

const opacityFor = (frame: number, fps: number, start: number, end: number, fadeSeconds = 1) => {
  const fade = fadeSeconds * fps;
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

const cameraBetween = (from: CameraState, to: CameraState, amount: number): CameraState => ({
  scale: mix(from.scale, to.scale, amount),
  x: mix(from.x, to.x, amount),
  y: mix(from.y, to.y, amount),
});

const homeCamera: CameraState = {scale: 1.04, x: WIDTH / 2, y: HEIGHT / 2};
const deckhamCamera: CameraState = {scale: 7.2, x: topSmallAreaCentre.x, y: topSmallAreaCentre.y};
const castleCamera: CameraState = {scale: 7, x: castle.x, y: castle.y};
const walkerCamera: CameraState = {scale: 7.4, x: walker.x, y: walker.y};
const redhillCamera: CameraState = {scale: 7.25, x: redhill.x, y: redhill.y};
const lowCamera: CameraState = {scale: 7.8, x: northJesmond.x, y: northJesmond.y};

const camera = (frame: number, fps: number): CameraState => {
  if (frame < 23 * fps) return homeCamera;
  if (frame < 38 * fps) return cameraBetween(homeCamera, deckhamCamera, softEase(frame, fps, 23, 38));
  if (frame < 48 * fps) return deckhamCamera;
  if (frame < 60 * fps) return cameraBetween(deckhamCamera, castleCamera, softEase(frame, fps, 48, 60));
  if (frame < 70 * fps) return castleCamera;
  if (frame < 80 * fps) return cameraBetween(castleCamera, walkerCamera, softEase(frame, fps, 70, 80));
  if (frame < 89 * fps) return walkerCamera;
  if (frame < 97 * fps) return cameraBetween(walkerCamera, redhillCamera, softEase(frame, fps, 89, 97));
  if (frame < 104 * fps) return cameraBetween(redhillCamera, lowCamera, softEase(frame, fps, 97, 104));
  if (frame < 110 * fps) return cameraBetween(lowCamera, homeCamera, softEase(frame, fps, 104, 110));
  return homeCamera;
};

const activeForFrame = (frame: number, fps: number) => {
  if (frame >= 33 * fps && frame < 50 * fps) return {shapeCode: topSmallArea.code, ward: deckham};
  if (frame >= 50 * fps && frame < 72 * fps) return {ward: castle};
  if (frame >= 72 * fps && frame < 92 * fps) return {ward: walker};
  if (frame >= 92 * fps && frame < 103 * fps) return {ward: redhill};
  if (frame >= 103 * fps && frame < 110 * fps) return {ward: northJesmond};
  return {};
};

const mapPoint = (point: Point, cam: CameraState) => ({
  x: WIDTH / 2 + (point.x - cam.x) * cam.scale,
  y: HEIGHT / 2 + (point.y - cam.y) * cam.scale,
});

const Clock = ({progress}: {progress: number}) => {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayIndex = Math.min(6, Math.floor(progress * 7));
  const hour = Math.min(23, Math.floor((progress * 7 * 24) % 24));
  const hand = progress * 360 * 7 - 90;

  return (
    <svg width="150" height="150" viewBox="0 0 150 150">
      <circle cx="75" cy="75" r="67" fill="rgba(15,23,42,0.94)" stroke="rgba(226,232,240,0.25)" strokeWidth="2" />
      <circle
        cx="75"
        cy="75"
        r="55"
        fill="none"
        stroke={lime}
        strokeWidth="9"
        strokeDasharray={`${progress * 346} 346`}
        transform="rotate(-90 75 75)"
      />
      {Array.from({length: 12}).map((_, index) => {
        const angle = (index / 12) * Math.PI * 2;
        return (
          <line
            key={index}
            x1={75 + Math.cos(angle) * 43}
            y1={75 + Math.sin(angle) * 43}
            x2={75 + Math.cos(angle) * 52}
            y2={75 + Math.sin(angle) * 52}
            stroke="rgba(248,250,252,0.52)"
            strokeWidth="2"
          />
        );
      })}
      <line
        x1="75"
        y1="75"
        x2={75 + Math.cos((hand * Math.PI) / 180) * 45}
        y2={75 + Math.sin((hand * Math.PI) / 180) * 45}
        stroke={teal}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="75" cy="75" r="6" fill={white} />
      <text x="75" y="108" textAnchor="middle" fill={white} fontSize="17" fontWeight="900">
        {days[dayIndex]}
      </text>
      <text x="75" y="128" textAnchor="middle" fill="rgba(226,232,240,0.78)" fontSize="15" fontWeight="800">
        {String(hour).padStart(2, "0")}:00
      </text>
    </svg>
  );
};

const Brand = ({size = 29}: {size?: number}) => (
  <span style={{fontSize: size, fontWeight: 900, lineHeight: 1}}>
    <span style={{color: white}}>Gero</span>
    <span style={{color: teal}}>stats</span>
  </span>
);

const ShapePath = ({
  shape,
  activeShape,
  activeWard,
}: {
  shape: Shape;
  activeShape?: string;
  activeWard?: AnchoredWard;
}) => {
  const active = shape.code === activeShape || (!!activeWard && shape.ward === activeWard.ward && shape.lad === activeWard.lad);
  const high = highWardKeys.has(`${shape.ward}|||${shape.lad}`);
  return (
    <path
      d={shape.d}
      fill={fillForHours(shape.olderHours)}
      opacity={active ? 1 : high ? 0.96 : 0.78}
      stroke={active ? ink : high ? "rgba(2,6,23,0.56)" : "rgba(15,23,42,0.22)"}
      strokeWidth={active ? 1.65 : high ? 0.75 : 0.34}
      vectorEffect="non-scaling-stroke"
    />
  );
};

const MapMarker = ({point, cam}: {point: Point; cam: CameraState}) => {
  const projected = mapPoint(point, cam);
  if (projected.x < -80 || projected.x > WIDTH + 80 || projected.y < -80 || projected.y > HEIGHT + 80) return null;
  return (
    <g>
      <circle cx={projected.x} cy={projected.y} r="21" fill="rgba(248,250,252,0.28)" stroke={white} strokeWidth="2" />
      <circle cx={projected.x} cy={projected.y} r="9" fill={red} stroke={ink} strokeWidth="2" />
    </g>
  );
};

const MapLayer = ({frame, fps}: {frame: number; fps: number}) => {
  const cam = camera(frame, fps);
  const active = activeForFrame(frame, fps);
  const markerPoint = active.shapeCode
    ? topSmallAreaCentre
    : active.ward
      ? {x: active.ward.x, y: active.ward.y}
      : null;
  const transform = `translate(${WIDTH / 2} ${HEIGHT / 2}) scale(${cam.scale}) translate(${-cam.x} ${-cam.y})`;

  return (
    <svg style={styles.mapSvg} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
      <defs>
        <linearGradient id="waterSheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e8fbff" />
          <stop offset="55%" stopColor={mapWater} />
          <stop offset="100%" stopColor="#cce9f3" />
        </linearGradient>
        <linearGradient id="landSheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor={mapLand} />
        </linearGradient>
      </defs>
      <rect width={WIDTH} height={HEIGHT} fill="url(#waterSheen)" />
      <path
        d="M0 58 C150 32 252 70 374 46 C526 18 632 50 782 31 C918 15 1058 39 1280 10 L1280 720 L0 720 Z"
        fill="url(#landSheen)"
      />
      <g opacity="0.26" fill="none" stroke={mapLine} strokeLinecap="round">
        <path d="M90 506 C236 426 372 434 516 360 C666 284 776 304 934 236" strokeWidth="4" />
        <path d="M196 164 C328 190 478 146 620 170 C752 194 850 146 982 100" strokeWidth="2.4" />
        <path d="M472 690 C540 562 604 486 682 402 C760 320 802 234 854 90" strokeWidth="2.1" />
        <path d="M52 304 C220 286 354 320 512 294 C690 264 830 284 1116 210" strokeWidth="1.5" />
      </g>
      <g transform={transform} style={{filter: "drop-shadow(0 12px 18px rgba(15,23,42,0.12))"}}>
        {mapShapes.map((shape) => (
          <ShapePath
            key={shape.code}
            shape={shape}
            activeShape={active.shapeCode}
            activeWard={active.ward}
          />
        ))}
      </g>
      {markerPoint ? <MapMarker point={markerPoint} cam={cam} /> : null}
    </svg>
  );
};

const Legend = ({opacity}: {opacity: number}) => (
  <div style={{...styles.legend, opacity}}>
    <strong>Older-care hours per 100 residents aged 65+</strong>
    <div style={styles.legendRamp}>
      {rampColours.map((colour) => (
        <span key={colour} style={{background: colour}} />
      ))}
    </div>
    <div style={styles.legendLabels}>
      <span>lower</span>
      <span>top band starts at {one.format(lsoaHourStops[4])}</span>
      <span>peak {one.format(lsoaHourStops[5])}</span>
    </div>
  </div>
);

const StatPill = ({label, value}: {label: string; value: string}) => (
  <div style={styles.statPill}>
    <b>{value}</b>
    <span>{label}</span>
  </div>
);

const WardReadout = ({ward, label, side = "right"}: {ward: AnchoredWard; label: string; side?: "left" | "right"}) => (
  <div style={{...styles.readout, ...(side === "left" ? {left: 58} : {right: 58})}}>
    <p style={styles.kickerDark}>{label}</p>
    <h3 style={styles.readoutTitle}>{ward.ward}, {ward.lad}</h3>
    <div style={styles.readoutMetrics}>
      <b>{one.format(ward.olderHours)} hrs/100</b>
      <span>{nf.format(ward.olderHoursTotal)} minimum unpaid hours/week</span>
      <span>{nf.format(fullTimePlusCounts.get(ward.code) ?? 0)} full-time-plus carers aged 65+</span>
      <span>D{one.format(ward.decileMean)} / {one.format(ward.badHealth)}% bad or very bad health / {one.format(ward.limited)}% disability limited a lot</span>
    </div>
  </div>
);

const SmallAreaReadout = () => (
  <div style={{...styles.readout, right: 58}}>
    <p style={styles.kickerDark}>Highest small-area spike</p>
    <h3 style={styles.readoutTitle}>{topSmallAreaStats.ward}, {topSmallAreaStats.lad}</h3>
    <div style={styles.readoutMetrics}>
      <b>{one.format(topSmallAreaStats.hoursPer100)} hrs/100</b>
      <span>{nf.format(topSmallAreaStats.hoursTotal)} minimum unpaid hours/week</span>
      <span>{nf.format(topSmallAreaStats.fullTimePlus)} people aged 65+ report 50+ hours/week</span>
      <span>D{one.format(topSmallAreaStats.decile)} / {one.format(topSmallAreaStats.badHealth)}% bad or very bad health / {one.format(topSmallAreaStats.limited)}% disability limited a lot</span>
    </div>
  </div>
);

const StoryPanel = ({
  opacity,
  eyebrow,
  title,
  children,
  side = "left",
}: {
  opacity: number;
  eyebrow: string;
  title: React.ReactNode;
  children: React.ReactNode;
  side?: "left" | "right" | "center";
}) => {
  const sideStyle =
    side === "right"
      ? styles.panelRight
      : side === "center"
        ? styles.panelCenter
        : styles.panelLeft;

  return (
    <div
      style={{
        ...styles.storyPanel,
        ...sideStyle,
        opacity,
        transform: `translateY(${(1 - Math.min(1, opacity)) * 16}px)`,
      }}
    >
      <p style={styles.kicker}>{eyebrow}</p>
      <h2 style={styles.panelTitle}>{title}</h2>
      <div style={styles.panelBody}>{children}</div>
    </div>
  );
};

const IntersectionGrid = ({ward}: {ward: AnchoredWard}) => (
  <div style={styles.intersectionGrid}>
    <StatPill label="older-care hours" value={`${one.format(ward.olderHours)} hrs/100`} />
    <StatPill label="full-time-plus care" value={`${one.format(ward.olderHeavy)}%`} />
    <StatPill label="deprivation" value={`D${one.format(ward.decileMean)}`} />
    <StatPill label="bad/very bad health" value={`${one.format(ward.badHealth)}%`} />
    <StatPill label="disability limited a lot" value={`${one.format(ward.limited)}%`} />
    <StatPill label="intersection rank" value={`#${rankFor(byStack, ward)}`} />
  </div>
);

const ComparisonBars = ({progress}: {progress: number}) => {
  const high = storyStats.highFifth;
  const low = storyStats.lowFifth;
  const maxHours = Math.max(high.hours, low.hours);
  const rows = [
    {label: "Highest older-care fifth", data: high, color: red},
    {label: "Lowest older-care fifth", data: low, color: "#0f766e"},
  ];

  return (
    <div style={styles.compareBars}>
      {rows.map((row) => (
        <div key={row.label} style={styles.compareRow}>
          <div style={styles.compareLabel}>
            <strong>{row.label}</strong>
            <span>D{one.format(row.data.decileMean)} / {one.format(row.data.badHealth)}% bad health / {one.format(row.data.limited)}% disability limited a lot</span>
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

  const mapOpacity = ease(frame, fps, 4, 13);
  const titleOpacity = opacityFor(frame, fps, 0, 12);
  const clockOpacity = opacityFor(frame, fps, 9, 30);
  const deckhamOpacity = opacityFor(frame, fps, 31, 50);
  const castleOpacity = opacityFor(frame, fps, 50, 70);
  const walkerOpacity = opacityFor(frame, fps, 72, 91);
  const redhillOpacity = opacityFor(frame, fps, 91, 103);
  const lowOpacity = opacityFor(frame, fps, 103, 110);
  const compareOpacity = opacityFor(frame, fps, 110, 120);
  const legendOpacity = opacityFor(frame, fps, 13, 29);

  const clockProgress = ease(frame, fps, 9, 28);
  const totalHours = Math.round(storyStats.totalOlderHours * clockProgress);
  const fullTimePlus = Math.round(storyStats.olderHeavyCarers * clockProgress);
  const compareProgress = ease(frame, fps, 112, 118);

  return (
    <AbsoluteFill style={styles.root}>
      <div style={styles.mapGlow} />
      <div style={{...styles.mapWrap, opacity: mapOpacity}}>
        <MapLayer frame={frame} fps={fps} />
      </div>
      <div style={styles.vignette} />
      <Legend opacity={legendOpacity} />

      <div style={{...styles.titleCard, opacity: titleOpacity}}>
        <p style={styles.kicker}>Data story / 9 June 2026</p>
        <div style={styles.brandLine}>
          <Brand size={35} />
        </div>
        <h1 style={styles.title}>The hidden week</h1>
        <p style={styles.lede}>Older people providing unpaid care across Tyne and Wear.</p>
      </div>

      <div style={{...styles.clockScene, opacity: clockOpacity}}>
        <Clock progress={clockProgress} />
        <div>
          <p style={styles.kicker}>A week ticking over</p>
          <h2 style={styles.bigNumber}>{nf.format(totalHours)}</h2>
          <p style={styles.clockText}>minimum unpaid care-hours provided by people aged 65+ each week.</p>
          <p style={styles.clockNote}>{nf.format(fullTimePlus)} people aged 65+ report 50+ hours of unpaid care a week. That is full-time-plus care.</p>
        </div>
      </div>

      <div style={{opacity: deckhamOpacity}}>
        <SmallAreaReadout />
        <StoryPanel opacity={deckhamOpacity} eyebrow="Deckham matters" title={<>Deckham has the highest small-area spike.</>}>
          <p>
            At LSOA level, Deckham reaches {one.format(topSmallAreaStats.hoursPer100)} hours per 100 residents aged 65+. The top colour band starts at {one.format(lsoaHourStops[4])}, so this is not just red; it is the peak.
          </p>
        </StoryPanel>
      </div>

      <div style={{opacity: castleOpacity}}>
        <WardReadout ward={castle} label="Highest named ward burden" />
        <StoryPanel opacity={castleOpacity} eyebrow="Why Deckham is not first" title={<>Named wards change the ranking.</>}>
          <p>
            Deckham is rank #{rankFor(byHours, deckham)} when its six small areas are read as one ward: {one.format(deckham.olderHours)} hrs/100 and {nf.format(deckham.olderHoursTotal)} hours/week. Castle, Sunderland is rank #1 at {one.format(castle.olderHours)} hrs/100.
          </p>
        </StoryPanel>
      </div>

      <div style={{opacity: walkerOpacity}}>
        <WardReadout ward={walker} label="Strongest intersectional signal" />
        <StoryPanel opacity={walkerOpacity} eyebrow="Intersectionality" title={<>Walker is where the signals stack.</>} side="left">
          <IntersectionGrid ward={walker} />
          <p>
            Older unpaid care, full-time-plus care, deprivation, poor health and disability are all high in the same local picture.
          </p>
        </StoryPanel>
      </div>

      <div style={{opacity: redhillOpacity}}>
        <WardReadout ward={redhill} label="Second strongest intersection" side="left" />
        <StoryPanel opacity={redhillOpacity} eyebrow="Not an isolated case" title={<>Redhill shows the same warning.</>} side="right">
          <IntersectionGrid ward={redhill} />
        </StoryPanel>
      </div>

      <div style={{opacity: lowOpacity}}>
        <WardReadout ward={northJesmond} label="A different local week" />
        <StoryPanel opacity={lowOpacity} eyebrow="Same city-region" title={<>North Jesmond is not carrying the same load.</>}>
          <p>
            This contrast matters. Later life, care and health are distributed unevenly, even across a short journey.
          </p>
        </StoryPanel>
      </div>

      <StoryPanel opacity={compareOpacity} eyebrow="Take-home" title={<>If the hidden week stopped, it would become visible overnight.</>} side="center">
        <ComparisonBars progress={compareProgress} />
        <p>
          The data do not tell us who receives care. They do show where older people are providing it, and where deprivation, poor health and disability are already in the picture.
        </p>
      </StoryPanel>
    </AbsoluteFill>
  );
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    background: "#020617",
    color: white,
    fontFamily: "Inter, Arial, Helvetica, sans-serif",
    overflow: "hidden",
  },
  mapGlow: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(circle at 78% 18%, rgba(45,212,191,0.18), transparent 28%), radial-gradient(circle at 18% 84%, rgba(163,230,53,0.14), transparent 32%)",
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
  vignette: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background:
      "linear-gradient(90deg, rgba(2,6,23,0.22), transparent 23%, transparent 75%, rgba(2,6,23,0.28)), linear-gradient(0deg, rgba(2,6,23,0.28), transparent 25%, transparent 76%, rgba(2,6,23,0.18))",
  },
  titleCard: {
    position: "absolute",
    left: 62,
    top: 54,
    width: 780,
    padding: 34,
    border: "1px solid rgba(248,250,252,0.22)",
    borderRadius: 10,
    background: deepPanel,
    boxShadow: "0 28px 70px rgba(2,6,23,0.44)",
  },
  brandLine: {
    marginBottom: 15,
  },
  kicker: {
    margin: "0 0 12px",
    color: lime,
    fontSize: 16,
    fontWeight: 900,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  kickerDark: {
    margin: "0 0 10px",
    color: "#65a30d",
    fontSize: 15,
    fontWeight: 900,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    color: white,
    fontSize: 105,
    lineHeight: 0.9,
    letterSpacing: 0,
  },
  lede: {
    margin: "22px 0 0",
    color: "#e2e8f0",
    fontSize: 31,
    lineHeight: 1.24,
    maxWidth: 700,
  },
  clockScene: {
    position: "absolute",
    left: 58,
    top: 58,
    display: "grid",
    gridTemplateColumns: "150px 1fr",
    gap: 32,
    alignItems: "center",
    width: 930,
    padding: 27,
    border: "1px solid rgba(248,250,252,0.2)",
    borderTop: `3px solid ${lime}`,
    borderRadius: 10,
    background: deepPanel,
    boxShadow: "0 24px 64px rgba(2,6,23,0.44)",
  },
  bigNumber: {
    margin: 0,
    color: lime,
    fontSize: 78,
    lineHeight: 0.9,
    letterSpacing: 0,
  },
  clockText: {
    margin: "8px 0 0",
    color: softText,
    fontSize: 24,
    lineHeight: 1.33,
  },
  clockNote: {
    margin: "11px 0 0",
    color: "#b6c3d4",
    fontSize: 20,
    lineHeight: 1.32,
  },
  legend: {
    position: "absolute",
    right: 44,
    top: 42,
    width: 332,
    padding: 16,
    borderRadius: 10,
    border: "1px solid rgba(15,23,42,0.16)",
    background: "rgba(255,255,255,0.86)",
    color: ink,
    boxShadow: "0 18px 42px rgba(15,23,42,0.18)",
  },
  legendRamp: {
    display: "grid",
    gridTemplateColumns: `repeat(${rampColours.length}, 1fr)`,
    height: 14,
    overflow: "hidden",
    borderRadius: 999,
    margin: "10px 0 7px",
  },
  legendLabels: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    color: muted,
    fontSize: 13,
    fontWeight: 800,
  },
  storyPanel: {
    position: "absolute",
    width: 492,
    padding: 25,
    borderRadius: 10,
    border: "1px solid rgba(248,250,252,0.18)",
    borderTop: `3px solid ${lime}`,
    background: deepPanel,
    boxShadow: "0 24px 64px rgba(2,6,23,0.44)",
  },
  panelLeft: {
    left: 58,
    bottom: 50,
  },
  panelRight: {
    right: 58,
    bottom: 50,
  },
  panelCenter: {
    left: 128,
    right: 128,
    bottom: 46,
    width: "auto",
  },
  panelTitle: {
    margin: "0 0 14px",
    color: white,
    fontSize: 41,
    lineHeight: 1.02,
    letterSpacing: 0,
  },
  panelBody: {
    color: softText,
    fontSize: 23,
    lineHeight: 1.36,
  },
  readout: {
    position: "absolute",
    top: 46,
    width: 388,
    padding: 18,
    borderRadius: 10,
    border: "1px solid rgba(15,23,42,0.14)",
    background: "rgba(255,255,255,0.89)",
    color: ink,
    boxShadow: "0 18px 42px rgba(15,23,42,0.19)",
  },
  readoutTitle: {
    margin: "0 0 10px",
    color: ink,
    fontSize: 27,
    lineHeight: 1.02,
    letterSpacing: 0,
  },
  readoutMetrics: {
    display: "grid",
    gap: 6,
    color: muted,
    fontSize: 17,
    lineHeight: 1.28,
  },
  intersectionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
    marginBottom: 15,
  },
  statPill: {
    display: "grid",
    gap: 3,
    padding: "10px 11px",
    borderRadius: 8,
    background: "rgba(248,250,252,0.1)",
    border: "1px solid rgba(248,250,252,0.12)",
  },
  compareBars: {
    display: "grid",
    gap: 16,
    margin: "17px 0 18px",
  },
  compareRow: {
    display: "grid",
    gridTemplateColumns: "280px 1fr 122px",
    gap: 16,
    alignItems: "center",
  },
  compareLabel: {
    display: "grid",
    gap: 5,
    color: softText,
    fontSize: 17,
  },
  barTrack: {
    height: 18,
    borderRadius: 999,
    overflow: "hidden",
    background: "rgba(226,232,240,0.2)",
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
  },
};
