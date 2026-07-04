const svg = d3.select("#care-map");
const tooltip = document.querySelector("#map-tooltip");
const sceneLabel = document.querySelector("#scene-label");
const sceneTitle = document.querySelector("#scene-title");
const sceneText = document.querySelector("#scene-text");
const sceneMetrics = document.querySelector("#scene-metrics");
const rankPanel = document.querySelector("#rank-panel");
const mapOverlayList = document.querySelector("#map-overlay-list");
const sceneTabs = Array.from(document.querySelectorAll(".scene-tab"));

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

const state = {
  geo: null,
  wards: null,
  summary: null,
  scene: "week",
  projection: null,
  path: null,
  width: 0,
  height: 0,
};

const mapLayer = svg.append("g").attr("class", "map-layer");
const pulseLayer = svg.append("g").attr("class", "pulse-layer");
const bubbleLayer = svg.append("g").attr("class", "bubble-layer");
const labelLayer = svg.append("g").attr("class", "label-layer");

function formatMillions(value) {
  return `${(value / 1_000_000).toFixed(2)} million`;
}

function wardName(ward) {
  return `${ward.ward}, ${ward.lad.replace("Newcastle upon Tyne", "Newcastle")}`;
}

function sceneMetric(ward) {
  if (state.scene === "heavy") return ward.heavy_care_pct;
  if (state.scene === "deprivation") return 11 - ward.imd_decile_mean;
  if (state.scene === "stack") return ward.stack_score;
  return ward.minimum_hours_per_100;
}

function sceneUnit() {
  if (state.scene === "heavy") return "% reporting 50+ hours";
  if (state.scene === "deprivation") return "IMD deprivation";
  if (state.scene === "stack") return "stacked pressure score";
  return "minimum hours per 100 residents aged 5+";
}

function circleValueLabel(ward) {
  if (state.scene === "heavy") return `${formatOne.format(ward.heavy_care_pct)}%`;
  if (state.scene === "deprivation") return `D${ward.imd_decile}`;
  if (state.scene === "stack") return `${formatOne.format(ward.minimum_hours_per_100)} hrs`;
  return `${formatOne.format(ward.minimum_hours_per_100)} hrs`;
}

