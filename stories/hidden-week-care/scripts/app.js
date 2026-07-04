const mapContainer = document.querySelector("#care-map");
const tooltip = document.querySelector("#map-tooltip");
const sceneLabel = document.querySelector("#scene-label");
const sceneTitle = document.querySelector("#scene-title");
const sceneText = document.querySelector("#scene-text");
const sceneMetrics = document.querySelector("#scene-metrics");
const rankPanel = document.querySelector("#rank-panel");
const mapOverlayList = document.querySelector("#map-overlay-list");
const legend = document.querySelector("#legend");
const heightNote = document.querySelector("#height-note");
const sceneSelect = document.querySelector("#care-scene-select");
const placeSelect = document.querySelector("#care-place-select");
const fullscreenMap = document.querySelector("#fullscreen-map");
const resetView = document.querySelector("#reset-view");
const storyToggle = document.querySelector("#story-toggle");
const storyProgress = document.querySelector("#story-progress");
const mapReadoutLabel = document.querySelector("#map-readout-label");
const mapReadoutName = document.querySelector("#map-readout-name");
const mapReadoutRegion = document.querySelector("#map-readout-region");
const mapReadoutRate = document.querySelector("#map-readout-rate");
const mapReadoutCarers = document.querySelector("#map-readout-carers");
const mapReadoutHealth = document.querySelector("#map-readout-health");
const mapReadoutDeprivation = document.querySelector("#map-readout-deprivation");
const sceneTabs = Array.from(document.querySelectorAll(".scene-tab"));
const focusButtons = Array.from(document.querySelectorAll("[data-focus]"));
const zoomButtons = Array.from(document.querySelectorAll("[data-zoom]"));

const formatNumber = new Intl.NumberFormat("en-GB");
const formatOne = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const dataVersion = "20260704-flat-care";
const greenRedRamp = ["#0f766e", "#22c55e", "#a3e635", "#facc15", "#fb923c", "#b91c1c"];
const heightStops = [80, 700, 1400, 2200, 3200, 4500];
const emptyCollection = { type: "FeatureCollection", features: [] };

const focusConfig = {
  all: { label: "All" },
  walker: { ward: "Walker", lad: "Newcastle upon Tyne" },
  redhill: { ward: "Redhill", lad: "Sunderland" },
  castle: { ward: "Castle", lad: "Sunderland" },
  "north-jesmond": { ward: "North Jesmond", lad: "Newcastle upon Tyne" },
  coast: {
    label: "Coast",
    wards: new Set([
      "Beacon and Bents",
      "Cullercoats & Whitley Bay South",
      "Monkseaton",
      "North Shields",
      "St Mary's",
      "Tynemouth",
      "Whitley Bay North",
      "Whitburn and Marsden",
    ]),
  },
};

const sceneConfig = {
  week: {
    metric: "older_minimum_hours_per_100_65plus",
    heightMetric: "older_minimum_hours_per_100_65plus",
    highFlag: "high_older_burden",
    legendTitle: "Older-care hours",
    legendLow: "Lower burden",
    legendHigh: "Higher burden",
    legendNote: "Minimum weekly care-hours per 100 residents aged 65+.",
    heightTitle: "Colour is care-hours",
    heightBody: "Green is lower; amber and red mark higher lower-bound weekly care-hours from residents aged 65+.",
  },
  deprivation: {
    metric: "imd_decile",
    heightMetric: "older_minimum_hours_per_100_65plus",
    highFlag: "high_older_burden",
    legendTitle: "Deprivation decile",
    legendLow: "Most deprived",
    legendHigh: "Least deprived",
    legendNote: "Colour shows IMD decile. The care burden stays in the readout and rankings.",
    heightTitle: "Colour is deprivation",
    heightBody: "Red marks more deprived small areas. Use this with the care readout to see where pressures intersect.",
  },
  heavy: {
    metric: "older_heavy_care_pct",
    heightMetric: "older_heavy_care_pct",
    highFlag: "high_older_heavy_care",
    legendTitle: "Full-time-plus older care",
    legendLow: "Lower share",
    legendHigh: "Higher share",
    legendNote: "Share of residents aged 65+ reporting 50 or more unpaid-care hours a week.",
    heightTitle: "Colour is full-time-plus care",
    heightBody: "This highlights older residents reporting 50+ unpaid-care hours a week.",
  },
  stack: {
    metric: "older_stack_score",
    heightMetric: "older_stack_score",
    highFlag: "high_older_stack",
    legendTitle: "Intersectional signal",
    legendLow: "Lower signal",
    legendHigh: "Higher signal",
    legendNote: "Older care, full-time-plus care, deprivation, bad health and disability brought together.",
    heightTitle: "Colour is the stacked signal",
    heightBody: "The strongest areas are where older care, full-time-plus care, deprivation, poor health and disability intersect.",
  },
};

const state = {
  geo: null,
  wards: null,
  summary: null,
  distributions: null,
  scene: "week",
  focus: "all",
  map: null,
  popup: null,
  loaded: false,
  fallback: false,
  flatMode: true,
  storyTimer: null,
  storyIndex: 0,
};

