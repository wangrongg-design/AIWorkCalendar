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
}

struct CalendarDashboardView: View {
    @EnvironmentObject private var auth: AuthStore
    @StateObject private var viewModel = CalendarViewModel()

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 7)

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack {
                        Button {
                            Task { await viewModel.moveMonth(by: -1, auth: auth) }
                        } label: {
                            Image(systemName: "chevron.left")
                        }
                        .buttonStyle(.bordered)

                        Spacer()

                        Text(viewModel.month)
                            .font(.title2.weight(.semibold))

                        Spacer()

                        Button {
                            Task { await viewModel.moveMonth(by: 1, auth: auth) }
                        } label: {
                            Image(systemName: "chevron.right")
                        }
                        .buttonStyle(.bordered)
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
                                    .frame(height: 72)
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
                .padding()
            }
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
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text("\(item.day ?? 0)")
                    .font(.callout.weight(item.isToday ? .bold : .medium))
                Spacer()
                if (item.data?.riskCount ?? 0) > 0 {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.caption2)
                        .foregroundStyle(.red)
                }
            }

            Text(String(format: "%.0f%%", item.data?.fillRate ?? 0))
                .font(.caption)
                .foregroundStyle(.secondary)

            Text("\(item.data?.filledCount ?? 0)/\((item.data?.filledCount ?? 0) + (item.data?.missingCount ?? 0))")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(8)
        .frame(maxWidth: .infinity, minHeight: 72, alignment: .topLeading)
        .background(backgroundColor)
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(item.isToday ? Color.accentColor : Color.clear, lineWidth: 1.5)
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var backgroundColor: Color {
        switch item.tone {
        case .empty:
            return Color.secondary.opacity(0.08)
        case .normal:
            return Color.blue.opacity(0.12)
        case .good:
            return Color.green.opacity(0.14)
        case .risk:
            return Color.red.opacity(0.12)
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
}
