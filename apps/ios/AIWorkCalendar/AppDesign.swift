import SwiftUI
#if os(iOS)
import UIKit
#endif

private extension Color {
    static func hex(_ value: UInt) -> Color {
        Color(
            red: Double((value >> 16) & 0xff) / 255,
            green: Double((value >> 8) & 0xff) / 255,
            blue: Double(value & 0xff) / 255
        )
    }

    static func viDynamic(light: UInt, dark: UInt) -> Color {
        #if os(iOS)
        Color(UIColor { traits in
            UIColor(
                red: CGFloat(((traits.userInterfaceStyle == .dark ? dark : light) >> 16) & 0xff) / 255,
                green: CGFloat(((traits.userInterfaceStyle == .dark ? dark : light) >> 8) & 0xff) / 255,
                blue: CGFloat((traits.userInterfaceStyle == .dark ? dark : light) & 0xff) / 255,
                alpha: 1
            )
        })
        #else
        Color.hex(light)
        #endif
    }
}

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
        static let lg: CGFloat = 16
        static let xl: CGFloat = 20
    }

    enum ColorToken {
        static let primary = Color.hex(0x0B57D0)
        static let primaryHover = Color.hex(0x1A73E8)
        static let primarySoft = Color.viDynamic(light: 0xD3E3FD, dark: 0x12315E)
        static let primarySurface = Color.viDynamic(light: 0xEEF5FF, dark: 0x0D1B2E)

        static let ai = Color.hex(0x0F766E)
        static let aiHover = Color.hex(0x14A39A)
        static let aiSoft = Color.viDynamic(light: 0xCCFBF1, dark: 0x123D39)
        static let aiSurface = Color.viDynamic(light: 0xECFDF9, dark: 0x0D2422)

        static let success = Color.hex(0x16A34A)
        static let successSoft = Color.viDynamic(light: 0xDCFCE7, dark: 0x12351F)
        static let successSurface = Color.viDynamic(light: 0xF0FDF4, dark: 0x0D1F13)

        static let warning = Color.hex(0xD97706)
        static let warningSoft = Color.viDynamic(light: 0xFEF3C7, dark: 0x4A2F0D)
        static let warningSurface = Color.viDynamic(light: 0xFFFBEB, dark: 0x2B1D0B)

        static let danger = Color.hex(0xDC2626)
        static let dangerSoft = Color.viDynamic(light: 0xFEE2E2, dark: 0x4A1616)
        static let dangerSurface = Color.viDynamic(light: 0xFEF2F2, dark: 0x2A1010)

        static let ink900 = Color.viDynamic(light: 0x111827, dark: 0xF9FAFB)
        static let ink800 = Color.viDynamic(light: 0x1F2937, dark: 0xF3F4F6)
        static let ink700 = Color.viDynamic(light: 0x374151, dark: 0xE5E7EB)
        static let ink500 = Color.viDynamic(light: 0x6B7280, dark: 0xAAB2C0)
        static let ink400 = Color.viDynamic(light: 0x9CA3AF, dark: 0x7D8796)
        static let line = Color.viDynamic(light: 0xE5E7EB, dark: 0x2D333B)
        static let surface = Color.viDynamic(light: 0xF8FAFC, dark: 0x0B0F14)
        static let surfaceRaised = Color.viDynamic(light: 0xF3F6FA, dark: 0x111827)
        static let panel = Color.viDynamic(light: 0xFFFFFF, dark: 0x161B22)

        static let brand = primary
        static let brandSecondary = aiHover
        static let accentBlue = primaryHover
        static let appBackgroundLight = Color.hex(0xF8FAFC)
        static let cardBackgroundLight = Color.white
        static let activeBackgroundLight = Color.hex(0xF3F6FA)
        static let textSecondary = ink500
        static let textTertiary = ink400
        static let cardShadow = Color.black.opacity(0.04)

        static var appBackground: Color {
            surface
        }

        static var cardBackground: Color {
            panel
        }

        static var activeBackground: Color {
            surfaceRaised
        }

        static var separator: Color {
            line
        }
    }

    enum Typography {
        static let eyebrow = Font.footnote.weight(.semibold)
        static let title = Font.system(size: 34, weight: .bold, design: .default)
        static let pageTitle = Font.system(size: 28, weight: .semibold, design: .default)
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
            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous)
                    .stroke(AITheme.ColorToken.separator, lineWidth: 0.5)
            }
            .shadow(color: AITheme.ColorToken.cardShadow, radius: 10, x: 0, y: 3)
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
                    .foregroundStyle(AITheme.ColorToken.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct CompactAIActionPanel: View {
    private enum EvidenceTone {
        case ai
        case warning
        case danger
    }

    let title: String
    let conclusion: String
    let risk: String
    let actionTitle: String?
    let systemImage: String
    let action: (() -> Void)?

    init(
        title: String = "AI 洞察",
        conclusion: String,
        risk: String,
        actionTitle: String? = nil,
        systemImage: String = "sparkles",
        action: (() -> Void)? = nil
    ) {
        self.title = title
        self.conclusion = conclusion
        self.risk = risk
        self.actionTitle = actionTitle
        self.systemImage = systemImage
        self.action = action
    }

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
            Label(title, systemImage: systemImage)
                .font(AITheme.Typography.eyebrow)
                .foregroundStyle(AITheme.ColorToken.ai)

            HStack(alignment: .top, spacing: AITheme.Spacing.sm) {
                Image(systemName: evidenceIcon)
                    .font(.headline)
                    .foregroundStyle(evidenceTint)
                    .frame(width: 28, height: 28)
                    .background(evidenceTint.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))

                VStack(alignment: .leading, spacing: AITheme.Spacing.xxs) {
                    Text(conclusion)
                        .font(.headline)
                        .foregroundStyle(AITheme.ColorToken.ink900)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(risk)
                        .font(AITheme.Typography.support)
                        .foregroundStyle(evidenceTextTint)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 0)
            }

            if let actionTitle, let action {
                Button(action: action) {
                    Label(actionTitle, systemImage: "arrow.right")
                        .font(.footnote.weight(.semibold))
                }
                .buttonStyle(.borderless)
                .foregroundStyle(AITheme.ColorToken.ai)
            }
        }
        .padding(AITheme.Spacing.md)
        .background(AITheme.ColorToken.aiSurface)
        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: AITheme.Radius.lg, style: .continuous)
                .stroke(AITheme.ColorToken.aiSoft, lineWidth: 0.5)
        }
    }

    private var evidenceTint: Color {
        switch evidenceTone {
        case .ai:
            return AITheme.ColorToken.ai
        case .warning:
            return AITheme.ColorToken.warning
        case .danger:
            return AITheme.ColorToken.danger
        }
    }

    private var evidenceTextTint: Color {
        evidenceTone == .ai ? AITheme.ColorToken.textSecondary : evidenceTint
    }

    private var evidenceTone: EvidenceTone {
        if risk.contains("暂无") || risk.contains("稳定") || risk.contains("保持") {
            return .ai
        }
        if risk.contains("风险") || risk.contains("阻塞") || risk.contains("失败") {
            return .danger
        }
        if risk.contains("缺填") || risk.contains("临近") || risk.contains("等待") || risk.contains("未") {
            return .warning
        }
        return .ai
    }

    private var evidenceIcon: String {
        switch evidenceTone {
        case .danger:
            return "exclamationmark.triangle.fill"
        case .warning:
            return "clock.badge.exclamationmark"
        case .ai:
            return "checkmark.seal.fill"
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
                    .foregroundStyle(AITheme.ColorToken.ai)

                VStack(alignment: .leading, spacing: AITheme.Spacing.xs) {
                    ForEach(insights.prefix(3), id: \.self) { insight in
                        HStack(alignment: .top, spacing: AITheme.Spacing.xs) {
                            Circle()
                                .fill(AITheme.ColorToken.ai)
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
            .clipShape(Capsule())
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
                    .foregroundStyle(AITheme.ColorToken.textSecondary)
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
    @Environment(\.isEnabled) private var isEnabled

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
            .foregroundStyle(isEnabled ? .white : AITheme.ColorToken.primary)
            .frame(maxWidth: .infinity, minHeight: AITheme.Layout.minTouchTarget + 10)
            .background(isEnabled ? AITheme.ColorToken.primary : AITheme.ColorToken.primarySoft)
            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(isLoading)
    }
}

extension View {
    @ViewBuilder
    func compactNavigationTitle() -> some View {
        #if os(iOS)
        self.navigationBarTitleDisplayMode(.inline)
        #else
        self
        #endif
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
            return AITheme.ColorToken.ink500
        case .submitted:
            return AITheme.ColorToken.success
        }
    }
}

extension ProjectStatus {
    var badgeTint: Color {
        switch self {
        case .active:
            return AITheme.ColorToken.success
        case .paused:
            return AITheme.ColorToken.warning
        case .archived:
            return AITheme.ColorToken.ink500
        }
    }
}