const storySteps = [
  { scene: "week", focus: "all" },
  { scene: "week", focus: "castle" },
  { scene: "deprivation", focus: "walker" },
  { scene: "heavy", focus: "redhill" },
  { scene: "stack", focus: "walker" },
  { scene: "week", focus: "north-jesmond" },
];

function displayLad(lad) {
  return lad.replace("Newcastle upon Tyne", "Newcastle");
}

function wardName(ward) {
  return `${ward.ward}, ${displayLad(ward.lad)}`;
}

function formatThousands(value) {
  return formatNumber.format(Math.round(value));
}

function valueLabel(ward) {
  if (state.scene === "heavy") return `${formatOne.format(ward.older_heavy_care_pct)}%`;
  if (state.scene === "deprivation") return `D${formatOne.format(ward.imd_decile_mean)}`;
  if (state.scene === "stack") return `${formatOne.format(ward.older_minimum_hours_per_100_65plus)} hrs`;
  return `${formatOne.format(ward.older_minimum_hours_per_100_65plus)} hrs`;
}

function sceneCopy(summary) {
  const older = summary.older_carers;
  const topStack = older.highest_older_ward_stack[0];
  return {
    week: {
      label: "Older carers by named area",
      title: `${formatThousands(older.total_older_carers)} people aged 65+ provide unpaid care.`,
      text:
        "The map shows the minimum weekly care-hours provided by older people, standardised per 100 residents aged 65 and over.  Green is lower; amber and red mark the peaks.",
      metrics: [
        {
          value: formatThousands(older.total_older_minimum_weekly_care_hours),
          label: "minimum care-hours provided by people aged 65+ each week",
        },
        {
          value: `${formatOne.format(older.older_carer_pct)}%`,
          label: "of residents aged 65+ provide unpaid care",
        },
        {
          value: `${formatOne.format(older.older_minimum_hours_per_100_65plus)}`,
          label: "minimum care-hours per 100 residents aged 65+",
        },
      ],
      ranks: older.highest_older_ward_hours,
      rankLabel: "Highest older-carer burden",
      valueKey: "older_minimum_hours_per_100_65plus",
      valueSuffix: " hrs per 100",
    },
    deprivation: {
      label: "Deprivation underneath",
      title: "Older care and deprivation intersect.",
      text:
        "The colour now follows deprivation, with the most deprived areas pushed toward red.  Use the readout and rankings to keep older care in view.",
      metrics: [
        {
          value: `D${formatOne.format(older.high_fifth.decile_mean)}`,
          label: "average deprivation decile in the highest older-care fifth",
        },
        {
          value: `D${formatOne.format(older.low_fifth.decile_mean)}`,
          label: "average deprivation decile in the lowest older-care fifth",
        },
        {
          value: `${formatOne.format(older.high_fifth.hours - older.low_fifth.hours)}`,
          label: "extra minimum hours per 100 residents aged 65+",
        },
      ],
      ranks: older.highest_older_ward_hours,
      rankLabel: "Care burden remains the anchor",
      valueKey: "older_minimum_hours_per_100_65plus",
      valueSuffix: " hrs per 100",
    },
    heavy: {
      label: "Full-time-plus care",
      title: `${formatThousands(older.total_older_heavy_carers)} older carers report 50+ hours a week.`,
      text:
        "This is care at a level that can swallow sleep, money, health and ordinary time.  The map now emphasises full-time-plus care among people aged 65 and over.",
      metrics: [
        {
          value: `${formatOne.format(older.older_heavy_care_pct)}%`,
          label: "of residents aged 65+ report 50+ hours unpaid care",
        },
        {
          value: `${formatOne.format(older.high_fifth.heavy_pct)}%`,
          label: "average in the highest older-care fifth",
        },
        {
          value: `${formatOne.format(older.low_fifth.heavy_pct)}%`,
          label: "average in the lowest older-care fifth",
        },
      ],
      ranks: older.highest_older_ward_heavy_care,
      rankLabel: "Highest full-time-plus older-care share",
      valueKey: "older_heavy_care_pct",
      valueSuffix: "%",
    },
    stack: {
      label: "Intersectionality",
      title: `${topStack.ward}, ${displayLad(topStack.lad)}: older care intersects with deprivation, poor health and disability.`,
      text:
        "This view highlights wards where older unpaid care-hours, full-time-plus care, deprivation, bad or very bad health, and disability limited a lot intersect.",
      metrics: [
        {
          value: `${formatOne.format(topStack.older_minimum_hours_per_100_65plus)}`,
          label: `minimum hours per 100 residents aged 65+ in ${topStack.ward}`,
        },
        {
          value: `${formatOne.format(topStack.older_heavy_care_pct)}%`,
          label: "full-time-plus older care in the highest stacked ward",
        },
        {
          value: `D${formatOne.format(topStack.imd_decile_mean)}`,
          label: "average deprivation decile for the highest stacked ward",
        },
      ],
      ranks: older.highest_older_ward_stack,
      rankLabel: "Strongest intersectional older-care signal",
      valueKey: "older_minimum_hours_per_100_65plus",
      valueSuffix: " hrs per 100",
    },
  };
}

function metricFromFeature(properties) {
  const config = sceneConfig[state.scene];
  return Number(properties[config.metric]);
}

