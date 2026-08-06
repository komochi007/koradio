// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ArtworkImage } from "../../apps/web/src/shared/artwork.js";

describe("ArtworkImage", () => {
  it("keeps the parent placeholder when the remote image fails", () => {
    const view = render(
      <span data-placeholder="true">
        <ArtworkImage src="https://p1.music.126.net/cover.jpg" />
        <i />
      </span>,
    );
    const image = view.container.querySelector("img");
    expect(image).not.toBeNull();
    if (image === null) throw new Error("Expected artwork image");

    fireEvent.error(image);

    expect(view.container.querySelector("img")).toBeNull();
    expect(view.container.querySelector("i")).not.toBeNull();
  });

  it("renders no image for an unavailable artwork URL", () => {
    const view = render(<ArtworkImage src={null} />);
    expect(view.container.querySelector("img")).toBeNull();
  });
});
