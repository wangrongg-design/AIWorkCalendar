package com.aiworkcalendar.android.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive

object AIJson {
    val instance = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
        encodeDefaults = true
    }
}

@Serializable
enum class RoleCode {
    @SerialName("SUPER_ADMIN")
    SUPER_ADMIN,

    @SerialName("COMPANY_ADMIN")
    COMPANY_ADMIN,

    @SerialName("DEPARTMENT_MANAGER")
    DEPARTMENT_MANAGER,

    @SerialName("EMPLOYEE")
    EMPLOYEE
}

@Serializable
enum class WorkLogStatus {
    @SerialName("DRAFT")
    DRAFT,

    @SerialName("SUBMITTED")
    SUBMITTED
}

val WorkLogStatus.title: String
    get() = when (this) {
        WorkLogStatus.DRAFT -> "草稿"
        WorkLogStatus.SUBMITTED -> "已提交"
    }

@Serializable
enum class ProjectStatus {
    @SerialName("ACTIVE")
    ACTIVE,

    @SerialName("PAUSED")
    PAUSED,

    @SerialName("ARCHIVED")
    ARCHIVED
}

val ProjectStatus.title: String
    get() = when (this) {
        ProjectStatus.ACTIVE -> "进行中"
        ProjectStatus.PAUSED -> "暂停"
        ProjectStatus.ARCHIVED -> "已归档"
    }

@Serializable
enum class Scope {
    @SerialName("self")
    SELF,

    @SerialName("department")
    DEPARTMENT,

    @SerialName("company")
    COMPANY
}

val Scope.wire: String
    get() = when (this) {
        Scope.SELF -> "self"
        Scope.DEPARTMENT -> "department"
        Scope.COMPANY -> "company"
    }

val Scope.title: String
    get() = when (this) {
        Scope.SELF -> "只看自己"
        Scope.DEPARTMENT -> "本部门"
        Scope.COMPANY -> "全公司"
    }

@Serializable
data class AuthUser(
    val id: String = "",
    val tenantId: String = "",
    val tenantName: String = "",
    val tenantCode: String = "",
    val email: String? = null,
    val phone: String? = null,
    val name: String = "",
    val departmentId: String? = null,
    val departmentName: String? = null,
    val roles: List<RoleCode> = emptyList(),
    val requiresWorkReport: Boolean? = null
)

val AuthUser.canViewCompany: Boolean
    get() = roles.contains(RoleCode.COMPANY_ADMIN) || roles.contains(RoleCode.SUPER_ADMIN)

val AuthUser.canViewDepartment: Boolean
    get() = canViewCompany || roles.contains(RoleCode.DEPARTMENT_MANAGER)

val AuthUser.availableScopes: List<Scope>
    get() = when {
        canViewCompany -> listOf(Scope.COMPANY, Scope.SELF)
        canViewDepartment -> listOf(Scope.DEPARTMENT, Scope.SELF)
        else -> listOf(Scope.SELF)
    }

val AuthUser.primaryRoleTitle: String
    get() = when {
        roles.contains(RoleCode.SUPER_ADMIN) -> "平台超管"
        roles.contains(RoleCode.COMPANY_ADMIN) -> "企业管理员"
        roles.contains(RoleCode.DEPARTMENT_MANAGER) -> "部门经理"
        else -> "员工"
    }

@Serializable
data class LoginRequest(
    val account: String,
    val password: String,
    val tenantCode: String? = null
)

@Serializable
data class LoginResponse(
    val accessToken: String,
    val user: AuthUser
)

@Serializable
data class Department(
    val id: String = "",
    val name: String = "",
    val parentId: String? = null
)

@Serializable
data class UserSummary(
    val id: String = "",
    val name: String = "",
    val email: String? = null,
    val phone: String? = null,
    val departmentId: String? = null,
    val departmentName: String? = null,
    val department: Department? = null
)

@Serializable
data class Project(
    val id: String = "",
    val tenantId: String? = null,
    val code: String? = null,
    val name: String = "",
    val description: String? = null,
    val status: ProjectStatus = ProjectStatus.ACTIVE,
    val ownerUserId: String? = null,
    val owner: UserSummary? = null,
    val startDate: String? = null,
    val endDate: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null
)

val Project.displayName: String
    get() = if (!code.isNullOrBlank()) "$code · $name" else name

val Project.hasProjectRisk: Boolean
    get() = status == ProjectStatus.PAUSED || owner == null || endDate.isNullOrBlank()

@Serializable(with = FlexibleDoubleSerializer::class)
@JvmInline
value class FlexibleDouble(val value: Double)

object FlexibleDoubleSerializer : KSerializer<FlexibleDouble> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("FlexibleDouble", PrimitiveKind.DOUBLE)

    override fun deserialize(decoder: Decoder): FlexibleDouble {
        val jsonDecoder = decoder as? JsonDecoder
        val element = jsonDecoder?.decodeJsonElement()
        val value = when (element) {
            is JsonPrimitive -> element.doubleOrNull
                ?: element.intOrNull?.toDouble()
                ?: element.content.toDoubleOrNull()
                ?: 0.0

            JsonNull -> 0.0
            else -> 0.0
        }
        return FlexibleDouble(value)
    }

    override fun serialize(encoder: Encoder, value: FlexibleDouble) {
        encoder.encodeDouble(value.value)
    }
}

