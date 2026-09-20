import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const enabled = process.env.COURTLISTENER_E2E_FIXTURE === "1";
const captureScreenshots = process.env.COURTLISTENER_CAPTURE_SCREENSHOTS === "1";
const password = process.env.COURTLISTENER_FIXTURE_PASSWORD || "Fixture review credential! 42";

test.skip(!enabled, "Set COURTLISTENER_E2E_FIXTURE=1 to run deterministic browser acceptance");
test.describe.configure({ mode: "serial" });

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Administrator password").fill(password);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.getByRole("heading", { name: "Find the law. Follow the record." })).toBeVisible();
}

async function expectAccessible(page: Page) {
  const audit = await new AxeBuilder({ page }).setLegacyMode(true).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(audit.violations.filter((item) => ["serious", "critical"].includes(item.impact || ""))).toEqual([]);
}

async function capture(page: Page, name: string) {
  if (captureScreenshots) await page.screenshot({ path: `docs/images/${name}.png`, fullPage: true, animations: "disabled" });
}

test("research moves from a question to a grounded case and saved authority", async ({ page }) => {
  await signIn(page);
  await expect(page.getByText("189 of 250 left / day")).toBeVisible();
  await expectAccessible(page);
  await capture(page, "dashboard-overview");

  await page.getByLabel("Global CourtListener search").fill("Carpenter location records");
  await page.getByLabel("Global CourtListener search").press("Enter");
  await expect(page).toHaveURL(/\/research\?mode=global/);
  await expect(page.getByRole("button", { name: /Case law 1/ })).toBeVisible();

  await page.getByRole("link", { name: "Cases & Opinions" }).click();
  await expect(page.getByLabel("Collection")).toHaveCount(0);
  await expect(page.getByText("Case law", { exact: true }).first()).toBeVisible();
  await page.getByLabel("Exact citation").fill("347 U.S. 483");
  await page.getByRole("combobox", { name: "Court / jurisdiction" }).selectOption("scotus");
  await page.locator(".research-form").getByRole("button", { name: /^Search$/ }).click();
  const brown = page.locator(".result-card").filter({ hasText: "347 U.S. 483" });
  await expect(brown).toContainText("BOARD OF EDUCATION OF TOPEKA");
  await capture(page, "case-search-results");
  await brown.getByRole("button", { name: "Save research" }).click();
  await expect(page.getByText(/Saved “Brown v\. Board/i)).toBeVisible();
  await brown.getByRole("link", { name: "Open workspace" }).click();
  await expect(page.getByRole("heading", { name: /BROWN Et Al\./i })).toBeVisible();
  await expect(page.locator(".case-citation")).toHaveText("347 U.S. 483");
  await capture(page, "case-research-workspace");

  await page.getByRole("button", { name: "Opinion 1", exact: true }).click();
  await expect(page.getByText("Separate educational facilities are inherently unequal.")).toBeVisible();
  await page.getByPlaceholder("Find language in this opinion").fill("separate educational facilities");
  await page.getByRole("button", { name: "Find", exact: true }).click();
  await expect(page.getByText(/Matches for/)).toBeVisible();
  await page.getByRole("button", { name: "Authorities Cited" }).click();
  await expect(page.getByText("Cited authority")).toBeVisible();
  await page.getByRole("button", { name: "Parties" }).click();
  await expect(page.getByText("United States of America")).toBeVisible();

  await page.goto("/research");
  await expect(page.getByLabel("Collection")).toBeVisible();
  await page.getByPlaceholder("Enter names, issues, citations, parties, or docket terms…").fill("pagination fixture");
  await page.locator(".research-form").getByRole("button", { name: /^Search$/ }).click();
  await expect(page.locator(".result-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Load more CourtListener results" }).click();
  await expect(page.getByText("Bolling v. Sharpe")).toBeVisible();

  await page.goto("/semantic");
  await page.getByRole("button", { name: /Similar facts/ }).click();
  await page.getByPlaceholder("Describe the legal issue in natural language…").fill("school segregation and equal protection");
  await page.getByRole("button", { name: "Run semantic search" }).click();
  await expect(page.getByText("Search intent")).toBeVisible();
  await expect(page.getByText("CourtListener opinions only")).toBeVisible();

  await page.getByRole("link", { name: "Saved Research" }).click();
  const saved = page.locator(".saved-grid article").filter({ hasText: "Brown v. Board" });
  await expect(saved).toBeVisible({ timeout: 30_000 });
  await saved.getByRole("button", { name: /Remove .* from saved research/ }).click();
  await expect(page.getByRole("heading", { name: "No saved research" })).toBeVisible();
});

