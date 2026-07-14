const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const pixelmatch = require("pixelmatch").default;
const { chromium } = require("playwright");
const sharp = require("sharp");

const repositoryRoot = path.resolve(__dirname, "../../..");
const prototypeEntry = path.join(repositoryRoot, "design/assets/prototype/index.html");
const baselineRoot = path.join(repositoryRoot, "design/assets/baselines");
const chromePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const verify = process.argv.includes("--verify");
const outputRoot = verify
  ? path.join(os.tmpdir(), `koradio-vda14-verify-${Date.now()}`)
  : baselineRoot;
let prototypeUrl;

const prototypePages = [
  "01-service-offline",
  "02-profile-select",
  "03-profile-create",
  "04-radio-empty",
  "05-radio-playing",
  "06-radio-generating",
  "07-radio-detail-speaking",
  "08-radio-detail-lyrics",
  "09-library",
  "10-taste-overview",
  "11-taste-edit",
  "12-programs-list",
  "13-program-detail",
  "14-settings-config",
  "15-settings-diagnostics",
];

const responsivePages = [
  "03-profile-create",
  "05-radio-playing",
  "08-radio-detail-lyrics",
  "10-taste-overview",
  "14-settings-config",
];

const responsiveViewports = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 834, height: 1194 },
  desktop: { width: 1440, height: 1200 },
};

const requiredText = {
  "01-service-offline": ["Koradio 服务未连接", "重新连接", "前往 Settings", "LOCAL SERVICE · NOT RESPONDING"],
  "02-profile-select": ["选择你的电台档案", "CURRENT", "创建新的电台档案"],
  "03-profile-create": ["创建电台档案", "常听风格", "保存并进入 Koradio"],
  "04-radio-empty": ["LIVE", "NO SESSION ON AIR", "QUEUE · 0 TRACKS", "Say something to the DJ..."],
  "05-radio-playing": ["ON AIR", "If", "QUEUE · 4 TRACKS", "PLAYING"],
  "06-radio-generating": ["TUNING YOUR STATION...", "QUEUE · PREPARING", "THINKING", "Generating..."],
  "07-radio-detail-speaking": ["SPEAKING NOW", "After Hours, Soft Focus", "If · Bread", "先让声音替房间留一点呼吸。"],
  "08-radio-detail-lyrics": ["PLAYING", "Space Song · Beach House", "A small light stayed awake"],
  "09-library": ["音乐库", "搜索结果 · 5", "导入网易云歌单", "CONNECTED"],
  "10-taste-overview": ["你的音乐品味", "常听风格", "避雷规则", "最近反馈"],
  "11-taste-edit": ["编辑音乐品味", "避雷规则", "场景偏好", "保存品味"],
  "12-programs-list": ["节目", "本周收听", "After Hours, Soft Focus", "4 TRACKS · 18 MIN"],
  "13-program-detail": ["PROGRAM ARCHIVE", "YOUR SCENE", "PROGRAM QUEUE · 4 TRACKS", "PROGRAM FEEDBACK"],
  "14-settings-config": ["设置", "DEGRADED", "Theme Mode", "British Soft Radio", "保存配置"],
  "15-settings-diagnostics": ["服务检测", "3 OF 4 SERVICES AVAILABLE", "Text to Speech", "修改配置"],
};

const radioGeometrySelectors = [
  ".prototype-topbar",
  ".radio-time",
  ".radio-main",
  ".radio-queue",
  ".radio-dj-status",
  ".radio-dialogue",
  ".radio-scene-input",
  ".prototype-nav",
];

const detailGeometrySelectors = [
  ".detail-drag-handle",
  ".detail-close",
  ".detail-status",
  ".detail-waveform",
  ".detail-paper",
  ".detail-paper h1",
  ".detail-track",
  ".detail-track-progress",
  ".detail-copy",
  ".detail-program-progress",
  ".detail-play",
];

