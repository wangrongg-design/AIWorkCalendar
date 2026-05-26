import SwiftUI

@MainActor
final class CalendarViewModel: ObservableObject {
    @Published var month = DateHelpers.monthKey()
    @Published var scope: Scope = .selfScope
    @Published var totalEmployees = 0
    @Published var days: [CalendarDay] = []
    @Published var grid: [MonthGridItem] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    func configure(for user: AuthUser?) {
        guard let firstScope = user?.availableScopes.first else {
            scope = .selfScope
            return
        }
        if user?.availableScopes.contains(scope) != true {
            scope = firstScope
        }
    }

    func load(auth: AuthStore) async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response: CalendarResponse = try await auth.client().request("/analytics/calendar?month=\(month)&scope=\(scope.rawValue)")
            totalEmployees = response.totalEmployees
            days = response.days
            grid = DateHelpers.buildMonthGrid(month: month, days: response.days)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func moveMonth(by diff: Int, auth: AuthStore) async {
        month = DateHelpers.addMonths(to: month, diff: diff)
        await load(auth: auth)
    }

    var dashboardInsights: [String] {
        let today = days.first(where: { $0.date == DateHelpers.dayKey() })
        let riskDays = days.filter { $0.riskCount > 0 }.count
        let lowFillDays = days.filter { $0.fillRate > 0 && $0.fillRate < 60 }.count
        return [
            today.map { String(format: "今日填报率 %.1f%%，AI 会优先关注缺填和风险日志。", $0.fillRate) } ?? "今天还没有填报信号，适合先提醒团队完成日报。",
            riskDays > 0 ? "本月已有 \(riskDays) 天出现风险信号，建议进入红点日期查看阻塞来源。" : "本月暂未发现明显风险日期，继续保持日报完整度。",
            lowFillDays > 0 ? "\(lowFillDays) 天填报率偏低，可能影响团队进度判断。" : "填报节奏整体稳定，月历可作为团队状态入口。"
        ]
    }
}

