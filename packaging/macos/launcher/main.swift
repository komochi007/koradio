import AppKit
import Foundation

private let firstPort = 49373
private let lastPort = 49383

private enum UpdateResult {
  case current
  case updated
}

final class KoradioLauncher: NSObject, NSApplicationDelegate {
  private var service: Process?
  private var selectedPort: Int?
  private var ownsService = false
  private var smokeMode = false
  private var isStarting = false
  private var statusItem: NSStatusItem?
  private var failureCode = "service_not_ready"

  func applicationDidFinishLaunching(_ notification: Notification) {
    smokeMode = CommandLine.arguments.contains("--smoke")
    if smokeMode {
      FileHandle.standardOutput.write(Data("{\"stage\":\"launch\"}\n".utf8))
    } else {
      installStatusMenu()
    }
    beginStart()
  }

  func applicationShouldHandleReopen(
    _ sender: NSApplication,
    hasVisibleWindows flag: Bool
  ) -> Bool {
    beginStart()
    return false
  }

  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    stopOwnedService()
    return .terminateNow
  }

  @objc private func openKoradio() {
    beginStart()
  }

  private func beginStart() {
    guard !isStarting else {
      return
    }
    isStarting = true
    updateStatus("检查更新…")
    DispatchQueue.global(qos: .userInitiated).async {
      self.start()
    }
  }

  @objc private func quitKoradio() {
    NSApplication.shared.terminate(nil)
  }

  private func installStatusMenu() {
    let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    statusItem.button?.title = "Koradio · 检查更新"
    let menu = NSMenu()
    menu.addItem(NSMenuItem(title: "打开 Koradio", action: #selector(openKoradio), keyEquivalent: "o"))
    menu.addItem(.separator())
    menu.addItem(NSMenuItem(title: "退出 Koradio", action: #selector(quitKoradio), keyEquivalent: "q"))
    statusItem.menu = menu
    self.statusItem = statusItem
  }

  private func start() {
    if smokeMode {
      FileHandle.standardOutput.write(Data("{\"stage\":\"start\"}\n".utf8))
    } else {
      do {
        let updateResult = try checkForUpdates()
        if case .updated = updateResult {
          stopOwnedService()
          relaunchUpdatedApplication()
          return
        }
      } catch {
        failureCode = "update_failed"
        stopOwnedService()
        failStart(
          message: "无法确认或安装 origin/main 最新版本。Koradio 未打开，请恢复网络或构建环境后重试。",
        )
        return
      }
    }
    updateStatus("正在启动…")
    if let existingPort = (firstPort...lastPort).first(where: isKoradioService) {
      selectedPort = existingPort
      finishStart()
      return
    }

    guard startBundledService() else {
      failStart()
      return
    }
    let deadline = Date().addingTimeInterval(15)
    while Date() < deadline {
      if let port = (firstPort...lastPort).first(where: isKoradioService) {
        selectedPort = port
        ownsService = true
        finishStart()
        return
      }
      Thread.sleep(forTimeInterval: 0.1)
    }
    failStart()
  }

  private func finishStart() {
    DispatchQueue.main.async {
      if self.smokeMode {
        FileHandle.standardOutput.write(Data("{\"ok\":true}\n".utf8))
        self.stopOwnedService()
        exit(0)
      } else {
        guard self.openDesktopWindow() else {
          self.failureCode = "desktop_window_failed"
          self.stopOwnedService()
          self.failStart(message: "Google Chrome 独立应用窗口无法打开。")
          return
        }
        self.isStarting = false
        self.updateStatus("Koradio")
      }
    }
  }

  private func failStart(message: String? = nil) {
    DispatchQueue.main.async {
      if self.smokeMode {
        FileHandle.standardError.write(
          Data("{\"ok\":false,\"code\":\"\(self.failureCode)\"}\n".utf8),
        )
        Foundation.exit(1)
      }
      let alert = NSAlert()
      alert.messageText = "Koradio 无法启动"
      alert.informativeText = message ?? "本地服务未能在受限 loopback 端口上就绪。"
      alert.runModal()
      self.isStarting = false
      self.updateStatus("Koradio · 启动失败")
    }
  }

  private func updateStatus(_ title: String) {
    DispatchQueue.main.async {
      self.statusItem?.button?.title = title
    }
  }

  private func checkForUpdates() throws -> UpdateResult {
    guard let resources = Bundle.main.resourceURL else {
      throw NSError(domain: "app.koradio.launcher", code: 1)
    }
    let node = resources.appendingPathComponent("runtime/bin/node", isDirectory: false)
    let updater = resources.appendingPathComponent("updater/update-macos.mjs", isDirectory: false)
    guard FileManager.default.isExecutableFile(atPath: node.path),
          FileManager.default.fileExists(atPath: updater.path)
    else {
      throw NSError(domain: "app.koradio.launcher", code: 2)
    }

    let process = Process()
    let stdout = Pipe()
    process.executableURL = node
    process.arguments = [
      updater.path,
      "--application",
      Bundle.main.bundlePath,
    ]
    process.environment = launcherEnvironment()
    process.standardOutput = stdout
    process.standardError = stdout
    try process.run()
    let stdoutData = stdout.fileHandleForReading.readDataToEndOfFile()
    process.waitUntilExit()
    guard process.terminationStatus == 0,
          let payload = try? JSONSerialization.jsonObject(with: stdoutData) as? [String: Any],
          let status = payload["status"] as? String
    else {
      throw NSError(domain: "app.koradio.launcher", code: 3)
    }
    if status == "current" {
      return .current
    }
    if status == "updated" {
      return .updated
    }
    throw NSError(domain: "app.koradio.launcher", code: 4)
  }

  private func relaunchUpdatedApplication() {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
    process.arguments = ["-n", "/Applications/Koradio.app"]
    do {
      try process.run()
      DispatchQueue.main.async {
        NSApplication.shared.terminate(nil)
      }
    } catch {
      failureCode = "updated_app_relaunch_failed"
      failStart(message: "最新版已安装，但重新打开失败。请再次点击 Launchpad 中的 Koradio。")
    }
  }

  private func openDesktopWindow() -> Bool {
    guard let selectedPort else {
      return false
    }
    let chrome = URL(
      fileURLWithPath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    )
    guard FileManager.default.isExecutableFile(atPath: chrome.path) else {
      return false
    }
    let process = Process()
    process.executableURL = chrome
    process.arguments = ["--app=http://127.0.0.1:\(selectedPort)/radio"]
    process.environment = launcherEnvironment()
    do {
      try process.run()
      return true
    } catch {
      return false
    }
  }

  private func launcherEnvironment() -> [String: String] {
    [
      "HOME": NSHomeDirectory(),
      "LANG": ProcessInfo.processInfo.environment["LANG"] ?? "en_US.UTF-8",
      "LOGNAME": NSUserName(),
      "PATH": "/usr/bin:/bin",
      "TMPDIR": ProcessInfo.processInfo.environment["TMPDIR"] ?? "/tmp",
      "USER": NSUserName(),
    ]
  }

  private func stopOwnedService() {
    guard ownsService, let service, service.isRunning else {
      return
    }
    service.terminate()
    let deadline = Date().addingTimeInterval(10)
    while service.isRunning && Date() < deadline {
      Thread.sleep(forTimeInterval: 0.05)
    }
    if service.isRunning {
      kill(service.processIdentifier, SIGKILL)
    }
    ownsService = false
    self.service = nil
  }

  private func startBundledService() -> Bool {
    guard let resources = Bundle.main.resourceURL else {
      failureCode = "bundle_resources_missing"
      return false
    }
    let node = resources.appendingPathComponent("runtime/bin/node", isDirectory: false)
    let entrypoint = resources.appendingPathComponent("app/apps/server/dist/bootstrap/main.js", isDirectory: false)
    guard FileManager.default.isExecutableFile(atPath: node.path),
          FileManager.default.fileExists(atPath: entrypoint.path)
    else {
      failureCode = "bundle_contents_missing"
      return false
    }

    let process = Process()
    process.executableURL = node
    process.arguments = [entrypoint.path]
    process.currentDirectoryURL = resources.appendingPathComponent("app", isDirectory: true)
    let providerMode = ProcessInfo.processInfo.environment["KORADIO_PROVIDER_MODE"] == "mock" ? "mock" : "live"
    let ttsHelper = resources.appendingPathComponent("qwen-tts-helper/main.py", isDirectory: false)
    let ttsPython = resources.appendingPathComponent("qwen-runtime/bin/python", isDirectory: false)
    var environment = launcherEnvironment().merging([
      "NODE_ENV": "production",
      "KORADIO_HOST": "127.0.0.1",
      "KORADIO_PORT": String(firstPort),
      "KORADIO_PROVIDER_MODE": providerMode,
    ]) { _, new in new }
    if FileManager.default.fileExists(atPath: ttsHelper.path),
       FileManager.default.isExecutableFile(atPath: ttsPython.path)
    {
      environment["KORADIO_TTS_HELPER_PATH"] = ttsHelper.path
      environment["KORADIO_TTS_PYTHON_PATH"] = ttsPython.path
    }
    if smokeMode, let dataDirectory = ProcessInfo.processInfo.environment["KORADIO_LAUNCHER_SMOKE_DATA_DIR"], !dataDirectory.isEmpty {
      environment["KORADIO_DATA_DIR"] = dataDirectory
    }
    process.environment = environment
    process.standardOutput = FileHandle.nullDevice
    process.standardError = FileHandle.nullDevice
    do {
      try process.run()
      service = process
      return true
    } catch {
      failureCode = "service_process_failed"
      return false
    }
  }

  private func isKoradioService(port: Int) -> Bool {
    let origin = "http://127.0.0.1:\(port)"
    var bootstrapRequest = URLRequest(url: URL(string: "\(origin)/api/v1/session/bootstrap")!)
    bootstrapRequest.httpMethod = "POST"
    bootstrapRequest.setValue(origin, forHTTPHeaderField: "Origin")
    guard let bootstrapData = requestData(bootstrapRequest),
          let bootstrap = try? JSONSerialization.jsonObject(with: bootstrapData) as? [String: Any],
          let token = bootstrap["accessToken"] as? String
    else {
      return false
    }

    var healthRequest = URLRequest(url: URL(string: "\(origin)/api/v1/health")!)
    healthRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    guard let healthData = requestData(healthRequest),
          let health = try? JSONSerialization.jsonObject(with: healthData) as? [String: Any]
    else {
      return false
    }
    return health["service"] as? String == "koradio"
  }

  private func requestData(_ input: URLRequest) -> Data? {
    let semaphore = DispatchSemaphore(value: 0)
    var result: Data?
    var request = input
    request.timeoutInterval = 0.5
    URLSession.shared.dataTask(with: request) { data, response, _ in
      defer { semaphore.signal() }
      guard let response = response as? HTTPURLResponse,
            response.statusCode >= 200,
            response.statusCode < 300,
            let data
      else {
        return
      }
      result = data
    }.resume()
    _ = semaphore.wait(timeout: .now() + 1)
    return result
  }
}

let app = NSApplication.shared
let delegate = KoradioLauncher()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