const themeGeometrySelectors = [
  ".prototype-topbar",
  "main",
  ".prototype-nav",
  ".offline-panel",
  ".profile-card",
  ".profile-create-card",
  ".radio-time",
  ".radio-main",
  ".radio-queue",
  ".radio-dj-status",
  ".radio-dialogue",
  ".radio-scene-input",
  ".detail-waveform",
  ".detail-paper",
  ".detail-copy",
  ".detail-program-progress",
  ".library-search",
  ".library-track",
  ".library-import",
  ".taste-overview-card",
  ".taste-preference-grid",
  ".taste-scene-grid",
  ".taste-edit-tags",
  ".taste-edit-rules",
  ".taste-edit-scenes",
  ".taste-edit-action",
  ".programs-summary",
  ".program-card",
  ".program-scene-card",
  ".program-queue-row",
  ".settings-service-list",
  ".settings-config-form",
  ".settings-preferences",
  ".settings-data-card",
  ".settings-actions",
  ".settings-diagnostic-card",
];

const squareSelectors = [
  ".profile-avatar",
  ".profile-upload-avatar",
  ".radio-top-avatar",
  ".radio-player__cover",
  ".library-track__cover",
  ".program-card__art img",
  ".program-queue-row__cover",
  ".kr-icon-button",
  ".radio-player__play",
  ".detail-play",
  ".kr-status__dot",
];

const failures = [];
const captures = [];
const geometry = new Map();
const themeGeometry = new Map();
const contrastResults = [];
let runtimeErrors = [];
let maximumReRenderMismatchRate = 0;

const fail = (message) => failures.push(message);
const round = (value) => Math.round(value * 100) / 100;
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function parseColor(value) {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    return [0, 2, 4].map((offset) => Number.parseInt(hex[1].slice(offset, offset + 2), 16));
  }
  const rgb = value.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/i);
  return rgb ? rgb.slice(1, 4).map(Number) : null;
}

function luminance([r, g, b]) {
  const channels = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function assertContrast(label, foreground, background, minimum) {
  const foregroundRgb = parseColor(foreground);
  const backgroundRgb = parseColor(background);
  if (!foregroundRgb || !backgroundRgb) {
    fail(`${label} 无法解析颜色：${foreground} / ${background}`);
    return;
  }
  const ratio = round(contrast(foregroundRgb, backgroundRgb));
  contrastResults.push({ label, foreground, background, ratio, minimum });
  if (ratio < minimum) {
    fail(`${label} 对比度 ${ratio}:1 低于 ${minimum}:1`);
  }
}

function captureDefinitions() {
  const definitions = [];
  for (const theme of ["dark", "light"]) {
    for (const page of prototypePages) {
      definitions.push({
        page,
        theme,
        viewport: "prototype",
        width: 960,
        height: 1600,
        relativePath: `${theme}/${page}.png`,
      });
    }
    for (const [viewport, dimensions] of Object.entries(responsiveViewports)) {
      for (const page of responsivePages) {
        definitions.push({
          page,
          theme,
          viewport,
          ...dimensions,
          relativePath: `responsive/${theme}-${viewport}-${page}.png`,
        });
      }
    }
  }
  return definitions;
}

async function stablePage(page, definition) {
  const query = new URLSearchParams({
    page: definition.page,
    theme: definition.theme,
    viewport: definition.viewport,
  });
  const url = `${prototypeUrl}?${query}`;
  await page.goto(url, { waitUntil: "load" });
  await page.locator("#prototype-canvas .prototype-page").waitFor({ state: "visible" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.complete
      ? Promise.resolve()
      : new Promise((resolve) => image.addEventListener("load", resolve, { once: true }))));
  });
  await page.locator("#prototype-canvas").evaluate((canvas) => {
    canvas.style.zoom = "1";
    canvas.dataset.referenceOverlay = "false";
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return url;
}

async function collectGeometry(page, selectors) {
  return page.locator("#prototype-canvas").evaluate((canvas, selectorList) => {
    const canvasRect = canvas.getBoundingClientRect();
    const result = {};
    for (const selector of selectorList) {
      result[selector] = [...canvas.querySelectorAll(selector)]
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            x: Math.round((rect.x - canvasRect.x) * 100) / 100,
            y: Math.round((rect.y - canvasRect.y) * 100) / 100,
            width: Math.round(rect.width * 100) / 100,
            height: Math.round(rect.height * 100) / 100,
          };
        });
    }
    return result;
  }, selectors);
}

