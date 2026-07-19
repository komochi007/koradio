import { colorTokens, layoutTokens, radioTokens, radiusTokens } from "@koradio/design-tokens";
import { expect, it } from "vitest";

it("publishes the frozen S1 design token primitives", () => {
  expect(colorTokens.dark.background).toBe("#090a0c");
  expect(colorTokens.dark.accent).toBe("#55b978");
  expect(radiusTokens.radio).toBe("24px");
  expect(layoutTokens.minimumTargetSize).toBe("44px");
  expect(radioTokens).toMatchObject({
    railWidth: "816px",
    mainHeight: "340px",
    dialogueHeight: "288px",
    sceneInputHeight: "88px",
  });
});
