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

fileprivate enum CalendarHomeMode: String, CaseIterable, Identifiable {
    case team
    case mine

    var id: String { rawValue }

    var title: String {
        switch self {
        case .team:
            return "团队"
        case .mine:
            return "我的"
        }
    }
}

fileprivate enum CalendarAssistantActionKind: Hashable, Identifiable {
    case openTodayRisk
    case remindMissing
    case openAIInsight
    case createReport
    case openProjects
    case openLogs

    var id: String {
        switch self {
        case .openTodayRisk:
            return "openTodayRisk"
        case .remindMissing:
            return "remindMissing"
        case .openAIInsight:
            return "openAIInsight"
        case .createReport:
            return "createReport"
        case .openProjects:
            return "openProjects"
        case .openLogs:
            return "openLogs"
        }
    }

    var title: String {
        switch self {
        case .openTodayRisk:
            return "查看风险记录"
        case .remindMissing:
            return "查看缺填成员"
        case .openAIInsight:
            return "查看判断依据"
        case .createReport:
            return "填写今日日报"
        case .openProjects:
            return "查看项目进度"
        case .openLogs:
            return "查看填报记录"
        }
    }

    var systemImage: String {
        switch self {
        case .openTodayRisk:
            return "exclamationmark.triangle.fill"
        case .remindMissing:
            return "person.crop.circle.badge.exclamationmark"
        case .openAIInsight:
            return "sparkles"
        case .createReport:
            return "square.and.pencil"
        case .openProjects:
            return "folder"
        case .openLogs:
            return "list.bullet.rectangle"
        }
    }

    var tint: Color {
        switch self {
        case .openTodayRisk:
            return AITheme.ColorToken.danger
        case .remindMissing:
            return AITheme.ColorToken.warning
        case .openAIInsight:
            return AITheme.ColorToken.ai
        case .createReport, .openProjects:
            return AITheme.ColorToken.primary
        case .openLogs:
            return AITheme.ColorToken.ink700
        }
    }
}