struct CalendarDashboardView: View {
    @EnvironmentObject private var auth: AuthStore
    @StateObject private var viewModel = CalendarViewModel()

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 7)

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: AITheme.Spacing.lg) {
                    HStack {
                        Button {
                            Task { await viewModel.moveMonth(by: -1, auth: auth) }
                        } label: {
                            Image(systemName: "chevron.left")
                        }
                        .buttonStyle(.borderless)

                        Spacer()

                        Text(viewModel.month)
                            .font(AITheme.Typography.pageTitle)

                        Spacer()

                        Button {
                            Task { await viewModel.moveMonth(by: 1, auth: auth) }
                        } label: {
                            Image(systemName: "chevron.right")
                        }
                        .buttonStyle(.borderless)
                    }

                    Picker("范围", selection: $viewModel.scope) {
                        ForEach(auth.user?.availableScopes ?? [.selfScope]) { scope in
                            Text(scope.title).tag(scope)
                        }
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: viewModel.scope) {
                        Task { await viewModel.load(auth: auth) }
                    }

                    HStack(spacing: 12) {
                        MetricTile(title: "应填人数", value: "\(viewModel.totalEmployees)", systemImage: "person.2", tint: .blue)
                        if let today = viewModel.days.first(where: { $0.date == DateHelpers.dayKey() }) {
                            MetricTile(title: "今日填报率", value: String(format: "%.1f%%", today.fillRate), systemImage: "chart.pie", tint: .green)
                        }
                    }

                    AIInsightPanel(title: "AI 月度洞察", insights: viewModel.dashboardInsights)

                    BrandedCard {
                        VStack(alignment: .leading, spacing: AITheme.Spacing.md) {
                            CalendarLegend()

                            LazyVGrid(columns: columns, spacing: 8) {
                                ForEach(DateHelpers.weekdays, id: \.self) { weekday in
                                    Text(weekday)
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(.secondary)
                                        .frame(maxWidth: .infinity)
                                }

                                ForEach(viewModel.grid) { item in
                                    if item.isBlank {
                                        Color.clear
                                            .frame(height: 52)
                                    } else {
                                        NavigationLink {
                                            DayDetailView(date: item.id, scope: viewModel.scope)
                                        } label: {
                                            CalendarDayCell(item: item)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(AITheme.Spacing.lg)
            }
            .background(AITheme.ColorToken.appBackground)
            .navigationTitle("月历看板")
            .overlay {
                if viewModel.isLoading {
                    ProgressView()
                }
            }
            .task {
                viewModel.configure(for: auth.user)
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

struct CalendarDayCell: View {
    let item: MonthGridItem

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.xs) {
            Text("\(item.day ?? 0)")
                .font(.callout.weight(item.isToday ? .bold : .regular))
                .foregroundStyle(item.isToday ? AITheme.ColorToken.brand : .primary)
                .frame(maxWidth: .infinity, alignment: .leading)

            Spacer(minLength: 0)

            HStack(spacing: 3) {
                ForEach(statusDots, id: \.label) { dot in
                    Circle()
                        .fill(dot.color)
                        .frame(width: 6, height: 6)
                        .accessibilityLabel(dot.label)
                }
                Spacer(minLength: 0)
            }
        }
        .padding(7)
        .frame(maxWidth: .infinity, minHeight: 52, alignment: .topLeading)
        .background(backgroundColor)
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(item.isToday ? Color.accentColor : Color.clear, lineWidth: 1.5)
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .accessibilityLabel(accessibilityText)
    }

    private var backgroundColor: Color {
        switch item.tone {
        case .empty:
            return AITheme.ColorToken.activeBackground.opacity(0.72)
        case .normal:
            return Color.blue.opacity(0.10)
        case .good:
            return Color.green.opacity(0.12)
        case .risk:
            return Color.red.opacity(0.10)
        }
    }

    private var statusDots: [(color: Color, label: String)] {
        guard let data = item.data else {
            return [(Color.orange, "未填报")]
        }
        if data.riskCount > 0 {
            return [(Color.red, "存在风险")]
        }
        if data.fillRate >= 80 {
            return [(Color.green, "已完成")]
        }
        if data.fillRate > 0 {
            return [(AITheme.ColorToken.accentBlue, "部分填报")]
        }
        return [(Color.orange, "未填报")]
    }

    private var accessibilityText: String {
        guard let data = item.data else {
            return "\(item.day ?? 0) 日，未填报"
        }
        return "\(item.day ?? 0) 日，填报率 \(String(format: "%.0f", data.fillRate))%，风险 \(data.riskCount) 个"
    }
}

private struct CalendarLegend: View {
    private let items: [(String, Color)] = [
        ("已完成", .green),
        ("部分填报", AITheme.ColorToken.accentBlue),
        ("未填报", .orange),
        ("风险", .red)
    ]

    var body: some View {
        HStack(spacing: AITheme.Spacing.sm) {
            ForEach(items, id: \.0) { item in
                HStack(spacing: 4) {
                    Circle()
                        .fill(item.1)
                        .frame(width: 6, height: 6)
                    Text(item.0)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

struct StatPill: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.headline)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.secondary.opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

struct DayDetailView: View {
    @EnvironmentObject private var auth: AuthStore
    let date: String
    let scope: Scope

    @State private var detail: CalendarDayDetail?
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        List {
            if let detail {
                Section("AI 今日洞察") {
                    ForEach(detailInsights(detail), id: \.self) { insight in
                        Label(insight, systemImage: "sparkles")
                            .font(.callout)
                            .foregroundStyle(.primary)
                    }
                }

                Section("统计") {
                    LabeledContent("应填人数", value: "\(detail.stats.totalEmployees)")
                    LabeledContent("已填", value: "\(detail.stats.filledCount)")
                    LabeledContent("缺填", value: "\(detail.stats.missingCount)")
                    LabeledContent("填报率", value: String(format: "%.1f%%", detail.stats.fillRate))
                    LabeledContent("总工时", value: String(format: "%.1f", detail.stats.totalHours))
                    LabeledContent("风险数", value: "\(detail.stats.riskCount)")
                }

                ForEach(detail.filledEmployees) { employee in
                    Section(employee.name) {
                        ForEach(employee.logs) { log in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(log.title)
                                    .font(.headline)
                                if let project = log.project {
                                    Label(project.displayName, systemImage: "folder")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Text(log.content)
                                    .font(.body)
                                if let summary = log.aiAnalysis?.summary, !summary.isEmpty {
                                    Text(summary)
                                        .font(.callout)
                                        .foregroundStyle(.secondary)
                                }
                                if let risks = log.aiAnalysis?.risks, !risks.isEmpty {
                                    Label(risks.joined(separator: "；"), systemImage: "exclamationmark.triangle.fill")
                                        .font(.caption)
                                        .foregroundStyle(.red)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }

                if !detail.missingEmployees.isEmpty {
                    Section("未填报") {
                        ForEach(detail.missingEmployees) { employee in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(employee.name)
                                if let departmentName = employee.departmentName {
                                    Text(departmentName)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(date)
        .overlay {
            if isLoading {
                ProgressView()
            }
        }
        .task {
            await load()
        }
        .refreshable {
            await load()
        }
        .alert("加载失败", isPresented: errorBinding) {
            Button("知道了", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private var errorBinding: Binding<Bool> {
        Binding {
            errorMessage != nil
        } set: { isPresented in
            if !isPresented {
                errorMessage = nil
            }
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            detail = try await auth.client().request("/analytics/calendar/day?date=\(date)&scope=\(scope.rawValue)")
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func detailInsights(_ detail: CalendarDayDetail) -> [String] {
        let stats = detail.stats
        var insights: [String] = []
        if stats.fillRate < 80 {
            insights.append(String(format: "今日填报率 %.1f%%，团队状态判断可能不完整。", stats.fillRate))
        } else {
            insights.append(String(format: "今日填报率 %.1f%%，日报覆盖度较好。", stats.fillRate))
        }
        if stats.riskCount > 0 {
            insights.append("AI 发现 \(stats.riskCount) 个风险信号，建议优先查看红色风险日志。")
        } else {
            insights.append("暂未发现显性风险，适合关注未填报成员是否存在隐性阻塞。")
        }
        if stats.totalEmployees > 0 {
            let averageHours = stats.totalHours / Double(max(stats.filledCount, 1))
            insights.append(String(format: "已填成员平均工时 %.1f 小时，可与近 7 日节奏对比。", averageHours))
        }
        return insights
    }
}
