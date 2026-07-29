import {
  colorTokens,
  desktopWindowTokens,
  layoutTokens,
  radioTokens,
  radiusTokens,
} from "@koradio/design-tokens";
import { expect, it } from "vitest";

it("publishes the frozen S1 design token primitives", () => {
  expect(colorTokens.dark.background).toBe("#090a0c");
  expect(colorTokens.dark.accent).toBe("#55b978");
  expect(radiusTokens.radio).toBe("24px");
  expect(layoutTokens.minimumTargetSize).toBe("44px");
  expect(layoutTokens.desktopContentMaxWidth).toBe("720px");
  expect(desktopWindowTokens).toMatchObject({
    defaultHeight: 840,
    defaultWidth: 720,
    minimumHeight: 760,
    minimumWidth: 680,
  });
  expect(radioTokens).toMatchObject({
    railWidth: "816px",
    mainHeight: "340px",
    dialogueHeight: "288px",
    sceneInputHeight: "88px",
  });
});