fileprivate struct CalendarAssistantReply: Identifiable {
    let id = UUID()
    let title: String
    let message: String
    let actions: [CalendarAssistantActionKind]
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
                var parts = ["计划 \(filledCount)/\(totalCount)"]
                if riskCount > 0 {
                    parts.append("风险 \(riskCount)")
                }
                if totalHours != nil {
                    parts.append("工时 \(hoursText)")
                }
                return parts.joined(separator: " · ")
            }
            return "还没有计划"
        }
        if totalCount > 0 {
            var parts = ["填报 \(filledCount)/\(totalCount)"]
            if missingCount > 0 {
                parts.append("未填 \(missingCount)")
            }
            if riskCount > 0 {
                parts.append("风险 \(riskCount)")
            }
            if totalHours != nil {
                parts.append("工时 \(hoursText)")
            }
            return parts.joined(separator: " · ")
        }
        if riskCount > 0 {
            return "暂无填报记录 · 风险 \(riskCount)"
        }
        return "暂无填报记录"
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
    @Published var recentLogs: [WorkLog] = []
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
        await loadDetailIfNeeded(DateHelpers.dayKey(), auth: auth)
        await loadRecentLogsIfNeeded(auth: auth)
        await loadDetailIfNeeded(selectedDateKey, auth: auth)
        await loadWeekDetails(auth: auth)
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
        await loadDetailIfNeeded(DateHelpers.dayKey(), auth: auth)
    }

    func moveToCurrentWeek(auth: AuthStore) async {
        let today = Date()
        weekAnchorDate = today
        selectedDateKey = DateHelpers.dayKey(today)
        await ensureLoadedMonth(for: today, auth: auth)
        await loadWeekDetails(auth: auth)
        await loadDetailIfNeeded(selectedDateKey, auth: auth)
        await loadDetailIfNeeded(DateHelpers.dayKey(), auth: auth)
    }

    func selectDate(_ date: Date, auth: AuthStore) async {
        weekAnchorDate = date
        selectedDateKey = DateHelpers.dayKey(date)
        await ensureLoadedMonth(for: date, auth: auth)
        await loadWeekDetails(auth: auth)
        await loadDetailIfNeeded(selectedDateKey, auth: auth)
        await loadDetailIfNeeded(DateHelpers.dayKey(), auth: auth)
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
        await load(auth: auth)
    }

    private func loadRecentLogsIfNeeded(auth: AuthStore) async {
        guard scope == .selfScope else {
            recentLogs = []
            return
        }
        do {
            let logs: [WorkLog] = try await auth.client().request("/work-logs")
            recentLogs = Array(
                logs.sorted { lhs, rhs in
                    if lhs.date != rhs.date {
                        return lhs.date > rhs.date
                    }
                    return (lhs.submittedAt ?? "") > (rhs.submittedAt ?? "")
                }
                .prefix(3)
            )
        } catch {
            recentLogs = []
        }
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
        let today = todayMobileDay
        guard today.data != nil || today.detail != nil else {
            return "今天还没有填报信号"
        }
        if today.riskCount > 0 || today.missingCount > 0 {
            return "今日发现 \(today.riskCount) 条风险，\(today.missingCount) 人未填报"
        }
        if today.filledCount > 0 {
            return "今日填报覆盖正常，已收到 \(today.referenceRecordCount) 条记录"
        }
        return "今天还没有填报信号"
    }

    var dashboardRisk: String {
        let today = todayMobileDay
        if today.riskCount > 0 {
            return "建议先查看今天的风险记录，确认项目影响和处理动作。"
        }
        if today.missingCount > 0 {
            return "\(today.missingCount) 人今天未填报，会影响团队状态判断。"
        }
        if today.filledCount > 0 {
            return "暂无明显风险，今日工作信号已进入团队看板。"
        }
        return "先完成今天的日报，系统会同步更新团队节奏。"
    }

    var analysisAnchorDate: Date {
        DateHelpers.dayFormatter.date(from: selectedDateKey) ?? weekAnchorDate
    }

    fileprivate func summary(for period: CalendarAnalysisPeriod) -> CalendarPeriodSummary {
        let range = period.range(anchor: analysisAnchorDate)
        let startKey = DateHelpers.dayKey(range.start)
        let endKey = DateHelpers.dayKey(range.end)
        let periodDays = days.filter { $0.date >= startKey && $0.date <= endKey }
        let weekItems = period == .week ? weekDatesFor(analysisAnchorDate).map { mobileDayItem(for: $0) } : []
        let filled = period == .week ? weekItems.reduce(0) { $0 + $1.filledCount } : periodDays.reduce(0) { $0 + $1.filledCount }
        let missing = period == .week ? weekItems.reduce(0) { $0 + $1.missingCount } : periodDays.reduce(0) { $0 + $1.missingCount }
        let risks = period == .week ? weekItems.reduce(0) { $0 + $1.riskCount } : periodDays.reduce(0) { $0 + $1.riskCount }
        let denominator = filled + missing
        let fillRate = denominator > 0 ? (Double(filled) / Double(denominator)) * 100 : 0
        let riskDayCount = period == .week ? weekItems.filter { $0.riskCount > 0 }.count : periodDays.filter { $0.riskCount > 0 }.count
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
            riskReminder = "缺填会影响团队状态判断，建议优先查看未填成员。"
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
            suggestedAction = "先查看缺填成员，再生成周报沉淀本周期结论。"
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
    @State private var showsOverallAnalysis = false
    @State private var showsAllWeekDays = false
    @State private var homeMode: CalendarHomeMode = .mine
    @State private var didConfigureHomeMode = false
    @State private var actionMessage: String?
    @State private var selectedDetailRoute: CalendarDetailRoute?
    @State private var assistantInput = ""
    @State private var assistantReply: CalendarAssistantReply?
    @State private var selectedLogDetail: WorkLog?
    var onCreateReport: ((String) -> Void)?
    var onOpenLogs: (() -> Void)?
    var onOpenProjects: (() -> Void)?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: AITheme.Spacing.md) {
                    CalendarHomeHeader(
                        title: topTitle,
                        subtitle: homeSubtitle,
                        homeMode: $homeMode,
                        showsModeSwitch: false,
                        onRefresh: {
                            Task { await viewModel.refresh(auth: auth) }
                        }
                    )

                    CalendarDailyBriefStatusCard(day: viewModel.todayMobileDay)

                    CalendarWeekBriefOverview(days: viewModel.weekMobileDays)

                    CalendarAttentionBriefList(
                        days: viewModel.weekMobileDays,
                        onOpenDate: { dateKey in
                            selectedDetailRoute = CalendarDetailRoute(date: dateKey)
                        }
                    )

                    CalendarBriefRecentRecordList(
                        logs: viewModel.recentLogs,
                        onOpenLog: { log in
                            selectedLogDetail = log
                        },
                        onOpenLogs: {
                            onOpenLogs?()
                        }
                    )
                }
                .padding(.horizontal, AITheme.Spacing.lg)
                .padding(.top, AITheme.Spacing.md)
                .padding(.bottom, AITheme.Spacing.xxl)
            }
            .background(AITheme.ColorToken.appBackground)
            .appTopContentInset(AITheme.Spacing.md)
            .appTabBarContentInset(AITheme.Spacing.lg)
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
                configureHomeModeIfNeeded()
                syncScopeForHomeMode()
                await viewModel.refresh(auth: auth)
            }
            .refreshable {
                await viewModel.refresh(auth: auth)
            }
            .onChange(of: homeMode) {
                syncScopeForHomeMode()
                showsAllWeekDays = false
                assistantReply = nil
            }
            .onChange(of: viewModel.scope) {
                viewModel.dayDetails = [:]
                showsAllWeekDays = false
                assistantReply = nil
                Task { await viewModel.refresh(auth: auth) }
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
            .sheet(item: $selectedLogDetail) { log in
                WorkLogDetailView(log: log)
            }
        }
    }

    private var calendarCommandCenter: some View {
        CalendarAICommandCenter(
            viewModel: viewModel,
            isManager: isManagerHome,
            input: $assistantInput,
            reply: assistantReply,
            onSubmit: { prompt in
                handleAssistantPrompt(prompt)
            },
            onQuickCommand: { prompt in
                handleAssistantPrompt(prompt)
            },
            onAction: { action in
                handleAssistantAction(action)
            }
        )
    }

    private var isManagerHome: Bool {
        supportsTeamMode && homeMode == .team
    }

    private var supportsTeamMode: Bool {
        auth.user?.canViewDepartment ?? false
    }

    private var teamScope: Scope {
        guard let user = auth.user else {
            return .selfScope
        }
        if user.canViewCompany {
            return .company
        }
        if user.canViewDepartment {
            return .department
        }
        return .selfScope
    }

    private var topTitle: String {
        "AI日历"
    }

    private var homeSubtitle: String {
        "\(formatShortDate(Date())) \(formatWeekday(Date()))"
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

    private func configureHomeModeIfNeeded() {
        guard !didConfigureHomeMode else {
            return
        }
        homeMode = .mine
        didConfigureHomeMode = true
    }

    private func syncScopeForHomeMode() {
        let targetScope: Scope = isManagerHome ? teamScope : .selfScope
        if viewModel.scope != targetScope {
            viewModel.scope = targetScope
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
            selectedDetailRoute = CalendarDetailRoute(date: day.date)
            showsOverallAnalysis = false
        } else {
            actionMessage = "当前范围暂无缺填记录。"
        }
    }

    private func handleTodayPrimaryAction() {
        let today = viewModel.todayMobileDay
        if isManagerHome {
            selectedDetailRoute = CalendarDetailRoute(date: today.dateKey)
        } else {
            onCreateReport?(DateHelpers.dayKey())
        }
    }

    private func handleTodaySecondaryAction() {
        if isManagerHome {
            if viewModel.todayMobileDay.missingCount > 0 {
                selectedDetailRoute = CalendarDetailRoute(date: viewModel.todayMobileDay.dateKey)
            } else {
                showsOverallAnalysis = true
            }
        } else {
            onOpenLogs?()
        }
    }

    private func handleAssistantPrompt(_ prompt: String) {
        let cleaned = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else {
            return
        }
        assistantInput = ""
        assistantReply = makeAssistantReply(for: cleaned)
    }

    private func makeAssistantReply(for prompt: String) -> CalendarAssistantReply {
        let today = viewModel.todayMobileDay
        let normalized = prompt.lowercased()
        let asksRisk = normalized.contains("风险") || normalized.contains("阻塞") || normalized.contains("异常")
        let asksMissing = normalized.contains("未填") || normalized.contains("缺填") || normalized.contains("提醒")
        let asksReport = normalized.contains("汇报") || normalized.contains("周报") || normalized.contains("总结")
        let asksEntry = normalized.contains("日报") || normalized.contains("填报") || normalized.contains("整理")
        let asksProject = normalized.contains("项目") || normalized.contains("进度")

        if asksProject {
            return CalendarAssistantReply(
                title: "我会先打开项目状态",
                message: "项目页会展示负责人、截止日期和 AI 风险提示，适合继续判断延期或阻塞。",
                actions: [.openProjects, .openAIInsight]
            )
        }

        if asksRisk {
            let message = today.riskCount > 0
                ? "今天有 \(today.riskCount) 条风险信号，建议先进入日期详情确认影响项目和负责人。"
                : "今天暂无明显风险，可以继续查看本周判断依据，确认是否存在低覆盖或临期项目。"
            return CalendarAssistantReply(
                title: "已整理风险处理入口",
                message: message,
                actions: today.riskCount > 0 ? [.openTodayRisk, .openAIInsight] : [.openAIInsight, .openProjects]
            )
        }

        if asksMissing {
            let message = today.missingCount > 0
                ? "今天还有 \(today.missingCount) 人未填报，先查看名单，再决定是否线下提醒。"
                : "当前今日缺填不明显，可以打开判断依据查看本周覆盖情况。"
            return CalendarAssistantReply(
                title: "已准备缺填处理入口",
                message: message,
                actions: today.missingCount > 0 ? [.remindMissing, .openAIInsight] : [.openAIInsight]
            )
        }

        if asksReport {
            return CalendarAssistantReply(
                title: "已准备汇报入口",
                message: "先查看本周风险、缺填和人员状态，再生成适合汇报的结构化结论。",
                actions: [.openAIInsight, .openTodayRisk]
            )
        }

        if asksEntry {
            return CalendarAssistantReply(
                title: "我可以帮你进入日报整理",
                message: "到填报页后，可以直接说或写今天完成的工作，先生成日报草稿，再确认提交。",
                actions: [.createReport, .openLogs]
            )
        }

        return CalendarAssistantReply(
            title: "我建议先处理今天的关键状态",
            message: isManagerHome
                ? "可以先看风险和缺填，再查看判断依据生成汇报材料。"
                : "可以先完成今日日报，再回看本周风险和最近记录。",
            actions: isManagerHome ? [.openTodayRisk, .remindMissing, .openAIInsight] : [.createReport, .openAIInsight, .openLogs]
        )
    }

    private func handleAssistantAction(_ action: CalendarAssistantActionKind) {
        switch action {
        case .openTodayRisk:
            selectedDetailRoute = CalendarDetailRoute(date: viewModel.todayMobileDay.dateKey)
        case .remindMissing:
            handleTodaySecondaryAction()
        case .openAIInsight:
            showsOverallAnalysis = true
        case .createReport:
            onCreateReport?(DateHelpers.dayKey())
        case .openProjects:
            onOpenProjects?()
        case .openLogs:
            onOpenLogs?()
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

private struct CalendarHomeHeader: View {
    let title: String
    let subtitle: String
    @Binding var homeMode: CalendarHomeMode
    let showsModeSwitch: Bool
    let onRefresh: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
            HStack(alignment: .top, spacing: AITheme.Spacing.sm) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(AITheme.Typography.pageTitle)
                        .foregroundStyle(AITheme.ColorToken.ink900)
                        .lineLimit(1)
                        .minimumScaleFactor(0.84)
                    Text(subtitle)
                        .font(AITheme.Typography.footnote)
                        .foregroundStyle(AITheme.ColorToken.textSecondary)
                }

                Spacer(minLength: AITheme.Spacing.xs)

                Button(action: onRefresh) {
                    Image(systemName: "arrow.clockwise")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AITheme.ColorToken.ink800)
                        .frame(width: 40, height: 40)
                        .background(AITheme.ColorToken.cardBackground)
                        .clipShape(Capsule())
                        .overlay {
                            Capsule()
                                .stroke(AITheme.ColorToken.separator, lineWidth: 0.5)
                        }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("刷新")
            }

            if showsModeSwitch {
                Picker("首页模式", selection: $homeMode) {
                    ForEach(CalendarHomeMode.allCases) { mode in
                        Text(mode.title).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .accessibilityLabel("切换团队或我的首页")
            }
        }
    }
}

private struct CalendarDailyBriefStatusCard: View {
    let day: CalendarMobileDayItem

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
            HStack(alignment: .center, spacing: AITheme.Spacing.sm) {
                Image(systemName: statusIcon)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(statusTint)
                    .frame(width: 38, height: 38)
                    .background(statusSurface)
                    .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text(statusTitle)
                        .font(AITheme.Typography.title2)
                        .foregroundStyle(AITheme.ColorToken.ink900)
                        .lineLimit(2)
                        .minimumScaleFactor(0.86)

                    Text(statusSummary)
                        .font(AITheme.Typography.support)
                        .foregroundStyle(AITheme.ColorToken.textSecondary)
                        .lineLimit(2)
                }

                Spacer(minLength: 0)
            }

            Text(statusMessage)
                .font(AITheme.Typography.body)
                .foregroundStyle(messageTint)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(AITheme.Spacing.md)
        .background(AITheme.ColorToken.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous)
                .stroke(AITheme.ColorToken.separator, lineWidth: 0.5)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(statusTitle)，\(statusSummary)，\(statusMessage)")
    }

    private var statusTitle: String {
        if day.riskCount > 0 {
            return "有风险需要关注"
        }
        if day.filledCount == 0 {
            return "今天还未填报"
        }
        return "今天状态正常"
    }

    private var statusSummary: String {
        let riskText = day.riskCount > 0 ? "\(day.riskCount) 条风险" : "无风险"
        if day.filledCount > 0 {
            return "已填报 · \(hourSummary) · \(riskText)"
        }
        return "未填报 · 工时待补齐 · \(riskText)"
    }

    private var statusMessage: String {
        if day.riskCount > 0 {
            return "AI 已发现风险信号，建议去记录页查看原始日报。"
        }
        if day.filledCount == 0 {
            return "底部“填报”可以完成今日日报，提交后这里会自动更新。"
        }
        return "AI 暂未发现需要你处理的问题。"
    }

    private var hourSummary: String {
        guard let totalHours = day.totalHours else {
            return "工时待确认"
        }
        let rounded = (totalHours * 10).rounded() / 10
        if rounded.rounded() == rounded {
            return "\(Int(rounded))h"
        }
        return String(format: "%.1fh", rounded)
    }

    private var statusTint: Color {
        if day.riskCount > 0 {
            return AITheme.ColorToken.danger
        }
        if day.filledCount == 0 {
            return AITheme.ColorToken.warning
        }
        return AITheme.ColorToken.success
    }

    private var statusSurface: Color {
        if day.riskCount > 0 {
            return AITheme.ColorToken.dangerSurface
        }
        if day.filledCount == 0 {
            return AITheme.ColorToken.warningSurface
        }
        return AITheme.ColorToken.successSurface
    }

    private var statusIcon: String {
        if day.riskCount > 0 {
            return "exclamationmark.triangle.fill"
        }
        if day.filledCount == 0 {
            return "clock.badge.exclamationmark"
        }
        return "checkmark.seal.fill"
    }

    private var messageTint: Color {
        day.riskCount > 0 ? AITheme.ColorToken.danger : AITheme.ColorToken.ink700
    }
}