function getExtent(rows, key) {
  const values = rows
    .map((row) => Number(row[key]))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  const quantile = (index) => values[Math.round((values.length - 1) * index)];
  const stops = [values[0], quantile(0.18), quantile(0.38), quantile(0.62), quantile(0.82), values[values.length - 1]];

  return stops.map((value, index) => {
    if (index === 0) return value;
    return value <= stops[index - 1] ? stops[index - 1] + 0.0001 : value;
  });
}

function buildDistributions(geo) {
  const rows = geo.features.map((feature) => feature.properties);
  return {
    older_minimum_hours_per_100_65plus: getExtent(rows, "older_minimum_hours_per_100_65plus"),
    older_heavy_care_pct: getExtent(rows, "older_heavy_care_pct"),
    older_stack_score: getExtent(rows, "older_stack_score"),
  };
}

function colourExpression() {
  if (state.scene === "deprivation") {
    return [
      "interpolate",
      ["linear"],
      ["get", "imd_decile"],
      1,
      "#b91c1c",
      2,
      "#ef4444",
      4,
      "#fb923c",
      6,
      "#facc15",
      8,
      "#99f6e4",
      10,
      "#0f766e",
    ];
  }

  const stops = state.distributions[sceneConfig[state.scene].metric];
  const expression = ["interpolate", ["linear"], ["get", sceneConfig[state.scene].metric]];
  stops.forEach((stop, index) => expression.push(stop, greenRedRamp[index]));
  return expression;
}

function extrusionHeightExpression() {
  if (state.flatMode) return 0;
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    8,
    ["*", ["coalesce", ["get", "height"], 0], 0.7],
    10,
    ["*", ["coalesce", ["get", "height"], 0], 1],
    12.6,
    ["*", ["coalesce", ["get", "height"], 0], 1.12],
  ];
}

function reliefSelectionHeightExpression(offset) {
  if (state.flatMode) return 0;
  return ["+", ["coalesce", ["get", "height"], 0], offset];
}

function highFilterExpression() {
  const high = ["==", ["get", sceneConfig[state.scene].highFlag], true];
  const focus = focusFilterExpression();
  return focus ? ["any", high, focus] : high;
}

function focusFilterExpression() {
  if (state.focus === "all") return null;
  const config = focusConfig[state.focus];
  if (!config) return null;

  if (config.ward) {
    return ["all", ["==", ["get", "ward"], config.ward], ["==", ["get", "lad"], config.lad]];
  }

  if (config.wards) {
    return ["in", ["get", "ward"], ["literal", Array.from(config.wards)]];
  }

  return null;
}

function legendColours() {
  if (state.scene === "deprivation") {
    return ["#b91c1c", "#ef4444", "#fb923c", "#facc15", "#99f6e4", "#0f766e"];
  }
  return greenRedRamp;
}

function interpolateNumber(domain, range, value) {
  const safeValue = Number(value);
  if (!Number.isFinite(safeValue)) return range[0];
  if (safeValue <= domain[0]) return range[0];
  for (let index = 1; index < domain.length; index += 1) {
    if (safeValue <= domain[index]) {
      const left = domain[index - 1];
      const right = domain[index];
      const span = right - left || 1e-12;
      const amount = Math.max(0, Math.min(1, (safeValue - left) / span));
      return range[index - 1] + (range[index] - range[index - 1]) * amount;
    }
  }
  return range[range.length - 1];
}

function runtimeHeight(properties) {
  if (state.flatMode) return 0;
  const metric = sceneConfig[state.scene].heightMetric;
  return interpolateNumber(state.distributions[metric], heightStops, properties[metric]);
}

function runtimeFill(properties) {
  if (state.scene === "deprivation") {
    return interpolateColour(["#b91c1c", "#ef4444", "#fb923c", "#facc15", "#99f6e4", "#0f766e"], (Number(properties.imd_decile) - 1) / 9);
  }
  const metric = sceneConfig[state.scene].metric;
  return interpolateColour(greenRedRamp, normaliseMetric(properties[metric], metric));
}

function updateRuntimeFeatures() {
  if (!state.geo) return;
  state.geo.features.forEach((feature) => {
    const properties = feature.properties;
    const metric = metricFromFeature(properties);
    properties.fill = runtimeFill(properties);
    properties.height = Number(runtimeHeight(properties).toFixed(2));
    properties.renderValue = Number.isFinite(metric) ? Number(metric.toFixed(6)) : null;
    properties.rateValue = Number.isFinite(properties.older_minimum_hours_per_100_65plus)
      ? Number(properties.older_minimum_hours_per_100_65plus.toFixed(6))
      : null;
  });
}

function sourceFeatures(features) {
  return { type: "FeatureCollection", features };
}

function focusedFeatureCollection() {
  if (state.focus === "all") return emptyCollection;
  return sourceFeatures(featuresForFocus(state.focus));
}

function updateLegend() {
  if (!legend) return;
  const config = sceneConfig[state.scene];
  legend.innerHTML = `
    <p class="legend-title">${config.legendTitle}</p>
    <div class="legend-scale" aria-hidden="true">
      ${legendColours()
        .map((colour) => `<span class="legend-swatch" style="background:${colour}"></span>`)
        .join("")}
    </div>
    <div class="legend-labels">
      <span>${config.legendLow}</span>
      <span>${config.legendHigh}</span>
    </div>
    <p class="legend-note">${config.legendNote}</p>
  `;
}