test("RECAP, oral argument, judge, and disclosure records remain usable", async ({ page }) => {
  await signIn(page);
  await page.goto("/dockets/67490071");
  await expect(page.getByRole("heading", { name: "United States v. Trump" })).toBeVisible();
  await expect(page.locator(".workspace-summary").getByText("FLSD", { exact: true })).toBeVisible();
  await expect(page.getByText(/api\/rest\/v4\/courts\/flsd/)).toHaveCount(0);
  await expect(page.getByText("undefined", { exact: true })).toHaveCount(0);
  await capture(page, "recap-docket-overview");
  await page.getByRole("button", { name: "Docket Timeline" }).click();
  await expect(page.getByText("Indictment filed")).toBeVisible();
  await capture(page, "recap-docket-timeline");
  await page.getByRole("button", { name: "RECAP Documents" }).click();
  await expect(page.getByText("Available in RECAP")).toBeVisible();
  await page.getByRole("button", { name: "Parties" }).click();
  await expect(page.getByText("Donald J. Trump")).toBeVisible();
  await page.getByRole("button", { name: "Attorneys" }).click();
  await expect(page.getByText("Fixture counsel")).toBeVisible();
  await page.getByRole("button", { name: "Oral Arguments" }).click();
  await expect(page.getByRole("heading", { name: "Carpenter v. United States" })).toBeVisible();

  await page.goto("/documents/recap/7001");
  await expect(page.getByText("Separate educational facilities are inherently unequal.")).toBeVisible();
  await page.getByPlaceholder("Search within this document…").fill("separate educational facilities");
  await page.getByRole("button", { name: "Find text" }).click();
  await expect(page.getByText("Document-search matches")).toBeVisible();

  await page.goto("/oral-arguments/106409");
  await expect(page.getByRole("heading", { name: "Listen to the argument" })).toBeVisible();
  await expect(page.locator("audio")).toHaveAttribute("src", "https://storage.courtlistener.com/audio/fixture/carpenter.mp3");
  await page.getByPlaceholder("Find words in this transcript").fill("Fourth Amendment");
  await expect(page.getByText("1 matching transcript section")).toBeVisible();
  await capture(page, "oral-argument-workspace");

  await page.goto("/judges/3045");
  await expect(page.getByRole("heading", { name: "Sonia Sotomayor" })).toBeVisible();
  await capture(page, "judge-profile");
  await page.getByRole("button", { name: "Appointments" }).click();
  await expect(page.getByText("Supreme Court of the United States")).toBeVisible();
  await page.getByRole("button", { name: "Education" }).click();
  await expect(page.getByText("Yale Law School")).toBeVisible();
  await page.getByRole("button", { name: "Affiliations" }).click();
  await expect(page.getByText("No records returned.")).toBeVisible();
  await page.getByRole("button", { name: "Financial Disclosures" }).click();
  await expect(page.getByText("Financial disclosure 34207")).toBeVisible();

  await page.goto("/disclosures/34207");
  await expect(page.getByRole("heading", { name: "Financial Disclosure 34207" })).toBeVisible();
  await page.getByRole("button", { name: "investments" }).click();
  await expect(page.getByText("Publicly reported investment")).toBeVisible();
  await page.getByRole("button", { name: "debts" }).click();
  await expect(page.getByText(/no debts for this report/i)).toBeVisible();
  await page.getByRole("button", { name: "investments" }).click();
  await capture(page, "financial-disclosure-workspace");
  await expectAccessible(page);
});

