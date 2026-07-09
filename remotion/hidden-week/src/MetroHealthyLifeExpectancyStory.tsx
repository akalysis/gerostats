import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import hleData from "./metro-hle-map-data.json";

type Sex = "male" | "female";
type StageKey =
  | "intro"
  | "method"
  | "map"
  | "deprivation"
  | "lowerHle"
  | "higherHle"
  | "local"
  | "final";

type Camera = {
  zoom: number;
  focusX: number;
  focusY: number;
};

type HleMetric = {
  hle: number;
  low95: number;
  high95: number;
  rawModelHle: number;
  onsDeprivationPrior: number;
  authorityHle: number;
};

type HleStation = {
  station: string;
  x: number;
  y: number;
  imdDecile: number;
  ctyuaName: string;
  msoaName: string;
  male: HleMetric;
  female: HleMetric;
};

type HleMapData = {
  measure: string;
  map: {x: number; y: number; width: number; height: number};
  stations: HleStation[];
};

type StoryStage = {
  key: StageKey;
  start: number;
  end: number;
  title: string;
  subtitle: string;
  focus: Camera;
  sex: Sex;
  stations?: string[];
};

const data = hleData as HleMapData;
const map = data.map;

const fps = 30;
const timingScale = 1.3;
export const metroHleDurationInFrames = Math.round(66 * fps * timingScale);
const seconds = (value: number) => value * fps * timingScale;

const stages: StoryStage[] = [
  {
    key: "intro",
    start: 0,
    end: 6,
    title: "The next question is healthy years",
    subtitle: "The first Metro map asked how long. This follow-up asks how much of that life is expected to be lived in good health.",
    focus: {zoom: 1, focusX: 0.56, focusY: 0.5},
    sex: "male",
  },
  {
    key: "method",
    start: 6,
    end: 12.6,
    title: "",
    subtitle: "",
    focus: {zoom: 1, focusX: 0.56, focusY: 0.5},
    sex: "male",
  },
  {
    key: "map",
    start: 12.6,
    end: 23,
    title: "19.8-year healthy-life gap on one map",
    subtitle: "Between Percy Main (49.5 healthy years) and Ilford Road / South Gosforth (69.3).",
    focus: {zoom: 1, focusX: 0.56, focusY: 0.5},
    sex: "male",
  },
  {
    key: "deprivation",
    start: 23,
    end: 33.4,
    title: "The deprivation gradient is sharper for healthy years",
    subtitle: "D1/D2 station areas average 52.4 male healthy years. D9/D10 areas average 67.1.",
    focus: {zoom: 1, focusX: 0.56, focusY: 0.5},
    sex: "male",
  },
  {
    key: "lowerHle",
    start: 33.4,
    end: 43.8,
    title: "Lower healthy-life estimates cluster",
    subtitle: "Percy Main, Byker, Howdon and Wallsend all sit near the lower end of the HLE map.",
    focus: {zoom: 1.45, focusX: 0.66, focusY: 0.44},
    sex: "male",
    stations: ["Percy Main", "Byker", "Howdon", "Wallsend", "North Shields", "Meadow Well"],
  },
  {
    key: "higherHle",
    start: 43.8,
    end: 52,
    title: "Higher healthy-life estimates cluster too",
    subtitle: "South Gosforth, Ilford Road, East Boldon and Seaburn sit near the other end.",
    focus: {zoom: 1.35, focusX: 0.5, focusY: 0.38},
    sex: "male",
    stations: ["South Gosforth", "Ilford Road", "East Boldon", "Seaburn", "Regent Centre", "Jesmond"],
  },
  {
    key: "local",
    start: 52,
    end: 60,
    title: "A short trip, 15.0 healthy years",
    subtitle: "Fawdon is 54.3 male healthy years. South Gosforth is 69.3.",
    focus: {zoom: 2.15, focusX: 0.31, focusY: 0.17},
    sex: "male",
    stations: ["Fawdon", "South Gosforth", "Ilford Road", "Regent Centre", "Wansbeck Road"],
  },
  {
    key: "final",
    start: 60,
    end: 66,
    title: "The follow-up question changes the scale",
    subtitle: "The male map gap is 19.8 healthy years; the female gap is 21.1.",
    focus: {zoom: 1, focusX: 0.56, focusY: 0.5},
    sex: "male",
  },
];

const byName = new Map(data.stations.map((station) => [station.station, station]));
const stageByKey = Object.fromEntries(stages.map((stage) => [stage.key, stage])) as Record<StageKey, StoryStage>;
const lowerNames = ["Percy Main", "Byker", "Howdon", "Wallsend"];
const higherNames = ["South Gosforth", "Ilford Road", "East Boldon", "Seaburn"];
const localNames = ["Fawdon", "South Gosforth", "Ilford Road", "Regent Centre"];
const localComparisonNames = ["Fawdon", "South Gosforth"];

