import SwiftUI

@MainActor
final class ReportEntryViewModel: ObservableObject {
    @Published var messages: [DraftMessage] = [
        DraftMessage(role: .assistant, content: "告诉我今天做了什么、花了多久，或明天计划做什么。我会整理成日报或计划草稿。")
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
            errorMessage = "请输入填报内容"
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
            DraftMessage(role: .assistant, content: "告诉我今天做了什么、花了多久，或明天计划做什么。我会整理成日报或计划草稿。")
        ]
    }
}

struct ReportEntryView: View {
    @EnvironmentObject private var auth: AuthStore
    @StateObject private var viewModel = ReportEntryViewModel()

    var body: some View {
        NavigationStack {
            Form {
                if let user = auth.user {
                    Section {
                        HStack(spacing: 12) {
                            Image(systemName: "person.crop.circle")
                                .font(.title2)
                                .foregroundStyle(Color.accentColor)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(user.name)
                                    .font(.headline)
                                Text([user.tenantName, user.departmentName].compactMap { $0 }.joined(separator: " · "))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                Section("AI 草稿") {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(viewModel.messages) { message in
                                Text(message.content)
                                    .font(.callout)
                                    .padding(10)
                                    .frame(maxWidth: .infinity, alignment: message.role == .user ? .trailing : .leading)
                                    .background(message.role == .user ? Color.accentColor.opacity(0.14) : Color.secondary.opacity(0.12))
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                        }
                    }
                    .frame(minHeight: 120)

                    TextField("输入今天工作内容或计划", text: $viewModel.chatInput, axis: .vertical)
                        .lineLimit(2...5)
                        .submitLabel(.send)

                    Button {
                        Task { await viewModel.generateDraft(auth: auth) }
                    } label: {
                        if viewModel.isDrafting {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Label("生成草稿", systemImage: "sparkles")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(viewModel.isDrafting || viewModel.chatInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }

                Section("日报") {
                    DatePicker("日期", selection: $viewModel.selectedDate, displayedComponents: .date)

                    Picker("项目", selection: $viewModel.selectedProjectId) {
                        Text("不关联项目").tag("")
                        ForEach(viewModel.projects) { project in
                            Text(project.displayName).tag(project.id)
                        }
                    }

                    TextField("标题", text: $viewModel.title)
                    TextField("工时", text: $viewModel.hoursText)
                        .decimalInputTraits()
                    TextEditor(text: $viewModel.content)
                        .frame(minHeight: 140)
                        .accessibilityLabel("日报内容")
                }

                Section {
                    Button {
                        Task { await viewModel.saveDraft(auth: auth) }
                    } label: {
                        if viewModel.isSavingDraft {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Label("保存草稿", systemImage: "tray.and.arrow.down")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(viewModel.isSavingDraft || viewModel.isSubmitting)

                    Button {
                        Task { await viewModel.submit(auth: auth) }
                    } label: {
                        if viewModel.isSubmitting {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Label("提交填报", systemImage: "paperplane.fill")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(viewModel.isSubmitting || viewModel.isSavingDraft)

                    Button("清空", role: .destructive) {
                        viewModel.clearForm()
                    }
                }
            }
            .navigationTitle("工作填报")
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
