import SwiftUI
#if os(iOS)
import UIKit
#endif

struct LoginView: View {
    @EnvironmentObject private var auth: AuthStore
    @State private var tenantCode = ""
    @State private var account = ""
    @State private var password = ""
    @State private var isLoggingIn = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ZStack {
                LoginBackground()

                ScrollView {
                    VStack(alignment: .leading, spacing: AITheme.Spacing.xxl) {
                        LoginBrandMark()
                            .padding(.top, AITheme.Spacing.lg)

                        LoginHero()

                        VStack(alignment: .leading, spacing: AITheme.Spacing.md) {
                            VStack(alignment: .leading, spacing: AITheme.Spacing.xxs) {
                                Text("企业账号登录")
                                    .font(AITheme.Typography.section)
                                Text("输入企业代码、账号和密码进入工作日历。")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }

                            VStack(spacing: AITheme.Spacing.sm) {
                                TextField("企业代码", text: $tenantCode)
                                    .textFieldStyle(LoginFlatTextFieldStyle())
                                    .plainInputTraits()
                                    .textContentType(.organizationName)
                                    .submitLabel(.next)

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
                            }

                            if let errorMessage {
                                Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                                    .font(.footnote)
                                    .foregroundStyle(.red)
                                    .padding(AITheme.Spacing.sm)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(Color.red.opacity(0.10))
                                    .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))
                                    .transition(.opacity.combined(with: .move(edge: .top)))
                            }

                            LoginFlatActionButton(title: "登录", systemImage: "arrow.right", isLoading: isLoggingIn) {
                                Task { await login() }
                            }
                            .disabled(!canLogin)
                            .opacity(canLogin ? 1 : 0.48)
                            .accessibilityHint("登录到 AI 工作日历")
                        }
                    }
                    .frame(maxWidth: AITheme.Layout.maxReadableWidth)
                    .padding(.horizontal, AITheme.Spacing.lg)
                    .padding(.bottom, 168)
                    .frame(maxWidth: .infinity)
                }
            }
            .safeAreaInset(edge: .bottom) {
                LoginFooter()
                    .frame(maxWidth: AITheme.Layout.maxReadableWidth)
                    .padding(.horizontal, AITheme.Spacing.lg)
                    .padding(.top, AITheme.Spacing.md)
                    .padding(.bottom, AITheme.Spacing.sm)
                    .frame(maxWidth: .infinity)
                    .background(AITheme.ColorToken.appBackground.opacity(0.96))
            }
            .loginNavigationChrome()
            .animation(.snappy, value: errorMessage)
        }
    }

    private var canLogin: Bool {
        !tenantCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !account.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !password.isEmpty
    }

    private func login() async {
        guard canLogin else {
            errorMessage = "请填写企业代码、账号和密码"
            return
        }
        isLoggingIn = true
        defer { isLoggingIn = false }
        do {
            try await auth.login(account: account, password: password, tenantCode: tenantCode)
        } catch {
            errorMessage = error.localizedDescription
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
                    AITheme.ColorToken.brand.opacity(0.08),
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
        Image("SevenAILogo")
            .resizable()
            .scaledToFit()
            .frame(width: 72, height: 24, alignment: .leading)
            .opacity(0.72)
            .accessibilityLabel("七数智联")
    }
}

private struct LoginHero: View {
    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
            Image(systemName: "calendar.badge.checkmark")
                .font(.title2.weight(.medium))
                .foregroundStyle(AITheme.ColorToken.brand)
                .frame(width: AITheme.Layout.minTouchTarget, height: AITheme.Layout.minTouchTarget, alignment: .leading)
                .accessibilityHidden(true)

            Text("AI 工作日历")
                .font(AITheme.Typography.title)
                .foregroundStyle(.primary)
                .minimumScaleFactor(0.75)
                .accessibilityAddTraits(.isHeader)

            Text("每日填报、团队看板和智能汇报，保持在同一个清晰节奏里。")
                .font(.body)
                .foregroundStyle(.secondary)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct LoginFooter: View {
    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.xs) {
            Text("“\(AppConfig.businessQuote)”")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Text("— \(AppConfig.businessQuoteAuthor)")
                .font(.caption)
                .foregroundStyle(.tertiary)

            VStack(alignment: .leading, spacing: AITheme.Spacing.xxs) {
                Text(AppConfig.companyName)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(AppConfig.productLine)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .padding(.top, AITheme.Spacing.xs)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

private struct LoginFlatTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .font(AITheme.Typography.body)
            .padding(.horizontal, AITheme.Spacing.md)
            .frame(minHeight: AITheme.Layout.minTouchTarget + 10)
            .background(Color.secondary.opacity(0.10))
            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))
    }
}

private struct LoginFlatActionButton: View {
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