function rowForReadout() {
  if (!state.summary) return null;
  const copy = sceneCopy(state.summary)[state.scene];
  const focused = focusedWards();
  return focused[0] || copy.ranks[0] || null;
}

function updateReadout(row, label = "Highest named area") {
  if (!mapReadoutName || !state.summary) return;
  const data = row || rowForReadout();
  if (!data) return;
  mapReadoutLabel.textContent = label;
  mapReadoutName.textContent = data.ward ? `${data.ward}, ${displayLad(data.lad)}` : "Tyne and Wear";
  mapReadoutRegion.textContent = data.ward ? "Ward-level summary" : "Ward-level view";
  mapReadoutRate.textContent = `${formatOne.format(data.older_minimum_hours_per_100_65plus)} hrs/100`;
  mapReadoutCarers.textContent = formatThousands(data.older_carers);
  mapReadoutHealth.textContent = `${formatOne.format(data.bad_very_bad_health_pct)}% bad or very bad`;
  mapReadoutDeprivation.textContent = `D${formatOne.format(data.imd_decile_mean ?? data.imd_decile)}`;
}

function updatePanel() {
  const copy = sceneCopy(state.summary)[state.scene];
  sceneLabel.textContent = copy.label;
  sceneTitle.textContent = copy.title;
  sceneText.textContent = copy.text;
  sceneMetrics.innerHTML = copy.metrics
    .map(
      (metric) => `
        <div class="metric">
          <b>${metric.value}</b>
          <span>${metric.label}</span>
        </div>
      `,
    )
    .join("");
  rankPanel.innerHTML = `
    <h4>${copy.rankLabel}</h4>
    <ol>
      ${copy.ranks
        .slice(0, 8)
        .map((row) => {
          const value = formatOne.format(row[copy.valueKey]);
          return `
            <li>
              <span>${row.ward}, ${displayLad(row.lad)}</span>
              <strong>${value}${copy.valueSuffix}</strong>
            </li>
          `;
        })
        .join("")}
    </ol>
  `;
  if (mapOverlayList) {
    mapOverlayList.innerHTML = `
      <h4>${copy.rankLabel}</h4>
      <ol>
        ${copy.ranks
          .slice(0, 5)
          .map((row) => {
            const value = formatOne.format(row[copy.valueKey]);
            const suffix = copy.valueKey === "older_heavy_care_pct" ? "%" : " hrs/100";
            return `
              <li>
                <span>${row.ward}</span>
                <strong>${value}${suffix}</strong>
              </li>
            `;
          })
          .join("")}
      </ol>
    `;
  }
  updateLegend();
  updateReadout(null);
  if (heightNote) {
    const config = sceneConfig[state.scene];
    heightNote.innerHTML = `<strong>${config.heightTitle}</strong>${config.heightBody}`;
  }
  if (sceneSelect) sceneSelect.value = state.scene;
  if (placeSelect) placeSelect.value = state.focus;
}

function updateTabs() {
  sceneTabs.forEach((button) => {
    const active = button.dataset.scene === state.scene;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  if (sceneSelect) sceneSelect.value = state.scene;
}

function updateFocusButtons() {
  focusButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.focus === state.focus);
  });
  if (placeSelect) placeSelect.value = state.focus;
}

function focusedWards() {
  if (state.focus === "all") return [];
  const config = focusConfig[state.focus];
  if (!config) return [];

  if (config.ward) {
    return state.wards.filter((ward) => ward.ward === config.ward && ward.lad === config.lad);
  }

  if (config.wards) return state.wards.filter((ward) => config.wards.has(ward.ward));
  return [];
}

function featuresForFocus(focus) {
  if (focus === "all") return state.geo.features;
  const config = focusConfig[focus];
  if (!config) return state.geo.features;

  if (config.ward) {
    return state.geo.features.filter(
      (feature) => feature.properties.ward === config.ward && feature.properties.lad === config.lad,
    );
  }

  if (config.wards) {
    return state.geo.features.filter((feature) => config.wards.has(feature.properties.ward));
  }

  return state.geo.features;
}

function topWardsForScene() {
  const copy = sceneCopy(state.summary)[state.scene];
  const focused = focusedWards();
  const rows = focused.length ? focused : copy.ranks;
  return rows.slice(0, state.focus === "all" ? 8 : 12);
}

function labelFeatureCollection() {
  return {
    type: "FeatureCollection",
    features: topWardsForScene().map((ward) => ({
      type: "Feature",
      properties: {
        code: ward.ward_code,
        ward: ward.ward,
        lad: displayLad(ward.lad),
        label: `${ward.ward}\n${valueLabel(ward)}`,
      },
      geometry: {
        type: "Point",
        coordinates: [ward.lon, ward.lat],
      },
    })),
  };
}

