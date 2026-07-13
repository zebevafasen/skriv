import { describe, expect, it } from "vitest";
import { calculateModelMenuLayout } from "./ModelSelect.js";

describe("model menu placement", () => {
  it("opens upward when the trigger is near the bottom of the viewport", () => {
    const layout = calculateModelMenuLayout(
      { top: 500, bottom: 540, left: 24, width: 330 },
      { top: 0, height: 600 },
      "auto",
    );

    expect(layout.placement).toBe("top");
    expect(layout.top).toBe(496);
    expect(layout.transform).toBe("translateY(-100%)");
    expect(layout.maxHeight).toBe(330);
  });

  it("opens downward when enough room remains below the trigger", () => {
    const layout = calculateModelMenuLayout(
      { top: 80, bottom: 120, left: 24, width: 330 },
      { top: 0, height: 700 },
      "auto",
    );

    expect(layout).toMatchObject({
      placement: "bottom",
      top: 124,
      left: 24,
      width: 330,
      maxHeight: 330,
    });
  });

  it("respects an offset visual viewport", () => {
    const layout = calculateModelMenuLayout(
      { top: 260, bottom: 300, left: 12, width: 280 },
      { top: 100, height: 240 },
      "auto",
    );

    expect(layout.placement).toBe("top");
    expect(layout.maxHeight).toBe(156);
  });
});