const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;
const metricForSex = (station: HleStation, sex: Sex) => station[sex];
const valueForSex = (station: HleStation, sex: Sex) => metricForSex(station, sex).hle;

const sexSummary = (sex: Sex) => {
  const sorted = [...data.stations].sort((a, b) => valueForSex(a, sex) - valueForSex(b, sex));
  const low = sorted[0];
  const high = sorted[sorted.length - 1];
  const deprived = data.stations.filter((station) => station.imdDecile <= 2);
  const leastDeprived = data.stations.filter((station) => station.imdDecile >= 9);
  const deprivedAverage = mean(deprived.map((station) => valueForSex(station, sex)));
  const leastDeprivedAverage = mean(leastDeprived.map((station) => valueForSex(station, sex)));
  return {
    low,
    high,
    gap: valueForSex(high, sex) - valueForSex(low, sex),
    deprivedAverage,
    leastDeprivedAverage,
    deprivationGap: leastDeprivedAverage - deprivedAverage,
  };
};

const maleSummary = sexSummary("male");
const femaleSummary = sexSummary("female");
const maleRange = {
  min: Math.min(...data.stations.map((station) => station.male.hle)),
  max: Math.max(...data.stations.map((station) => station.male.hle)),
};
const femaleRange = {
  min: Math.min(...data.stations.map((station) => station.female.hle)),
  max: Math.max(...data.stations.map((station) => station.female.hle)),
};
const localGap = valueForSex(byName.get("South Gosforth")!, "male") - valueForSex(byName.get("Fawdon")!, "male");
const finalPulseNames = [maleSummary.low.station, maleSummary.high.station, "South Gosforth", "Fawdon"];

const finalRows = [
  {
    label: "Lowest-highest HLE gap",
    male: `${maleSummary.gap.toFixed(1)} years`,
    female: `${femaleSummary.gap.toFixed(1)} years`,
  },
  {
    label: "D1/D2 to D9/D10 gap",
    male: `${maleSummary.deprivationGap.toFixed(1)} years`,
    female: `${femaleSummary.deprivationGap.toFixed(1)} years`,
  },
  {
    label: "D1/D2 average",
    male: `${maleSummary.deprivedAverage.toFixed(1)} years`,
    female: `${femaleSummary.deprivedAverage.toFixed(1)} years`,
  },
  {
    label: "D9/D10 average",
    male: `${maleSummary.leastDeprivedAverage.toFixed(1)} years`,
    female: `${femaleSummary.leastDeprivedAverage.toFixed(1)} years`,
  },
];

const stageForFrame = (frame: number) =>
  stages.find((stage) => frame >= seconds(stage.start) && frame < seconds(stage.end)) ?? stages[0];

const clampFade = (frame: number, start: number, end: number, fade = 18) =>
  Math.min(
    interpolate(frame, [seconds(start), seconds(start) + fade], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    }),
    interpolate(frame, [seconds(end) - fade, seconds(end)], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.in(Easing.cubic),
    }),
  );

const rise = (frame: number, start: number, duration = 0.72, distance = 28) =>
  interpolate(frame, [seconds(start), seconds(start + duration)], [distance, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

const pop = (frame: number, startFrame: number) =>
  spring({
    frame: frame - startFrame,
    fps,
    config: {damping: 18, stiffness: 135, mass: 0.72},
  });

const rangeForSex = (sex: Sex) => (sex === "male" ? maleRange : femaleRange);

const rankColor = (value: number, sex: Sex) => {
  const range = rangeForSex(sex);
  const position = (value - range.min) / (range.max - range.min);
  if (position < 0.2) return "#c5162e";
  if (position < 0.42) return "#e85d04";
  if (position < 0.64) return "#f2a900";
  return "#15965b";
};

const imdColor = (decile: number) => {
  if (decile <= 1) return "#7f1019";
  if (decile <= 2) return "#c5162e";
  if (decile <= 4) return "#e85d04";
  return "#2e3a3a";
};

const shortName = (station: string) =>
  station
    .replace("Callerton Parkway", "Callerton")
    .replace("Chillingham Road", "Chillingham")
    .replace("Central Station", "Central")
    .replace("Northumberland Park", "Northumberland")
    .replace("South Gosforth", "S Gosforth")
    .replace("Stadium Of Light", "Stadium");

const easeCamera = (frame: number): Camera => {
  const keyframes = [
    {time: 0, camera: stageByKey.intro.focus},
    {time: 23, camera: stageByKey.deprivation.focus},
    {time: 33.1, camera: stageByKey.deprivation.focus},
    {time: 34.4, camera: stageByKey.lowerHle.focus},
    {time: 42.6, camera: stageByKey.lowerHle.focus},
    {time: 44.8, camera: stageByKey.higherHle.focus},
    {time: 50.8, camera: stageByKey.higherHle.focus},
    {time: 52.8, camera: stageByKey.local.focus},
    {time: 58.9, camera: stageByKey.local.focus},
    {time: 61, camera: stageByKey.final.focus},
    {time: 66, camera: stageByKey.final.focus},
  ];
  const input = keyframes.map((item) => seconds(item.time));
  return {
    zoom: interpolate(
      frame,
      input,
      keyframes.map((item) => item.camera.zoom),
      {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic)},
    ),
    focusX: interpolate(
      frame,
      input,
      keyframes.map((item) => item.camera.focusX),
      {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic)},
    ),
    focusY: interpolate(
      frame,
      input,
      keyframes.map((item) => item.camera.focusY),
      {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic)},
    ),
  };
};

