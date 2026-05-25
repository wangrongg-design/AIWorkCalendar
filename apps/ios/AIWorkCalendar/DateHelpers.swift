import Foundation

enum CalendarDayTone: Hashable {
    case empty
    case normal
    case good
    case risk
}

struct MonthGridItem: Identifiable, Hashable {
    let id: String
    let day: Int?
    let data: CalendarDay?
    let isToday: Bool
    let tone: CalendarDayTone

    var isBlank: Bool {
        day == nil
    }
}

enum DateHelpers {
    static let weekdays = ["日", "一", "二", "三", "四", "五", "六"]

    static var dayFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }

    static var monthFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM"
        return formatter
    }

    static func dayKey(_ date: Date = Date()) -> String {
        dayFormatter.string(from: date)
    }

    static func monthKey(_ date: Date = Date()) -> String {
        monthFormatter.string(from: date)
    }

    static func addMonths(to month: String, diff: Int) -> String {
        guard let date = monthFormatter.date(from: month),
              let next = Calendar(identifier: .gregorian).date(byAdding: .month, value: diff, to: date) else {
            return month
        }
        return monthFormatter.string(from: next)
    }

    static func buildMonthGrid(month: String, days: [CalendarDay]) -> [MonthGridItem] {
        guard let firstDay = monthFormatter.date(from: month),
              let range = Calendar(identifier: .gregorian).range(of: .day, in: .month, for: firstDay) else {
            return []
        }

        let calendar = Calendar(identifier: .gregorian)
        let firstWeekday = calendar.component(.weekday, from: firstDay) - 1
        let dayMap = Dictionary(uniqueKeysWithValues: days.map { ($0.date, $0) })
        let today = dayKey()

        var items: [MonthGridItem] = (0..<firstWeekday).map { index in
            MonthGridItem(id: "blank-\(index)", day: nil, data: nil, isToday: false, tone: .empty)
        }

        for day in range {
            let key = "\(month)-\(String(format: "%02d", day))"
            let data = dayMap[key]
            let riskCount = data?.riskCount ?? 0
            let fillRate = data?.fillRate ?? 0
            let tone: CalendarDayTone
            if riskCount > 0 {
                tone = .risk
            } else if fillRate >= 80 {
                tone = .good
            } else if fillRate > 0 {
                tone = .normal
            } else {
                tone = .empty
            }
            items.append(MonthGridItem(id: key, day: day, data: data, isToday: key == today, tone: tone))
        }

        return items
    }
}
