const svg = d3.select("#care-map");
const tooltip = document.querySelector("#map-tooltip");
const sceneLabel = document.querySelector("#scene-label");
const sceneTitle = document.querySelector("#scene-title");
const sceneText = document.querySelector("#scene-text");
const sceneMetrics = document.querySelector("#scene-metrics");
const rankPanel = document.querySelector("#rank-panel");
const mapOverlayList = document.querySelector("#map-overlay-list");
const sceneTabs = Array.from(document.querySelectorAll(".scene-tab"));
const focusButtons = Array.from(document.querySelectorAll("[data-focus]"));
const zoomButtons = Array.from(document.querySelectorAll("[data-zoom]"));

const formatNumber = new Intl.NumberFormat("en-GB");
const formatOne = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const deprivationColours = {
  1: "#8f1d22",
  2: "#b93a2b",
  3: "#d86e2e",
  4: "#e39d32",
  5: "#c9b94f",
  6: "#90b567",
  7: "#4fa276",
  8: "#2d8f93",
  9: "#2c6f95",
  10: "#3d536f",
};

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

const state = {
  geo: null,
  wards: null,
  summary: null,
  scene: "week",
  focus: "all",
  projection: null,
  path: null,
  width: 0,
  height: 0,
  transform: d3.zoomIdentity,
};

const viewportLayer = svg.append("g").attr("class", "map-viewport");
const shadowLayer = viewportLayer.append("g").attr("class", "shadow-layer");
const mapLayer = viewportLayer.append("g").attr("class", "map-layer");
const outlineLayer = viewportLayer.append("g").attr("class", "outline-layer");
const columnLayer = viewportLayer.append("g").attr("class", "column-layer");
const labelLayer = viewportLayer.append("g").attr("class", "label-layer");

let zoomBehaviour = null;

function displayLad(lad) {
  return lad.replace("Newcastle upon Tyne", "Newcastle");
}

function wardName(ward) {
  return `${ward.ward}, ${displayLad(ward.lad)}`;
}

function olderSummary() {
  return state.summary.older_carers;
}

function formatThousands(value) {
  return formatNumber.format(Math.round(value));
}

function sceneMetric(ward) {
  if (state.scene === "heavy") return ward.older_heavy_care_pct;
  if (state.scene === "deprivation") return 11 - ward.imd_decile_mean;
  if (state.scene === "stack") return ward.older_stack_score;
  return ward.older_minimum_hours_per_100_65plus;
}

function sceneUnit() {
  if (state.scene === "heavy") return "% of residents aged 65+ reporting 50+ hours";
  if (state.scene === "deprivation") return "IMD deprivation pressure";
  if (state.scene === "stack") return "older-care pressure score";
  return "minimum hours per 100 residents aged 65+";
}

function valueLabel(ward) {
  if (state.scene === "heavy") return `${formatOne.format(ward.older_heavy_care_pct)}%`;
  if (state.scene === "deprivation") return `D${formatOne.format(ward.imd_decile_mean)}`;
  if (state.scene === "stack") return `${formatOne.format(ward.older_minimum_hours_per_100_65plus)} hrs`;
  return `${formatOne.format(ward.older_minimum_hours_per_100_65plus)} hrs`;
}

function sceneCopy(summary) {
  const older = summary.older_carers;
  const topWard = older.highest_older_ward_hours[0];
  const topStack = older.highest_older_ward_stack[0];
  return {
    week: {
      label: "Older carers by named area",
      title: `${formatThousands(older.total_older_carers)} people aged 65+ provide unpaid care.`,
      text:
        "The raised map shows the minimum weekly care-hours provided by older people, standardised per 100 residents aged 65 and over.  Taller and brighter places carry more of that hidden week.",
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
      title: "The heaviest older-care weeks sit closer to deprivation.",
      text:
        "The map height still shows older people providing care.  The colour now follows deprivation.  D1 means the most deprived 10% of neighbourhoods in England.",
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
      label: "50+ hours a week",
      title: `${formatThousands(older.total_older_heavy_carers)} older carers report 50+ hours a week.`,
      text:
        "This is care at a level that can swallow sleep, money, health and ordinary time.  Height and columns now emphasise where 50+ hour care among people aged 65 and over is most visible.",
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
      rankLabel: "Highest 50+ hour older-care share",
      valueKey: "older_heavy_care_pct",
      valueSuffix: "%",
    },
    stack: {
      label: "Where pressures stack",
      title: `${topStack.ward}, ${displayLad(topStack.lad)}: older care, deprivation, poor health and disability stack together.`,
      text:
        "This view highlights wards that sit high across older unpaid care-hours, 50+ hour older care, deprivation, bad or very bad health, and disability limited a lot.",
      metrics: [
        {
          value: `${formatOne.format(topStack.older_minimum_hours_per_100_65plus)}`,
          label: `minimum hours per 100 residents aged 65+ in ${topStack.ward}`,
        },
        {
          value: `${formatOne.format(topStack.older_heavy_care_pct)}%`,
          label: "50+ hour older care in the highest stacked ward",
        },
        {
          value: `D${formatOne.format(topStack.imd_decile_mean)}`,
          label: "average deprivation decile for the highest stacked ward",
        },
      ],
      ranks: older.highest_older_ward_stack,
      rankLabel: "Highest stacked older-care pressure",
      valueKey: "older_minimum_hours_per_100_65plus",
      valueSuffix: " hrs per 100",
    },
  };
}