const translateForCamera = (camera: Camera) => {
  const rawX = map.width / 2 - camera.focusX * map.width * camera.zoom;
  const rawY = map.height / 2 - camera.focusY * map.height * camera.zoom;
  const minX = map.width - map.width * camera.zoom;
  const minY = map.height - map.height * camera.zoom;
  return {
    x: Math.min(0, Math.max(minX, rawX)),
    y: Math.min(0, Math.max(minY, rawY)),
  };
};

const isActiveStation = (station: HleStation, stage: StoryStage) => {
  if (stage.key === "intro" || stage.key === "method") return false;
  if (stage.key === "map" || stage.key === "deprivation" || stage.key === "final") return true;
  return stage.stations?.includes(station.station) ?? false;
};

const stationOpacity = (frame: number, station: HleStation, stage: StoryStage, index: number) => {
  if (stage.key === "intro" || stage.key === "method") return 0;
  const mapFade = interpolate(frame, [seconds(12.6), seconds(13.6) + index * 0.35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  if (stage.key === "map" || stage.key === "deprivation" || stage.key === "final") return mapFade * 0.95;
  return mapFade * (isActiveStation(station, stage) ? 1 : 0.12);
};

const shouldPulseStation = (station: HleStation, stage: StoryStage) => {
  if (stage.key === "intro" || stage.key === "method") return false;
  if (stage.key === "map" || stage.key === "final") return finalPulseNames.includes(station.station);
  if (stage.key === "deprivation") return station.imdDecile <= 2 || station.imdDecile >= 9;
  if (stage.key === "local") return localComparisonNames.includes(station.station);
  return stage.stations?.includes(station.station) ?? false;
};

const TitleIntro: React.FC<{frame: number}> = ({frame}) => {
  const opacity = clampFade(frame, 0.4, 6, 18);
  return (
    <div
      style={{
        position: "absolute",
        left: 86,
        top: 54 + rise(frame, 0.4, 0.75, 22),
        width: 1240,
        opacity,
        zIndex: 50,
      }}
    >
      <div style={{fontSize: 56, lineHeight: 0.98, color: "#111111", fontWeight: 950}}>
        The next question is healthy years
      </div>
      <div style={{fontSize: 25, color: "#444444", marginTop: 14, lineHeight: 1.2, width: 1040}}>
        The first Metro map asked how long life is expected to last. This follow-up asks how much of that life is expected to be
        healthy.
      </div>
    </div>
  );
};

const MethodScene: React.FC<{frame: number}> = ({frame}) => {
  const opacity = clampFade(frame, 6, 12.6, 22);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#fbfaf7",
        opacity,
        transform: `translateY(${rise(frame, 6, 0.7, 24)}px)`,
        zIndex: 70,
      }}
    >
      <div style={{position: "absolute", left: 86, top: 76, fontSize: 58, fontWeight: 950, color: "#111111"}}>
        What changed in the follow-up
      </div>
      <div style={{position: "absolute", left: 90, top: 166, width: 1160, fontSize: 30, lineHeight: 1.18, color: "#333333"}}>
        Healthy life expectancy is not published for every station neighbourhood, so the map has to borrow information.
      </div>
      <div
        style={{
          position: "absolute",
          left: 88,
          top: 282,
          width: 1180,
          height: 370,
          border: "5px solid #111111",
          background: "#ffffff",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          columnGap: 18,
          padding: "28px 30px",
        }}
      >
        <div style={{borderTop: "7px solid #111111", paddingTop: 16}}>
          <div style={{fontSize: 18, fontWeight: 950, color: "#555555"}}>Anchor</div>
          <div style={{fontSize: 31, fontWeight: 950, color: "#111111", marginTop: 10, lineHeight: 1.02}}>
            official local HLE
          </div>
          <div style={{fontSize: 17, color: "#555555", marginTop: 12, lineHeight: 1.2}}>
            Published authority healthy life expectancy fixes the local level.
          </div>
        </div>
        <div style={{borderTop: "7px solid #c5162e", paddingTop: 16}}>
          <div style={{fontSize: 18, fontWeight: 950, color: "#c5162e"}}>Local evidence</div>
          <div style={{fontSize: 31, fontWeight: 950, color: "#111111", marginTop: 10, lineHeight: 1.02}}>
            local covariates
          </div>
          <div style={{fontSize: 17, color: "#555555", marginTop: 12, lineHeight: 1.2}}>
            MSOA life expectancy, Census health, disability and age structure.
          </div>
        </div>
        <div style={{borderTop: "7px solid #7f1019", paddingTop: 16}}>
          <div style={{fontSize: 18, fontWeight: 950, color: "#7f1019"}}>National pattern</div>
          <div style={{fontSize: 31, fontWeight: 950, color: "#111111", marginTop: 10, lineHeight: 1.02}}>
            ONS deprivation gradient
          </div>
          <div style={{fontSize: 17, color: "#555555", marginTop: 12, lineHeight: 1.2}}>
            D1 to D10 supplies the broad healthy-years inequality shape.
          </div>
        </div>
        <div style={{borderTop: "7px solid #15965b", paddingTop: 16}}>
          <div style={{fontSize: 18, fontWeight: 950, color: "#15965b"}}>Output</div>
          <div style={{fontSize: 31, fontWeight: 950, color: "#111111", marginTop: 10, lineHeight: 1.02}}>
            station HLE estimate
          </div>
          <div style={{fontSize: 17, color: "#555555", marginTop: 12, lineHeight: 1.2}}>
            Modelled estimates, not official station statistics.
          </div>
        </div>
      </div>
      <div style={{position: "absolute", left: 90, top: 690, width: 1160, fontSize: 24, color: "#444444", lineHeight: 1.22}}>
        The map is constrained to stay plausible against what ONS publishes for deprivation and local authority HLE.
      </div>
    </div>
  );
};

