import SwiftUI

@MainActor
final class ReportEntryViewModel: ObservableObject {
    @Published var messages: [DraftMessage] = [
        DraftMessage(role: .assistant, content: ReportEntryViewModel.assistantOpening)
    ]
    @Published var chatInput = ""
    @Published var selectedDate = Date()
    @Published var title = ""
    @Published var content = ""
    @Published var hoursText = "1"
    @Published var projects: [Project] = []
    @Published var workLogs: [WorkLog] = []
    @Published var selectedProjectId = ""
    @Published var savedDraftId: String?
    @Published var isLoadingProjects = false
    @Published var isSavingDraft = false
    @Published var isDrafting = false
    @Published var isSubmitting = false
    @Published var errorMessage: String?
    @Published var successMessage: String?

    fileprivate static let assistantOpening = "今天你完成了什么？告诉我任务、项目、风险或工时，我会整理成可提交的日报。"

    var hasDraftContent: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var todayLogs: [WorkLog] {
        workLogs.filter { String($0.date.prefix(10)) == DateHelpers.dayKey() }
    }

    var todaySubmittedCount: Int {
        todayLogs.filter { $0.status == .submitted }.count
    }

    var todayHoursText: String {
        let hours = todayLogs.reduce(0) { $0 + $1.hours.value }
        let rounded = (hours * 10).rounded() / 10
        if rounded.rounded() == rounded {
            return "\(Int(rounded))"
        }
        return String(format: "%.1f", rounded)
    }

    var todayRiskCount: Int {
        todayLogs.reduce(0) { total, log in
            total + (log.aiAnalysis?.risks.count ?? 0) + (log.aiAnalysis?.blockers.count ?? 0)
        }
    }

    var todayConclusion: String {
        if todaySubmittedCount > 0 {
            return "今天已提交 \(todaySubmittedCount) 条日报"
        }
        if hasDraftContent {
            return "日报草稿已准备，等待确认提交"
        }
        return "今天还未完成填报"
    }

    var todayRiskText: String {
        if todayRiskCount > 0 {
            return "发现 \(todayRiskCount) 个风险或阻塞，提交前建议补充处理动作。"
        }
        if todaySubmittedCount > 0 {
            return "暂无明显风险，今日工作信号已进入团队看板。"
        }
        return "先用一句话描述今天完成的事，系统会整理标题、内容和工时。"
    }

    func load(auth: AuthStore) async {
        isLoadingProjects = true
        defer { isLoadingProjects = false }
        do {
            let client = try auth.client()
            let allProjects: [Project] = try await client.request("/projects")
            projects = allProjects.filter { $0.status == .active }
            if !selectedProjectId.isEmpty, !projects.contains(where: { $0.id == selectedProjectId }) {
                selectedProjectId = ""
            }
            workLogs = try await client.request("/work-logs")
        } catch {
            projects = []
        }
    }

    func loadProjects(auth: AuthStore) async {
        await load(auth: auth)
    }

