import {
  profileSchema,
  type CreateProfileCommand,
  type Profile,
  type TasteOverrides,
} from "@koradio/contracts";

export function createProfile(
  id: string,
  command: CreateProfileCommand,
  occurredAt: string,
): Profile {
  return profileSchema.parse({
    id,
    radioName: command.radioName,
    nickname: command.nickname,
    avatarRef: command.avatarRef ?? null,
    frequentGenres: command.frequentGenres ?? [],
    defaultScenario: command.defaultScenario ?? "",
    createdAt: occurredAt,
    updatedAt: occurredAt,
  });
}

export function createInitialTasteOverrides(profile: Profile): TasteOverrides {
  return {
    profileId: profile.id,
    tags: profile.frequentGenres,
    avoidRules: [],
    sceneRules: profile.defaultScenario.length === 0 ? [] : [profile.defaultScenario],
    updatedAt: profile.createdAt,
  };
}