function sceneCopy(summary) {
  const topWard = summary.highest_ward_hours[0];
  const topStack = summary.highest_ward_stack[0];
  return {
    week: {
      label: "Care burden by named area",
      title: `${topWard.ward}, ${topWard.lad}: ${formatOne.format(topWard.minimum_hours_per_100)} minimum unpaid care-hours per 100 residents.`,
      text:
        "This view answers the basic question first: which named areas are carrying the greatest unpaid-care burden?  Bigger and darker circles mean more minimum unpaid care-hours per 100 residents aged 5 and over each week.",
      metrics: [
        {
          value: formatMillions(summary.total_minimum_weekly_care_hours),
          label: "minimum unpaid care-hours across Tyne and Wear each week",
        },
        {
          value: formatNumber.format(summary.minimum_full_time_equivalent_37_5h),
          label: "37.5-hour working weeks, every week",
        },
        {
          value: `${formatOne.format(summary.carer_pct)}%`,
          label: "of residents aged 5+ providing unpaid care",
        },
      ],
      ranks: summary.highest_ward_hours,
      rankLabel: "Highest ward-level unpaid-care burden",
      valueKey: "minimum_hours_per_100",
      valueSuffix: " hrs per 100",
    },
    deprivation: {
      label: "Deprivation underneath",
      title: "High care burden sits heavily in deprived places.",
      text:
        "The circles still show named wards, but the colour now follows deprivation.  D1 means the most deprived 10% of neighbourhoods in England.",
      metrics: [
        {
          value: `${formatOne.format(summary.deprived_d1_d2_mean_hours_per_100)}`,
          label: "minimum hours per 100 residents in D1/D2 areas",
        },
        {
          value: `${formatOne.format(summary.least_deprived_d9_d10_mean_hours_per_100)}`,
          label: "minimum hours per 100 residents in D9/D10 areas",
        },
        {
          value: `${formatOne.format(
            summary.deprived_d1_d2_mean_hours_per_100 -
              summary.least_deprived_d9_d10_mean_hours_per_100,
          )}`,
          label: "extra minimum hours per 100 residents in the poorer areas",
        },
      ],
      ranks: summary.highest_ward_hours,
      rankLabel: "Care burden remains the anchor",
      valueKey: "minimum_hours_per_100",
      valueSuffix: " hrs per 100",
    },
    heavy: {
      label: "50+ hours a week",
      title: `${formatNumber.format(summary.total_heavy_carers)} people report 50+ hours of unpaid care a week.`,
      text:
        "This is the group reporting care at a level that can swallow work, sleep, money, health and ordinary time.  Bigger circles show wards where this is more common.",
      metrics: [
        {
          value: `${formatOne.format(summary.heavy_care_pct)}%`,
          label: "of residents aged 5+ report 50+ hours unpaid care",
        },
        {
          value: `${formatOne.format(summary.deprived_d1_d2_mean_heavy_care_pct)}%`,
          label: "average in D1/D2 areas",
        },
        {
          value: `${formatOne.format(summary.least_deprived_d9_d10_mean_heavy_care_pct)}%`,
          label: "average in D9/D10 areas",
        },
      ],
      ranks: summary.highest_ward_heavy_care,
      rankLabel: "Highest share reporting 50+ hours",
      valueKey: "heavy_care_pct",
      valueSuffix: "%",
    },
    stack: {
      label: "Where pressures stack",
      title: `${topStack.ward}, ${topStack.lad}: care, deprivation, poor health and disability stack together.`,
      text:
        "This view highlights named wards that sit high across unpaid care-hours, 50+ hour care, deprivation, bad or very bad health, and disability limited a lot.",
      metrics: [
        {
          value: `${formatOne.format(topStack.minimum_hours_per_100)}`,
          label: `minimum hours per 100 residents in ${topStack.ward}`,
        },
        {
          value: `${formatOne.format(topStack.heavy_care_pct)}%`,
          label: "50+ hour unpaid care in the highest stacked ward",
        },
        {
          value: `D${topStack.imd_decile}`,
          label: "Index of Multiple Deprivation decile for the highest stacked ward",
        },
      ],
      ranks: summary.highest_ward_stack,
      rankLabel: "Highest stacked pressure",
      valueKey: "minimum_hours_per_100",
      valueSuffix: " hrs per 100",
    },
  };
}

function fillSmallArea(properties, scales) {
  if (state.scene === "deprivation") {
    return deprivationColours[properties.imd_decile] || "#d3d5d1";
  }
  if (state.scene === "heavy") {
    return d3.interpolateRgb("#edf4ef", "#b4232a")(scales.smallHeavy(properties.heavy_care_pct));
  }
  if (state.scene === "stack") {
    return d3.interpolateRgb("#eef1ed", "#7f1620")(scales.smallStack(properties.stack_score));
  }
  return d3.interpolateRgb("#edf4ef", "#b4232a")(scales.smallHours(properties.minimum_hours_per_100));
}

function fillWard(ward, scales) {
  if (state.scene === "deprivation") {
    return deprivationColours[ward.imd_decile] || "#d3d5d1";
  }
  if (state.scene === "heavy") {
    return d3.interpolateRgb("#f2e8c7", "#b4232a")(scales.wardHeavy(ward.heavy_care_pct));
  }
  if (state.scene === "stack") {
    return d3.interpolateRgb("#f2e8c7", "#8f1d22")(scales.wardStack(ward.stack_score));
  }
  return d3.interpolateRgb("#f2e8c7", "#b4232a")(scales.wardHours(ward.minimum_hours_per_100));
}