async function inspectDom(page, definition) {
  const result = await page.locator("#prototype-canvas").evaluate((canvas, args) => {
    const canvasRect = canvas.getBoundingClientRect();
    const formText = [...canvas.querySelectorAll("input, textarea")]
      .flatMap((element) => [element.value, element.placeholder])
      .filter(Boolean)
      .join("\n");
    const text = `${canvas.innerText}\n${formText}`;
    const pageElement = canvas.querySelector(".prototype-page");
    const pageRect = pageElement.getBoundingClientRect();
    const missingText = args.requiredText.filter((item) => !text.includes(item));
    const squareIssues = [];
    for (const selector of args.squareSelectors) {
      for (const element of canvas.querySelectorAll(selector)) {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || rect.width === 0 || rect.height === 0) continue;
        if (Math.abs(rect.width - rect.height) > 1) {
          squareIssues.push({ selector, width: rect.width, height: rect.height });
        }
      }
    }
    const targetIssues = [...canvas.querySelectorAll("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)")]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { name: element.getAttribute("aria-label") || element.textContent.trim() || element.tagName, width: rect.width, height: rect.height };
      })
      .filter((item) => item.width < 44 || item.height < 44);
    return {
      missingText,
      squareIssues,
      targetIssues,
      overflow: {
        horizontal: Math.max(0, canvas.scrollWidth - canvas.clientWidth),
        vertical: Math.max(0, canvas.scrollHeight - canvas.clientHeight),
      },
      pageRect: {
        x: pageRect.x - canvasRect.x,
        y: pageRect.y - canvasRect.y,
        width: pageRect.width,
        height: pageRect.height,
      },
      imagesReady: [...canvas.querySelectorAll("img")].every((image) => image.complete && image.naturalWidth > 0),
      recovery: args.page === "01-service-offline"
        ? ["重新连接", "前往 Settings"].every((label) => [...canvas.querySelectorAll("button")].some((button) => button.textContent.includes(label)))
        : args.page === "15-settings-diagnostics"
          ? ["返回 Radio", "修改配置"].every((label) => [...canvas.querySelectorAll("button")].some((button) => button.textContent.includes(label)))
          : true,
    };
  }, {
    page: definition.page,
    requiredText: requiredText[definition.page],
    squareSelectors,
  });

  if (result.missingText.length) fail(`${definition.relativePath} 缺少文字：${result.missingText.join("、")}`);
  if (result.squareIssues.length) fail(`${definition.relativePath} 固定比例异常：${JSON.stringify(result.squareIssues)}`);
  if (result.targetIssues.length) fail(`${definition.relativePath} 命中区小于 44px：${JSON.stringify(result.targetIssues)}`);
  if (result.overflow.horizontal > 0 || result.overflow.vertical > 0) fail(`${definition.relativePath} 画布溢出：${JSON.stringify(result.overflow)}`);
  if (Math.abs(result.pageRect.width - definition.width) > 0.5 || Math.abs(result.pageRect.height - definition.height) > 0.5) {
    fail(`${definition.relativePath} 页面尺寸异常：${JSON.stringify(result.pageRect)}`);
  }
  if (!result.imagesReady) fail(`${definition.relativePath} 存在未加载图片`);
  if (!result.recovery) fail(`${definition.relativePath} 缺少恢复入口`);
}

