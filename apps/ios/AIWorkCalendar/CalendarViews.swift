import SwiftUI

fileprivate enum CalendarAnalysisPeriod: String, CaseIterable, Identifiable {
    case week
    case month
    case quarter
    case year

    var id: String { rawValue }

    var title: String {
        switch self {
        case .week:
            return "本周"
        case .month:
            return "本月"
        case .quarter:
            return "季度"
        case .year:
            return "年度"
        }
    }

    func range(anchor: Date) -> (start: Date, end: Date) {
        let calendar = Calendar(identifier: .gregorian)
        switch self {
        case .week:
            let weekday = calendar.component(.weekday, from: anchor)
            let diffFromMonday = (weekday + 5) % 7
            let start = calendar.date(byAdding: .day, value: -diffFromMonday, to: calendar.startOfDay(for: anchor)) ?? anchor
            let end = calendar.date(byAdding: .day, value: 6, to: start) ?? start
            return (start, end)
        case .month:
            let components = calendar.dateComponents([.year, .month], from: anchor)
            let start = calendar.date(from: components) ?? anchor
            let end = calendar.date(byAdding: DateComponents(month: 1, day: -1), to: start) ?? start
            return (start, end)
        case .quarter:
            let year = calendar.component(.year, from: anchor)
            let month = calendar.component(.month, from: anchor)
            let firstQuarterMonth = ((month - 1) / 3) * 3 + 1
            let start = calendar.date(from: DateComponents(year: year, month: firstQuarterMonth, day: 1)) ?? anchor
            let end = calendar.date(byAdding: DateComponents(month: 3, day: -1), to: start) ?? start
            return (start, end)
        case .year:
            let year = calendar.component(.year, from: anchor)
            let start = calendar.date(from: DateComponents(year: year, month: 1, day: 1)) ?? anchor
            let end = calendar.date(from: DateComponents(year: year, month: 12, day: 31)) ?? start
            return (start, end)
        }
    }
}

fileprivate struct CalendarPeriodSummary {
    let rangeText: String
    let fillRate: Double
    let missingCount: Int
    let riskCount: Int
    let riskDayCount: Int
    let coreConclusion: String
    let riskReminder: String
    let peopleStatus: String
    let suggestedAction: String
}

fileprivate func weekDatesFor(_ anchor: Date) -> [Date] {
    let calendar = Calendar(identifier: .gregorian)
    let startOfDay = calendar.startOfDay(for: anchor)
    let weekday = calendar.component(.weekday, from: startOfDay)
    let diffFromMonday = (weekday + 5) % 7
    let monday = calendar.date(byAdding: .day, value: -diffFromMonday, to: startOfDay) ?? startOfDay
    return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: monday) }
}

fileprivate func formatShortDate(_ date: Date) -> String {
    let calendar = Calendar(identifier: .gregorian)
    return "\(calendar.component(.month, from: date))月\(calendar.component(.day, from: date))日"
}

fileprivate func formatWeekday(_ date: Date) -> String {
    let symbols = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
    let weekday = Calendar(identifier: .gregorian).component(.weekday, from: date)
    return symbols[max(0, min(weekday - 1, symbols.count - 1))]
}

fileprivate enum CalendarMobileDayStatus {
    case complete
    case partial
    case unreported
    case risk
    case futurePlan
    case futureEmpty

    var title: String {
        switch self {
        case .complete:
            return "已完成"
        case .partial:
            return "部分完成"
        case .unreported:
            return "未填报"
        case .risk:
            return "风险"
        case .futurePlan:
            return "已计划"
        case .futureEmpty:
            return "未计划"
        }
    }

    var tint: Color {
        switch self {
        case .complete:
            return AITheme.ColorToken.success
        case .partial:
            return AITheme.ColorToken.primary
        case .unreported:
            return AITheme.ColorToken.warning
        case .risk:
            return AITheme.ColorToken.danger
        case .futurePlan, .futureEmpty:
            return AITheme.ColorToken.ai
        }
    }

    var surface: Color {
        switch self {
        case .complete:
            return AITheme.ColorToken.successSurface
        case .partial:
            return AITheme.ColorToken.primarySurface
        case .unreported:
            return AITheme.ColorToken.warningSurface
        case .risk:
            return AITheme.ColorToken.dangerSurface
        case .futurePlan, .futureEmpty:
            return AITheme.ColorToken.aiSurface
        }
    }
}