    func generateDraft(auth: AuthStore) async {
        let input = chatInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty else {
            errorMessage = "请先描述今天完成了什么"
            return
        }

        let userMessage = DraftMessage(role: .user, content: input)
        messages.append(userMessage)
        chatInput = ""
        isDrafting = true
        defer { isDrafting = false }

        do {
            let request = WorkLogDraftRequest(messages: messages, currentDate: DateHelpers.dayKey(selectedDate))
            let draft: WorkLogDraft = try await auth.client().request("/ai/work-log-draft", method: .post, body: request)
            if let date = DateHelpers.dayFormatter.date(from: draft.date) {
                selectedDate = date
            }
            title = draft.title
            content = draft.content
            hoursText = String(format: "%.1f", draft.hours).replacingOccurrences(of: ".0", with: "")
            messages.append(DraftMessage(role: .assistant, content: draft.assistantMessage))
            successMessage = draft.kind == .plan ? "已生成计划草稿" : "已生成日报草稿"
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func submit(auth: AuthStore) async {
        guard let payload = validatedPayload() else {
            return
        }

        isSubmitting = true
        defer { isSubmitting = false }
        do {
            let workLog = try await upsertDraft(auth: auth, payload: payload)
            let _: WorkLog = try await auth.client().request("/work-logs/\(workLog.id)/submit", method: .post)
            clearForm()
            await load(auth: auth)
            successMessage = "已提交"
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func saveDraft(auth: AuthStore) async {
        guard let payload = validatedPayload() else {
            return
        }

        isSavingDraft = true
        defer { isSavingDraft = false }
        do {
            let workLog = try await upsertDraft(auth: auth, payload: payload)
            savedDraftId = workLog.id
            await load(auth: auth)
            successMessage = "草稿已保存"
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func validatedPayload() -> CreateWorkLogRequest? {
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanContent = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanTitle.isEmpty, !cleanContent.isEmpty else {
            errorMessage = "请填写标题和内容"
            return nil
        }
        guard let hours = Double(hoursText), (0...24).contains(hours) else {
            errorMessage = "工时需在 0-24 之间"
            return nil
        }

        return CreateWorkLogRequest(
            date: DateHelpers.dayKey(selectedDate),
            title: cleanTitle,
            content: cleanContent,
            hours: hours,
            projectId: selectedProjectId.isEmpty ? nil : selectedProjectId
        )
    }

    private func upsertDraft(auth: AuthStore, payload: CreateWorkLogRequest) async throws -> WorkLog {
        if let savedDraftId {
            let update = UpdateWorkLogRequest(
                date: payload.date,
                title: payload.title,
                content: payload.content,
                hours: payload.hours,
                projectId: payload.projectId
            )
            return try await auth.client().request("/work-logs/\(savedDraftId)", method: .patch, body: update)
        }
        let created: WorkLog = try await auth.client().request("/work-logs", method: .post, body: payload)
        savedDraftId = created.id
        return created
    }

    func clearForm() {
        selectedDate = Date()
        title = ""
        content = ""
        hoursText = "1"
        selectedProjectId = ""
        savedDraftId = nil
        chatInput = ""
        messages = [
            DraftMessage(role: .assistant, content: Self.assistantOpening)
        ]
    }
}

struct ReportEntryView: View {
    @EnvironmentObject private var auth: AuthStore
    @StateObject private var viewModel = ReportEntryViewModel()
    @StateObject private var voiceInput = VoiceInputManager()
    @State private var voiceBaseText = ""
    let prefillDateKey: String?

    init(prefillDateKey: String? = nil) {
        self.prefillDateKey = prefillDateKey
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: AITheme.Spacing.lg) {
                    ReportEntryBriefHeader(
                        selectedDate: viewModel.selectedDate,
                        hasDraft: viewModel.hasDraftContent,
                        isRecording: voiceInput.isRecording
                    )

                    AIDraftComposer(
                        viewModel: viewModel,
                        voiceInput: voiceInput,
                        onToggleVoice: {
                            Task { await toggleVoiceInput() }
                        }
                    ) {
                        Task { await viewModel.generateDraft(auth: auth) }
                    }

                    if viewModel.hasDraftContent {
                        DailyDraftEditor(viewModel: viewModel)
                        ReportActionPanel(viewModel: viewModel) {
                            Task { await viewModel.saveDraft(auth: auth) }
                        } onSubmit: {
                            Task { await viewModel.submit(auth: auth) }
                        } onClear: {
                            viewModel.clearForm()
                        }
                    }
                }
                .padding(AITheme.Spacing.lg)
                .padding(.bottom, AITheme.Spacing.lg)
            }
            .background(AITheme.ColorToken.appBackground)
            .appTabBarContentInset(AITheme.Spacing.lg)
            .navigationTitle("填报")
            .compactNavigationTitle()
            .task {
                applyPrefillDate()
                await viewModel.load(auth: auth)
            }
            .onChange(of: prefillDateKey) {
                applyPrefillDate()
            }
            .onChange(of: voiceInput.transcript) {
                applyVoiceTranscript(voiceInput.transcript)
            }
            .onDisappear {
                voiceInput.stopRecording()
            }
            .refreshable {
                await viewModel.load(auth: auth)
            }
            .alert("提示", isPresented: successBinding) {
                Button("知道了", role: .cancel) {}
            } message: {
                Text(viewModel.successMessage ?? "")
            }
            .alert("操作失败", isPresented: errorBinding) {
                Button("知道了", role: .cancel) {}
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
    }

    private var successBinding: Binding<Bool> {
        Binding {
            viewModel.successMessage != nil
        } set: { isPresented in
            if !isPresented {
                viewModel.successMessage = nil
            }
        }
    }

    private var errorBinding: Binding<Bool> {
        Binding {
            viewModel.errorMessage != nil
        } set: { isPresented in
            if !isPresented {
                viewModel.errorMessage = nil
            }
        }
    }

    private func applyPrefillDate() {
        guard let prefillDateKey,
              let date = DateHelpers.dayFormatter.date(from: prefillDateKey) else {
            return
        }
        viewModel.selectedDate = date
    }

    private func toggleVoiceInput() async {
        if voiceInput.isRecording {
            voiceInput.stopRecording()
            return
        }
        voiceBaseText = viewModel.chatInput.trimmingCharacters(in: .whitespacesAndNewlines)
        await voiceInput.startRecording()
    }

    private func applyVoiceTranscript(_ transcript: String) {
        let cleanTranscript = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanTranscript.isEmpty else {
            return
        }
        if voiceBaseText.isEmpty {
            viewModel.chatInput = cleanTranscript
        } else {
            viewModel.chatInput = "\(voiceBaseText)\n\(cleanTranscript)"
        }
    }
}

private struct ReportEntryBriefHeader: View {
    let selectedDate: Date
    let hasDraft: Bool
    let isRecording: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
            HStack(alignment: .center, spacing: AITheme.Spacing.sm) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("今日填报")
                        .font(AITheme.Typography.pageTitle)
                        .foregroundStyle(AITheme.ColorToken.ink900)
                    Text("写一句，AI 整理成可提交日报。")
                        .font(AITheme.Typography.support)
                        .foregroundStyle(AITheme.ColorToken.textSecondary)
                }

                Spacer(minLength: 0)

                Text(dateText)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AITheme.ColorToken.primary)
                    .padding(.vertical, 7)
                    .padding(.horizontal, 10)
                    .background(AITheme.ColorToken.primarySurface)
                    .clipShape(Capsule())
            }

            HStack(spacing: AITheme.Spacing.xs) {
                ReportEntryStepPill(
                    title: "描述",
                    systemImage: isRecording ? "waveform" : "text.cursor",
                    tint: isRecording ? AITheme.ColorToken.ai : AITheme.ColorToken.primary,
                    isActive: !hasDraft
                )
                ReportEntryStepPill(
                    title: "确认",
                    systemImage: "checkmark.seal",
                    tint: hasDraft ? AITheme.ColorToken.success : AITheme.ColorToken.ink500,
                    isActive: hasDraft
                )
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var dateText: String {
        let components = Calendar(identifier: .gregorian).dateComponents([.month, .day], from: selectedDate)
        return "\(components.month ?? 0)月\(components.day ?? 0)日"
    }
}

private struct ReportEntryStepPill: View {
    let title: String
    let systemImage: String
    let tint: Color
    let isActive: Bool

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.caption.weight(.semibold))
            .foregroundStyle(isActive ? tint : AITheme.ColorToken.textSecondary)
            .frame(maxWidth: .infinity, minHeight: 34)
            .background(isActive ? tint.opacity(0.1) : AITheme.ColorToken.cardBackground)
            .clipShape(Capsule())
            .overlay {
                Capsule()
                    .stroke(isActive ? tint.opacity(0.22) : AITheme.ColorToken.separator, lineWidth: 0.7)
            }
    }
}

private struct WorkContextHeader: View {
    let user: AuthUser

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.xs) {
            Text("你好，\(user.name)")
                .font(.title3.weight(.semibold))
            Text([user.tenantName, user.departmentName].compactMap { $0 }.joined(separator: " · "))
                .font(AITheme.Typography.support)
                .foregroundStyle(AITheme.ColorToken.textSecondary)
        }
    }
}

