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

    func moveToCurrentMonth(auth: AuthStore) async {
        month = DateHelpers.monthKey()
        await load(auth: auth)
    }

    var monthTitle: String {
        DateHelpers.monthTitle(month)
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

    var todayDay: CalendarDay? {
        days.first { $0.date == DateHelpers.dayKey() }
    }

    var dashboardConclusion: String {
        guard let todayDay else {
            return "今天还没有填报信号"
        }
        return "今日发现 \(todayDay.riskCount) 条风险，\(todayDay.missingCount) 人未填报"
    }

    var dashboardRisk: String {
        if let firstRiskDay {
            return "建议先查看 \(DateHelpers.shortDayTitle(firstRiskDay.date))，确认风险来源和缺填成员。"
        }
        if missingCount > 0 {
            return "\(missingCount) 条缺填记录会影响团队状态判断，建议先补齐日报覆盖。"
        }
        return "暂无明显风险，继续保持日报完整度。"
    }
}

struct CalendarDashboardView: View {
    @EnvironmentObject private var auth: AuthStore
    @StateObject private var viewModel = CalendarViewModel()
    @State private var showsSearchHint = false
    var onCreateReport: (() -> Void)?

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 7)

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottomTrailing) {
                ScrollView {
                    VStack(alignment: .leading, spacing: AITheme.Spacing.md) {
                        CalendarTopBar(
                            monthTitle: viewModel.monthTitle,
                            scope: $viewModel.scope,
                            scopes: auth.user?.availableScopes ?? [.selfScope],
                            onPrevious: {
                                Task { await viewModel.moveMonth(by: -1, auth: auth) }
                            },
                            onNext: {
                                Task { await viewModel.moveMonth(by: 1, auth: auth) }
                            },
                            onToday: {
                                Task { await viewModel.moveToCurrentMonth(auth: auth) }
                            },
                            onSearch: {
                                showsSearchHint = true
                            }
                        )

                        CalendarInsightBanner(viewModel: viewModel)

                        CalendarStatusSummary(viewModel: viewModel)

                        CalendarMonthGrid(
                            grid: viewModel.grid,
                            columns: columns,
                            scope: viewModel.scope
                        )
                    }
                    .padding(.horizontal, AITheme.Spacing.lg)
                    .padding(.top, AITheme.Spacing.sm)
                    .padding(.bottom, AITheme.Spacing.xxl + AITheme.Layout.minTouchTarget)
                }

                if let onCreateReport {
                    CalendarCreateButton(action: onCreateReport)
                        .padding(.trailing, AITheme.Spacing.lg)
                        .padding(.bottom, AITheme.Spacing.lg)
                }
            }
            .background(AITheme.ColorToken.appBackground)
            .navigationTitle("")
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
            .onChange(of: viewModel.scope) {
                Task { await viewModel.load(auth: auth) }
            }
            .alert("搜索", isPresented: $showsSearchHint) {
                Button("知道了", role: .cancel) {}
            } message: {
                Text("当前版本可在“记录”页搜索日报；AI 日历会优先展示风险日期和缺填状态。")
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

private struct CalendarTopBar: View {
    let monthTitle: String
    @Binding var scope: Scope
    let scopes: [Scope]
    let onPrevious: () -> Void
    let onNext: () -> Void
    let onToday: () -> Void
    let onSearch: () -> Void

    var body: some View {
        HStack(spacing: AITheme.Spacing.xs) {
            Menu {
                Button("上个月", action: onPrevious)
                Button("回到本月", action: onToday)
                Button("下个月", action: onNext)
            } label: {
                HStack(spacing: 4) {
                    Text(monthTitle)
                        .font(.system(size: 28, weight: .semibold, design: .default))
                        .foregroundStyle(AITheme.ColorToken.ink900)
                        .lineLimit(1)
                        .minimumScaleFactor(0.78)
                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(AITheme.ColorToken.textSecondary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("选择月份")

            Spacer(minLength: AITheme.Spacing.xs)

            Button(action: onSearch) {
                CalendarToolbarGlyph(systemImage: "magnifyingglass")
            }
            .buttonStyle(.plain)
            .accessibilityLabel("搜索")

            Button(action: onToday) {
                CalendarToolbarGlyph(systemImage: "calendar.badge.clock")
            }
            .buttonStyle(.plain)
            .accessibilityLabel("回到本月")

            Menu {
                ForEach(scopes) { item in
                    Button {
                        scope = item
                    } label: {
                        Label(item.title, systemImage: scope == item ? "checkmark" : "person.2")
                    }
                }
            } label: {
                CalendarToolbarGlyph(systemImage: scope == .selfScope ? "person" : "person.2")
            }
            .buttonStyle(.plain)
            .accessibilityLabel("切换范围")
        }
    }
}

private struct CalendarToolbarGlyph: View {
    let systemImage: String

    var body: some View {
        Image(systemName: systemImage)
            .font(.body.weight(.semibold))
            .foregroundStyle(AITheme.ColorToken.ink800)
            .frame(width: AITheme.Layout.minTouchTarget, height: AITheme.Layout.minTouchTarget)
            .background(AITheme.ColorToken.cardBackground)
            .clipShape(Circle())
            .overlay {
                Circle()
                    .stroke(AITheme.ColorToken.separator, lineWidth: 0.5)
            }
    }
}

private struct CalendarInsightBanner: View {
    let viewModel: CalendarViewModel

    var body: some View {
        if let firstRiskDay = viewModel.firstRiskDay {
            NavigationLink {
                DayDetailView(date: firstRiskDay.date, scope: viewModel.scope)
            } label: {
                content(showChevron: true)
            }
            .buttonStyle(.plain)
        } else {
            content(showChevron: false)
        }
    }

    private func content(showChevron: Bool) -> some View {
        HStack(alignment: .top, spacing: AITheme.Spacing.sm) {
            Image(systemName: viewModel.riskDayCount > 0 ? "exclamationmark.triangle.fill" : "sparkles")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(viewModel.riskDayCount > 0 ? AITheme.ColorToken.danger : AITheme.ColorToken.ai)
                .frame(width: 30, height: 30)
                .background((viewModel.riskDayCount > 0 ? AITheme.ColorToken.dangerSurface : AITheme.ColorToken.aiSurface))
                .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text("AI 今日摘要")
                    .font(AITheme.Typography.eyebrow)
                    .foregroundStyle(AITheme.ColorToken.ai)
                Text(viewModel.dashboardConclusion)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AITheme.ColorToken.ink900)
                    .fixedSize(horizontal: false, vertical: true)
                Text(viewModel.dashboardRisk)
                    .font(.caption)
                    .foregroundStyle(AITheme.ColorToken.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: AITheme.Spacing.xs)

            if showChevron {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AITheme.ColorToken.textSecondary)
                    .padding(.top, AITheme.Spacing.sm)
            }
        }
        .padding(AITheme.Spacing.sm)
        .background(AITheme.ColorToken.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous)
                .stroke(AITheme.ColorToken.separator, lineWidth: 0.5)
        }
    }
}

private struct CalendarStatusSummary: View {
    let viewModel: CalendarViewModel

    var body: some View {
        HStack(spacing: AITheme.Spacing.xs) {
            CalendarStatusMetric(
                title: "填报率",
                value: String(format: "%.0f%%", viewModel.monthFillRate),
                tint: viewModel.monthFillRate >= 80 ? AITheme.ColorToken.success : AITheme.ColorToken.primary
            )
            CalendarStatusMetric(
                title: "未填",
                value: "\(viewModel.missingCount)",
                tint: viewModel.missingCount > 0 ? AITheme.ColorToken.warning : AITheme.ColorToken.success
            )
            CalendarStatusMetric(
                title: "风险",
                value: "\(viewModel.riskDayCount)",
                tint: viewModel.riskDayCount > 0 ? AITheme.ColorToken.danger : AITheme.ColorToken.success
            )
            CalendarStatusMetric(
                title: "成员",
                value: "\(viewModel.totalEmployees)",
                tint: AITheme.ColorToken.ai
            )
        }
        .accessibilityElement(children: .combine)
    }
}

private struct CalendarStatusMetric: View {
    let title: String
    let value: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.headline.weight(.semibold))
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
                .monospacedDigit()
            Text(title)
                .font(.caption)
                .foregroundStyle(AITheme.ColorToken.textSecondary)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AITheme.ColorToken.activeBackground)
        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous)
                .stroke(AITheme.ColorToken.separator, lineWidth: 0.5)
        }
    }
}

