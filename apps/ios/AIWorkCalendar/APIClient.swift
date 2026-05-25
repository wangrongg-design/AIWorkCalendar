import Foundation

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case patch = "PATCH"
    case delete = "DELETE"
}

enum APIError: LocalizedError {
    case invalidBaseURL
    case invalidResponse
    case server(statusCode: Int, message: String)
    case decoding(message: String)

    var errorDescription: String? {
        switch self {
        case .invalidBaseURL:
            return "API 地址无效"
        case .invalidResponse:
            return "服务器响应无效"
        case .server(_, let message):
            return message
        case .decoding(let message):
            return "数据解析失败：\(message)"
        }
    }
}

struct APIClient {
    private let baseURLString: String
    private let accessToken: String?
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init?(baseURLString: String, accessToken: String?) {
        let trimmed = baseURLString.trimmingCharacters(in: .whitespacesAndNewlines).trimmingTrailingSlash()
        guard URL(string: trimmed) != nil else {
            return nil
        }
        self.baseURLString = trimmed
        self.accessToken = accessToken
        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()
    }

    func request<T: Decodable>(_ path: String, method: HTTPMethod = .get) async throws -> T {
        try await send(path: path, method: method, bodyData: nil)
    }

    func request<T: Decodable, Body: Encodable>(_ path: String, method: HTTPMethod, body: Body) async throws -> T {
        let bodyData = try encoder.encode(body)
        return try await send(path: path, method: method, bodyData: bodyData)
    }

    private func send<T: Decodable>(path: String, method: HTTPMethod, bodyData: Data?) async throws -> T {
        guard let url = makeURL(path: path) else {
            throw APIError.invalidBaseURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let bodyData {
            request.httpBody = bodyData
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let accessToken, !accessToken.isEmpty {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            throw APIError.server(statusCode: httpResponse.statusCode, message: parseErrorMessage(from: data, statusCode: httpResponse.statusCode))
        }

        if data.isEmpty, T.self == EmptyResponse.self {
            return EmptyResponse() as! T
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(message: error.localizedDescription)
        }
    }

    private func makeURL(path: String) -> URL? {
        let normalizedPath = path.hasPrefix("/") ? path : "/\(path)"
        return URL(string: baseURLString + normalizedPath)
    }

    private func parseErrorMessage(from data: Data, statusCode: Int) -> String {
        guard !data.isEmpty else {
            return HTTPURLResponse.localizedString(forStatusCode: statusCode)
        }
        if let errorBody = try? decoder.decode(APIErrorBody.self, from: data), let message = errorBody.message?.text {
            return message
        }
        return HTTPURLResponse.localizedString(forStatusCode: statusCode)
    }
}

struct EmptyResponse: Decodable {}

private struct APIErrorBody: Decodable {
    let message: APIErrorMessage?
}

private enum APIErrorMessage: Decodable {
    case string(String)
    case array([String])

    var text: String {
        switch self {
        case .string(let value):
            return value
        case .array(let values):
            return values.joined(separator: "; ")
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(String.self) {
            self = .string(value)
            return
        }
        if let values = try? container.decode([String].self) {
            self = .array(values)
            return
        }
        self = .string("请求失败")
    }
}

private extension String {
    func trimmingTrailingSlash() -> String {
        var value = self
        while value.hasSuffix("/") {
            value.removeLast()
        }
        return value
    }
}
