// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, expect, it } from "vitest";

function QualityStatus(): ReactElement {
  return <button type="button">质量门已就绪</button>;
}

afterEach(cleanup);

it("renders an accessible status control", () => {
  render(<QualityStatus />);

  expect(screen.getByRole("button", { name: "质量门已就绪" })).toBeTruthy();
});
