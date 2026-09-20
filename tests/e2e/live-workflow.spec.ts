import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const enabled = process.env.COURTLISTENER_E2E_LIVE === "1";
const password = process.env.COURTLISTENER_REVIEW_PASSWORD || "";
const upstreamPause = Math.max(0, Number(process.env.COURTLISTENER_E2E_INTERVAL_MS) || 6_500);

async function pauseForAccountLimit(page: Page) {
  await page.waitForTimeout(upstreamPause);
}

async function capture(page: Page, name: string) {
  await page.screenshot({ path: `docs/images/${name}.png`, fullPage: true, animations: "disabled" });
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(audit.violations.filter((item) => ["serious", "critical"].includes(item.impact || ""))).toEqual([]);
}

test.skip(!enabled, "Set COURTLISTENER_E2E_LIVE=1 to run the live, rate-aware browser workflow");

test("known-record attorney workflow and documentation screenshots", async ({ page }) => {
  test.skip(password.length < 16, "COURTLISTENER_REVIEW_PASSWORD is required");

  await page.goto("/");
  await page.getByLabel("Administrator password").fill(password);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.getByRole("heading", { name: "Find the law. Follow the record." })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
  await capture(page, "dashboard-overview");

  await page.getByRole("link", { name: "Cases & Opinions" }).click();
  await page.getByLabel("Exact citation").fill("347 U.S. 483");
  await page.getByRole("combobox", { name: "Court / jurisdiction" }).selectOption("scotus");
  await page.getByRole("button", { name: /^Search$/ }).click();
  await expect(page.getByText("CourtListener authorities")).toBeVisible();
  const exactCase = page.locator(".result-card").filter({ hasText: "347 U.S. 483" }).first();
  await expect(exactCase).toContainText(/BOARD OF EDUCATION OF TOPEKA/i);
  await capture(page, "case-search-results");

  await pauseForAccountLimit(page);
  await exactCase.getByRole("link", { name: "Open workspace" }).click();
  await expect(page.getByRole("heading", { name: "Case analysis" })).toBeVisible();
  await capture(page, "case-research-workspace");

  await pauseForAccountLimit(page);
  await page.goto("/dockets/67490071");
  await expect(page.getByRole("heading", { name: "United States v. Trump" })).toBeVisible();
  await capture(page, "recap-docket-overview");

  await pauseForAccountLimit(page);
  await page.getByRole("button", { name: "Docket Timeline" }).click();
  await expect(page.locator(".timeline article").first()).toBeVisible();
  await capture(page, "recap-docket-timeline");

  await pauseForAccountLimit(page);
  await page.getByRole("button", { name: "RECAP Documents" }).click();
  await expect(page.locator(".document-grid article").first()).toBeVisible();
  await capture(page, "recap-documents");

  await pauseForAccountLimit(page);
  await page.goto("/oral-arguments/106409");
  await expect(page.getByRole("heading", { name: "Listen to the argument" })).toBeVisible();
  await expect(page.locator("audio")).toHaveAttribute("src", /^https:\/\/storage\.courtlistener\.com\//);
  await capture(page, "oral-argument-audio-transcript");

  await pauseForAccountLimit(page);
  await page.goto("/judges/3045");
  await expect(page.getByRole("heading", { name: /Sonia Sotomayor/i })).toBeVisible();
  await capture(page, "judge-profile");

  await pauseForAccountLimit(page);
  await page.getByRole("button", { name: "Appointments" }).click();
  await expect(page.locator(".table-wrap tbody tr").first()).toBeVisible();

  await pauseForAccountLimit(page);
  await page.goto("/disclosures/34207");
  await expect(page.getByRole("heading", { name: "Financial Disclosure 34207" })).toBeVisible();
  await page.getByRole("button", { name: "investments" }).click();
  await expect(page.locator(".table-wrap tbody tr").first()).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
  await capture(page, "financial-disclosure-investments");

  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, "financial-disclosure-mobile");
});
