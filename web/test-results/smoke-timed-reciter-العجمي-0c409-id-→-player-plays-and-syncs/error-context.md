# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> timed reciter (العجمي, read 5) → grid → player plays and syncs
- Location: tests/e2e/smoke.spec.ts:29:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('القراء', { exact: true }).first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByText('القراء', { exact: true }).first()

```

```yaml
- text: → أحمد بن علي العجمي حفص عن عاصم - مرتل ☆ السور حفص عن عاصم - مرتل السور 1 الفاتحة 2 البقرة 3 آل عمران 4 النساء 5 المائدة 6 الأنعام 7 الأعراف 8 الأنفال 9 التوبة 10 يونس 11 هود 12 يوسف 13 الرعد 14 إبراهيم 15 الحجر 16 النحل 17 الإسراء 18 الكهف 19 مريم 20 طه 21 الأنبياء 22 الحج 23 المؤمنون 24 النور 25 الفرقان 26 الشعراء 27 النمل 28 القصص 29 العنكبوت 30 الروم 31 لقمان 32 السجدة 33 الأحزاب 34 سبأ 35 فاطر 36 يس 37 الصافات 38 ص 39 الزمر 40 غافر 41 فصلت 42 الشورى 43 الزخرف 44 الدّخان 45 الجاثية 46 الأحقاف 47 محمد 48 الفتح 49 الحجرات 50 ق 51 الذاريات 52 الطور 53 النجم 54 القمر 55 الرحمن 56 الواقعة 57 الحديد 58 المجادلة 59 الحشر 60 الممتحنة 61 الصف 62 الجمعة 63 المنافقون 64 التغابن 65 الطلاق 66 التحريم 67 الملك 68 القلم 69 الحاقة 70 المعارج 71 نوح 72 الجن 73 المزمل 74 المدثر 75 القيامة 76 الإنسان 77 المرسلات 78 النبأ 79 النازعات 80 عبس 81 التكوير 82 الإنفطار 83 المطففين 84 الإنشقاق 85 البروج 86 الطارق 87 الأعلى 88 الغاشية 89 الفجر 90 البلد 91 الشمس 92 الليل 93 الضحى 94 الشرح 95 التين 96 العلق 97 القدر 98 البينة 99 الزلزلة 100 العاديات 101 القارعة 102 التكاثر 103 العصر 104 الهمزة 105 الفيل 106 قريش 107 الماعون 108 الكوثر 109 الكافرون 110 النصر 111 المسد 112 الإخلاص 113 الفلق 114 الناس
```

# Test source

```ts
  17  |   await expect(page.locator(".focused").first()).toHaveCount(1);
  18  |   // D-pad moves focus between chips
  19  |   const focusedBefore = await page.locator(".focused").first().innerText();
  20  |   await page.keyboard.press("ArrowDown");
  21  |   await page.waitForTimeout(250);
  22  |   const focusedNow = await page.locator(".focused").first().innerText();
  23  |   expect(focusedNow).not.toBe(focusedBefore);
  24  |   // Back from Home is a no-op (stays)
  25  |   await page.keyboard.press("Escape");
  26  |   await expect(page.getByText("القراء", { exact: true }).first()).toBeVisible();
  27  | });
  28  | 
  29  | test("timed reciter (العجمي, read 5) → grid → player plays and syncs", async ({ page }) => {
  30  |   await page.goto("/");
  31  |   await expect(page.locator(".qurantv-rec-cell").first()).toBeVisible({ timeout: 20_000 });
  32  | 
  33  |   // Open the search overlay and find the verified-timed reciter أحمد بن علي العجمي
  34  |   await page.locator("#search-input").fill("العجمي");
  35  |   await page.waitForTimeout(400);
  36  |   await page.keyboard.press("Enter"); // input Enter → openFirstMatch
  37  |   await page.waitForTimeout(1500);
  38  | 
  39  |   // If a moshaf chooser opened (multi-moshaf reciter), pick the first option
  40  |   const chooser = page.locator(".dialog-row").first();
  41  |   if (await chooser.isVisible().catch(() => false)) {
  42  |     await page.keyboard.press("Enter");
  43  |     await page.waitForTimeout(1500);
  44  |   }
  45  | 
  46  |   // Surah grid
  47  |   await expect(page.locator("[data-focus-id='grid-jump']")).toBeVisible({ timeout: 20_000 });
  48  |   // Open surah 1 (first card in the grid)
  49  |   await page.locator("[data-focus-id='surah-1']").click();
  50  |   // Player
  51  |   await expect(page.locator("[data-focus-id='player-back']")).toBeVisible({ timeout: 20_000 });
  52  | 
  53  |   // Audio is actually playing (position advances) — live-network tolerant.
  54  |   await expect(async () => {
  55  |     const pos = await page.evaluate(() => {
  56  |       const a = [...document.querySelectorAll("audio")].find((x) => x.volume > 0);
  57  |       return a && !a.paused && Number.isFinite(a.currentTime) ? a.currentTime : -1;
  58  |     });
  59  |     expect(pos).toBeGreaterThan(0);
  60  |   }).toPass({ timeout: 25_000 });
  61  | 
  62  |   // The player opens in mushaf page mode by default (style 5 = KSU tajweed) —
  63  |   // the page appears once the basmala (ayah 0, no page) gives way to ayah 1.
  64  |   const img = page.locator(PAGE_IMG).first();
  65  |   await expect(img).toBeVisible({ timeout: 40_000 });
  66  | 
  67  |   // SYNC CHECK: the highlight rect moves as the recitation advances
  68  |   const overlayBoxes = () =>
  69  |     page.evaluate(() => {
  70  |       return [...document.querySelectorAll('[data-highlight="true"]')].map((d) => {
  71  |         const r = (d as HTMLElement).getBoundingClientRect();
  72  |         return `${Math.round(r.top)},${Math.round(r.left)}`;
  73  |       });
  74  |     });
  75  |   // The overlay appears once the SVG viewBox is parsed (just after the img).
  76  |   let boxes1: string[] = [];
  77  |   for (let i = 0; i < 8; i++) {
  78  |     boxes1 = await overlayBoxes();
  79  |     if (boxes1.length >= 1) break;
  80  |     await page.waitForTimeout(1000);
  81  |   }
  82  |   expect(boxes1.length).toBeGreaterThanOrEqual(1);
  83  |   // Surah 1 (read 5) ayahs change every ~3-5 s; wait for the highlight to move.
  84  |   let moved = false;
  85  |   for (let i = 0; i < 6; i++) {
  86  |     await page.waitForTimeout(2000);
  87  |     const boxes2 = await overlayBoxes();
  88  |     if (JSON.stringify(boxes1) !== JSON.stringify(boxes2)) {
  89  |       moved = true;
  90  |       break;
  91  |     }
  92  |   }
  93  |   expect(moved).toBe(true);
  94  | 
  95  |   // Info key → text mode: ayah rows with the Amiri font are shown
  96  |   await page.keyboard.press("i");
  97  |   await page.waitForTimeout(800);
  98  |   await expect(page.locator(".quran-text").first()).toBeVisible({ timeout: 10_000 });
  99  |   await page.keyboard.press("i");
  100 |   await page.waitForTimeout(800);
  101 | 
  102 |   // Play/pause via space (media play-pause)
  103 |   await page.keyboard.press(" ");
  104 |   await page.waitForTimeout(300);
  105 |   const paused = await page.evaluate(() => {
  106 |     const a = document.querySelector("audio");
  107 |     return a ? a.paused : true;
  108 |   });
  109 |   expect(paused).toBe(true);
  110 |   await page.keyboard.press(" ");
  111 |   await page.waitForTimeout(300);
  112 | 
  113 |   // Back → grid → Back → home
  114 |   await page.keyboard.press("Escape");
  115 |   await expect(page.locator("[data-focus-id='grid-jump']")).toBeVisible({ timeout: 10_000 });
  116 |   await page.keyboard.press("Escape");
> 117 |   await expect(page.getByText("القراء", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
      |                                                                   ^ Error: expect(locator).toBeVisible() failed
  118 | });
  119 | 
  120 | test("no-timing reciter opens and degrades gracefully (no crash)", async ({ page }) => {
  121 |   await page.goto("/");
  122 |   await expect(page.locator(".qurantv-rec-cell").first()).toBeVisible({ timeout: 20_000 });
  123 | 
  124 |   // Search for a known no-timing reciter (أحمد الحذيفي has no timing read).
  125 |   await page.locator("#search-input").fill("الحذيفي");
  126 |   await page.waitForTimeout(400);
  127 |   const rows = await page.locator(".dialog-row").count();
  128 |   expect(rows).toBeGreaterThanOrEqual(1);
  129 |   await page.keyboard.press("Enter");
  130 |   await page.waitForTimeout(3000);
  131 | 
  132 |   // Either the surah grid or the player opened — and nothing crashed.
  133 |   const crashed = await page.evaluate(() => {
  134 |     return (document.querySelector("#app")?.children.length ?? 0) === 0;
  135 |   });
  136 |   expect(crashed).toBe(false);
  137 | });
  138 | 
  139 | test("tafseer side panel opens beside the mushaf and follows the recitation", async ({ page }) => {
  140 |   await page.goto("/");
  141 |   await expect(page.locator(".qurantv-rec-cell").first()).toBeVisible({ timeout: 20_000 });
  142 | 
  143 |   // Open a timed reciter: search → العجمي → surah 1
  144 |   await page.locator("#search-input").fill("العجمي");
  145 |   await page.keyboard.press("Enter");
  146 |   await page.waitForTimeout(1500);
  147 |   const chooser = page.locator(".dialog-row").first();
  148 |   if (await chooser.isVisible().catch(() => false)) {
  149 |     await page.keyboard.press("Enter");
  150 |     await page.waitForTimeout(1500);
  151 |   }
  152 |   await expect(page.locator("[data-focus-id='grid-jump']")).toBeVisible({ timeout: 20_000 });
  153 |   await page.locator("[data-focus-id='surah-1']").click();
  154 |   await expect(page.locator("[data-focus-id='player-back']")).toBeVisible({ timeout: 20_000 });
  155 | 
  156 |   // Wait for the mushaf page (page mode default — KSU tajweed PNG)
  157 |   const img = page.locator(PAGE_IMG).first();
  158 |   await expect(img).toBeVisible({ timeout: 40_000 });
  159 | 
  160 |   // Open the side-view picker (button labelled مصحف in the transport right zone).
  161 |   // Press a key first: the page-mode chrome auto-hides 5 s after the LAST KEY
  162 |   // press (mouse clicks don't reset the timer), so clicks alone can race it.
  163 |   await page.keyboard.press("ArrowDown");
  164 |   await page.waitForTimeout(200);
  165 |   await page.getByText("مصحف", { exact: true }).first().click();
  166 |   await page.waitForTimeout(600);
  167 |   await page.getByText("التفسير الميسر", { exact: true }).click();
  168 |   await page.waitForTimeout(2500);
  169 | 
  170 |   // Split view: the mushaf page is still visible AND the tafseer panel is beside it
  171 |   await expect(page.locator(PAGE_IMG)).toBeVisible({ timeout: 10_000 });
  172 |   const panelRows = await page.evaluate(() =>
  173 |     [...document.querySelectorAll('[id^="ctx-row-"]')].length,
  174 |   );
  175 |   expect(panelRows).toBeGreaterThan(0);
  176 | 
  177 |   // The panel follows the recitation: the pinned row is the current ayah
  178 |   const pinned = await page.evaluate(() => {
  179 |     const els = [...document.querySelectorAll('[id^="ctx-row-"]')];
  180 |     const vis = els.filter((e) => (e as HTMLElement).getBoundingClientRect().height > 0);
  181 |     return vis.length;
  182 |   });
  183 |   expect(pinned).toBeGreaterThan(0);
  184 | 
  185 |   // Switch to word meanings: empty rows are hidden (surah 1 has meanings)
  186 |   await page.keyboard.press("ArrowDown");
  187 |   await page.waitForTimeout(200);
  188 |   await page.getByText("تفسير", { exact: true }).first().click();
  189 |   await page.waitForTimeout(400);
  190 |   await page.getByText("معاني الكلمات", { exact: true }).click();
  191 |   await page.waitForTimeout(2000);
  192 |   const meaningsRows = await page.evaluate(() =>
  193 |     [...document.querySelectorAll('[id^="ctx-row-"]')].filter((e) => {
  194 |       const el = e as HTMLElement;
  195 |       return el.offsetHeight > 0 && el.innerText.trim().length > 0;
  196 |     }).length,
  197 |   );
  198 |   expect(meaningsRows).toBeGreaterThan(0);
  199 | 
  200 |   // Back to mushaf-only restores the full page
  201 |   await page.keyboard.press("ArrowDown");
  202 |   await page.waitForTimeout(200);
  203 |   await page.getByText("معاني", { exact: true }).first().click();
  204 |   await page.waitForTimeout(400);
  205 |   await page.getByText("صفحة المصحف فقط", { exact: true }).click();
  206 |   await page.waitForTimeout(1500);
  207 |   const splitGone = await page.evaluate(() => ![...document.querySelectorAll('[id^="ctx-row-"]')].length);
  208 |   expect(splitGone).toBe(true);
  209 | });
  210 | 
  211 | 
  212 | test("mushaf styles: every page source loads (SVG, HD, KSU Hafs/Warsh/Tajweed)", async ({ page }) => {
  213 |   await page.goto("/");
  214 |   await expect(page.locator(".qurantv-rec-cell").first()).toBeVisible({ timeout: 20_000 });
  215 |   await page.locator("#search-input").fill("العجمي");
  216 |   await page.keyboard.press("Enter");
  217 |   await page.waitForTimeout(1500);
```