fileprivate struct CalendarMobileDayItem: Identifiable {
    let date: Date
    let data: CalendarDay?
    let detail: CalendarDayDetail?
    let isSelected: Bool

    var id: String { dateKey }
    var dateKey: String { DateHelpers.dayKey(date) }
    var isToday: Bool { dateKey == DateHelpers.dayKey() }
    var isFuture: Bool { DateHelpers.isFutureDay(dateKey) }

    var filledCount: Int {
        detail?.stats.filledCount ?? data?.filledCount ?? 0
    }

    var missingCount: Int {
        detail?.stats.missingCount ?? data?.missingCount ?? 0
    }

    var riskCount: Int {
        detail?.stats.riskCount ?? data?.riskCount ?? 0
    }

    var totalHours: Double? {
        detail?.stats.totalHours
    }

    var totalCount: Int {
        let total = filledCount + missingCount
        return total > 0 ? total : (detail?.stats.totalEmployees ?? 0)
    }

    var fillRate: Double {
        if let detail {
            return detail.stats.fillRate
        }
        if let data {
            return data.fillRate
        }
        return 0
    }

    var referenceRecordCount: Int {
        if let detail {
            return detail.filledEmployees.reduce(0) { $0 + $1.logs.count }
        }
        return filledCount
    }

    var status: CalendarMobileDayStatus {
        if riskCount > 0 {
            return .risk
        }
        if isFuture {
            return filledCount > 0 ? .futurePlan : .futureEmpty
        }
        if fillRate >= 80 {
            return .complete
        }
        if fillRate > 0 {
            return .partial
        }
        return .unreported
    }

    var hoursText: String {
        guard let totalHours else {
            return "--h"
        }
        let rounded = (totalHours * 10).rounded() / 10
        if rounded.rounded() == rounded {
            return "\(Int(rounded))h"
        }
        return String(format: "%.1fh", rounded)
    }

    var progress: Double {
        max(0, min(fillRate / 100, 1))
    }

    var summaryText: String {
        if isFuture {
            if totalCount > 0 {
                return "计划 \(filledCount)/\(totalCount) · 风险 \(riskCount) · 工时 \(hoursText)"
            }
            return "未计划 · 风险 \(riskCount) · 工时 \(hoursText)"
        }
        if totalCount > 0 {
            return "填报 \(filledCount)/\(totalCount) · 未填 \(missingCount) · 风险 \(riskCount) · 工时 \(hoursText)"
        }
        return "暂无填报记录 · 风险 \(riskCount) · 工时 \(hoursText)"
    }
}

@MainActor
final class CalendarViewModel: ObservableObject {
    @Published var month = DateHelpers.monthKey()
    @Published var scope: Scope = .selfScope
    @Published var totalEmployees = 0
    @Published var days: [CalendarDay] = []
    @Published var grid: [MonthGridItem] = []
    @Published var selectedDateKey = DateHelpers.dayKey()
    @Published var weekAnchorDate = Date()
    @Published var dayDetails: [String: CalendarDayDetail] = [:]
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

    func refresh(auth: AuthStore) async {
        await load(auth: auth)
        await loadWeekDetails(auth: auth)
        await loadDetailIfNeeded(selectedDateKey, auth: auth)
    }

    func moveMonth(by diff: Int, auth: AuthStore) async {
        month = DateHelpers.addMonths(to: month, diff: diff)
        await load(auth: auth)
    }

    func moveToCurrentMonth(auth: AuthStore) async {
        month = DateHelpers.monthKey()
        await load(auth: auth)
    }

    func moveWeek(by diff: Int, auth: AuthStore) async {
        guard let nextAnchor = Calendar.current.date(byAdding: .day, value: diff * 7, to: weekAnchorDate) else {
            return
        }
        weekAnchorDate = nextAnchor
        selectedDateKey = DateHelpers.dayKey(nextAnchor)
        await ensureLoadedMonth(for: nextAnchor, auth: auth)
        await loadWeekDetails(auth: auth)
        await loadDetailIfNeeded(selectedDateKey, auth: auth)
    }

    func moveToCurrentWeek(auth: AuthStore) async {
        let today = Date()
        weekAnchorDate = today
        selectedDateKey = DateHelpers.dayKey(today)
        await ensureLoadedMonth(for: today, auth: auth)
        await loadWeekDetails(auth: auth)
        await loadDetailIfNeeded(selectedDateKey, auth: auth)
    }

    func selectDate(_ date: Date, auth: AuthStore) async {
        weekAnchorDate = date
        selectedDateKey = DateHelpers.dayKey(date)
        await ensureLoadedMonth(for: date, auth: auth)
        await loadWeekDetails(auth: auth)
        await loadDetailIfNeeded(selectedDateKey, auth: auth)
    }

    func loadWeekDetails(auth: AuthStore) async {
        for date in weekDates {
            await loadDetailIfNeeded(DateHelpers.dayKey(date), auth: auth)
        }
    }

    private func loadDetailIfNeeded(_ dateKey: String, auth: AuthStore) async {
        guard dayDetails[dateKey] == nil else {
            return
        }
        do {
            let detail: CalendarDayDetail = try await auth.client().request("/analytics/calendar/day?date=\(dateKey)&scope=\(scope.rawValue)")
            dayDetails[dateKey] = detail
        } catch {
            // The weekly list can still render from monthly aggregates when a single day detail fails.
        }
    }

    private func ensureLoadedMonth(for date: Date, auth: AuthStore) async {
        let dateMonth = DateHelpers.monthKey(date)
        guard dateMonth != month else {
            return
        }
        month = dateMonth
        dayDetails = [:]
        await load(auth: auth)
    }

    var monthTitle: String {
        DateHelpers.monthTitle(month)
    }

    var dayMap: [String: CalendarDay] {
        Dictionary(uniqueKeysWithValues: days.map { ($0.date, $0) })
    }

    var weekDates: [Date] {
        weekDatesFor(weekAnchorDate)
    }

    var weekRangeTitle: String {
        guard let first = weekDates.first, let last = weekDates.last else {
            return monthTitle
        }
        return "\(formatShortDate(first)) - \(formatShortDate(last))"
    }

    fileprivate var selectedMobileDay: CalendarMobileDayItem {
        let date = DateHelpers.dayFormatter.date(from: selectedDateKey) ?? Date()
        return mobileDayItem(for: date)
    }

