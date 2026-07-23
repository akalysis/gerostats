import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROFILE_ID = "EdITXsEAAAAJ";
const PROFILE_URL = `https://scholar.google.com/citations?user=${PROFILE_ID}&hl=en`;
const PAGE_SIZE = 100;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(scriptDirectory, "../data/publications.json");

const namedEntities = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["hellip", "…"],
  ["ldquo", "“"],
  ["lsquo", "‘"],
  ["lt", "<"],
  ["mdash", "—"],
  ["nbsp", " "],
  ["ndash", "–"],
  ["quot", '"'],
  ["rdquo", "”"],
  ["rsquo", "’"],
]);

function decodeEntities(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }
    return namedEntities.get(entity.toLowerCase()) ?? match;
  });
}

function cleanText(value = "") {
  return decodeEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractAnchor(row, className) {
  const pattern = new RegExp(
    `<a\\b(?=[^>]*\\bclass="[^"]*\\b${className}\\b[^"]*")[^>]*>[\\s\\S]*?<\\/a>`,
  );
  const match = row.match(pattern);
  if (!match) return null;

  const markup = match[0];
  const href = markup.match(/\bhref="([^"]*)"/)?.[1] ?? "";
  const text = markup.match(/>([\s\S]*?)<\/a>$/)?.[1] ?? "";
  return {
    href: decodeEntities(href),
    text: cleanText(text),
  };
}

function absoluteScholarUrl(href) {
  if (!href) return PROFILE_URL;
  return new URL(href, "https://scholar.google.com").toString();
}

function parsePublicationRows(html) {
  const rows = html.match(/<tr class="gsc_a_tr"[\s\S]*?<\/tr>/g) ?? [];

  return rows.map((row) => {
    const titleAnchor = extractAnchor(row, "gsc_a_at");
    const citationAnchor = extractAnchor(row, "gsc_a_ac");
    const grayLines = [...row.matchAll(/<div class="gs_gray">([\s\S]*?)<\/div>/g)].map(
      (match) => cleanText(match[1]),
    );
    const year =
      Number.parseInt(row.match(/<td class="gsc_a_y">[\s\S]*?(\d{4})[\s\S]*?<\/td>/)?.[1], 10) ||
      null;
    const citations = Number.parseInt(citationAnchor?.text.replaceAll(",", "") ?? "0", 10) || 0;
    const scholarUrl = absoluteScholarUrl(titleAnchor?.href);
    const scholarId =
      new URL(scholarUrl).searchParams.get("citation_for_view") ?? `${titleAnchor?.text}-${year}`;
    const venue = (grayLines[1] ?? "").replace(new RegExp(`,?\\s*${year ?? ""}$`), "").trim();

    return {
      id: scholarId,
      title: titleAnchor?.text ?? "Untitled publication",
      authors: grayLines[0] ?? "",
      venue,
      year,
      citations,
      scholarUrl,
      citationsUrl: absoluteScholarUrl(citationAnchor?.href),
    };
  });
}

function parseMetrics(html) {
  const values = [...html.matchAll(/<td class="gsc_rsb_std">([\d,]+)<\/td>/g)].map((match) =>
    Number.parseInt(match[1].replaceAll(",", ""), 10),
  );

  if (values.length < 6) {
    throw new Error("Google Scholar metrics were not present in the expected format.");
  }

  return {
    citations: { all: values[0], since2021: values[1] },
    hIndex: { all: values[2], since2021: values[3] },
    i10Index: { all: values[4], since2021: values[5] },
  };
}

async function fetchPage(start) {
  const url = new URL(PROFILE_URL);
  url.searchParams.set("view_op", "list_works");
  url.searchParams.set("pagesize", String(PAGE_SIZE));
  url.searchParams.set("cstart", String(start));

  const response = await fetch(url, {
    headers: {
      "accept-language": "en-GB,en;q=0.9",
      "user-agent": USER_AGENT,
    },
  });
  const html = await response.text();

  if (!response.ok || html.includes("Please show you're not a robot")) {
    throw new Error(`Google Scholar refused the update request (${response.status}). Try again later.`);
  }

  return html;
}

const publications = [];
let metrics;

for (let start = 0; start < 1000; start += PAGE_SIZE) {
  const html = await fetchPage(start);
  const pagePublications = parsePublicationRows(html);

  if (start === 0) metrics = parseMetrics(html);
  publications.push(...pagePublications);
  if (pagePublications.length < PAGE_SIZE) break;
}

const deduplicatedPublications = [
  ...new Map(publications.map((publication) => [publication.id, publication])).values(),
].sort(
  (a, b) =>
    (b.year ?? 0) - (a.year ?? 0) ||
    b.citations - a.citations ||
    a.title.localeCompare(b.title),
);

const output = {
  profile: {
    id: PROFILE_ID,
    name: "Dr Andrew Kingston",
    url: PROFILE_URL,
  },
  refreshedAt: new Date().toISOString(),
  metrics,
  publicationCount: deduplicatedPublications.length,
  publications: deduplicatedPublications,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

console.log(
  `Saved ${deduplicatedPublications.length} publications and ${metrics.citations.all.toLocaleString("en-GB")} citations to ${outputPath}.`,
);