private struct CalendarWeekBriefOverview: View {
    let days: [CalendarMobileDayItem]

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
            Text("本周概览")
                .font(.headline.weight(.semibold))
                .foregroundStyle(AITheme.ColorToken.ink900)

            HStack(spacing: AITheme.Spacing.xs) {
                CalendarBriefMetricTile(
                    value: "\(filledDays) 天",
                    label: "已填",
                    tint: AITheme.ColorToken.success,
                    surface: AITheme.ColorToken.successSurface
                )
                CalendarBriefMetricTile(
                    value: "\(missingDays) 天",
                    label: "未填",
                    tint: missingDays > 0 ? AITheme.ColorToken.warning : AITheme.ColorToken.ink500,
                    surface: missingDays > 0 ? AITheme.ColorToken.warningSurface : AITheme.ColorToken.surface
                )
                CalendarBriefMetricTile(
                    value: "\(riskCount) 条",
                    label: "风险",
                    tint: riskCount > 0 ? AITheme.ColorToken.danger : AITheme.ColorToken.ink500,
                    surface: riskCount > 0 ? AITheme.ColorToken.dangerSurface : AITheme.ColorToken.surface
                )
            }
        }
    }

    private var pastAndTodayDays: [CalendarMobileDayItem] {
        days.filter { !$0.isFuture }
    }

    private var filledDays: Int {
        pastAndTodayDays.filter { $0.filledCount > 0 }.count
    }

    private var missingDays: Int {
        pastAndTodayDays.filter { $0.filledCount == 0 || $0.missingCount > 0 }.count
    }

    private var riskCount: Int {
        pastAndTodayDays.reduce(0) { $0 + $1.riskCount }
    }
}

private struct CalendarBriefMetricTile: View {
    let value: String
    let label: String
    let tint: Color
    let surface: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value)
                .font(.headline.weight(.semibold))
                .foregroundStyle(tint)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(label)
                .font(AITheme.Typography.caption)
                .foregroundStyle(AITheme.ColorToken.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, AITheme.Spacing.sm)
        .padding(.horizontal, AITheme.Spacing.sm)
        .background(surface)
        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous)
                .stroke(AITheme.ColorToken.separator.opacity(0.8), lineWidth: 0.5)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label)\(value)")
    }
}

private struct CalendarAttentionBriefList: View {
    let days: [CalendarMobileDayItem]
    let onOpenDate: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
            Text("需要关注")
                .font(.headline.weight(.semibold))
                .foregroundStyle(AITheme.ColorToken.ink900)