    fileprivate var todayMobileDay: CalendarMobileDayItem {
        let date = DateHelpers.dayFormatter.date(from: DateHelpers.dayKey()) ?? Date()
        return mobileDayItem(for: date)
    }

    fileprivate var weekMobileDays: [CalendarMobileDayItem] {
        weekDates.map { mobileDayItem(for: $0) }
    }

    fileprivate func mobileDayItem(for date: Date) -> CalendarMobileDayItem {
        let key = DateHelpers.dayKey(date)
        return CalendarMobileDayItem(
            date: date,
            data: dayMap[key],
            detail: dayDetails[key],
            isSelected: key == selectedDateKey
        )
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

    var firstMissingDay: CalendarDay? {
        days.first { $0.missingCount > 0 }
    }

    var todayDay: CalendarDay? {
        days.first { $0.date == DateHelpers.dayKey() }
    }

    var todayFillRate: Double {
        todayDay?.fillRate ?? 0
    }

    var todayMissingCount: Int {
        todayDay?.missingCount ?? 0
    }

    var todayRiskCount: Int {
        todayDay?.riskCount ?? 0
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

    var analysisAnchorDate: Date {
        let currentMonth = DateHelpers.monthKey()
        if month == currentMonth {
            return Date()
        }
        return DateHelpers.monthFormatter.date(from: month) ?? Date()
    }

    fileprivate func summary(for period: CalendarAnalysisPeriod) -> CalendarPeriodSummary {
        let range = period.range(anchor: analysisAnchorDate)
        let startKey = DateHelpers.dayKey(range.start)
        let endKey = DateHelpers.dayKey(range.end)
        let periodDays = days.filter { $0.date >= startKey && $0.date <= endKey }
        let filled = periodDays.reduce(0) { $0 + $1.filledCount }
        let missing = periodDays.reduce(0) { $0 + $1.missingCount }
        let risks = periodDays.reduce(0) { $0 + $1.riskCount }
        let denominator = filled + missing
        let fillRate = denominator > 0 ? (Double(filled) / Double(denominator)) * 100 : 0
        let riskDayCount = periodDays.filter { $0.riskCount > 0 }.count
        let rangeText = "\(startKey) 至 \(endKey)"

        let coreConclusion: String
        if risks > 0 {
            coreConclusion = "当前周期发现 \(risks) 条风险信号，优先处理风险日期。"
        } else if missing > 0 {
            coreConclusion = "当前周期有 \(missing) 条缺填记录，先补齐日报覆盖。"
        } else if filled > 0 {
            coreConclusion = String(format: "当前周期填报覆盖稳定，填报率 %.0f%%。", fillRate)
        } else {
            coreConclusion = "当前周期暂无足够填报信号。"
        }

        let riskReminder: String
        if risks > 0 {
            riskReminder = "有 \(riskDayCount) 天出现风险，建议先进入风险日期查看具体日报。"
        } else if missing > 0 {
            riskReminder = "缺填会影响 AI 对团队状态的判断，建议优先提醒未填成员。"
        } else {
            riskReminder = "暂无明显风险，继续关注临近截止日期和低覆盖日期。"
        }

        let peopleStatus = totalEmployees > 0
            ? String(format: "当前范围约 %d 名成员，周期填报率 %.0f%%，缺填 %d 条。", totalEmployees, fillRate, missing)
            : "当前范围暂无成员统计，请确认组织和范围配置。"

        let suggestedAction: String
        if risks > 0 {
            suggestedAction = "先查看风险日期，再复盘关联项目和负责人。"
        } else if missing > 0 {
            suggestedAction = "先提醒未填报，再生成周报沉淀本周期结论。"
        } else {
            suggestedAction = "可以生成周报，保留本周期工作节奏和关键结论。"
        }

        return CalendarPeriodSummary(
            rangeText: rangeText,
            fillRate: fillRate,
            missingCount: missing,
            riskCount: risks,
            riskDayCount: riskDayCount,
            coreConclusion: coreConclusion,
            riskReminder: riskReminder,
            peopleStatus: peopleStatus,
            suggestedAction: suggestedAction
        )
    }
}

struct CalendarDashboardView: View {
    @EnvironmentObject private var auth: AuthStore
    @StateObject private var viewModel = CalendarViewModel()
    @State private var showsSearchHint = false
    @State private var showsOverallAnalysis = false
    @State private var actionMessage: String?
    @State private var selectedDetailRoute: CalendarDetailRoute?
    var onCreateReport: ((String) -> Void)?
    var onOpenProjects: (() -> Void)?

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottomTrailing) {
                ScrollView {
                    VStack(alignment: .leading, spacing: AITheme.Spacing.md) {
                        CalendarTopBar(
                            weekRangeTitle: viewModel.weekRangeTitle,
                            scope: $viewModel.scope,
                            scopes: auth.user?.availableScopes ?? [.selfScope],
                            onToday: {
                                Task { await viewModel.moveToCurrentWeek(auth: auth) }
                            },
                            onSearch: {
                                showsSearchHint = true
                            },
                            onRefresh: {
                                Task { await viewModel.refresh(auth: auth) }
                            }
                        )

                        CalendarInsightBanner(
                            viewModel: viewModel,
                            onOpenAI: {
                                showsOverallAnalysis = true
                            },
                            onCreateReport: {
                                onCreateReport?(viewModel.selectedDateKey)
                            }
                        )

                        CalendarMobileWeekHeader(
                            rangeTitle: viewModel.weekRangeTitle,
                            onPrevious: {
                                Task { await viewModel.moveWeek(by: -1, auth: auth) }
                            },
                            onCurrent: {
                                Task { await viewModel.moveToCurrentWeek(auth: auth) }
                            },
                            onNext: {
                                Task { await viewModel.moveWeek(by: 1, auth: auth) }
                            }
                        )

                        CalendarMobileWeekStrip(days: viewModel.weekMobileDays) { date in
                            Task { await viewModel.selectDate(date, auth: auth) }
                        }

                        CalendarMobileDateList(
                            days: viewModel.weekMobileDays,
                            onShowDetail: { dateKey in
                                selectedDetailRoute = CalendarDetailRoute(date: dateKey)
                            },
                            onCreateReport: { dateKey in
                                onCreateReport?(dateKey)
                            }
                        )

                        CalendarOverallAnalysisEntry(viewModel: viewModel) {
                            showsOverallAnalysis = true
                        }
                    }
                    .padding(.horizontal, AITheme.Spacing.lg)
                    .padding(.top, AITheme.Spacing.sm)
                    .padding(.bottom, AITheme.Spacing.xxl + AITheme.Layout.minTouchTarget)
                }

                if let onCreateReport {
                    CalendarCreateButton {
                        onCreateReport(viewModel.selectedDateKey)
                    }
                        .padding(.trailing, AITheme.Spacing.lg)
                        .padding(.bottom, AITheme.Spacing.lg)
                }
            }
            .background(AITheme.ColorToken.appBackground)
            .navigationTitle("")
            .compactNavigationTitle()
            .navigationDestination(item: $selectedDetailRoute) { route in
                DayDetailView(date: route.date, scope: viewModel.scope)
            }
            .overlay {
                if viewModel.isLoading {
                    ProgressView()
                }
            }
            .task {
                viewModel.configure(for: auth.user)
                await viewModel.refresh(auth: auth)
            }
            .refreshable {
                await viewModel.refresh(auth: auth)
            }
            .onChange(of: viewModel.scope) {
                viewModel.dayDetails = [:]
                Task { await viewModel.refresh(auth: auth) }
            }
            .alert("搜索", isPresented: $showsSearchHint) {
                Button("知道了", role: .cancel) {}
            } message: {
                Text("当前版本可在“记录”页搜索日报；AI 日历会优先展示风险日期和缺填状态。")
            }
            .alert("操作提示", isPresented: actionMessageBinding) {
                Button("知道了", role: .cancel) {}
            } message: {
                Text(actionMessage ?? "")
            }
            .alert("加载失败", isPresented: errorBinding) {
                Button("知道了", role: .cancel) {}
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
            .sheet(isPresented: $showsOverallAnalysis) {
                CalendarOverallAnalysisSheet(
                    viewModel: viewModel,
                    onOpenDate: { date in
                        selectedDetailRoute = CalendarDetailRoute(date: date)
                        showsOverallAnalysis = false
                    },
                    onGenerateWeeklyReport: {
                        Task { await generateWeeklyReport() }
                    },
                    onRemindMissing: {
                        remindMissing()
                    },
                    onOpenProjects: {
                        showsOverallAnalysis = false
                        onOpenProjects?()
                    }
                )
                .environmentObject(auth)
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

    private var actionMessageBinding: Binding<Bool> {
        Binding {
            actionMessage != nil
        } set: { isPresented in
            if !isPresented {
                actionMessage = nil
            }
        }
    }

    private func remindMissing() {
        if let day = viewModel.firstMissingDay {
            actionMessage = "请进入 \(DateHelpers.shortDayTitle(day.date)) 的日期详情，查看缺填成员并提醒补齐。"
        } else {
            actionMessage = "当前范围暂无缺填记录。"
        }
    }

    private func generateWeeklyReport() async {
        guard viewModel.scope != .company else {
            actionMessage = "全公司周报暂未开放，请切换到本部门或只看自己。"
            return
        }
        let range = CalendarAnalysisPeriod.week.range(anchor: viewModel.analysisAnchorDate)
        var request = GenerateReportRequest(
            type: viewModel.scope == .department ? "DEPARTMENT_WEEKLY" : "PERSONAL_WEEKLY",
            periodStart: DateHelpers.dayKey(range.start),
            periodEnd: DateHelpers.dayKey(range.end),
            departmentId: nil
        )
        if viewModel.scope == .department {
            guard let departmentId = auth.user?.departmentId else {
                actionMessage = "当前账号未绑定部门，无法生成部门周报。"
                return
            }
            request.departmentId = departmentId
        }
        do {
            let _: GeneratedReport = try await auth.client().request("/reports/generate", method: .post, body: request)
            actionMessage = "周报已开始生成，稍后可在报告列表查看。"
        } catch {
            actionMessage = error.localizedDescription
        }
    }
}

private struct GenerateReportRequest: Encodable {
    let type: String
    let periodStart: String
    let periodEnd: String
    var departmentId: String?
}

private struct GeneratedReport: Decodable {
    let id: String
}

private struct CalendarDetailRoute: Identifiable, Hashable {
    let date: String

    var id: String {
        date
    }
}

private struct CalendarTopBar: View {
    let weekRangeTitle: String
    @Binding var scope: Scope
    let scopes: [Scope]
    let onToday: () -> Void
    let onSearch: () -> Void
    let onRefresh: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
            HStack(alignment: .center, spacing: AITheme.Spacing.xs) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("AI日历")
                        .font(AITheme.Typography.pageTitle)
                        .foregroundStyle(AITheme.ColorToken.ink900)
                    Text(weekRangeTitle)
                        .font(AITheme.Typography.footnote)
                        .foregroundStyle(AITheme.ColorToken.textSecondary)
                }

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
                .accessibilityLabel("回到本周")

                Button(action: onRefresh) {
                    CalendarToolbarGlyph(systemImage: "arrow.clockwise")
                }
                .buttonStyle(.plain)
                .accessibilityLabel("刷新")
            }

            Menu {
                ForEach(scopes) { item in
                    Button {
                        scope = item
                    } label: {
                        Label(item.title, systemImage: scope == item ? "checkmark" : "person.2")
                    }
                }
            } label: {
                HStack(spacing: AITheme.Spacing.xs) {
                    Image(systemName: scope == .selfScope ? "person" : "person.2")
                    Text(scope.title)
                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.semibold))
                }
                .font(.footnote.weight(.semibold))
                .foregroundStyle(AITheme.ColorToken.ink800)
                .padding(.vertical, 9)
                .padding(.horizontal, AITheme.Spacing.sm)
                .background(AITheme.ColorToken.cardBackground)
                .clipShape(Capsule())
                .overlay {
                    Capsule()
                        .stroke(AITheme.ColorToken.separator, lineWidth: 0.5)
                }
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
    let onOpenAI: () -> Void
    let onCreateReport: () -> Void