function scanCoordinates(coordinates, bounds) {
  if (typeof coordinates[0] === "number") {
    const [lon, lat] = coordinates;
    bounds.minLon = Math.min(bounds.minLon, lon);
    bounds.minLat = Math.min(bounds.minLat, lat);
    bounds.maxLon = Math.max(bounds.maxLon, lon);
    bounds.maxLat = Math.max(bounds.maxLat, lat);
    return;
  }
  coordinates.forEach((item) => scanCoordinates(item, bounds));
}

function boundsForFeatures(features) {
  const bounds = {
    minLon: Infinity,
    minLat: Infinity,
    maxLon: -Infinity,
    maxLat: -Infinity,
  };

  features.forEach((feature) => scanCoordinates(feature.geometry.coordinates, bounds));

  if (!Number.isFinite(bounds.minLon)) return null;
  return [
    [bounds.minLon, bounds.minLat],
    [bounds.maxLon, bounds.maxLat],
  ];
}

function fitToFocus(focus, duration = 1000) {
  if (!state.loaded) return;
  const features = featuresForFocus(focus);
  const bounds = boundsForFeatures(features);
  if (!bounds) return;

  const all = focus === "all";
  const padding = all
    ? { top: 118, right: 62, bottom: 150, left: 62 }
    : { top: 132, right: 146, bottom: 152, left: 146 };

  state.map.fitBounds(bounds, {
    padding,
    duration,
    maxZoom: all ? 9.55 : 12.75,
    pitch: state.flatMode ? 0 : all ? 62 : 66,
    bearing: 0,
  });
}

function tooltipHtml(properties) {
  const metric = metricFromFeature(properties);
  const metricLabel =
    state.scene === "heavy"
      ? `${formatOne.format(metric)}% of residents aged 65+ report 50+ hours/week`
      : state.scene === "deprivation"
        ? `D${formatOne.format(properties.imd_decile)} deprivation decile`
        : `${formatOne.format(metric)} metric value`;

  return `
    <strong>${properties.ward}, ${displayLad(properties.lad)}</strong>
    <span><b>${formatOne.format(properties.older_minimum_hours_per_100_65plus)}</b> minimum older-care hours per 100 residents aged 65+</span>
    <span>${formatNumber.format(properties.older_carers)} carers aged 65+</span>
    <span>${formatNumber.format(properties.older_minimum_weekly_care_hours)} minimum older-care hours/week</span>
    <span>${metricLabel}</span>
    <span>D${formatOne.format(properties.imd_decile)} · ${formatOne.format(properties.bad_very_bad_health_pct)}% bad or very bad health</span>
  `;
}

function updateMapStyle() {
  if (!state.loaded) return;

  updateRuntimeFeatures();
  const areaSource = state.map.getSource("care-areas");
  if (areaSource) areaSource.setData(state.geo);
  state.map.setPaintProperty("care-extrusions", "fill-extrusion-height", extrusionHeightExpression());
  state.map.setPaintProperty("care-highlight-fill", "fill-extrusion-height", extrusionHeightExpression());
  state.map.setPaintProperty("hover-outline", "fill-extrusion-height", reliefSelectionHeightExpression(420));
  state.map.setPaintProperty("selection-outline", "fill-extrusion-height", reliefSelectionHeightExpression(720));
  state.map.setPaintProperty("hover-flat-fill", "fill-opacity", state.flatMode ? 0.22 : 0);
  state.map.setPaintProperty("selection-flat-fill", "fill-opacity", state.flatMode ? 0.2 : 0);
  state.map.setPaintProperty("selection-flat-line", "line-opacity", state.flatMode ? 0.86 : 0);
  state.map.setFilter("care-highlight-lines", highFilterExpression());
  state.map.setFilter("care-highlight-fill", highFilterExpression());
  const selectionSource = state.map.getSource("selection-feature");
  if (selectionSource) selectionSource.setData(focusedFeatureCollection());

  const labelSource = state.map.getSource("ward-labels");
  if (labelSource) labelSource.setData(labelFeatureCollection());
}

function interpolateColour(colours, value) {
  const t = Math.max(0, Math.min(1, value));
  const scaled = t * (colours.length - 1);
  const left = Math.floor(scaled);
  const right = Math.min(colours.length - 1, left + 1);
  const amount = scaled - left;
  const parse = (hex) => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  });
  const a = parse(colours[left]);
  const b = parse(colours[right]);
  return `rgb(${Math.round(a.r + (b.r - a.r) * amount)}, ${Math.round(a.g + (b.g - a.g) * amount)}, ${Math.round(a.b + (b.b - a.b) * amount)})`;
}

function normaliseMetric(value, key) {
  const stops = state.distributions[key];
  const min = stops[0];
  const max = stops[stops.length - 1];
  if (max <= min) return 0;
  return Math.max(0, Math.min(1, (Number(value) - min) / (max - min)));
}

function fallbackColour(properties) {
  if (state.scene === "deprivation") {
    return interpolateColour(["#b91c1c", "#ef4444", "#fb923c", "#facc15", "#99f6e4", "#0f766e"], (Number(properties.imd_decile) - 1) / 9);
  }
  const key = sceneConfig[state.scene].metric;
  return interpolateColour(greenRedRamp, normaliseMetric(properties[key], key));
}