const Header: React.FC<{frame: number}> = ({frame}) => {
  const opacity = interpolate(frame, [seconds(12.6), seconds(13.5)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <div style={{position: "absolute", left: 64, top: 38, opacity, zIndex: 45}}>
      <div style={{fontSize: 42, lineHeight: 1, fontWeight: 950, color: "#111111"}}>
        Where you are born: healthy years across the Metro map
      </div>
      <div style={{display: "flex", alignItems: "center", gap: 16, marginTop: 12}}>
        <div style={{fontSize: 21, color: "#444444", width: 1250}}>
          Number = estimated healthy life expectancy at birth. Border = IMD deprivation; D1 is most deprived, D10 least.
        </div>
      </div>
    </div>
  );
};

const Legend: React.FC<{frame: number}> = ({frame}) => {
  const opacity = interpolate(frame, [seconds(13.2), seconds(14.1)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 66,
        top: 152,
        display: "flex",
        gap: 22,
        alignItems: "center",
        fontSize: 16,
        color: "#333333",
        opacity,
        zIndex: 45,
      }}
    >
      <LegendItem color="#c5162e" label="lower male HLE" />
      <LegendItem color="#f2a900" label="middle" />
      <LegendItem color="#15965b" label="higher male HLE" />
      <div style={{display: "flex", alignItems: "center", gap: 8}}>
        <div style={{width: 28, height: 28, borderRadius: 28, border: "6px solid #7f1019"}} />
        <span>IMD D1/D2 most deprived</span>
      </div>
      <div style={{color: "#666666"}}>{data.stations.length} original-map stations shown</div>
    </div>
  );
};

const LegendItem: React.FC<{color: string; label: string}> = ({color, label}) => (
  <div style={{display: "flex", alignItems: "center", gap: 8}}>
    <div style={{width: 28, height: 28, borderRadius: 28, background: color}} />
    <span>{label}</span>
  </div>
);