            VStack(spacing: 0) {
                if attentionItems.isEmpty {
                    HStack(spacing: AITheme.Spacing.sm) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.headline)
                            .foregroundStyle(AITheme.ColorToken.success)
                            .frame(width: 30, height: 30)
                            .background(AITheme.ColorToken.successSurface)
                            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))

                        Text("暂无需要关注的问题")
                            .font(AITheme.Typography.support)
                            .foregroundStyle(AITheme.ColorToken.textSecondary)

                        Spacer(minLength: 0)
                    }
                    .padding(AITheme.Spacing.sm)
                } else {
                    ForEach(Array(attentionItems.enumerated()), id: \.element.id) { index, item in
                        Button {
                            onOpenDate(item.dateKey)
                        } label: {
                            HStack(spacing: AITheme.Spacing.sm) {
                                Image(systemName: item.systemImage)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(item.tint)
                                    .frame(width: 30, height: 30)
                                    .background(item.surface)
                                    .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))

                                VStack(alignment: .leading, spacing: 3) {
                                    Text(item.title)
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(AITheme.ColorToken.ink900)
                                        .lineLimit(1)
                                        .minimumScaleFactor(0.82)
                                    Text(item.subtitle)
                                        .font(AITheme.Typography.footnote)
                                        .foregroundStyle(AITheme.ColorToken.textSecondary)
                                        .lineLimit(2)
                                }

                                Spacer(minLength: AITheme.Spacing.xs)

                                Image(systemName: "chevron.right")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(AITheme.ColorToken.ink400)
                            }
                            .padding(.vertical, AITheme.Spacing.sm)
                            .padding(.horizontal, AITheme.Spacing.sm)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(item.title)，\(item.subtitle)")

                        if index < attentionItems.count - 1 {
                            Divider()
                                .overlay(AITheme.ColorToken.separator)
                                .padding(.leading, 52)
                        }
                    }
                }
            }
            .background(AITheme.ColorToken.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous)
                    .stroke(AITheme.ColorToken.separator, lineWidth: 0.5)
            }
        }
    }

    private var attentionItems: [CalendarBriefAttentionItem] {
        Array(
            days
                .filter { !$0.isFuture }
                .compactMap { day -> CalendarBriefAttentionItem? in
                    if day.riskCount > 0 {
                        return CalendarBriefAttentionItem(
                            dateKey: day.dateKey,
                            title: "\(formatShortDate(day.date)) 风险 \(day.riskCount) 条",
                            subtitle: day.summaryText,
                            systemImage: "exclamationmark.triangle.fill",
                            tint: AITheme.ColorToken.danger,
                            surface: AITheme.ColorToken.dangerSurface,
                            priority: 0
                        )
                    }

                    if day.missingCount > 0 || day.filledCount == 0 {
                        return CalendarBriefAttentionItem(
                            dateKey: day.dateKey,
                            title: "\(formatShortDate(day.date)) 未填报",
                            subtitle: "本周状态可能不完整，建议补齐日报。",
                            systemImage: "clock.badge.exclamationmark",
                            tint: AITheme.ColorToken.warning,
                            surface: AITheme.ColorToken.warningSurface,
                            priority: 1
                        )
                    }

                    if let totalHours = day.totalHours, totalHours > 0, totalHours < 2 {
                        return CalendarBriefAttentionItem(
                            dateKey: day.dateKey,
                            title: "\(formatShortDate(day.date)) 工时偏低",
                            subtitle: "\(day.hoursText)，建议确认是否漏填。",
                            systemImage: "chart.line.downtrend.xyaxis",
                            tint: AITheme.ColorToken.warning,
                            surface: AITheme.ColorToken.warningSurface,
                            priority: 2
                        )
                    }

                    return nil
                }
                .sorted { lhs, rhs in
                    if lhs.priority != rhs.priority {
                        return lhs.priority < rhs.priority
                    }
                    return lhs.dateKey > rhs.dateKey
                }
                .prefix(2)
        )
    }
}

private struct CalendarBriefAttentionItem: Identifiable {
    let id = UUID()
    let dateKey: String
    let title: String
    let subtitle: String
    let systemImage: String
    let tint: Color
    let surface: Color
    let priority: Int
}

private struct CalendarBriefRecentRecordList: View {
    let logs: [WorkLog]
    let onOpenLog: (WorkLog) -> Void
    let onOpenLogs: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
            HStack(alignment: .firstTextBaseline) {
                Text("最近记录")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(AITheme.ColorToken.ink900)

                Spacer(minLength: AITheme.Spacing.xs)

                Button("查看全部", action: onOpenLogs)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(AITheme.ColorToken.primary)
            }

            VStack(spacing: 0) {
                if logs.isEmpty {
                    HStack(spacing: AITheme.Spacing.sm) {
                        Image(systemName: "doc.text")
                            .font(.headline)
                            .foregroundStyle(AITheme.ColorToken.textSecondary)
                            .frame(width: 30, height: 30)

                        Text("提交日报后，这里会显示最近 3 条记录。")
                            .font(AITheme.Typography.support)
                            .foregroundStyle(AITheme.ColorToken.textSecondary)

                        Spacer(minLength: 0)
                    }
                    .padding(AITheme.Spacing.sm)
                } else {
                    ForEach(Array(logs.prefix(3).enumerated()), id: \.element.id) { index, log in
                        Button {
                            onOpenLog(log)
                        } label: {
                            CalendarBriefRecentRecordRow(log: log)
                                .padding(.vertical, AITheme.Spacing.sm)
                                .padding(.horizontal, AITheme.Spacing.sm)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)

                        if index < min(logs.count, 3) - 1 {
                            Divider()
                                .overlay(AITheme.ColorToken.separator)
                                .padding(.leading, AITheme.Spacing.sm)
                        }
                    }
                }
            }
            .background(AITheme.ColorToken.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous)
                    .stroke(AITheme.ColorToken.separator, lineWidth: 0.5)
            }
        }
    }
}

private struct CalendarBriefRecentRecordRow: View {
    let log: WorkLog

    var body: some View {
        HStack(alignment: .center, spacing: AITheme.Spacing.sm) {
            VStack(alignment: .leading, spacing: 4) {
                Text(formatLogDate(log.date))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AITheme.ColorToken.ink900)
                    .lineLimit(1)

                HStack(spacing: AITheme.Spacing.xs) {
                    Text("\(log.hoursText)h")
                    Text(log.status.title)
                    if let project = log.project?.displayName, !project.isEmpty {
                        Text(project)
                            .lineLimit(1)
                    }
                }
                .font(AITheme.Typography.footnote)
                .foregroundStyle(AITheme.ColorToken.textSecondary)
            }

            Spacer(minLength: AITheme.Spacing.xs)

            if workLogHasRisk(log) {
                Text("风险")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AITheme.ColorToken.danger)
                    .padding(.vertical, 5)
                    .padding(.horizontal, 8)
                    .background(AITheme.ColorToken.dangerSurface)
                    .clipShape(Capsule())
            } else {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AITheme.ColorToken.ink400)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(formatLogDate(log.date))，\(log.hoursText)小时，\(log.status.title)")
    }

    private func formatLogDate(_ dateKey: String) -> String {
        guard let date = DateHelpers.dayFormatter.date(from: String(dateKey.prefix(10))) else {
            return String(dateKey.prefix(10))
        }
        return formatShortDate(date)
    }
}

private struct CalendarHomeHeroCard: View {
    let viewModel: CalendarViewModel
    let isManager: Bool
    let onPrimary: () -> Void
    let onSecondary: () -> Void
    let onAIInsight: () -> Void

    var body: some View {
        let today = viewModel.todayMobileDay

        return VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
            HStack(alignment: .center, spacing: AITheme.Spacing.xs) {
                Text(isManager ? "今天先处理" : "今天先完成")
                    .font(AITheme.Typography.eyebrow)
                    .foregroundStyle(heroAccent(today))

                Spacer(minLength: AITheme.Spacing.xs)

                Button(action: onAIInsight) {
                    Label("AI洞察", systemImage: "sparkles")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(AITheme.ColorToken.ai)
                        .lineLimit(1)
                        .padding(.vertical, 6)
                        .padding(.horizontal, 9)
                        .background(AITheme.ColorToken.aiSurface)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("查看判断依据")
            }

            Text(heroTitle(today))
                .font(AITheme.Typography.hero)
                .foregroundStyle(AITheme.ColorToken.ink900)
                .lineLimit(2)
                .minimumScaleFactor(0.86)
                .fixedSize(horizontal: false, vertical: true)

            Text(heroSubtitle(today))
                .font(AITheme.Typography.support)
                .foregroundStyle(AITheme.ColorToken.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            CalendarHeroMetricStrip(today: today, isManager: isManager)
                .padding(.top, AITheme.Spacing.xxs)

            Button(action: onPrimary) {
                Label(primaryActionTitle(today), systemImage: primaryActionIcon(today))
                    .frame(maxWidth: .infinity, minHeight: AITheme.Layout.minTouchTarget)
            }
            .font(AITheme.Typography.action)
            .foregroundStyle(.white)
            .background(primaryActionTint(today))
            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
            .buttonStyle(.plain)
            .padding(.top, AITheme.Spacing.xs)
        }
        .padding(AITheme.Spacing.md)
        .background(AITheme.ColorToken.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous)
                .stroke(AITheme.ColorToken.separator, lineWidth: 0.5)
        }
    }

