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
    .getByRole("combobox", { name: "Filter by availability status" })
    .selectOption("Offline");
  await expect(page.locator(".project-card")).toHaveCount(1);
  await expect(page.locator(".project-title")).toContainText(
    "Developer platform",
  );
  await page
    .getByRole("combobox", { name: "Filter by availability status" })
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

test("startup checklist connects GitHub without opening Settings", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let connected = false;
    (window as any).atlas = {
      state: async () => ({ version: 1, projects: [], updatedAt: null }),
      systemCheck: async () => ({
        checkedAt: new Date().toISOString(),
        checks: [
          {
            id: "github:git.example.com",
            host: "git.example.com",
            name: "GitHub access · git.example.com",
            status: connected ? "ready" : "missing",
            required: false,
            detail: "Token is optional for public repositories",
            remedy: "Create a read-only token",
          },
        ],
      }),
      openExternal: async (url: string) => {
        (window as any).opened = url;
      },
      connect: async (host: string, token: string) => {
        (window as any).connection = { host, token };
        connected = true;
        return true;
      },
    };
  });
  await page.goto("/");
  const checks = page.getByRole("region", { name: "Startup requirements" });
  await checks
    .getByRole("button", { name: "Open personal access token settings" })
    .click();
  expect(await page.evaluate(() => (window as any).opened)).toBe(
    "https://git.example.com/settings/tokens",
  );
  await checks
    .getByLabel("Personal access token for git.example.com")
    .fill("test-token");
  await checks.getByRole("button", { name: "Save connection" }).click();
  await expect(checks).toContainText("All checks passed");
  await checks
    .getByRole("button", { name: "Dismiss setup confirmation" })
    .click();
  await expect(checks).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).connection)).toEqual({
    host: "git.example.com",
    token: "test-token",
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("healthy first startup stays quiet", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).atlas = {
      state: async () => ({ version: 1, projects: [], updatedAt: null }),
      systemCheck: async () => ({
        checkedAt: new Date().toISOString(),
        checks: [
          {
            id: "runtime",
            name: "Runtime",
            status: "ready",
            required: true,
            detail: "Available",
            remedy: "",
          },
        ],
      }),
    };
  });
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Startup requirements" }),
  ).toHaveCount(0);
});

test("empty search shows no matches and can clear filters", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Find a project" })
    .fill("no-such-project-xyz");
  await expect(
    page.getByRole("heading", { name: "No matching projects" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add your first project" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search and filters" }).click();
  await expect(page.locator(".project-card")).toHaveCount(6);
});

test("repository URL detects technologies and SAML is opt-in", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).atlas = {
      state: async () => ({ version: 1, projects: [], updatedAt: null }),
      scanRepositoryTechnologies: async (url: string) => ({
        technologies: ["React", "Electron"],
        examined: 1,
        warnings: [],
      }),
      scanLocalTechnologies: async () => null,
    };
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add project", exact: true })
    .first()
    .click();
  await page
    .getByLabel("GitHub repository")
    .fill("https://github.com/acme/app");
  await expect(page.getByText("React · Electron · 1 manifests")).toBeVisible();
  await expect(
    page.getByLabel("Expected SAML / access expiration"),
  ).toHaveCount(0);
  await page.getByLabel("Uses SAML SSO").check();
  await expect(
    page.getByLabel("Expected SAML / access expiration"),
  ).toBeVisible();
  await page.getByLabel("Uses SAML SSO").uncheck();
  await expect(
    page.getByLabel("Expected SAML / access expiration"),
  ).toHaveCount(0);
});

test("project refresh distinguishes GitHub monitoring from website health", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const project = {
      id: "one",
      name: "Monitored project",
      client: "Acme",
      repo: "https://github.com/acme/app",
      url: "https://example.com",
      notes: "",
      technologies: [],
      watchSite: true,
      watchRepo: true,
      notify: false,
      status: "offline",
      access: "public",
      checkedAt: new Date().toISOString(),
      repoCheckedAt: new Date().toISOString(),
      events: [],
      prs: [],
    };
    (window as any).atlas = {
      state: async () => ({ version: 1, projects: [project], updatedAt: null }),
      refreshProject: async (id: string) => {
        (window as any).refreshed = id;
        return {
          version: 1,
          projects: [{ ...project, status: "online" }],
          updatedAt: null,
        };
      },
    };
  });
  await page.goto("/");
  await page.locator(".project-title").click();
  const details = page.getByRole("dialog");
  await expect(details).toContainText("Website: Offline");
  await expect(details).toContainText(
    "GitHub: Monitoring repository · public access",
  );
  await details
    .getByRole("button", { name: "Refresh project", exact: true })
    .click();
  await expect(details).toContainText("Website: Online");
  expect(await page.evaluate(() => (window as any).refreshed)).toBe("one");
});