const StationMarker: React.FC<{
  station: HleStation;
  frame: number;
  index: number;
  stage: StoryStage;
}> = ({station, frame, index, stage}) => {
  const sex: Sex = "male";
  const value = valueForSex(station, sex);
  const active = isActiveStation(station, stage);
  const highlighted = active && stage.key !== "map" && stage.key !== "deprivation" && stage.key !== "final";
  const pulsing = shouldPulseStation(station, stage);
  const baseSize = stage.key === "map" || stage.key === "deprivation" || stage.key === "final" ? 31 : 25;
  const size = highlighted ? 50 : pulsing && stage.key !== "deprivation" ? 46 : baseSize;
  const markerScale = highlighted ? Math.min(pop(frame, seconds(stage.start) + index * 0.8), 1.08) : 1;
  const color = rankColor(value, sex);
  const range = rangeForSex(sex);
  const position = (value - range.min) / (range.max - range.min);
  const textColor = position < 0.64 ? "#ffffff" : "#111111";
  const opacity = stationOpacity(frame, station, stage, index);
  const left = station.x * map.width;
  const top = station.y * map.height;
  const showNumber = active || stage.key === "map" || stage.key === "deprivation" || stage.key === "final";
  const pulse = pulsing ? (Math.sin((frame - seconds(stage.start)) * 0.17 + index * 0.47) + 1) / 2 : 0;
  const pulseSize = size + (stage.key === "deprivation" ? 12 : 20) + pulse * (stage.key === "deprivation" ? 10 : 18);
  const pulseOpacity = pulsing ? 0.36 - pulse * 0.22 : 0;

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: size,
        height: size,
        transform: `translate(-50%, -50%) scale(${markerScale})`,
        borderRadius: size,
        background: color,
        border: `${station.imdDecile <= 2 ? 4 : 2}px solid ${imdColor(station.imdDecile)}`,
        overflow: "visible",
        boxShadow: highlighted
          ? "0 12px 22px rgba(0,0,0,0.25), 0 0 0 7px rgba(197,22,46,0.12)"
          : pulsing
            ? "0 10px 20px rgba(0,0,0,0.22), 0 0 0 5px rgba(17,17,17,0.08)"
            : "0 5px 12px rgba(0,0,0,0.18)",
        color: textColor,
        opacity,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 950,
        fontSize: highlighted ? 14 : 10,
        lineHeight: 1,
        zIndex: highlighted || pulsing ? 24 : 12,
      }}
    >
      {pulsing ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: pulseSize,
            height: pulseSize,
            borderRadius: pulseSize,
            transform: "translate(-50%, -50%)",
            border: `4px solid ${stage.key === "deprivation" ? imdColor(station.imdDecile) : color}`,
            background: "transparent",
            opacity: pulseOpacity,
            zIndex: 1,
          }}
        />
      ) : null}
      <span style={{position: "relative", zIndex: 2}}>{showNumber ? Math.round(value) : ""}</span>
    </div>
  );
};