    private func heroTitle(_ today: CalendarMobileDayItem) -> String {
        if isManager {
            if today.riskCount > 0 {
                return "\(today.riskCount) 条风险待确认"
            }
            if today.missingCount > 0 {
                return "\(today.missingCount) 人未填报"
            }
            if today.filledCount > 0 {
                return "团队今日状态正常"
            }
            return "等待团队填报"
        }
        if today.filledCount > 0 {
            return today.riskCount > 0 ? "今天已提交，但有风险待补充" : "今天已完成填报"
        }
        return "今天还未填报"
    }

    private func heroSubtitle(_ today: CalendarMobileDayItem) -> String {
        if isManager {
            if today.riskCount > 0 {
                return "先确认影响项目和负责人，再决定是否提醒或升级。"
            }
            if today.missingCount > 0 {
                return "先看名单并提醒，避免周报和复盘失真。"
            }
            return "暂无风险和缺填，可继续查看本周节奏。"
        }
        if today.filledCount > 0 {
            return "可继续补充风险、工时，或查看最近记录。"
        }
        return "先完成今天的日报，AI 会同步更新本周状态。"
    }

    private func heroAccent(_ today: CalendarMobileDayItem) -> Color {
        if today.riskCount > 0 {
            return AITheme.ColorToken.danger
        }
        if today.missingCount > 0 || today.filledCount == 0 {
            return isManager ? AITheme.ColorToken.warning : AITheme.ColorToken.primary
        }
        return AITheme.ColorToken.success
    }

    private func primaryActionTitle(_ today: CalendarMobileDayItem) -> String {
        if isManager {
            if today.riskCount > 0 {
                return "查看风险记录"
            }
            if today.missingCount > 0 {
                return "查看未填报成员"
            }
            return "查看今日状态"
        }
        return today.filledCount > 0 ? "补充今日日报" : "填写今日日报"
    }

    private func primaryActionIcon(_ today: CalendarMobileDayItem) -> String {
        if isManager {
            return today.riskCount > 0 ? "exclamationmark.triangle.fill" : "person.2.fill"
        }
        return "square.and.pencil"
    }

    private func primaryActionTint(_ today: CalendarMobileDayItem) -> Color {
        return AITheme.ColorToken.primary
    }
}

private struct CalendarHeroMetricStrip: View {
    let today: CalendarMobileDayItem
    let isManager: Bool

    var body: some View {
        HStack(spacing: AITheme.Spacing.xs) {
            if isManager {
                CalendarHeroMetric(
                    title: "填报率",
                    value: String(format: "%.0f%%", today.fillRate),
                    tint: today.fillRate >= 80 ? AITheme.ColorToken.ink800 : AITheme.ColorToken.primary
                )
                CalendarHeroMetric(
                    title: "未填",
                    value: "\(today.missingCount)",
                    tint: today.missingCount > 0 ? AITheme.ColorToken.warning : AITheme.ColorToken.success
                )
                CalendarHeroMetric(
                    title: "风险",
                    value: today.riskCount > 0 ? "\(today.riskCount)" : "暂无",
                    tint: today.riskCount > 0 ? AITheme.ColorToken.danger : AITheme.ColorToken.ink500
                )
            } else {
                CalendarHeroMetric(
                    title: "状态",
                    value: today.filledCount > 0 ? "已填" : "待填",
                    tint: today.filledCount > 0 ? AITheme.ColorToken.success : AITheme.ColorToken.primary
                )
                CalendarHeroMetric(
                    title: "风险",
                    value: today.riskCount > 0 ? "\(today.riskCount)" : "暂无",
                    tint: today.riskCount > 0 ? AITheme.ColorToken.danger : AITheme.ColorToken.ink500
                )
                CalendarHeroMetric(
                    title: "工时",
                    value: today.hoursText,
                    tint: AITheme.ColorToken.ink800
                )
            }
        }
        .accessibilityElement(children: .combine)
    }
}

private struct CalendarHeroMetric: View {
    let title: String
    let value: String
    let tint: Color

    var body: some View {
        HStack(spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(AITheme.ColorToken.textSecondary)
                .lineLimit(1)

            Text(value)
                .font(.caption.weight(.semibold))
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .monospacedDigit()
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 8)
        .background(AITheme.ColorToken.surface)
        .clipShape(Capsule())
    }
}

private struct CalendarNextActionList: View {
    let viewModel: CalendarViewModel
    let isManager: Bool
    let onPrimary: () -> Void
    let onSecondary: () -> Void
    let onAIInsight: () -> Void
    let onOpenProjects: () -> Void

    var body: some View {
        let today = viewModel.todayMobileDay

        return VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
            HStack(alignment: .firstTextBaseline) {
                Text(isManager ? "今日待处理" : "今日行动")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(AITheme.ColorToken.ink900)

                Spacer(minLength: AITheme.Spacing.xs)

                Text(queueLabel(today))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(queueTint(today))
                    .padding(.vertical, 5)
                    .padding(.horizontal, 8)
                    .background(queueTint(today).opacity(0.12))
                    .clipShape(Capsule())
            }

            VStack(spacing: AITheme.Spacing.xs) {
                if isManager {
                    if today.riskCount > 0 {
                        CalendarActionRow(
                            title: "处理风险记录",
                            subtitle: "今天有 \(today.riskCount) 条风险，先确认影响和责任人。",
                            systemImage: "exclamationmark.triangle.fill",
                            tint: AITheme.ColorToken.danger,
                            action: onPrimary
                        )
                    }

                    if today.missingCount > 0 {
                        CalendarActionRow(
                            title: "查看未填报成员",
                            subtitle: "\(today.missingCount) 人未填报，先补齐团队状态。",
                            systemImage: "person.crop.circle.badge.exclamationmark",
                            tint: AITheme.ColorToken.warning,
                            action: onSecondary
                        )
                    }

                    CalendarActionRow(
                        title: "AI 复盘建议",
                        subtitle: "汇总本周风险、缺填和下一步动作。",
                        systemImage: "sparkles",
                        tint: AITheme.ColorToken.ai,
                        action: onAIInsight
                    )

                    if today.riskCount == 0 && today.missingCount == 0 {
                        CalendarActionRow(
                            title: "查看项目节奏",
                            subtitle: "确认项目进展、风险和负责人状态。",
                            systemImage: "folder",
                            tint: AITheme.ColorToken.primary,
                            action: onOpenProjects
                        )
                    }
                } else {
                    CalendarActionRow(
                        title: today.filledCount > 0 ? "补充今日日报" : "填写今日日报",
                        subtitle: today.filledCount > 0 ? "继续补充风险、工时或关键产出。" : "用一句话开始，减少日报录入成本。",
                        systemImage: "square.and.pencil",
                        tint: AITheme.ColorToken.primary,
                        action: onPrimary
                    )

                    CalendarActionRow(
                        title: today.riskCount > 0 ? "补充风险说明" : "AI 写作建议",
                        subtitle: today.riskCount > 0 ? "把风险原因、影响和下一步补完整。" : "查看 AI 对今天和本周的建议。",
                        systemImage: today.riskCount > 0 ? "exclamationmark.triangle.fill" : "sparkles",
                        tint: today.riskCount > 0 ? AITheme.ColorToken.danger : AITheme.ColorToken.ai,
                        action: today.riskCount > 0 ? onPrimary : onAIInsight
                    )

                    CalendarActionRow(
                        title: "查看最近记录",
                        subtitle: "快速回看最近提交的日报。",
                        systemImage: "list.bullet.rectangle",
                        tint: AITheme.ColorToken.ink800,
                        action: onSecondary
                    )
                }
            }
        }
    }

    private func queueLabel(_ today: CalendarMobileDayItem) -> String {
        if today.riskCount > 0 {
            return "有风险"
        }
        if today.missingCount > 0 || today.filledCount == 0 {
            return isManager ? "待补齐" : "待填报"
        }
        return "正常"
    }

    private func queueTint(_ today: CalendarMobileDayItem) -> Color {
        if today.riskCount > 0 {
            return AITheme.ColorToken.danger
        }
        if today.missingCount > 0 || today.filledCount == 0 {
            return isManager ? AITheme.ColorToken.warning : AITheme.ColorToken.primary
        }
        return AITheme.ColorToken.success
    }
}

