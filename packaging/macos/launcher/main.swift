import AppKit
import Foundation

private let firstPort = 49373
private let lastPort = 49383

final class KoradioLauncher: NSObject, NSApplicationDelegate {
  private var service: Process?
  private var selectedPort: Int?
  private var ownsService = false
  private var smokeMode = false
  private var statusItem: NSStatusItem?
  private var failureCode = "service_not_ready"

  func launch() {
    smokeMode = CommandLine.arguments.contains("--smoke")
    if smokeMode {
      FileHandle.standardOutput.write(Data("{\"stage\":\"launch\"}\n".utf8))
    }
    if !smokeMode {
      installStatusMenu()
    }
    start()
  }

  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    stopOwnedService()
    return .terminateNow
  }

  @objc private func openKoradio() {
    guard let selectedPort else {
      return
    }
    NSWorkspace.shared.open(URL(string: "http://127.0.0.1:\(selectedPort)/")!)
  }

  @objc private func quitKoradio() {
    NSApplication.shared.terminate(nil)
  }

  private func installStatusMenu() {
    let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    statusItem.button?.title = "Koradio"
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
    }
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
        self.openKoradio()
      }
    }
  }

  private func failStart() {
    DispatchQueue.main.async {
      if self.smokeMode {
        FileHandle.standardError.write(
          Data("{\"ok\":false,\"code\":\"\(self.failureCode)\"}\n".utf8),
        )
        Foundation.exit(1)
      }
      let alert = NSAlert()
      alert.messageText = "Koradio 无法启动"
      alert.informativeText = "本地服务未能在受限 loopback 端口上就绪。"
      alert.runModal()
      NSApplication.shared.terminate(nil)
    }
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
    let providerMode = ProcessInfo.processInfo.environment["KORADIO_PROVIDER_MODE"] == "live" ? "live" : "mock"
    let ttsHelper = resources.appendingPathComponent("koradio-tts-helper", isDirectory: false)
    var environment: [String: String] = [
      "HOME": NSHomeDirectory(),
      "LANG": ProcessInfo.processInfo.environment["LANG"] ?? "en_US.UTF-8",
      "LOGNAME": NSUserName(),
      "NODE_ENV": "production",
      "PATH": "/usr/bin:/bin",
      "TMPDIR": ProcessInfo.processInfo.environment["TMPDIR"] ?? "/tmp",
      "USER": NSUserName(),
      "KORADIO_HOST": "127.0.0.1",
      "KORADIO_PORT": String(firstPort),
      "KORADIO_PROVIDER_MODE": providerMode,
    ]
    if FileManager.default.isExecutableFile(atPath: ttsHelper.path) {
      environment["KORADIO_TTS_HELPER_PATH"] = ttsHelper.path
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
delegate.launch()
app.run()