    var body: some View {
        content
    }

    private var content: some View {
        let selectedDay = viewModel.selectedMobileDay

        return VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
            HStack(alignment: .top, spacing: AITheme.Spacing.sm) {
                Image(systemName: selectedDay.riskCount > 0 ? "exclamationmark.triangle.fill" : "sparkles")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(selectedDay.riskCount > 0 ? AITheme.ColorToken.danger : AITheme.ColorToken.ai)
                    .frame(width: 30, height: 30)
                    .background(selectedDay.riskCount > 0 ? AITheme.ColorToken.dangerSurface : AITheme.ColorToken.aiSurface)
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
            }

            HStack(spacing: AITheme.Spacing.xs) {
                CalendarMiniFact(title: "日期", value: "\(formatShortDate(selectedDay.date)) \(formatWeekday(selectedDay.date))")
                CalendarMiniFact(title: "范围", value: viewModel.scope.title)
            }

            HStack(spacing: AITheme.Spacing.xs) {
                CalendarMiniFact(title: "参考记录", value: "\(selectedDay.referenceRecordCount)")
                CalendarMiniFact(title: "已填/未填", value: "\(selectedDay.filledCount)/\(selectedDay.missingCount)")
                CalendarMiniFact(title: "风险", value: "\(selectedDay.riskCount)")
                CalendarMiniFact(title: "工时", value: selectedDay.hoursText)
            }

            HStack(spacing: AITheme.Spacing.xs) {
                Button(action: onOpenAI) {
                    Label("打开 AI 洞察", systemImage: "sparkles")
                        .frame(maxWidth: .infinity, minHeight: AITheme.Layout.minTouchTarget)
                }
                .font(.footnote.weight(.semibold))
                .foregroundStyle(AITheme.ColorToken.ai)
                .background(AITheme.ColorToken.aiSurface)
                .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))

