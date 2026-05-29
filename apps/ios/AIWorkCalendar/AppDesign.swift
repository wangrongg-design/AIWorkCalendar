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
        static let black = Color.viDynamic(light: 0x1A1A1A, dark: 0xF7F7F7)
        static let gray7 = Color.viDynamic(light: 0x2E2E2E, dark: 0xEDEDED)
        static let gray6 = Color.viDynamic(light: 0x424242, dark: 0xDADADA)
        static let gray5 = Color.viDynamic(light: 0x737373, dark: 0xB8B8B8)
        static let gray4 = Color.viDynamic(light: 0xA3A3A3, dark: 0x8F8F8F)
        static let gray3 = Color.viDynamic(light: 0xCCCCCC, dark: 0x666666)
        static let gray2 = Color.viDynamic(light: 0xE6E6E6, dark: 0x3A3A3A)
        static let gray1 = Color.viDynamic(light: 0xF6F6F6, dark: 0x121212)
        static let white = Color.viDynamic(light: 0xFFFFFF, dark: 0x1C1C1E)

        static let primaryPressed = Color.hex(0x0847A6)
        static let primary = Color.hex(0x0B57D0)
        static let primaryHover = Color.hex(0x1A73E8)
        static let primarySoft = Color.viDynamic(light: 0xD3E3FD, dark: 0x12315E)
        static let primarySurface = Color.viDynamic(light: 0xEEF5FF, dark: 0x0D1B2E)

        static let aiPressed = Color.hex(0x0B5F59)
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

        static let dangerPressed = Color.hex(0xC92A20)
        static let danger = Color.hex(0xEE3B2B)
        static let dangerSoft = Color.viDynamic(light: 0xFEE2E2, dark: 0x4A1616)
        static let dangerSurface = Color.viDynamic(light: 0xFEF2F2, dark: 0x2A1010)

        static let ink900 = black
        static let ink800 = gray7
        static let ink700 = gray6
        static let ink500 = gray5
        static let ink400 = gray4
        static let line = gray2
        static let surface = gray1
        static let surfaceRaised = white
        static let panel = white

        static let brand = primary
        static let brandSecondary = aiHover
        static let accentBlue = primaryHover
        static let appBackgroundLight = Color.hex(0xF6F6F6)
        static let cardBackgroundLight = Color.white
        static let activeBackgroundLight = Color.white
        static let textSecondary = ink500
        static let textTertiary = ink400
        static let disabledBackground = gray1
        static let disabledText = gray4
        static let cardShadow = Color.black.opacity(0.035)

        static let loginBackground = Color.hex(0x1A1A1A)
        static let loginFieldBackground = Color.hex(0x2E2E2E)
        static let loginFieldBorder = Color.hex(0x424242)
        static let loginText = Color.hex(0xFFFFFF)
        static let loginMuted = Color.hex(0xA3A3A3)
        static let loginSecondary = Color.hex(0x737373)
        static let loginDisabledBackground = Color.hex(0x2E2E2E)
        static let loginDisabledText = Color.hex(0xA3A3A3)
        static let loginPlaceholder = Color.hex(0x737373)

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
        static let eyebrow = Font.system(size: 13, weight: .semibold, design: .default)
        static let title = Font.system(size: 34, weight: .bold, design: .default)
        static let pageTitle = Font.system(size: 28, weight: .bold, design: .default)
        static let title2 = Font.system(size: 22, weight: .semibold, design: .default)
        static let section = Font.system(size: 20, weight: .semibold, design: .default)
        static let body = Font.system(size: 16, weight: .regular, design: .default)
        static let support = Font.system(size: 15, weight: .regular, design: .default)
        static let footnote = Font.system(size: 13, weight: .regular, design: .default)
        static let caption = Font.system(size: 12, weight: .regular, design: .default)
        static let metric = Font.system(size: 32, weight: .bold, design: .default)
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
                .foregroundStyle(AITheme.ColorToken.ink900)
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
                    .background(evidenceSurface)
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
                AIActionButton(title: actionTitle, systemImage: "arrow.right", action: action)
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

    private var evidenceSurface: Color {
        switch evidenceTone {
        case .ai:
            return AITheme.ColorToken.aiSurface
        case .warning:
            return AITheme.ColorToken.warningSurface
        case .danger:
            return AITheme.ColorToken.dangerSurface
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
        evidenceTone == .ai ? AITheme.ColorToken.textSecondary : AITheme.ColorToken.ink700
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
                                .fill(insightTint(insight))
                                .frame(width: 5, height: 5)
                                .padding(.top, 7)
                            Text(insight)
                                .font(AITheme.Typography.support)
                                .foregroundStyle(AITheme.ColorToken.ink700)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
        }
    }

    private func insightTint(_ insight: String) -> Color {
        if insight.contains("风险") || insight.contains("阻塞") || insight.contains("失败") {
            return AITheme.ColorToken.danger
        }
        if insight.contains("未") || insight.contains("待") || insight.contains("临近") || insight.contains("提醒") {
            return AITheme.ColorToken.warning
        }
        return AITheme.ColorToken.ink700
    }
}