function pathForRing(ring, project) {
  return ring
    .map((coordinate, index) => {
      const [x, y] = project(coordinate);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ")
    .concat(" Z");
}

function pathForGeometry(geometry, project) {
  if (geometry.type === "Polygon") {
    return geometry.coordinates.map((ring) => pathForRing(ring, project)).join(" ");
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates
      .flatMap((polygon) => polygon.map((ring) => pathForRing(ring, project)))
      .join(" ");
  }
  return "";
}

function renderFallbackMap(reason = "") {
  state.fallback = true;
  state.loaded = false;
  const width = 1000;
  const height = 640;
  const pad = 34;
  const bounds = boundsForFeatures(state.geo.features);
  if (!bounds) return;

  const [[minLon, minLat], [maxLon, maxLat]] = bounds;
  const project = ([lon, lat]) => {
    const x = pad + ((lon - minLon) / (maxLon - minLon)) * (width - pad * 2);
    const y = pad + (1 - (lat - minLat) / (maxLat - minLat)) * (height - pad * 2);
    return [x, y];
  };

  const metric = sceneConfig[state.scene].heightMetric;
  const highRows = new Set(topWardsForScene().map((ward) => `${ward.ward}|||${ward.lad}`));
  const focusRows = new Set(focusedWards().map((ward) => `${ward.ward}|||${ward.lad}`));

  const paths = state.geo.features
    .map((feature) => {
      const properties = feature.properties;
      const d = pathForGeometry(feature.geometry, project);
      const key = `${properties.ward}|||${properties.lad}`;
      const highlighted = highRows.has(key) || focusRows.has(key);
      const opacity = state.focus === "all" || focusRows.size === 0 || focusRows.has(key) ? 0.9 : 0.28;
      const stroke = highlighted ? "#07111f" : "rgba(15, 23, 42, 0.28)";
      return `
        <path class="fallback-top" d="${d}" fill="${fallbackColour(properties)}" opacity="${opacity}" stroke="${stroke}" stroke-width="${highlighted ? 1.2 : 0.42}" />
      `;
    })
    .join("");

  const labels = topWardsForScene()
    .slice(0, state.focus === "all" ? 6 : 10)
    .map((ward) => {
      const [x, y] = project([ward.lon, ward.lat]);
      return `
        <g class="fallback-label" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
          <circle r="4.5"></circle>
          <text x="8" y="-7">${ward.ward}</text>
          <text x="8" y="9">${valueLabel(ward)}</text>
        </g>
      `;
    })
    .join("");

  const note = reason
    ? `<p class="fallback-note">A lightweight map is shown because the full interactive map is not available in this browser.</p>`
    : "";

  mapContainer.innerHTML = `
    <div class="fallback-map" role="img" aria-label="Fallback map of older unpaid care across Tyne and Wear">
      <svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
        <rect width="${width}" height="${height}" fill="#dff2f6"></rect>
        <path d="M0 52 C160 28 280 64 410 42 C560 16 690 46 815 28 C908 15 944 38 1000 20 L1000 640 L0 640 Z" fill="#f5fbf8"></path>
        <g opacity="0.42" fill="none" stroke="#8fb3bc" stroke-width="2">
          <path d="M84 486 C228 410 356 424 516 352 C660 286 760 302 902 238"></path>
          <path d="M182 138 C310 168 472 124 616 154 C734 178 832 142 954 96"></path>
        </g>
        <g>${paths}</g>
        <g>${labels}</g>
      </svg>
      ${note}
    </div>
  `;
}

function mapStyle() {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      carto: {
        type: "raster",
        tileSize: 256,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        tiles: [
          "https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
          "https://c.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
          "https://d.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
        ],
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: {
          "background-color": "#eaf7fa",
        },
      },
      {
        id: "carto-base",
        type: "raster",
        source: "carto",
        paint: {
          "raster-opacity": 0.56,
          "raster-saturation": -0.55,
          "raster-contrast": -0.16,
        },
      },
    ],
  };
}