test("citation, alert, MCP, and API developer workflows are traceable", async ({ page }) => {
  await signIn(page);
  await page.goto("/verify");
  await page.getByLabel("Citation or citation-containing text").fill("Brown v. Board of Education, 347 U.S. 483 (1954)");
  await page.getByRole("button", { name: "Verify with CourtListener" }).click();
  await expect(page.locator(".verification-status").getByText("Verified authority", { exact: true })).toBeVisible();
  await expect(page.getByText("347 U.S. 483", { exact: true }).last()).toBeVisible();
  await expect(page.getByRole("link", { name: "Open full case" })).toHaveAttribute("href", "/cases/105221");
  await capture(page, "citation-verification");

  await page.getByLabel("Citation or citation-containing text").fill("fixture all verification states");
  await page.getByRole("button", { name: "Verify with CourtListener" }).click();
  await expect(page.getByText("Ambiguous result", { exact: true })).toBeVisible();
  await expect(page.getByText("Not located / unresolved", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Potential citation mismatch", { exact: true })).toBeVisible();
  await expect(page.getByText("Verification pending", { exact: true })).toBeVisible();
  await expect(page.locator(".verification-candidates li").filter({ hasText: "Example One" })).toBeVisible();
  await expect(page.getByText("IdCitation could not be linked to a full authority.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue pending citations" }).click();
  await expect(page.getByText("Carpenter v. United States", { exact: true })).toBeVisible();

  await page.goto("/citations?opinion=105221");
  await page.getByRole("button", { name: "Build network" }).click();
  await expect(page.getByRole("img", { name: "Citation relationship graph" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Read opinion" })).toHaveCount(2);

  await page.goto("/alerts");
  await expect(page.getByText("Qualified immunity developments")).toBeVisible();
  await page.getByLabel("Alert name").fill("Fixture alert review");
  await page.getByLabel("Search query").fill("fixture monitoring query");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Review and create" }).click();
  const created = page.locator(".alert-list article").filter({ hasText: "Fixture alert review" });
  await expect(created).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await created.getByRole("button", { name: "Delete alert" }).click();
  await expect(created).toHaveCount(0);

  await page.goto("/mcp");
  await expect(page.getByRole("heading", { name: "19 tools" })).toBeVisible();
  await expect(page.getByText("get_api_usage", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Run tool" }).click();
  await expect(page.getByRole("heading", { name: "Response" })).toBeVisible();
  await page.getByLabel("Arguments (JSON)").fill("{");
  await page.getByRole("button", { name: "Run tool" }).click();
  await expect(page.locator(".console-main .inline-error")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Response" })).toHaveCount(0);

  await page.goto("/api-explorer");
  await page.getByRole("button", { name: "Load schema" }).click();
  await expect(page.getByRole("button", { name: "Hide raw JSON" })).toBeVisible();
  await page.getByRole("button", { name: "Execute read-only request" }).click();
  await expect(page.getByText("200 via MCP")).toBeVisible();
  await page.getByLabel("Filters (JSON)").fill("{");
  await page.getByRole("button", { name: "Execute read-only request" }).click();
  await expect(page.locator(".api-columns .inline-error")).toBeVisible();
  await expect(page.getByText("200 via MCP")).toHaveCount(0);
});

test("all top-level routes and mobile navigation remain reachable", async ({ page }) => {
  await signIn(page);
  const routes: Array<[string, string]> = [
    ["/research", "Search CourtListener"],
    ["/semantic", "Research by legal meaning"],
    ["/cases", "Cases & Opinions"],
    ["/dockets", "PACER / RECAP"],
    ["/citations", "Citation Network"],
    ["/verify", "Citation Verification"],
    ["/oral-arguments", "Oral Arguments"],
    ["/judges", "Judges"],
    ["/disclosures", "Financial Disclosures"],
    ["/alerts", "CourtListener Alerts"],
    ["/saved", "Saved Research"],
    ["/mcp", "MCP Console"],
    ["/api-explorer", "CourtListener API Explorer"],
    ["/settings", "Settings & Connections"],
  ];
  for (const [route, heading] of routes) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".mobile-menu").click();
  await expect(page.getByRole("link", { name: "Legal Research" })).toBeVisible();
  await expectAccessible(page);
});

test("secondary controls fail safely and administrative settings remain isolated", async ({ page }) => {
  test.setTimeout(45_000);
  await signIn(page);

  await page.route("**/api/search/unified", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "CourtListener is temporarily unavailable. Please try again shortly." }) });
  });
  await page.goto("/research?mode=global&q=fixture%20recovery");
  await expect(page.getByText("CourtListener is temporarily unavailable. Please try again shortly.")).toBeVisible();
  await page.unroute("**/api/search/unified");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: /Case law 1/ })).toBeVisible();

  await page.goto("/cases");
  await page.getByLabel("Exact citation").fill("347 U.S. 483");
  await page.locator(".research-form").getByRole("button", { name: /^Search$/ }).click();
  await page.route("**/api/saved", async (route) => {
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Fixture storage unavailable" }) });
  });
  await page.locator(".result-card").getByRole("button", { name: "Save research" }).click();
  await expect(page.getByText("Fixture storage unavailable", { exact: true })).toBeVisible();
  await page.unroute("**/api/saved");

  await page.goto("/settings");
  const token = page.getByLabel("CourtListener API token");
  await expect(token).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show CourtListener token" }).click();
  await expect(token).toHaveAttribute("type", "text");
  await token.fill("fixture-rotated-token-not-real");
  await page.getByRole("button", { name: "Validate and rotate token" }).click();
  await expect(page.getByText(/CourtListener connected; 19 MCP tools discovered/)).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove credential" }).click();
  await expect(page.getByText("CourtListener credential removed", { exact: true })).toBeVisible();

  await page.route("**/api/connections/legal-ai/models", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "ollama",
        baseUrl: "https://ollama.com",
        fetchedAt: new Date().toISOString(),
        models: [
          { name: "gemma4:31b", displayName: "gemma4:31b", source: "cloud", size: null, family: "gemma", parameterSize: "31B", modifiedAt: null },
          { name: "gpt-oss:120b", displayName: "gpt-oss:120b", source: "cloud", size: null, family: "gptoss", parameterSize: "116.8B", modifiedAt: null },
        ],
      }),
    });
  });
  await expect(page.getByLabel("Ollama connection")).toHaveValue("cloud");
  await page.getByLabel("Ollama Cloud API key").fill("fixture-ollama-cloud-key-not-real");
  await page.getByRole("button", { name: "Load models" }).click();
  await expect(page.getByText(/2 models available · 2 cloud/)).toBeVisible();
  await page.getByLabel("Available model").selectOption("gpt-oss:120b");
  await expect(page.getByLabel("Available model")).toHaveValue("gpt-oss:120b");
  await page.unroute("**/api/connections/legal-ai/models");

  await page.getByLabel("Provider").selectOption("openai");
  await page.getByLabel("Backend endpoint").fill("http://example.com/v1");
  await page.getByLabel("API key", { exact: true }).fill("fixture-provider-key-not-real");
  await page.locator(".ai-config-form").getByRole("button", { name: "Validate and connect" }).click();
  await expect(page.getByText(/AI endpoint must use HTTPS/)).toBeVisible();

  const nextPassword = "Replacement fixture credential! 73";
  await page.getByLabel("Current password").fill(password);
  await page.getByLabel("New password", { exact: true }).fill(nextPassword);
  await page.getByLabel("Confirm new password").fill(nextPassword);
  await expect(page.getByText("Passwords match", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText(/Dashboard password changed/)).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Administrator password").fill(nextPassword);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.getByRole("heading", { name: "Settings & Connections" })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Find the law. Follow the record." })).toBeVisible();
});
