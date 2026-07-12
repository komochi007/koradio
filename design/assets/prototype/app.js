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
    prototypeNumber: document.querySelector("#prototype-number"),
    prototypeTitle: document.querySelector("#prototype-title"),
    prototypeTheme: document.querySelector("#prototype-theme"),
    prototypeViewport: document.querySelector("#prototype-viewport"),
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
    elements.canvas.dataset.theme = theme.id;
    elements.canvas.dataset.resolvedTheme = resolvedTheme;
    elements.canvas.dataset.viewport = viewport.id;
    elements.prototypeNumber.textContent = `PAGE ${page.number}`;
    elements.prototypeTitle.textContent = page.title;
    elements.prototypeTheme.textContent = `${theme.label} · ${resolvedTheme}`;
    elements.prototypeViewport.textContent = viewport.label;
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
