import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const enabled = process.env.COURTLISTENER_E2E_FIXTURE === "1";
const captureScreenshots = process.env.COURTLISTENER_CAPTURE_SCREENSHOTS === "1";
const password = process.env.COURTLISTENER_FIXTURE_PASSWORD || "Fixture review credential! 42";

test.skip(!enabled, "Set COURTLISTENER_E2E_FIXTURE=1 to run deterministic browser acceptance");

const allRoutes: Array<{ path: string; heading: string | RegExp }> = [
  { path: "/", heading: "Find the law. Follow the record." },
  { path: "/research", heading: "Search CourtListener" },
  { path: "/semantic", heading: "Research by legal meaning" },
  { path: "/cases", heading: "Cases & Opinions" },
  { path: "/cases/105221", heading: /BROWN Et Al\./i },
  { path: "/dockets", heading: "PACER / RECAP" },
  { path: "/dockets/67490071", heading: "United States v. Trump" },
  { path: "/documents/recap/7001", heading: "Federal court document" },
  { path: "/citations?opinion=105221", heading: "Citation Network" },
  { path: "/verify", heading: "Citation Verification" },
  { path: "/oral-arguments", heading: "Oral Arguments" },
  { path: "/oral-arguments/106409", heading: "Carpenter v. United States" },
  { path: "/judges", heading: "Judges" },
  { path: "/judges/3045", heading: "Sonia Sotomayor" },
  { path: "/disclosures", heading: "Financial Disclosures" },
  { path: "/disclosures/34207", heading: "Financial Disclosure 34207" },
  { path: "/alerts", heading: "CourtListener Alerts" },
  { path: "/saved", heading: "Saved Research" },
  { path: "/mcp", heading: "MCP Console" },
  { path: "/api-explorer", heading: "CourtListener API Explorer" },
  { path: "/decision-lab", heading: "Jev Decision Lab" },
  { path: "/settings", heading: "Settings & Connections" },
];

const representativeRoutes = allRoutes.filter(({ path }) => ["/", "/cases/105221", "/dockets/67490071", "/decision-lab", "/settings"].includes(path));

