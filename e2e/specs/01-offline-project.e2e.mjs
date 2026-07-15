describe("offline project lifecycle", () => {
  it("creates and autosaves a local story without authentication", async () => {
    const libraryHeading = await $("h1=Your stories");
    await libraryHeading.waitForDisplayed({
      timeout: 30_000,
      timeoutMsg: `Skriv did not reach the library. Body: ${await $("body").getText()}`,
    });
    const createStory = await $(".library-actions button.primary");
    await createStory.waitForClickable();
    await createStory.click();
    const title = await $('input[placeholder="The Last Ember"]');
    await title.setValue("E2E Northern Lights");
    await $('button[type="submit"]').click();
    await browser.waitUntil(async () => (await browser.getUrl()).includes("/projects/"));
    await expect($("body")).toHaveText(expect.stringContaining("E2E Northern Lights"));
    const editor = await $(".ProseMirror");
    expect(await editor.getAttribute("spellcheck")).toBe("false");
    const firstParagraph = await $(".continuous-scene-content p");
    await firstParagraph.waitForClickable();
    await firstParagraph.click();
    await firstParagraph.addValue("The harbor lights went dark one by one.");
    await expect(editor).toHaveText(expect.stringContaining("harbor lights"));
    await browser.pause(2_000);
  });
});
