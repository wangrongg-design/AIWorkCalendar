import Foundation

enum RoleCode: String, Codable, CaseIterable {
    case superAdmin = "SUPER_ADMIN"
    case companyAdmin = "COMPANY_ADMIN"
    case departmentManager = "DEPARTMENT_MANAGER"
    case employee = "EMPLOYEE"
}

enum WorkLogStatus: String, Codable {
    case draft = "DRAFT"
    case submitted = "SUBMITTED"

    var title: String {
        switch self {
        case .draft:
            return "草稿"
        case .submitted:
            return "已提交"
        }
    }
}

enum ProjectStatus: String, Codable {
    case active = "ACTIVE"
    case paused = "PAUSED"
    case archived = "ARCHIVED"

    var title: String {
        switch self {
        case .active:
            return "进行中"
        case .paused:
            return "暂停"
        case .archived:
            return "已归档"
        }
    }
}

enum Scope: String, Codable, CaseIterable, Identifiable {
    case selfScope = "self"
    case department = "department"
    case company = "company"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .selfScope:
            return "只看自己"
        case .department:
            return "本部门"
        case .company:
            return "全公司"
        }
    }
}

struct AuthUser: Codable, Identifiable, Equatable {
    let id: String
    let tenantId: String
    let tenantName: String
    let tenantCode: String
    let email: String?
    let phone: String?
    let name: String
    let departmentId: String?
    let departmentName: String?
    let roles: [RoleCode]
    let requiresWorkReport: Bool?

    var canViewCompany: Bool {
        roles.contains(.companyAdmin) || roles.contains(.superAdmin)
    }

    var canViewDepartment: Bool {
        canViewCompany || roles.contains(.departmentManager)
    }

    var availableScopes: [Scope] {
        if canViewCompany {
            return [.company, .selfScope]
        }
        if canViewDepartment {
            return [.department, .selfScope]
        }
        return [.selfScope]
    }
}

struct LoginRequest: Encodable {
    let account: String
    let password: String
    let tenantCode: String?
}

struct LoginResponse: Decodable {
    let accessToken: String
    let user: AuthUser
}

struct Department: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let parentId: String?
}

struct UserSummary: Decodable, Identifiable {
    let id: String
    let name: String
    let email: String?
    let phone: String?
    let departmentId: String?
    let departmentName: String?
    let department: Department?
}

struct Project: Decodable, Identifiable {
    let id: String
    let tenantId: String?
    let code: String?
    let name: String
    let description: String?
    let status: ProjectStatus
    let ownerUserId: String?
    let owner: UserSummary?
    let startDate: String?
    let endDate: String?
    let createdAt: String?
    let updatedAt: String?

    var displayName: String {
        if let code, !code.isEmpty {
            return "\(code) · \(name)"
        }
        return name
    }
}

struct FlexibleDouble: Codable, Hashable {
    let value: Double

    init(_ value: Double) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let doubleValue = try? container.decode(Double.self) {
            value = doubleValue
            return
        }
        if let intValue = try? container.decode(Int.self) {
            value = Double(intValue)
            return
        }
        if let stringValue = try? container.decode(String.self), let doubleValue = Double(stringValue) {
            value = doubleValue
            return
        }
        throw DecodingError.typeMismatch(
            Double.self,
            DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "Expected number or numeric string")
        )
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(value)
    }
}

struct FlexibleStringArray: Decodable {
    let values: [String]

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let array = try? container.decode([String].self) {
            values = array
            return
        }
        if let string = try? container.decode(String.self), !string.isEmpty {
            values = [string]
            return
        }
        values = []
    }
}

struct AiAnalysis: Decodable, Identifiable {
    let id: String
    let category: String?
    let achievements: [String]
    let risks: [String]
    let blockers: [String]
    let keywords: [String]
    let tags: [String]
    let timeReasonableness: String?
    let summary: String?

