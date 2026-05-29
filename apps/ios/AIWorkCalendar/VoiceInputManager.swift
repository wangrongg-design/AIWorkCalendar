import Foundation
@preconcurrency import AVFoundation
@preconcurrency import Speech

enum VoiceInputAuthorizationStatus: Equatable {
    case notDetermined
    case authorized
    case denied
    case restricted
    case unavailable

    var isAuthorized: Bool {
        self == .authorized
    }
}

@MainActor
final class VoiceInputManager: ObservableObject {
    @Published var transcript = ""
    @Published var isRecording = false
    @Published var authorizationStatus: VoiceInputAuthorizationStatus = .notDetermined
    @Published var errorMessage: String?

    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh_CN"))
    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var timeoutTask: Task<Void, Never>?

    init() {
        authorizationStatus = currentAuthorizationStatus()
    }

    deinit {
        audioEngine.stop()
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        timeoutTask?.cancel()
    }

    func startRecording() async {
        guard !isRecording else {
            return
        }

        errorMessage = nil
        transcript = ""

        guard await requestPermissionsIfNeeded() else {
            return
        }

        guard let speechRecognizer, speechRecognizer.isAvailable else {
            authorizationStatus = .unavailable
            errorMessage = "当前设备暂不可用语音识别，请稍后再试。"
            return
        }

        do {
            try startAudioRecognition(with: speechRecognizer)
            isRecording = true
            scheduleTimeout()
        } catch {
            stopRecording()
            errorMessage = "无法开始录音：\(error.localizedDescription)"
        }
    }

    func stopRecording() {
        timeoutTask?.cancel()
        timeoutTask = nil

        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }

        recognitionRequest?.endAudio()
        recognitionTask?.finish()
        recognitionRequest = nil
        recognitionTask = nil
        isRecording = false

        #if os(iOS)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        #endif
    }

    private func requestPermissionsIfNeeded() async -> Bool {
        guard speechRecognizer != nil else {
            authorizationStatus = .unavailable
            errorMessage = "当前设备不支持中文语音识别。"
            return false
        }

        let microphoneGranted = await requestMicrophonePermission()
        let speechGranted = await requestSpeechPermission()
        authorizationStatus = currentAuthorizationStatus()

        if !microphoneGranted && !speechGranted {
            errorMessage = "请在系统设置中允许麦克风和语音识别权限。"
            return false
        }
        if !microphoneGranted {
            errorMessage = "请在系统设置中允许麦克风权限。"
            return false
        }
        if !speechGranted {
            errorMessage = "请在系统设置中允许语音识别权限。"
            return false
        }
        return true
    }

    private func startAudioRecognition(with speechRecognizer: SFSpeechRecognizer) throws {
        recognitionTask?.cancel()
        recognitionTask = nil

        #if os(iOS)
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        #endif

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if #available(iOS 16.0, *) {
            request.addsPunctuation = true
        }
        recognitionRequest = request

        let inputNode = audioEngine.inputNode
        inputNode.removeTap(onBus: 0)

        let recordingFormat = inputNode.outputFormat(forBus: 0)
        guard recordingFormat.sampleRate > 0, recordingFormat.channelCount > 0 else {
            throw VoiceInputError.microphoneUnavailable
        }

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak request] buffer, _ in
            request?.append(buffer)
        }

        audioEngine.prepare()
        try audioEngine.start()

        recognitionTask = speechRecognizer.recognitionTask(with: request) { [weak self] result, error in
            let recognizedText = result?.bestTranscription.formattedString
            let isFinal = result?.isFinal ?? false
            let errorDescription = error?.localizedDescription

            Task { @MainActor in
                guard let self else {
                    return
                }
                if let recognizedText {
                    self.transcript = recognizedText
                }
                if let errorDescription, self.isRecording {
                    self.errorMessage = "语音识别失败：\(errorDescription)"
                    self.stopRecording()
                    return
                }
                if isFinal {
                    self.stopRecording()
                }
            }
        }
    }

    private func scheduleTimeout() {
        timeoutTask?.cancel()
        timeoutTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 60_000_000_000)
            await MainActor.run {
                guard let self, self.isRecording else {
                    return
                }
                self.errorMessage = "已达到 60 秒录音上限，语音内容已填入输入框。"
                self.stopRecording()
            }
        }
    }

    private func requestMicrophonePermission() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            return true
        case .denied, .restricted:
            return false
        case .notDetermined:
            return await withCheckedContinuation { continuation in
                AVCaptureDevice.requestAccess(for: .audio) { granted in
                    continuation.resume(returning: granted)
                }
            }
        @unknown default:
            return false
        }
    }

    private func requestSpeechPermission() async -> Bool {
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized:
            return true
        case .denied, .restricted:
            return false
        case .notDetermined:
            return await withCheckedContinuation { continuation in
                SFSpeechRecognizer.requestAuthorization { status in
                    continuation.resume(returning: status == .authorized)
                }
            }
        @unknown default:
            return false
        }
    }

    private func currentAuthorizationStatus() -> VoiceInputAuthorizationStatus {
        guard speechRecognizer != nil else {
            return .unavailable
        }

        let microphoneStatus = AVCaptureDevice.authorizationStatus(for: .audio)
        let speechStatus = SFSpeechRecognizer.authorizationStatus()

        if microphoneStatus == .authorized, speechStatus == .authorized {
            return .authorized
        }
        if microphoneStatus == .denied || speechStatus == .denied {
            return .denied
        }
        if microphoneStatus == .restricted || speechStatus == .restricted {
            return .restricted
        }
        return .notDetermined
    }
}

private enum VoiceInputError: LocalizedError {
    case microphoneUnavailable

    var errorDescription: String? {
        switch self {
        case .microphoneUnavailable:
            return "没有检测到可用麦克风。"
        }
    }
}
