import { describe, expect, it } from "vitest";

import {
  codexProgramPlanSchema,
  ttsSynthesisResultSchema,
} from "../../apps/server/src/modules/programs/index.js";
import {
  createMockCodexProvider,
  createMockTtsProvider,
} from "../../apps/server/src/integrations/index.js";
import {
  codexPlanningContextFixture,
  codexProgramPlanFixture,
  providerCorrelationId,
} from "../fixtures/providers.js";

describe("Provider ports and deterministic mocks", () => {
  it("accepts the PRD plan shape and rejects missing intro or mixed languages", () => {
    expect(codexProgramPlanSchema.parse(codexProgramPlanFixture)).toEqual(codexProgramPlanFixture);
    expect(() =>
      codexProgramPlanSchema.parse({
        ...codexProgramPlanFixture,
        djScripts: [{ ...codexProgramPlanFixture.djScripts[0], type: "outro" }],
      }),
    ).toThrow();
    expect(() =>
      codexProgramPlanSchema.parse({
        ...codexProgramPlanFixture,
        djScripts: [{ ...codexProgramPlanFixture.djScripts[0], language: "en-GB" }],
      }),
    ).toThrow();
  });

  it("returns repeatable normalized Codex and TTS mock results", async () => {
    const options = { correlationId: providerCorrelationId };
    const codex = createMockCodexProvider();
    const first = await codex.plan(codexPlanningContextFixture, options);
    const second = await codex.plan(codexPlanningContextFixture, options);
    expect(first).toEqual(second);
    expect(codexProgramPlanSchema.parse(first)).toMatchObject({
      djLanguage: "zh-CN",
      djPersona: "british-soft-radio",
    });

    const tts = createMockTtsProvider();
    const command = {
      text: "Tonight, we keep it quiet.",
      language: "en-GB",
      voiceIdentifier: "com.apple.voice.compact.en-GB.Daniel",
      voiceStyle: "british-soft-radio",
    };
    expect(ttsSynthesisResultSchema.parse(await tts.synthesize(command, options))).toEqual(
      ttsSynthesisResultSchema.parse(await tts.synthesize(command, options)),
    );
  });
});