function fillSmallArea(properties, scales) {
  if (state.scene === "deprivation") {
    return deprivationColours[properties.imd_decile] || "#334155";
  }
  if (state.scene === "heavy") {
    return d3.interpolateRgb("#0f172a", "#bef264")(scales.smallOlderHeavy(properties.older_heavy_care_pct));
  }
  if (state.scene === "stack") {
    return d3.interpolateRgb("#0f172a", "#a3e635")(scales.smallOlderStack(properties.older_stack_score));
  }
  return d3.interpolateRgb("#0f172a", "#2dd4bf")(scales.smallOlderHours(properties.older_minimum_hours_per_100_65plus));
}

function fillWard(ward, scales) {
  if (state.scene === "deprivation") {
    return deprivationColours[Math.round(ward.imd_decile_mean)] || "#334155";
  }
  if (state.scene === "heavy") {
    return d3.interpolateRgb("#38bdf8", "#bef264")(scales.wardOlderHeavy(ward.older_heavy_care_pct));
  }
  if (state.scene === "stack") {
    return d3.interpolateRgb("#2dd4bf", "#a3e635")(scales.wardOlderStack(ward.older_stack_score));
  }
  return d3.interpolateRgb("#38bdf8", "#a3e635")(scales.wardOlderHours(ward.older_minimum_hours_per_100_65plus));
}

function makeScales() {
  const small = state.geo.features.map((feature) => feature.properties);
  const wards = state.wards;
  const clampScale = (values) => d3.scaleLinear().domain(d3.extent(values)).range([0, 1]).clamp(true);

  return {
    smallOlderHours: clampScale(small.map((d) => d.older_minimum_hours_per_100_65plus)),
    smallOlderHeavy: clampScale(small.map((d) => d.older_heavy_care_pct)),
    smallOlderStack: clampScale(small.map((d) => d.older_stack_score)),
    wardOlderHours: clampScale(wards.map((d) => d.older_minimum_hours_per_100_65plus)),
    wardOlderHeavy: clampScale(wards.map((d) => d.older_heavy_care_pct)),
    wardOlderStack: clampScale(wards.map((d) => d.older_stack_score)),
    columnOlderHours: d3
      .scaleSqrt()
      .domain(d3.extent(wards, (d) => d.older_minimum_hours_per_100_65plus))
      .range([10, state.width < 650 ? 44 : 82]),
    columnOlderHeavy: d3
      .scaleSqrt()
      .domain(d3.extent(wards, (d) => d.older_heavy_care_pct))
      .range([10, state.width < 650 ? 44 : 82]),
    columnOlderStack: d3
      .scaleSqrt()
      .domain(d3.extent(wards, (d) => d.older_stack_score))
      .range([10, state.width < 650 ? 44 : 82]),
  };
}

function smallAreaLift(properties, scales) {
  const maxLift = state.width < 650 ? 15 : 26;
  if (state.scene === "heavy") return 2 + scales.smallOlderHeavy(properties.older_heavy_care_pct) * maxLift;
  if (state.scene === "stack") return 2 + scales.smallOlderStack(properties.older_stack_score) * maxLift;
  return 2 + scales.smallOlderHours(properties.older_minimum_hours_per_100_65plus) * maxLift;
}