object FlexibleStringListSerializer : KSerializer<List<String>> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("FlexibleStringList", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): List<String> {
        val jsonDecoder = decoder as? JsonDecoder ?: return emptyList()
        return when (val element: JsonElement = jsonDecoder.decodeJsonElement()) {
            is JsonArray -> element.mapNotNull { item ->
                (item as? JsonPrimitive)?.content?.takeIf { it.isNotBlank() }
            }

            is JsonPrimitive -> element.content.takeIf { it.isNotBlank() }?.let(::listOf) ?: emptyList()
            JsonNull -> emptyList()
            else -> emptyList()
        }
    }

    override fun serialize(encoder: Encoder, value: List<String>) {
        encoder.encodeString(value.joinToString("\n"))
    }
}

@Serializable
data class AiAnalysis(
    val id: String = "",
    val category: String? = null,
    @Serializable(with = FlexibleStringListSerializer::class)
    val achievements: List<String> = emptyList(),
    @Serializable(with = FlexibleStringListSerializer::class)
    val risks: List<String> = emptyList(),
    @Serializable(with = FlexibleStringListSerializer::class)
    val blockers: List<String> = emptyList(),
    @Serializable(with = FlexibleStringListSerializer::class)
    val keywords: List<String> = emptyList(),
    @Serializable(with = FlexibleStringListSerializer::class)
    val tags: List<String> = emptyList(),
    val timeReasonableness: String? = null,
    val summary: String? = null
)

@Serializable
data class WorkLog(
    val id: String = "",
    val userId: String = "",
    val date: String = "",
    val title: String = "",
    val content: String = "",
    val startTime: String? = null,
    val endTime: String? = null,
    val hours: FlexibleDouble = FlexibleDouble(0.0),
    val status: WorkLogStatus = WorkLogStatus.DRAFT,
    val submittedAt: String? = null,
    val projectId: String? = null,
    val project: Project? = null,
    val user: UserSummary? = null,
    val aiAnalysis: AiAnalysis? = null
)

val WorkLog.hoursText: String
    get() {
        val rounded = kotlin.math.round(hours.value * 10) / 10
        return if (rounded == kotlin.math.round(rounded)) rounded.toInt().toString() else "%.1f".format(rounded)
    }

val WorkLog.hasRisk: Boolean
    get() = (aiAnalysis?.risks?.isNotEmpty() == true) || (aiAnalysis?.blockers?.isNotEmpty() == true)

@Serializable
data class CreateWorkLogRequest(
    val date: String,
    val title: String,
    val content: String,
    val hours: Double,
    val projectId: String? = null
)

@Serializable
data class UpdateWorkLogRequest(
    val date: String,
    val title: String,
    val content: String,
    val hours: Double,
    val projectId: String? = null
)

@Serializable
enum class DraftRole {
    @SerialName("user")
    USER,

    @SerialName("assistant")
    ASSISTANT
}

@Serializable
data class DraftMessage(
    val role: DraftRole,
    val content: String
)

@Serializable
data class WorkLogDraftRequest(
    val messages: List<DraftMessage>,
    val currentDate: String
)

@Serializable
enum class WorkLogDraftKind {
    @SerialName("DAILY")
    DAILY,

    @SerialName("PLAN")
    PLAN
}

@Serializable
data class WorkLogDraft(
    val date: String = "",
    val kind: WorkLogDraftKind = WorkLogDraftKind.DAILY,
    val title: String = "",
    val content: String = "",
    val hours: Double = 0.0,
    val startTime: String? = null,
    val endTime: String? = null,
    val confidence: Double = 0.0,
    val missingFields: List<String> = emptyList(),
    val assistantMessage: String = ""
)

@Serializable
data class ResolvedScope(
    val scope: Scope = Scope.SELF,
    val departmentId: String? = null
)

@Serializable
data class CalendarDay(
    val date: String = "",
    val filledCount: Int = 0,
    val missingCount: Int = 0,
    val fillRate: Double = 0.0,
    val riskCount: Int = 0
)

@Serializable
data class CalendarResponse(
    val month: String = "",
    val scope: ResolvedScope? = null,
    val totalEmployees: Int = 0,
    val days: List<CalendarDay> = emptyList()
)

@Serializable
data class CalendarDayDetail(
    val date: String = "",
    val scope: ResolvedScope? = null,
    val filledEmployees: List<FilledEmployee> = emptyList(),
    val missingEmployees: List<MissingEmployee> = emptyList(),
    val stats: CalendarStats = CalendarStats()
)

@Serializable
data class FilledEmployee(
    val id: String = "",
    val name: String = "",
    val email: String? = null,
    val phone: String? = null,
    val departmentName: String? = null,
    val logs: List<WorkLog> = emptyList()
)

@Serializable
data class MissingEmployee(
    val id: String = "",
    val name: String = "",
    val email: String? = null,
    val phone: String? = null,
    val departmentName: String? = null
)

@Serializable
data class CalendarStats(
    val totalEmployees: Int = 0,
    val filledCount: Int = 0,
    val missingCount: Int = 0,
    val fillRate: Double = 0.0,
    val totalHours: Double = 0.0,
    val riskCount: Int = 0
)

@Serializable
data class OkResponse(
    val ok: Boolean = true
)