private struct CalendarActionRow: View {
    let title: String
    let subtitle: String
    let systemImage: String
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: AITheme.Spacing.sm) {
                Image(systemName: systemImage)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(tint)
                    .frame(width: 34, height: 34)
                    .background(tint.opacity(0.11))
                    .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))

                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AITheme.ColorToken.ink900)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    Text(subtitle)
                        .font(AITheme.Typography.footnote)
                        .foregroundStyle(AITheme.ColorToken.textSecondary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: AITheme.Spacing.xs)

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AITheme.ColorToken.textTertiary)
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
    }
}

private struct CalendarAICommandCenter: View {
    let viewModel: CalendarViewModel
    let isManager: Bool
    @Binding var input: String
    let reply: CalendarAssistantReply?
    let onSubmit: (String) -> Void
    let onQuickCommand: (String) -> Void
    let onAction: (CalendarAssistantActionKind) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.xs) {
            Label("快捷处理", systemImage: "sparkles")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(AITheme.ColorToken.ai)

            HStack(alignment: .center, spacing: AITheme.Spacing.xs) {
                TextField("问今天有什么需要处理？", text: $input)
                    .font(AITheme.Typography.support)
                    .submitLabel(.send)
                    .padding(.horizontal, AITheme.Spacing.sm)
                    .frame(minHeight: AITheme.Layout.minTouchTarget)
                    .background(AITheme.ColorToken.activeBackground)
                    .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous)
                            .stroke(AITheme.ColorToken.separator, lineWidth: 0.8)
                    }
                    .onSubmit {
                        submitCurrentInput()
                    }

                Button {
                    submitCurrentInput()
                } label: {
                    Image(systemName: "arrow.up")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(canSubmit ? .white : AITheme.ColorToken.disabledText)
                        .frame(width: AITheme.Layout.minTouchTarget, height: AITheme.Layout.minTouchTarget)
                        .background(canSubmit ? AITheme.ColorToken.primary : AITheme.ColorToken.disabledBackground)
                        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(!canSubmit)
                .accessibilityLabel("发送问题")
            }

            HStack(spacing: AITheme.Spacing.xs) {
                ForEach(quickCommands, id: \.self) { command in
                    Button {
                        onQuickCommand(command)
                    } label: {
                        Text(command)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(commandTint(command))
                            .lineLimit(1)
                            .minimumScaleFactor(0.78)
                            .frame(maxWidth: .infinity, minHeight: 36)
                            .padding(.horizontal, AITheme.Spacing.xs)
                            .background(commandSurface(command))
                            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }

            if let reply {
                CalendarAssistantResultCard(reply: reply, onAction: onAction)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(AITheme.Spacing.sm)
        .background(AITheme.ColorToken.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous)
                .stroke(AITheme.ColorToken.separator, lineWidth: 0.5)
        }
        .animation(.snappy(duration: 0.2), value: reply?.id)
    }

    private var subtitle: String {
        if isManager {
            return "可以问风险、缺填、项目进度，也可以一键生成汇报入口。"
        }
        return "可以问本周风险，也可以直接进入日报整理。"
    }

    private var quickCommands: [String] {
        if isManager {
            return ["生成今日汇报", "查看项目进度"]
        }
        return ["帮我整理日报", "查看本周风险"]
    }

    private var canSubmit: Bool {
        !input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func submitCurrentInput() {
        let prompt = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !prompt.isEmpty else {
            return
        }
        onSubmit(prompt)
    }

    private func commandTint(_ command: String) -> Color {
        if command.contains("日报") || command.contains("项目") {
            return AITheme.ColorToken.primary
        }
        return AITheme.ColorToken.ai
    }

    private func commandSurface(_ command: String) -> Color {
        if command.contains("日报") || command.contains("项目") {
            return AITheme.ColorToken.primarySurface
        }
        return AITheme.ColorToken.aiSurface
    }
}

private struct CalendarAssistantResultCard: View {
    let reply: CalendarAssistantReply
    let onAction: (CalendarAssistantActionKind) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
            HStack(alignment: .top, spacing: AITheme.Spacing.xs) {
                Image(systemName: "sparkles")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AITheme.ColorToken.ai)
                    .frame(width: 28, height: 28)
                    .background(AITheme.ColorToken.aiSurface)
                    .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))

                VStack(alignment: .leading, spacing: 3) {
                    Text(reply.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AITheme.ColorToken.ink900)
                    Text(reply.message)
                        .font(AITheme.Typography.footnote)
                        .foregroundStyle(AITheme.ColorToken.ink700)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            ForEach(reply.actions) { action in
                Button {
                    onAction(action)
                } label: {
                    HStack(spacing: AITheme.Spacing.xs) {
                        Image(systemName: action.systemImage)
                            .foregroundStyle(action.tint)
                        Text(action.title)
                            .foregroundStyle(AITheme.ColorToken.ink900)
                            .lineLimit(1)
                            .minimumScaleFactor(0.82)
                        Spacer(minLength: AITheme.Spacing.xs)
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(AITheme.ColorToken.textTertiary)
                    }
                    .font(.footnote.weight(.semibold))
                    .frame(minHeight: 34)
                    .padding(.horizontal, AITheme.Spacing.sm)
                    .background(AITheme.ColorToken.surface)
                    .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(AITheme.Spacing.sm)
        .background(AITheme.ColorToken.aiSurface)
        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous)
                .stroke(AITheme.ColorToken.aiSoft, lineWidth: 0.5)
        }
    }
}

private struct CalendarWeekOverviewCard: View {
    let rangeTitle: String
    let onPrevious: () -> Void
    let onCurrent: () -> Void
    let onNext: () -> Void
    let days: [CalendarMobileDayItem]
    let onSelect: (Date) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
            HStack(spacing: AITheme.Spacing.xs) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("本周节奏")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(AITheme.ColorToken.ink900)
                    Text(rangeTitle)
                        .font(AITheme.Typography.footnote)
                        .foregroundStyle(AITheme.ColorToken.textSecondary)
                }

                Spacer(minLength: AITheme.Spacing.xs)

                CalendarWeekNavButton(systemImage: "chevron.left", accessibilityLabel: "上一周", action: onPrevious)

                Button("本周", action: onCurrent)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(AITheme.ColorToken.primary)
                    .frame(minHeight: 34)
                    .padding(.horizontal, AITheme.Spacing.sm)
                    .background(AITheme.ColorToken.primarySurface)
                    .clipShape(Capsule())
                    .buttonStyle(.plain)

                CalendarWeekNavButton(systemImage: "chevron.right", accessibilityLabel: "下一周", action: onNext)
            }

            CalendarMobileWeekStrip(days: days, onSelect: onSelect)
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

