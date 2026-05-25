import SwiftUI
#if os(iOS)
import UIKit
#endif

struct LoginView: View {
    @EnvironmentObject private var auth: AuthStore
    @State private var apiBaseURL = SessionStore.defaultBaseURL
    @State private var tenantCode = ""
    @State private var account = ""
    @State private var password = ""
    @State private var isLoggingIn = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("服务器") {
                    TextField("API 地址", text: $apiBaseURL)
                        .urlInputTraits()
                }

                Section("账号") {
                    TextField("企业代码", text: $tenantCode)
                        .plainInputTraits()
                    TextField("邮箱或手机号", text: $account)
                        .emailInputTraits()
                    SecureField("密码", text: $password)
                        .textContentType(.password)
                }

                Section {
                    Button {
                        Task { await login() }
                    } label: {
                        if isLoggingIn {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("登录")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(isLoggingIn || account.isEmpty || password.isEmpty)
                }
            }
            .navigationTitle("AI 工作日历")
            .onAppear {
                apiBaseURL = auth.apiBaseURL
            }
            .alert("登录失败", isPresented: errorBinding) {
                Button("知道了", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
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

    private func login() async {
        isLoggingIn = true
        defer { isLoggingIn = false }
        auth.apiBaseURL = apiBaseURL
        do {
            try await auth.login(account: account, password: password, tenantCode: tenantCode)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

extension View {
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
