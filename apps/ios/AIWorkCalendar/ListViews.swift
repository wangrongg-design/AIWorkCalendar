import SwiftUI

enum WorkLogListFilter: String, CaseIterable, Identifiable {
    case all
    case draft
    case submitted
    case risk

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all:
            return "全部"
        case .draft:
            return "草稿"
        case .submitted:
            return "已提交"
        case .risk:
            return "有风险"
        }
    }
}

@MainActor
final class WorkLogsViewModel: ObservableObject {
    @Published var logs: [WorkLog] = []
    @Published var searchText = ""
    @Published var filter: WorkLogListFilter = .all
    @Published var isLoading = false
    @Published var errorMessage: String?

    var filteredLogs: [WorkLog] {
        let statusFiltered = logs.filter { log in
            switch filter {
            case .all:
                return true
            case .draft:
                return log.status == .draft
            case .submitted:
                return log.status == .submitted
            case .risk:
                return log.hasAIRisk
            }
        }

        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else {
            return statusFiltered
        }
        return statusFiltered.filter { log in
            log.title.lowercased().contains(query)
                || log.content.lowercased().contains(query)
                || (log.project?.displayName.lowercased().contains(query) ?? false)
        }
    }

    func load(auth: AuthStore) async {
        isLoading = true
        defer { isLoading = false }
        do {
            logs = try await auth.client().request("/work-logs")
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func submit(_ log: WorkLog, auth: AuthStore) async {
        do {
            let _: WorkLog = try await auth.client().request("/work-logs/\(log.id)/submit", method: .post)
            await load(auth: auth)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func delete(_ log: WorkLog, auth: AuthStore) async {
        do {
            let _: OkResponse = try await auth.client().request("/work-logs/\(log.id)", method: .delete)
            await load(auth: auth)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct WorkLogsView: View {
    @EnvironmentObject private var auth: AuthStore
    @StateObject private var viewModel = WorkLogsViewModel()

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("状态", selection: $viewModel.filter) {
                        ForEach(WorkLogListFilter.allCases) { filter in
                            Text(filter.title).tag(filter)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                if viewModel.filteredLogs.isEmpty, !viewModel.isLoading {
                    EmptyListView(
                        title: viewModel.logs.isEmpty ? "暂无填报记录" : "没有匹配结果",
                        message: viewModel.logs.isEmpty ? "提交日报后会显示在这里。" : "调整搜索词或筛选条件后再试。",
                        systemImage: "doc.text.magnifyingglass"
                    )
                    .listRowBackground(Color.clear)
                }

                ForEach(viewModel.filteredLogs) { log in
                    NavigationLink {
                        WorkLogDetailView(log: log)
                    } label: {
                        WorkLogRow(log: log)
                    }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            Task { await viewModel.delete(log, auth: auth) }
                        } label: {
                            Label("删除", systemImage: "trash")
                        }

                        if log.status == .draft {
                            Button {
                                Task { await viewModel.submit(log, auth: auth) }
                            } label: {
                                Label("提交", systemImage: "paperplane")
                            }
                            .tint(AITheme.ColorToken.primary)
                        }
                    }
                }
            }
            .navigationTitle("填报记录")
            .compactNavigationTitle()
            .appTabBarContentInset(AITheme.Spacing.lg)
            .searchable(text: $viewModel.searchText, prompt: "搜索标题、内容或项目")
            .overlay {
                if viewModel.isLoading {
                    ProgressView()
                }
            }
            .task {
                await viewModel.load(auth: auth)
            }
            .refreshable {
                await viewModel.load(auth: auth)
            }
            .alert("操作失败", isPresented: errorBinding) {
                Button("知道了", role: .cancel) {}
            } message: {
                Text(viewModel.errorMessage ?? "")
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

struct WorkLogRow: View {
    let log: WorkLog

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.xs) {
            HStack(alignment: .firstTextBaseline) {
                Text(log.title)
                    .font(.headline)
                    .lineLimit(1)
                Spacer()
                StatusBadge(title: log.status.title, systemImage: nil, tint: log.status.badgeTint)
            }

            HStack(spacing: AITheme.Spacing.sm) {
                Text(String(log.date.prefix(10)))
                Text("\(log.hoursText)h")
                if let project = log.project {
                    Text(project.displayName)
                        .lineLimit(1)
                }
            }
            .font(.caption)
            .foregroundStyle(AITheme.ColorToken.textSecondary)

            Text(log.content)
                .font(.callout)
                .lineLimit(2)

            if log.hasAIRisk {
                Label("AI 发现风险或阻塞", systemImage: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(AITheme.ColorToken.danger)
            }
        }
        .padding(.vertical, 2)
        .padding(.leading, log.hasAIRisk ? AITheme.Spacing.xs : 0)
        .overlay(alignment: .leading) {
            if log.hasAIRisk {
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .fill(AITheme.ColorToken.danger)
                    .frame(width: 3)
            }
        }
    }
}

struct WorkLogDetailView: View {
    let log: WorkLog

    var body: some View {
        List {
            Section("填报") {
                LabeledContent("日期", value: String(log.date.prefix(10)))
                LabeledContent("状态", value: log.status.title)
                LabeledContent("工时", value: "\(log.hoursText) 小时")
                if let project = log.project {
                    LabeledContent("项目", value: project.displayName)
                }
            }

            Section("内容") {
                Text(log.content)
            }

            if let analysis = log.aiAnalysis {
                Section("AI 分析") {
                    if let summary = analysis.summary, !summary.isEmpty {
                        LabeledContent("建议", value: summary)
                    }
                    if !analysis.achievements.isEmpty {
                        LabeledContent("成果", value: analysis.achievements.joined(separator: "；"))
                    }
                    if !analysis.risks.isEmpty {
                        LabeledContent {
                            Text(analysis.risks.joined(separator: "；"))
                                .foregroundStyle(AITheme.ColorToken.danger)
                        } label: {
                            Text("风险")
                        }
                    }
                    if !analysis.blockers.isEmpty {
                        LabeledContent {
                            Text(analysis.blockers.joined(separator: "；"))
                                .foregroundStyle(AITheme.ColorToken.warning)
                        } label: {
                            Text("阻塞")
                        }
                    }
                    if !analysis.keywords.isEmpty {
                        LabeledContent("关键词", value: analysis.keywords.joined(separator: "，"))
                    }
                }
            }
        }
        .navigationTitle(log.title)
        .compactNavigationTitle()
        .appTabBarContentInset(AITheme.Spacing.md)
    }
}

@MainActor
final class ProjectsViewModel: ObservableObject {
    @Published var projects: [Project] = []
    @Published var searchText = ""
    @Published var riskOnly = false
    @Published var isLoading = false
    @Published var errorMessage: String?

    var filteredProjects: [Project] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let source = riskOnly ? projects.filter(\.hasProjectRisk) : projects
        guard !query.isEmpty else {
            return source
        }
        return source.filter { project in
            project.displayName.lowercased().contains(query)
                || (project.description?.lowercased().contains(query) ?? false)
                || (project.owner?.name.lowercased().contains(query) ?? false)
        }
    }

    var projectConclusion: String {
        let active = projects.filter { $0.status == .active }.count
        return active > 0 ? "\(active) 个项目进行中" : "当前没有进行中项目"
    }

    var projectRiskText: String {
        let paused = projects.filter { $0.status == .paused }.count
        let missingOwner = projects.filter { $0.owner == nil }.count
        let risks = projects.filter(\.hasProjectRisk).count
        if risks > 0 {
            return "\(risks) 个项目需要关注，包含暂停、临期或负责人缺失。"
        }
        if paused > 0 || missingOwner > 0 {
            return "存在项目状态不完整，建议补齐负责人和周期。"
        }
        return "项目状态整体稳定，继续关注临近截止日期。"
    }

    func load(auth: AuthStore) async {
        isLoading = true
        defer { isLoading = false }
        do {
            projects = try await auth.client().request("/projects")
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct ProjectsView: View {
    @EnvironmentObject private var auth: AuthStore
    @StateObject private var viewModel = ProjectsViewModel()

    var body: some View {
        NavigationStack {
            List {
                if !viewModel.projects.isEmpty {
                    CompactAIActionPanel(
                        conclusion: viewModel.projectConclusion,
                        risk: viewModel.projectRiskText,
                        actionTitle: viewModel.riskOnly ? "查看全部项目" : "只看异常项目",
                        systemImage: "scope"
                    ) {
                        viewModel.riskOnly.toggle()
                    }
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }

                if viewModel.filteredProjects.isEmpty, !viewModel.isLoading {
                    EmptyListView(
                        title: viewModel.projects.isEmpty ? "暂无项目" : "没有匹配项目",
                        message: viewModel.projects.isEmpty ? "项目由企业管理员在现有后台创建。" : "调整搜索词后再试。",
                        systemImage: "folder.badge.questionmark"
                    )
                    .listRowBackground(Color.clear)
                }

                ForEach(viewModel.filteredProjects) { project in
                    NavigationLink {
                        ProjectDetailView(project: project)
                    } label: {
                        ProjectRow(project: project)
                    }
                }
            }
            .navigationTitle("项目")
            .compactNavigationTitle()
            .appTabBarContentInset(AITheme.Spacing.lg)
            .scrollContentBackground(.hidden)
            .background(AITheme.ColorToken.appBackground)
            .searchable(text: $viewModel.searchText, prompt: "搜索项目、负责人")
            .overlay {
                if viewModel.isLoading {
                    ProgressView()
                }
            }
            .task {
                await viewModel.load(auth: auth)
            }
            .refreshable {
                await viewModel.load(auth: auth)
            }
            .alert("加载失败", isPresented: errorBinding) {
                Button("知道了", role: .cancel) {}
            } message: {
                Text(viewModel.errorMessage ?? "")
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

struct ProjectRow: View {
    let project: Project

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
            HStack(alignment: .firstTextBaseline) {
                Text(project.displayName)
                    .font(.headline)
                    .lineLimit(1)
                Spacer()
                StatusBadge(title: project.status.title, systemImage: nil, tint: project.status.badgeTint)
            }

            HStack(spacing: AITheme.Spacing.sm) {
                Label(project.owner?.name ?? "未设置负责人", systemImage: "person")
                Label(project.dueText, systemImage: "clock")
            }
            .font(.caption)
            .foregroundStyle(AITheme.ColorToken.textSecondary)

            Label(project.aiRiskHint, systemImage: "sparkles")
                .font(.caption)
                .foregroundStyle(project.aiRiskTint)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, AITheme.Spacing.xs)
    }
}

struct ProjectDetailView: View {
    let project: Project

    var body: some View {
        List {
            ProjectDetailHeader(project: project)
                .listRowInsets(EdgeInsets(top: AITheme.Spacing.md, leading: AITheme.Spacing.lg, bottom: AITheme.Spacing.md, trailing: AITheme.Spacing.lg))
                .listRowBackground(Color.clear)

            Section("AI 项目判断") {
                Label(project.aiRiskHint, systemImage: "sparkles")
                    .foregroundStyle(project.aiRiskTint)
                LabeledContent("负责人", value: project.owner?.name ?? "未设置")
                LabeledContent("周期", value: project.timelineText)
            }

            Section("项目") {
                LabeledContent("名称", value: project.name)
                if let code = project.code, !code.isEmpty {
                    LabeledContent("编码", value: code)
                }
                LabeledContent("状态") {
                    StatusBadge(title: project.status.title, systemImage: nil, tint: project.status.badgeTint)
                }
            }

            if let description = project.description, !description.isEmpty {
                Section("说明") {
                    Text(description)
                }
            }

            if let owner = project.owner {
                Section("负责人") {
                    LabeledContent("姓名", value: owner.name)
                    if let email = owner.email {
                        LabeledContent("邮箱", value: email)
                    }
                    if let department = owner.department?.name {
                        LabeledContent("部门", value: department)
                    }
                }
            }

            Section("周期") {
                LabeledContent("开始", value: project.startDate.map { String($0.prefix(10)) } ?? "未设置")
                LabeledContent("结束", value: project.endDate.map { String($0.prefix(10)) } ?? "未设置")
            }
        }
        .navigationTitle("项目详情")
        .compactNavigationTitle()
        .appTabBarContentInset(AITheme.Spacing.md)
    }
}

private struct ProjectDetailHeader: View {
    let project: Project

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.xs) {
            Text(project.name)
                .font(AITheme.Typography.pageTitle)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            if let code = project.code, !code.isEmpty {
                Text(code)
                    .font(AITheme.Typography.support)
                    .foregroundStyle(AITheme.ColorToken.textSecondary)
            }
            HStack(spacing: AITheme.Spacing.xs) {
                StatusBadge(title: project.status.title, systemImage: nil, tint: project.status.badgeTint)
                FlatTag(title: project.dueText, systemImage: "clock", tint: project.aiRiskTint)
            }
        }
    }
}

private extension WorkLog {
    var hasAIRisk: Bool {
        !(aiAnalysis?.risks.isEmpty ?? true) || !(aiAnalysis?.blockers.isEmpty ?? true)
    }
}

private extension Project {
    var timelineText: String {
        switch (startDate, endDate) {
        case let (start?, end?):
            return "\(String(start.prefix(10))) - \(String(end.prefix(10)))"
        case let (start?, nil):
            return "\(String(start.prefix(10))) 开始"
        case let (nil, end?):
            return "\(String(end.prefix(10))) 截止"
        default:
            return "周期未设置"
        }
    }

    var dueText: String {
        guard let endDate,
              let end = DateHelpers.dayFormatter.date(from: String(endDate.prefix(10))) else {
            return "无截止"
        }
        let days = Calendar.current.dateComponents([.day], from: Date(), to: end).day ?? 0
        if days < 0 {
            return "已逾期 \(abs(days)) 天"
        }
        if days == 0 {
            return "今天截止"
        }
        return "\(days) 天后截止"
    }

    var hasProjectRisk: Bool {
        if status == .paused || owner == nil {
            return true
        }
        if let endDate,
           let end = DateHelpers.dayFormatter.date(from: String(endDate.prefix(10))) {
            let days = Calendar.current.dateComponents([.day], from: Date(), to: end).day ?? 0
            return days <= 7
        }
        return false
    }

    var aiRiskHint: String {
        if status == .paused {
            return "AI 检测到推进暂停，建议确认阻塞原因。"
        }
        if owner == nil {
            return "AI 检测到负责人缺失，风险归属不清晰。"
        }
        if let endDate,
           let end = DateHelpers.dayFormatter.date(from: String(endDate.prefix(10))) {
            let days = Calendar.current.dateComponents([.day], from: Date(), to: end).day ?? 0
            if days < 0 {
                return "AI 检测到项目已过结束日期，建议复核交付状态。"
            }
            if days <= 7, status == .active {
                return "AI 检测到交付窗口临近，建议关注延期风险。"
            }
        }
        if description?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false {
            return "AI 建议补充项目目标，便于日报自动归因。"
        }
        return "AI 暂未发现明显项目风险。"
    }

    var aiRiskTint: Color {
        if status == .paused || owner == nil {
            return AITheme.ColorToken.warning
        }
        if let endDate,
           let end = DateHelpers.dayFormatter.date(from: String(endDate.prefix(10))) {
            let days = Calendar.current.dateComponents([.day], from: Date(), to: end).day ?? 0
            if days <= 7 {
                return days < 0 ? AITheme.ColorToken.danger : AITheme.ColorToken.warning
            }
        }
        return AITheme.ColorToken.ai
    }
}
