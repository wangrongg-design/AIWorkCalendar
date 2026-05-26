import SwiftUI
#if os(iOS)
import UIKit
#endif

struct LoginView: View {
    @EnvironmentObject private var auth: AuthStore
    @State private var tenantCode = ""
    @State private var account = ""
    @State private var password = ""
    @State private var showsTenantCode = false
    @State private var requiresTenantCode = false
    @State private var isLoggingIn = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ZStack {
                LoginBackground()

                ScrollView {
                    VStack(alignment: .leading, spacing: AITheme.Spacing.xl) {
                        LoginBrandMark()
                            .padding(.top, AITheme.Spacing.md)

                        LoginHero()

                        VStack(alignment: .leading, spacing: AITheme.Spacing.md) {
                            VStack(alignment: .leading, spacing: AITheme.Spacing.xxs) {
                                Text("企业账号登录")
                                    .font(AITheme.Typography.section)
                                Text("输入邮箱或手机号和密码进入工作日历。")
                                    .font(.footnote)
                                    .foregroundStyle(AITheme.ColorToken.textSecondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }

                            VStack(spacing: AITheme.Spacing.sm) {
                                TextField("邮箱或手机号", text: $account)
                                    .textFieldStyle(LoginFlatTextFieldStyle())
                                    .emailInputTraits()
                                    .textContentType(.username)
                                    .submitLabel(.next)

                                SecureField("密码", text: $password)
                                    .textFieldStyle(LoginFlatTextFieldStyle())
                                    .textContentType(.password)
                                    .submitLabel(.go)
                                    .onSubmit {
                                        guard canLogin else { return }
                                        Task { await login() }
                                    }

                                TenantCodeAdvancedField(
                                    tenantCode: $tenantCode,
                                    isExpanded: $showsTenantCode,
                                    isRequired: requiresTenantCode
                                )
                            }

                            if let errorMessage {
                                Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                                    .font(.footnote)
                                    .foregroundStyle(AITheme.ColorToken.danger)
                                    .padding(AITheme.Spacing.sm)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(AITheme.ColorToken.dangerSurface)
                                    .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))
                                    .transition(.opacity.combined(with: .move(edge: .top)))
                            }

                            LoginFlatActionButton(title: "登录", systemImage: "arrow.right", isLoading: isLoggingIn, isEnabled: canLogin) {
                                Task { await login() }
                            }
                            .accessibilityHint("登录到 AI 工作日历")
                        }

                        LoginCapabilities()

                        LoginFooter()
                            .padding(.top, AITheme.Spacing.md)
                    }
                    .frame(maxWidth: AITheme.Layout.maxReadableWidth)
                    .padding(.horizontal, AITheme.Spacing.lg)
                    .padding(.bottom, AITheme.Spacing.xxl)
                    .frame(maxWidth: .infinity)
                }
            }
            .loginNavigationChrome()
            .animation(.snappy, value: errorMessage)
        }
    }

    private var canLogin: Bool {
        !account.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !password.isEmpty
            && (!requiresTenantCode || !tenantCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    private func login() async {
        guard canLogin else {
            errorMessage = requiresTenantCode ? "请填写企业代码后重试" : "请填写邮箱或手机号和密码"
            return
        }
        isLoggingIn = true
        defer { isLoggingIn = false }
        do {
            try await auth.login(account: account, password: password, tenantCode: tenantCode)
        } catch {
            let message = error.localizedDescription
            if message.contains("多个企业") || message.contains("企业代码") {
                requiresTenantCode = true
                showsTenantCode = true
                errorMessage = "该账号存在于多个企业，请填写企业代码后重试。"
            } else {
                errorMessage = message
            }
        }
    }
}

private struct LoginBackground: View {
    var body: some View {
        ZStack {
            AITheme.ColorToken.appBackground
                .ignoresSafeArea()

            LinearGradient(
                colors: [
                    AITheme.ColorToken.primarySurface,
                    Color.clear,
                    Color.clear
                ],
                startPoint: .top,
                endPoint: .center
            )
            .ignoresSafeArea()
            .allowsHitTesting(false)
        }
    }
}

private struct LoginBrandMark: View {
    var body: some View {
        HStack(spacing: AITheme.Spacing.xs) {
            Image("SevenAILogo")
                .resizable()
                .scaledToFit()
                .frame(width: 72, height: 24, alignment: .leading)
                .opacity(0.72)

            Spacer(minLength: 0)
        }
        .accessibilityLabel("七数智联 AI 工作日历")
    }
}

private struct LoginHero: View {
    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
            Text("AI 工作日历")
                .font(AITheme.Typography.title)
                .foregroundStyle(.primary)
                .minimumScaleFactor(0.75)
                .accessibilityAddTraits(.isHeader)

            Text("每日填报、团队看板和智能汇报，保持在同一个清晰节奏里。")
                .font(.body)
                .foregroundStyle(AITheme.ColorToken.textSecondary)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct LoginCapabilities: View {
    private let items = [
        ("自动生成日报", "sparkles", AITheme.ColorToken.ai),
        ("分析延期风险", "exclamationmark.triangle", AITheme.ColorToken.warning),
        ("汇总团队进度", "chart.bar.xaxis", AITheme.ColorToken.primaryHover)
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
            Text("登录后，AI 会主动整理工作信号")
                .font(.subheadline.weight(.semibold))
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: AITheme.Spacing.xs), count: 3), spacing: AITheme.Spacing.xs) {
                ForEach(items, id: \.0) { item in
                    FlatTag(title: item.0, systemImage: item.1, tint: item.2)
                        .frame(maxWidth: .infinity)
                }
            }
        }
    }
}

