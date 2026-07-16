import {
  currentProfileResponseSchema,
  profileListResponseSchema,
  profileContextSchema,
  type CreateProfileCommand,
  type CurrentProfileResponse,
  type Profile,
  type ProfileContext,
  type ProfileListResponse,
  type UpdateProfileCommand,
} from "@koradio/contracts";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { ProfilePreferencesService } from "../profile-preferences/index.js";
import type { TasteDefaultsService } from "../taste/index.js";
import type { AvatarUploadService } from "./avatar.js";
import { createInitialTasteOverrides, createProfile } from "./domain/profile.js";
import type { ProfileRepository } from "./persistence.js";

export class ProfileNotFoundError extends Error {
  constructor() {
    super("Profile was not found");
    this.name = "ProfileNotFoundError";
  }
}

export interface ProfileService {
  create(command: CreateProfileCommand, idempotencyKey: string): Promise<Profile>;
  get(profileId: string): Profile;
  list(): ProfileListResponse;
  update(profileId: string, command: UpdateProfileCommand): Promise<Profile>;
}

export interface CreateProfileServiceOptions {
  client: DatabaseSync;
  avatarReferences: Pick<AvatarUploadService, "validate">;
  now?: () => Date;
  preferences: ProfilePreferencesService;
  randomId?: () => string;
  repository: ProfileRepository;
  tasteDefaults: TasteDefaultsService;
}

export function createProfileService(options: CreateProfileServiceOptions): ProfileService {
  const now = options.now ?? (() => new Date());
  const randomId = options.randomId ?? randomUUID;

  return {
    async create(command, idempotencyKey) {
      const existing = options.repository.findByCreationIdempotencyKey(idempotencyKey);
      if (existing !== null) {
        return existing;
      }

      const profile = createProfile(randomId(), command, now().toISOString());
      if (profile.avatarRef !== null) {
        await options.avatarReferences.validate(profile.avatarRef);
      }
      const tasteOverrides = createInitialTasteOverrides(profile);
      options.client.exec("BEGIN IMMEDIATE");

      try {
        const concurrent = options.repository.findByCreationIdempotencyKey(idempotencyKey);
        if (concurrent !== null) {
          options.client.exec("ROLLBACK");
          return concurrent;
        }

        options.repository.insert(profile, idempotencyKey);
        options.preferences.initialize(profile.id, profile.createdAt);
        options.tasteDefaults.initialize(tasteOverrides);
        options.client.exec("COMMIT");
        return profile;
      } catch (error) {
        options.client.exec("ROLLBACK");
        throw error;
      }
    },
    get(profileId) {
      const profile = options.repository.findById(profileId);
      if (profile === null) {
        throw new ProfileNotFoundError();
      }
      return profile;
    },
    list() {
      return profileListResponseSchema.parse({
        items: options.repository.list(),
      });
    },
    async update(profileId, command) {
      if (command.avatarRef !== undefined && command.avatarRef !== null) {
        await options.avatarReferences.validate(command.avatarRef);
      }
      const profile = options.repository.update(profileId, command, now().toISOString());
      if (profile === null) {
        throw new ProfileNotFoundError();
      }
      return profile;
    },
  };
}

export interface ProfileSwitchRuntimeCoordinator {
  cancelGeneration(profileId: string): Promise<void>;
  checkpointPlayback(profileId: string): Promise<void>;
  discardLateEvents(profileId: string): Promise<void>;
  stopPlayback(profileId: string): Promise<void>;
}

export class ProfileSwitchError extends Error {
  constructor() {
    super("Profile switch could not be completed");
    this.name = "ProfileSwitchError";
  }
}

export interface CreateProfileContextServiceOptions {
  profiles: ProfileService;
  preferences: ProfilePreferencesService;
  readCurrentProfileId(): Promise<string | null>;
  runtimeCoordinator: ProfileSwitchRuntimeCoordinator;
  writeCurrentProfileId(profileId: string): Promise<void>;
}

export interface ProfileContextService {
  getCurrent(): Promise<CurrentProfileResponse>;
  select(profileId: string): Promise<CurrentProfileResponse>;
}

export function createProfileContextService(
  options: CreateProfileContextServiceOptions,
): ProfileContextService {
  function load(profileId: string): ProfileContext {
    return profileContextSchema.parse({
      profile: options.profiles.get(profileId),
      preferences: options.preferences.get(profileId),
    });
  }

  return {
    async getCurrent() {
      const profileId = await options.readCurrentProfileId();
      return currentProfileResponseSchema.parse({
        current: profileId === null ? null : load(profileId),
      });
    },
    async select(profileId) {
      const target = load(profileId);
      const previousProfileId = await options.readCurrentProfileId();

      try {
        if (previousProfileId !== null && previousProfileId !== profileId) {
          await options.runtimeCoordinator.cancelGeneration(previousProfileId);
          await options.runtimeCoordinator.discardLateEvents(previousProfileId);
          await options.runtimeCoordinator.checkpointPlayback(previousProfileId);
          await options.runtimeCoordinator.stopPlayback(previousProfileId);
        }

        await options.writeCurrentProfileId(profileId);
      } catch {
        throw new ProfileSwitchError();
      }
      return currentProfileResponseSchema.parse({ current: target });
    },
  };
}
