// Downloads the full mp3quran.net API database + KSU hilites into web/data-mirror/
// so it can be hosted on archive.org later as an offline mirror / fallback source.
// Resumable (skips already-downloaded files) with a concurrency limit + retries.
//
// Scope:
//   catalog/  languages, suwar (ar/en), riwayat, moshaf, reciters (ar/en), recent_reads
//   timing/   reads.json, soar/{read}.json, surah/{read}_{surah}.json
//   hilites/  {mushaf}/{page}.json  (hafs, warsh, tajweed — 604 pages each)
//
// Usage: node scripts/download-dataset.mjs [--concurrency 4]
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "data-mirror");
const BASE = "https://mp3quran.net/api/v3";
const KSU = "https://quran.ksu.edu.sa/interface.php?ui=pc&do=hilites&mosshaf";
const CONCURRENCY = Number(process.argv.find((a) => a.startsWith("--concurrency"))?.split("=")[1] ?? 4);
const RETRIES = 3;

const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

async function fetchJson(url, retries = RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json, text/plain, */*" } });
      if (res.ok) return await res.json();
      if (i === retries - 1) throw new Error(`HTTP ${res.status} ${url.split("?")[0]}`);
    } catch {
      if (i === retries - 1) throw e ?? new Error(`fetch failed ${url}`);
    }
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
}

async function pool(items, worker) {
  let i = 0;
  const run = async () => {
    while (i < items.length) {
      const item = items[i++];
      await worker(item);
      await new Promise((r) => setTimeout(r, 40)); // gentle rate limit
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, run));
}

function save(rel, data) {
  const p = join(OUT, rel);
  if (existsSync(p)) return false;
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(data));
  return true;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const stats = { catalog: 0, reads: 0, soar: 0, timing: 0, hilites: 0 };

  log("=== CATALOG ===");
  const catalog = [
    ["catalog/languages.json", `${BASE}/languages`],
    ["catalog/suwar_ar.json", `${BASE}/suwar?language=ar`],
    ["catalog/suwar_en.json", `${BASE}/suwar?language=en`],
    ["catalog/riwayat_ar.json", `${BASE}/riwayat?language=ar`],
    ["catalog/moshaf_ar.json", `${BASE}/moshaf?language=ar`],
    ["catalog/reciters_ar.json", `${BASE}/reciters?language=ar`],
    ["catalog/reciters_en.json", `${BASE}/reciters?language=en`],
    ["catalog/recent_reads.json", `${BASE}/recent_reads`],
  ];
  for (const [rel, url] of catalog) {
    if (save(rel, await fetchJson(url))) stats.catalog++;
  }
  log(`catalog saved ${stats.catalog}`);

  log("=== TIMING READS ===");
  const reads = await fetchJson(`${BASE}/ayat_timing/reads`);
  if (save("timing/reads.json", reads)) stats.reads++;
  log(`reads: ${reads.length}`);

  log("=== SOAR (per read) ===");
  const soarByRead = new Map();
  await pool(reads, async (r) => {
    try {
      const soar = await fetchJson(`${BASE}/ayat_timing/soar?read=${r.id}`);
      if (save(`timing/soar/${r.id}.json`, soar)) stats.soar++;
      soarByRead.set(r.id, soar.map((s) => s.id));
    } catch (e) {
      log(`soar read ${r.id} failed: ${e.message}`);
    }
  });
  log(`soar saved ${stats.soar}`);

  log("=== TIMING (per read × surah) ===");
  let total = 0;
  const jobs = [];
  for (const r of reads) {
    const surahs = soarByRead.get(r.id) ?? [];
    for (const s of surahs) jobs.push({ read: r.id, surah: s });
  }
  total = jobs.length;
  log(`timing jobs: ${total}`);
  let done = 0;
  await pool(jobs, async ({ read, surah }) => {
    try {
      const data = await fetchJson(`${BASE}/ayat_timing?surah=${surah}&read=${read}`);
      if (save(`timing/surah/${read}_${surah}.json`, data)) stats.timing++;
    } catch (e) {
      log(`timing read ${read} surah ${surah} failed`);
    }
    done++;
    if (done % 500 === 0) log(`timing ${done}/${total}`);
  });
  log(`timing saved ${stats.timing}/${total}`);

  log("=== KSU HILITES (604 pages × 3 mushafs) ===");
  const mushafs = ["hafs", "warsh", "tajweed"];
  let hdone = 0;
  await pool(mushafs, async (m) => {
    let pdone = 0;
    await pool(Array.from({ length: 604 }, (_, i) => i + 1), async (page) => {
      try {
        const res = await fetch(`${KSU}=${m}&t=28&page=${page}`);
        const text = await res.text();
        const p = join(OUT, `hilites/${m}/${page}.json`);
        mkdirSync(dirname(p), { recursive: true });
        if (!existsSync(p)) {
          writeFileSync(p, text);
          stats.hilites++;
        }
      } catch {
        log(`hilites ${m} p${page} failed`);
      }
      pdone++;
      if (pdone % 200 === 0) log(`hilites ${m} ${pdone}/604`);
    });
  });
  hdone = stats.hilites;
  log(`hilites saved ${stats.hilites}`);

  // Manifest + license/attribution
  save("manifest.json", {
    source: { mp3quran: "https://mp3quran.net/api/v3", ksu: "https://quran.ksu.edu.sa" },
    mirrors: ["https://archive.org/details/<YOUR-ITEM>"],
    generated_at: new Date().toISOString(),
    counts: stats,
    license:
      "Dataset for the Quran TV app. mp3quran.net API data and quran.ksu.edu.sa hilites are provided for off-/mirror use; see mp3quran.net terms. Quran text attribution: Tanzil (CC BY-NC-ND) — bundled separately.",
  });

  log(`TOTAL saved: ${JSON.stringify(stats)}`);
  log(`Done. Mirror directory: ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