function initializeMap() {
  if (!window.maplibregl) {
    renderFallbackMap("maplibre-unavailable");
    return;
  }

  mapContainer.innerHTML = "";
  state.fallback = false;
  updateRuntimeFeatures();

  try {
    state.map = new maplibregl.Map({
      container: "care-map",
      style: mapStyle(),
      center: [-1.49, 54.98],
      zoom: 9.2,
      pitch: state.flatMode ? 0 : 62,
      bearing: 0,
      minZoom: 8,
      maxZoom: 13,
      dragRotate: false,
      pitchWithRotate: false,
      antialias: true,
      attributionControl: true,
    });
  } catch (error) {
    renderFallbackMap(error.message);
    return;
  }

  state.map.addControl(
    new maplibregl.NavigationControl({
      visualizePitch: true,
      showZoom: true,
      showCompass: false,
    }),
    "bottom-right",
  );

  state.popup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    className: "care-popup",
    offset: 16,
  });

  state.map.on("load", () => {
    state.loaded = true;

    state.map.addSource("care-areas", {
      type: "geojson",
      data: state.geo,
    });
    state.map.addSource("hover-feature", { type: "geojson", data: emptyCollection });
    state.map.addSource("selection-feature", { type: "geojson", data: emptyCollection });

    state.map.addLayer({
      id: "care-footprint",
      type: "fill",
      source: "care-areas",
      paint: {
        "fill-color": ["get", "fill"],
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          0.38,
          9.5,
          0.54,
          12.4,
          0.74,
        ],
      },
    });

    state.map.addLayer({
      id: "care-highlight-fill",
      type: "fill-extrusion",
      source: "care-areas",
      filter: highFilterExpression(),
      paint: {
        "fill-extrusion-color": "#fff9e6",
        "fill-extrusion-height": extrusionHeightExpression(),
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.24,
        "fill-extrusion-vertical-gradient": true,
      },
    });

    state.map.addLayer({
      id: "care-extrusions",
      type: "fill-extrusion",
      source: "care-areas",
      paint: {
        "fill-extrusion-color": ["get", "fill"],
        "fill-extrusion-height": extrusionHeightExpression(),
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          0.72,
          10,
          0.9,
          12.6,
          0.98,
        ],
        "fill-extrusion-vertical-gradient": true,
      },
    });

    state.map.addLayer({
      id: "care-area-lines",
      type: "line",
      source: "care-areas",
      paint: {
        "line-color": "rgba(16, 56, 76, 0.22)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.32, 12, 0.9],
      },
    });

    state.map.addLayer({
      id: "care-highlight-lines",
      type: "line",
      source: "care-areas",
      filter: highFilterExpression(),
      paint: {
        "line-color": "#10384c",
        "line-opacity": 0.76,
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.1, 12, 2.4],
      },
    });

    state.map.addLayer({
      id: "hover-flat-fill",
      type: "fill",
      source: "hover-feature",
      paint: {
        "fill-color": "#ffffff",
        "fill-opacity": state.flatMode ? 0.22 : 0,
      },
    });

    state.map.addLayer({
      id: "selection-flat-fill",
      type: "fill",
      source: "selection-feature",
      paint: {
        "fill-color": "#ffffff",
        "fill-opacity": state.flatMode ? 0.2 : 0,
      },
    });

    state.map.addLayer({
      id: "selection-flat-line",
      type: "line",
      source: "selection-feature",
      paint: {
        "line-color": "#07111f",
        "line-opacity": state.flatMode ? 0.86 : 0,
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.3, 12, 3],
      },
    });

    state.map.addLayer({
      id: "hover-outline",
      type: "fill-extrusion",
      source: "hover-feature",
      paint: {
        "fill-extrusion-color": "#f8feff",
        "fill-extrusion-height": reliefSelectionHeightExpression(420),
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.24,
        "fill-extrusion-vertical-gradient": false,
      },
    });

    state.map.addLayer({
      id: "selection-outline",
      type: "fill-extrusion",
      source: "selection-feature",
      paint: {
        "fill-extrusion-color": "#ffffff",
        "fill-extrusion-height": reliefSelectionHeightExpression(720),
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.28,
        "fill-extrusion-vertical-gradient": false,
      },
    });

    state.map.addSource("ward-labels", {
      type: "geojson",
      data: labelFeatureCollection(),
    });

    state.map.addLayer({
      id: "ward-labels",
      type: "symbol",
      source: "ward-labels",
      layout: {
        "text-field": ["get", "label"],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 8, 10, 12, 14],
        "text-line-height": 1.1,
        "text-allow-overlap": false,
        "text-ignore-placement": false,
        "text-variable-anchor": ["top", "bottom", "left", "right"],
        "text-radial-offset": 0.7,
      },
      paint: {
        "text-color": "#102334",
        "text-halo-color": "rgba(250, 254, 255, 0.94)",
        "text-halo-width": 2.2,
      },
    });

    state.map.on("mousemove", "care-footprint", (event) => {
      const feature = event.features && event.features[0];
      if (!feature) return;
      state.map.getCanvas().style.cursor = "pointer";
      const hoverSource = state.map.getSource("hover-feature");
      if (hoverSource) hoverSource.setData(sourceFeatures([feature]));
      updateReadout(feature.properties, "Map hover");
      state.popup.setLngLat(event.lngLat).setHTML(tooltipHtml(feature.properties)).addTo(state.map);
    });

    state.map.on("mouseleave", "care-footprint", () => {
      state.map.getCanvas().style.cursor = "";
      const hoverSource = state.map.getSource("hover-feature");
      if (hoverSource) hoverSource.setData(emptyCollection);
      state.popup.remove();
    });

    state.map.on("click", "care-footprint", (event) => {
      const feature = event.features && event.features[0];
      if (!feature) return;
      const selectionSource = state.map.getSource("selection-feature");
      if (selectionSource) selectionSource.setData(sourceFeatures([feature]));
      updateReadout(feature.properties, "Selected ward");
      const focusKey = Object.entries(focusConfig).find(([, config]) => {
        if (!config.ward) return false;
        return config.ward === feature.properties.ward && config.lad === feature.properties.lad;
      });

      if (focusKey) {
        setFocus(focusKey[0]);
      } else {
        const features = state.geo.features.filter(
          (row) => row.properties.ward === feature.properties.ward && row.properties.lad === feature.properties.lad,
        );
        const bounds = boundsForFeatures(features);
        if (bounds) {
          state.map.fitBounds(bounds, {
            padding: { top: 112, right: 122, bottom: 128, left: 122 },
            duration: 900,
            maxZoom: 12.8,
            pitch: state.flatMode ? 0 : 66,
            bearing: 0,
          });
        }
      }
    });

    updateMapStyle();
    fitToFocus(state.focus, 0);
  });
}

