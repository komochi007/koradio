import { tasteBlueprintSchema, type TasteBlueprint } from "@koradio/contracts";

export function createPersonalTasteBlueprint(profileId: string, now: string): TasteBlueprint {
  return tasteBlueprintSchema.parse({
    profileId,
    sourceLabel: "基于 taste.md 的三张歌单分析",
    version: "1.0",
    summary:
      "旋律优先、和声有颜色、松弛而有 Pocket 的律动；偏爱温暖、真实、有空间感的声音，以及克制但不失安慰的苦甜情绪。",
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
        affinity: 0.78,
        signals: ["大旋律", "guitar tone", "情绪释放", "乐队动态"],
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
      "持续高压、攻击性很强的 Trap",
      "极端 Metal、Hardcore 或噪音摇滚",
      "过度堆砌的最大化制作",
      "旋律稀薄、只有纹理的音乐",
      "过亮且缺少情绪深度的流行歌",
      "只靠噱头的 novelty song",
    ],
    transitionPriorities: ["情绪连续性", "音色与空间感", "能量", "和声色彩", "Groove", "流派"],
    scenes: [
      { name: "安静清晨", guidance: "低能量的 piano、acoustic、轻 Soul 或器乐，温暖而通透。" },
      {
        name: "咖啡与轻工作",
        guidance: "Jazz Pop、器乐 Hip-Hop、mellow R&B；保持低到中等歌词密度。",
      },
      {
        name: "城市散步",
        guidance: "City-Soul、Indie Pop、Neo-Soul 与松弛 Hip-Hop，带一点前进感。",
      },
      {
        name: "深夜",
        guidance: "Alternative R&B、Dream Pop、亲密唱作、Ambient 或 Jazz Rap，保持私密感。",
      },
      {
        name: "雨天沉思",
        guidance: "克制 Ballad、Piano、Acoustic 与 Cinematic Minimalism，避免纯绝望。",
      },
      {
        name: "需要一点提振",
        guidance: "Melodic Rock、Funk Soul、Upbeat Indie；振奋但不 festival 化。",
      },
      {
        name: "Hip-Hop",
        guidance: "优先 Jazz Rap、Soulful Rap、叙事性与旋律性强的作品；Trap 只作少量点缀。",
      },
      {
        name: "深度专注",
        guidance:
          "Neo-Classical、Fingerstyle、Game 或 Film Score、Melodic Lo-fi；人声比例保持很低。",
      },
    ],
    libraryRatio: 0.7,
    discoveryRatio: 0.3,
    learningStartedAt: now,
    updatedAt: now,
  });
}