async function inspectContrast(page, definition) {
  if (definition.viewport !== "prototype" || !["01-service-offline", "07-radio-detail-speaking"].includes(definition.page)) return;
  const colors = await page.locator("#prototype-canvas").evaluate((canvas) => {
    const styles = getComputedStyle(canvas);
    const value = (name) => styles.getPropertyValue(name).trim();
    const detailCopy = canvas.querySelector(".detail-copy");
    return {
      primary: value("--kr-color-text-primary"),
      secondary: value("--kr-color-text-secondary"),
      background: value("--kr-color-bg"),
      surface: value("--kr-color-surface"),
      primaryButton: value("--kr-color-primary"),
      onPrimary: value("--kr-color-on-primary"),
      detailRead: detailCopy
        ? getComputedStyle(detailCopy.querySelector(".detail-copy__line--read > p:last-child, .detail-lyric-line.detail-copy__line--read")).color
        : null,
      detailCard: detailCopy ? getComputedStyle(detailCopy).backgroundColor : null,
    };
  });
  if (definition.page === "01-service-offline") {
    assertContrast(`${definition.theme} Primary / Background`, colors.primary, colors.background, 4.5);
    assertContrast(`${definition.theme} Secondary / Background`, colors.secondary, colors.background, 4.5);
    assertContrast(`${definition.theme} Primary button`, colors.onPrimary, colors.primaryButton, 4.5);
  } else if (colors.detailRead && colors.detailCard) {
    assertContrast("Detail 已读大字", colors.detailRead, colors.detailCard, 3);
  }
}

async function capture(page, definition) {
  const url = await stablePage(page, definition);
  await inspectDom(page, definition);
  await inspectContrast(page, definition);
  const output = path.join(outputRoot, definition.relativePath);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  await page.locator("#prototype-canvas").screenshot({ path: output, animations: "disabled" });
  const metadata = await sharp(output).metadata();
  if (metadata.width !== definition.width || metadata.height !== definition.height) {
    fail(`${definition.relativePath} PNG 尺寸 ${metadata.width} × ${metadata.height}，预期 ${definition.width} × ${definition.height}`);
  }

  const geometryKey = `${definition.theme}/${definition.viewport}/${definition.page}`;
  if (["04-radio-empty", "05-radio-playing", "06-radio-generating"].includes(definition.page) && definition.viewport === "prototype") {
    geometry.set(geometryKey, await collectGeometry(page, radioGeometrySelectors));
  }
  if (["07-radio-detail-speaking", "08-radio-detail-lyrics"].includes(definition.page) && definition.viewport === "prototype") {
    geometry.set(geometryKey, await collectGeometry(page, detailGeometrySelectors));
  }
  themeGeometry.set(geometryKey, await collectGeometry(page, themeGeometrySelectors));

  captures.push({
    file: definition.relativePath,
    page: definition.page,
    theme: definition.theme,
    viewport: definition.viewport,
    width: metadata.width,
    height: metadata.height,
    bytes: fs.statSync(output).size,
    sha256: sha256(output),
    query: new URL(url).search,
  });
}

function compareGeometry(label, reference, candidate) {
  if (JSON.stringify(reference) !== JSON.stringify(candidate)) {
    fail(`${label} 几何不一致`);
  }
}

function validateGeometry() {
  for (const theme of ["dark", "light"]) {
    const radioReference = geometry.get(`${theme}/prototype/04-radio-empty`);
    compareGeometry(`${theme} Radio 04 / 05`, radioReference, geometry.get(`${theme}/prototype/05-radio-playing`));
    compareGeometry(`${theme} Radio 04 / 06`, radioReference, geometry.get(`${theme}/prototype/06-radio-generating`));
    compareGeometry(
      `${theme} Detail 07 / 08`,
      geometry.get(`${theme}/prototype/07-radio-detail-speaking`),
      geometry.get(`${theme}/prototype/08-radio-detail-lyrics`),
    );
  }

  for (const definition of captureDefinitions()) {
    const dark = themeGeometry.get(`dark/${definition.viewport}/${definition.page}`);
    const light = themeGeometry.get(`light/${definition.viewport}/${definition.page}`);
    if (dark && light) compareGeometry(`${definition.viewport}/${definition.page} Dark / Light`, dark, light);
  }
}

function validateExpectedFiles() {
  const expected = new Set(captureDefinitions().map((definition) => definition.relativePath));
  for (const definition of captureDefinitions()) {
    if (!fs.existsSync(path.join(outputRoot, definition.relativePath))) fail(`缺少基线：${definition.relativePath}`);
  }
  const actual = [];
  for (const directory of ["dark", "light", "responsive"]) {
    const absolute = path.join(outputRoot, directory);
    if (!fs.existsSync(absolute)) continue;
    for (const file of fs.readdirSync(absolute)) {
      if (file.endsWith(".png")) actual.push(`${directory}/${file}`);
    }
  }
  for (const file of actual) {
    if (!expected.has(file)) fail(`存在未声明基线：${file}`);
  }
  if (actual.length !== 60) fail(`基线数量为 ${actual.length}，预期 60`);
}