private struct CalendarMonthGrid: View {
    let grid: [MonthGridItem]
    let columns: [GridItem]
    let scope: Scope

    var body: some View {
        VStack(spacing: AITheme.Spacing.xs) {
            LazyVGrid(columns: columns, spacing: 6) {
                ForEach(DateHelpers.weekdays, id: \.self) { weekday in
                    Text(weekday)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(AITheme.ColorToken.textSecondary)
                        .frame(maxWidth: .infinity, minHeight: 30)
                        .background(AITheme.ColorToken.cardBackground)
                        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
                }

                ForEach(grid) { item in
                    if item.isBlank {
                        CalendarBlankDayCell()
                    } else {
                        NavigationLink {
                            DayDetailView(date: item.id, scope: scope)
                        } label: {
                            CalendarStatusDayCell(item: item)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            CalendarLegend()
                .padding(.top, AITheme.Spacing.xs)
        }
    }
}

private struct CalendarBlankDayCell: View {
    var body: some View {
        RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous)
            .fill(AITheme.ColorToken.cardBackground.opacity(0.52))
            .frame(maxWidth: .infinity, minHeight: 76)
            .overlay {
                RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous)
                    .stroke(AITheme.ColorToken.separator.opacity(0.35), lineWidth: 0.5)
            }
    }
}

private struct CalendarStatusDayCell: View {
    let item: MonthGridItem

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .top) {
                Text("\(item.day ?? 0)")
                    .font(.callout.weight(item.isToday ? .bold : .semibold))
                    .foregroundStyle(item.isToday ? AITheme.ColorToken.primary : AITheme.ColorToken.ink800)

                Spacer(minLength: 0)

                if riskCount > 0 {
                    Text("\(riskCount)")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(minWidth: 18, minHeight: 18)
                        .background(AITheme.ColorToken.danger)
                        .clipShape(Capsule())
                        .accessibilityLabel("\(riskCount) 个风险")
                }
            }

            Spacer(minLength: 0)

            VStack(alignment: .leading, spacing: 4) {
                Text(primaryStatusText)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(statusColor)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)

                HStack(spacing: 4) {
                    Capsule()
                        .fill(statusColor)
                        .frame(width: 20, height: 4)
                    Text(secondaryStatusText)
                        .font(.caption2)
                        .foregroundStyle(AITheme.ColorToken.textSecondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, minHeight: 76, alignment: .topLeading)
        .background(backgroundColor)
        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous)
                .stroke(item.isToday ? AITheme.ColorToken.primary : AITheme.ColorToken.separator, lineWidth: item.isToday ? 1.5 : 0.5)
        }
        .shadow(color: AITheme.ColorToken.cardShadow, radius: item.isToday ? 8 : 3, x: 0, y: 2)
        .accessibilityLabel(accessibilityText)
    }

    private var riskCount: Int {
        item.data?.riskCount ?? 0
    }

    private var isFutureEmptyDay: Bool {
        item.data == nil && DateHelpers.isFutureDay(item.id)
    }

    private var totalCount: Int {
        guard let data = item.data else { return 0 }
        return data.filledCount + data.missingCount
    }

    private var statusColor: Color {
        guard let data = item.data else {
            return isFutureEmptyDay ? AITheme.ColorToken.ai : AITheme.ColorToken.warning
        }
        if data.riskCount > 0 {
            return AITheme.ColorToken.danger
        }
        if data.fillRate >= 80 {
            return AITheme.ColorToken.success
        }
        if data.fillRate > 0 {
            return AITheme.ColorToken.primary
        }
        return AITheme.ColorToken.warning
    }

    private var backgroundColor: Color {
        if item.isToday {
            return AITheme.ColorToken.primarySurface
        }
        guard let data = item.data else {
            return isFutureEmptyDay ? AITheme.ColorToken.aiSurface.opacity(0.58) : AITheme.ColorToken.cardBackground
        }
        if data.riskCount > 0 {
            return AITheme.ColorToken.dangerSurface
        }
        return AITheme.ColorToken.cardBackground
    }

    private var primaryStatusText: String {
        guard let data = item.data else {
            return isFutureEmptyDay ? "待填" : "未填"
        }
        if data.riskCount > 0 {
            return "风险 \(data.riskCount)"
        }
        if data.fillRate >= 80 {
            return "已完成"
        }
        if data.fillRate > 0 {
            return "\(Int(data.fillRate.rounded()))%"
        }
        return "未填"
    }

    private var secondaryStatusText: String {
        guard let data = item.data else {
            return isFutureEmptyDay ? "未开始" : "无记录"
        }
        guard totalCount > 0 else {
            return "\(Int(data.fillRate.rounded()))%"
        }
        return "已填 \(data.filledCount)/\(totalCount)"
    }

    private var accessibilityText: String {
        guard let data = item.data else {
            return "\(item.day ?? 0) 日，\(primaryStatusText)"
        }
        return "\(item.day ?? 0) 日，填报率 \(String(format: "%.0f", data.fillRate))%，已填 \(data.filledCount)，缺填 \(data.missingCount)，风险 \(data.riskCount) 个"
    }
}

private struct CalendarLegend: View {
    private let items: [(String, Color)] = [
        ("已完成", AITheme.ColorToken.success),
        ("部分填报", AITheme.ColorToken.primary),
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

private struct CalendarCreateButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label("新增填报", systemImage: "plus")
                .font(.headline.weight(.semibold))
                .foregroundStyle(.white)
                .labelStyle(.iconOnly)
                .frame(width: 58, height: 58)
                .background(AITheme.ColorToken.primary)
                .clipShape(Circle())
                .shadow(color: AITheme.ColorToken.primary.opacity(0.26), radius: 16, x: 0, y: 8)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("新增填报")
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
