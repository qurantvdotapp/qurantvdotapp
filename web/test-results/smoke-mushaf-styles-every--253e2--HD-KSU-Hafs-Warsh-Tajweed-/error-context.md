# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> mushaf styles: every page source loads (SVG, HD, KSU Hafs/Warsh/Tajweed)
- Location: tests/e2e/smoke.spec.ts:212:1

# Error details

```
Error: page.waitForTimeout: Target page, context or browser has been closed
```

# Test source

```ts
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
  218 |   const chooser = page.locator(".dialog-row").first();
  219 |   if (await chooser.isVisible().catch(() => false)) {
  220 |     await page.keyboard.press("Enter");
  221 |     await page.waitForTimeout(1500);
  222 |   }
  223 |   await expect(page.locator("[data-focus-id='grid-jump']")).toBeVisible({ timeout: 20_000 });
  224 |   await page.locator("[data-focus-id='surah-1']").click();
  225 |   await expect(page.locator("[data-focus-id='player-back']")).toBeVisible({ timeout: 20_000 });
  226 |   // let the audio pass the basmala so a page is shown
  227 |   await expect(page.locator(PAGE_IMG).first()).toBeVisible({ timeout: 40_000 });
  228 | 
  229 |   const openPickerAndPick = async (label: string) => {
  230 |     await page.keyboard.press("ArrowDown");
  231 |     await page.waitForTimeout(200);
  232 |     await page.locator(".icon-btn").last().click(); // mushaf style button
> 233 |     await page.waitForTimeout(500);
      |                ^ Error: page.waitForTimeout: Target page, context or browser has been closed
  234 |     await page.getByText(label, { exact: true }).click();
  235 |     await page.waitForTimeout(2000);
  236 |   };
  237 | 
  238 |   // KSU Hafs (آيات حفص → safahat1 PNG)
  239 |   await openPickerAndPick("آيات حفص");
  240 |   await expect(page.locator('img[src*="safahat1"]').first()).toBeVisible({ timeout: 40_000 });
  241 | 
  242 |   // KSU Warsh
  243 |   await openPickerAndPick("آيات ورش");
  244 |   await expect(page.locator('img[src*="/warsh/"]').first()).toBeVisible({ timeout: 40_000 });
  245 | 
  246 |   // KSU Tajweed (حفص ملون — the default)
  247 |   await openPickerAndPick("حفص ملون");
  248 |   await expect(page.locator('img[src*="tajweed_png"]').first()).toBeVisible({ timeout: 40_000 });
  249 | 
  250 |   // Madinah SVG
  251 |   await openPickerAndPick("المدينة");
  252 |   await expect(page.locator('img[src*="quran_pages_svg"]').first()).toBeVisible({ timeout: 40_000 });
  253 | 
  254 |   // Madinah HD (islamic.app)
  255 |   await openPickerAndPick("المدينة HD");
  256 |   await expect(page.locator('img[src*="islamic.app"]').first()).toBeVisible({ timeout: 40_000 });
  257 | 
  258 |   // back to the default style and text mode toggle still works
  259 |   await openPickerAndPick("حفص ملون");
  260 |   await expect(page.locator('img[src*="tajweed_png"]').first()).toBeVisible({ timeout: 40_000 });
  261 | });
  262 | 
  263 | test("english reciter-search + favourite reciters", async ({ page }) => {
  264 |   await page.goto("/");
  265 |   await expect(page.locator(".qurantv-rec-cell").first()).toBeVisible({ timeout: 20_000 });
  266 |   // Search an ENGLISH name — should match by transliteration
  267 |   await page.locator("#search-input").fill("maher");
  268 |   await page.waitForTimeout(600);
  269 |   const maherRows = await page.locator(".dialog-row").filter({ hasText: "المعيقلي" }).count();
  270 |   expect(maherRows).toBeGreaterThanOrEqual(1);
  271 |   // The query is still "maher" — Enter opens the first match's moshaf chooser.
  272 |   await page.keyboard.press("Enter");
  273 |   await page.waitForTimeout(1200);
  274 |   const hasChooser = await page.locator("[id^='mc-']").first().isVisible().catch(() => false);
  275 |   if (hasChooser) await page.locator("[id^='mc-']").first().click();
  276 |   await page.waitForTimeout(1200);
  277 |   await page.waitForSelector("#grid-fav", { timeout: 20_000 });
  278 |   await page.locator("#grid-fav").click();
  279 |   await page.waitForTimeout(300);
  280 |   const favActive = await page.evaluate(() => document.querySelector("#grid-fav")?.getAttribute("class") ?? "");
  281 |   expect(favActive).toContain("active");
  282 | 
  283 |   // Back to Home: the Favourites row now appears
  284 |   await page.keyboard.press("Escape");
  285 |   await page.waitForTimeout(400);
  286 |   await expect(page.getByText("القراء", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  287 |   await expect(page.locator("#favourites-row")).toBeVisible({ timeout: 10_000 });
  288 | 
  289 |   // Persistence: reload and re-check the favourite survived
  290 |   await page.reload();
  291 |   await page.waitForSelector(".qurantv-rec-cell", { timeout: 20_000 });
  292 |   await expect(page.locator("#favourites-row")).toBeVisible({ timeout: 10_000 });
  293 | });
  294 | 
```