async function compareWithBaselines() {
  for (const capture of captures) {
    const baseline = path.join(baselineRoot, capture.file);
    if (!fs.existsSync(baseline)) {
      fail(`正式基线不存在：${capture.file}`);
      continue;
    }
    const candidate = path.join(outputRoot, capture.file);
    const [expectedPixels, candidatePixels] = await Promise.all([
      sharp(baseline).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
      sharp(candidate).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    ]);
    const mismatchedPixels = pixelmatch(
      expectedPixels.data,
      candidatePixels.data,
      null,
      expectedPixels.info.width,
      expectedPixels.info.height,
      { threshold: 0.1, includeAA: false },
    );
    const mismatchRate = mismatchedPixels / (expectedPixels.info.width * expectedPixels.info.height);
    maximumReRenderMismatchRate = Math.max(maximumReRenderMismatchRate, mismatchRate);
    if (mismatchRate > 0.006) {
      fail(`稳定性复渲染差异 ${round(mismatchRate * 100)}% 超过 0.6%：${capture.file}`);
    }
  }
}

function startStaticServer() {
  const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
  };
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const file = path.resolve(repositoryRoot, `.${pathname}`);
    if (!file.startsWith(`${repositoryRoot}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentTypes[path.extname(file)] || "application/octet-stream",
    });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        origin: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

async function main() {
  if (!fs.existsSync(chromePath)) throw new Error(`Chrome 不存在：${chromePath}`);
  for (const directory of ["dark", "light", "responsive"]) {
    fs.mkdirSync(path.join(outputRoot, directory), { recursive: true });
  }

  const staticServer = await startStaticServer();
  prototypeUrl = `${staticServer.origin}/design/assets/prototype/index.html`;
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const browserVersion = browser.version();
  const context = await browser.newContext({
    viewport: { width: 2000, height: 2000 },
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));

  for (const definition of captureDefinitions()) await capture(page, definition);
  await browser.close();
  await new Promise((resolve, reject) => staticServer.server.close((error) => error ? reject(error) : resolve()));

  validateGeometry();
  validateExpectedFiles();
  if (runtimeErrors.length) fail(`浏览器运行时错误：${runtimeErrors.join(" | ")}`);
  if (verify) await compareWithBaselines();

  const manifest = {
    task: "VDA-14",
    generatedAt: new Date().toISOString(),
    source: "design/assets/prototype/index.html",
    sourceAuthority: "HTML/CSS/JavaScript",
    capturePolicy: {
      reducedMotion: true,
      deviceScaleFactor: 1,
      layoutStabilityWaitMs: 500,
      referenceOverlay: false,
      maxReRenderPixelMismatchRate: 0.006,
      fontAntialiasDifferencesIgnored: true,
    },
    browser: `Chrome ${browserVersion}`,
    counts: {
      prototypeDark: 15,
      prototypeLight: 15,
      responsive: 30,
      total: 60,
    },
    qa: {
      status: failures.length ? "failed" : "passed",
      checks: [
        "required text",
        "canvas size and clipping",
        "fixed aspect ratios",
        "44px minimum targets",
        "recovery entries",
        "resource and runtime errors",
        "Radio and Detail cross-state geometry",
        "Dark and Light geometry parity",
        "WCAG contrast samples",
        "deterministic re-rendering when --verify is used",
      ],
      contrast: contrastResults,
      failures,
    },
    captures,
  };

  if (!verify) {
    fs.writeFileSync(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }

  if (failures.length) {
    console.error(JSON.stringify(manifest.qa, null, 2));
    process.exitCode = 1;
    return;
  }
  const verification = verify ? `，最大像素差异率 ${round(maximumReRenderMismatchRate * 100)}%` : "";
  console.log(`${verify ? "复渲染验证" : "正式基线生成"}通过：60 张截图${verification}，输出 ${outputRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