                Button(action: onCreateReport) {
                    Label(selectedDay.isFuture ? "填写计划" : "填写日报", systemImage: "square.and.pencil")
                        .frame(maxWidth: .infinity, minHeight: AITheme.Layout.minTouchTarget)
                }
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.white)
                .background(AITheme.ColorToken.primary)
                .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
            }
        }
        .padding(AITheme.Spacing.md)
        .background(AITheme.ColorToken.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous)
                .stroke(AITheme.ColorToken.separator, lineWidth: 0.5)
        }
    }
}

private struct CalendarMiniFact: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(AITheme.ColorToken.textSecondary)
                .lineLimit(1)
            Text(value)
                .font(.caption.weight(.semibold))
                .foregroundStyle(AITheme.ColorToken.ink900)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
                .monospacedDigit()
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AITheme.ColorToken.activeBackground)
        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))
    }
}

private struct CalendarStatusSummary: View {
    let viewModel: CalendarViewModel

    var body: some View {
        HStack(spacing: AITheme.Spacing.xs) {
            CalendarStatusMetric(
                title: "填报率",
                value: String(format: "%.0f%%", viewModel.todayFillRate),
                tint: viewModel.todayFillRate >= 80 ? AITheme.ColorToken.success : AITheme.ColorToken.primary
            )
            CalendarStatusMetric(
                title: "未填",
                value: "\(viewModel.todayMissingCount)",
                tint: viewModel.todayMissingCount > 0 ? AITheme.ColorToken.warning : AITheme.ColorToken.success
            )
            CalendarStatusMetric(
                title: "风险",
                value: "\(viewModel.todayRiskCount)",
                tint: viewModel.todayRiskCount > 0 ? AITheme.ColorToken.danger : AITheme.ColorToken.success
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

private struct CalendarMobileWeekHeader: View {
    let rangeTitle: String
    let onPrevious: () -> Void
    let onCurrent: () -> Void
    let onNext: () -> Void

    var body: some View {
        HStack(spacing: AITheme.Spacing.xs) {
            VStack(alignment: .leading, spacing: 2) {
                Text("本周")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(AITheme.ColorToken.ink900)
                Text(rangeTitle)
                    .font(AITheme.Typography.footnote)
                    .foregroundStyle(AITheme.ColorToken.textSecondary)
            }

            Spacer(minLength: AITheme.Spacing.xs)

            Button(action: onPrevious) {
                Image(systemName: "chevron.left")
                    .frame(width: 36, height: 36)
            }
            .buttonStyle(.plain)
            .foregroundStyle(AITheme.ColorToken.ink800)
            .background(AITheme.ColorToken.cardBackground)
            .clipShape(Circle())
            .overlay { Circle().stroke(AITheme.ColorToken.separator, lineWidth: 0.5) }
            .accessibilityLabel("上一周")

            Button("本周", action: onCurrent)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(AITheme.ColorToken.primary)
                .frame(minHeight: 36)
                .padding(.horizontal, AITheme.Spacing.sm)
                .background(AITheme.ColorToken.primarySurface)
                .clipShape(Capsule())

            Button(action: onNext) {
                Image(systemName: "chevron.right")
                    .frame(width: 36, height: 36)
            }
            .buttonStyle(.plain)
            .foregroundStyle(AITheme.ColorToken.ink800)
            .background(AITheme.ColorToken.cardBackground)
            .clipShape(Circle())
            .overlay { Circle().stroke(AITheme.ColorToken.separator, lineWidth: 0.5) }
            .accessibilityLabel("下一周")
        }
    }
}

private struct CalendarMobileWeekStrip: View {
    let days: [CalendarMobileDayItem]
    let onSelect: (Date) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: AITheme.Spacing.xs) {
                ForEach(days) { day in
                    Button {
                        onSelect(day.date)
                    } label: {
                        CalendarMobileDayChip(day: day)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 2)
        }
        .scrollClipDisabled()
        .accessibilityElement(children: .contain)
    }
}

private struct CalendarMobileDayChip: View {
    let day: CalendarMobileDayItem

    var body: some View {
        VStack(spacing: 6) {
            Text(formatWeekday(day.date).replacingOccurrences(of: "周", with: ""))
                .font(.caption2.weight(.semibold))
                .foregroundStyle(day.isSelected ? AITheme.ColorToken.primary : AITheme.ColorToken.textSecondary)

            ZStack(alignment: .topTrailing) {
                Text("\(Calendar(identifier: .gregorian).component(.day, from: day.date))")
                    .font(.headline.weight(day.isToday ? .bold : .semibold))
                    .foregroundStyle(day.isSelected ? AITheme.ColorToken.primary : AITheme.ColorToken.ink900)
                    .frame(width: 34, height: 30)

                if day.riskCount > 0 {
                    Text("\(day.riskCount)")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(minWidth: 15, minHeight: 15)
                        .background(AITheme.ColorToken.danger)
                        .clipShape(Capsule())
                        .offset(x: 8, y: -4)
                }
            }

            Circle()
                .fill(day.status.tint)
                .frame(width: 6, height: 6)
        }
        .frame(width: 52, height: 72)
        .background(day.isSelected ? AITheme.ColorToken.primarySurface : AITheme.ColorToken.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous)
                .stroke(day.isToday ? AITheme.ColorToken.primary : AITheme.ColorToken.separator, lineWidth: day.isToday ? 1.3 : 0.5)
        }
        .accessibilityLabel("\(formatShortDate(day.date))，\(formatWeekday(day.date))，\(day.status.title)")
    }
}

private struct CalendarMobileDateList: View {
    let days: [CalendarMobileDayItem]
    let onShowDetail: (String) -> Void
    let onCreateReport: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
            Text("本周日期")
                .font(.headline.weight(.semibold))
                .foregroundStyle(AITheme.ColorToken.ink900)

            ForEach(days) { day in
                CalendarMobileDateCard(
                    day: day,
                    onShowDetail: {
                        onShowDetail(day.dateKey)
                    },
                    onCreateReport: {
                        onCreateReport(day.dateKey)
                    }
                )
            }
        }
    }
}

