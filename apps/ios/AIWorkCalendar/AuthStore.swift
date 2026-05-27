import Foundation
import Combine

@MainActor
final class AuthStore: ObservableObject {
    @Published var user: AuthUser?
    @Published private var accessToken: String?
    let apiBaseURL: String
    @Published var isRefreshing = false

    init() {
        self.accessToken = SessionStore.loadToken()
        self.user = SessionStore.loadUser()
        self.apiBaseURL = AppConfig.apiBaseURL
    }

    var isAuthenticated: Bool {
        user != nil && accessToken != nil
    }

    func client() throws -> APIClient {
        let token = accessToken ?? SessionStore.loadToken()
        guard let client = APIClient(baseURLString: apiBaseURL, accessToken: token) else {
            throw APIError.invalidBaseURL
        }
        return client
    }

    func login(account: String, password: String, tenantCode: String?) async throws {
        let cleanBaseURL = AppConfig.apiBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let client = APIClient(baseURLString: cleanBaseURL, accessToken: nil) else {
            throw APIError.invalidBaseURL
        }
        let cleanTenantCode = tenantCode?.trimmingCharacters(in: .whitespacesAndNewlines)
        let request = LoginRequest(
            account: account.trimmingCharacters(in: .whitespacesAndNewlines),
            password: password,
            tenantCode: cleanTenantCode?.isEmpty == true ? nil : cleanTenantCode
        )
        let response: LoginResponse = try await client.request("/auth/login", method: .post, body: request)
        SessionStore.saveToken(response.accessToken)
        accessToken = response.accessToken
        SessionStore.saveUser(response.user)
        user = response.user
    }

    func refreshMeIfPossible() async {
        guard accessToken ?? SessionStore.loadToken() != nil else {
            return
        }
        isRefreshing = true
        defer { isRefreshing = false }
        do {
            let me: AuthUser = try await client().request("/auth/me")
            SessionStore.saveUser(me)
            user = me
        } catch APIError.server(let statusCode, _) where statusCode == 401 {
            logout()
        } catch {
            // Keep the cached user so the app can still open if the API is temporarily unreachable.
        }
    }

    func logout() {
        SessionStore.clearSession()
        accessToken = nil
        user = nil
    }
}