function columnHeight(ward, scales) {
  if (state.scene === "heavy") return scales.columnOlderHeavy(ward.older_heavy_care_pct);
  if (state.scene === "stack") return scales.columnOlderStack(ward.older_stack_score);
  return scales.columnOlderHours(ward.older_minimum_hours_per_100_65plus);
}

function wardPoint(ward) {
  return state.projection([ward.lon, ward.lat]);
}

function topWards() {
  const key =
    state.scene === "heavy"
      ? "older_heavy_care_pct"
      : state.scene === "stack"
        ? "older_stack_score"
        : "older_minimum_hours_per_100_65plus";
  const limit = state.width < 650 ? 5 : 8;
  const ranked = [...state.wards].sort((a, b) => b[key] - a[key]).slice(0, limit);
  const focused = focusedWards();
  for (const ward of focused) {
    if (!ranked.some((row) => row.ward_code === ward.ward_code)) ranked.push(ward);
  }
  return ranked;
}

function tooltipHtml(ward) {
  return `
    <strong>${wardName(ward)}</strong>
    <span>${formatOne.format(ward.older_minimum_hours_per_100_65plus)} minimum older-care hours per 100 residents aged 65+</span><br>
    <span>${formatNumber.format(ward.older_carers)} carers aged 65+</span><br>
    <span>${formatNumber.format(ward.older_minimum_weekly_care_hours)} minimum older-care hours/week</span><br>
    <span>${formatOne.format(ward.older_heavy_care_pct)}% of residents aged 65+ report 50+ hours/week</span><br>
    <span>D${formatOne.format(ward.imd_decile_mean)} · ${formatOne.format(ward.bad_very_bad_health_pct)}% bad or very bad health</span>
  `;
}