private struct CalendarMobileDateCard: View {
    let day: CalendarMobileDayItem
    let onShowDetail: () -> Void
    let onCreateReport: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
            HStack(alignment: .top, spacing: AITheme.Spacing.sm) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("\(formatShortDate(day.date)) \(formatWeekday(day.date))")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AITheme.ColorToken.ink900)

                    Text(day.summaryText)
                        .font(AITheme.Typography.footnote)
                        .foregroundStyle(AITheme.ColorToken.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: AITheme.Spacing.xs)

                Text(day.status.title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(day.status.tint)
                    .padding(.vertical, 5)
                    .padding(.horizontal, 8)
                    .background(day.status.surface)
                    .clipShape(Capsule())
            }

            CalendarProgressBar(progress: day.progress, tint: day.status.tint)

            HStack(spacing: AITheme.Spacing.xs) {
                Button(action: onShowDetail) {
                    Text("查看详情")
                        .frame(maxWidth: .infinity, minHeight: 38)
                }
                .font(.footnote.weight(.semibold))
                .foregroundStyle(AITheme.ColorToken.primary)
                .background(AITheme.ColorToken.primarySurface)
                .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))

                if day.isToday || day.isFuture {
                    Button(action: onCreateReport) {
                        Text(day.isFuture ? "填写计划" : "填写日报")
                            .frame(maxWidth: .infinity, minHeight: 38)
                    }
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.white)
                    .background(AITheme.ColorToken.primary)
                    .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))
                }
            }
        }
        .padding(AITheme.Spacing.md)
        .background(AITheme.ColorToken.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous)
                .stroke(AITheme.ColorToken.separator, lineWidth: 0.5)
        }
    }
}