private struct LoginFooter: View {
    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.xs) {
            Text("“\(AppConfig.businessQuote)”")
                .font(.footnote)
                .foregroundStyle(AITheme.ColorToken.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Text("— \(AppConfig.businessQuoteAuthor)")
                .font(.caption)
                .foregroundStyle(AITheme.ColorToken.textTertiary)

            VStack(alignment: .leading, spacing: AITheme.Spacing.xxs) {
                Text(AppConfig.companyName)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AITheme.ColorToken.textSecondary)
                Text(AppConfig.productLine)
                    .font(.caption2)
                    .foregroundStyle(AITheme.ColorToken.textTertiary)
            }
            .padding(.top, AITheme.Spacing.xs)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

private struct TenantCodeAdvancedField: View {
    @Binding var tenantCode: String
    @Binding var isExpanded: Bool
    let isRequired: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.xs) {
            Button {
                withAnimation(.snappy) {
                    isExpanded.toggle()
                }
            } label: {
                HStack(spacing: AITheme.Spacing.xs) {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.caption.weight(.semibold))
                    Text(isRequired ? "需要企业代码" : "高级选项")
                    Spacer(minLength: 0)
                }
                .font(.footnote.weight(.semibold))
                .foregroundStyle(isRequired ? AITheme.ColorToken.warning : AITheme.ColorToken.textSecondary)
            }
            .buttonStyle(.plain)

            if isExpanded {
                VStack(alignment: .leading, spacing: AITheme.Spacing.xs) {
                    TextField("企业代码", text: $tenantCode)
                        .textFieldStyle(LoginFlatTextFieldStyle())
                        .plainInputTraits()
                        .textContentType(.organizationName)
                        .submitLabel(.next)

                    Text(isRequired ? "该账号属于多个企业，请填写企业代码。": "仅在同一账号加入多个企业或调试时使用。")
                        .font(.caption)
                        .foregroundStyle(isRequired ? AITheme.ColorToken.warning : AITheme.ColorToken.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .accessibilityElement(children: .contain)
    }
}

private struct LoginFlatTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .font(AITheme.Typography.body)
            .padding(.horizontal, AITheme.Spacing.md)
            .frame(minHeight: AITheme.Layout.minTouchTarget + 10)
            .background(AITheme.ColorToken.activeBackground)
            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
    }
}

private struct LoginFlatActionButton: View {
    let title: String
    let systemImage: String
    let isLoading: Bool
    let isEnabled: Bool
    let action: () -> Void

    var body: some View {
        Button {
            guard isEnabled, !isLoading else { return }
            action()
        } label: {
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
        .accessibilityValue(isEnabled ? "" : "请填写必要登录信息")
    }
}

extension View {
    @ViewBuilder
    func loginNavigationChrome() -> some View {
        #if os(iOS)
        self
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
        #else
        self
        #endif
    }

    @ViewBuilder
    func urlInputTraits() -> some View {
        #if os(iOS)
        self
            .keyboardType(.URL)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        #else
        self
        #endif
    }

    @ViewBuilder
    func emailInputTraits() -> some View {
        #if os(iOS)
        self
            .keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        #else
        self
        #endif
    }

    @ViewBuilder
    func plainInputTraits() -> some View {
        #if os(iOS)
        self
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        #else
        self
        #endif
    }

    @ViewBuilder
    func decimalInputTraits() -> some View {
        #if os(iOS)
        self.keyboardType(.decimalPad)
        #else
        self
        #endif
    }
}
