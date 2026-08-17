import { tasteBlueprintSchema, type TasteBlueprint } from "@koradio/contracts";

export function createPersonalTasteBlueprint(profileId: string, now: string): TasteBlueprint {
  return tasteBlueprintSchema.parse({
    profileId,
    sourceLabel: "基于 taste.md 的三张歌单分析",
    version: "1.2",
    summary:
      "旋律优先、和声有颜色、松弛而有 Pocket 的律动；偏爱温暖、真实、有空间感的声音，以及克制但不失安慰的苦甜情绪。英文为主，默认选择录音室原版。",
    primaryTraits: [
      "旋律优先",
      "温暖有空间",
      "克制的苦甜感",
      "色彩和声",
      "松弛 Groove",
      "自然的人声与演奏痕迹",
      "怀旧但不守旧",
      "舒服但不无聊",
    ],
    clusters: [
      {
        name: "Neo-Soul / Alternative R&B / Soulful Pop",
        affinity: 0.96,
        signals: ["色彩和声", "温暖 bass", "松弛鼓点", "亲密人声"],
      },
      {
        name: "Indie / Singer-songwriter / Melodic Alternative",
        affinity: 0.92,
        signals: ["清晰旋律", "私人表达", "guitar 或 piano", "适度留白"],
      },
      {
        name: "Asian Alternative / City-Soul",
        affinity: 0.91,
        signals: ["都市感", "细腻复古", "旋律与编曲并重", "跨语言开放"],
      },
      {
        name: "Jazz Rap / Soulful Hip-Hop",
        affinity: 0.88,
        signals: ["Jazz 或 Soul sample", "叙事与自省", "mellow boom-bap", "旋律钩子"],
      },
      {
        name: "Ambient / Neo-Classical / Fingerstyle / Cinematic",
        affinity: 0.94,
        signals: ["明确主题旋律", "空间感", "温和动态", "时间与画面感"],
      },
      {
        name: "Melodic Rock / Classic Pop-Rock",
        affinity: 0.84,
        signals: ["大旋律", "guitar tone", "情绪推进", "日常乐队动态"],
      },
    ],
    anchorArtists: [
      "方大同",
      "Daniel Caesar",
      "SZA",
      "FKJ",
      "John Mayer",
      "落日飞车",
      "卢广仲",
      "Vaundy",
      "藤井風",
      "鹤 The Crane",
      "Bon Iver",
      "Novo Amor",
      "Nujabes",
      "Shing02",
      "蛋堡",
      "王以太",
      "The Sound Providers",
      "坂本龍一",
      "小瀬村晶",
      "Tony Anderson",
      "flawed mangoes",
      "Coldplay",
      "Oasis",
      "Green Day",
      "The Beatles",
      "LANY",
      "Isaac Gracie",
      "孙燕姿",
      "夏日入侵企画",
    ],
    bridgeArtists: [
      "FKJ",
      "方大同",
      "John Mayer",
      "Vaundy",
      "落日飞车",
      "Nujabes",
      "Kevin Abstract",
      "RAYE",
    ],
    softAvoids: [
      "大型 Drop 导向的 festival EDM",
      "极端 Metal、Hardcore 或噪音摇滚",
      "过度堆砌的最大化制作",
      "旋律稀薄、只有纹理的音乐",
      "过亮且缺少情绪深度的流行歌",
      "网络热歌或古风",
    ],
    transitionPriorities: ["情绪连续性", "音色与空间感", "能量", "和声色彩", "Groove", "流派"],
    languageMix: [
      { language: "en", ratio: 0.5 },
      { language: "zh", ratio: 0.3 },
      { language: "ja", ratio: 0.1 },
      { language: "ko", ratio: 0.1 },
    ],
    versionPreference: {
      studioFirst: true,
      avoid: [
        "Live、现场版或普通 Remix",
        "翻唱、Cover、Karaoke 或伴奏",
        "加速、降速、Sped Up、Slowed、Nightcore 或 Reverb 版本",
      ],
      allowWhenStronger: ["钢琴版", "Acoustic", "有明确重编曲价值的特殊版本"],
    },
    scenes: [
      {
        name: "上午工作",
        guidance:
          "清醒但不催促；中低能量、节奏清晰、旋律提神。优先温暖 Indie、Soul、轻巧 Hip-Hop 与明亮日系 Alternative，避免过度悲伤、爆发摇滚和密集人声。",
      },
      {
        name: "下午工作",
        guidance:
          "稳定推进、略有 Groove；允许 Neo-Soul、Alternative R&B、Jazz Rap 与 Melodic Rock 穿插，保持专注，不连续堆叠强情绪或高攻击性说唱。",
      },
      {
        name: "夜晚阅读",
        guidance:
          "留白、安静、低干扰；优先 piano、fingerstyle、Ambient、Neo-Classical 与轻声唱作。人声可有，但歌词与编曲不抢注意力，转场平缓。",
      },
      {
        name: "夜晚放松",
        guidance:
          "温暖、松弛、有余韵；优先 Neo-Soul、R&B、City-Soul、柔和 Indie 与旋律型 Rock。允许一点感伤，但不要推向沉重、焦虑或过度悲伤。",
      },
    ],
    libraryRatio: 0.7,
    discoveryRatio: 0.3,
    learningStartedAt: now,
    updatedAt: now,
  });
}