private struct CalendarProgressBar: View {
    let progress: Double
    let tint: Color

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(AITheme.ColorToken.separator.opacity(0.5))
                Capsule()
                    .fill(tint)
                    .frame(width: max(6, proxy.size.width * progress))
            }
        }
        .frame(height: 5)
        .accessibilityLabel("填报进度 \(Int((progress * 100).rounded()))%")
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
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                Text("\(item.day ?? 0)")
                    .font(.callout.weight(item.isToday ? .bold : .semibold))
                    .foregroundStyle(item.isToday ? AITheme.ColorToken.primary : AITheme.ColorToken.ink800)

                Spacer(minLength: 0)

                if riskCount > 0 {
                    Text("\(riskCount)")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(minWidth: 17, minHeight: 17)
                        .background(AITheme.ColorToken.danger)
                        .clipShape(Capsule())
                }
            }

            Spacer(minLength: 0)

            HStack(spacing: 4) {
                Capsule()
                    .fill(statusColor)
                    .frame(width: statusBarWidth, height: 4)

                if let statusCaption {
                    Text(statusCaption)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(statusCaptionColor)
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)
                }
            }
            .frame(height: 18, alignment: .leading)
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

    private var statusBarWidth: CGFloat {
        guard let data = item.data else {
            return isFutureEmptyDay ? 14 : 10
        }
        if data.riskCount > 0 {
            return 28
        }
        if data.fillRate >= 80 {
            return 26
        }
        if data.fillRate > 0 {
            return max(14, min(30, CGFloat(data.fillRate / 100) * 30))
        }
        return 10
    }

    private var statusCaption: String? {
        guard let data = item.data else {
            return nil
        }
        if data.riskCount > 0 {
            return "风险"
        }
        if data.fillRate >= 80 {
            return "已填"
        }
        if data.fillRate > 0 {
            return "\(Int(data.fillRate.rounded()))%"
        }
        return nil
    }

    private var statusCaptionColor: Color {
        riskCount > 0 ? AITheme.ColorToken.danger : AITheme.ColorToken.textSecondary
    }

    private var accessibilityText: String {
        guard let data = item.data else {
            return "\(item.day ?? 0) 日，\(isFutureEmptyDay ? "未来计划" : "未填报")"
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

private struct CalendarOverallAnalysisEntry: View {
    @ObservedObject var viewModel: CalendarViewModel
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: AITheme.Spacing.sm) {
                Image(systemName: "sparkles")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(AITheme.ColorToken.ai)
                    .frame(width: 36, height: 36)
                    .background(AITheme.ColorToken.aiSurface)
                    .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))

                VStack(alignment: .leading, spacing: 3) {
                    Text("AI 整体分析")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(AITheme.ColorToken.ink900)
                    Text(entrySummary)
                        .font(.caption)
                        .foregroundStyle(AITheme.ColorToken.textSecondary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: AITheme.Spacing.xs)

                Text("查看分析")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AITheme.ColorToken.ai)
                    .padding(.vertical, 7)
                    .padding(.horizontal, AITheme.Spacing.sm)
                    .background(AITheme.ColorToken.aiSurface)
                    .clipShape(Capsule())
            }
            .padding(AITheme.Spacing.sm)
            .background(AITheme.ColorToken.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous)
                    .stroke(AITheme.ColorToken.separator, lineWidth: 0.5)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("AI 整体分析，\(entrySummary)")
    }

    private var entrySummary: String {
        if viewModel.riskDayCount > 0 {
            return "本周 / 本月 / 季度 / 年度，先看 \(viewModel.riskDayCount) 个风险日期。"
        }
        if viewModel.missingCount > 0 {
            return "本周 / 本月 / 季度 / 年度，关注 \(viewModel.missingCount) 条缺填信号。"
        }
        return "本周 / 本月 / 季度 / 年度，查看团队节奏和建议动作。"
    }
}

private struct CalendarOverallAnalysisSheet: View {
    @EnvironmentObject private var auth: AuthStore
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var viewModel: CalendarViewModel
    @State private var period: CalendarAnalysisPeriod = .week
    @State private var projects: [Project] = []
    let onOpenDate: (String) -> Void
    let onGenerateWeeklyReport: () -> Void
    let onRemindMissing: () -> Void
    let onOpenProjects: () -> Void

