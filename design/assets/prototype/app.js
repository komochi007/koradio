(function startKoradioPreview() {
  const fixtures = window.KORADIO_FIXTURES;

  if (!fixtures) {
    throw new Error("Koradio fixtures are unavailable.");
  }

  const elements = {
    controls: document.querySelector("#preview-controls"),
    pageSelect: document.querySelector("#page-select"),
    variantControl: document.querySelector("#variant-control"),
    variantSelect: document.querySelector("#variant-select"),
    themeSelect: document.querySelector("#theme-select"),
    viewportSelect: document.querySelector("#viewport-select"),
    pageFamily: document.querySelector("#page-family"),
    pageState: document.querySelector("#page-state"),
    referenceLink: document.querySelector("#reference-link"),
    copyLink: document.querySelector("#copy-link"),
    stageTitle: document.querySelector("#stage-title"),
    viewportOutput: document.querySelector("#viewport-output"),
    scaleOutput: document.querySelector("#scale-output"),
    scaleButtons: [...document.querySelectorAll("[data-scale-mode]")],
    overlayToggle: document.querySelector("#overlay-toggle"),
    overlayOpacity: document.querySelector("#overlay-opacity"),
    overlayHint: document.querySelector("#overlay-hint"),
    viewport: document.querySelector("#preview-viewport"),
    canvas: document.querySelector("#prototype-canvas"),
  };

  const previewState = {
    scaleMode: "fit",
    selection: null,
  };

  const icon = (name) => {
    const paths = {
      arrow: '<path d="M5 12h14M14 7l5 5-5 5"/>',
      back: '<path d="m15 18-6-6 6-6"/>',
      lock: '<rect x="5.5" y="10" width="13" height="10" rx="2"/><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10M12 14v2"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      close: '<path d="m8 8 8 8M16 8l-8 8"/>',
      moon: '<path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z"/>',
      mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4M9 21h6"/>',
      send: '<path d="m21 3-7.2 18-3.7-7.1L3 10.2 21 3Z"/><path d="m10.1 13.9 4.6-4.6"/>',
      heart: '<path d="M20.8 4.7a5.4 5.4 0 0 0-7.6 0L12 5.9l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.7a5.4 5.4 0 0 0 0-7.6Z"/>',
      more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
      previous: '<path d="M6 5v14M18 6l-8 6 8 6V6Z"/>',
      next: '<path d="M18 5v14M6 6l8 6-8 6V6Z"/>',
      pause: '<path d="M9 5v14M15 5v14"/>',
      volume: '<path d="M11 5 6.5 9H3v6h3.5L11 19V5ZM15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11"/>',
      queue: '<path d="M4 6h12M4 12h12M4 18h8M18 15l3 3-3 3"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
      play: '<path d="m9 6 9 6-9 6V6Z"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
      retry: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
      edit: '<path d="m4 20 4.2-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z"/><path d="m14.5 6.7 2.8 2.8"/>',
      wave: '<path d="M4 12h2l2-6 4 12 3-9 2 6h3"/>',
      minus: '<path d="M5 12h14"/>',
      train: '<path d="M7 3h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z"/><path d="M4 9h16M8 21l2-3M16 21l-2-3"/><circle cx="8" cy="14" r="1"/><circle cx="16" cy="14" r="1"/>',
      lamp: '<path d="M8 3h8l3 8H5l3-8ZM12 11v7M8 21h8"/>',
      skip: '<path d="m5 5 10 7L5 19V5ZM19 5v14"/>',
      bookmark: '<path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4V4Z"/>',
      grip: '<circle cx="9" cy="7" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="17" r="1"/><circle cx="15" cy="17" r="1"/>',
      trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>',
      alert: '<path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5M12 17h.01"/>',
      eye: '<path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>',
      chevron: '<path d="m9 6 6 6-6 6"/>',
      down: '<path d="m6 9 6 6 6-6"/>',
      folder: '<path d="M3 7.5h7l2-2h9v13H3v-11Z"/>',
    };

    return `<svg class="kr-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
  };

  const brand = ({ mark = true } = {}) => `
    <span class="kr-brand" aria-label="Koradio">
      ${mark ? '<span class="kr-brand__mark" aria-hidden="true"></span>' : ""}
      <span class="kr-brand__wordmark">KORADIO</span>
    </span>
  `;

  const settingsButton = () => `
    <button class="kr-icon-button" type="button" aria-label="打开 Settings">
      <span class="kr-tool-icon--settings" aria-hidden="true"></span>
    </button>
  `;

  const nav = (active = "radio") => `
    <nav class="kr-nav prototype-nav" aria-label="主要导航">
      <button class="kr-nav__item${active === "radio" ? " kr-nav__item--active" : ""}" type="button" data-tooltip="Radio" aria-label="Radio${active === "radio" ? "，当前页面" : ""}"${active === "radio" ? ' aria-current="page"' : ""}>
        <span class="kr-tab-icon kr-tab-icon--radio" aria-hidden="true"></span>
      </button>
      <button class="kr-nav__item${active === "library" ? " kr-nav__item--active" : ""}" type="button" data-tooltip="Library" aria-label="Library${active === "library" ? "，当前页面" : ""}"${active === "library" ? ' aria-current="page"' : ""}>
        <span class="kr-tab-icon kr-tab-icon--library" aria-hidden="true"></span>
      </button>
      <button class="kr-nav__item${active === "taste" ? " kr-nav__item--active" : ""}" type="button" data-tooltip="Taste" aria-label="Taste${active === "taste" ? "，当前页面" : ""}"${active === "taste" ? ' aria-current="page"' : ""}>
        <span class="kr-tab-icon kr-tab-icon--taste" aria-hidden="true"></span>
      </button>
      <button class="kr-nav__item${active === "programs" ? " kr-nav__item--active" : ""}" type="button" data-tooltip="Programs" aria-label="Programs${active === "programs" ? "，当前页面" : ""}"${active === "programs" ? ' aria-current="page"' : ""}>
        <span class="kr-tab-icon kr-tab-icon--programs" aria-hidden="true"></span>
      </button>
      <button class="kr-nav__item${active === "settings" ? " kr-nav__item--active" : ""}" type="button" data-tooltip="Settings" aria-label="Settings${active === "settings" ? "，当前页面" : ""}"${active === "settings" ? ' aria-current="page"' : ""}>
        <span class="kr-tab-icon kr-tab-icon--settings" aria-hidden="true"></span>
      </button>
    </nav>
  `;

  const renderOffline = () => {
    const content = fixtures.visualContent.offline;
    return `
      <div class="prototype-page prototype-page--offline">
        <header class="prototype-topbar prototype-topbar--wide kr-topbar">
          ${brand()}
          <button class="kr-icon-button prototype-theme-button" type="button" aria-label="切换主题"><span aria-hidden="true">◐</span></button>
        </header>
        <main class="offline-panel">
          <div class="offline-signal" aria-hidden="true">
            <span class="offline-signal__ring"></span>
            <span class="offline-signal__break offline-signal__break--top"></span>
            <span class="offline-signal__break offline-signal__break--bottom"></span>
            <span class="offline-signal__wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
          </div>
          <p class="kr-status kr-status--offline offline-status"><span class="kr-status__dot" aria-hidden="true"></span><span>${content.status}</span></p>
          <h1 class="kr-h1">${content.title}</h1>
          <p class="kr-body offline-description">${content.description}</p>
          <div class="offline-actions">
            <button class="kr-button kr-button--large kr-button--primary" type="button">${content.primaryAction}</button>
            <button class="kr-button kr-button--large kr-button--secondary" type="button">${content.secondaryAction}</button>
          </div>
          <div class="offline-diagnostics" aria-label="诊断信息">
            ${content.diagnostics.map((line) => `<p>${line}</p>`).join("")}
          </div>
        </main>
        ${nav("settings")}
      </div>
    `;
  };

  const profileCard = (profile) => `
    <article class="profile-card kr-card${profile.current ? " profile-card--current" : ""}">
      <span class="profile-avatar profile-avatar--${profile.avatar}" aria-hidden="true"><i></i></span>
      <div class="profile-card__content">
        <h2 class="kr-h3">${profile.radioName}</h2>
        <p class="kr-body-small kr-text-secondary">${profile.nickname}</p>
        <div class="profile-tags" aria-label="常听风格">
          ${profile.genres.map((genre) => `<span>${genre}</span>`).join("")}
        </div>
      </div>
      <div class="profile-card__action">
        ${profile.current ? '<p class="profile-current"><i aria-hidden="true"></i>CURRENT</p>' : ""}
        <button class="profile-enter" type="button" aria-label="进入 ${profile.radioName}">${icon("arrow")}</button>
      </div>
    </article>
  `;

  const renderProfileSelect = () => `
    <div class="prototype-page prototype-page--profile-select">
      <header class="prototype-topbar kr-topbar">
        ${brand()}
        ${settingsButton()}
      </header>
      <main class="profile-select-main">
        <div class="profile-heading">
          <h1 class="kr-h1">选择你的电台档案</h1>
          <p class="kr-body kr-text-secondary">每个档案都会独立保存音乐品味、节目历史与服务偏好。</p>
        </div>
        <div class="profile-list">
          ${fixtures.visualContent.profiles.map(profileCard).join("")}
        </div>
        <button class="profile-create-card" type="button">
          <span class="profile-create-card__icon" aria-hidden="true">${icon("plus")}</span>
          <span class="profile-create-card__copy"><strong>创建新的电台档案</strong><small>为另一位听众建立独立的本地空间</small></span>
        </button>
        <p class="profile-privacy kr-body-small kr-text-secondary">${icon("lock")}<span>所有档案、品味和节目记录仅保存在这台设备上。</span></p>
      </main>
    </div>
  `;

  const renderGenre = (genre) => `
    <button class="profile-genre" type="button" aria-label="移除 ${genre}">
      <span>${genre}</span><span class="profile-genre__remove" aria-hidden="true">${icon("close")}</span>
    </button>
  `;

  const renderProfileCreate = () => {
    const draft = fixtures.visualContent.profileDraft;
    return `
      <div class="prototype-page prototype-page--profile-create">
        <header class="prototype-topbar profile-create-topbar kr-topbar">
          <div class="profile-create-topbar__brand">
            <button class="kr-icon-button" type="button" aria-label="返回档案选择">${icon("back")}</button>
            ${brand({ mark: false })}
          </div>
        </header>
        <main class="profile-create-main">
          <div class="profile-heading profile-create-heading">
            <h1 class="kr-h1">创建电台档案</h1>
            <p class="kr-body kr-text-secondary">先留下少量线索，Koradio 会在之后的播放和反馈中继续理解你。</p>
          </div>
          <form class="profile-form">
            <fieldset class="profile-form__avatar">
              <legend>头像</legend>
              <span class="profile-upload-avatar" aria-hidden="true"><i></i></span>
              <div>
                <button class="kr-button kr-button--secondary" type="button">选择头像</button>
                <p class="kr-body-small kr-text-secondary">支持本地 JPG、PNG，不会上传到云端</p>
              </div>
            </fieldset>
            <label class="kr-field">
              <span class="kr-field__label profile-form__label">电台名称</span>
              <span class="profile-input-wrap"><input class="kr-input kr-input--focus" value="${draft.radioName}" readonly /><span class="profile-count">14 / 24</span></span>
            </label>
            <label class="kr-field">
              <span class="kr-field__label profile-form__label">你的昵称</span>
              <input class="kr-input" value="${draft.nickname}" readonly />
            </label>
            <fieldset class="profile-form__genres">
              <legend>常听风格</legend>
              <div class="profile-genres">
                ${draft.genres.map(renderGenre).join("")}
                <button class="profile-genre profile-genre--add" type="button">${icon("plus")}<span>添加风格</span></button>
              </div>
              <p class="kr-body-small kr-text-secondary">最多选择 12 个标签</p>
            </fieldset>
            <label class="kr-field">
              <span class="kr-field__label profile-form__label">默认场景</span>
              <span class="profile-textarea-wrap"><textarea class="kr-input profile-textarea" readonly>${draft.scene}</textarea><span class="profile-count">38 / 120</span></span>
            </label>
            <p class="profile-privacy profile-form__privacy kr-body-small kr-text-secondary">${icon("lock")}<span>档案、播放历史与音乐偏好将保存在本地数据目录中。</span></p>
            <div class="profile-form__actions">
              <button class="kr-button kr-button--large kr-button--primary" type="button">保存并进入 Koradio</button>
              <button class="kr-button kr-button--large kr-button--ghost" type="button">稍后设置偏好</button>
            </div>
          </form>
        </main>
      </div>
    `;
  };

  const radioWaveform = () => `
    <div class="kr-waveform radio-waveform" aria-hidden="true">
      ${Array.from({ length: 20 }, (_, index) => `<span style="--kr-wave-index: ${index}"></span>`).join("")}
    </div>
  `;

  const radioTopbar = () => `
    <header class="prototype-topbar prototype-topbar--wide radio-topbar kr-topbar">
      ${brand()}
      <div class="radio-topbar__tools">
        <span class="radio-top-avatar" role="img" aria-label="After Midnight 档案头像"><i></i></span>
        <button class="kr-icon-button" type="button" aria-label="切换主题">${icon("moon")}</button>
      </div>
    </header>
  `;

  const radioTime = (content, state) => `
    <section class="radio-time" aria-label="当前时间与电台状态">
      <p class="radio-time__clock">${content.time}</p>
      <p class="radio-time__date">${content.date}</p>
      <p class="kr-status radio-time__status radio-time__status--${state}">
        <span class="kr-status__dot" aria-hidden="true"></span><span>${content[state].status}</span>
      </p>
    </section>
  `;

  const renderRadioEmptyMain = (state) => `
    <main class="radio-main radio-main--empty">
      <p class="radio-eyebrow">${state.eyebrow}</p>
      <h1>${state.title}</h1>
      <p>${state.description}</p>
    </main>
  `;

  const renderRadioPlayer = (state) => `
    <main class="radio-main radio-main--playing">
      <article class="kr-card kr-card--radio radio-player" aria-label="当前播放">
        <div class="radio-player__topline">
          <span class="radio-cover" aria-hidden="true"><i></i></span>
          <div class="radio-player__meta">
            <p class="radio-eyebrow">NOW PLAYING</p>
            <h1>${state.track.title}</h1>
            <p>${state.track.subtitle}</p>
          </div>
          <div class="radio-player__actions">
            <button class="kr-icon-button" type="button" aria-label="收藏当前歌曲">${icon("heart")}</button>
            <button class="kr-icon-button" type="button" aria-label="更多播放操作">${icon("more")}</button>
          </div>
        </div>
        <div class="radio-player__progress">
          <span>${state.track.elapsed}</span><span class="kr-progress" style="--kr-progress: 66%"></span><span>${state.track.duration}</span>
        </div>
        <div class="radio-player__controls" aria-label="播放控制">
          <button class="kr-icon-button" type="button" aria-label="音量">${icon("volume")}</button>
          <button class="kr-icon-button" type="button" aria-label="上一首">${icon("previous")}</button>
          <button class="radio-player__pause" type="button" aria-label="暂停">${icon("pause")}</button>
          <button class="kr-icon-button" type="button" aria-label="下一首">${icon("next")}</button>
          <button class="kr-icon-button" type="button" aria-label="播放队列">${icon("queue")}</button>
        </div>
      </article>
    </main>
  `;

  const renderRadioGeneratingMain = (state) => `
    <main class="radio-main radio-main--generating" aria-live="polite">
      <p class="radio-eyebrow">${state.eyebrow}</p>
      <h1>${state.title}</h1>
      ${radioWaveform()}
      <p>${state.description}</p>
    </main>
  `;

  const renderRadioQueue = (content, state) => {
    const queue = state === "playing" ? content.playing.queue : [];
    const rows = state === "generating"
      ? Array.from({ length: 4 }, (_, index) => `
          <li class="radio-queue__row radio-queue__row--skeleton" aria-hidden="true">
            <span></span><span><i></i><i></i></span><span></span>
          </li>
        `).join("")
      : queue.map((track) => `
          <li class="radio-queue__row${track.current ? " radio-queue__row--current" : ""}">
            <span class="radio-queue__number">${track.current ? '<i aria-label="正在播放"><b></b><b></b><b></b></i>' : track.number}</span>
            <span class="radio-queue__track"><strong>${track.title}</strong><small>${track.artist}</small></span>
            <span class="radio-queue__duration">${track.duration}</span>
          </li>
        `).join("");
    const stateContent = content[state];

    return `
      <section class="radio-queue radio-queue--${state}" aria-label="播放队列">
        <header class="radio-queue__header">
          <h2>${stateContent.queueLabel}</h2>
          ${state === "empty" ? `<button type="button">${stateContent.queueAction}</button>` : state === "playing" ? `<button type="button">${stateContent.queueAction}</button>` : '<span>BUILDING</span>'}
        </header>
        ${state === "empty" ? `<div class="radio-queue__empty"><span aria-hidden="true">${icon("queue")}</span><p>${stateContent.queueMessage}</p></div>` : `<ol class="kr-queue radio-queue__list">${rows}</ol>`}
      </section>
    `;
  };

  const renderRadioDjStatus = (state, mode) => `
    <button class="kr-dj-status radio-dj-status radio-dj-status--${mode}" type="button" aria-label="DJ 状态：${state.djStatus}">
      <span class="kr-dj-status__state"><i aria-hidden="true"></i><strong>DJ</strong><span>${state.djStatus}</span></span>
      <span class="kr-dj-status__arrow" aria-hidden="true">⌃</span>
    </button>
  `;

  const renderRadioDialogue = (content, state, mode) => `
    <section class="radio-dialogue radio-dialogue--${mode}" aria-label="DJ 对话"${mode === "generating" ? ' aria-live="polite"' : ""}>
      ${mode === "playing" || mode === "generating" ? `<p class="radio-user-bubble">${content.userScene}</p>` : ""}
      <div class="radio-dj-copy">
        <span class="radio-dj-copy__label">DJ</span>
        <p>${state.djCopy}</p>
        ${mode === "playing" ? `<span class="radio-dj-copy__meta">${state.djMeta}</span>` : ""}
        ${mode === "generating" ? '<span class="radio-tuning-dots" aria-hidden="true"><i></i><i></i><i></i></span>' : ""}
      </div>
    </section>
  `;

  const renderRadioInput = (state, mode) => {
    const disabled = mode === "generating" ? " disabled" : "";
    return `
      <div class="radio-scene-input${disabled ? " radio-scene-input--disabled" : ""}">
        <input type="text" placeholder="${state.input}" aria-label="告诉 DJ 当前场景" readonly${disabled} />
        <button class="kr-icon-button" type="button" aria-label="使用语音输入"${disabled}>${icon("mic")}</button>
        <button class="radio-scene-input__send" type="button" aria-label="发送给 DJ"${disabled}>${icon("send")}</button>
      </div>
    `;
  };

  const renderRadio = (state) => {
    const content = fixtures.visualContent.radio;
    const stateContent = content[state];
    const main = state === "empty"
      ? renderRadioEmptyMain(stateContent)
      : state === "playing"
        ? renderRadioPlayer(stateContent)
        : renderRadioGeneratingMain(stateContent);

    return `
      <div class="prototype-page prototype-page--radio prototype-page--radio-${state}">
        ${radioTopbar()}
        ${radioTime(content, state)}
        ${main}
        ${renderRadioQueue(content, state)}
        ${renderRadioDjStatus(stateContent, state)}
        ${renderRadioDialogue(content, stateContent, state)}
        ${renderRadioInput(stateContent, state)}
        ${nav("radio")}
      </div>
    `;
  };

  const detailWaveformBars = 64;
  const detailTimelineBars = 96;

  const detailWaveform = () => `
    <div class="detail-waveform" aria-hidden="true">
      ${Array.from({ length: detailWaveformBars }, (_, index) => {
        const height = 28 + ((index * 19) % 43);
        return `<span${index % 2 === 1 ? ' class="detail-waveform__active"' : ""} style="--detail-wave-height: ${height}%"></span>`;
      }).join("")}
    </div>
  `;

  const detailTimeline = (progress) => `
    <div class="detail-program-progress" role="progressbar" aria-label="节目整体进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Number.parseInt(progress, 10)}">
      ${Array.from({ length: detailTimelineBars }, (_, index) => {
        const height = 24 + ((index * 17) % 58);
        const played = index < Math.round(detailTimelineBars * Number.parseInt(progress, 10) / 100);
        return `<span${played ? ' class="detail-program-progress__played"' : ""} style="--detail-timeline-height: ${height}%"></span>`;
      }).join("")}
    </div>
  `;

  const detailCopy = (content, mode) => {
    if (mode === "speaking") {
      return content.lines.map((line) => {
        const copy = line.state === "current"
          ? line.copy.replace("呼吸", '<span class="detail-copy__highlight">呼吸</span>')
          : line.copy;
        return `
          <div class="detail-script-line detail-copy__line--${line.state}">
            <p class="detail-script-line__meta">${line.meta}</p>
            <p>${copy}</p>
          </div>
        `;
      }).join("");
    }

    return content.lines.map((line) => {
      const copy = line.state === "current"
        ? line.copy.replace("light", '<span class="detail-copy__highlight">light</span>')
        : line.copy;
      return `<p class="detail-lyric-line detail-copy__line--${line.state}">${copy}</p>`;
    }).join("");
  };

  const renderDetail = (mode) => {
    const detail = fixtures.visualContent.detail;
    const content = detail[mode];
    return `
      <div class="prototype-page prototype-page--detail prototype-page--detail-${mode}" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <span class="detail-drag-handle" aria-hidden="true"></span>
        <button class="detail-close" type="button" aria-label="关闭节目详情，播放继续">${icon("close")}</button>
        <p class="detail-status" aria-live="polite"><span aria-hidden="true"></span>${content.status}</p>
        ${detailWaveform()}
        <section class="detail-paper">
          <h1 id="detail-title">${detail.title}</h1>
          <p class="detail-track">${content.track}</p>
          <div class="detail-track-progress" role="progressbar" aria-label="歌曲进度 ${content.elapsed} / ${content.duration}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Number.parseInt(content.trackProgress, 10)}">
            <span>${content.elapsed}</span>
            <i style="--detail-track-progress: ${content.trackProgress}"></i>
            <span>${content.duration}</span>
          </div>
          <article class="detail-copy detail-copy--${mode}" aria-label="${mode === "speaking" ? "DJ 串讲词" : "跟随歌词"}">
            ${detailCopy(content, mode)}
          </article>
          ${detailTimeline(content.programProgress)}
          <button class="detail-play" type="button" aria-label="暂停当前节目">${icon("pause")}</button>
        </section>
      </div>
    `;
  };

  const libraryTrack = (track) => `
    <li class="library-track">
      <span class="library-cover library-cover--${track.cover}" aria-hidden="true"><i></i></span>
      <span class="library-track__meta">
        <strong>${track.title}</strong>
        <small>${track.artist} · ${track.album}</small>
      </span>
      <span class="library-track__duration">${track.duration}</span>
      <button class="library-track__play" type="button" aria-label="试听 ${track.title}">${icon("play")}</button>
      ${track.added
        ? `<span class="library-track__added"><i aria-hidden="true">${icon("check")}</i>已加入</span>`
        : `<button class="kr-button kr-button--compact kr-button--secondary library-track__add" type="button">加入候选池</button>`}
    </li>
  `;

  const libraryStatePanel = (variant) => {
    const states = {
      empty: {
        symbol: icon("list"),
        title: "还没有导入音乐",
        copy: "可以先搜索一首歌，或导入你的网易云歌单。",
        action: "搜索一首歌",
      },
      "no-results": {
        symbol: icon("search"),
        title: "没有找到相关歌曲",
        copy: "换个关键词试试，也可以直接导入熟悉的网易云歌单。",
        action: "清除关键词",
      },
      "service-error": {
        symbol: icon("retry"),
        title: "网易云 API 暂不可用",
        copy: "搜索内容已保留。请稍后重试，或前往 Settings 检查服务配置。",
        action: "重新搜索",
      },
    };
    const state = states[variant];
    return `
      <section class="library-state library-state--${variant}" aria-live="polite">
        <span class="library-state__symbol" aria-hidden="true">${state.symbol}</span>
        <div>
          <h2>${state.title}</h2>
          <p>${state.copy}</p>
        </div>
        <button class="kr-button kr-button--secondary" type="button">${state.action}</button>
        ${variant === "service-error" ? '<button class="kr-button kr-button--ghost" type="button">前往 Settings</button>' : ""}
      </section>
    `;
  };

  const libraryImportCard = (content, variant) => {
    const importing = variant === "importing";
    const serviceError = variant === "service-error";
    const status = serviceError ? "OFFLINE" : importing ? "IMPORTING" : "CONNECTED";
    return `
      <section class="library-import kr-card library-import--${serviceError ? "error" : importing ? "importing" : "ready"}" aria-labelledby="library-import-title">
        <header>
          <div>
            <h2 id="library-import-title">导入网易云歌单</h2>
            <p>粘贴歌单链接或 ID，将可用歌曲加入本地候选池。</p>
          </div>
          <p class="kr-status ${serviceError ? "kr-status--error" : importing ? "kr-status--info" : "kr-status--success"}">
            <span class="kr-status__dot" aria-hidden="true"></span><span>${status}</span>
          </p>
        </header>
        <div class="library-import__controls">
          <input class="kr-input${serviceError ? " kr-input--error" : ""}" value="${importing || serviceError ? content.importValue : ""}" placeholder="粘贴歌单链接或 ID" aria-label="网易云歌单链接或 ID" readonly${importing ? " disabled" : ""} />
          <button class="kr-button kr-button--large kr-button--secondary" type="button"${importing || serviceError ? " disabled" : ""}>${importing ? "正在导入" : "导入歌单"}</button>
        </div>
        ${importing ? '<div class="library-import__progress" aria-live="polite"><span class="library-import__progress-line"><i></i></span><p>正在从网易云获取音乐… · 已写入 18 / 46</p></div>' : ""}
        ${serviceError ? '<p class="library-import__message">网易云连接失败，请稍后重试。输入内容已保留。</p>' : ""}
      </section>
    `;
  };

  const librarySources = (sources) => `
    <section class="library-sources" aria-labelledby="library-sources-title">
      <h2 id="library-sources-title">已导入来源</h2>
      <ul>
        ${sources.map((source) => `
          <li>
            <span class="library-source__icon" aria-hidden="true">${icon("list")}</span>
            <strong>${source.name} · <small>${source.count}</small></strong>
            <span>${source.updatedAt}</span>
            <button type="button" aria-label="${source.name} 更多操作">${icon("more")}</button>
          </li>
        `).join("")}
      </ul>
    </section>
  `;

  const renderLibrary = (variant = "results") => {
    const content = fixtures.visualContent.library;
    const showResults = variant === "results" || variant === "importing";
    const showSources = variant !== "empty";
    const searchValue = variant === "no-results" ? content.noResultsQuery : variant === "service-error" ? "Beach House" : "";
    return `
      <div class="prototype-page prototype-page--library prototype-page--library-${variant}">
        <header class="prototype-topbar library-topbar kr-topbar">
          ${brand()}
          ${settingsButton()}
        </header>
        <main class="library-main">
          <header class="library-heading">
            <div>
              <h1 class="kr-h1">音乐库</h1>
              <p class="kr-body kr-text-secondary">管理 Koradio 可以搜索、试播和用于节目策展的音乐来源。</p>
            </div>
            <p>${variant === "empty" ? "0 TRACKS" : content.localCount}</p>
          </header>
          <label class="library-search${variant === "service-error" ? " library-search--error" : ""}">
            <span aria-hidden="true">${icon("search")}</span>
            <input value="${searchValue}" placeholder="${content.query}" aria-label="搜索歌曲、歌手或专辑" readonly />
            ${searchValue ? '<button type="button" aria-label="清除搜索">×</button>' : '<kbd>⌘ K</kbd>'}
          </label>
          <section class="library-results" aria-labelledby="library-results-title">
            <h2 id="library-results-title">${showResults ? `搜索结果 · ${content.tracks.length}` : variant === "empty" ? "本地音乐" : "搜索结果"}</h2>
            ${showResults
              ? `<ol>${content.tracks.map(libraryTrack).join("")}</ol>`
              : libraryStatePanel(variant)}
          </section>
          ${libraryImportCard(content, variant)}
          ${showSources ? librarySources(content.sources) : ""}
        </main>
        ${nav("library")}
      </div>
    `;
  };

  const tasteSectionHeading = (id, title, meta = "") => `
    <header class="taste-section-heading">
      <h2 id="${id}">${title}</h2>
      ${meta ? `<p>${meta}</p>` : ""}
    </header>
  `;

  const tasteOverviewHeading = () => `
    <header class="taste-heading">
      <div>
        <h1 class="kr-h1">你的音乐品味</h1>
        <p>由播放、跳过、喜欢和导入来源逐步形成。</p>
      </div>
      <button class="kr-button kr-button--secondary taste-edit-button" type="button">${icon("edit")}<span>编辑品味</span></button>
    </header>
  `;

  const tasteStatePanel = (variant) => {
    const states = {
      loading: {
        symbol: icon("wave"),
        title: "正在读取音乐品味",
        copy: "正在整理播放、反馈和导入来源。",
      },
      empty: {
        symbol: icon("plus"),
        title: "播放和反馈后会在这里形成你的音乐品味",
        copy: "从一段符合当下场景的节目开始，Koradio 会逐步整理你的偏好。",
        action: "去 Radio 开始播放",
      },
      "load-error": {
        symbol: icon("alert"),
        title: "无法读取当前档案的音乐品味",
        copy: "档案内容没有被修改。请重新选择档案后再试。",
        action: "重新选择档案",
      },
    };
    const state = states[variant];
    return `
      <section class="taste-state taste-state--${variant}" aria-live="polite">
        <span class="taste-state__symbol" aria-hidden="true">${state.symbol}</span>
        <div>
          <h2>${state.title}</h2>
          <p>${state.copy}</p>
        </div>
        ${state.action ? `<button class="kr-button kr-button--secondary" type="button">${state.action}</button>` : ""}
        ${variant === "loading" ? '<div class="taste-state__skeleton" aria-hidden="true"><i></i><i></i><i></i></div>' : ""}
      </section>
    `;
  };

  const tasteTrait = (trait) => `
    <li class="taste-trait${trait.highest ? " taste-trait--highest" : ""}">
      <span>${trait.label}</span>
      <span class="taste-trait__track" aria-hidden="true"><i style="--taste-value: ${trait.value}%"></i></span>
      <strong>${trait.value}%</strong>
    </li>
  `;

  const tasteSceneIcon = (id) => ({ night: "moon", commute: "train", weekend: "lamp" }[id]);
  const tasteFeedbackIcon = (type) => ({ like: "heart", skip: "skip", favorite: "bookmark" }[type]);

  const renderTasteOverviewContent = (content) => `
    <section class="taste-overview" aria-labelledby="taste-overview-title">
      ${tasteSectionHeading("taste-overview-title", "品味概览")}
      <article class="taste-overview-card kr-card">
        <p>${content.summary}</p>
        <ul>${content.traits.map(tasteTrait).join("")}</ul>
      </article>
    </section>
    <section class="taste-genres" aria-labelledby="taste-genres-title">
      ${tasteSectionHeading("taste-genres-title", "常听风格", `${content.genres.length} 个标签`)}
      <div class="taste-tag-cloud">${content.genres.map((genre) => `<span>${genre}</span>`).join("")}</div>
    </section>
    <div class="taste-preference-grid">
      <section aria-labelledby="taste-sounds-title">
        ${tasteSectionHeading("taste-sounds-title", "喜欢的声音")}
        <ul class="taste-rule-card taste-rule-card--positive">${content.sounds.map((sound) => `<li>${icon("wave")}<span>${sound}</span></li>`).join("")}</ul>
      </section>
      <section aria-labelledby="taste-avoid-title">
        ${tasteSectionHeading("taste-avoid-title", "避雷规则")}
        <ul class="taste-rule-card taste-rule-card--avoid">${content.avoidRules.map((rule) => `<li>${icon("minus")}<span>${rule}</span></li>`).join("")}</ul>
      </section>
    </div>
    <section class="taste-scenes" aria-labelledby="taste-scenes-title">
      ${tasteSectionHeading("taste-scenes-title", "场景偏好")}
      <div class="taste-scene-grid">
        ${content.scenes.map((scene) => `
          <article>
            <span aria-hidden="true">${icon(tasteSceneIcon(scene.id))}</span>
            <div><h3>${scene.name}</h3><p>${scene.description}</p></div>
          </article>
        `).join("")}
      </div>
    </section>
    <section class="taste-feedback" aria-labelledby="taste-feedback-title">
      ${tasteSectionHeading("taste-feedback-title", "最近反馈", "用于下一次节目")}
      <ul>
        ${content.feedback.map((item) => `
          <li><span aria-hidden="true">${icon(tasteFeedbackIcon(item.type))}</span><strong>${item.label}</strong><time>${item.time}</time></li>
        `).join("")}
      </ul>
    </section>
  `;

  const renderTasteOverview = (variant = "formed") => {
    const content = fixtures.visualContent.taste;
    return `
      <div class="prototype-page prototype-page--taste prototype-page--taste-${variant}">
        <header class="prototype-topbar taste-topbar kr-topbar">${brand()}${settingsButton()}</header>
        <main class="taste-main">
          ${tasteOverviewHeading()}
          ${variant === "formed" ? renderTasteOverviewContent(content) : tasteStatePanel(variant)}
        </main>
        ${nav("taste")}
      </div>
    `;
  };

  const tasteEditTag = (genre) => `
    <button class="taste-edit-tag" type="button" aria-label="移动或移除 ${genre}">
      <span aria-hidden="true">${icon("grip")}</span><strong>${genre}</strong><span aria-hidden="true">${icon("close")}</span>
    </button>
  `;

  const renderTasteEdit = (variant = "editing") => {
    const content = fixtures.visualContent.taste.edit;
    const saving = variant === "saving";
    const saveError = variant === "save-error";
    return `
      <div class="prototype-page prototype-page--taste-edit prototype-page--taste-edit-${variant}">
        <header class="prototype-topbar taste-edit-topbar kr-topbar">
          <button class="kr-icon-button" type="button" aria-label="返回音乐品味">${icon("back")}</button>
          ${brand({ mark: false })}
        </header>
        <main class="taste-edit-main">
          <header class="taste-edit-heading">
            <h1 class="kr-h1">编辑音乐品味</h1>
            <p>${content.updatedAt}</p>
          </header>
          <section class="taste-edit-genres" aria-labelledby="taste-edit-genres-title">
            ${tasteSectionHeading("taste-edit-genres-title", "常听风格", `${content.genres.length} / 30`)}
            <p class="taste-edit-help">最多 30 个标签，可拖动调整优先级。</p>
            <div class="taste-edit-tags">
              ${content.genres.map(tasteEditTag).join("")}
              <button class="taste-edit-tag taste-edit-tag--add" type="button">${icon("plus")}<strong>添加标签</strong></button>
            </div>
          </section>
          <section class="taste-edit-avoid" aria-labelledby="taste-edit-avoid-title">
            ${tasteSectionHeading("taste-edit-avoid-title", "避雷规则", `${content.avoidRules.length} / 20`)}
            <div class="taste-edit-rule-list">
              ${content.avoidRules.map((rule, index) => `
                <label><span aria-hidden="true">${icon("grip")}</span><input value="${rule}" aria-label="避雷规则 ${index + 1}" readonly /><button type="button" aria-label="删除规则：${rule}">${icon("trash")}</button></label>
              `).join("")}
              <button class="taste-edit-add-row" type="button">${icon("plus")}<span>添加避雷规则</span><small>最多 120 字</small></button>
            </div>
          </section>
          <section class="taste-edit-scenes" aria-labelledby="taste-edit-scenes-title">
            ${tasteSectionHeading("taste-edit-scenes-title", "场景偏好", `${content.scenes.length} / 20`)}
            <div class="taste-edit-scene-list">
              ${content.scenes.map((scene) => `
                <article class="taste-edit-scene${scene.focused ? " taste-edit-scene--focus" : ""}">
                  <span aria-hidden="true">${icon("grip")}</span>
                  <label><span>场景名称</span><input value="${scene.name}" readonly /></label>
                  <label><span>偏好描述</span><textarea readonly>${scene.description}</textarea></label>
                  <button type="button" aria-label="${scene.name} 更多操作">${icon("more")}</button>
                </article>
              `).join("")}
            </div>
          </section>
        </main>
        <footer class="taste-edit-action${saveError ? " taste-edit-action--error" : ""}">
          <div class="taste-edit-action__inner">
            <p aria-live="polite">${saveError ? `${icon("alert")}<span>保存失败，内容已保留</span>` : "修改将在下一次节目生成时生效"}</p>
            <div>
              <button class="kr-button kr-button--large kr-button--ghost" type="button"${saving ? " disabled" : ""}>取消</button>
              <button class="kr-button kr-button--large kr-button--primary" type="button"${saving ? " disabled" : ""}>${saving ? "保存中…" : saveError ? "重新保存" : "保存品味"}</button>
            </div>
          </div>
        </footer>
      </div>
    `;
  };

  const programCover = (cover, className = "") => `
    <span class="library-cover library-cover--${cover}${className ? ` ${className}` : ""}" aria-hidden="true"><i></i></span>
  `;

  const programsStatePanel = (variant) => {
    const states = {
      loading: {
        symbol: '<span class="programs-state__pulse"></span>',
        title: "正在读取节目历史...",
        description: "正在整理当前档案保存在这台设备上的节目记录。",
        action: "",
      },
      empty: {
        symbol: icon("queue"),
        title: "还没有节目",
        description: "去 Radio 生成第一段电台，节目和场景会保存在这里。",
        action: '<button class="kr-button kr-button--large kr-button--primary" type="button">去 Radio 生成第一段电台</button>',
      },
      "load-error": {
        symbol: icon("alert"),
        title: "节目历史暂时无法读取",
        description: "当前档案的本地历史读取失败。你可以重试，或先回到 Radio。",
        action: '<div><button class="kr-button kr-button--large kr-button--primary" type="button">重新读取</button><button class="kr-button kr-button--large kr-button--ghost" type="button">回到 Radio</button></div>',
      },
    };
    const state = states[variant];
    return `
      <section class="programs-state programs-state--${variant}" aria-live="polite">
        <span class="programs-state__symbol" aria-hidden="true">${state.symbol}</span>
        <h2>${state.title}</h2>
        <p>${state.description}</p>
        ${state.action}
        ${variant === "loading" ? '<div class="programs-state__skeleton" aria-hidden="true"><i></i><i></i><i></i></div>' : ""}
      </section>
    `;
  };

  const programsSummary = (summary) => `
    <section class="programs-summary kr-card" aria-labelledby="programs-summary-title">
      <h2 id="programs-summary-title">本周收听</h2>
      <dl>
        <div><dt>节目</dt><dd>${summary.count}</dd></div>
        <div><dt>时长</dt><dd>${summary.duration}</dd></div>
        <div><dt>歌曲</dt><dd>${summary.tracks}</dd></div>
      </dl>
      <div class="programs-summary__chart" aria-label="最近七日节目分布">
        ${summary.days.map((day) => `<span><i style="--program-day-value: ${Math.max(3, Math.round(day.value * 0.52))}px"></i><small>${day.label}</small></span>`).join("")}
      </div>
    </section>
  `;

  const programCard = (program) => `
    <article class="program-card kr-card">
      <button class="program-card__open" type="button" aria-label="打开节目 ${program.title}">
        <time>${program.date}</time>
        <strong>${program.title}</strong>
        <span>${program.scene}</span>
        <small>${program.meta}</small>
      </button>
      <button class="program-card__favorite${program.favorite ? " program-card__favorite--active" : ""}" type="button" aria-label="${program.favorite ? "取消收藏" : "收藏"}节目 ${program.title}">${icon("bookmark")}</button>
      <span class="program-card__covers" aria-hidden="true">
        ${program.covers.map((cover) => programCover(cover, "program-card__cover")).join("")}
      </span>
    </article>
  `;

  const renderProgramsList = (variant = "list") => {
    const content = fixtures.visualContent.programs;
    return `
      <div class="prototype-page prototype-page--programs prototype-page--programs-${variant}">
        <header class="prototype-topbar programs-topbar kr-topbar">
          ${brand()}
          <button class="kr-icon-button" type="button" aria-label="搜索节目">${icon("search")}</button>
        </header>
        <main class="programs-main">
          <header class="programs-heading">
            <h1>节目</h1>
            <div class="programs-segmented" role="group" aria-label="节目筛选">
              <button class="programs-segmented__item programs-segmented__item--active" type="button" aria-pressed="true">All</button>
              <button class="programs-segmented__item" type="button" aria-pressed="false">Favorites</button>
            </div>
          </header>
          ${variant === "list" ? `
            ${programsSummary(content.summary)}
            <section class="programs-list" aria-label="节目历史列表">
              ${content.items.map(programCard).join("")}
            </section>
          ` : programsStatePanel(variant)}
        </main>
        ${nav("programs")}
      </div>
    `;
  };

  const programDetailQueue = (queue) => `
    <section class="program-detail-queue" aria-labelledby="program-detail-queue-title">
      <h2 id="program-detail-queue-title">PROGRAM QUEUE · ${queue.length} TRACKS</h2>
      <ol class="kr-card">
        ${queue.map((track) => `
          <li>
            <span class="program-detail-track__number">${track.number}</span>
            ${programCover(track.cover, "program-detail-track__cover")}
            <span class="program-detail-track__copy"><strong>${track.title}</strong><small>${track.artist}</small></span>
            <time>${track.duration}</time>
            <button type="button" aria-label="更多操作：${track.title}">${icon("more")}</button>
          </li>
        `).join("")}
      </ol>
    </section>
  `;

  const programDetailFeedback = (feedback) => `
    <section class="program-detail-feedback" aria-labelledby="program-detail-feedback-title">
      <h2 id="program-detail-feedback-title">PROGRAM FEEDBACK</h2>
      <dl class="kr-card">
        ${feedback.map((item) => `<div><dt>${icon(item.icon)}<strong>${item.value}</strong></dt><dd>${item.label}</dd></div>`).join("")}
      </dl>
    </section>
  `;

  const renderProgramDetail = (variant = "detail") => {
    const content = fixtures.visualContent.programs.detail;
    const replaying = variant === "replaying";
    const ttsMissing = variant === "tts-missing";
    const reuseError = variant === "reuse-error";
    return `
      <div class="prototype-page prototype-page--program-detail prototype-page--program-detail-${variant}">
        <header class="prototype-topbar program-detail-topbar kr-topbar">
          <button class="kr-icon-button" type="button" aria-label="返回节目列表">${icon("back")}</button>
          <div>
            <button class="kr-icon-button program-detail-favorite" type="button" aria-label="取消收藏节目">${icon("heart")}</button>
            <button class="kr-icon-button" type="button" aria-label="更多节目操作">${icon("more")}</button>
          </div>
        </header>
        <main class="program-detail-main">
          <header class="program-detail-heading">
            <p>${content.label}</p>
            <h1>${content.title}</h1>
            <div>${content.metadata.map((item) => `<span>${item}</span>`).join("")}</div>
          </header>
          <section class="program-detail-scene kr-card" aria-labelledby="program-detail-scene-title">
            <h2 id="program-detail-scene-title">YOUR SCENE</h2>
            <p>${content.scene}</p>
            ${reuseError ? '<p class="program-detail-inline program-detail-inline--error" aria-live="polite">Radio 未连接，暂时不能复用场景</p>' : ""}
            <div>
              <button class="kr-button kr-button--primary" type="button">复用场景</button>
              <button class="kr-button kr-button--secondary" type="button">${replaying ? "正在重播" : "重播串讲"}</button>
            </div>
          </section>
          <section class="program-detail-opening" aria-labelledby="program-detail-opening-title">
            <h2 id="program-detail-opening-title">DJ OPENING</h2>
            <p>${content.opening}</p>
            <div class="program-detail-opening__play${replaying ? " program-detail-opening__play--active" : ""}">
              <button type="button" aria-label="${replaying ? "暂停" : "播放"} DJ 开场">${icon(replaying ? "pause" : "play")}</button>
              <span>${replaying ? "00:11 / " : ""}${content.openingDuration}</span>
              ${replaying ? '<i role="progressbar" aria-label="串讲重播进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="39"><span></span></i>' : ""}
            </div>
            ${ttsMissing ? '<p class="program-detail-inline program-detail-inline--warning" aria-live="polite">串讲音频缺失，已显示文字版</p>' : ""}
          </section>
          ${programDetailQueue(content.queue)}
          ${programDetailFeedback(content.feedback)}
        </main>
        ${nav("programs")}
      </div>
    `;
  };

  const settingsTopbar = () => `
    <header class="prototype-topbar settings-topbar kr-topbar">
      ${brand()}
      <div class="settings-topbar__tools">
        <span class="radio-top-avatar" role="img" aria-label="After Midnight 档案头像"><i></i></span>
        <button class="kr-icon-button" type="button" aria-label="切换主题">${icon("moon")}</button>
      </div>
    </header>
  `;

  const settingsSectionTitle = (id, title) => `<h2 id="${id}">${title}</h2>`;

  const settingsServiceRows = (services, variant) => services.map((service) => {
    const detecting = variant === "detecting";
    const incomplete = variant === "incomplete";
    const tone = detecting ? "info" : incomplete && service.name !== "Local Service" ? "warning" : service.tone;
    const status = detecting ? "CHECKING" : incomplete && service.name !== "Local Service" ? "NOT CONFIGURED" : service.status;
    return `
      <li class="settings-service-row settings-service-row--${tone}">
        <span class="settings-service-row__name">${service.name}</span>
        <span class="settings-service-row__status"><i aria-hidden="true"></i>${status}</span>
        ${service.action === "test"
          ? `<button type="button"${detecting ? " disabled" : ""}>${detecting ? "Testing" : "Test"}</button>`
          : `<button type="button" aria-label="查看 ${service.name} 配置">${icon("chevron")}</button>`}
      </li>
    `;
  }).join("");

  const settingsField = ({ label, value, secret = false, error = "" }) => `
    <label class="settings-field${error ? " settings-field--error" : ""}">
      <span>${label}${error ? `<small>${error}</small>` : ""}</span>
      <span class="settings-field__control">
        <input class="kr-input${error ? " kr-input--error" : ""}" value="${value}" aria-label="${label}" readonly />
        ${secret ? `<button type="button" aria-label="显示 TTS API Key">${icon("eye")}</button>` : ""}
      </span>
    </label>
  `;

  const renderSettingsConfig = (variant = "configured") => {
    const content = fixtures.visualContent.settings;
    const incomplete = variant === "incomplete";
    const detecting = variant === "detecting";
    const saveError = variant === "save-error";
    return `
      <div class="prototype-page prototype-page--settings prototype-page--settings-config prototype-page--settings-config-${variant}">
        ${settingsTopbar()}
        <main class="settings-config-main">
          <header class="settings-config-heading">
            <h1>设置</h1>
            <p class="settings-online-status settings-online-status--${incomplete ? "warning" : "success"}"><i aria-hidden="true"></i>${incomplete ? "1 SERVICE ONLINE" : "3 SERVICES ONLINE"}</p>
          </header>
          <section class="settings-section settings-services" aria-labelledby="settings-services-title">
            ${settingsSectionTitle("settings-services-title", "服务状态")}
            <ul class="kr-card">${settingsServiceRows(content.services, variant)}</ul>
          </section>
          <form class="settings-config-form">
            <section class="settings-section settings-service-config" aria-labelledby="settings-service-config-title">
              ${settingsSectionTitle("settings-service-config-title", "服务配置")}
              <div class="settings-fields">
                ${settingsField({ label: "Codex 命令路径", value: content.fields.codexCommand })}
                ${settingsField({ label: "网易云 API 地址", value: incomplete ? "" : content.fields.neteaseApiUrl, error: incomplete ? "请输入有效地址" : "" })}
                ${settingsField({ label: "TTS 服务地址", value: content.fields.ttsApiUrl })}
                ${settingsField({ label: "TTS API Key", value: incomplete ? "" : content.fields.ttsApiKey, secret: true, error: incomplete ? "请输入 TTS API Key" : "" })}
              </div>
            </section>
            <section class="settings-section settings-preferences" aria-labelledby="settings-preferences-title">
              ${settingsSectionTitle("settings-preferences-title", "偏好设置")}
              <div class="settings-preference-row">
                <span>Theme Mode</span>
                <div class="settings-segmented" role="radiogroup" aria-label="Theme Mode">
                  ${content.preferences.themeModes.map((mode, index) => `<button class="${index === 0 ? "settings-segmented__active" : ""}" type="button" role="radio" aria-checked="${index === 0}">${mode}</button>`).join("")}
                </div>
              </div>
              <div class="settings-preference-row">
                <span>DJ Language</span>
                <button class="settings-select" type="button"><strong>${content.preferences.language}</strong>${icon("down")}</button>
              </div>
              <div class="settings-preference-row">
                <span>DJ Voice Style</span>
                <button class="settings-select" type="button"><strong>${content.preferences.voiceStyle}</strong>${icon("down")}</button>
              </div>
            </section>
            <section class="settings-section settings-local-data" aria-labelledby="settings-local-data-title">
              ${settingsSectionTitle("settings-local-data-title", "本地数据")}
              <div class="settings-data-card kr-card${saveError ? " settings-data-card--error" : ""}">
                <div><span>数据路径</span><strong>${content.localData.path}</strong><button type="button">Change</button></div>
                <div><span>缓存占用</span><strong>${content.localData.cache}</strong></div>
                <div><span>${saveError ? "当前数据路径不可写" : "管理缓存"}</span><button class="settings-cache-action" type="button">${saveError ? "选择可写目录" : "清理音频缓存"}${icon("chevron")}</button></div>
              </div>
            </section>
          </form>
        </main>
        <footer class="settings-actions${saveError ? " settings-actions--error" : ""}" aria-live="polite">
          <button class="kr-button kr-button--secondary" type="button"${detecting ? " disabled" : ""}>${detecting ? "正在检测服务连接..." : "测试连接"}</button>
          <button class="kr-button kr-button--primary" type="button"${detecting || incomplete ? " disabled" : ""}>${saveError ? "重新保存" : "保存配置"}</button>
        </footer>
        ${nav("settings")}
      </div>
    `;
  };

  const diagnosticsCard = (service, guidance) => `
    <article class="settings-diagnostic-card settings-diagnostic-card--${service.tone}${service.expanded ? " settings-diagnostic-card--expanded" : ""}">
      <i class="settings-diagnostic-card__dot" aria-hidden="true"></i>
      <div class="settings-diagnostic-card__copy">
        <h2>${service.name}</h2>
        <strong>${service.status}</strong>
        <p>${service.detail}</p>
      </div>
      <span class="settings-diagnostic-card__symbol" aria-hidden="true">${service.tone === "success" ? icon("check") : icon("alert")}</span>
      ${service.expanded ? `
        <div class="settings-diagnostic-card__guidance">
          <ul>${guidance.map((item) => `<li>${item}</li>`).join("")}</ul>
          <button class="kr-button kr-button--secondary" type="button">查看配置</button>
        </div>
      ` : ""}
    </article>
  `;

  const renderSettingsDiagnostics = (variant = "degraded") => {
    const key = variant === "core-error" ? "coreError" : variant;
    const content = fixtures.visualContent.settings.diagnostics[key];
    const noticeTone = variant === "available" ? "success" : variant === "core-error" ? "error" : "warning";
    return `
      <div class="prototype-page prototype-page--settings prototype-page--settings-diagnostics prototype-page--settings-diagnostics-${variant}">
        <header class="settings-diagnostics-topbar">
          <button class="kr-icon-button" type="button" aria-label="返回设置">${icon("back")}</button>
          <h1>服务检测</h1>
        </header>
        <main class="settings-diagnostics-main">
          <header class="settings-diagnostics-heading">
            <p>${content.summary}</p>
            <span>${content.description}</span>
          </header>
          <section class="settings-diagnostics-list" aria-label="服务检测结果">
            ${content.services.map((service) => diagnosticsCard(service, content.guidance)).join("")}
          </section>
          <p class="settings-diagnostics-notice settings-diagnostics-notice--${noticeTone}" aria-live="polite">
            <span aria-hidden="true">${noticeTone === "success" ? icon("check") : icon("alert")}</span>${content.notice}
          </p>
        </main>
        <footer class="settings-diagnostics-actions">
          <button class="kr-button kr-button--large kr-button--primary" type="button">返回 Radio</button>
          <button class="kr-button kr-button--large kr-button--secondary" type="button">修改配置</button>
        </footer>
        ${nav("settings")}
      </div>
    `;
  };

  const renderSkeleton = (page, theme, viewport) => `
    <div class="prototype-placeholder">
      <p class="prototype-number">PAGE ${page.number}</p>
      <p class="prototype-kicker">HTML PROTOTYPE SKELETON</p>
      <h3>${page.title}</h3>
      <div class="prototype-rule"></div>
      <p>页面视觉与共享组件将在对应 VDA 页面族任务中落地。当前画布只验证路由、主题、viewport 与 fixture 映射。</p>
      <dl>
        <div><dt>Theme</dt><dd>${theme.label}</dd></div>
        <div><dt>Viewport</dt><dd>${viewport.label}</dd></div>
      </dl>
    </div>
  `;

  const renderPage = (selection) => {
    const renderers = {
      "01-service-offline": renderOffline,
      "02-profile-select": renderProfileSelect,
      "03-profile-create": renderProfileCreate,
      "04-radio-empty": () => renderRadio("empty"),
      "05-radio-playing": () => renderRadio("playing"),
      "06-radio-generating": () => renderRadio("generating"),
      "07-radio-detail-speaking": () => renderDetail("speaking"),
      "08-radio-detail-lyrics": () => renderDetail("lyrics"),
      "09-library": () => renderLibrary(selection.variant?.id),
      "10-taste-overview": () => renderTasteOverview(selection.variant?.id),
      "11-taste-edit": () => renderTasteEdit(selection.variant?.id),
      "12-programs-list": () => renderProgramsList(selection.variant?.id),
      "13-program-detail": () => renderProgramDetail(selection.variant?.id),
      "14-settings-config": () => renderSettingsConfig(selection.variant?.id),
      "15-settings-diagnostics": () => renderSettingsDiagnostics(selection.variant?.id),
    };
    const renderer = renderers[selection.page.id];
    return renderer ? renderer() : renderSkeleton(selection.page, selection.theme, selection.viewport);
  };

  const addOptions = (select, items, getText) => {
    items.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = getText(item);
      select.append(option);
    });
  };

  addOptions(elements.pageSelect, fixtures.pages, (page) => `${page.number} · ${page.title}`);
  addOptions(elements.themeSelect, fixtures.themes, (theme) => theme.label);
  addOptions(elements.viewportSelect, fixtures.viewports, (viewport) => viewport.label);

  const findById = (items, id) => items.find((item) => item.id === id) || items[0];

  const findVariant = (page, id) => page.variants ? findById(page.variants, id) : null;

  const readSelection = () => {
    const params = new URLSearchParams(window.location.search);
    const page = findById(fixtures.pages, params.get("page"));
    return {
      page,
      variant: findVariant(page, params.get("variant")),
      theme: findById(fixtures.themes, params.get("theme")),
      viewport: findById(fixtures.viewports, params.get("viewport")),
    };
  };

  const resolveTheme = (theme) => {
    if (theme.id !== "system") {
      return theme.id;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };

  const writeCanonicalUrl = (selection, mode) => {
    const url = new URL(window.location.href);
    const params = {
      page: selection.page.id,
      theme: selection.theme.id,
      viewport: selection.viewport.id,
    };
    if (selection.variant) {
      params.variant = selection.variant.id;
    }
    url.search = new URLSearchParams(params).toString();
    window.history[mode](null, "", url);
  };

  const applyScale = () => {
    if (!previewState.selection) {
      return;
    }

    const { viewport } = previewState.selection;
    const stageWidth = elements.viewport.clientWidth - 64;
    const stageHeight = elements.viewport.clientHeight - 64;
    const scale = previewState.scaleMode === "actual" ? 1 : Math.min(1, stageWidth / viewport.width, stageHeight / viewport.height);
    elements.canvas.style.zoom = scale;
    elements.scaleOutput.value = `${Math.round(scale * 100)}%`;
    elements.scaleButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.scaleMode === previewState.scaleMode));
    });
  };

  const syncOverlayControls = (viewport) => {
    const available = viewport.id === "prototype";
    elements.overlayToggle.disabled = !available;
    elements.overlayOpacity.disabled = !available || !elements.overlayToggle.checked;
    elements.canvas.dataset.referenceOverlay = String(available && elements.overlayToggle.checked);
    elements.canvas.style.setProperty("--reference-opacity", Number(elements.overlayOpacity.value) / 100);
    elements.overlayHint.textContent = available
      ? "参考图已归一化为 960 × 1600，可用透明度检查关键锚点。"
      : "叠图仅用于 Prototype · 960 × 1600。";
  };

  const render = (selection, mode = "replaceState") => {
    const resolvedTheme = resolveTheme(selection.theme);
    const { page, theme, viewport } = selection;
    previewState.selection = selection;

    elements.pageSelect.value = page.id;
    elements.variantControl.hidden = !page.variants;
    elements.variantSelect.replaceChildren();
    if (page.variants) {
      addOptions(elements.variantSelect, page.variants, (variant) => variant.label);
      elements.variantSelect.value = selection.variant.id;
    }
    elements.themeSelect.value = theme.id;
    elements.viewportSelect.value = viewport.id;
    elements.pageFamily.textContent = page.family;
    elements.pageState.textContent = selection.variant ? `${page.state} · ${selection.variant.id}` : page.state;
    elements.referenceLink.href = page.reference;
    elements.referenceLink.setAttribute("aria-label", `查看 ${page.title} 的 PNG 参考图`);
    elements.stageTitle.textContent = `${page.number} · ${page.title}${selection.variant ? ` · ${selection.variant.label}` : ""}`;
    elements.viewportOutput.value = `${viewport.width} × ${viewport.height}`;
    elements.canvas.style.setProperty("--canvas-width", `${viewport.width}px`);
    elements.canvas.style.setProperty("--canvas-height", `${viewport.height}px`);
    elements.canvas.dataset.page = page.id;
    elements.canvas.dataset.family = page.family;
    elements.canvas.dataset.state = page.state;
    elements.canvas.dataset.resolvedTheme = resolvedTheme;
    elements.canvas.dataset.theme = resolvedTheme;
    elements.canvas.dataset.viewport = viewport.id;
    elements.canvas.innerHTML = `${renderPage(selection)}<img class="preview-reference-overlay" src="${page.reference}" alt="" aria-hidden="true" />`;
    document.title = `${page.number} ${page.title} · Koradio Visual Preview`;

    writeCanonicalUrl(selection, mode);

    syncOverlayControls(viewport);
    window.requestAnimationFrame(applyScale);
  };

  const selectionFromControls = () => {
    const page = findById(fixtures.pages, elements.pageSelect.value);
    return {
      page,
      variant: findVariant(page, elements.variantSelect.value),
      theme: findById(fixtures.themes, elements.themeSelect.value),
      viewport: findById(fixtures.viewports, elements.viewportSelect.value),
    };
  };

  elements.controls.addEventListener("change", (event) => {
    if (event.target.matches("select")) {
      render(selectionFromControls(), "pushState");
    }
  });

  elements.scaleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      previewState.scaleMode = button.dataset.scaleMode;
      applyScale();
    });
  });

  elements.overlayToggle.addEventListener("change", () => {
    syncOverlayControls(previewState.selection.viewport);
  });

  elements.overlayOpacity.addEventListener("input", () => {
    syncOverlayControls(previewState.selection.viewport);
  });

  elements.copyLink.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      elements.copyLink.textContent = "链接已复制";
    } catch {
      elements.copyLink.textContent = "请从地址栏复制链接";
    }

    window.setTimeout(() => {
      elements.copyLink.textContent = "复制当前定位链接";
    }, 1800);
  });

  window.addEventListener("popstate", () => render(readSelection()));
  window.addEventListener("resize", applyScale);
  new ResizeObserver(applyScale).observe(elements.viewport);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (elements.themeSelect.value === "system") {
      render(readSelection());
    }
  });

  render(readSelection());
})();
