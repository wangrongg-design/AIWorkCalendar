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

    var body: some View {
        NavigationStack {
            ZStack {
                LoginBackground()

                VStack(alignment: .leading, spacing: 0) {
                    LoginBrandMark()
                        .padding(.top, AITheme.Spacing.sm)

                    Spacer(minLength: 0)

                    LoginForm(
                        account: $account,
                        password: $password,
                        showsPassword: $showsPassword,
                        isLoggingIn: isLoggingIn,
                        canLogin: canLogin,
                        errorMessage: errorMessage
                    ) {
                        Task { await login() }
                    }

                    Spacer(minLength: AITheme.Spacing.xxl)

                    LoginFooter()
                }
                .frame(maxWidth: AITheme.Layout.maxReadableWidth)
                .padding(.horizontal, AITheme.Spacing.lg)
                .padding(.bottom, AITheme.Spacing.lg)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .loginNavigationChrome()
            .animation(.snappy, value: errorMessage)
        }
    }

    private var canLogin: Bool {
        !account.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !password.isEmpty
    }

    private func login() async {
        guard canLogin else {
            errorMessage = "请填写邮箱或手机号和密码"
            return
        }
        isLoggingIn = true
        defer { isLoggingIn = false }
        do {
            try await auth.login(account: account, password: password, tenantCode: nil)
        } catch {
            let message = error.localizedDescription
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
        Color(red: 0.12, green: 0.12, blue: 0.12)
            .ignoresSafeArea()
    }
}

private struct LoginBrandMark: View {
    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.xl) {
            HStack {
                Image("SevenAILogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 86, height: 28, alignment: .leading)
                    .opacity(0.95)

                Spacer(minLength: 0)
            }

            VStack(alignment: .leading, spacing: AITheme.Spacing.xs) {
                Text("AIWorkCalendar")
                    .font(.system(size: 17, weight: .semibold, design: .default))
                    .foregroundStyle(AITheme.ColorToken.gray4)

                Text("开启你的AI之旅")
                    .font(AITheme.Typography.title)
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.82)
                    .accessibilityAddTraits(.isHeader)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("七数 AI，AIWorkCalendar，开启你的AI之旅")
    }
}

private struct LoginForm: View {
    @Binding var account: String
    @Binding var password: String
    @Binding var showsPassword: Bool
    let isLoggingIn: Bool
    let canLogin: Bool
    let errorMessage: String?
    let onLogin: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.sm) {
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
                showsPassword: $showsPassword,
                onSubmit: onLogin
            )

            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                    .font(AITheme.Typography.footnote)
                    .foregroundStyle(AITheme.ColorToken.danger)
                    .padding(.vertical, AITheme.Spacing.xs)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }

            LoginFlatActionButton(title: "登录", isLoading: isLoggingIn, isEnabled: canLogin, action: onLogin)
                .accessibilityHint("登录到 AI 工作日历")
        }
    }
}

private struct LoginFooter: View {
    var body: some View {
        VStack(alignment: .leading, spacing: AITheme.Spacing.xxs) {
            Text(AppConfig.companyName)
                .font(AITheme.Typography.caption.weight(.semibold))
                .foregroundStyle(Color.white.opacity(0.72))
            Text(AppConfig.productLine)
                .font(.caption2)
                .foregroundStyle(Color.white.opacity(0.42))
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
            TextField("", text: $text, prompt: Text(placeholder).foregroundStyle(Color.white.opacity(0.32)))
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
                        TextField("", text: $password, prompt: Text("请输入密码").foregroundStyle(Color.white.opacity(0.32)))
                    } else {
                        SecureField("", text: $password, prompt: Text("请输入密码").foregroundStyle(Color.white.opacity(0.32)))
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
            .background(Color.white.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous)
                    .stroke(Color.white.opacity(0.16), lineWidth: 1)
            }
            .foregroundStyle(.white)
            .tint(.white)
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
            .font(AITheme.Typography.caption.weight(.semibold))
            .foregroundStyle(Color.white.opacity(0.70))
    }
}

private struct LoginFlatTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .font(AITheme.Typography.body)
            .padding(.horizontal, AITheme.Spacing.md)
            .frame(minHeight: AITheme.Layout.minTouchTarget + 10)
            .background(Color.white.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous)
                    .stroke(Color.white.opacity(0.16), lineWidth: 1)
            }
            .foregroundStyle(.white)
            .tint(.white)
    }
}

private struct LoginFlatActionButton: View {
    let title: String
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
                    Text(title)
                }
            }
            .font(.headline)
            .foregroundStyle(isEnabled ? .white : Color.white.opacity(0.50))
            .frame(maxWidth: .infinity, minHeight: AITheme.Layout.minTouchTarget + 10)
            .background(isEnabled ? AITheme.ColorToken.primary : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: AITheme.Radius.md, style: .continuous)
                    .stroke(isEnabled ? Color.clear : Color.white.opacity(0.22), lineWidth: 1)
            }
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