private struct CalendarWeekNavButton: View {
    let systemImage: String
    let accessibilityLabel: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.caption.weight(.semibold))
                .foregroundStyle(AITheme.ColorToken.ink800)
                .frame(width: 34, height: 34)
                .background(AITheme.ColorToken.surface)
                .clipShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel)
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
            HStack(spacing: 6) {
                ForEach(days) { day in
                    Button {
                        onSelect(day.date)
                    } label: {
                        CalendarMobileDayChip(day: day)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 2)
            .padding(.trailing, AITheme.Spacing.xs)
            .padding(.vertical, 2)
        }
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
                        .offset(x: 6, y: -4)
                }
            }

            Text(statusLine)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(statusLineTint)
                .lineLimit(1)
                .minimumScaleFactor(0.68)
                .frame(maxWidth: .infinity)

            Capsule()
                .fill(day.status.tint)
                .frame(width: 18, height: 4)
        }
        .frame(width: 56, height: 86)
        .background(day.isSelected ? AITheme.ColorToken.primarySurface : AITheme.ColorToken.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous)
                .stroke(day.isToday ? AITheme.ColorToken.primary : AITheme.ColorToken.separator, lineWidth: day.isToday ? 1.3 : 0.5)
        }
        .accessibilityLabel("\(formatShortDate(day.date))，\(formatWeekday(day.date))，\(day.status.title)，\(statusLine)")
    }

    private var statusLine: String {
        if day.isFuture {
            return day.filledCount > 0 ? "计划 \(day.filledCount)" : "未计划"
        }
        if day.missingCount > 0 {
            return "缺 \(day.missingCount)"
        }
        if day.totalCount > 0 {
            return "填 \(day.filledCount)/\(day.totalCount)"
        }
        if day.filledCount > 0 {
            return "已填"
        }
        return "无数据"
    }

    private var statusLineTint: Color {
        if day.riskCount > 0 {
            return AITheme.ColorToken.danger
        }
        if day.missingCount > 0 {
            return AITheme.ColorToken.warning
        }
        if day.filledCount > 0 {
            return AITheme.ColorToken.success
        }
        return AITheme.ColorToken.textSecondary
    }
}

private struct CalendarPriorityDateList: View {
    let days: [CalendarMobileDayItem]
    let isManager: Bool
    @Binding var showsAllDays: Bool
    let onShowDetail: (String) -> Void
    let onCreateReport: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(sectionTitle)
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(AITheme.ColorToken.ink900)
                    Text(sectionSubtitle)
                        .font(AITheme.Typography.footnote)
                        .foregroundStyle(AITheme.ColorToken.textSecondary)
                }

                Spacer(minLength: AITheme.Spacing.xs)

                if !regularDays.isEmpty {
                    Button(showsAllDays ? "收起" : "查看全部") {
                        withAnimation(.snappy(duration: 0.22)) {
                            showsAllDays.toggle()
                        }
                    }
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(AITheme.ColorToken.primary)
                    .padding(.vertical, 8)
                    .padding(.horizontal, AITheme.Spacing.sm)
                    .background(AITheme.ColorToken.primarySurface)
                    .clipShape(Capsule())
                }
            }

            if displayDays.isEmpty {
                CalendarWeekEmptyState(isManager: isManager)
            }

            ForEach(displayDays) { day in
                CalendarMobileDateCard(
                    day: day,
                    isEmphasized: priorityDayIds.contains(day.id),
                    showsCreateAction: !isManager && day.isFuture,
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

    private var priorityDays: [CalendarMobileDayItem] {
        if isManager {
            return Array(
                days
                    .filter { $0.riskCount > 0 || $0.missingCount > 0 }
                    .sorted { lhs, rhs in
                        if lhs.riskCount != rhs.riskCount {
                            return lhs.riskCount > rhs.riskCount
                        }
                        if lhs.missingCount != rhs.missingCount {
                            return lhs.missingCount > rhs.missingCount
                        }
                        if lhs.isToday != rhs.isToday {
                            return lhs.isToday
                        }
                        return lhs.date < rhs.date
                    }
                    .prefix(3)
            )
        }

        var result: [CalendarMobileDayItem] = []

        if let today = days.first(where: \.isToday) {
            result.append(today)
        }

        let abnormalDays = days.filter { day in
            day.riskCount > 0 || day.isSelected
        }
        result.append(contentsOf: abnormalDays)

        if result.isEmpty, let selected = days.first(where: \.isSelected) ?? days.first {
            result.append(selected)
        }

        var seen = Set<String>()
        return result.filter { day in
            guard !seen.contains(day.id) else {
                return false
            }
            seen.insert(day.id)
            return true
        }
    }

    private var regularDays: [CalendarMobileDayItem] {
        let ids = Set(priorityDays.map(\.id))
        return days.filter { !ids.contains($0.id) }
    }

    private var displayDays: [CalendarMobileDayItem] {
        showsAllDays ? priorityDays + regularDays : priorityDays
    }

    private var priorityDayIds: Set<String> {
        Set(priorityDays.map(\.id))
    }

    private var sectionTitle: String {
        isManager ? "重点日期" : "本周重点"
    }

    private var sectionSubtitle: String {
        if isManager {
            return priorityDays.isEmpty ? "暂无风险或缺填" : "只展示风险最高或缺填最多的 3 天"
        }
        return "默认只显示今天、选中日期和有风险的日期"
    }
}

private struct CalendarMobileDateCard: View {
    let day: CalendarMobileDayItem
    let isEmphasized: Bool
    let showsCreateAction: Bool
    let onShowDetail: () -> Void
    let onCreateReport: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.xs) {
            Button(action: onShowDetail) {
                HStack(alignment: .center, spacing: AITheme.Spacing.sm) {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: AITheme.Spacing.xs) {
                            Text("\(formatShortDate(day.date)) \(formatWeekday(day.date))")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(AITheme.ColorToken.ink900)

                            if day.isToday {
                                Text("今天")
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(AITheme.ColorToken.primary)
                                    .padding(.vertical, 3)
                                    .padding(.horizontal, 6)
                                    .background(AITheme.ColorToken.primarySurface)
                                    .clipShape(Capsule())
                            }
                        }

                        Text(day.summaryText)
                            .font(AITheme.Typography.footnote)
                            .foregroundStyle(AITheme.ColorToken.textSecondary)
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)

                        CalendarProgressBar(progress: day.progress, tint: day.status.tint)
                    }

                    Spacer(minLength: AITheme.Spacing.xs)

                    VStack(alignment: .trailing, spacing: 7) {
                        Text(day.status.title)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(day.status.tint)
                            .padding(.vertical, 5)
                            .padding(.horizontal, 8)
                            .background(day.status.surface)
                            .clipShape(Capsule())

                        Label(day.riskCount > 0 ? "风险" : "查看", systemImage: "chevron.right")
                            .labelStyle(.titleAndIcon)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(day.riskCount > 0 ? AITheme.ColorToken.danger : AITheme.ColorToken.primary)
                    }
                    .fixedSize(horizontal: true, vertical: false)
                }
            }
            .buttonStyle(.plain)

            if showsCreateAction {
                Button(action: onCreateReport) {
                    Label("填写计划", systemImage: "square.and.pencil")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(AITheme.ColorToken.primary)
                        .frame(maxWidth: .infinity, minHeight: 36)
                        .background(AITheme.ColorToken.primarySurface)
                        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(AITheme.Spacing.sm)
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous)
                .stroke(cardStroke, lineWidth: day.isSelected || isEmphasized ? 1 : 0.5)
        }
        .overlay(alignment: .leading) {
            if let accentColor {
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .fill(accentColor)
                    .frame(width: 4)
                    .padding(.vertical, 12)
                    .padding(.leading, 1)
            }
        }
    }

    private var cardBackground: Color {
        if day.isSelected {
            return AITheme.ColorToken.primarySurface
        }
        return AITheme.ColorToken.cardBackground
    }

    private var cardStroke: Color {
        if day.isSelected {
            return AITheme.ColorToken.primary
        }
        return AITheme.ColorToken.separator
    }

    private var accentColor: Color? {
        guard isEmphasized, !day.isSelected else {
            return nil
        }
        if day.riskCount > 0 {
            return AITheme.ColorToken.danger
        }
        if day.missingCount > 0 {
            return AITheme.ColorToken.warning
        }
        return nil
    }
}

