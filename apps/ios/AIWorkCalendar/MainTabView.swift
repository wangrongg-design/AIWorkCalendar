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
    var body: some View {
        TabView {
            ReportEntryView()
                .tabItem {
                    Label("填报", systemImage: "square.and.pencil")
                }

            CalendarDashboardView()
                .tabItem {
                    Label("月历", systemImage: "calendar")
                }

            WorkLogsView()
                .tabItem {
                    Label("记录", systemImage: "list.bullet.rectangle")
                }

            ProjectsView()
                .tabItem {
                    Label("项目", systemImage: "folder")
                }

            ProfileView()
                .tabItem {
                    Label("我的", systemImage: "person.crop.circle")
                }
        }
    }
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
                        MetricTile(title: "今日填报", value: "\(viewModel.todayLogs.count)", systemImage: "doc.text", tint: AITheme.ColorToken.brand)
                        MetricTile(title: "今日工时", value: "\(viewModel.todayHoursText)h", systemImage: "clock", tint: .blue)
                        MetricTile(title: "风险信号", value: "\(viewModel.todayRiskCount)", systemImage: "exclamationmark.triangle", tint: viewModel.todayRiskCount > 0 ? .orange : .green)
                        MetricTile(title: "近 7 日", value: "\(viewModel.weeklyHoursText)h", systemImage: "chart.line.uptrend.xyaxis", tint: .purple)
                    }

                    AIInsightPanel(title: "AI 工作画像", insights: viewModel.workProfileInsights)

                    BrandedCard {
                        VStack(alignment: .leading, spacing: AITheme.Spacing.md) {
                            SectionTitle("账号信息", subtitle: "用于企业内的日报归属和权限范围。")
                            LabeledContent("企业", value: user.tenantName)
                            LabeledContent("企业代码", value: user.tenantCode)
                            if let departmentName = user.departmentName {
                                LabeledContent("部门", value: departmentName)
                            }
                            if let email = user.email {
                                LabeledContent("邮箱", value: email)
                            }
                            LabeledContent("角色", value: user.roles.map(\.rawValue).joined(separator: "、"))
                        }
                    }
                }

                    BrandedCard {
                        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
                            SectionTitle("系统", subtitle: "接口地址由 iOS 配置文件管理。")
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

    var workProfileInsights: [String] {
        [
            todayLogs.isEmpty ? "今天还没有提交工作信号，AI 无法形成今日摘要。" : "今日已记录 \(todayLogs.count) 条工作，合计 \(todayHoursText) 小时。",
            todayRiskCount > 0 ? "AI 发现 \(todayRiskCount) 个风险或阻塞，建议在项目页确认影响范围。" : "今日暂无明显风险信号，适合保持当前节奏。",
            weeklyHours > 0 ? "近 7 日累计 \(weeklyHoursText) 小时，可作为个人工作节奏画像。" : "近 7 日暂无工时记录，画像会在持续填报后更准确。"
        ]
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

private struct ProfileHeader: View {
    let user: AuthUser

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.xs) {
            Text(user.name)
                .font(AITheme.Typography.pageTitle)
            Text([user.tenantName, user.departmentName].compactMap { $0 }.joined(separator: " · "))
                .font(AITheme.Typography.support)
                .foregroundStyle(.secondary)
        }
    }
}
