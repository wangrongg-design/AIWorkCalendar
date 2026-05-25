import Foundation
import Security

enum SessionStore {
    private static let service = "com.aiworkcalendar.app"
    private static let tokenAccount = "accessToken"
    private static let userKey = "AIWorkCalendar.user"
    private static let baseURLKey = "AIWorkCalendar.apiBaseURL"

    static let defaultBaseURL = "http://localhost:3001"

    static func loadBaseURL() -> String {
        UserDefaults.standard.string(forKey: baseURLKey) ?? defaultBaseURL
    }

    static func saveBaseURL(_ value: String) {
        UserDefaults.standard.set(value, forKey: baseURLKey)
    }

    static func loadUser() -> AuthUser? {
        guard let data = UserDefaults.standard.data(forKey: userKey) else {
            return nil
        }
        return try? JSONDecoder().decode(AuthUser.self, from: data)
    }

    static func saveUser(_ user: AuthUser) {
        guard let data = try? JSONEncoder().encode(user) else {
            return
        }
        UserDefaults.standard.set(data, forKey: userKey)
    }

    static func clearUser() {
        UserDefaults.standard.removeObject(forKey: userKey)
    }

    static func loadToken() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: tokenAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    static func saveToken(_ token: String) {
        clearToken()
        guard let data = token.data(using: .utf8) else {
            return
        }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: tokenAccount,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        SecItemAdd(query as CFDictionary, nil)
    }

    static func clearToken() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: tokenAccount
        ]
        SecItemDelete(query as CFDictionary)
    }

    static func clearSession() {
        clearToken()
        clearUser()
    }
}