private struct CalendarRiskSignalPreviewList: View {
    let days: [CalendarMobileDayItem]
    let onOpenDate: (String) -> Void

    var body: some View {
        if !riskDays.isEmpty {
            VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("最近风险记录")
                            .font(.headline.weight(.semibold))
                            .foregroundStyle(AITheme.ColorToken.ink900)
                        Text("按本周风险日期聚合，点击进入当天详情。")
                            .font(AITheme.Typography.footnote)
                            .foregroundStyle(AITheme.ColorToken.textSecondary)
                    }

                    Spacer(minLength: AITheme.Spacing.xs)

                    Text("\(riskDays.reduce(0) { $0 + $1.riskCount }) 条")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(AITheme.ColorToken.danger)
                        .padding(.vertical, 5)
                        .padding(.horizontal, 8)
                        .background(AITheme.ColorToken.dangerSurface)
                        .clipShape(Capsule())
                }

                VStack(spacing: AITheme.Spacing.xs) {
                    ForEach(riskDays) { day in
                        Button {
                            onOpenDate(day.dateKey)
                        } label: {
                            HStack(alignment: .center, spacing: AITheme.Spacing.sm) {
                                RoundedRectangle(cornerRadius: 2, style: .continuous)
                                    .fill(AITheme.ColorToken.danger)
                                    .frame(width: 4, height: 44)

                                VStack(alignment: .leading, spacing: 4) {
                                    Text("\(formatShortDate(day.date)) \(formatWeekday(day.date))")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(AITheme.ColorToken.ink900)
                                    Text(day.summaryText)
                                        .font(AITheme.Typography.footnote)
                                        .foregroundStyle(AITheme.ColorToken.textSecondary)
                                        .lineLimit(1)
                                }

                                Spacer(minLength: AITheme.Spacing.xs)

                                Text("风险 \(day.riskCount)")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(AITheme.ColorToken.danger)
                                    .padding(.vertical, 5)
                                    .padding(.horizontal, 8)
                                    .background(AITheme.ColorToken.dangerSurface)
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
                    }
                }
            }
        }
    }

    private var riskDays: [CalendarMobileDayItem] {
        Array(
            days
                .filter { $0.riskCount > 0 }
                .sorted { lhs, rhs in
                    if lhs.riskCount != rhs.riskCount {
                        return lhs.riskCount > rhs.riskCount
                    }
                    if lhs.isToday != rhs.isToday {
                        return lhs.isToday
                    }
                    return lhs.date > rhs.date
                }
                .prefix(3)
        )
    }
}

private struct CalendarRecentLogPreviewList: View {
    let logs: [WorkLog]
    let onOpenLogs: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("最近记录")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(AITheme.ColorToken.ink900)
                    Text("只保留最近 3 条，完整记录去填报记录查看。")
                        .font(AITheme.Typography.footnote)
                        .foregroundStyle(AITheme.ColorToken.textSecondary)
                }

                Spacer(minLength: AITheme.Spacing.xs)

                Button("查看全部", action: onOpenLogs)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(AITheme.ColorToken.primary)
            }

            VStack(spacing: 0) {
                if logs.isEmpty {
                    HStack(spacing: AITheme.Spacing.sm) {
                        Image(systemName: "doc.text")
                            .foregroundStyle(AITheme.ColorToken.textSecondary)
                            .frame(width: 28, height: 28)
                        Text("提交日报后，这里会显示最近记录。")
                            .font(AITheme.Typography.support)
                            .foregroundStyle(AITheme.ColorToken.textSecondary)
                        Spacer(minLength: 0)
                    }
                    .padding(AITheme.Spacing.sm)
                } else {
                    ForEach(Array(logs.prefix(3).enumerated()), id: \.element.id) { index, log in
                        CalendarRecentLogRow(log: log)
                            .padding(.vertical, AITheme.Spacing.sm)
                            .padding(.horizontal, AITheme.Spacing.sm)

                        if index < min(logs.count, 3) - 1 {
                            Divider()
                                .overlay(AITheme.ColorToken.separator)
                                .padding(.leading, AITheme.Spacing.sm)
                        }
                    }
                }
            }
            .background(AITheme.ColorToken.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous)
                    .stroke(AITheme.ColorToken.separator, lineWidth: 0.5)
            }
        }
    }
}

private struct CalendarRecentLogRow: View {
    let log: WorkLog

    var body: some View {
        HStack(alignment: .center, spacing: AITheme.Spacing.sm) {
            VStack(alignment: .leading, spacing: 4) {
                Text(log.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AITheme.ColorToken.ink900)
                    .lineLimit(1)

                HStack(spacing: AITheme.Spacing.xs) {
                    Text(String(log.date.prefix(10)))
                    Text("\(log.hoursText)h")
                    if let project = log.project?.displayName, !project.isEmpty {
                        Text(project)
                            .lineLimit(1)
                    }
                }
                .font(AITheme.Typography.footnote)
                .foregroundStyle(AITheme.ColorToken.textSecondary)
            }

            Spacer(minLength: AITheme.Spacing.xs)

            Text(workLogHasRisk(log) ? "风险" : log.status.title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(workLogHasRisk(log) ? AITheme.ColorToken.danger : log.status.badgeTint)
                .padding(.vertical, 5)
                .padding(.horizontal, 8)
                .background(workLogHasRisk(log) ? AITheme.ColorToken.dangerSurface : log.status.badgeTint.opacity(0.1))
                .clipShape(Capsule())
        }
    }
}

private func workLogHasRisk(_ log: WorkLog) -> Bool {
    !(log.aiAnalysis?.risks.isEmpty ?? true) || !(log.aiAnalysis?.blockers.isEmpty ?? true)
}

private struct CalendarWeekEmptyState: View {
    let isManager: Bool

    var body: some View {
        HStack(spacing: AITheme.Spacing.sm) {
            Image(systemName: "checkmark.seal.fill")
                .foregroundStyle(AITheme.ColorToken.success)
                .frame(width: 28, height: 28)
                .background(AITheme.ColorToken.successSurface)
                .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))
            Text(isManager ? "本周暂无风险或缺填，继续关注每日填报节奏。" : "本周暂无风险，今天完成填报即可。")
                .font(AITheme.Typography.support)
                .foregroundStyle(AITheme.ColorToken.textSecondary)
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
                    Picker("周期", selection: $period) {
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
                            tint: summary.riskCount > 0 ? AITheme.ColorToken.danger : AITheme.ColorToken.ink500
                        )
                        CalendarAnalysisInfoRow(
                            title: "人员状态",
                            value: summary.peopleStatus,
                            systemImage: "person.2.fill",
                            tint: summary.missingCount > 0 ? AITheme.ColorToken.warning : AITheme.ColorToken.ink500
                        )
                        CalendarAnalysisInfoRow(
                            title: "项目进展",
                            value: projectText,
                            systemImage: "folder.fill",
                            tint: viewModel.riskDayCount > 0 ? AITheme.ColorToken.warning : AITheme.ColorToken.ink500
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
                                title: "查看缺填成员",
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
            .navigationTitle("周期判断")
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
                Section("今日判断") {
                    ForEach(detailInsights(detail), id: \.self) { insight in
                        HStack(alignment: .top, spacing: AITheme.Spacing.xs) {
                            Image(systemName: "sparkles")
                                .font(.callout)
                                .foregroundStyle(insightTint(insight))
                                .padding(.top, 2)
                            Text(insight)
                                .font(.callout)
                                .foregroundStyle(AITheme.ColorToken.ink700)
                        }
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
        .appTabBarContentInset(AITheme.Spacing.md)
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
            insights.append("发现 \(stats.riskCount) 个风险信号，建议优先查看风险日志。")
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
