import {
  codexPlanningContextSchema,
  codexProgramPlanSchema,
  providerCallOptionsSchema,
  ttsSynthesisCommandSchema,
  ttsSynthesisResultSchema,
  type CodexProvider,
  type TtsProvider,
} from "../modules/programs/index.js";
import {
  createMockRadioAssistantProvider,
  type RadioAssistantProvider,
} from "../modules/radio/index.js";

const mockTtsAudioRef = "tts/00000000-0000-4000-8000-000000000001.wav";

function scenarioSeed(value: string): number {
  return Array.from(value).reduce(
    (seed, character, index) => (seed + (character.codePointAt(0) ?? 0) * (index + 1)) % 997,
    0,
  );
}

function rotate<T>(items: readonly T[], seed: number): T[] {
  if (items.length === 0) return [];
  const offset = seed % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function topicFor(value: string): string {
  const normalized = value.trim().replace(/[。！？!?]+$/u, "");
  if (Array.from(normalized).length <= 24) return normalized;
  return `${Array.from(normalized).slice(0, 23).join("")}…`;
}

export function createMockCodexProvider(): CodexProvider & RadioAssistantProvider {
  const radio = createMockRadioAssistantProvider();
  return {
    respond: (context, options) => radio.respond(context, options),
    plan(context, options) {
      const parsedContext = codexPlanningContextSchema.parse(context);
      providerCallOptionsSchema.parse(options);
      const seed = scenarioSeed(
        `${parsedContext.scenarioText}|${parsedContext.history.map((item) => item.trackIds.join(",")).join(";")}`,
      );
      const topic = topicFor(parsedContext.scenarioText);
      const recentTrackIds = new Set(parsedContext.history.flatMap((item) => item.trackIds));
      const recentLibrarySongs = new Set(
        parsedContext.library.tracks
          .filter((track) => recentTrackIds.has(track.trackId))
          .map((track) => `${track.title} ${track.artist}`.toLocaleLowerCase("en-US")),
      );
      const text =
        parsedContext.preferences.djLanguage === "zh-CN"
          ? `今晚从“${topic}”开始，先让旋律把空间慢慢铺开。`
          : `We’ll begin with “${topic}” and let the room open up one song at a time.`;
      const libraryIntents = rotate(parsedContext.library.tracks, seed)
        .filter((track) => !recentTrackIds.has(track.trackId))
        .slice(0, parsedContext.library.minimumLibraryTrackCount)
        .map((track) => ({
          kind: "library" as const,
          trackId: track.trackId,
          reason: `Fits the requested scene: ${topic}`,
        }));
      const fixtureQueries = [
        "Space Song Beach House",
        "Midnight City M83",
        "Quiet Signal Artist Three",
        "Soft Current Artist Four",
        "Night Window Artist Five",
        "Slow Orbit Artist Six",
        "Paper Moon Artist Seven",
        "After Rain Artist Eight",
        "Green Room Artist Nine",
        "Last Light Artist Ten",
        "Small Hours Artist Eleven",
        "Open Road Artist Twelve",
        "Blue Hour Artist Thirteen",
        "Window Seat Artist Fourteen",
        "Low Tide Artist Fifteen",
        "Silver Lines Artist Sixteen",
        "Common Ground Artist Seventeen",
        "Northbound Artist Eighteen",
        "Velvet Sky Artist Nineteen",
        "Slow Bloom Artist Twenty",
        "Warm Static Artist Twenty-One",
        "Corner Light Artist Twenty-Two",
        "Soft Focus Artist Twenty-Three",
        "First Train Artist Twenty-Four",
      ];
      const selectedLibrarySongs = new Set(
        libraryIntents.flatMap((intent) => {
          const track = parsedContext.library.tracks.find(
            (candidate) => candidate.trackId === intent.trackId,
          );
          return track === undefined
            ? []
            : [`${track.title} ${track.artist}`.toLocaleLowerCase("en-US")];
        }),
      );
      const discoveryIntents = rotate(
        fixtureQueries,
        seed + parsedContext.history.length * parsedContext.library.maximumTracks,
      )
        .filter((keyword) => {
          const normalized = keyword.toLocaleLowerCase("en-US");
          return !selectedLibrarySongs.has(normalized) && !recentLibrarySongs.has(normalized);
        })
        .slice(0, parsedContext.library.maximumTracks + 4 - libraryIntents.length)
        .map((keyword) => ({
          kind: "discovery" as const,
          keyword,
          reason: `Adds contrast without losing the ${topic} mood`,
        }));
      const titles =
        parsedContext.preferences.djLanguage === "zh-CN"
          ? ["把这一刻放慢", "给今天留一段声音", "夜色里的小节目", "沿着心情走一会儿"]
          : [
              "A Little Room for Today",
              "Follow the Feeling",
              "After the Noise",
              "One More Quiet Hour",
            ];
      const programTitle = titles[seed % titles.length] ?? titles[0];
      return Promise.resolve(
        codexProgramPlanSchema.parse({
          programTitle,
          scenarioSummary: parsedContext.scenarioText,
          djLanguage: parsedContext.preferences.djLanguage,
          djPersona: parsedContext.preferences.djVoiceStyle,
          djScripts: [
            {
              type: "intro",
              language: parsedContext.preferences.djLanguage,
              text,
              displayText: text,
              estimatedTiming: true,
            },
            {
              type: "segue",
              language: parsedContext.preferences.djLanguage,
              text:
                parsedContext.preferences.djLanguage === "zh-CN"
                  ? "先听旋律怎样把空间打开，再留意鼓点怎样把下一首歌稳稳接住。"
                  : "Listen for how the melody opens the room, then how the drums make the handoff feel inevitable.",
              displayText:
                parsedContext.preferences.djLanguage === "zh-CN"
                  ? "先听旋律怎样把空间打开，再留意鼓点怎样把下一首歌稳稳接住。"
                  : "Listen for how the melody opens the room, then how the drums make the handoff feel inevitable.",
              estimatedTiming: true,
            },
            {
              type: "segue",
              language: parsedContext.preferences.djLanguage,
              text:
                parsedContext.preferences.djLanguage === "zh-CN"
                  ? "人声落下之后，编曲还在轻轻推着节奏，正好把此刻的心情带到下一段。"
                  : "After the vocal lands, the arrangement keeps the pulse moving and carries this moment into the next song.",
              displayText:
                parsedContext.preferences.djLanguage === "zh-CN"
                  ? "人声落下之后，编曲还在轻轻推着节奏，正好把此刻的心情带到下一段。"
                  : "After the vocal lands, the arrangement keeps the pulse moving and carries this moment into the next song.",
              estimatedTiming: true,
            },
          ],
          trackIntents: [...libraryIntents, ...discoveryIntents],
          playlistIntent: {
            energy: "low-mid",
            mood: "calm",
            avoid: [],
          },
        }),
      );
    },
  };
}

export function createMockTtsProvider(): TtsProvider {
  return {
    synthesize(command, options) {
      const parsed = ttsSynthesisCommandSchema.parse(command);
      providerCallOptionsSchema.parse(options);
      return Promise.resolve(
        ttsSynthesisResultSchema.parse({
          audioRef: mockTtsAudioRef,
          durationMs: Math.max(1_000, parsed.text.length * 80),
          markers: [],
          estimatedTiming: true,
        }),
      );
    },
  };
}
