import SwiftUI

struct RootView: View {
    @StateObject private var auth = AuthStore()

    var body: some View {
        Group {
            if auth.isAuthenticated {
                MainTabView()
                    .environmentObject(auth)
            } else {
                LoginView()
                    .environmentObject(auth)
            }
        }
        .task {
            await auth.refreshMeIfPossible()
        }
    }
}

struct MainTabView: View {
    @State private var selectedTab: AppTab = .calendar
    @State private var reportDateKey: String?

    var body: some View {
        TabView(selection: $selectedTab) {
            CalendarDashboardView(
                onCreateReport: { dateKey in
                    reportDateKey = dateKey
                    selectedTab = .entry
                },
                onOpenProjects: {
                    selectedTab = .projects
                }
            )
                .tabItem {
                    Label("AI日历", systemImage: "calendar")
                }
                .tag(AppTab.calendar)

            ReportEntryView(prefillDateKey: reportDateKey)
                .tabItem {
                    Label("填报", systemImage: "square.and.pencil")
                }
                .tag(AppTab.entry)

            WorkLogsView()
                .tabItem {
                    Label("记录", systemImage: "list.bullet.rectangle")
                }
                .tag(AppTab.logs)

            ProjectsView()
                .tabItem {
                    Label("项目", systemImage: "folder")
                }
                .tag(AppTab.projects)

            ProfileView()
                .tabItem {
                    Label("我的", systemImage: "person.crop.circle")
                }
                .tag(AppTab.profile)
        }
        .tint(AITheme.ColorToken.primary)
    }
}

private enum AppTab: Hashable {
    case calendar
    case entry
    case logs
    case projects
    case profile
}

struct ProfileView: View {
    @EnvironmentObject private var auth: AuthStore
    @StateObject private var viewModel = ProfileViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: AITheme.Spacing.lg) {
                    if let user = auth.user {
                        ProfileHeader(user: user)

                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: AITheme.Spacing.sm) {
                            MetricTile(title: "今日填报", value: "\(viewModel.todayLogs.count)", systemImage: "doc.text", tint: AITheme.ColorToken.primary)
                            MetricTile(title: "今日工时", value: "\(viewModel.todayHoursText)h", systemImage: "clock", tint: AITheme.ColorToken.primaryHover)
                            MetricTile(title: "风险信号", value: "\(viewModel.todayRiskCount)", systemImage: "exclamationmark.triangle", tint: viewModel.todayRiskCount > 0 ? AITheme.ColorToken.warning : AITheme.ColorToken.success)
                            MetricTile(title: "近 7 日", value: "\(viewModel.weeklyHoursText)h", systemImage: "chart.line.uptrend.xyaxis", tint: AITheme.ColorToken.ai)
                        }

                        CompactAIActionPanel(
                            conclusion: viewModel.profileConclusion,
                            risk: viewModel.profileRiskText,
                            systemImage: "person.text.rectangle"
                        )

                        BrandedCard {
                            VStack(alignment: .leading, spacing: AITheme.Spacing.md) {
                                SectionTitle("企业与权限", subtitle: "用于日报归属、团队范围和管理权限。")
                                LabeledContent("企业", value: user.tenantName)
                                LabeledContent("企业代码", value: user.tenantCode)
                                if let departmentName = user.departmentName {
                                    LabeledContent("部门", value: departmentName)
                                }
                                if let email = user.email {
                                    LabeledContent("邮箱", value: email)
                                }
                                LabeledContent("角色", value: user.roles.map(\.title).joined(separator: "、"))
                            }
                        }
                    }

                    BrandedCard {
                        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
                            SectionTitle("账号安全")
                            LabeledContent("登录状态", value: "已登录")
                            LabeledContent("通知设置", value: "跟随系统")
                            LabeledContent("API", value: auth.apiBaseURL)
                        }
                    }

                    Button("退出登录", role: .destructive) {
                        auth.logout()
                    }
                    .frame(maxWidth: .infinity, minHeight: AITheme.Layout.minTouchTarget)
                }
                .padding(AITheme.Spacing.lg)
            }
            .background(AITheme.ColorToken.appBackground)
            .navigationTitle("我的")
            .compactNavigationTitle()
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
        }
    }
}

@MainActor
final class ProfileViewModel: ObservableObject {
    @Published var logs: [WorkLog] = []
    @Published var isLoading = false

    var todayLogs: [WorkLog] {
        logs.filter { String($0.date.prefix(10)) == DateHelpers.dayKey() }
    }

    var todayHours: Double {
        todayLogs.reduce(0) { $0 + $1.hours.value }
    }

    var todayHoursText: String {
        formatHours(todayHours)
    }

    var todayRiskCount: Int {
        todayLogs.reduce(0) { total, log in
            total + (log.aiAnalysis?.risks.count ?? 0) + (log.aiAnalysis?.blockers.count ?? 0)
        }
    }

    var weeklyHours: Double {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        return logs.reduce(0) { total, log in
            guard let date = DateHelpers.dayFormatter.date(from: String(log.date.prefix(10))) else {
                return total
            }
            let diff = calendar.dateComponents([.day], from: calendar.startOfDay(for: date), to: today).day ?? 999
            return (0...6).contains(diff) ? total + log.hours.value : total
        }
    }

    var weeklyHoursText: String {
        formatHours(weeklyHours)
    }

    var profileConclusion: String {
        todayLogs.isEmpty ? "今天还没有工作摘要" : "今日 \(todayLogs.count) 条记录，\(todayHoursText) 小时"
    }

    var profileRiskText: String {
        if todayRiskCount > 0 {
            return "AI 发现 \(todayRiskCount) 个风险或阻塞，建议回到项目页确认影响范围。"
        }
        if weeklyHours > 0 {
            return "近 7 日累计 \(weeklyHoursText) 小时，工作画像会随持续填报更准确。"
        }
        return "连续填报后，这里会形成个人节奏、风险和效率画像。"
    }

    func load(auth: AuthStore) async {
        isLoading = true
        defer { isLoading = false }
        do {
            logs = try await auth.client().request("/work-logs")
        } catch {
            logs = []
        }
    }

    private func formatHours(_ value: Double) -> String {
        let rounded = (value * 10).rounded() / 10
        if rounded.rounded() == rounded {
            return "\(Int(rounded))"
        }
        return String(format: "%.1f", rounded)
    }
}

private extension RoleCode {
    var title: String {
        switch self {
        case .superAdmin:
            return "平台超管"
        case .companyAdmin:
            return "企业管理员"
        case .departmentManager:
            return "部门经理"
        case .employee:
            return "员工"
        }
    }
}

private struct ProfileHeader: View {
    let user: AuthUser

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.xs) {
            Text(user.name)
                .font(AITheme.Typography.pageTitle)
            Text([user.tenantName, user.departmentName].compactMap { $0 }.joined(separator: " · "))
                .font(AITheme.Typography.support)
                .foregroundStyle(AITheme.ColorToken.textSecondary)
        }
    }
}
