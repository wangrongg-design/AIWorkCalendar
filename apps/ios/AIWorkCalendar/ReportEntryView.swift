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
    @Published var selectedProjectId = ""
    @Published var savedDraftId: String?
    @Published var isLoadingProjects = false
    @Published var isSavingDraft = false
    @Published var isDrafting = false
    @Published var isSubmitting = false
    @Published var errorMessage: String?
    @Published var successMessage: String?

    fileprivate static let assistantOpening = "今天你完成了什么？告诉我任务、项目、风险或工时，我会整理成可提交的日报。"

    func loadProjects(auth: AuthStore) async {
        isLoadingProjects = true
        defer { isLoadingProjects = false }
        do {
            let client = try auth.client()
            let allProjects: [Project] = try await client.request("/projects")
            projects = allProjects.filter { $0.status == .active }
            if !selectedProjectId.isEmpty, !projects.contains(where: { $0.id == selectedProjectId }) {
                selectedProjectId = ""
            }
        } catch {
            projects = []
        }
    }

    func generateDraft(auth: AuthStore) async {
        let input = chatInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty else {
            errorMessage = "请先告诉 AI 今天完成了什么"
            return
        }

        let userMessage = DraftMessage(role: .user, content: input)
        messages.append(userMessage)
        chatInput = ""
        isDrafting = true
        defer { isDrafting = false }

        do {
            let request = WorkLogDraftRequest(messages: messages, currentDate: DateHelpers.dayKey())
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

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: AITheme.Spacing.lg) {
                if let user = auth.user {
                    WorkContextHeader(user: user)
                }

                    AIInsightPanel(
                        title: "AI 今日节奏",
                        insights: [
                            viewModel.title.isEmpty ? "先用自然语言描述今天完成的工作，AI 会生成标题、摘要和工时。" : "草稿已生成，请重点检查项目、工时和风险描述。",
                            viewModel.selectedProjectId.isEmpty ? "关联项目后，团队看板可以更早发现延期和阻塞信号。" : "当前日报会进入项目维度分析，便于后续汇总。",
                            "提交后，AI 分析会用于日历风险点、项目状态和个人工作画像。"
                        ]
                    )

                    AIDraftComposer(viewModel: viewModel) {
                        Task { await viewModel.generateDraft(auth: auth) }
                    }

                    DailyDraftEditor(viewModel: viewModel)

                    ReportActionPanel(viewModel: viewModel) {
                        Task { await viewModel.saveDraft(auth: auth) }
                    } onSubmit: {
                        Task { await viewModel.submit(auth: auth) }
                    } onClear: {
                        viewModel.clearForm()
                    }
                }
                .padding(AITheme.Spacing.lg)
            }
            .background(AITheme.ColorToken.appBackground)
            .navigationTitle("今日工作")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task { await viewModel.loadProjects(auth: auth) }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .disabled(viewModel.isLoadingProjects)
                    .accessibilityLabel("刷新项目")
                }
            }
            .task {
                await viewModel.loadProjects(auth: auth)
            }
            .refreshable {
                await viewModel.loadProjects(auth: auth)
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
}

private struct WorkContextHeader: View {
    let user: AuthUser

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.xs) {
            Text("你好，\(user.name)")
                .font(AITheme.Typography.pageTitle)
            Text([user.tenantName, user.departmentName].compactMap { $0 }.joined(separator: " · "))
                .font(AITheme.Typography.support)
                .foregroundStyle(.secondary)
        }
    }
}

private struct AIDraftComposer: View {
    @ObservedObject var viewModel: ReportEntryViewModel
    let onGenerate: () -> Void

    var body: some View {
        BrandedCard {
            VStack(alignment: .leading, spacing: AITheme.Spacing.md) {
                SectionTitle("今天你完成了什么？", subtitle: "不用写格式，像和助理说话一样描述即可。")

                VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
                    ForEach(viewModel.messages.suffix(3)) { message in
                        Text(message.content)
                            .font(AITheme.Typography.support)
                            .foregroundStyle(message.role == .user ? .primary : .secondary)
                            .padding(AITheme.Spacing.sm)
                            .frame(maxWidth: .infinity, alignment: message.role == .user ? .trailing : .leading)
                            .background(message.role == .user ? AITheme.ColorToken.brand.opacity(0.10) : AITheme.ColorToken.activeBackground)
                            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))
                    }
                }

                TextField("例如：完成登录页重构，修复构建问题，推进项目日历风险提示，耗时 4 小时", text: $viewModel.chatInput, axis: .vertical)
                    .lineLimit(3...6)
                    .textFieldStyle(AITextFieldStyle())
                    .submitLabel(.send)

                PrimaryActionButton(title: "AI 帮我整理日报", systemImage: "sparkles", isLoading: viewModel.isDrafting, action: onGenerate)
                    .disabled(viewModel.isDrafting || viewModel.chatInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .opacity(viewModel.chatInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.52 : 1)
            }
        }
    }
}

private struct DailyDraftEditor: View {
    @ObservedObject var viewModel: ReportEntryViewModel

    var body: some View {
        BrandedCard {
            VStack(alignment: .leading, spacing: AITheme.Spacing.md) {
                SectionTitle("日报草稿", subtitle: "AI 生成后仍可手动校正，提交前请确认工时和项目。")

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
                    .frame(minHeight: 132)
                    .padding(AITheme.Spacing.xs)
                    .background(AITheme.ColorToken.activeBackground)
                    .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))
                    .accessibilityLabel("日报内容")
            }
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
            PrimaryActionButton(title: "提交今日工作", systemImage: "paperplane.fill", isLoading: viewModel.isSubmitting, action: onSubmit)
                .disabled(viewModel.isSubmitting || viewModel.isSavingDraft)

            Button(action: onSave) {
                if viewModel.isSavingDraft {
                    ProgressView()
                        .frame(maxWidth: .infinity, minHeight: AITheme.Layout.minTouchTarget)
                } else {
                    Label("保存为草稿", systemImage: "tray.and.arrow.down")
                        .frame(maxWidth: .infinity, minHeight: AITheme.Layout.minTouchTarget)
                }
            }
            .buttonStyle(.borderless)
            .disabled(viewModel.isSavingDraft || viewModel.isSubmitting)

            Button("清空") {
                onClear()
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
    }
}
