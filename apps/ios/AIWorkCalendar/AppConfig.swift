import Foundation

enum AppConfig {
    static var apiBaseURL: String {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "AIWCAPIBaseURL") as? String,
              !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return "http://localhost:3001"
        }
        return value
    }

    static let companyName = "北京七数智联科技有限公司"
    static let productLine = "企业级 AI 工作填报与智能汇报 SaaS"
    static let businessQuote = "效率是把事情做对，效能是做对的事情。"
    static let businessQuoteAuthor = "Peter Drucker"
}
