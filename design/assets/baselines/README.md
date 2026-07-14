# Koradio VDA-14 正式截图基线

> 任务：VDA-14｜截图基线与视觉 QA
>
> 主源：`design/assets/prototype/` 中的 HTML / CSS / JavaScript
>
> 性质：PNG 是从已验收 HTML 派生的视觉回归参考，不是可独立修改的设计主源

## 基线范围

- `dark/`：01–15 Dark Prototype 基线，共 15 张，均为 `960 × 1600px`。
- `light/`：01–15 Light Prototype 基线，共 15 张，均为 `960 × 1600px`。
- `responsive/`：03、05、08、10、14 在 Mobile `390 × 844px`、Tablet `834 × 1194px`、Desktop `1440 × 1200px` 下的 Dark / Light 基线，共 30 张。
- `manifest.json`：记录生成环境、捕获参数、文件尺寸、SHA-256、对比度与自动 QA 结果。

合计 60 张正式 PNG。Figma 镜像仍由 VDA-15 从已验收 HTML 派生，不属于本目录。

## 捕获与验证规则

`../scripts/vda-14-baselines.cjs` 使用本机 Chrome 和临时 loopback HTTP 服务捕获 `#prototype-canvas`。临时服务使用系统分配端口，只服务于 QA，不代表 Koradio 产品端口或可运行状态。

捕获固定使用 `deviceScaleFactor: 1`、Reduce Motion、隐藏参考图叠层，并在字体、图像和布局稳定后生成 PNG。自动检查覆盖必需文字、画布尺寸与裁切、固定比例、`44 × 44px` 最小命中区、恢复入口、资源与运行时错误、Radio / Detail 跨状态几何、Dark / Light 几何一致性和代表性 WCAG 对比度。

脚本不向仓库引入包管理器或依赖。执行环境需通过 `NODE_PATH` 提供 Playwright、Sharp 与 pixelmatch，并可通过 `CHROME_PATH` 指定 Chrome：

```sh
NODE_PATH=/path/to/qa-runtime/node_modules node design/assets/scripts/vda-14-baselines.cjs
NODE_PATH=/path/to/qa-runtime/node_modules node design/assets/scripts/vda-14-baselines.cjs --verify
```

普通模式重新生成正式文件和清单；`--verify` 在临时目录复渲染并与正式文件比较。SHA-256 用于文件完整性；复渲染比较按规范忽略字体抗锯齿差异，解码像素差异率上限为 `0.6%`。

不得手工修改基线 PNG。发现有效差异时，应先更新权威文档与 HTML 主源，通过视觉裁决后重新生成。
