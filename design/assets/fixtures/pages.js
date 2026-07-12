(function registerKoradioFixtures(global) {
  const pages = [
    {
      id: "01-service-offline",
      number: "01",
      title: "本地服务未连接",
      family: "exception",
      state: "offline",
      reference: "../../references/01-service-offline.png",
    },
    {
      id: "02-profile-select",
      number: "02",
      title: "本地档案选择",
      family: "profile",
      state: "select",
      reference: "../../references/02-profile-select.png",
    },
    {
      id: "03-profile-create",
      number: "03",
      title: "创建电台档案",
      family: "profile",
      state: "create",
      reference: "../../references/03-profile-create.png",
    },
    {
      id: "04-radio-empty",
      number: "04",
      title: "Radio 空节目",
      family: "radio",
      state: "empty",
      reference: "../../references/04-radio-empty.png",
    },
    {
      id: "05-radio-playing",
      number: "05",
      title: "Radio 正在播放",
      family: "radio",
      state: "playing",
      reference: "../../references/05-radio-playing.png",
    },
    {
      id: "06-radio-generating",
      number: "06",
      title: "Radio 生成中",
      family: "radio",
      state: "generating",
      reference: "../../references/06-radio-generating.png",
    },
    {
      id: "07-radio-detail-speaking",
      number: "07",
      title: "Detail Sheet · DJ 串讲",
      family: "detail",
      state: "speaking",
      reference: "../../references/07-radio-detail-speaking.png",
    },
    {
      id: "08-radio-detail-lyrics",
      number: "08",
      title: "Detail Sheet · 歌词跟随",
      family: "detail",
      state: "lyrics",
      reference: "../../references/08-radio-detail-lyrics.png",
    },
    {
      id: "09-library",
      number: "09",
      title: "Library 音乐库",
      family: "management",
      state: "default",
      reference: "../../references/09-library.png",
    },
    {
      id: "10-taste-overview",
      number: "10",
      title: "Taste 品味档案",
      family: "management",
      state: "overview",
      reference: "../../references/10-taste-overview.png",
    },
    {
      id: "11-taste-edit",
      number: "11",
      title: "Taste 编辑",
      family: "management",
      state: "edit",
      reference: "../../references/11-taste-edit.png",
    },
    {
      id: "12-programs-list",
      number: "12",
      title: "Programs 节目历史",
      family: "management",
      state: "list",
      reference: "../../references/12-programs-list.png",
    },
    {
      id: "13-program-detail",
      number: "13",
      title: "Program 历史详情",
      family: "management",
      state: "detail",
      reference: "../../references/13-program-detail.png",
    },
    {
      id: "14-settings-config",
      number: "14",
      title: "Settings 服务配置",
      family: "settings",
      state: "config",
      reference: "../../references/14-settings-config.png",
    },
    {
      id: "15-settings-diagnostics",
      number: "15",
      title: "Settings 连接检测",
      family: "settings",
      state: "diagnostics",
      reference: "../../references/15-settings-diagnostics.png",
    },
  ];

  const themes = [
    { id: "dark", label: "Dark" },
    { id: "light", label: "Light" },
    { id: "system", label: "System" },
  ];

  const viewports = [
    { id: "prototype", label: "Prototype · 960 × 1600", width: 960, height: 1600 },
    { id: "mobile", label: "Mobile · 390 × 844", width: 390, height: 844 },
    { id: "tablet", label: "Tablet · 834 × 1194", width: 834, height: 1194 },
    { id: "desktop", label: "Desktop · 1440 × 1200", width: 1440, height: 1200 },
  ];

  const freezeItems = (items) => Object.freeze(items.map((item) => Object.freeze(item)));

  global.KORADIO_FIXTURES = Object.freeze({
    pages: freezeItems(pages),
    themes: freezeItems(themes),
    viewports: freezeItems(viewports),
  });
})(window);
