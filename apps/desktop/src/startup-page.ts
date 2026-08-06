export const startupPagePrefix = "data:text/html;charset=utf-8,";
export const startupRetryUrl = "koradio-startup://retry";

const startupPageHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Koradio</title>
    <style>
      :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #090a0c; color: #f3f5f7; }
      main { width: min(420px, calc(100vw - 64px)); padding: 48px 0; }
      .mark { display: flex; align-items: center; gap: 12px; margin-bottom: 56px; color: #f3f5f7; font: 700 14px/20px "SFMono-Regular", monospace; letter-spacing: .16em; }
      .dot { width: 10px; height: 10px; border-radius: 50%; background: #55b978; box-shadow: 0 0 18px rgba(85,185,120,.44); }
      h1 { margin: 0 0 16px; font-size: 32px; letter-spacing: -.04em; }
      p { margin: 0; color: #9da3aa; font-size: 14px; line-height: 1.6; }
      #detail { margin-top: 8px; color: #6e737a; font: 12px/18px "SFMono-Regular", monospace; word-break: break-word; }
      button { margin-top: 28px; min-width: 112px; padding: 11px 18px; border: 1px solid rgba(243,245,247,.18); border-radius: 999px; background: #f3f5f7; color: #14161a; cursor: pointer; font: 650 14px/20px -apple-system, BlinkMacSystemFont, sans-serif; }
      button:hover { filter: brightness(1.08); }
      button:focus-visible { outline: 3px solid #55b978; outline-offset: 4px; }
    </style>
  </head>
  <body>
    <main>
      <div class="mark"><span class="dot" aria-hidden="true"></span>KORADIO</div>
      <h1 id="stage" aria-live="polite">正在准备 Koradio</h1>
      <p id="detail">请稍候</p>
      <button id="retry" type="button" hidden>重试启动</button>
    </main>
    <script>
      const stage = document.getElementById("stage");
      const detail = document.getElementById("detail");
      const retry = document.getElementById("retry");
      window.__koradioSetStartupStatus = (nextStage, nextDetail, retryable) => {
        stage.textContent = nextStage;
        detail.textContent = nextDetail;
        retry.hidden = !retryable;
        if (retryable) retry.focus();
      };
      retry.addEventListener("click", () => {
        window.location.href = "koradio-startup://retry";
      });
    </script>
  </body>
</html>`;

export const startupPageUrl = `${startupPagePrefix}${encodeURIComponent(startupPageHtml)}`;
