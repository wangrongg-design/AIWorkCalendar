package com.aiworkcalendar.android

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.aiworkcalendar.android.data.SessionStore
import com.aiworkcalendar.android.model.AuthUser
import com.aiworkcalendar.android.model.CalendarDay
import com.aiworkcalendar.android.model.CalendarDayDetail
import com.aiworkcalendar.android.model.CalendarResponse
import com.aiworkcalendar.android.model.CreateWorkLogRequest
import com.aiworkcalendar.android.model.DraftMessage
import com.aiworkcalendar.android.model.DraftRole
import com.aiworkcalendar.android.model.LoginRequest
import com.aiworkcalendar.android.model.Project
import com.aiworkcalendar.android.model.ProjectStatus
import com.aiworkcalendar.android.model.Scope
import com.aiworkcalendar.android.model.UpdateWorkLogRequest
import com.aiworkcalendar.android.model.WorkLog
import com.aiworkcalendar.android.model.WorkLogDraftRequest
import com.aiworkcalendar.android.model.WorkLogStatus
import com.aiworkcalendar.android.model.hasRisk
import com.aiworkcalendar.android.model.wire
import com.aiworkcalendar.android.network.AIWorkCalendarApi
import com.aiworkcalendar.android.network.ApiClientFactory
import kotlinx.coroutines.launch
import retrofit2.HttpException
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

enum class AppTab(val title: String) {
    Calendar("AI日历"),
    Entry("填报"),
    Records("记录"),
    Projects("项目"),
    Profile("我的")
}

data class WeekBriefDay(
    val date: LocalDate,
    val aggregate: CalendarDay?,
    val detail: CalendarDayDetail?
) {
    val dateKey: String = DateTools.apiDate.format(date)
    val isToday: Boolean = date == LocalDate.now()
    val isFuture: Boolean = date.isAfter(LocalDate.now())
    val filledCount: Int = detail?.stats?.filledCount ?: aggregate?.filledCount ?: 0
    val missingCount: Int = detail?.stats?.missingCount ?: aggregate?.missingCount ?: 0
    val riskCount: Int = detail?.stats?.riskCount ?: aggregate?.riskCount ?: 0
    val totalHours: Double? = detail?.stats?.totalHours
    val totalCount: Int = detail?.stats?.totalEmployees ?: run {
        val total = filledCount + missingCount
        if (total > 0) total else null
    } ?: 1
}

object DateTools {
    val apiDate: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE
    val monthKey: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM")

    fun todayKey(): String = apiDate.format(LocalDate.now())

    fun parseDate(value: String): LocalDate? {
        val key = value.take(10)
        return runCatching { LocalDate.parse(key, apiDate) }.getOrNull()
    }

    fun displayDate(date: LocalDate = LocalDate.now()): String {
        val week = date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.CHINA)
        return "${date.monthValue}月${date.dayOfMonth}日 $week"
    }

    fun displayDateKey(key: String): String {
        return parseDate(key)?.let(::displayDate) ?: key.take(10)
    }

    fun weekDays(anchor: LocalDate = LocalDate.now()): List<LocalDate> {
        val monday = anchor.minusDays((anchor.dayOfWeek.value - DayOfWeek.MONDAY.value).toLong())
        return (0..6).map { monday.plusDays(it.toLong()) }
    }
}

class AIWorkCalendarViewModel(application: Application) : AndroidViewModel(application) {
    private val sessionStore = SessionStore(application)
    private var token: String? by mutableStateOf(null)
    private val api: AIWorkCalendarApi
        get() = ApiClientFactory.create(BuildConfig.AIWC_API_BASE_URL) { token }

    var isBooting by mutableStateOf(true)
        private set
    var isLoginLoading by mutableStateOf(false)
        private set
    var user by mutableStateOf<AuthUser?>(null)
        private set
    var selectedTab by mutableStateOf(AppTab.Calendar)
    var snackbarMessage by mutableStateOf<String?>(null)
    var blockingError by mutableStateOf<String?>(null)

    var isHomeLoading by mutableStateOf(false)
        private set
    var calendar by mutableStateOf<CalendarResponse?>(null)
        private set
    var todayDetail by mutableStateOf<CalendarDayDetail?>(null)
        private set
    var weekDetails by mutableStateOf<Map<String, CalendarDayDetail>>(emptyMap())
        private set

    var logs by mutableStateOf<List<WorkLog>>(emptyList())
        private set
    var projects by mutableStateOf<List<Project>>(emptyList())
        private set
    var isRecordsLoading by mutableStateOf(false)
        private set
    var isProjectsLoading by mutableStateOf(false)
        private set

    var entryInput by mutableStateOf("")
    var entryDate by mutableStateOf(LocalDate.now())
    var draftTitle by mutableStateOf("")
    var draftContent by mutableStateOf("")
    var draftHours by mutableStateOf("1")
    var selectedProjectId by mutableStateOf("")
    var savedDraftId by mutableStateOf<String?>(null)
        private set
    var isEntryLoading by mutableStateOf(false)
        private set
    var isDrafting by mutableStateOf(false)
        private set
    var isSaving by mutableStateOf(false)
        private set
    var isSubmitting by mutableStateOf(false)
        private set

