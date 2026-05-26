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

    var monthFillRate: Double {
        guard !days.isEmpty else { return 0 }
        return days.reduce(0) { $0 + $1.fillRate } / Double(days.count)
    }

    var riskDayCount: Int {
        days.filter { $0.riskCount > 0 }.count
    }

    var missingCount: Int {
        days.reduce(0) { $0 + $1.missingCount }
    }

    var firstRiskDay: CalendarDay? {
        days.first { $0.riskCount > 0 }
    }

    var dashboardConclusion: String {
        let today = days.first(where: { $0.date == DateHelpers.dayKey() })
        return today.map { String(format: "今日填报率 %.1f%%", $0.fillRate) } ?? "今天还没有填报信号"
    }

    var dashboardRisk: String {
        if riskDayCount > 0 {
            return "\(riskDayCount) 天出现风险，优先进入风险日期确认阻塞来源。"
        }
        if missingCount > 0 {
            return "\(missingCount) 条缺填记录会影响团队状态判断。"
        }
        return "暂无明显风险，继续保持日报完整度。"
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

                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: AITheme.Spacing.xs) {
                        CompactMetric(title: "本月填报", value: String(format: "%.0f%%", viewModel.monthFillRate), tint: AITheme.ColorToken.success)
                        CompactMetric(title: "风险天数", value: "\(viewModel.riskDayCount)", tint: viewModel.riskDayCount > 0 ? AITheme.ColorToken.danger : AITheme.ColorToken.success)
                        CompactMetric(title: "缺填", value: "\(viewModel.missingCount)", tint: viewModel.missingCount > 0 ? AITheme.ColorToken.warning : AITheme.ColorToken.success)
                    }

                    CalendarAIActionPanel(viewModel: viewModel)

                    BrandedCard {
                        VStack(alignment: .leading, spacing: AITheme.Spacing.md) {
                            CalendarLegend()

                            LazyVGrid(columns: columns, spacing: 8) {
                                ForEach(DateHelpers.weekdays, id: \.self) { weekday in
                                    Text(weekday)
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(AITheme.ColorToken.textSecondary)
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
            .navigationTitle("日历")
            .compactNavigationTitle()
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

private struct CompactMetric: View {
    let title: String
    let value: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.xxs) {
            Text(value)
                .font(.headline)
                .foregroundStyle(tint)
            Text(title)
                .font(.caption)
                .foregroundStyle(AITheme.ColorToken.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(AITheme.Spacing.sm)
        .background(AITheme.ColorToken.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))
    }
}

private struct CalendarAIActionPanel: View {
    let viewModel: CalendarViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
            CompactAIActionPanel(
                conclusion: viewModel.dashboardConclusion,
                risk: viewModel.dashboardRisk,
                systemImage: viewModel.riskDayCount > 0 ? "exclamationmark.triangle" : "sparkles"
            )

            if let riskDay = viewModel.firstRiskDay {
                NavigationLink {
                    DayDetailView(date: riskDay.date, scope: viewModel.scope)
                } label: {
                    Label("进入风险日期 \(String(riskDay.date.suffix(5)))", systemImage: "arrow.right")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(AITheme.ColorToken.danger)
                }
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
                .foregroundStyle(item.isToday ? AITheme.ColorToken.primary : AITheme.ColorToken.ink800)
                .frame(maxWidth: .infinity, alignment: .leading)

            Spacer(minLength: 0)

            HStack(spacing: 4) {
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .fill(statusColor)
                    .frame(width: 18, height: 4)
                    .accessibilityLabel(statusLabel)
                Spacer(minLength: 0)
                if (item.data?.riskCount ?? 0) > 0 {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.caption2)
                        .foregroundStyle(AITheme.ColorToken.danger)
                }
            }
        }
        .padding(7)
        .frame(maxWidth: .infinity, minHeight: 52, alignment: .topLeading)
        .background(backgroundColor)
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(item.isToday ? AITheme.ColorToken.primaryHover : Color.clear, lineWidth: 1.5)
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .accessibilityLabel(accessibilityText)
    }

    private var backgroundColor: Color {
        switch item.tone {
        case .empty:
            return AITheme.ColorToken.activeBackground.opacity(0.72)
        case .normal:
            return AITheme.ColorToken.primarySurface
        case .good:
            return AITheme.ColorToken.successSurface
        case .risk:
            return AITheme.ColorToken.dangerSurface
        }
    }

    private var statusColor: Color {
        guard let data = item.data else {
            return AITheme.ColorToken.warning
        }
        if data.riskCount > 0 {
            return AITheme.ColorToken.danger
        }
        if data.fillRate >= 80 {
            return AITheme.ColorToken.success
        }
        if data.fillRate > 0 {
            return AITheme.ColorToken.primaryHover
        }
        return AITheme.ColorToken.warning
    }

    private var statusLabel: String {
        guard let data = item.data else {
            return "未填报"
        }
        if data.riskCount > 0 {
            return "存在风险"
        }
        if data.fillRate >= 80 {
            return "已完成"
        }
        if data.fillRate > 0 {
            return "部分填报"
        }
        return "未填报"
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
        ("已完成", AITheme.ColorToken.success),
        ("部分填报", AITheme.ColorToken.primaryHover),
        ("未填报", AITheme.ColorToken.warning),
        ("风险", AITheme.ColorToken.danger)
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
                        .foregroundStyle(AITheme.ColorToken.textSecondary)
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
                .foregroundStyle(AITheme.ColorToken.textSecondary)
            Text(value)
                .font(.headline)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AITheme.ColorToken.activeBackground)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

struct DayDetailView: View {
    @EnvironmentObject private var auth: AuthStore
    @State private var currentDate: String
    let scope: Scope

    @State private var detail: CalendarDayDetail?
    @State private var isLoading = false
    @State private var errorMessage: String?

    init(date: String, scope: Scope) {
        _currentDate = State(initialValue: date)
        self.scope = scope
    }

    var body: some View {
        List {
            if let detail {
                Section("AI 今日洞察") {
                    ForEach(detailInsights(detail), id: \.self) { insight in
                        Label(insight, systemImage: "sparkles")
                            .font(.callout)
                            .foregroundStyle(insightTint(insight))
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

                if !detail.missingEmployees.isEmpty {
                    Section("缺填成员") {
                        ForEach(detail.missingEmployees) { employee in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(employee.name)
                                if let departmentName = employee.departmentName {
                                    Text(departmentName)
                                        .font(.caption)
                                        .foregroundStyle(AITheme.ColorToken.textSecondary)
                                }
                            }
                        }
                    }
                }

                ForEach(riskEmployees(detail)) { employee in
                    Section("风险 · \(employee.name)") {
                        ForEach(employee.logs) { log in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(log.title)
                                    .font(.headline)
                                if let project = log.project {
                                    Label(project.displayName, systemImage: "folder")
                                        .font(.caption)
                                        .foregroundStyle(AITheme.ColorToken.textSecondary)
                                }
                                Text(log.content)
                                    .font(.body)
                                if let summary = log.aiAnalysis?.summary, !summary.isEmpty {
                                    Text(summary)
                                        .font(.callout)
                                        .foregroundStyle(AITheme.ColorToken.textSecondary)
                                }
                                if let risks = log.aiAnalysis?.risks, !risks.isEmpty {
                                    Label(risks.joined(separator: "；"), systemImage: "exclamationmark.triangle.fill")
                                        .font(.caption)
                                        .foregroundStyle(AITheme.ColorToken.danger)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }

                ForEach(normalEmployees(detail)) { employee in
                    Section(employee.name) {
                        ForEach(employee.logs) { log in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(log.title)
                                    .font(.headline)
                                if let project = log.project {
                                    Label(project.displayName, systemImage: "folder")
                                        .font(.caption)
                                        .foregroundStyle(AITheme.ColorToken.textSecondary)
                                }
                                Text(log.content)
                                    .font(.body)
                                    .lineLimit(3)
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }
            }
        }
        .navigationTitle(currentDate)
        .compactNavigationTitle()
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button {
                    Task { await moveDay(by: -1) }
                } label: {
                    Image(systemName: "chevron.left")
                }
                .accessibilityLabel("前一天")

                Button {
                    Task { await moveDay(by: 1) }
                } label: {
                    Image(systemName: "chevron.right")
                }
                .accessibilityLabel("后一天")
            }
        }
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
            detail = try await auth.client().request("/analytics/calendar/day?date=\(currentDate)&scope=\(scope.rawValue)")
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func moveDay(by diff: Int) async {
        guard let date = DateHelpers.dayFormatter.date(from: currentDate),
              let next = Calendar.current.date(byAdding: .day, value: diff, to: date) else {
            return
        }
        currentDate = DateHelpers.dayKey(next)
        await load()
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

    private func insightTint(_ insight: String) -> Color {
        if insight.contains("暂未") || insight.contains("较好") {
            return AITheme.ColorToken.ai
        }
        if insight.contains("风险") || insight.contains("阻塞") {
            return AITheme.ColorToken.danger
        }
        if insight.contains("缺填") || insight.contains("低") || insight.contains("不完整") {
            return AITheme.ColorToken.warning
        }
        return AITheme.ColorToken.ai
    }

    private func riskEmployees(_ detail: CalendarDayDetail) -> [FilledEmployee] {
        detail.filledEmployees.filter { employee in
            employee.logs.contains(where: hasRisk)
        }
    }

    private func normalEmployees(_ detail: CalendarDayDetail) -> [FilledEmployee] {
        detail.filledEmployees.filter { employee in
            !employee.logs.contains(where: hasRisk)
        }
    }

    private func hasRisk(_ log: WorkLog) -> Bool {
        !(log.aiAnalysis?.risks.isEmpty ?? true) || !(log.aiAnalysis?.blockers.isEmpty ?? true)
    }
}
