import SwiftUI

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
        static var appBackground: Color {
            #if os(iOS)
            Color(.systemGroupedBackground)
            #else
            Color.gray.opacity(0.08)
            #endif
        }

        static var cardBackground: Color {
            #if os(iOS)
            Color(.secondarySystemGroupedBackground)
            #else
            Color.gray.opacity(0.12)
            #endif
        }

        static var separator: Color {
            #if os(iOS)
            Color(.separator)
            #else
            Color.gray.opacity(0.22)
            #endif
        }
    }

    enum Typography {
        static let eyebrow = Font.footnote.weight(.semibold)
        static let title = Font.largeTitle.weight(.bold)
        static let section = Font.title3.weight(.semibold)
        static let body = Font.body
        static let caption = Font.caption
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
            .background(.regularMaterial)
            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.06), lineWidth: 1)
            }
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
        .background(AITheme.ColorToken.cardBackground)
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
            .background(AITheme.ColorToken.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous)
                    .strokeBorder(Color.primary.opacity(isEnabled ? 0.07 : 0), lineWidth: 1)
            }
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
            .background {
                LinearGradient(
                    colors: [AITheme.ColorToken.brand, AITheme.ColorToken.brandSecondary],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous))
            .shadow(color: AITheme.ColorToken.brand.opacity(0.22), radius: 18, x: 0, y: 10)
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
