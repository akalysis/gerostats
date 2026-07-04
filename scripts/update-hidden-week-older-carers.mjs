import fs from "node:fs/promises";

const geoPath = "stories/hidden-week-care/data/processed/hidden_week_map.geojson";
const wardPath = "stories/hidden-week-care/data/processed/hidden_week_ward_data.json";
const summaryPath = "stories/hidden-week-care/data/processed/summary.json";
const generatedPath = "remotion/hidden-week/src/generatedData.ts";

const rm113Url = "https://www.nomisweb.co.uk/api/v01/dataset/NM_2213_1.data.csv";

const careBands = {
  noCare: "1",
  care19OrLess: "2",
  care20To49: "3",
  care50Plus: "4",
};

const round = (value, digits = 1) => {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const sum = (rows, key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...body] = rows;
  return body.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
  );
}

async function fetchRm113(codes) {
  const chunks = [];
  for (let index = 0; index < codes.length; index += 80) {
    chunks.push(codes.slice(index, index + 80));
  }

  const rows = [];
  for (const chunk of chunks) {
    const params = new URLSearchParams({
      GEOGRAPHY: chunk.join(","),
      C2021_CARER_5: "0,1,2,3,4",
      C2021_AGE_7: "6",
      MEASURES: "20100",
      FREQ: "A",
    });
    const response = await fetch(`${rm113Url}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Nomis RM113 request failed: ${response.status} ${response.statusText}`);
    }
    rows.push(...parseCsv(await response.text()));
  }
  return rows;
}

function toOlderFields(prefix, rows) {
  const byBand = new Map(rows.map((row) => [row.C2021_CARER_5, Number(row.OBS_VALUE) || 0]));
  const total = byBand.get("0") || 0;
  const noCare = byBand.get(careBands.noCare) || 0;
  const care19OrLess = byBand.get(careBands.care19OrLess) || 0;
  const care20To49 = byBand.get(careBands.care20To49) || 0;
  const care50Plus = byBand.get(careBands.care50Plus) || 0;
  const carers = care19OrLess + care20To49 + care50Plus;
  const minimumHours = care19OrLess + care20To49 * 20 + care50Plus * 50;

  return {
    [`${prefix}_total_65plus`]: total,
    [`${prefix}_no_care`]: noCare,
    [`${prefix}_carers`]: carers,
    [`${prefix}_care_19_or_less`]: care19OrLess,
    [`${prefix}_care_20_49`]: care20To49,
    [`${prefix}_care_50_plus`]: care50Plus,
    [`${prefix}_minimum_weekly_care_hours`]: minimumHours,
    [`${prefix}_carer_pct`]: round((carers / total) * 100),
    [`${prefix}_heavy_care_pct`]: round((care50Plus / total) * 100),
    [`${prefix}_minimum_hours_per_100_65plus`]: round((minimumHours / total) * 100),
  };
}

function withRankFlags(wards) {
  const base = wards.map((ward) => ({
    ...ward,
    deprivation_pressure: 11 - ward.imd_decile_mean,
  }));
  const z = (key, row) => {
    const values = base.map((ward) => ward[key]).filter(Number.isFinite);
    const mean = values.reduce((total, value) => total + value, 0) / values.length;
    const variance =
      values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
    const sd = Math.sqrt(variance) || 1;
    return (row[key] - mean) / sd;
  };

  const scored = base.map((ward) => ({
    ...ward,
    older_stack_score: round(
      z("older_minimum_hours_per_100_65plus", ward) +
        z("older_heavy_care_pct", ward) +
        z("bad_very_bad_health_pct", ward) +
        z("limited_lot_pct", ward) +
        z("deprivation_pressure", ward),
      3,
    ),
  }));

  const fifth = Math.max(1, Math.round(scored.length * 0.2));
  const topHours = new Set(
    [...scored]
      .sort((a, b) => b.older_minimum_hours_per_100_65plus - a.older_minimum_hours_per_100_65plus)
      .slice(0, fifth)
      .map((ward) => ward.ward_code),
  );
  const topHeavy = new Set(
    [...scored]
      .sort((a, b) => b.older_heavy_care_pct - a.older_heavy_care_pct)
      .slice(0, fifth)
      .map((ward) => ward.ward_code),
  );
  const topStack = new Set(
    [...scored]
      .sort((a, b) => b.older_stack_score - a.older_stack_score)
      .slice(0, fifth)
      .map((ward) => ward.ward_code),
  );

  return scored.map((ward) => ({
    ...ward,
    high_older_burden: topHours.has(ward.ward_code),
    high_older_heavy_care: topHeavy.has(ward.ward_code),
    high_older_stack: topStack.has(ward.ward_code),
  }));
}

function average(rows, key) {
  return round(sum(rows, key) / rows.length);
}