private struct TodayStatusPanel: View {
    @ObservedObject var viewModel: ReportEntryViewModel

    var body: some View {
        CompactAIActionPanel(
            conclusion: viewModel.todayConclusion,
            risk: viewModel.todayRiskText,
            actionTitle: nil,
            systemImage: viewModel.todaySubmittedCount > 0 ? "checkmark.circle" : "sparkles"
        )
    }
}

private struct AIDraftComposer: View {
    @ObservedObject var viewModel: ReportEntryViewModel
    @ObservedObject var voiceInput: VoiceInputManager
    let onToggleVoice: () -> Void
    let onGenerate: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.md) {
            VStack(alignment: .leading, spacing: AITheme.Spacing.md) {
                HStack(alignment: .center, spacing: AITheme.Spacing.sm) {
                    Image(systemName: "sparkles")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(AITheme.ColorToken.ai)
                        .frame(width: 38, height: 38)
                        .background(AITheme.ColorToken.aiSurface)
                        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))

                    VStack(alignment: .leading, spacing: 3) {
                        Text("今天做了什么？")
                            .font(AITheme.Typography.title2)
                            .foregroundStyle(AITheme.ColorToken.ink900)
                        Text("任务、工时、风险，讲清楚即可。")
                            .font(AITheme.Typography.support)
                            .foregroundStyle(AITheme.ColorToken.textSecondary)
                    }

                    Spacer(minLength: 0)
                }

                HStack(spacing: AITheme.Spacing.xs) {
                    ReportHintChip(title: "任务", systemImage: "checklist")
                    ReportHintChip(title: "工时", systemImage: "clock")
                    ReportHintChip(title: "风险", systemImage: "exclamationmark.triangle")
                }

                VoiceTextInputRow(
                    text: $viewModel.chatInput,
                    isRecording: voiceInput.isRecording,
                    onToggleVoice: onToggleVoice
                )

                if voiceInput.isRecording {
                    Label("正在听你说... 最长 60 秒", systemImage: "waveform")
                        .font(AITheme.Typography.footnote)
                        .foregroundStyle(AITheme.ColorToken.ai)
                        .transition(.opacity)
                }

                if let voiceError = voiceInput.errorMessage {
                    Label(voiceError, systemImage: "exclamationmark.triangle.fill")
                        .font(AITheme.Typography.footnote)
                        .foregroundStyle(AITheme.ColorToken.danger)
                        .fixedSize(horizontal: false, vertical: true)
                        .transition(.opacity)
                }

                PrimaryActionButton(title: "生成草稿", systemImage: "sparkles", isLoading: viewModel.isDrafting, action: onGenerate)
                    .disabled(viewModel.isDrafting || voiceInput.isRecording || viewModel.chatInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(AITheme.Spacing.md)
        .background(AITheme.ColorToken.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.xl, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: AITheme.Radius.xl, style: .continuous)
                .stroke(AITheme.ColorToken.separator, lineWidth: 0.6)
        }
    }
}

