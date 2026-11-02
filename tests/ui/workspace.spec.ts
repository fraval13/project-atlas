import { test, expect } from "@playwright/test";
test("theme preview filters projects and shows the orange expiry countdown", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your projects, in focus." }),
  ).toBeVisible();
  await expect(page.locator(".project-card")).toHaveCount(6);
  await expect(page.locator(".expiry-badge").first()).toContainText(
    "remaining",
  );
  await page.screenshot({ path: "docs/overview.png", fullPage: true });
  await page
    .getByRole("combobox", { name: "Filter by website status" })
    .selectOption("Offline");
  await expect(page.locator(".project-card")).toHaveCount(1);
  await expect(page.locator(".project-title")).toContainText(
    "Developer platform",
  );
  await page
    .getByRole("combobox", { name: "Filter by website status" })
    .selectOption("All statuses");
  await page.getByRole("textbox", { name: "Find a project" }).fill("helix");
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.locator(".project-title").click();
  await expect(page.getByRole("dialog")).toContainText(
    "Every 30 days (your estimate)",
  );
  await expect(page.getByRole("dialog")).toContainText(
    "7 days before expiration",
  );
  await page.screenshot({ path: "docs/project-details.png", fullPage: true });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("website-only projects hide repository actions and auth controls", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Find a project" }).fill("Booking");
  await page.locator(".project-title").click();
  await expect(
    page.getByRole("button", { name: "Open website" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open repository" }),
  ).toHaveCount(0);
  await expect(page.getByText("Authentication & reauthentication")).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Edit project & monitoring" }).click();
  await expect(page.getByText("Watch repository activity")).toHaveCount(0);
  await expect(page.getByText("Authorization reminders")).toHaveCount(0);
});
test("disconnected projects retain historical activity and hide authenticated links", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Find a project" })
    .fill("Design system");
  await expect(page.locator(".activity-item")).toContainText("Saved history");
  await page.locator(".project-title").click();
  await expect(page.getByRole("dialog")).toContainText(
    "Your saved history remains available",
  );
  await expect(
    page.getByRole("button", { name: "Open repository" }),
  ).toHaveCount(0);
});
test("add project form sends website-only notes and watch preferences to the desktop bridge", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const initial = { version: 1, projects: [], updatedAt: null };
    (window as any).atlas = {
      state: async () => initial,
      saveProject: async (p: any) => {
        (window as any).savedProject = p;
        return {
          ...initial,
          projects: [
            {
              ...p,
              id: "new-project",
              status: "unknown",
              access: "disconnected",
              prs: [],
              events: [],
            },
          ],
        };
      },
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  await page.getByLabel("Project name").fill("My consulting project");
  await page.getByLabel("Website URL").fill("https://example.com");
  await page
    .getByLabel("Your contribution")
    .fill("Designed and delivered a new booking flow.");
  await page.getByLabel("Technologies").fill("React, TypeScript");
  await page.getByRole("button", { name: "Save project" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".project-card")).toContainText(
    "My consulting project",
  );
  const saved = await page.evaluate(() => (window as any).savedProject);
  expect(saved.repo).toBe("");
  expect(saved.watchSite).toBe(true);
  expect(saved.notes).toContain("booking flow");
});

test("security overview shows rated local matches and supports all requested CMS presets", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Security", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Local vulnerability watch" }),
  ).toBeVisible();
  await expect(
    page.getByText("SAMPLE-ADVISORY", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".severity-high")).toContainText("7.5");
  await page
    .getByRole("combobox", { name: "Filter vulnerability severity" })
    .selectOption("critical");
  await expect(page.locator(".finding-row")).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Filter vulnerability severity" })
    .selectOption("all");
  await page.screenshot({ path: "docs/security.png", fullPage: true });
  await page.getByRole("button", { name: "Manage inventory" }).first().click();
  for (const name of [
    "WordPress",
    "Shopify",
    "Wix",
    "Squarespace",
    "Joomla",
    "Drupal",
    "Sanity",
  ])
    await expect(
      page.getByRole("button", { name: name + " +", exact: true }),
    ).toBeVisible();
  await page.getByRole("button", { name: "Sanity +", exact: true }).click();
  await expect(page.getByLabel("Versioned inventory")).toHaveValue(
    /npm \| @sanity\/client \| \?/,
  );
  await page.getByRole("button", { name: "Drupal +", exact: true }).click();
  await expect(page.getByLabel("Versioned inventory")).toHaveValue(
    /composer \| drupal\/core \| \?/,
  );
});

