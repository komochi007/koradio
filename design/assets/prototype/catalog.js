(function startComponentCatalog() {
  const board = document.querySelector("#catalog-board");
  const buttons = [...document.querySelectorAll("[data-catalog-theme]")];
  const params = new URLSearchParams(window.location.search);
  const requestedTheme = params.get("theme");
  const initialTheme = requestedTheme === "light" ? "light" : "dark";

  const renderTheme = (theme, mode = "replaceState") => {
    board.dataset.theme = theme;
    buttons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.catalogTheme === theme));
    });

    const url = new URL(window.location.href);
    url.search = new URLSearchParams({ theme }).toString();
    window.history[mode](null, "", url);
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => renderTheme(button.dataset.catalogTheme, "pushState"));
  });

  window.addEventListener("popstate", () => {
    const theme = new URLSearchParams(window.location.search).get("theme");
    renderTheme(theme === "light" ? "light" : "dark");
  });

  renderTheme(initialTheme);
})();
