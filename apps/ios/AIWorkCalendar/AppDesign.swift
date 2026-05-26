import SwiftUI
#if os(iOS)
import UIKit
#endif

enum AITheme {
    enum Spacing {
        static let xxs: CGFloat = 4
        static let xs: CGFloat = 8
        static let sm: CGFloat = 12
        static let md: CGFloat = 16
        static let lg: CGFloat = 24
        static let xl: CGFloat = 32
        static let xxl: CGFloat = 44
    }

    enum Radius {
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 20
        static let xl: CGFloat = 28
    }

    enum ColorToken {
        static let brand = Color(red: 0.02, green: 0.46, blue: 0.62)
        static let brandSecondary = Color(red: 0.00, green: 0.62, blue: 0.55)
        static let accentBlue = Color(red: 0.10, green: 0.38, blue: 0.92)
        static let appBackgroundLight = Color(red: 0.97, green: 0.97, blue: 0.98)
        static let cardBackgroundLight = Color.white
        static let activeBackgroundLight = Color(red: 0.95, green: 0.96, blue: 0.98)

        static var appBackground: Color {
            #if os(iOS)
            Color(UIColor { traits in
                traits.userInterfaceStyle == .dark
                    ? UIColor.black
                    : UIColor(red: 0.97, green: 0.97, blue: 0.98, alpha: 1)
            })
            #else
            appBackgroundLight
            #endif
        }

        static var cardBackground: Color {
            #if os(iOS)
            Color(UIColor { traits in
                traits.userInterfaceStyle == .dark
                    ? UIColor(red: 0.07, green: 0.07, blue: 0.08, alpha: 1)
                    : UIColor.white
            })
            #else
            cardBackgroundLight
            #endif
        }

        static var activeBackground: Color {
            #if os(iOS)
            Color(UIColor { traits in
                traits.userInterfaceStyle == .dark
                    ? UIColor(red: 0.11, green: 0.11, blue: 0.12, alpha: 1)
                    : UIColor(red: 0.95, green: 0.96, blue: 0.98, alpha: 1)
            })
            #else
            activeBackgroundLight
            #endif
        }

        static var separator: Color {
            #if os(iOS)
            Color(.separator).opacity(0.34)
            #else
            Color.gray.opacity(0.16)
            #endif
        }
    }

    enum Typography {
        static let eyebrow = Font.footnote.weight(.semibold)
        static let title = Font.system(size: 34, weight: .bold, design: .default)
        static let pageTitle = Font.system(size: 26, weight: .semibold, design: .default)
        static let section = Font.system(size: 20, weight: .semibold, design: .default)
        static let body = Font.system(size: 16, weight: .regular, design: .default)
        static let support = Font.system(size: 14, weight: .regular, design: .default)
        static let caption = Font.system(size: 13, weight: .regular, design: .default)
    }

    enum Layout {
        static let minTouchTarget: CGFloat = 44
        static let maxReadableWidth: CGFloat = 560
    }
}

struct BrandedCard<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        content
            .padding(AITheme.Spacing.md)
            .background(AITheme.ColorToken.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))
    }
}

struct SectionTitle: View {
    let title: String
    let subtitle: String?

    init(_ title: String, subtitle: String? = nil) {
        self.title = title
        self.subtitle = subtitle
    }

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.xxs) {
            Text(title)
                .font(AITheme.Typography.section)
            if let subtitle {
                Text(subtitle)
                    .font(AITheme.Typography.support)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct AIInsightPanel: View {
    let title: String
    let insights: [String]

    var body: some View {
        BrandedCard {
            VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
                Label(title, systemImage: "sparkles")
                    .font(.headline)
                    .foregroundStyle(AITheme.ColorToken.brand)

                VStack(alignment: .leading, spacing: AITheme.Spacing.xs) {
                    ForEach(insights.prefix(3), id: \.self) { insight in
                        HStack(alignment: .top, spacing: AITheme.Spacing.xs) {
                            Circle()
                                .fill(AITheme.ColorToken.brand)
                                .frame(width: 5, height: 5)
                                .padding(.top, 7)
                            Text(insight)
                                .font(AITheme.Typography.support)
                                .foregroundStyle(.primary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
        }
    }
}

struct FlatTag: View {
    let title: String
    let systemImage: String
    let tint: Color

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.caption.weight(.medium))
            .foregroundStyle(tint)
            .padding(.vertical, AITheme.Spacing.xs)
            .padding(.horizontal, AITheme.Spacing.sm)
            .background(tint.opacity(0.10))
            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))
            .lineLimit(1)
            .minimumScaleFactor(0.82)
    }
}

struct StatusBadge: View {
    let title: String
    let systemImage: String?
    let tint: Color

    var body: some View {
        HStack(spacing: 4) {
            if let systemImage {
                Image(systemName: systemImage)
            }
            Text(title)
        }
        .font(.caption.weight(.medium))
        .foregroundStyle(tint)
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
        .background(tint.opacity(0.12))
        .frame(minHeight: AITheme.Layout.minTouchTarget * 0.72)
        .clipShape(Capsule())
        .accessibilityElement(children: .combine)
    }
}

struct MetricTile: View {
    let title: String
    let value: String
    let systemImage: String
    let tint: Color

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: systemImage)
                .font(.headline)
                .foregroundStyle(tint)
                .frame(width: 28, height: 28)
                .background(tint.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(.headline)
                    .foregroundStyle(.primary)
            }

            Spacer(minLength: 0)
        }
        .padding(AITheme.Spacing.sm)
        .background(AITheme.ColorToken.activeBackground)
        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
    }
}

struct AITextFieldStyle: TextFieldStyle {
    @Environment(\.isEnabled) private var isEnabled

    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .font(AITheme.Typography.body)
            .padding(.horizontal, AITheme.Spacing.md)
            .padding(.vertical, AITheme.Spacing.sm)
            .frame(minHeight: AITheme.Layout.minTouchTarget + 8)
            .background(AITheme.ColorToken.activeBackground)
            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
    }
}

struct PrimaryActionButton: View {
    let title: String
    let systemImage: String
    let isLoading: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: AITheme.Spacing.xs) {
                if isLoading {
                    ProgressView()
                        .tint(.white)
                } else {
                    Image(systemName: systemImage)
                    Text(title)
                }
            }
            .font(.headline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: AITheme.Layout.minTouchTarget + 10)
            .background(AITheme.ColorToken.brand)
            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(isLoading)
    }
}

struct EmptyListView: View {
    let title: String
    let message: String
    let systemImage: String

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: systemImage)
        } description: {
            Text(message)
        }
    }
}

extension WorkLogStatus {
    var badgeTint: Color {
        switch self {
        case .draft:
            return .orange
        case .submitted:
            return .green
        }
    }
}

extension ProjectStatus {
    var badgeTint: Color {
        switch self {
        case .active:
            return .green
        case .paused:
            return .orange
        case .archived:
            return .secondary
        }
    }
}