test("technology badges keep names, show icons and dots, and repository-only cards have no website badge", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).atlas = {
      state: async () => ({
        version: 1,
        updatedAt: null,
        projects: [
          {
            id: "icons",
            name: "Icon project",
            repo: "https://github.com/acme/app",
            url: "",
            client: "Acme",
            notes: "",
            technologies: ["React", "C#", "HTML", "Custom system"],
            status: "unknown",
            access: "public",
            watchRepo: true,
            watchSite: false,
            notify: false,
            events: [],
            prs: [],
          },
        ],
      }),
    };
  });
  await page.goto("/");
  const card = page.locator(".project-card");
  await expect(card.locator(".status")).toHaveCount(0);
  await expect(card.locator(".technology-icon")).toHaveCount(3);
  await expect(card.locator(".technology-dot")).toHaveCount(1);
  await card.locator(".project-title").click();
  const details = page.getByRole("dialog");
  await expect(details.locator(".technology-icon")).toHaveCount(3);
  await expect(details.locator(".technology-dot")).toHaveCount(1);
  await expect(details.locator(".tech-list")).toContainText("Custom system");
  await expect(
    details
      .locator(".technology-badge")
      .filter({ hasText: /^HTML$/ })
      .locator("img"),
  ).toHaveAttribute("src", /html5/);
  for (const theme of ["atlas", "hacker", "elegant", "retro"]) {
    await page.evaluate(
      (value) => (document.documentElement.dataset.theme = value),
      theme,
    );
    for (const image of await details.locator(".technology-icon").all()) {
      await expect(image).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(image).toHaveCSS("padding", "0px");
    }
    await details
      .locator(".tech-list")
      .screenshot({ path: `/tmp/atlas-technology-${theme}.png` });
  }
  const image = details.locator(".technology-icon").first();
  await image.evaluate((element) => element.dispatchEvent(new Event("error")));
  await expect(details.locator(".technology-dot")).toHaveCount(2);
  await expect(details.locator(".tech-list")).toContainText("React");
});

test("repository changes automatically save detected technologies and preserve manual notes", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).atlas = {
      state: async () => ({ version: 1, projects: [], updatedAt: null }),
      scanRepositoryTechnologies: async (url: string) => ({
        technologies: url.endsWith("/first") ? ["React"] : ["Vue", "Go"],
        examined: 1,
        warnings: [],
      }),
      saveProject: async (p: any) => {
        (window as any).savedProject = p;
        return {
          version: 1,
          projects: [
            {
              ...p,
              id: "new",
              status: "unknown",
              access: "public",
              events: [],
              prs: [],
            },
          ],
          updatedAt: null,
        };
      },
    };
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add project", exact: true })
    .first()
    .click();
  await page.getByLabel("Project name").fill("Detected project");
  await page.getByLabel("Technologies", { exact: false }).fill("Custom system");
  await page
    .getByLabel("GitHub repository")
    .fill("https://github.com/acme/first");
  await expect(page.getByText("React · 1 manifests")).toBeVisible();
  await page.getByLabel("Your contribution").fill("Manual notes kept");
  await page
    .getByLabel("GitHub repository")
    .fill("https://github.com/acme/second");
  await expect(page.getByText("Vue · Go · 1 manifests")).toBeVisible();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const saved = await page.evaluate(() => (window as any).savedProject);
  expect(saved.detectedTechnologies).toEqual(["Vue", "Go"]);
  expect(saved.technologies).toEqual(["Custom system"]);
  expect(saved.notes).toBe("Manual notes kept");
});

test("private repository errors link to token access settings", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).atlas = {
      state: async () => ({
        version: 1,
        updatedAt: null,
        projects: [
          {
            id: "private",
            name: "Private project",
            repo: "https://github.com/acme/private",
            url: "",
            client: "Acme",
            notes: "",
            technologies: [],
            status: "unknown",
            access: "disconnected",
            repoError:
              "GitHub returned 404. Check Resource owner and selected repositories.",
            watchRepo: true,
            watchSite: false,
            notify: false,
            events: [],
            prs: [],
          },
        ],
      }),
      openExternal: async (url: string) => {
        (window as any).opened = url;
      },
    };
  });
  await page.goto("/");
  await page.locator(".project-title").click();
  await page.getByRole("button", { name: "Review token access" }).click();
  expect(await page.evaluate(() => (window as any).opened)).toBe(
    "https://github.com/settings/personal-access-tokens",
  );
});