private struct ReportHintChip: View {
    let title: String
    let systemImage: String

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.caption.weight(.semibold))
            .foregroundStyle(AITheme.ColorToken.textSecondary)
            .frame(maxWidth: .infinity, minHeight: 32)
            .background(AITheme.ColorToken.surface)
            .clipShape(Capsule())
    }
}

private struct VoiceTextInputRow: View {
    @Binding var text: String
    let isRecording: Bool
    let onToggleVoice: () -> Void

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            TextField("例如：完成登录页优化，修复构建问题，耗时 4 小时", text: $text, axis: .vertical)
                .font(AITheme.Typography.body)
                .lineLimit(5...8)
                .submitLabel(.send)
                .padding(.horizontal, AITheme.Spacing.md)
                .padding(.top, AITheme.Spacing.md)
                .padding(.bottom, AITheme.Spacing.xl + 10)
                .frame(minHeight: 150, alignment: .topLeading)
                .background(isRecording ? AITheme.ColorToken.aiSurface : AITheme.ColorToken.surface)
                .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous)
                        .stroke(isRecording ? AITheme.ColorToken.aiSoft : AITheme.ColorToken.separator, lineWidth: 0.9)
                }

            Button(action: onToggleVoice) {
                Label(isRecording ? "停止" : "语音", systemImage: isRecording ? "stop.circle.fill" : "mic")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(isRecording ? .white : AITheme.ColorToken.ai)
                    .frame(minWidth: 82, minHeight: 38)
                    .background(isRecording ? AITheme.ColorToken.ai : AITheme.ColorToken.aiSurface)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .padding(AITheme.Spacing.sm)
            .accessibilityLabel(isRecording ? "停止语音输入" : "开始语音输入")
        }
        .animation(.snappy, value: isRecording)
    }
}