    enum CodingKeys: String, CodingKey {
        case id
        case category
        case achievements
        case risks
        case blockers
        case keywords
        case tags
        case timeReasonableness
        case summary
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        category = try container.decodeIfPresent(String.self, forKey: .category)
        achievements = (try? container.decode(FlexibleStringArray.self, forKey: .achievements).values) ?? []
        risks = (try? container.decode(FlexibleStringArray.self, forKey: .risks).values) ?? []
        blockers = (try? container.decode(FlexibleStringArray.self, forKey: .blockers).values) ?? []
        keywords = (try? container.decode(FlexibleStringArray.self, forKey: .keywords).values) ?? []
        tags = (try? container.decode(FlexibleStringArray.self, forKey: .tags).values) ?? []
        timeReasonableness = try container.decodeIfPresent(String.self, forKey: .timeReasonableness)
        summary = try container.decodeIfPresent(String.self, forKey: .summary)
    }
}

struct WorkLog: Decodable, Identifiable {
    let id: String
    let userId: String
    let date: String
    let title: String
    let content: String
    let startTime: String?
    let endTime: String?
    let hours: FlexibleDouble
    let status: WorkLogStatus
    let submittedAt: String?
    let projectId: String?
    let project: Project?
    let user: UserSummary?
    let aiAnalysis: AiAnalysis?

    var hoursText: String {
        let rounded = (hours.value * 10).rounded() / 10
        if rounded.rounded() == rounded {
            return "\(Int(rounded))"
        }
        return String(format: "%.1f", rounded)
    }
}

struct CreateWorkLogRequest: Encodable {
    let date: String
    let title: String
    let content: String
    let hours: Double
    let projectId: String?
}

struct UpdateWorkLogRequest: Encodable {
    let date: String
    let title: String
    let content: String
    let hours: Double
    let projectId: String?
}

enum DraftRole: String, Codable {
    case user
    case assistant
}

struct DraftMessage: Identifiable, Codable, Hashable {
    var id = UUID()
    var role: DraftRole
    var content: String

    enum CodingKeys: String, CodingKey {
        case role
        case content
    }

    init(role: DraftRole, content: String) {
        self.role = role
        self.content = content
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = UUID()
        role = try container.decode(DraftRole.self, forKey: .role)
        content = try container.decode(String.self, forKey: .content)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(role, forKey: .role)
        try container.encode(content, forKey: .content)
    }
}

struct WorkLogDraftRequest: Encodable {
    let messages: [DraftMessage]
    let currentDate: String
}

enum WorkLogDraftKind: String, Decodable {
    case daily = "DAILY"
    case plan = "PLAN"
}

struct WorkLogDraft: Decodable {
    let date: String
    let kind: WorkLogDraftKind
    let title: String
    let content: String
    let hours: Double
    let startTime: String?
    let endTime: String?
    let confidence: Double
    let missingFields: [String]
    let assistantMessage: String
}

struct ResolvedScope: Decodable {
    let scope: Scope
    let departmentId: String?
}

struct CalendarDay: Decodable, Identifiable, Hashable {
    let date: String
    let filledCount: Int
    let missingCount: Int
    let fillRate: Double
    let riskCount: Int

    var id: String { date }
}

struct CalendarResponse: Decodable {
    let month: String
    let scope: ResolvedScope?
    let totalEmployees: Int
    let days: [CalendarDay]
}

struct CalendarDayDetail: Decodable {
    let date: String
    let scope: ResolvedScope?
    let filledEmployees: [FilledEmployee]
    let missingEmployees: [MissingEmployee]
    let stats: CalendarStats
}

struct FilledEmployee: Decodable, Identifiable {
    let id: String
    let name: String
    let email: String?
    let phone: String?
    let departmentName: String?
    let logs: [WorkLog]
}

struct MissingEmployee: Decodable, Identifiable {
    let id: String
    let name: String
    let email: String?
    let phone: String?
    let departmentName: String?
}

struct CalendarStats: Decodable {
    let totalEmployees: Int
    let filledCount: Int
    let missingCount: Int
    let fillRate: Double
    let totalHours: Double
    let riskCount: Int
}

struct OkResponse: Decodable {
    let ok: Bool
}