function makeScales() {
  const small = state.geo.features.map((feature) => feature.properties);
  const wards = state.wards;
  return {
    smallHours: d3.scaleLinear().domain(d3.extent(small, (d) => d.minimum_hours_per_100)).range([0, 1]),
    smallHeavy: d3.scaleLinear().domain(d3.extent(small, (d) => d.heavy_care_pct)).range([0, 1]),
    smallStack: d3.scaleLinear().domain(d3.extent(small, (d) => d.stack_score)).range([0, 1]),
    wardHours: d3.scaleLinear().domain(d3.extent(wards, (d) => d.minimum_hours_per_100)).range([0, 1]),
    wardHeavy: d3.scaleLinear().domain(d3.extent(wards, (d) => d.heavy_care_pct)).range([0, 1]),
    wardStack: d3.scaleLinear().domain(d3.extent(wards, (d) => d.stack_score)).range([0, 1]),
    radiusHours: d3.scaleSqrt().domain(d3.extent(wards, (d) => d.minimum_hours_per_100)).range([6, state.width < 600 ? 19 : 30]),
    radiusHeavy: d3.scaleSqrt().domain(d3.extent(wards, (d) => d.heavy_care_pct)).range([6, state.width < 600 ? 19 : 30]),
    radiusStack: d3.scaleSqrt().domain(d3.extent(wards, (d) => d.stack_score)).range([6, state.width < 600 ? 19 : 30]),
  };
}

function radiusForWard(ward, scales) {
  if (state.scene === "heavy") return scales.radiusHeavy(ward.heavy_care_pct);
  if (state.scene === "stack") return scales.radiusStack(ward.stack_score);
  return scales.radiusHours(ward.minimum_hours_per_100);
}

function wardPoint(ward) {
  return state.projection([ward.lon, ward.lat]);
}

function topWards() {
  const key =
    state.scene === "heavy"
      ? "heavy_care_pct"
      : state.scene === "stack"
        ? "stack_score"
        : "minimum_hours_per_100";
  return [...state.wards].sort((a, b) => b[key] - a[key]).slice(0, state.width < 650 ? 5 : 8);
}

function tooltipHtml(ward) {
  return `
    <strong>${wardName(ward)}</strong>
    <span>${formatOne.format(ward.minimum_hours_per_100)} minimum care-hours per 100 residents aged 5+</span><br>
    <span>${formatNumber.format(ward.minimum_weekly_care_hours)} minimum care-hours/week</span><br>
    <span>${formatOne.format(ward.carer_pct)}% provide unpaid care</span><br>
    <span>${formatOne.format(ward.heavy_care_pct)}% report 50+ hours/week</span><br>
    <span>IMD D${ward.imd_decile} · ${formatOne.format(ward.bad_very_bad_health_pct)}% bad or very bad health</span>
  `;
}