private struct DailyDraftEditor: View {
    @ObservedObject var viewModel: ReportEntryViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.md) {
            HStack(alignment: .center, spacing: AITheme.Spacing.sm) {
                Image(systemName: "doc.text.fill")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(AITheme.ColorToken.primary)
                    .frame(width: 38, height: 38)
                    .background(AITheme.ColorToken.primarySurface)
                    .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))

                VStack(alignment: .leading, spacing: 3) {
                    Text("确认草稿")
                        .font(AITheme.Typography.section)
                        .foregroundStyle(AITheme.ColorToken.ink900)
                    Text("不会自动提交，改完再确认。")
                        .font(AITheme.Typography.footnote)
                        .foregroundStyle(AITheme.ColorToken.textSecondary)
                }
            }

            VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
                DatePicker("日期", selection: $viewModel.selectedDate, displayedComponents: .date)

                Picker("项目", selection: $viewModel.selectedProjectId) {
                    Text("不关联项目").tag("")
                    ForEach(viewModel.projects) { project in
                        Text(project.displayName).tag(project.id)
                    }
                }

                TextField("标题", text: $viewModel.title)
                    .textFieldStyle(AITextFieldStyle())

                TextField("工时", text: $viewModel.hoursText)
                    .textFieldStyle(AITextFieldStyle())
                    .decimalInputTraits()

                TextEditor(text: $viewModel.content)
                    .font(AITheme.Typography.body)
                    .frame(minHeight: 150)
                    .padding(AITheme.Spacing.xs)
                    .background(AITheme.ColorToken.surface)
                    .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous)
                            .stroke(AITheme.ColorToken.separator, lineWidth: 0.8)
                    }
                    .accessibilityLabel("日报内容")
            }
        }
        .padding(AITheme.Spacing.md)
        .background(AITheme.ColorToken.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.xl, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: AITheme.Radius.xl, style: .continuous)
                .stroke(AITheme.ColorToken.separator, lineWidth: 0.6)
        }
    }
}

private struct ReportActionPanel: View {
    @ObservedObject var viewModel: ReportEntryViewModel
    let onSave: () -> Void
    let onSubmit: () -> Void
    let onClear: () -> Void

    var body: some View {
        VStack(spacing: AITheme.Spacing.sm) {
            PrimaryActionButton(title: "提交", systemImage: "paperplane.fill", isLoading: viewModel.isSubmitting, action: onSubmit)
                .disabled(viewModel.isSubmitting || viewModel.isSavingDraft)

            HStack(spacing: AITheme.Spacing.sm) {
                SecondaryActionButton(
                    title: "保存",
                    systemImage: "tray.and.arrow.down",
                    isLoading: viewModel.isSavingDraft,
                    action: onSave
                )
                .disabled(viewModel.isSavingDraft || viewModel.isSubmitting)

                Button {
                    onClear()
                } label: {
                    Label("清空", systemImage: "trash")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(AITheme.ColorToken.danger)
                        .frame(maxWidth: .infinity, minHeight: AITheme.Layout.minTouchTarget)
                        .background(AITheme.ColorToken.dangerSurface)
                        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
    }
}
