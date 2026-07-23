import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync(new URL("../../apps/web/public/manifest.webmanifest", import.meta.url), "utf8"),
) as {
  display: string;
  icons: Array<{ purpose: string; sizes: string; src: string; type: string }>;
  id: string;
  start_url: string;
};

function iconSize(path: string): [number, number] {
  const image = readFileSync(new URL(`../../apps/web/public${path}`, import.meta.url));
  expect(image.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return [image.readUInt32BE(16), image.readUInt32BE(20)];
}

describe("PWA manifest", () => {
  it("declares standalone identity and installable Koradio brand icons", () => {
    expect(manifest).toMatchObject({ display: "standalone", id: "/", start_url: "/radio" });
    expect(manifest.icons).toEqual([
      {
        src: "/icons/koradio-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/koradio-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ]);
    expect(iconSize("/icons/koradio-192.png")).toEqual([192, 192]);
    expect(iconSize("/icons/koradio-512.png")).toEqual([512, 512]);
  });
});