test("startup checks list missing capabilities and refresh after repair", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let calls = 0;
    (window as any).atlas = {
      state: async () => ({ version: 1, projects: [], updatedAt: null }),
      systemCheck: async () => ({
        checkedAt: new Date().toISOString(),
        checks: [
          {
            id: "storage",
            name: "Local workspace storage",
            required: true,
            status: ++calls === 1 ? "missing" : "ready",
            detail:
              calls === 1
                ? "Cannot write to the workspace."
                : "Read/write access verified.",
            remedy: "Restore read/write permissions, then check again.",
          },
          {
            id: "git",
            name: "Git CLI",
            required: false,
            status: "missing",
            detail:
              "Optional: GitHub connections use the API and do not require Git.",
            remedy: "Install Git for local tooling.",
          },
        ],
      }),
    };
  });
  await page.goto("/");
  const checks = page.getByRole("region", { name: "Startup requirements" });
  await expect(checks).toContainText("1 startup requirement");
  await expect(checks).toContainText("Restore read/write permissions");
  await expect(checks).toContainText("do not require Git");
  await checks
    .getByRole("button", { name: "Check again", exact: true })
    .click();
  await expect(checks).toContainText("Ready to use · 1 optional");
  await expect(checks).toContainText("Read/write access verified.");
  await page.screenshot({ path: "docs/startup-checks.png", fullPage: true });
});

test("all four themes preserve the workspace and remember an explicit selection", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "default");
  await page.getByRole("button", { name: "Settings & connections" }).click();
  for (const [name, id] of [
    ["Hacker", "hacker"],
    ["Elegant", "elegant"],
    ["Retro", "retro"],
    ["Atlas", "default"],
  ]) {
    await page
      .getByRole("button", { name: new RegExp(name) })
      .filter({ has: page.locator(".theme-option-title") })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", id);
    await expect(page.locator(".theme-selected")).toContainText(name);
    await page.getByRole("button", { name: "Close dialog" }).click();
    await expect(page.locator(".project-card")).toHaveCount(6);
    await page.screenshot({ path: `docs/theme-${id}.png`, fullPage: true });
    await page.getByRole("button", { name: "Settings & connections" }).click();
  }
  await page
    .getByRole("button", { name: /Retro/ })
    .filter({ has: page.locator(".theme-option-title") })
    .click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "retro");
});

test("Mac defaults to Elegant and a saved choice overrides the platform default", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" }),
  );
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "elegant");
  await page.getByRole("button", { name: "Settings & connections" }).click();
  await page
    .getByRole("button", { name: /Hacker/ })
    .filter({ has: page.locator(".theme-option-title") })
    .click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "hacker");
});

test("update banner downloads only after a click and restarts only after confirmation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let current = {
      phase: "available",
      currentVersion: "0.1.0",
      availableVersion: "0.1.1-main.42",
      percent: 0,
      downloaded: false,
      error: "",
      channel: "main",
    };
    (window as any).restarted = false;
    (window as any).downloaded = false;
    (window as any).atlas = {
      state: async () => ({ version: 1, projects: [], updatedAt: null }),
      updateState: async () => current,
      checkUpdate: async () => current,
      downloadUpdate: async () => {
        (window as any).downloaded = true;
        current = {
          ...current,
          phase: "downloaded",
          percent: 100,
          downloaded: true,
        };
        return current;
      },
      installUpdate: async () => {
        (window as any).restarted = true;
        return { ...current, phase: "installing" };
      },
    };
  });
  await page.goto("/");
  const banner = page.getByRole("region", {
    name: "Atlas update",
    exact: true,
  });
  await expect(banner).toContainText("0.1.1-main.42 is available");
  expect(await page.evaluate(() => (window as any).downloaded)).toBe(false);
  await banner.getByRole("button", { name: "Download update" }).click();
  await expect(
    banner.getByRole("button", { name: "Restart to update" }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).restarted)).toBe(false);
  await page.screenshot({ path: "docs/update-banner.png", fullPage: true });
  await banner.getByRole("button", { name: "Restart to update" }).click();
  expect(await page.evaluate(() => (window as any).restarted)).toBe(true);
});