struct FlatTag: View {
    let title: String
    let systemImage: String
    let tint: Color

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(AITheme.Typography.caption.weight(.semibold))
            .foregroundStyle(tint)
            .padding(.vertical, AITheme.Spacing.xs)
            .padding(.horizontal, AITheme.Spacing.sm)
            .background(tagSurface)
            .clipShape(Capsule())
            .lineLimit(1)
            .minimumScaleFactor(0.82)
    }

    private var tagSurface: Color {
        if title.contains("风险") || title.contains("失败") || title.contains("阻塞") {
            return AITheme.ColorToken.dangerSurface
        }
        if title.contains("未") || title.contains("待") || title.contains("临近") || title.contains("提醒") {
            return AITheme.ColorToken.warningSurface
        }
        if title.contains("已") || title.contains("完成") || title.contains("正常") {
            return AITheme.ColorToken.successSurface
        }
        if title.contains("AI") || title.contains("智能") || title.contains("洞察") || title.contains("分析") {
            return AITheme.ColorToken.aiSurface
        }
        return AITheme.ColorToken.gray1
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
        .font(AITheme.Typography.caption.weight(.semibold))
        .foregroundStyle(tint)
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
        .background(badgeSurface)
        .frame(minHeight: AITheme.Layout.minTouchTarget * 0.72)
        .clipShape(Capsule())
        .accessibilityElement(children: .combine)
    }

    private var badgeSurface: Color {
        if title.contains("风险") || title.contains("失败") || title.contains("阻塞") {
            return AITheme.ColorToken.dangerSurface
        }
        if title.contains("未") || title.contains("待") || title.contains("草稿") || title.contains("暂停") {
            return title.contains("草稿") ? AITheme.ColorToken.gray1 : AITheme.ColorToken.warningSurface
        }
        if title.contains("AI") || title.contains("分析") {
            return AITheme.ColorToken.aiSurface
        }
        if title.contains("已") || title.contains("完成") || title.contains("进行中") || title.contains("正常") {
            return AITheme.ColorToken.successSurface
        }
        return AITheme.ColorToken.gray1
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
                .background(iconSurface)
                .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption)
                    .foregroundStyle(AITheme.ColorToken.textSecondary)
                Text(value)
                    .font(.headline)
                    .foregroundStyle(AITheme.ColorToken.ink900)
            }

            Spacer(minLength: 0)
        }
        .padding(AITheme.Spacing.sm)
        .background(AITheme.ColorToken.activeBackground)
        .overlay {
            RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous)
                .stroke(AITheme.ColorToken.separator, lineWidth: 0.5)
        }
        .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
    }

    private var iconSurface: Color {
        if title.contains("风险") {
            return AITheme.ColorToken.dangerSurface
        }
        if title.contains("填报") || title.contains("完成") || title.contains("正常") {
            return AITheme.ColorToken.successSurface
        }
        if title.contains("工时") || title.contains("近") {
            return AITheme.ColorToken.gray1
        }
        return AITheme.ColorToken.primarySurface
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
            .overlay {
                RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous)
                    .stroke(AITheme.ColorToken.separator, lineWidth: 0.8)
            }
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
            .foregroundStyle(isEnabled ? .white : AITheme.ColorToken.disabledText)
            .frame(maxWidth: .infinity, minHeight: AITheme.Layout.minTouchTarget + 10)
            .background(isEnabled ? AITheme.ColorToken.primary : AITheme.ColorToken.disabledBackground)
            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous)
                    .stroke(isEnabled ? Color.clear : AITheme.ColorToken.separator, lineWidth: 0.8)
            }
        }
        .buttonStyle(.plain)
        .disabled(isLoading)
    }
}

struct SecondaryActionButton: View {
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
                } else {
                    Image(systemName: systemImage)
                    Text(title)
                }
            }
            .font(.headline)
            .foregroundStyle(isEnabled ? AITheme.ColorToken.ink900 : AITheme.ColorToken.disabledText)
            .frame(maxWidth: .infinity, minHeight: AITheme.Layout.minTouchTarget)
            .background(AITheme.ColorToken.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous)
                    .stroke(AITheme.ColorToken.separator, lineWidth: 0.8)
            }
        }
        .buttonStyle(.plain)
        .disabled(isLoading)
    }
}

struct AIActionButton: View {
    let title: String
    let systemImage: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(AITheme.ColorToken.ai)
                .padding(.vertical, AITheme.Spacing.xs)
                .padding(.horizontal, AITheme.Spacing.sm)
                .background(AITheme.ColorToken.aiSurface)
                .clipShape(Capsule())
                .overlay {
                    Capsule()
                        .stroke(AITheme.ColorToken.aiSoft, lineWidth: 0.5)
                }
        }
        .buttonStyle(.plain)
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

    @ViewBuilder
    func appTopContentInset(_ height: CGFloat = AITheme.Spacing.sm) -> some View {
        #if os(iOS)
        self.safeAreaInset(edge: .top) {
            Color.clear
                .frame(height: height)
                .accessibilityHidden(true)
        }
        #else
        self
        #endif
    }

    @ViewBuilder
    func appTabBarContentInset(_ height: CGFloat = AITheme.Spacing.lg) -> some View {
        #if os(iOS)
        self.safeAreaInset(edge: .bottom) {
            Color.clear
                .frame(height: height)
                .accessibilityHidden(true)
        }
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