function setScene(scene) {
  state.scene = scene;
  updateTabs();
  updatePanel();
  if (state.fallback) renderFallbackMap();
  else updateMapStyle();
}

function setFocus(focus) {
  state.focus = focus;
  updateFocusButtons();
  updateReadout(null, focus === "all" ? "Highest named area" : "Selected area");
  if (state.fallback) {
    renderFallbackMap();
  } else {
    updateMapStyle();
    fitToFocus(focus);
  }
}

function stopStoryTour() {
  if (state.storyTimer) window.clearInterval(state.storyTimer);
  state.storyTimer = null;
  state.storyIndex = 0;
  if (storyToggle) storyToggle.textContent = "Tell the story";
  if (storyProgress) storyProgress.textContent = "Use the controls or hover the map to take over.";
}

function advanceStoryTour() {
  if (state.storyIndex >= storySteps.length) {
    stopStoryTour();
    return;
  }
  const step = storySteps[state.storyIndex];
  state.storyIndex += 1;
  setScene(step.scene);
  setFocus(step.focus);
  if (storyToggle) {
    storyToggle.textContent = state.storyIndex >= storySteps.length ? "Finish story" : "Pause story";
  }
  if (storyProgress) {
    storyProgress.textContent = `Step ${state.storyIndex} of ${storySteps.length}.`;
  }
}

function startStoryTour() {
  if (state.storyTimer) {
    stopStoryTour();
    return;
  }
  state.storyIndex = 0;
  advanceStoryTour();
  state.storyTimer = window.setInterval(advanceStoryTour, 6200);
}

sceneTabs.forEach((button) => {
  button.addEventListener("click", () => {
    stopStoryTour();
    setScene(button.dataset.scene);
  });
});

focusButtons.forEach((button) => {
  button.addEventListener("click", () => {
    stopStoryTour();
    setFocus(button.dataset.focus);
  });
});

zoomButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!state.loaded) return;
    if (button.dataset.zoom === "reset") {
      setFocus("all");
      return;
    }
    const delta = button.dataset.zoom === "in" ? 0.78 : -0.78;
    state.map.easeTo({
      zoom: state.map.getZoom() + delta,
      duration: 340,
    });
  });
});

if (sceneSelect) {
  sceneSelect.addEventListener("change", () => {
    stopStoryTour();
    setScene(sceneSelect.value);
  });
}

if (placeSelect) {
  placeSelect.addEventListener("change", () => {
    stopStoryTour();
    setFocus(placeSelect.value);
  });
}

if (resetView) {
  resetView.addEventListener("click", () => {
    stopStoryTour();
    setScene("week");
    setFocus("all");
  });
}

if (fullscreenMap) {
  fullscreenMap.addEventListener("click", () => {
    const panel = fullscreenMap.closest(".map-panel");
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (panel?.requestFullscreen) {
      panel.requestFullscreen();
    }
  });
}


if (storyToggle) {
  storyToggle.addEventListener("click", startStoryTour);
}

function fetchJson(path) {
  return fetch(`${path}?v=${dataVersion}`).then((response) => {
    if (!response.ok) throw new Error(`Could not load ${path}`);
    return response.json();
  });
}

function validateData(geo, wards, summary) {
  const older = summary?.older_carers;
  if (!older?.highest_older_ward_hours?.length) {
    throw new Error("The older-carer summary is missing. Please refresh the page.");
  }
  const badWard = wards.find(
    (ward) =>
      !Number.isFinite(ward.older_minimum_hours_per_100_65plus) ||
      !Number.isFinite(ward.older_carers) ||
      !Number.isFinite(ward.lat) ||
      !Number.isFinite(ward.lon),
  );
  if (badWard) throw new Error(`The ward data for ${badWard.ward} is incomplete. Please refresh the page.`);
  const badFeature = geo.features.find(
    (feature) => !Number.isFinite(feature.properties.older_minimum_hours_per_100_65plus),
  );
  if (badFeature) throw new Error("The small-area older-carer data is incomplete. Please refresh the page.");
}

Promise.all([
  fetchJson("data/processed/hidden_week_map.geojson"),
  fetchJson("data/processed/hidden_week_ward_data.json"),
  fetchJson("data/processed/summary.json"),
])
  .then(([geo, wards, summary]) => {
    validateData(geo, wards, summary);
    state.geo = geo;
    state.wards = wards;
    state.summary = summary;
    state.distributions = buildDistributions(geo);
    tooltip.hidden = true;
    updatePanel();
    updateFocusButtons();
    try {
      initializeMap();
    } catch (error) {
      renderFallbackMap(error.message);
    }
  })
  .catch((error) => {
    sceneTitle.textContent = "The map data could not be loaded.";
    sceneText.textContent = error.message;
  });

window.addEventListener("resize", () => {
  if (state.loaded) state.map.resize();
});