const MapStage: React.FC<{frame: number}> = ({frame}) => {
  const camera = easeCamera(frame);
  const translate = translateForCamera(camera);
  const stage = stageForFrame(frame);
  const opacity = interpolate(frame, [0, seconds(1.1)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div
      style={{
        position: "absolute",
        left: map.x,
        top: map.y,
        width: map.width,
        height: map.height,
        overflow: "hidden",
        border: "4px solid #111111",
        background: "#ffffff",
        opacity,
        zIndex: 8,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: map.width,
          height: map.height,
          transformOrigin: "0 0",
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${camera.zoom})`,
        }}
      >
        <Img
          src={staticFile("assets/metro-map-feb-2026.png")}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: map.width,
            height: map.height,
            objectFit: "cover",
            opacity: 1,
            filter: "none",
          }}
        />
        {data.stations.map((station, index) => (
          <StationMarker key={station.station} station={station} frame={frame} index={index} stage={stage} />
        ))}
      </div>
    </div>
  );
};

const SummaryPair: React.FC<{label: string; color: string; low: HleStation; high: HleStation; gap: number; sex: Sex}> = ({
  label,
  color,
  low,
  high,
  gap,
  sex,
}) => (
  <div style={{borderTop: `6px solid ${color}`, paddingTop: 12}}>
    <div style={{fontSize: 18, color, fontWeight: 950}}>{label}</div>
    <div style={{marginTop: 8, fontSize: 50, color: "#111111", fontWeight: 950, lineHeight: 0.9}}>{gap.toFixed(1)}</div>
    <div style={{marginTop: 7, fontSize: 17, color: "#555555", lineHeight: 1.1}}>healthy years between places</div>
    <div style={{marginTop: 12, fontSize: 17, color: "#222222", lineHeight: 1.12}}>
      {low.station} ({valueForSex(low, sex).toFixed(1)}) to {high.station} ({valueForSex(high, sex).toFixed(1)})
    </div>
  </div>
);

const MapRow: React.FC<{station: HleStation; sex?: Sex; emphasize?: boolean}> = ({station, sex = "male", emphasize = false}) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "190px 104px 52px",
      alignItems: "center",
      columnGap: 10,
    }}
  >
    <div style={{fontSize: 18, color: "#111111", fontWeight: emphasize || station.imdDecile <= 2 ? 950 : 760, lineHeight: 1.05}}>
      {shortName(station.station)}
    </div>
    <div style={{fontSize: 24, color: rankColor(valueForSex(station, sex), sex), fontWeight: 950}}>
      {valueForSex(station, sex).toFixed(1)}
    </div>
    <div style={{fontSize: 19, color: imdColor(station.imdDecile), fontWeight: 950}}>D{station.imdDecile}</div>
  </div>
);

const MainPanel: React.FC<{frame: number}> = ({frame}) => {
  const stage = stageForFrame(frame);
  const opacity =
    stage.key === "final"
      ? interpolate(frame, [seconds(stage.start), seconds(stage.start) + 18], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        })
      : clampFade(frame, stage.start, stage.end, 18);
  const y = rise(frame, stage.start, 0.58, 22);

  if (stage.key === "intro" || stage.key === "method") return null;

  if (stage.key === "map") {
    return (
      <div style={{position: "absolute", right: 52, top: 218, width: 468, opacity, transform: `translateY(${y}px)`, zIndex: 45}}>
        <div style={{fontSize: 44, fontWeight: 950, color: "#111111", lineHeight: 0.96}}>{stage.title}</div>
        <div style={{marginTop: 14, fontSize: 21, color: "#444444", lineHeight: 1.16}}>{stage.subtitle}</div>
        <div style={{marginTop: 26}}>
          <SummaryPair label="males" low={maleSummary.low} high={maleSummary.high} gap={maleSummary.gap} sex="male" color="#111111" />
        </div>
        <div style={{marginTop: 25, borderTop: "5px solid #7f1019", paddingTop: 12}}>
          <div style={{fontSize: 20, fontWeight: 950, color: "#7f1019"}}>Healthy years, not total years</div>
          <div style={{marginTop: 8, fontSize: 17, color: "#555555", lineHeight: 1.12}}>
            The same geography looks harsher when the outcome is time expected in good health.
          </div>
        </div>
      </div>
    );
  }

  if (stage.key === "deprivation") {
    return (
      <div style={{position: "absolute", right: 52, top: 210, width: 468, opacity, transform: `translateY(${y}px)`, zIndex: 45}}>
        <div style={{fontSize: 43, fontWeight: 950, color: "#111111", lineHeight: 0.96}}>{stage.title}</div>
        <div style={{marginTop: 14, fontSize: 21, color: "#444444", lineHeight: 1.16}}>{stage.subtitle}</div>
        <div style={{marginTop: 18, borderTop: "5px solid #7f1019", paddingTop: 12}}>
          <div style={{fontSize: 16, color: "#7f1019", fontWeight: 950, lineHeight: 1.05}}>
            IMD = Index of Multiple Deprivation
          </div>
          <div style={{marginTop: 5, fontSize: 15, color: "#555555", lineHeight: 1.14}}>
            D1 is the most deprived tenth of areas; D10 is the least deprived.
          </div>
          <div style={{marginTop: 14, fontSize: 20, fontWeight: 950, color: "#7f1019"}}>Male deprivation gap</div>
          <div style={{marginTop: 8, fontSize: 58, fontWeight: 950, color: "#111111", lineHeight: 0.9}}>
            {maleSummary.deprivationGap.toFixed(1)} years
          </div>
          <div style={{marginTop: 12, fontSize: 24, fontWeight: 950, color: "#111111", lineHeight: 1.05}}>
            {maleSummary.deprivedAverage.toFixed(1)} vs {maleSummary.leastDeprivedAverage.toFixed(1)}
          </div>
          <div style={{marginTop: 7, fontSize: 17, color: "#555555", lineHeight: 1.12}}>
            Difference between D1/D2 most deprived areas and D9/D10 least deprived areas.
          </div>
        </div>
      </div>
    );
  }

  if (stage.key === "lowerHle" || stage.key === "higherHle") {
    const rows = (stage.key === "lowerHle" ? lowerNames : higherNames)
      .map((name) => byName.get(name))
      .filter((station): station is HleStation => Boolean(station));
    return (
      <div style={{position: "absolute", right: 50, top: 214, width: 478, opacity, transform: `translateY(${y}px)`, zIndex: 45}}>
        <div style={{fontSize: 42, fontWeight: 950, color: "#111111", lineHeight: 0.96}}>{stage.title}</div>
        <div style={{marginTop: 14, fontSize: 21, color: "#444444", lineHeight: 1.16}}>{stage.subtitle}</div>
        <div style={{marginTop: 22, display: "grid", gridTemplateColumns: "190px 104px 52px", columnGap: 10}}>
          <div />
          <div style={{fontSize: 15, fontWeight: 950, color: "#555555"}}>male HLE</div>
          <div style={{fontSize: 15, fontWeight: 950, color: "#555555"}}>IMD</div>
        </div>
        <div style={{marginTop: 10, display: "flex", flexDirection: "column", gap: 12}}>
          {rows.map((station) => (
            <MapRow key={station.station} station={station} emphasize />
          ))}
        </div>
        <div style={{marginTop: 24, borderTop: "5px solid #111111", paddingTop: 12}}>
          <div style={{fontSize: 42, fontWeight: 950, color: "#111111", lineHeight: 0.95}}>
            {stage.key === "lowerHle" ? "not just one outlier" : "not just one advantaged stop"}
          </div>
          <div style={{marginTop: 8, fontSize: 17, color: "#555555", lineHeight: 1.12}}>
            {stage.key === "lowerHle"
              ? "The lower HLE stations form a spatial pattern across the network."
              : "The higher HLE stations are geographically patterned too."}
          </div>
        </div>
      </div>
    );
  }

  if (stage.key === "local") {
    const rows = localNames.map((name) => byName.get(name)).filter((station): station is HleStation => Boolean(station));
    return (
      <div style={{position: "absolute", right: 50, top: 214, width: 478, opacity, transform: `translateY(${y}px)`, zIndex: 45}}>
        <div style={{fontSize: 42, fontWeight: 950, color: "#111111", lineHeight: 0.96}}>{stage.title}</div>
        <div style={{marginTop: 14, fontSize: 21, color: "#444444", lineHeight: 1.16}}>{stage.subtitle}</div>
        <div style={{marginTop: 22, display: "grid", gridTemplateColumns: "190px 104px 52px", columnGap: 10}}>
          <div />
          <div style={{fontSize: 15, fontWeight: 950, color: "#555555"}}>male HLE</div>
          <div style={{fontSize: 15, fontWeight: 950, color: "#555555"}}>IMD</div>
        </div>
        <div style={{marginTop: 10, display: "flex", flexDirection: "column", gap: 12}}>
          {rows.map((station) => (
            <MapRow key={station.station} station={station} emphasize={localComparisonNames.includes(station.station)} />
          ))}
        </div>
        <div style={{marginTop: 24, borderTop: "5px solid #111111", paddingTop: 12}}>
          <div style={{fontSize: 18, color: "#555555", fontWeight: 950}}>Fawdon to South Gosforth</div>
          <div style={{marginTop: 7, fontSize: 52, color: "#111111", fontWeight: 950, lineHeight: 0.9}}>
            {localGap.toFixed(1)} years
          </div>
          <div style={{marginTop: 8, fontSize: 17, color: "#444444", lineHeight: 1.12}}>
            The nearby contrast gets larger when the measure is healthy life expectancy.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{position: "absolute", right: 48, top: 154, width: 486, opacity, transform: `translateY(${y}px)`, zIndex: 45}}>
      <div style={{fontSize: 43, fontWeight: 950, color: "#111111", lineHeight: 0.94}}>{stage.title}</div>
      <div style={{marginTop: 11, fontSize: 19, color: "#444444", lineHeight: 1.12}}>{stage.subtitle}</div>
      <div style={{marginTop: 16, borderTop: "6px solid #111111", paddingTop: 11}}>
        <div style={{fontSize: 17, color: "#555555", fontWeight: 950}}>Estimated HLE</div>
        <div style={{marginTop: 5, fontSize: 68, color: "#111111", fontWeight: 950, lineHeight: 0.84}}>
          {maleSummary.gap.toFixed(1)} years
        </div>
        <div style={{marginTop: 8, fontSize: 17, color: "#444444", lineHeight: 1.12}}>
          Difference between Percy Main and Ilford Road / South Gosforth.
        </div>
        <div style={{marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16}}>
          <div style={{borderTop: "5px solid #c5162e", paddingTop: 9}}>
            <div style={{fontSize: 15, color: "#7f1019", fontWeight: 950}}>lowest</div>
            <div style={{marginTop: 4, fontSize: 22, color: "#111111", fontWeight: 950, lineHeight: 1.02}}>
              {maleSummary.low.station}
            </div>
            <div style={{marginTop: 5, fontSize: 36, color: "#c5162e", fontWeight: 950, lineHeight: 0.9}}>
              {valueForSex(maleSummary.low, "male").toFixed(1)}
            </div>
            <div style={{marginTop: 5, fontSize: 15, color: imdColor(maleSummary.low.imdDecile), fontWeight: 950}}>
              IMD D{maleSummary.low.imdDecile}
            </div>
          </div>
          <div style={{borderTop: "5px solid #15965b", paddingTop: 9}}>
            <div style={{fontSize: 15, color: "#15965b", fontWeight: 950}}>highest</div>
            <div style={{marginTop: 4, fontSize: 20, color: "#111111", fontWeight: 950, lineHeight: 1.02}}>
              Ilford Road / S Gosforth
            </div>
            <div style={{marginTop: 5, fontSize: 36, color: "#15965b", fontWeight: 950, lineHeight: 0.9}}>
              {valueForSex(maleSummary.high, "male").toFixed(1)}
            </div>
            <div style={{marginTop: 5, fontSize: 15, color: imdColor(maleSummary.high.imdDecile), fontWeight: 950}}>
              IMD D{maleSummary.high.imdDecile}
            </div>
          </div>
        </div>
      </div>
      <div style={{marginTop: 16, borderTop: "5px solid #7f1019", paddingTop: 10}}>
        <div style={{fontSize: 18, color: "#7f1019", fontWeight: 950, lineHeight: 1}}>Male vs female comparison</div>
        <div style={{marginTop: 8, display: "flex", flexDirection: "column"}}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "152px 1fr 1fr",
              columnGap: 11,
              paddingBottom: 6,
              borderBottom: "3px solid #111111",
            }}
          >
            <div style={{fontSize: 14, color: "#555555", fontWeight: 950}}>measure</div>
            <div style={{fontSize: 15, color: "#111111", fontWeight: 950}}>male</div>
            <div style={{fontSize: 15, color: "#15965b", fontWeight: 950}}>female</div>
          </div>
          {finalRows.map((row, index) => (
            <div
              key={row.label}
              style={{
                display: "grid",
                gridTemplateColumns: "152px 1fr 1fr",
                columnGap: 11,
                alignItems: "center",
                minHeight: index === 0 ? 45 : 38,
                borderBottom: index === finalRows.length - 1 ? "none" : "2px solid rgba(17,17,17,0.12)",
              }}
            >
              <div style={{fontSize: 14, color: row.label.includes("D1") ? "#7f1019" : "#444444", fontWeight: 950, lineHeight: 1.05}}>
                {row.label}
              </div>
              <div style={{fontSize: index === 0 ? 22 : 17, color: "#111111", fontWeight: 950, lineHeight: 1.05}}>{row.male}</div>
              <div style={{fontSize: index === 0 ? 22 : 17, color: "#15965b", fontWeight: 950, lineHeight: 1.05}}>{row.female}</div>
            </div>
          ))}
        </div>
        <div style={{marginTop: 8, fontSize: 14, color: "#444444", lineHeight: 1.14}}>
          Values are modelled station-local healthy life expectancy, not official station estimates.
        </div>
      </div>
    </div>
  );
};

export const MetroHealthyLifeExpectancyStory = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const mapOpacity = interpolate(frame, [0, seconds(1.1)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill
      style={{
        width,
        height,
        background: "#fbfaf7",
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: 560,
          height: "100%",
          background: "#f4f1ea",
          borderLeft: "2px solid rgba(0,0,0,0.08)",
          opacity: mapOpacity,
          zIndex: 5,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 142,
          top: 456,
          width: 1510,
          textAlign: "center",
          transform: "rotate(-10deg)",
          fontSize: 82,
          lineHeight: 1,
          letterSpacing: 0,
          color: "#111111",
          fontWeight: 950,
          opacity: 0.06,
          zIndex: 44,
          pointerEvents: "none",
        }}
      >
        Andrew Kingston
      </div>
      <MapStage frame={frame} />
      <Header frame={frame} />
      <Legend frame={frame} />
      <MainPanel frame={frame} />
      <MethodScene frame={frame} />
      <TitleIntro frame={frame} />
      <div
        style={{
          position: "absolute",
          left: 72,
          bottom: 28,
          width: 1320,
          fontSize: 15,
          color: "#666666",
          zIndex: 100,
        }}
      >
        Sources: OHID Fingertips HLE and MSOA life expectancy; ONS HLE by deprivation, ONS geography; Nomis Census 2021; DfT NaPTAN.
        Values are modelled station-local HLE at birth, not official station estimates.
      </div>
      <div
        style={{
          position: "absolute",
          right: 50,
          bottom: 24,
          fontSize: 17,
          lineHeight: 1.1,
          color: "#555555",
          fontWeight: 850,
          textAlign: "right",
          zIndex: 101,
        }}
      >
        <div>Created by Andrew Kingston PhD CStat SFHEA</div>
      </div>
    </AbsoluteFill>
  );
};
