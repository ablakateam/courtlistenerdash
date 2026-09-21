import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const enabled = process.env.COURTLISTENER_E2E_FIXTURE === "1";
const captureScreenshots = process.env.COURTLISTENER_CAPTURE_SCREENSHOTS === "1";
const password = process.env.COURTLISTENER_FIXTURE_PASSWORD || "Fixture review credential! 42";

test.skip(!enabled, "Set COURTLISTENER_E2E_FIXTURE=1 to run deterministic browser acceptance");

test("legal workspaces remain readable and contained across screen sizes", async ({ page, browserName }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Administrator password").fill(password);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.getByRole("heading", { name: "Find the law. Follow the record." })).toBeVisible();

  const viewports = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "laptop", width: 1024, height: 768 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "phone", width: 390, height: 844 },
  ];
  const routes = ["/", "/cases/105221", "/dockets/67490071", "/decision-lab", "/settings"];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("main")).toBeVisible();
      const pageWidth = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        offenders: [...document.querySelectorAll<HTMLElement>("body *")]
          .map((element) => {
            const bounds = element.getBoundingClientRect();
            return { tag: element.tagName, className: element.className?.toString().slice(0, 80), right: Math.round(bounds.right), width: Math.round(bounds.width) };
          })
          .filter((element) => element.right > window.innerWidth + 1)
          .slice(0, 8),
      }));
      expect(pageWidth.document, `${browserName} ${viewport.name} ${route} should not create page-level horizontal scrolling; offenders: ${JSON.stringify(pageWidth.offenders)}`).toBeLessThanOrEqual(pageWidth.viewport + 1);
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
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
  if (captureScreenshots && browserName === "chromium") await page.screenshot({ path: "docs/images/accessible-case-workspace-phone.png", fullPage: true, animations: "disabled" });
});
