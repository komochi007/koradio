import AVFoundation
import Foundation

struct VoiceRecord: Codable {
  let identifier: String
  let language: String
  let name: String
  let isPersonalVoice: Bool
}

struct VoicesResponse: Codable {
  let voices: [VoiceRecord]
}

struct SynthesisCommand: Decodable {
  let text: String
  let language: String
  let voiceIdentifier: String
  let voiceStyle: String
}

struct SynthesisResponse: Codable {
  let audioBase64: String
  let fileExtension: String
  let mimeType: String
  let durationMs: Int
  let markers: [Marker]

  enum CodingKeys: String, CodingKey {
    case audioBase64
    case fileExtension = "extension"
    case mimeType
    case durationMs
    case markers
  }
}

struct Marker: Codable {}

final class AudioCollector: NSObject, AVSpeechSynthesizerDelegate {
  private let lock = NSLock()
  private var channels = 0
  private var sampleRate = 0
  private var samples: [Float] = []
  private var failed = false
  private var didComplete = false
  private let completed = DispatchSemaphore(value: 0)

  func append(_ buffer: AVAudioPCMBuffer) {
    if buffer.frameLength == 0 {
      finish()
      return
    }

    guard let channelData = buffer.floatChannelData else {
      lock.lock()
      failed = true
      lock.unlock()
      return
    }

    let frameCount = Int(buffer.frameLength)
    let channelCount = Int(buffer.format.channelCount)
    let rate = Int(buffer.format.sampleRate.rounded())
    guard channelCount > 0, rate > 0 else {
      lock.lock()
      failed = true
      lock.unlock()
      return
    }

    lock.lock()
    defer { lock.unlock() }
    if channels == 0 {
      channels = channelCount
      sampleRate = rate
    }
    guard channels == channelCount, sampleRate == rate else {
      failed = true
      return
    }
    samples.reserveCapacity(samples.count + frameCount * channelCount)
    for frame in 0..<frameCount {
      for channel in 0..<channelCount {
        samples.append(channelData[channel][frame])
      }
    }
  }

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
    finish()
  }

  private func finish() {
    lock.lock()
    defer { lock.unlock() }
    guard !didComplete else {
      return
    }
    didComplete = true
    completed.signal()
  }

  func wait() -> (channels: Int, sampleRate: Int, samples: [Float])? {
    let deadline = Date().addingTimeInterval(40)
    while Date() < deadline {
      if completed.wait(timeout: .now()) == .success {
        break
      }
      RunLoop.current.run(until: Date().addingTimeInterval(0.05))
    }
    lock.lock()
    defer { lock.unlock() }
    guard didComplete else {
      return nil
    }
    guard !failed, channels > 0, sampleRate > 0, !samples.isEmpty else {
      return nil
    }
    return (channels, sampleRate, samples)
  }
}

func isPersonalVoice(_ voice: AVSpeechSynthesisVoice) -> Bool {
  let identifier = voice.identifier.lowercased()
  let name = voice.name.lowercased()
  return identifier.contains("personal") || name.contains("personal voice")
}

func writeUInt16(_ value: UInt16, to data: inout Data) {
  var littleEndian = value.littleEndian
  withUnsafeBytes(of: &littleEndian) { data.append(contentsOf: $0) }
}

func writeUInt32(_ value: UInt32, to data: inout Data) {
  var littleEndian = value.littleEndian
  withUnsafeBytes(of: &littleEndian) { data.append(contentsOf: $0) }
}

func wavData(channels: Int, sampleRate: Int, samples: [Float]) -> Data? {
  let bytesPerSample = MemoryLayout<Float>.size
  let payloadBytes = samples.count * bytesPerSample
  guard payloadBytes <= Int(UInt32.max) - 36 else {
    return nil
  }
  let blockAlign = channels * bytesPerSample
  guard blockAlign <= Int(UInt16.max) else {
    return nil
  }
  var data = Data()
  data.append("RIFF".data(using: .ascii)!)
  writeUInt32(UInt32(payloadBytes + 36), to: &data)
  data.append("WAVEfmt ".data(using: .ascii)!)
  writeUInt32(16, to: &data)
  writeUInt16(3, to: &data)
  writeUInt16(UInt16(channels), to: &data)
  writeUInt32(UInt32(sampleRate), to: &data)
  writeUInt32(UInt32(sampleRate * blockAlign), to: &data)
  writeUInt16(UInt16(blockAlign), to: &data)
  writeUInt16(32, to: &data)
  data.append("data".data(using: .ascii)!)
  writeUInt32(UInt32(payloadBytes), to: &data)
  for sample in samples {
    writeUInt32(sample.bitPattern, to: &data)
  }
  return data
}

func printJson<T: Encodable>(_ value: T) throws {
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.sortedKeys]
  let data = try encoder.encode(value)
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data([0x0a]))
}

func fail() -> Never {
  FileHandle.standardError.write(Data("Koradio TTS helper failed\n".utf8))
  exit(1)
}

func listVoices() {
  let voices = AVSpeechSynthesisVoice.speechVoices()
    .filter { !isPersonalVoice($0) }
    .map {
      VoiceRecord(
        identifier: $0.identifier,
        language: $0.language,
        name: $0.name,
        isPersonalVoice: false,
      )
    }
    .sorted { $0.identifier < $1.identifier }
  do {
    try printJson(VoicesResponse(voices: voices))
  } catch {
    fail()
  }
}

func synthesize() {
  let input = FileHandle.standardInput.readDataToEndOfFile()
  guard input.count <= 12_000,
        let command = try? JSONDecoder().decode(SynthesisCommand.self, from: input),
        !command.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
        command.text.count <= 5_000,
        command.voiceIdentifier.count <= 200,
        !command.voiceStyle.isEmpty,
        let voice = AVSpeechSynthesisVoice(identifier: command.voiceIdentifier),
        voice.language == command.language,
        !isPersonalVoice(voice)
  else {
    fail()
  }

  let utterance = AVSpeechUtterance(string: command.text)
  utterance.voice = voice
  let collector = AudioCollector()
  let synthesizer = AVSpeechSynthesizer()
  synthesizer.delegate = collector
  synthesizer.write(utterance) { buffer in
    guard let pcmBuffer = buffer as? AVAudioPCMBuffer else {
      return
    }
    collector.append(pcmBuffer)
  }

  guard let audio = collector.wait(),
        let content = wavData(
          channels: audio.channels,
          sampleRate: audio.sampleRate,
          samples: audio.samples,
        )
  else {
    fail()
  }

  let frameCount = audio.samples.count / audio.channels
  let durationMs = max(1, Int((Double(frameCount) / Double(audio.sampleRate) * 1_000).rounded()))
  do {
    try printJson(
      SynthesisResponse(
        audioBase64: content.base64EncodedString(),
        fileExtension: "wav",
        mimeType: "audio/wav",
        durationMs: durationMs,
        markers: [],
      ),
    )
  } catch {
    fail()
  }
}

let arguments = Array(CommandLine.arguments.dropFirst())
if arguments == ["voices", "--json"] {
  listVoices()
} else if arguments == ["synthesize", "--json"] {
  synthesize()
} else {
  fail()
}