function showTooltip(event, ward) {
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
          const value =
            copy.valueKey === "heavy_care_pct"
              ? formatOne.format(row[copy.valueKey])
              : formatOne.format(row[copy.valueKey]);
          return `
            <li>
              <span>${row.ward}, ${row.lad.replace("Newcastle upon Tyne", "Newcastle")}</span>
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
          const suffix = copy.valueKey === "heavy_care_pct" ? "%" : " hrs/100";
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

function updateSmallAreas(scales) {
  mapLayer
    .selectAll("path")
    .data(state.geo.features, (feature) => feature.properties.lsoa_code)
    .join("path")
    .attr("class", "lsoa")
    .attr("d", state.path)
    .transition()
    .duration(360)
    .attr("fill", (feature) => fillSmallArea(feature.properties, scales))
    .attr("opacity", state.scene === "deprivation" ? 0.6 : 0.38);
}

function updateBubbles(scales) {
  const bubbles = bubbleLayer
    .selectAll("g")
    .data(state.wards, (ward) => ward.ward_code)
    .join((enter) => {
      const group = enter
        .append("g")
        .attr("class", "ward-bubble")
        .on("mousemove", (event, ward) => showTooltip(event, ward))
        .on("mouseleave", hideTooltip);
      group.append("circle").attr("class", "bubble-halo");
      group.append("circle").attr("class", "bubble");
      group.append("text").attr("class", "bubble-value");
      return group;
    });

  bubbles.each(function updateBubble(ward) {
    const [x, y] = wardPoint(ward);
    const radius = radiusForWard(ward, scales);
    const active =
      (state.scene === "heavy" && ward.high_heavy_care) ||
      (state.scene === "stack" && ward.high_stack) ||
      (state.scene !== "heavy" && state.scene !== "stack" && ward.high_burden);

    const group = d3.select(this);
    group
      .transition()
      .duration(360)
      .attr("transform", `translate(${x},${y})`)
      .attr("opacity", state.scene === "stack" && !ward.high_stack ? 0.52 : 0.96);

    group
      .select(".bubble-halo")
      .transition()
      .duration(360)
      .attr("r", radius + 5)
      .attr("fill", active ? "rgba(180, 35, 42, 0.18)" : "rgba(255, 255, 255, 0.52)");

    group
      .select(".bubble")
      .transition()
      .duration(360)
      .attr("r", radius)
      .attr("fill", fillWard(ward, scales))
      .attr("stroke", active ? "#111415" : "rgba(17,20,21,0.35)")
      .attr("stroke-width", active ? 2.2 : 1);

    group
      .select(".bubble-value")
      .transition()
      .duration(360)
      .attr("y", 4)
      .attr("opacity", active && radius > 17 ? 1 : 0)
      .text(circleValueLabel(ward));
  });
}

function updatePulses(scales) {
  const pulseData = topWards().slice(0, state.width < 650 ? 5 : 8);
  const pulses = pulseLayer.selectAll("circle").data(pulseData, (ward) => ward.ward_code);

  pulses.exit().remove();

  const entered = pulses.enter().append("circle").attr("class", "pulse-ring");
  entered
    .merge(pulses)
    .attr("cx", (ward) => wardPoint(ward)[0])
    .attr("cy", (ward) => wardPoint(ward)[1])
    .attr("r", (ward) => radiusForWard(ward, scales) + 5);
}

function updateLabels(scales) {
  const labels = topWards();
  const nodes = labels.map((ward) => {
    const [x, y] = wardPoint(ward);
    return {
      ...ward,
      anchorX: x,
      anchorY: y,
      x,
      y: y - radiusForWard(ward, scales) - 12,
      radius: radiusForWard(ward, scales),
    };
  });

  d3.forceSimulation(nodes)
    .force("x", d3.forceX((d) => d.anchorX).strength(0.16))
    .force("y", d3.forceY((d) => d.anchorY - d.radius - 24).strength(0.22))
    .force("collide", d3.forceCollide(state.width < 650 ? 28 : 46))
    .stop()
    .tick(90);

  nodes.forEach((node) => {
    node.x = Math.max(42, Math.min(state.width - 42, node.x));
    node.y = Math.max(28, Math.min(state.height - 52, node.y));
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
    const text = `${ward.ward} ${circleValueLabel(ward)}`;
    const labelWidth = Math.max(78, text.length * 6.5 + 16);
    const labelHeight = 24;

    group.select(".label-line")
      .attr("x1", ward.anchorX)
      .attr("y1", ward.anchorY)
      .attr("x2", ward.x)
      .attr("y2", ward.y);

    group.select(".label-bg")
      .attr("x", ward.x - labelWidth / 2)
      .attr("y", ward.y - labelHeight / 2)
      .attr("width", labelWidth)
      .attr("height", labelHeight);

    group.select(".ward-label")
      .attr("x", ward.x)
      .attr("y", ward.y + 4)
      .text(text);
  });
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
      [28, 24],
      [state.width - 28, state.height - 54],
    ],
    state.geo,
  );
  state.path = d3.geoPath(state.projection);

  const scales = makeScales();
  updateSmallAreas(scales);
  updateBubbles(scales);
  updatePulses(scales);
  updateLabels(scales);
}

function setScene(scene) {
  state.scene = scene;
  updateTabs();
  updatePanel();
  renderMap();
}

sceneTabs.forEach((button) => {
  button.addEventListener("click", () => setScene(button.dataset.scene));
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
