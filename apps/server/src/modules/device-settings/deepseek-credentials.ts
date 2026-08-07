import type { SecretReference, SecretStore } from "../../platform/secrets/index.js";

const deepseekApiKeyIdentifier = "deepseek.api-key";

export interface DeepseekCredentialService {
  delete(): Promise<void>;
  get(): Promise<string | undefined>;
  has(): Promise<boolean>;
  isConfigured(): boolean;
  refresh(): Promise<boolean>;
  set(apiKey: string): Promise<SecretReference>;
}

export interface CreateDeepseekCredentialServiceOptions {
  secretStore: SecretStore;
}

export function createDeepseekCredentialService(
  options: CreateDeepseekCredentialServiceOptions,
): DeepseekCredentialService {
  let configured = false;

  async function has(): Promise<boolean> {
    const value = await options.secretStore.has(deepseekApiKeyIdentifier);
    configured = value;
    return value;
  }

  return {
    async delete() {
      await options.secretStore.delete(deepseekApiKeyIdentifier);
      configured = false;
    },
    get() {
      return options.secretStore.get(deepseekApiKeyIdentifier);
    },
    has,
    isConfigured() {
      return configured;
    },
    async refresh() {
      try {
        return await has();
      } catch {
        configured = false;
        return false;
      }
    },
    set(apiKey) {
      return options.secretStore.set(deepseekApiKeyIdentifier, apiKey).then((reference) => {
        configured = true;
        return reference;
      });
    },
  };
}