test("late technology scan responses cannot overwrite a newer repository", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).pending = {};
    (window as any).atlas = {
      state: async () => ({ version: 1, projects: [], updatedAt: null }),
      scanRepositoryTechnologies: (url: string) =>
        new Promise((resolve) => {
          (window as any).pending[url] = resolve;
        }),
    };
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add project", exact: true })
    .first()
    .click();
  const input = page.getByLabel("GitHub repository");
  await input.fill("https://github.com/acme/first");
  await expect
    .poll(() =>
      page.evaluate(
        () => !!(window as any).pending["https://github.com/acme/first"],
      ),
    )
    .toBe(true);
  await input.fill("https://github.com/acme/second");
  await expect
    .poll(() =>
      page.evaluate(
        () => !!(window as any).pending["https://github.com/acme/second"],
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    (window as any).pending["https://github.com/acme/second"]({
      technologies: ["Vue"],
      examined: 1,
      warnings: [],
    });
  });
  await expect(page.getByText("Vue · 1 manifests")).toBeVisible();
  await page.evaluate(() => {
    (window as any).pending["https://github.com/acme/first"]({
      technologies: ["React"],
      examined: 1,
      warnings: [],
    });
  });
  await expect(page.getByText("Vue · 1 manifests")).toBeVisible();
  await expect(page.getByText("React · 1 manifests")).toHaveCount(0);
});

test("project menu supports keyboard navigation, unwatch, resume, refresh, edit and deletion", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let projects = [
      {
        id: "menu",
        name: "Menu project",
        repo: "https://github.com/acme/app",
        url: "https://example.com",
        client: "Acme",
        notes: "Keep this history",
        technologies: [],
        status: "online",
        access: "public",
        watchRepo: true,
        watchSite: false,
        watchSecurity: true,
        notify: false,
        events: [],
        prs: [],
      },
    ];
    const state = () => ({ version: 1, projects, updatedAt: null });
    (window as any).atlas = {
      state: async () => state(),
      saveProject: async (p: any) => {
        (window as any).savedProject = p;
        projects = [p];
        return state();
      },
      refreshProject: async (id: string) => {
        (window as any).refreshed = id;
        return state();
      },
      deleteProject: async (id: string) => {
        (window as any).deleted = id;
        projects = [];
        return state();
      },
    };
  });
  await page.goto("/");
  const trigger = page.getByRole("button", {
    name: "Actions for Menu project",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "Edit", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("menuitem", { name: "Delete", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole("menuitem", { name: "Unwatch", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Unwatched", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(1);
  let saved = await page.evaluate(() => (window as any).savedProject);
  expect([saved.watchSite, saved.watchRepo, saved.watchSecurity]).toEqual([
    false,
    false,
    false,
  ]);
  expect(saved.notes).toBe("Keep this history");
  await trigger.click();
  await page
    .getByRole("menuitem", { name: "Resume watching", exact: true })
    .click();
  await expect(page.locator(".project-card")).toHaveCount(0);
  await page.getByRole("button", { name: /Watched projects/ }).click();
  await expect(page.locator(".project-card")).toHaveCount(1);
  saved = await page.evaluate(() => (window as any).savedProject);
  expect([saved.watchSite, saved.watchRepo, saved.watchSecurity]).toEqual([
    false,
    true,
    true,
  ]);
  await trigger.click();
  await page.getByRole("menuitem", { name: "Refresh", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).refreshed))
    .toBe("menu");
  await trigger.click();
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Project name")).toHaveValue("Menu project");
  await page.keyboard.press("Escape");
  page.once("dialog", (dialog) => dialog.accept());
  await trigger.click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).deleted)).toBe("menu");
});

test("backend health monitor settings persist and use healthy labels", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).atlas = {
      state: async () => ({ version: 1, projects: [], updatedAt: null }),
      saveProject: async (p: any) => {
        (window as any).savedProject = p;
        return {
          version: 1,
          projects: [
            {
              ...p,
              id: "health",
              status: "online",
              healthStatus: "healthy",
              access: "disconnected",
              events: [],
              prs: [],
            },
          ],
          updatedAt: null,
        };
      },
    };
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add project", exact: true })
    .first()
    .click();
  await page.getByLabel("Project name").fill("API backend");
  await page
    .getByRole("combobox", { name: "Availability monitor" })
    .selectOption("health");
  await page
    .getByLabel("Health endpoint URL")
    .fill("https://api.example.com/health");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator(".project-card .status")).toHaveText("Healthy");
  const saved = await page.evaluate(() => (window as any).savedProject);
  expect(saved.monitorKind).toBe("health");
  expect(saved.url).toBe("https://api.example.com/health");
  await page.locator(".project-title").click();
  await expect(page.getByRole("dialog")).toContainText(
    "Backend health: Healthy",
  );
  await expect(
    page.getByRole("button", { name: "Open health endpoint" }),
  ).toBeVisible();
});