function showTooltip(event, ward) {
  if (!ward) return;
  tooltip.innerHTML = tooltipHtml(ward);
  tooltip.hidden = false;
  const left = Math.min(event.clientX + 16, window.innerWidth - tooltip.offsetWidth - 12);
  const top = Math.min(event.clientY + 16, window.innerHeight - tooltip.offsetHeight - 12);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideTooltip() {
  tooltip.hidden = true;
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

function updateTabs() {
  sceneTabs.forEach((button) => {
    const active = button.dataset.scene === state.scene;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

function updateFocusButtons() {
  focusButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.focus === state.focus);
  });
}

function wardForFeature(feature) {
  return state.wards.find(
    (ward) => ward.ward === feature.properties.ward && ward.lad === feature.properties.lad,
  );
}

function focusMatchesFeature(feature) {
  if (state.focus === "all") return false;
  const config = focusConfig[state.focus];
  if (!config) return false;
  if (config.ward) {
    return feature.properties.ward === config.ward && feature.properties.lad === config.lad;
  }
  if (config.wards) return config.wards.has(feature.properties.ward);
  return false;
}

function focusMatchesWard(ward) {
  if (state.focus === "all") return false;
  const config = focusConfig[state.focus];
  if (!config) return false;
  if (config.ward) return ward.ward === config.ward && ward.lad === config.lad;
  if (config.wards) return config.wards.has(ward.ward);
  return false;
}

function focusedWards() {
  if (state.focus === "all") return [];
  return state.wards.filter(focusMatchesWard);
}

function isHighFeature(feature) {
  if (focusMatchesFeature(feature)) return true;
  if (state.scene === "heavy") return feature.properties.high_older_heavy_care;
  if (state.scene === "stack") return feature.properties.high_older_stack;
  return feature.properties.high_older_burden;
}

function isHighWard(ward) {
  if (focusMatchesWard(ward)) return true;
  if (state.scene === "heavy") return ward.high_older_heavy_care;
  if (state.scene === "stack") return ward.high_older_stack;
  return ward.high_older_burden;
}

function updateSmallAreas(scales) {
  const shadows = shadowLayer
    .selectAll("path")
    .data(state.geo.features, (feature) => feature.properties.lsoa_code);

  shadows
    .join("path")
    .attr("class", "lsoa-shadow")
    .attr("d", state.path)
    .transition()
    .duration(420)
    .attr("transform", (feature) => {
      const lift = smallAreaLift(feature.properties, scales);
      return `translate(${lift * 0.45},${lift * 0.72})`;
    })
    .attr("opacity", (feature) => (isHighFeature(feature) ? 0.46 : 0.2));

  const areas = mapLayer
    .selectAll("path")
    .data(state.geo.features, (feature) => feature.properties.lsoa_code);

  areas
    .join((enter) =>
      enter
        .append("path")
        .on("mousemove", (event, feature) => showTooltip(event, wardForFeature(feature)))
        .on("mouseleave", hideTooltip),
    )
    .attr("class", (feature) => `lsoa${isHighFeature(feature) ? " is-raised" : ""}`)
    .attr("d", state.path)
    .transition()
    .duration(420)
    .attr("transform", (feature) => `translate(0,${-smallAreaLift(feature.properties, scales)})`)
    .attr("fill", (feature) => fillSmallArea(feature.properties, scales))
    .attr("opacity", (feature) => (isHighFeature(feature) ? 0.92 : state.scene === "deprivation" ? 0.64 : 0.58));
}

function updateOutlines(scales) {
  const outlineData = state.geo.features.filter(isHighFeature);
  const outlines = outlineLayer.selectAll("path").data(outlineData, (feature) => feature.properties.lsoa_code);

  outlines.exit().remove();

  outlines
    .join("path")
    .attr("class", "lsoa-outline")
    .attr("d", state.path)
    .transition()
    .duration(420)
    .attr("transform", (feature) => `translate(0,${-smallAreaLift(feature.properties, scales)})`);
}

function updateWardColumns(scales) {
  const columns = columnLayer.selectAll("g").data(state.wards, (ward) => ward.ward_code);

  columns.exit().remove();

  const entered = columns
    .enter()
    .append("g")
    .attr("class", "ward-column")
    .on("mousemove", (event, ward) => showTooltip(event, ward))
    .on("mouseleave", hideTooltip);

  entered.append("rect").attr("class", "ward-column-stem");
  entered.append("path").attr("class", "ward-column-cap");

  const merged = entered.merge(columns);

  merged.each(function updateColumn(ward) {
    const [x, y] = wardPoint(ward);
    const height = columnHeight(ward, scales);
    const high = isHighWard(ward);
    const group = d3.select(this);

    group
      .transition()
      .duration(420)
      .attr("transform", `translate(${x},${y})`)
      .attr("opacity", high ? 0.96 : state.width < 650 ? 0.08 : 0.2);

    group
      .select(".ward-column-stem")
      .transition()
      .duration(420)
      .attr("x", high ? -4.5 : -2.5)
      .attr("y", -height)
      .attr("width", high ? 9 : 5)
      .attr("height", height)
      .attr("fill", fillWard(ward, scales));

    group
      .select(".ward-column-cap")
      .transition()
      .duration(420)
      .attr("d", `M ${high ? -11 : -7} ${-height} L 0 ${-height - (high ? 8 : 5)} L ${high ? 11 : 7} ${-height} L 0 ${-height + (high ? 8 : 5)} Z`)
      .attr("fill", fillWard(ward, scales));
  });
}

function updateLabels(scales) {
  const labels = topWards();
  const nodes = labels.map((ward) => {
    const [x, y] = wardPoint(ward);
    const height = columnHeight(ward, scales);
    return {
      ...ward,
      anchorX: x,
      anchorY: y - height,
      x,
      y: y - height - 20,
      height,
    };
  });

  d3.forceSimulation(nodes)
    .force("x", d3.forceX((d) => d.anchorX).strength(0.17))
    .force("y", d3.forceY((d) => d.anchorY - 26).strength(0.23))
    .force("collide", d3.forceCollide(state.width < 650 ? 34 : 54))
    .stop()
    .tick(90);

  nodes.forEach((node) => {
    node.x = Math.max(46, Math.min(state.width - 46, node.x));
    node.y = Math.max(30, Math.min(state.height - 56, node.y));
  });

  const labelGroups = labelLayer.selectAll("g").data(nodes, (ward) => ward.ward_code);
  labelGroups.exit().remove();

  const entered = labelGroups.enter().append("g").attr("class", "ward-label-group");
  entered.append("line").attr("class", "label-line");
  entered.append("rect").attr("class", "label-bg");
  entered.append("text").attr("class", "ward-label");

  const merged = entered.merge(labelGroups);

  merged.each(function updateLabel(ward) {
    const group = d3.select(this);
    const text = `${ward.ward} ${valueLabel(ward)}`;
    const labelWidth = Math.max(86, text.length * 6.5 + 18);
    const labelHeight = 25;

    group
      .select(".label-line")
      .attr("x1", ward.anchorX)
      .attr("y1", ward.anchorY)
      .attr("x2", ward.x)
      .attr("y2", ward.y);

    group
      .select(".label-bg")
      .attr("x", ward.x - labelWidth / 2)
      .attr("y", ward.y - labelHeight / 2)
      .attr("width", labelWidth)
      .attr("height", labelHeight);

    group.select(".ward-label").attr("x", ward.x).attr("y", ward.y + 4).text(text);
  });
}

function setupZoom() {
  if (zoomBehaviour) return;
  zoomBehaviour = d3
    .zoom()
    .scaleExtent([1, 8])
    .on("zoom", (event) => {
      state.transform = event.transform;
      viewportLayer.attr("transform", state.transform);
    });
  svg.call(zoomBehaviour).on("dblclick.zoom", null);
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

function zoomToFocus(focus) {
  if (!zoomBehaviour || !state.path) return;
  const features = featuresForFocus(focus);
  if (!features.length || focus === "all") {
    svg.transition().duration(700).call(zoomBehaviour.transform, d3.zoomIdentity);
    return;
  }

  const bounds = features.reduce(
    (acc, feature) => {
      const [[x0, y0], [x1, y1]] = state.path.bounds(feature);
      return [
        [Math.min(acc[0][0], x0), Math.min(acc[0][1], y0)],
        [Math.max(acc[1][0], x1), Math.max(acc[1][1], y1)],
      ];
    },
    [
      [Infinity, Infinity],
      [-Infinity, -Infinity],
    ],
  );
  const dx = bounds[1][0] - bounds[0][0];
  const dy = bounds[1][1] - bounds[0][1];
  const cx = (bounds[0][0] + bounds[1][0]) / 2;
  const cy = (bounds[0][1] + bounds[1][1]) / 2;
  const scale = Math.max(1, Math.min(7, 0.78 / Math.max(dx / state.width, dy / state.height)));
  const transform = d3.zoomIdentity
    .translate(state.width / 2, state.height / 2)
    .scale(scale)
    .translate(-cx, -cy);

  svg.transition().duration(900).call(zoomBehaviour.transform, transform);
}

function renderMap() {
  if (!state.geo || !state.wards) return;

  const stage = document.querySelector(".map-stage");
  const rect = stage.getBoundingClientRect();
  state.width = Math.max(320, rect.width);
  state.height = Math.max(420, svg.node().clientHeight || rect.height);
  svg.attr("viewBox", `0 0 ${state.width} ${state.height}`);

  state.projection = d3.geoMercator().fitExtent(
    [
      [28, 38],
      [state.width - 28, state.height - 68],
    ],
    state.geo,
  );
  state.path = d3.geoPath(state.projection);
  setupZoom();

  const scales = makeScales();
  updateSmallAreas(scales);
  updateOutlines(scales);
  updateWardColumns(scales);
  updateLabels(scales);
  viewportLayer.attr("transform", state.transform);
}

function setScene(scene) {
  state.scene = scene;
  updateTabs();
  updatePanel();
  renderMap();
}

function setFocus(focus) {
  state.focus = focus;
  updateFocusButtons();
  renderMap();
  zoomToFocus(focus);
}

sceneTabs.forEach((button) => {
  button.addEventListener("click", () => setScene(button.dataset.scene));
});

focusButtons.forEach((button) => {
  button.addEventListener("click", () => setFocus(button.dataset.focus));
});

zoomButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!zoomBehaviour) return;
    if (button.dataset.zoom === "reset") {
      setFocus("all");
      return;
    }
    const factor = button.dataset.zoom === "in" ? 1.35 : 0.74;
    svg.transition().duration(350).call(zoomBehaviour.scaleBy, factor);
  });
});

Promise.all([
  fetch("data/processed/hidden_week_map.geojson").then((response) => response.json()),
  fetch("data/processed/hidden_week_ward_data.json").then((response) => response.json()),
  fetch("data/processed/summary.json").then((response) => response.json()),
])
  .then(([geo, wards, summary]) => {
    state.geo = geo;
    state.wards = wards;
    state.summary = summary;
    updatePanel();
    updateFocusButtons();
    renderMap();
  })
  .catch((error) => {
    sceneTitle.textContent = "The map data could not be loaded.";
    sceneText.textContent = error.message;
  });

let resizeTimer = null;
window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(renderMap, 150);
});
