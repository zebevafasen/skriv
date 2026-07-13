import { expect, type Page, test } from "@playwright/test";

const viewports = [
  { name: "narrow phone", width: 320, height: 700 },
  { name: "phone", width: 390, height: 844 },
  { name: "large phone", width: 700, height: 900 },
  { name: "small tablet", width: 701, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
] as const;

async function expectNoDocumentOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      })),
    )
    .toEqual(
      await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.clientWidth,
      })),
    );
}

for (const viewport of viewports) {
  test(`${viewport.name} keeps global pages inside the viewport`, async ({ page }) => {
    await page.setViewportSize(viewport);

    for (const path of ["/", "/prompts", "/settings", "/login"]) {
      await page.goto(path);
      await expect(page.locator(".topbar")).toBeVisible();
      await expectNoDocumentOverflow(page);
    }

    await page.goto("/");
    await page.getByRole("button", { name: "Create story" }).click();
    await expect(page.getByRole("heading", { name: "Create your story" })).toBeVisible();
    await expectNoDocumentOverflow(page);
    await page.getByRole("button", { name: "Cancel" }).click();
  });
}

test("mobile workspace exposes every primary workflow without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Create story" }).click();
  await page.getByPlaceholder("The Last Ember").fill(`Responsive Story ${Date.now()}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+/);
  const projectId = page.url().split("/").at(-1);
  if (!projectId) throw new Error("Project ID was not present in the URL.");

  try {
    await expect(page.getByRole("button", { name: "Write" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to projects" })).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Project workspace" })).toBeVisible();
    await expect(page.locator(".topbar")).toBeHidden();
    await expect(page.locator(".project-bar")).toBeHidden();
    await expect(page.locator(".manuscript-viewbar")).toBeHidden();
    await expect(page.locator(".compendium-sidebar")).toBeHidden();
    await expect(page.locator(".editor-side-nav")).toBeHidden();
    const editorFrameBox = await page.locator(".continuous-editor-frame").boundingBox();
    expect(editorFrameBox?.width).toBeGreaterThanOrEqual(380);
    await expectNoDocumentOverflow(page);

    await page.getByRole("button", { name: "Compendium", exact: true }).click();
    await expect(page).toHaveURL(/tab=compendium/);
    await expect(page.locator(".compendium-sidebar")).toBeVisible();
    await expect(page.locator(".manuscript-main")).toBeHidden();
    await expectNoDocumentOverflow(page);

    await page.getByRole("button", { name: "New Entry" }).click();
    const entryTypeMenu = page.getByRole("menu", { name: "Choose entry type" });
    await expect(entryTypeMenu).toBeVisible();
    await expect(entryTypeMenu.getByText("Choose a category")).toBeVisible();
    await expect(entryTypeMenu.getByRole("menuitem", { name: "Character" })).toBeVisible();
    await expect(entryTypeMenu.getByRole("menuitem", { name: "Location" })).toBeVisible();
    const entryTypeMenuBox = await entryTypeMenu.boundingBox();
    expect(entryTypeMenuBox?.width).toBeGreaterThanOrEqual(350);
    expect(entryTypeMenuBox?.x).toBeGreaterThanOrEqual(0);
    expect((entryTypeMenuBox?.x ?? 0) + (entryTypeMenuBox?.width ?? 0)).toBeLessThanOrEqual(390);
    expect(entryTypeMenuBox?.y).toBeGreaterThanOrEqual(0);
    expect((entryTypeMenuBox?.y ?? 0) + (entryTypeMenuBox?.height ?? 0)).toBeLessThanOrEqual(844);
    await entryTypeMenu.getByRole("menuitem", { name: "Character" }).click();
    const drawerToolbar = page.locator(".drawer-toolbar");
    await expect(drawerToolbar).toBeVisible();
    const toolbarActionBoxes = await Promise.all(
      [
        page.getByRole("button", { name: "Delete entry" }),
        page.getByRole("button", { name: "Save", exact: true }),
        page.getByRole("button", { name: "Close entry" }),
      ].map((control) => control.boundingBox()),
    );
    const toolbarTop = toolbarActionBoxes[0]?.y ?? 0;
    for (const box of toolbarActionBoxes)
      expect(Math.abs((box?.y ?? 0) - toolbarTop)).toBeLessThan(4);
    await page.getByRole("button", { name: "Close entry" }).click();

    await page.getByRole("button", { name: "Write", exact: true }).click();
    await expect(page).not.toHaveURL(/tab=compendium/);

    const prose = page.locator(".continuous-editor-prose");
    await prose.click();
    await page.setViewportSize({ width: 390, height: 500 });
    await expect(page.locator(".editor-toolbar")).toBeVisible();
    const proseBox = await prose.boundingBox();
    expect(proseBox?.height).toBeGreaterThan(300);
    await expectNoDocumentOverflow(page);

    await page.getByRole("button", { name: "Writing tools" }).click();
    await page.getByRole("button", { name: "Typography" }).click();
    const typographyMenu = page.locator(".typography-menu");
    await expect(typographyMenu).toBeVisible();
    const typographyBox = await typographyMenu.boundingBox();
    expect(typographyBox?.y).toBeGreaterThanOrEqual(0);
    expect((typographyBox?.y ?? 0) + (typographyBox?.height ?? 0)).toBeLessThanOrEqual(500);
    await page.mouse.click(2, 100);
    await expect(typographyMenu).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });

    await page.getByRole("button", { name: "Outline" }).click();
    const firstOutlineCard = page.locator(".outline-scene-card").first();
    await expect(firstOutlineCard).toBeVisible();
    const sceneActionBoxes = await Promise.all(
      [
        firstOutlineCard.getByRole("button", { name: /Rename Scene/ }),
        firstOutlineCard.getByRole("button", { name: /Delete Scene/ }),
      ].map((control) => control.boundingBox()),
    );
    expect(Math.abs((sceneActionBoxes[0]?.y ?? 0) - (sceneActionBoxes[1]?.y ?? 0))).toBeLessThan(4);
    await expectNoDocumentOverflow(page);

    await page.getByRole("button", { name: "Ideation" }).click();
    await expect(page.locator(".ideation-panel")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save ingredients" })).toBeVisible();
    await page
      .locator(".ideation-panel")
      .getByRole("button", { name: "Compendium", exact: true })
      .click();
    const ideationCompendium = page.locator(".ideation-compendium-dialog");
    await expect(ideationCompendium).toBeVisible();
    const ideationCompendiumBox = await ideationCompendium.boundingBox();
    expect(ideationCompendiumBox?.width).toBeGreaterThanOrEqual(389);
    expect(ideationCompendiumBox?.height).toBeGreaterThanOrEqual(790);
    await page.getByRole("button", { name: "Close Compendium" }).click();
    await expect(ideationCompendium).toBeHidden();
    await expectNoDocumentOverflow(page);

    await page.getByRole("button", { name: "More" }).click();
    await expect(page.locator(".mobile-project-menu")).toBeVisible();
    await page.getByRole("button", { name: "Project settings" }).click();
    await expect(page.locator(".project-settings-panel")).toBeVisible();
    await expectNoDocumentOverflow(page);

    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("link", { name: "Back to projects" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Your stories" })).toBeVisible();
    await page.evaluate(() => {
      const spacer = document.createElement("div");
      spacer.style.height = "1200px";
      spacer.setAttribute("aria-hidden", "true");
      document.querySelector(".library-page")?.append(spacer);
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  } finally {
    await page.request.delete(`/api/projects/${projectId}`);
  }
});

test("responsive controls retain touch-friendly targets", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");

  const navLinks = page.locator(".global-nav a");
  await expect(navLinks).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    const box = await navLinks.nth(index).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }

  const createButton = page.getByRole("button", { name: "Create story" });
  const createButtonBox = await createButton.boundingBox();
  expect(createButtonBox?.height).toBeGreaterThanOrEqual(44);
});
