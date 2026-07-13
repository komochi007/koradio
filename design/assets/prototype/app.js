(function startKoradioPreview() {
  const fixtures = window.KORADIO_FIXTURES;

  if (!fixtures) {
    throw new Error("Koradio fixtures are unavailable.");
  }

  const elements = {
    controls: document.querySelector("#preview-controls"),
    pageSelect: document.querySelector("#page-select"),
    themeSelect: document.querySelector("#theme-select"),
    viewportSelect: document.querySelector("#viewport-select"),
    pageFamily: document.querySelector("#page-family"),
    pageState: document.querySelector("#page-state"),
    referenceLink: document.querySelector("#reference-link"),
    copyLink: document.querySelector("#copy-link"),
    stageTitle: document.querySelector("#stage-title"),
    viewportOutput: document.querySelector("#viewport-output"),
    viewport: document.querySelector("#preview-viewport"),
    canvas: document.querySelector("#prototype-canvas"),
  };

  const icon = (name) => {
    const paths = {
      arrow: '<path d="M5 12h14M14 7l5 5-5 5"/>',
      back: '<path d="m15 18-6-6 6-6"/>',
      lock: '<rect x="5.5" y="10" width="13" height="10" rx="2"/><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10M12 14v2"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      close: '<path d="m8 8 8 8M16 8l-8 8"/>',
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

  const nav = () => `
    <nav class="kr-nav prototype-nav" aria-label="主要导航">
      <button class="kr-nav__item" type="button" data-tooltip="Radio" aria-label="Radio">
        <span class="kr-tab-icon kr-tab-icon--radio" aria-hidden="true"></span>
      </button>
      <button class="kr-nav__item" type="button" data-tooltip="Library" aria-label="Library">
        <span class="kr-tab-icon kr-tab-icon--library" aria-hidden="true"></span>
      </button>
      <button class="kr-nav__item" type="button" data-tooltip="Taste" aria-label="Taste">
        <span class="kr-tab-icon kr-tab-icon--taste" aria-hidden="true"></span>
      </button>
      <button class="kr-nav__item" type="button" data-tooltip="Programs" aria-label="Programs">
        <span class="kr-tab-icon kr-tab-icon--programs" aria-hidden="true"></span>
      </button>
      <button class="kr-nav__item kr-nav__item--active" type="button" data-tooltip="Settings" aria-label="Settings，当前页面" aria-current="page">
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
        ${nav()}
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

  const readSelection = () => {
    const params = new URLSearchParams(window.location.search);
    return {
      page: findById(fixtures.pages, params.get("page")),
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
    url.search = new URLSearchParams({
      page: selection.page.id,
      theme: selection.theme.id,
      viewport: selection.viewport.id,
    }).toString();
    window.history[mode](null, "", url);
  };

  const render = (selection, mode = "replaceState") => {
    const resolvedTheme = resolveTheme(selection.theme);
    const { page, theme, viewport } = selection;

    elements.pageSelect.value = page.id;
    elements.themeSelect.value = theme.id;
    elements.viewportSelect.value = viewport.id;
    elements.pageFamily.textContent = page.family;
    elements.pageState.textContent = page.state;
    elements.referenceLink.href = page.reference;
    elements.referenceLink.setAttribute("aria-label", `查看 ${page.title} 的 PNG 参考图`);
    elements.stageTitle.textContent = `${page.number} · ${page.title}`;
    elements.viewportOutput.value = `${viewport.width} × ${viewport.height}`;
    elements.canvas.style.setProperty("--canvas-width", `${viewport.width}px`);
    elements.canvas.style.setProperty("--canvas-height", `${viewport.height}px`);
    elements.canvas.dataset.page = page.id;
    elements.canvas.dataset.family = page.family;
    elements.canvas.dataset.state = page.state;
    elements.canvas.dataset.resolvedTheme = resolvedTheme;
    elements.canvas.dataset.theme = resolvedTheme;
    elements.canvas.dataset.viewport = viewport.id;
    elements.canvas.innerHTML = renderPage(selection);
    document.title = `${page.number} ${page.title} · Koradio Visual Preview`;

    writeCanonicalUrl(selection, mode);

    window.requestAnimationFrame(() => {
      const stageWidth = elements.viewport.clientWidth - 64;
      const scale = Math.min(1, stageWidth / viewport.width);
      elements.canvas.style.zoom = scale;
    });
  };

  const selectionFromControls = () => ({
    page: findById(fixtures.pages, elements.pageSelect.value),
    theme: findById(fixtures.themes, elements.themeSelect.value),
    viewport: findById(fixtures.viewports, elements.viewportSelect.value),
  });

  elements.controls.addEventListener("change", () => render(selectionFromControls(), "pushState"));

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
  window.addEventListener("resize", () => render(readSelection()));
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (elements.themeSelect.value === "system") {
      render(readSelection());
    }
  });

  render(readSelection());
})();