    private var draftMessages: List<DraftMessage> = listOf(
        DraftMessage(
            role = DraftRole.ASSISTANT,
            content = "今天你完成了什么？告诉我任务、项目、风险或工时，我会整理成可提交的日报。"
        )
    )

    init {
        viewModelScope.launch {
            val saved = sessionStore.load()
            token = saved.token
            user = saved.user
            if (!token.isNullOrBlank()) {
                refreshMe()
            }
            isBooting = false
        }
    }

    fun login(account: String, password: String) {
        val cleanAccount = account.trim()
        if (cleanAccount.isBlank() || password.isBlank()) {
            blockingError = "请填写邮箱或手机号和密码"
            return
        }
        viewModelScope.launch {
            isLoginLoading = true
            runCatching {
                api.login(LoginRequest(account = cleanAccount, password = password, tenantCode = null))
            }.onSuccess { response ->
                token = response.accessToken
                user = response.user
                sessionStore.save(response.accessToken, response.user)
                selectedTab = AppTab.Calendar
                snackbarMessage = "已登录"
            }.onFailure { error ->
                blockingError = normalizeError(error).let { message ->
                    if (message.contains("多个企业") || message.contains("企业代码") || message.contains("统一社会信用代码")) {
                        "该账号存在于多个企业，请联系管理员或使用企业专属登录入口。"
                    } else {
                        message
                    }
                }
            }
            isLoginLoading = false
        }
    }

    fun logout() {
        viewModelScope.launch {
            sessionStore.clear()
            token = null
            user = null
            calendar = null
            todayDetail = null
            logs = emptyList()
            projects = emptyList()
            selectedTab = AppTab.Calendar
        }
    }

    private suspend fun refreshMe() {
        runCatching { api.me() }
            .onSuccess { me ->
                user = me
                sessionStore.saveUser(me)
            }
            .onFailure { error ->
                if ((error as? HttpException)?.code() == 401) {
                    sessionStore.clear()
                    token = null
                    user = null
                }
            }
    }

    fun refreshHome() {
        viewModelScope.launch {
            isHomeLoading = true
            val today = LocalDate.now()
            val month = YearMonth.from(today).format(DateTools.monthKey)
            runCatching {
                val freshCalendar = api.calendar(month = month, scope = Scope.SELF.wire)
                val freshToday = api.calendarDay(date = DateTools.todayKey(), scope = Scope.SELF.wire)
                val freshLogs = api.workLogs()
                val detailMap = mutableMapOf<String, CalendarDayDetail>()
                DateTools.weekDays(today).forEach { day ->
                    val key = DateTools.apiDate.format(day)
                    runCatching {
                        api.calendarDay(date = key, scope = Scope.SELF.wire)
                    }.onSuccess { detail ->
                        detailMap[key] = detail
                    }
                }
                Triple(freshCalendar, freshToday, freshLogs) to detailMap
            }.onSuccess { (bundle, detailMap) ->
                calendar = bundle.first
                todayDetail = bundle.second
                logs = bundle.third.sortedByDescending { it.date.take(10) }
                weekDetails = detailMap
            }.onFailure { error ->
                snackbarMessage = normalizeError(error)
            }
            isHomeLoading = false
        }
    }

    fun weekBriefDays(): List<WeekBriefDay> {
        val dayMap = calendar?.days.orEmpty().associateBy { it.date.take(10) }
        return DateTools.weekDays().map { date ->
            val key = DateTools.apiDate.format(date)
            WeekBriefDay(
                date = date,
                aggregate = dayMap[key],
                detail = weekDetails[key]
            )
        }
    }

    fun refreshEntryData() {
        viewModelScope.launch {
            isEntryLoading = true
            runCatching {
                api.projects().filter { it.status == ProjectStatus.ACTIVE } to api.workLogs()
            }.onSuccess { (freshProjects, freshLogs) ->
                projects = freshProjects
                logs = freshLogs.sortedByDescending { it.date.take(10) }
                if (selectedProjectId.isNotBlank() && projects.none { it.id == selectedProjectId }) {
                    selectedProjectId = ""
                }
            }.onFailure { error ->
                snackbarMessage = normalizeError(error)
            }
            isEntryLoading = false
        }
    }

    fun generateDraft() {
        val input = entryInput.trim()
        if (input.isBlank()) {
            snackbarMessage = "请先描述今天完成了什么"
            return
        }
        viewModelScope.launch {
            isDrafting = true
            val userMessage = DraftMessage(role = DraftRole.USER, content = input)
            draftMessages = draftMessages + userMessage
            runCatching {
                api.workLogDraft(
                    WorkLogDraftRequest(
                        messages = draftMessages,
                        currentDate = DateTools.apiDate.format(entryDate)
                    )
                )
            }.onSuccess { draft ->
                DateTools.parseDate(draft.date)?.let { entryDate = it }
                draftTitle = draft.title
                draftContent = draft.content
                draftHours = draft.hours.toCleanHourText()
                draftMessages = draftMessages + DraftMessage(DraftRole.ASSISTANT, draft.assistantMessage)
                entryInput = ""
                snackbarMessage = if (draft.kind.name == "PLAN") "已生成计划草稿" else "已生成日报草稿"
            }.onFailure { error ->
                snackbarMessage = normalizeError(error)
            }
            isDrafting = false
        }
    }

