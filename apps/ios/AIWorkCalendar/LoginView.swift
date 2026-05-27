import SwiftUI
#if os(iOS)
import UIKit
#endif

struct LoginView: View {
    @EnvironmentObject private var auth: AuthStore

    @State private var account = ""
    @State private var password = ""
    @State private var showsPassword = false
    @State private var isLoggingIn = false
    @State private var errorMessage: String?
    @State private var infoMessage: String?

    var body: some View {
        NavigationStack {
            ZStack {
                LoginBackground()

                ScrollView {
                    VStack(alignment: .leading, spacing: AITheme.Spacing.lg) {
                        LoginBrandMark()
                            .padding(.top, AITheme.Spacing.xs)

                        LoginHero()

                        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
                            VStack(alignment: .leading, spacing: AITheme.Spacing.xxs) {
                                Text("企业账号登录")
                                    .font(AITheme.Typography.section)
                                Text("输入邮箱或手机号和密码进入工作日历。")
                                    .font(.footnote)
                                    .foregroundStyle(AITheme.ColorToken.textSecondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }

                            VStack(spacing: AITheme.Spacing.sm) {
                                LoginLabeledTextField(
                                    title: "邮箱或手机号",
                                    placeholder: "请输入邮箱或手机号",
                                    text: $account
                                )
                                .emailInputTraits()
                                .textContentType(.username)
                                .submitLabel(.next)

                                LoginPasswordField(
                                    password: $password,
                                    showsPassword: $showsPassword
                                ) {
                                    Task { await login() }
                                }
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

                            if let infoMessage {
                                Label(infoMessage, systemImage: "lock.shield")
                                    .font(.footnote)
                                    .foregroundStyle(AITheme.ColorToken.ai)
                                    .padding(AITheme.Spacing.sm)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(AITheme.ColorToken.aiSurface)
                                    .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.sm, style: .continuous))
                                    .transition(.opacity.combined(with: .move(edge: .top)))
                            }

                            LoginFlatActionButton(title: "登录", systemImage: "arrow.right", isLoading: isLoggingIn, isEnabled: canLogin) {
                                Task { await login() }
                            }
                            .accessibilityHint("登录到 AI 工作日历")

                            Button {
                                errorMessage = nil
                                infoMessage = "请联系企业管理员重置密码或找回账号。"
                            } label: {
                                Text("忘记密码？")
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(AITheme.ColorToken.primary)
                                    .frame(maxWidth: .infinity, minHeight: AITheme.Layout.minTouchTarget * 0.82)
                            }
                            .buttonStyle(.plain)
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
            .animation(.snappy, value: infoMessage)
        }
    }

    private var canLogin: Bool {
        !account.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !password.isEmpty
    }

    private func login() async {
        guard canLogin else {
            errorMessage = "请填写邮箱或手机号和密码"
            infoMessage = nil
            return
        }
        isLoggingIn = true
        defer { isLoggingIn = false }
        do {
            try await auth.login(account: account, password: password, tenantCode: nil)
        } catch {
            let message = error.localizedDescription
            infoMessage = nil
            if message.contains("多个企业") || message.contains("企业代码") {
                errorMessage = "该账号存在于多个企业，请联系管理员或使用企业专属登录入口。"
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
        VStack(alignment: .leading, spacing: AITheme.Spacing.xs) {
            Text("AI 工作日历")
                .font(.system(size: 32, weight: .bold, design: .default))
                .foregroundStyle(.primary)
                .minimumScaleFactor(0.75)
                .accessibilityAddTraits(.isHeader)

            Text("用 AI 连接日报、日历、项目和汇报。")
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
        ("发现异常节奏", "waveform.path.ecg", AITheme.ColorToken.ai),
        ("汇总团队进度", "chart.bar.xaxis", AITheme.ColorToken.ai)
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
            Text("AI 可自动生成日报、发现异常、汇总团队进度")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(AITheme.ColorToken.ink800)
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
            Label("企业数据加密传输，仅授权成员可访问。", systemImage: "lock.shield")
                .font(.footnote)
                .foregroundStyle(AITheme.ColorToken.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

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

private struct LoginLabeledTextField: View {
    let title: String
    let placeholder: String
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.xs) {
            LoginFieldLabel(title)
            TextField(placeholder, text: $text)
                .textFieldStyle(LoginFlatTextFieldStyle())
        }
    }
}

private struct LoginPasswordField: View {
    @Binding var password: String
    @Binding var showsPassword: Bool
    let onSubmit: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.xs) {
            LoginFieldLabel("密码")

            HStack(spacing: AITheme.Spacing.xs) {
                Group {
                    if showsPassword {
                        TextField("请输入密码", text: $password)
                    } else {
                        SecureField("请输入密码", text: $password)
                    }
                }
                .textContentType(.password)
                .submitLabel(.go)
                .onSubmit(onSubmit)

                Button {
                    showsPassword.toggle()
                } label: {
                    Image(systemName: showsPassword ? "eye.slash" : "eye")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(AITheme.ColorToken.textSecondary)
                        .frame(width: AITheme.Layout.minTouchTarget, height: AITheme.Layout.minTouchTarget)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(showsPassword ? "隐藏密码" : "显示密码")
            }
            .font(AITheme.Typography.body)
            .padding(.leading, AITheme.Spacing.md)
            .padding(.trailing, 4)
            .frame(minHeight: AITheme.Layout.minTouchTarget + 10)
            .background(AITheme.ColorToken.activeBackground)
            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous)
                    .stroke(AITheme.ColorToken.separator, lineWidth: 0.5)
            }
        }
    }
}

private struct LoginFieldLabel: View {
    let title: String

    init(_ title: String) {
        self.title = title
    }

    var body: some View {
        Text(title)
            .font(.caption.weight(.semibold))
            .foregroundStyle(AITheme.ColorToken.ink700)
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
            .overlay {
                RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous)
                    .stroke(AITheme.ColorToken.separator, lineWidth: 0.5)
            }
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
            guard !isLoading else { return }
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
            .foregroundStyle(isEnabled ? .white : AITheme.ColorToken.ink700)
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
