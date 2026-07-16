import {
  createInitialTasteOverrides,
  createProfile,
} from "../../apps/server/src/modules/profiles/domain/profile.js";
import { describe, expect, it } from "vitest";

const profileId = "11111111-1111-4111-8111-111111111111";
const occurredAt = "2026-07-16T09:00:00.000Z";

describe("Profiles domain defaults", () => {
  it("normalizes optional profile fields and initializes empty taste overrides", () => {
    const profile = createProfile(
      profileId,
      {
        radioName: "  Night Signals  ",
        nickname: "  Klein  ",
      },
      occurredAt,
    );

    expect(profile).toEqual({
      id: profileId,
      radioName: "Night Signals",
      nickname: "Klein",
      avatarRef: null,
      frequentGenres: [],
      defaultScenario: "",
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });
    expect(createInitialTasteOverrides(profile)).toEqual({
      profileId,
      tags: [],
      avoidRules: [],
      sceneRules: [],
      updatedAt: occurredAt,
    });
  });

  it("uses onboarding genres and default scenario as initial manual taste rules", () => {
    const profile = createProfile(
      profileId,
      {
        radioName: "Night Signals",
        nickname: "Klein",
        avatarRef: "avatars/profile/avatar.webp",
        frequentGenres: ["ambient", "dream pop"],
        defaultScenario: "夜晚写作",
      },
      occurredAt,
    );

    expect(createInitialTasteOverrides(profile)).toMatchObject({
      tags: ["ambient", "dream pop"],
      avoidRules: [],
      sceneRules: ["夜晚写作"],
    });
  });
});