function makeOlderSummary(wards) {
  const highestOlderHours = [...wards].sort(
    (a, b) => b.older_minimum_hours_per_100_65plus - a.older_minimum_hours_per_100_65plus,
  );
  const highestOlderHeavy = [...wards].sort(
    (a, b) => b.older_heavy_care_pct - a.older_heavy_care_pct,
  );
  const highestOlderStack = [...wards].sort((a, b) => b.older_stack_score - a.older_stack_score);
  const lowOlderHours = [...highestOlderHours].reverse();
  const fifth = Math.max(1, Math.round(wards.length * 0.2));
  const topFifth = highestOlderHours.slice(0, fifth);
  const lowFifth = lowOlderHours.slice(0, fifth);

  return {
    source: "Census 2021 RM113: Provision of unpaid care by age",
    total_65plus: sum(wards, "older_total_65plus"),
    total_older_carers: sum(wards, "older_carers"),
    total_older_heavy_carers: sum(wards, "older_care_50_plus"),
    total_older_minimum_weekly_care_hours: sum(wards, "older_minimum_weekly_care_hours"),
    older_carer_pct: round((sum(wards, "older_carers") / sum(wards, "older_total_65plus")) * 100),
    older_heavy_care_pct: round(
      (sum(wards, "older_care_50_plus") / sum(wards, "older_total_65plus")) * 100,
    ),
    older_minimum_hours_per_100_65plus: round(
      (sum(wards, "older_minimum_weekly_care_hours") / sum(wards, "older_total_65plus")) * 100,
    ),
    highest_older_ward_hours: highestOlderHours.slice(0, 10),
    lowest_older_ward_hours: lowOlderHours.slice(0, 10),
    highest_older_ward_heavy_care: highestOlderHeavy.slice(0, 10),
    highest_older_ward_stack: highestOlderStack.slice(0, 10),
    high_fifth: {
      n: topFifth.length,
      hours: average(topFifth, "older_minimum_hours_per_100_65plus"),
      carer_pct: average(topFifth, "older_carer_pct"),
      heavy_pct: average(topFifth, "older_heavy_care_pct"),
      decile_mean: average(topFifth, "imd_decile_mean"),
      bad_health: average(topFifth, "bad_very_bad_health_pct"),
      limited: average(topFifth, "limited_lot_pct"),
    },
    low_fifth: {
      n: lowFifth.length,
      hours: average(lowFifth, "older_minimum_hours_per_100_65plus"),
      carer_pct: average(lowFifth, "older_carer_pct"),
      heavy_pct: average(lowFifth, "older_heavy_care_pct"),
      decile_mean: average(lowFifth, "imd_decile_mean"),
      bad_health: average(lowFifth, "bad_very_bad_health_pct"),
      limited: average(lowFifth, "limited_lot_pct"),
    },
  };
}

function compactWard(ward) {
  return {
    code: ward.ward_code,
    ward: ward.ward,
    lad: ward.lad.replace("Newcastle upon Tyne", "Newcastle"),
    x: ward.x,
    y: ward.y,
    olderTotal: ward.older_total_65plus,
    olderCarers: ward.older_carers,
    olderHoursTotal: ward.older_minimum_weekly_care_hours,
    olderHours: ward.older_minimum_hours_per_100_65plus,
    olderCarerPct: ward.older_carer_pct,
    olderHeavy: ward.older_heavy_care_pct,
    badHealth: ward.bad_very_bad_health_pct,
    limited: ward.limited_lot_pct,
    decile: ward.imd_decile,
    decileMean: ward.imd_decile_mean,
    stack: ward.older_stack_score,
  };
}

async function updateGeneratedData(geo, wards, olderSummary) {
  const source = await fs.readFile(generatedPath, "utf8");
  const mapMatch = source.match(/export const mapShapes = (\[.*?\]);\n\nexport const wards/s);
  const wardMatch = source.match(/export const wards = (\[.*?\]);\n\nexport const storyStats/s);

  if (!mapMatch || !wardMatch) {
    throw new Error("Could not parse generated animation data.");
  }

  const mapShapes = JSON.parse(mapMatch[1]);
  const oldWards = JSON.parse(wardMatch[1]);
  const wardByCode = new Map(wards.map((ward) => [ward.ward_code, ward]));
  const lsoaByCode = new Map(geo.features.map((feature) => [feature.properties.lsoa_code, feature.properties]));

  const nextShapes = mapShapes.map((shape) => {
    const props = lsoaByCode.get(shape.code);
    return {
      ...shape,
      ward: props?.ward,
      lad: props?.lad?.replace("Newcastle upon Tyne", "Newcastle"),
      olderHours: props?.older_minimum_hours_per_100_65plus ?? 0,
      olderCarerPct: props?.older_carer_pct ?? 0,
      olderHeavy: props?.older_heavy_care_pct ?? 0,
    };
  });

  const nextWards = oldWards
    .map((ward) => wardByCode.get(ward.code))
    .filter(Boolean)
    .map((ward) => compactWard(ward));

  const storyStats = {
    totalOlderHours: olderSummary.total_older_minimum_weekly_care_hours,
    olderCarers: olderSummary.total_older_carers,
    olderHeavyCarers: olderSummary.total_older_heavy_carers,
    olderCarerPct: olderSummary.older_carer_pct,
    olderHeavyPct: olderSummary.older_heavy_care_pct,
    olderHoursPer100: olderSummary.older_minimum_hours_per_100_65plus,
    highFifth: {
      n: olderSummary.high_fifth.n,
      hours: olderSummary.high_fifth.hours,
      decileMean: olderSummary.high_fifth.decile_mean,
      badHealth: olderSummary.high_fifth.bad_health,
      limited: olderSummary.high_fifth.limited,
      heavy: olderSummary.high_fifth.heavy_pct,
    },
    lowFifth: {
      n: olderSummary.low_fifth.n,
      hours: olderSummary.low_fifth.hours,
      decileMean: olderSummary.low_fifth.decile_mean,
      badHealth: olderSummary.low_fifth.bad_health,
      limited: olderSummary.low_fifth.limited,
      heavy: olderSummary.low_fifth.heavy_pct,
    },
    topWards: olderSummary.highest_older_ward_hours.slice(0, 8).map((ward) => compactWard(ward)),
    lowWards: olderSummary.lowest_older_ward_hours.slice(0, 6).map((ward) => compactWard(ward)),
  };

  await fs.writeFile(
    generatedPath,
    `export const mapShapes = ${JSON.stringify(nextShapes)};\n\nexport const wards = ${JSON.stringify(nextWards)};\n\nexport const storyStats = ${JSON.stringify(storyStats)};\n`,
  );
}