    var body: some View {
        let summary = viewModel.summary(for: period)
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: AITheme.Spacing.md) {
                    Picker("分析周期", selection: $period) {
                        ForEach(CalendarAnalysisPeriod.allCases) { item in
                            Text(item.title).tag(item)
                        }
                    }
                    .pickerStyle(.segmented)

                    Text(summary.rangeText)
                        .font(AITheme.Typography.support)
                        .foregroundStyle(AITheme.ColorToken.textSecondary)

                    CalendarAnalysisConclusionCard(
                        title: "\(period.title)核心结论",
                        conclusion: summary.coreConclusion,
                        tone: leadingTone
                    )

                    VStack(alignment: .leading, spacing: AITheme.Spacing.xs) {
                        CalendarAnalysisInfoRow(
                            title: "风险提醒",
                            value: summary.riskReminder,
                            systemImage: "exclamationmark.triangle.fill",
                            tint: summary.riskCount > 0 ? AITheme.ColorToken.danger : AITheme.ColorToken.success
                        )
                        CalendarAnalysisInfoRow(
                            title: "人员状态",
                            value: summary.peopleStatus,
                            systemImage: "person.2.fill",
                            tint: summary.missingCount > 0 ? AITheme.ColorToken.warning : AITheme.ColorToken.ai
                        )
                        CalendarAnalysisInfoRow(
                            title: "项目进展",
                            value: projectText,
                            systemImage: "folder.fill",
                            tint: viewModel.riskDayCount > 0 ? AITheme.ColorToken.warning : AITheme.ColorToken.primary
                        )
                    }

                    VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
                        Text("建议动作")
                            .font(AITheme.Typography.eyebrow)
                            .foregroundStyle(AITheme.ColorToken.textSecondary)

                        FlowActionButtons {
                            CalendarAnalysisActionButton(
                                title: "生成周报",
                                systemImage: "doc.badge.plus",
                                tint: AITheme.ColorToken.primary
                            ) {
                                dismiss()
                                onGenerateWeeklyReport()
                            }

                            CalendarAnalysisActionButton(
                                title: "提醒未填报",
                                systemImage: "person.crop.circle.badge.exclamationmark",
                                tint: AITheme.ColorToken.warning
                            ) {
                                dismiss()
                                onRemindMissing()
                            }

                            CalendarAnalysisActionButton(
                                title: "查看风险项目",
                                systemImage: "folder.badge.questionmark",
                                tint: AITheme.ColorToken.danger
                            ) {
                                dismiss()
                                onOpenProjects()
                            }

                            if let firstRiskDay = viewModel.firstRiskDay {
                                CalendarAnalysisActionButton(
                                    title: "风险日期",
                                    systemImage: "calendar.badge.exclamationmark",
                                    tint: AITheme.ColorToken.danger
                                ) {
                                    dismiss()
                                    onOpenDate(firstRiskDay.date)
                                }
                            }
                        }
                    }
                    .padding(AITheme.Spacing.md)
                    .background(AITheme.ColorToken.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous)
                            .stroke(AITheme.ColorToken.separator, lineWidth: 0.5)
                    }
                }
                .padding(AITheme.Spacing.lg)
            }
            .background(AITheme.ColorToken.appBackground)
            .navigationTitle("AI 整体分析")
            .compactNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("关闭") {
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .task {
            await loadProjects()
        }
    }

    private var leadingTone: Color {
        let summary = viewModel.summary(for: period)
        if summary.riskCount > 0 {
            return AITheme.ColorToken.danger
        }
        if summary.missingCount > 0 {
            return AITheme.ColorToken.warning
        }
        return AITheme.ColorToken.ai
    }

    private var projectText: String {
        guard !projects.isEmpty else {
            return "项目进展可进入项目页查看，重点关注临期、暂停和负责人缺失。"
        }
        let active = projects.filter { $0.status == .active }.count
        let risks = projects.filter(projectHasRisk).count
        return "\(active) 个项目进行中，\(risks) 个项目需要关注。"
    }

    private func loadProjects() async {
        do {
            projects = try await auth.client().request("/projects")
        } catch {
            projects = []
        }
    }

    private func projectHasRisk(_ project: Project) -> Bool {
        if project.status == .paused || project.owner == nil {
            return true
        }
        if let endDate = project.endDate,
           let end = DateHelpers.dayFormatter.date(from: String(endDate.prefix(10))) {
            let days = Calendar.current.dateComponents([.day], from: Date(), to: end).day ?? 0
            return days <= 7
        }
        return false
    }
}

private struct CalendarAnalysisConclusionCard: View {
    let title: String
    let conclusion: String
    let tone: Color

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
            Label(title, systemImage: "sparkles")
                .font(AITheme.Typography.eyebrow)
                .foregroundStyle(AITheme.ColorToken.ai)
            Text(conclusion)
                .font(.headline)
                .foregroundStyle(AITheme.ColorToken.ink900)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(AITheme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AITheme.ColorToken.aiSurface)
        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous)
                .stroke(tone.opacity(0.28), lineWidth: 0.8)
        }
    }
}

private struct CalendarAnalysisInfoRow: View {
    let title: String
    let value: String
    let systemImage: String
    let tint: Color

    var body: some View {
        HStack(alignment: .top, spacing: AITheme.Spacing.sm) {
            Image(systemName: systemImage)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(tint)
                .frame(width: 28, height: 28)
                .background(tint.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AITheme.ColorToken.ink900)
                Text(value)
                    .font(AITheme.Typography.support)
                    .foregroundStyle(AITheme.ColorToken.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .padding(AITheme.Spacing.md)
        .background(AITheme.ColorToken.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous)
                .stroke(AITheme.ColorToken.separator, lineWidth: 0.5)
        }
    }
}

private struct CalendarAnalysisActionButton: View {
    let title: String
    let systemImage: String
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(tint)
                .padding(.vertical, 9)
                .padding(.horizontal, AITheme.Spacing.sm)
                .background(tint.opacity(0.1))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

private struct FlowActionButtons<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: AITheme.Spacing.xs) {
                content
            }
            VStack(alignment: .leading, spacing: AITheme.Spacing.xs) {
                content
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