    fun saveDraft() {
        val payload = validatedEntryPayload() ?: return
        viewModelScope.launch {
            isSaving = true
            runCatching { upsertDraft(payload) }
                .onSuccess {
                    savedDraftId = it.id
                    snackbarMessage = "草稿已保存"
                    refreshEntryData()
                }
                .onFailure { snackbarMessage = normalizeError(it) }
            isSaving = false
        }
    }

    fun submitDraft() {
        val payload = validatedEntryPayload() ?: return
        viewModelScope.launch {
            isSubmitting = true
            runCatching {
                val draft = upsertDraft(payload)
                api.submitWorkLog(draft.id)
            }.onSuccess {
                clearEntry()
                snackbarMessage = "已提交"
                refreshEntryData()
                refreshHome()
            }.onFailure {
                snackbarMessage = normalizeError(it)
            }
            isSubmitting = false
        }
    }

    private suspend fun upsertDraft(payload: CreateWorkLogRequest): WorkLog {
        val existingId = savedDraftId
        return if (existingId != null) {
            api.updateWorkLog(
                id = existingId,
                request = UpdateWorkLogRequest(
                    date = payload.date,
                    title = payload.title,
                    content = payload.content,
                    hours = payload.hours,
                    projectId = payload.projectId
                )
            )
        } else {
            val created = api.createWorkLog(payload)
            savedDraftId = created.id
            created
        }
    }

    private fun validatedEntryPayload(): CreateWorkLogRequest? {
        val title = draftTitle.trim()
        val content = draftContent.trim()
        val hours = draftHours.trim().toDoubleOrNull()
        if (title.isBlank() || content.isBlank()) {
            snackbarMessage = "请先确认标题和内容"
            return null
        }
        if (hours == null || hours < 0 || hours > 24) {
            snackbarMessage = "工时需在 0-24 之间"
            return null
        }
        return CreateWorkLogRequest(
            date = DateTools.apiDate.format(entryDate),
            title = title,
            content = content,
            hours = hours,
            projectId = selectedProjectId.ifBlank { null }
        )
    }

    fun clearEntry() {
        entryInput = ""
        entryDate = LocalDate.now()
        draftTitle = ""
        draftContent = ""
        draftHours = "1"
        selectedProjectId = ""
        savedDraftId = null
        draftMessages = listOf(
            DraftMessage(
                role = DraftRole.ASSISTANT,
                content = "今天你完成了什么？告诉我任务、项目、风险或工时，我会整理成可提交的日报。"
            )
        )
    }

    fun refreshRecords() {
        viewModelScope.launch {
            isRecordsLoading = true
            runCatching { api.workLogs() }
                .onSuccess { logs = it.sortedByDescending { log -> log.date.take(10) } }
                .onFailure { snackbarMessage = normalizeError(it) }
            isRecordsLoading = false
        }
    }

    fun submitExistingLog(log: WorkLog) {
        viewModelScope.launch {
            runCatching { api.submitWorkLog(log.id) }
                .onSuccess {
                    snackbarMessage = "已提交"
                    refreshRecords()
                    refreshHome()
                }
                .onFailure { snackbarMessage = normalizeError(it) }
        }
    }

    fun deleteExistingLog(log: WorkLog) {
        viewModelScope.launch {
            runCatching { api.deleteWorkLog(log.id) }
                .onSuccess {
                    snackbarMessage = "已删除"
                    refreshRecords()
                    refreshHome()
                }
                .onFailure { snackbarMessage = normalizeError(it) }
        }
    }

    fun refreshProjects() {
        viewModelScope.launch {
            isProjectsLoading = true
            runCatching { api.projects() }
                .onSuccess { projects = it }
                .onFailure { snackbarMessage = normalizeError(it) }
            isProjectsLoading = false
        }
    }

    private fun normalizeError(error: Throwable): String {
        val http = error as? HttpException
        if (http != null) {
            val body = runCatching { http.response()?.errorBody()?.string() }.getOrNull()
            return body?.takeIf { it.isNotBlank() } ?: "请求失败：${http.code()}"
        }
        return error.message?.takeIf { it.isNotBlank() } ?: "请求失败，请稍后再试"
    }

    private fun Double.toCleanHourText(): String {
        val rounded = kotlin.math.round(this * 10) / 10
        return if (rounded == kotlin.math.round(rounded)) rounded.toInt().toString() else "%.1f".format(rounded)
    }

    val todayLogs: List<WorkLog>
        get() = logs.filter { it.date.take(10) == DateTools.todayKey() }

    val todaySubmittedCount: Int
        get() = todayLogs.count { it.status == WorkLogStatus.SUBMITTED }

    val todayRiskCount: Int
        get() = todayLogs.count { it.hasRisk }
}