async function main() {
  const [geo, wards, summary] = await Promise.all([
    fs.readFile(geoPath, "utf8").then(JSON.parse),
    fs.readFile(wardPath, "utf8").then(JSON.parse),
    fs.readFile(summaryPath, "utf8").then(JSON.parse),
  ]);

  const lsoaCodes = geo.features.map((feature) => feature.properties.lsoa_code);
  const rows = await fetchRm113(lsoaCodes);
  const rowsByLsoa = Map.groupBy(rows, (row) => row.GEOGRAPHY);

  for (const feature of geo.features) {
    Object.assign(
      feature.properties,
      toOlderFields("older", rowsByLsoa.get(feature.properties.lsoa_code) || []),
    );
  }

  const featuresByWard = Map.groupBy(
    geo.features,
    (feature) => `${feature.properties.ward}|||${feature.properties.lad}`,
  );

  const wardsWithOlder = wards.map((ward) => {
    const features = featuresByWard.get(`${ward.ward}|||${ward.lad}`) || [];
    const older = {
      older_total_65plus: sum(features.map((feature) => feature.properties), "older_total_65plus"),
      older_no_care: sum(features.map((feature) => feature.properties), "older_no_care"),
      older_carers: sum(features.map((feature) => feature.properties), "older_carers"),
      older_care_19_or_less: sum(features.map((feature) => feature.properties), "older_care_19_or_less"),
      older_care_20_49: sum(features.map((feature) => feature.properties), "older_care_20_49"),
      older_care_50_plus: sum(features.map((feature) => feature.properties), "older_care_50_plus"),
      older_minimum_weekly_care_hours: sum(
        features.map((feature) => feature.properties),
        "older_minimum_weekly_care_hours",
      ),
    };
    return {
      ...ward,
      ...older,
      older_carer_pct: round((older.older_carers / older.older_total_65plus) * 100),
      older_heavy_care_pct: round((older.older_care_50_plus / older.older_total_65plus) * 100),
      older_minimum_hours_per_100_65plus: round(
        (older.older_minimum_weekly_care_hours / older.older_total_65plus) * 100,
      ),
    };
  });

  const rankedWards = withRankFlags(wardsWithOlder);
  const wardByName = new Map(rankedWards.map((ward) => [`${ward.ward}|||${ward.lad}`, ward]));

  for (const feature of geo.features) {
    const ward = wardByName.get(`${feature.properties.ward}|||${feature.properties.lad}`);
    if (!ward) continue;
    feature.properties.older_stack_score = ward.older_stack_score;
    feature.properties.high_older_burden = ward.high_older_burden;
    feature.properties.high_older_heavy_care = ward.high_older_heavy_care;
    feature.properties.high_older_stack = ward.high_older_stack;
  }

  const olderSummary = makeOlderSummary(rankedWards);
  summary.older_carers = olderSummary;
  summary.sources = [
    ...summary.sources.filter(
      (source) => !source.name.includes("RM113") && !source.name.includes("Provision of unpaid care by age"),
    ),
    {
      name: "Census 2021 RM113: Provision of unpaid care by age",
      url: "https://www.nomisweb.co.uk/datasets/c2021rm113",
    },
  ];

  await Promise.all([
    fs.writeFile(geoPath, `${JSON.stringify(geo)}\n`),
    fs.writeFile(wardPath, `${JSON.stringify(rankedWards, null, 2)}\n`),
    fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`),
    updateGeneratedData(geo, rankedWards, olderSummary),
  ]);

  console.log(
    `Updated older-carer data: ${olderSummary.total_older_carers.toLocaleString("en-GB")} carers aged 65+; ${olderSummary.total_older_minimum_weekly_care_hours.toLocaleString("en-GB")} minimum hours/week.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