test("legal workspaces remain readable and contained across screen sizes", async ({ page, browserName }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Administrator password").fill(password);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.getByRole("heading", { name: "Find the law. Follow the record." })).toBeVisible();

  const scenarios = browserName === "chromium" ? [
    { name: "wide desktop", width: 1920, height: 1080, size: "standard", deep: false },
    { name: "common laptop", width: 1366, height: 768, size: "standard", deep: true },
    { name: "compact laptop", width: 1024, height: 768, size: "large", deep: true },
    { name: "landscape tablet", width: 1280, height: 800, size: "standard", deep: false },
    { name: "desktop navigation edge", width: 1181, height: 800, size: "extra-large", deep: false },
    { name: "drawer navigation edge", width: 1180, height: 800, size: "extra-large", deep: false },
    { name: "portrait tablet", width: 768, height: 1024, size: "large", deep: false },
    { name: "desktop at high zoom", width: 683, height: 384, size: "extra-large", deep: false },
    { name: "phone", width: 390, height: 844, size: "extra-large", deep: true },
    { name: "minimum phone", width: 320, height: 568, size: "standard", deep: false },
  ] : [
    { name: "common laptop", width: 1366, height: 768, size: "standard", deep: false },
    { name: "compact laptop", width: 1024, height: 768, size: "large", deep: false },
    { name: "phone", width: 390, height: 844, size: "extra-large", deep: false },
  ];

  for (const scenario of scenarios) {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.evaluate((size) => window.localStorage.setItem("courtlistenerdash-reading-size", size), scenario.size);
    for (const route of scenario.deep ? allRoutes : representativeRoutes) {
      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      const heading = typeof route.heading === "string"
        ? page.getByRole("heading", { name: route.heading, exact: true })
        : page.getByRole("heading", { name: route.heading });
      await expect(heading.first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expect(page.locator("html")).toHaveAttribute("data-reading-size", scenario.size);
      const geometry = await page.evaluate(() => {
        const shell = document.querySelector<HTMLElement>(".app-shell")!;
        const main = document.querySelector<HTMLElement>(".main-column")!;
        const topbar = document.querySelector<HTMLElement>(".topbar")!;
        const content = document.querySelector<HTMLElement>(".content")!;
        const rect = (element: HTMLElement) => {
          const bounds = element.getBoundingClientRect();
          return { top: bounds.top, right: bounds.right, bottom: bounds.bottom, left: bounds.left, width: bounds.width, height: bounds.height };
        };
        const controls = [...topbar.children]
          .filter((element): element is HTMLElement => element instanceof HTMLElement && getComputedStyle(element).display !== "none")
          .map((element) => ({ label: element.className, ...rect(element) }));
        const overlaps: string[] = [];
        for (let left = 0; left < controls.length; left += 1) {
          for (let right = left + 1; right < controls.length; right += 1) {
            const a = controls[left];
            const b = controls[right];
            const horizontal = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const vertical = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (horizontal > 1 && vertical > 1) overlaps.push(`${a.label} overlaps ${b.label}`);
          }
        }
        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
          shell: rect(shell),
          main: rect(main),
          topbar: rect(topbar),
          content: { ...rect(content), scrollWidth: content.scrollWidth, clientWidth: content.clientWidth, overflowY: getComputedStyle(content).overflowY },
          overlaps,
        };
      });
      const context = `${browserName} ${scenario.name} ${scenario.size} ${route.path}`;
      expect(geometry.document.width, `${context} must not create document-level horizontal scrolling`).toBeLessThanOrEqual(geometry.viewport.width + 1);
      expect(geometry.document.height, `${context} must keep the application shell inside the viewport`).toBeLessThanOrEqual(geometry.viewport.height + 1);
      expect(geometry.shell.height, `${context} shell height`).toBeLessThanOrEqual(geometry.viewport.height + 1);
      expect(geometry.main.bottom, `${context} main pane bottom`).toBeLessThanOrEqual(geometry.viewport.height + 1);
      expect(geometry.topbar.right, `${context} header right edge`).toBeLessThanOrEqual(geometry.viewport.width + 1);
      expect(geometry.content.scrollWidth, `${context} research pane must not hide horizontal content`).toBeLessThanOrEqual(geometry.content.clientWidth + 2);
      expect(geometry.content.overflowY, `${context} should scroll only inside the research pane`).toBe("auto");
      expect(geometry.overlaps, `${context} header controls must not overlap`).toEqual([]);
      if (browserName === "chromium" && scenario.name === "common laptop") {
        const routeAudit = await new AxeBuilder({ page }).setLegacyMode(true).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
        expect(routeAudit.violations.filter((item) => ["serious", "critical"].includes(item.impact || "")), `${context} accessibility audit`).toEqual([]);
      }
    }
  }

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Find the law. Follow the record." })).toBeVisible();
  await page.locator(".content").evaluate((element) => { element.scrollTop = 500; });
  await expect.poll(() => page.locator(".content").evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.getByRole("link", { name: "Legal Research", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Search CourtListener" })).toBeVisible();
  await expect.poll(() => page.locator(".content").evaluate((element) => element.scrollTop)).toBe(0);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.localStorage.setItem("courtlistenerdash-reading-size", "standard"));
  await page.goto("/cases/105221", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /BROWN Et Al\./i })).toBeVisible();
  await expect(page.locator(".case-context dd")).toBeVisible();
  const legalReadingSizes = await page.evaluate(() => {
    const size = (selector: string) => Number.parseFloat(getComputedStyle(document.querySelector(selector)!).fontSize);
    return { metadata: size(".case-facts dt"), supporting: size(".case-context dd") };
  });
  expect(legalReadingSizes.metadata).toBeGreaterThanOrEqual(13);
  expect(legalReadingSizes.supporting).toBeGreaterThanOrEqual(14);
  await page.getByRole("button", { name: "Opinion 1", exact: true }).click();
  const opinionSize = await page.locator(".opinion-body").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(opinionSize).toBeGreaterThanOrEqual(17);

  await page.getByLabel("Text size").selectOption("extra-large");
  await expect(page.locator("html")).toHaveAttribute("data-reading-size", "extra-large");
  expect(await page.locator("html").evaluate((element) => getComputedStyle(element).fontSize)).toBe("20px");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Text size")).toHaveValue("extra-large");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/cases/105221", { waitUntil: "domcontentloaded" });
  const enlargedPhoneWidth = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  expect(enlargedPhoneWidth.document).toBeLessThanOrEqual(enlargedPhoneWidth.viewport + 1);
  await expect(page.getByLabel("Text size")).toBeVisible();
  const audit = await new AxeBuilder({ page }).setLegacyMode(true).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(audit.violations.filter((item) => ["serious", "critical"].includes(item.impact || ""))).toEqual([]);
  if (captureScreenshots && browserName === "chromium") await page.screenshot({ path: "docs/images/accessible-case-workspace-phone.png", fullPage: false, animations: "disabled" });
});
