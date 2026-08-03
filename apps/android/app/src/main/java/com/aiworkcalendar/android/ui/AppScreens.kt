package com.aiworkcalendar.android.ui

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.speech.RecognizerIntent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccountCircle
import androidx.compose.material.icons.rounded.Article
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.EditNote
import androidx.compose.material.icons.rounded.Error
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material.icons.rounded.Work
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.aiworkcalendar.android.AIWorkCalendarViewModel
import com.aiworkcalendar.android.AppTab
import com.aiworkcalendar.android.DateTools
import com.aiworkcalendar.android.WeekBriefDay
import com.aiworkcalendar.android.model.Project
import com.aiworkcalendar.android.model.ProjectStatus
import com.aiworkcalendar.android.model.WorkLog
import com.aiworkcalendar.android.model.WorkLogStatus
import com.aiworkcalendar.android.model.displayName
import com.aiworkcalendar.android.model.hasProjectRisk
import com.aiworkcalendar.android.model.hasRisk
import com.aiworkcalendar.android.model.hoursText
import com.aiworkcalendar.android.model.primaryRoleTitle
import com.aiworkcalendar.android.model.title
import com.aiworkcalendar.android.ui.theme.AIColor
import com.aiworkcalendar.android.ui.theme.AIRadius
import com.aiworkcalendar.android.ui.theme.AISpacing
import kotlinx.coroutines.launch
import java.time.LocalDate

@Composable
fun AIWorkCalendarRoot(viewModel: AIWorkCalendarViewModel) {
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    LaunchedEffect(viewModel.snackbarMessage) {
        val message = viewModel.snackbarMessage
        if (!message.isNullOrBlank()) {
            scope.launch { snackbarHostState.showSnackbar(message) }
            viewModel.snackbarMessage = null
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        when {
            viewModel.isBooting -> BootScreen()
            viewModel.user == null -> LoginScreen(viewModel = viewModel, snackbarHostState = snackbarHostState)
            else -> MainShell(viewModel = viewModel, snackbarHostState = snackbarHostState)
        }

        val error = viewModel.blockingError
        if (!error.isNullOrBlank()) {
            AlertDialog(
                onDismissRequest = { viewModel.blockingError = null },
                confirmButton = {
                    TextButton(onClick = { viewModel.blockingError = null }) {
                        Text("知道了")
                    }
                },
                title = { Text("提示") },
                text = { Text(error) }
            )
        }
    }
}

@Composable
private fun BootScreen() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center
    ) {
        CircularProgressIndicator(color = AIColor.Primary600)
    }
}

@Composable
private fun LoginScreen(viewModel: AIWorkCalendarViewModel, snackbarHostState: SnackbarHostState) {
    var account by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showsPassword by remember { mutableStateOf(false) }
    val canLogin = account.trim().isNotBlank() && password.isNotBlank()

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = AIColor.LoginBackground,
        contentWindowInsets = WindowInsets.safeDrawing
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = AISpacing.Lg, vertical = AISpacing.Lg),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Column(
                verticalArrangement = Arrangement.spacedBy(AISpacing.Xl),
                modifier = Modifier.statusBarsPadding()
            ) {
                Text(
                    text = "七数AI",
                    style = MaterialTheme.typography.titleLarge,
                    color = AIColor.White,
                    fontWeight = FontWeight.SemiBold
                )

                Column(verticalArrangement = Arrangement.spacedBy(AISpacing.Xs)) {
                    Text(
                        text = "AIWorkCalendar",
                        style = MaterialTheme.typography.titleMedium,
                        color = AIColor.LoginMuted
                    )
                    Text(
                        text = "开启你的AI之旅",
                        style = MaterialTheme.typography.displaySmall,
                        color = AIColor.White,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(AISpacing.Sm)) {
                LoginField(
                    value = account,
                    onValueChange = { account = it },
                    label = "邮箱或手机号",
                    placeholder = "请输入邮箱或手机号",
                    leadingIcon = Icons.Rounded.AccountCircle,
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Next
                )
                LoginField(
                    value = password,
                    onValueChange = { password = it },
                    label = "密码",
                    placeholder = "请输入密码",
                    leadingIcon = Icons.Rounded.Lock,
                    visualTransformation = if (showsPassword) VisualTransformation.None else PasswordVisualTransformation(),
                    trailing = {
                        IconButton(onClick = { showsPassword = !showsPassword }) {
                            Icon(
                                imageVector = if (showsPassword) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
                                contentDescription = if (showsPassword) "隐藏密码" else "显示密码",
                                tint = AIColor.LoginMuted
                            )
                        }
                    },
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Done,
                    onDone = {
                        if (canLogin) viewModel.login(account, password)
                    }
                )
                PrimaryActionButton(
                    title = "登录",
                    enabled = canLogin,
                    loading = viewModel.isLoginLoading,
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { viewModel.login(account, password) }
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = "北京七数智联科技有限公司",
                    style = MaterialTheme.typography.bodySmall,
                    color = AIColor.LoginMuted,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = "企业级 AI 工作日历与周期汇报 SaaS",
                    style = MaterialTheme.typography.labelSmall,
                    color = AIColor.LoginSecondary
                )
            }
        }
    }
}

@Composable
private fun LoginField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    placeholder: String,
    leadingIcon: ImageVector,
    modifier: Modifier = Modifier,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    trailing: (@Composable () -> Unit)? = null,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Default,
    onDone: (() -> Unit)? = null
) {
    Column(verticalArrangement = Arrangement.spacedBy(AISpacing.Xs), modifier = modifier) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = AIColor.LoginMuted)
        TextField(
            value = value,
            onValueChange = onValueChange,
            placeholder = { Text(placeholder) },
            leadingIcon = { Icon(leadingIcon, contentDescription = null, tint = AIColor.LoginMuted) },
            trailingIcon = trailing,
            visualTransformation = visualTransformation,
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType, imeAction = imeAction),
            keyboardActions = KeyboardActions(onDone = { onDone?.invoke() }),
            colors = TextFieldDefaults.colors(
                focusedContainerColor = AIColor.LoginField,
                unfocusedContainerColor = AIColor.LoginField,
                disabledContainerColor = AIColor.LoginField,
                focusedTextColor = AIColor.White,
                unfocusedTextColor = AIColor.White,
                focusedPlaceholderColor = AIColor.LoginSecondary,
                unfocusedPlaceholderColor = AIColor.LoginSecondary,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent
            ),
            shape = RoundedCornerShape(AIRadius.Md),
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@Composable
private fun MainShell(viewModel: AIWorkCalendarViewModel, snackbarHostState: SnackbarHostState) {
    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            NavigationBar(
                modifier = Modifier.windowInsetsPadding(WindowInsets.navigationBars),
                containerColor = MaterialTheme.colorScheme.surface,
                tonalElevation = 0.dp
            ) {
                AppTab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = viewModel.selectedTab == tab,
                        onClick = { viewModel.selectedTab = tab },
                        icon = { Icon(tab.icon, contentDescription = tab.title) },
                        label = { Text(tab.title, maxLines = 1) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = AIColor.Primary600,
                            selectedTextColor = AIColor.Primary600,
                            indicatorColor = AIColor.Primary50,
                            unselectedIconColor = AIColor.Gray5,
                            unselectedTextColor = AIColor.Gray5
                        )
                    )
                }
            }
        },
        containerColor = MaterialTheme.colorScheme.background,
        contentWindowInsets = WindowInsets.safeDrawing.only(
            WindowInsetsSides.Horizontal + WindowInsetsSides.Top
        )
    ) { padding ->
        Box(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .imePadding()
        ) {
            when (viewModel.selectedTab) {
                AppTab.Calendar -> CalendarBriefScreen(viewModel)
                AppTab.Entry -> ReportEntryScreen(viewModel)
                AppTab.Records -> RecordsScreen(viewModel)
                AppTab.Projects -> ProjectsScreen(viewModel)
                AppTab.Profile -> ProfileScreen(viewModel)
            }
        }
    }
}

private val AppTab.icon: ImageVector
    get() = when (this) {
        AppTab.Calendar -> Icons.Rounded.CalendarMonth
        AppTab.Entry -> Icons.Rounded.EditNote
        AppTab.Records -> Icons.Rounded.Article
        AppTab.Projects -> Icons.Rounded.Folder
        AppTab.Profile -> Icons.Rounded.Person
    }

@Composable
private fun ScreenColumn(
    modifier: Modifier = Modifier,
    content: LazyListScope.() -> Unit
) {
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentPadding = PaddingValues(
            start = AISpacing.Lg,
            top = AISpacing.Md,
            end = AISpacing.Lg,
            bottom = AISpacing.Xxl
        ),
        verticalArrangement = Arrangement.spacedBy(AISpacing.Md),
        content = content
    )
}

@Composable
private fun CalendarBriefScreen(viewModel: AIWorkCalendarViewModel) {
    LaunchedEffect(Unit) {
        viewModel.refreshHome()
    }
    val weekDays = viewModel.weekBriefDays()
    val today = weekDays.firstOrNull { it.isToday }
    val recentLogs = viewModel.logs.sortedByDescending { it.date.take(10) }.take(3)

    ScreenColumn {
        item {
            PageHeader(
                title = "AI日历",
                subtitle = DateTools.displayDate(),
                trailing = {
                    IconButton(onClick = { viewModel.refreshHome() }) {
                        Icon(Icons.Rounded.Refresh, contentDescription = "刷新", tint = AIColor.Gray5)
                    }
                }
            )
        }
        item {
            TodayStatusCard(day = today)
        }
        item {
            WeekDigestCard(
                days = weekDays,
                onOpenRecords = { viewModel.selectedTab = AppTab.Records }
            )
        }
        item {
            RecentRecordsList(
                logs = recentLogs,
                compact = true,
                onOpenAll = { viewModel.selectedTab = AppTab.Records }
            )
        }
    }
}

@Composable
private fun PageHeader(title: String, subtitle: String, trailing: (@Composable () -> Unit)? = null) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = AISpacing.Sm),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                title,
                style = MaterialTheme.typography.headlineLarge,
                color = MaterialTheme.colorScheme.onBackground,
                fontWeight = FontWeight.Bold
            )
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = AIColor.Gray5)
        }
        trailing?.invoke()
    }
}

@Composable
private fun TodayStatusCard(day: WeekBriefDay?) {
    val risk = day?.riskCount ?: 0
    val filled = day?.filledCount ?: 0
    val hours = day?.totalHours
    val title = when {
        risk > 0 -> "有风险需要关注"
        filled == 0 -> "今天还未填报"
        else -> "今天状态正常"
    }
    val tint = when {
        risk > 0 -> AIColor.Danger600
        filled == 0 -> AIColor.Warning600
        else -> AIColor.Success600
    }
    val surface = when {
        risk > 0 -> AIColor.Danger50
        filled == 0 -> AIColor.Warning50
        else -> AIColor.Success50
    }
    val icon = when {
        risk > 0 -> Icons.Rounded.Error
        filled == 0 -> Icons.Rounded.EditNote
        else -> Icons.Rounded.CheckCircle
    }
    val hourText = hours?.let { "${it.toCleanHourText()}h" } ?: "工时待确认"
    val summary = if (filled > 0) "已填报 · $hourText · ${if (risk > 0) "$risk 条风险" else "无风险"}" else "未填报 · 工时待补齐 · ${if (risk > 0) "$risk 条风险" else "无风险"}"
    val message = when {
        risk > 0 -> "AI 已发现风险信号，建议去记录页查看原始日报。"
        filled == 0 -> "底部“填报”可以完成今日日报，提交后这里会自动更新。"
        else -> "AI 暂未发现需要你处理的问题。"
    }

    AIPanel {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AISpacing.Sm)) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(AIRadius.Md))
                    .background(surface),
                contentAlignment = Alignment.Center
            ) {
                Icon(icon, contentDescription = null, tint = tint)
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(title, style = MaterialTheme.typography.headlineMedium, color = AIColor.Black)
                Text(summary, style = MaterialTheme.typography.bodyMedium, color = AIColor.Gray5)
            }
        }
        Text(
            message,
            style = MaterialTheme.typography.bodyLarge,
            color = if (risk > 0) AIColor.Danger600 else AIColor.Gray6
        )
    }
}

@Composable
private fun WeekDigestCard(days: List<WeekBriefDay>, onOpenRecords: () -> Unit) {
    val past = days.filter { !it.isFuture }
    val filledDays = past.count { it.filledCount > 0 }
    val missingDays = past.count { it.filledCount == 0 || it.missingCount > 0 }
    val riskCount = past.sumOf { it.riskCount }
    val attention = past.filter { it.riskCount > 0 || it.filledCount == 0 || it.missingCount > 0 }.take(2)

    AIPanel {
        SectionHeader(title = "本周概览", subtitle = "只展示节奏和异常，不做月历网格")
        Row(horizontalArrangement = Arrangement.spacedBy(AISpacing.Xs), modifier = Modifier.fillMaxWidth()) {
            MetricTile("${filledDays}天", "已填", AIColor.Success600, AIColor.Success50, Modifier.weight(1f))
            MetricTile("${missingDays}天", "未填", if (missingDays > 0) AIColor.Warning600 else AIColor.Gray5, if (missingDays > 0) AIColor.Warning50 else AIColor.Gray1, Modifier.weight(1f))
            MetricTile("${riskCount}条", "风险", if (riskCount > 0) AIColor.Danger600 else AIColor.Gray5, if (riskCount > 0) AIColor.Danger50 else AIColor.Gray1, Modifier.weight(1f))
        }
        DividerLine()
        Text("需要关注", style = MaterialTheme.typography.titleMedium, color = AIColor.Black, fontWeight = FontWeight.SemiBold)
        if (attention.isEmpty()) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AISpacing.Sm)) {
                StatusDot(AIColor.Success600, AIColor.Success50)
                Text("暂无需要关注的问题", style = MaterialTheme.typography.bodyMedium, color = AIColor.Gray5)
            }
        } else {
            attention.forEach { item ->
                AttentionRow(day = item, onClick = onOpenRecords)
            }
        }
    }
}

@Composable
private fun AttentionRow(day: WeekBriefDay, onClick: () -> Unit) {
    val isRisk = day.riskCount > 0
    val title = DateTools.displayDate(day.date)
    val subtitle = if (isRisk) "${day.riskCount} 条风险" else "未填报或待补齐"
    val tint = if (isRisk) AIColor.Danger600 else AIColor.Warning600
    val surface = if (isRisk) AIColor.Danger50 else AIColor.Warning50
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(AIRadius.Md))
            .clickable(onClick = onClick)
            .padding(vertical = AISpacing.Xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AISpacing.Sm)
    ) {
        StatusDot(tint, surface)
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, style = MaterialTheme.typography.bodyMedium, color = AIColor.Black, fontWeight = FontWeight.SemiBold)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = AIColor.Gray5)
        }
        Icon(Icons.Rounded.KeyboardArrowRight, contentDescription = null, tint = AIColor.Gray4)
    }
}

@Composable
private fun StatusDot(tint: Color, surface: Color) {
    Box(
        modifier = Modifier
            .size(30.dp)
            .clip(RoundedCornerShape(AIRadius.Sm))
            .background(surface),
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier
                .size(9.dp)
                .clip(CircleShape)
                .background(tint)
        )
    }
}

@Composable
private fun RecentRecordsList(logs: List<WorkLog>, compact: Boolean, onOpenAll: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(AISpacing.Sm)) {
        SectionHeader(
            title = "最近记录",
            trailing = {
                TextButton(onClick = onOpenAll) { Text("查看全部", color = AIColor.Primary600) }
            }
        )
        if (logs.isEmpty()) {
            EmptyLine("提交日报后，这里会显示最近 3 条记录。")
        } else {
            AIPanel {
                logs.take(if (compact) 3 else logs.size).forEachIndexed { index, log ->
                    RecordRow(log = log, dense = compact, onClick = null)
                    if (index < logs.take(if (compact) 3 else logs.size).lastIndex) DividerLine()
                }
            }
        }
    }
}

@Composable
private fun RecordRow(log: WorkLog, dense: Boolean, onClick: (() -> Unit)?) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(vertical = if (dense) AISpacing.Xs else AISpacing.Sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AISpacing.Sm)
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                DateTools.displayDateKey(log.date),
                style = MaterialTheme.typography.bodyMedium,
                color = AIColor.Black,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                "${log.hoursText}h · ${log.status.title}" + (log.project?.displayName?.let { " · $it" } ?: ""),
                style = MaterialTheme.typography.bodySmall,
                color = AIColor.Gray5,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            if (!dense) {
                Text(
                    log.title,
                    style = MaterialTheme.typography.bodyMedium,
                    color = AIColor.Gray6,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
        if (log.hasRisk) {
            StatusPill("风险", AIColor.Danger600, AIColor.Danger50)
        } else {
            StatusPill(log.status.title, if (log.status == WorkLogStatus.SUBMITTED) AIColor.Success600 else AIColor.Gray5, if (log.status == WorkLogStatus.SUBMITTED) AIColor.Success50 else AIColor.Gray1)
        }
    }
}

@Composable
private fun ReportEntryScreen(viewModel: AIWorkCalendarViewModel) {
    LaunchedEffect(Unit) {
        viewModel.refreshEntryData()
    }
    ScreenColumn {
        item {
            PageHeader(title = "今日填报", subtitle = DateTools.displayDate(viewModel.entryDate))
        }
        item {
            EntryComposer(viewModel)
        }
        if (viewModel.draftTitle.isNotBlank() || viewModel.draftContent.isNotBlank()) {
            item {
                DraftEditor(viewModel)
            }
        }
    }
}

@Composable
private fun EntryComposer(viewModel: AIWorkCalendarViewModel) {
    val context = LocalContext.current
    var launchSpeechAfterPermission by remember { mutableStateOf(false) }
    val speechLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val text = result.data
                ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                ?.firstOrNull()
            if (!text.isNullOrBlank()) {
                viewModel.entryInput = text
            }
        }
    }

    fun launchSpeech() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN")
            putExtra(RecognizerIntent.EXTRA_PROMPT, "说出今天完成的工作、工时、风险或明日计划")
        }
        runCatching { speechLauncher.launch(intent) }
            .onFailure { viewModel.snackbarMessage = "当前设备没有可用语音识别服务" }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted && launchSpeechAfterPermission) {
            launchSpeechAfterPermission = false
            launchSpeech()
        } else if (!granted) {
            viewModel.snackbarMessage = "需要麦克风权限后才能语音输入"
        }
    }

    AIPanel(tonal = true) {
        Row(horizontalArrangement = Arrangement.spacedBy(AISpacing.Xs)) {
            StatusPill("1 描述", AIColor.AI600, AIColor.AI50)
            StatusPill("2 确认", AIColor.Gray5, AIColor.Gray1)
        }
        Text(
            "说/写今天完成了什么",
            style = MaterialTheme.typography.headlineMedium,
            color = AIColor.Black,
            fontWeight = FontWeight.SemiBold
        )
        Text(
            "AI 只整理草稿，不会自动提交。",
            style = MaterialTheme.typography.bodySmall,
            color = AIColor.Gray5
        )
        TextField(
            value = viewModel.entryInput,
            onValueChange = { viewModel.entryInput = it },
            placeholder = { Text("例如：完成 WCA 登录页优化 1.5 小时，无风险，明天联调接口。") },
            minLines = 5,
            maxLines = 8,
            colors = TextFieldDefaults.colors(
                focusedContainerColor = AIColor.White,
                unfocusedContainerColor = AIColor.White,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent
            ),
            shape = RoundedCornerShape(AIRadius.Lg),
            modifier = Modifier
                .fillMaxWidth()
                .border(0.5.dp, AIColor.Gray2, RoundedCornerShape(AIRadius.Lg))
        )
        Row(horizontalArrangement = Arrangement.spacedBy(AISpacing.Sm), modifier = Modifier.fillMaxWidth()) {
            SecondaryActionButton(
                title = "语音输入",
                modifier = Modifier.weight(1f),
                onClick = {
                    if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        launchSpeech()
                    } else {
                        launchSpeechAfterPermission = true
                        permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                    }
                }
            )
            PrimaryActionButton(
                title = "AI整理日报",
                loading = viewModel.isDrafting,
                enabled = viewModel.entryInput.trim().isNotBlank(),
                modifier = Modifier.weight(1.3f),
                onClick = { viewModel.generateDraft() }
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DraftEditor(viewModel: AIWorkCalendarViewModel) {
    AIPanel {
        SectionHeader(title = "草稿确认", subtitle = "确认标题、内容和工时后再保存或提交")
        PlainField("标题", viewModel.draftTitle, { viewModel.draftTitle = it }, singleLine = true)
        PlainField("内容", viewModel.draftContent, { viewModel.draftContent = it }, minLines = 5)
        Row(horizontalArrangement = Arrangement.spacedBy(AISpacing.Sm), modifier = Modifier.fillMaxWidth()) {
            PlainField(
                label = "工时",
                value = viewModel.draftHours,
                onValueChange = { viewModel.draftHours = it },
                singleLine = true,
                keyboardType = KeyboardType.Number,
                modifier = Modifier.weight(0.8f)
            )
            ProjectPicker(
                projects = viewModel.projects,
                selectedProjectId = viewModel.selectedProjectId,
                onSelected = { viewModel.selectedProjectId = it },
                modifier = Modifier.weight(1.2f)
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(AISpacing.Sm), modifier = Modifier.fillMaxWidth()) {
            SecondaryActionButton("清空", modifier = Modifier.weight(1f), onClick = { viewModel.clearEntry() })
            SecondaryActionButton("保存草稿", modifier = Modifier.weight(1f), enabled = !viewModel.isSaving, onClick = { viewModel.saveDraft() })
            PrimaryActionButton("提交", modifier = Modifier.weight(1f), loading = viewModel.isSubmitting, onClick = { viewModel.submitDraft() })
        }
    }
}

@Composable
private fun PlainField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    singleLine: Boolean = false,
    minLines: Int = 1,
    keyboardType: KeyboardType = KeyboardType.Text
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(AISpacing.Xs)) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = AIColor.Gray5)
        TextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = singleLine,
            minLines = minLines,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            colors = TextFieldDefaults.colors(
                focusedContainerColor = AIColor.Gray1,
                unfocusedContainerColor = AIColor.Gray1,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent
            ),
            shape = RoundedCornerShape(AIRadius.Md),
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@Composable
private fun ProjectPicker(
    projects: List<Project>,
    selectedProjectId: String,
    onSelected: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedName = projects.firstOrNull { it.id == selectedProjectId }?.displayName ?: "不关联项目"
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(AISpacing.Xs)) {
        Text("项目", style = MaterialTheme.typography.bodySmall, color = AIColor.Gray5)
        Box {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
                    .clip(RoundedCornerShape(AIRadius.Md))
                    .clickable { expanded = true },
                color = AIColor.Gray1,
                shape = RoundedCornerShape(AIRadius.Md)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = AISpacing.Sm),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(selectedName, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Icon(Icons.Rounded.KeyboardArrowRight, contentDescription = null, tint = AIColor.Gray4)
                }
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                DropdownMenuItem(text = { Text("不关联项目") }, onClick = {
                    onSelected("")
                    expanded = false
                })
                projects.forEach { project ->
                    DropdownMenuItem(text = { Text(project.displayName) }, onClick = {
                        onSelected(project.id)
                        expanded = false
                    })
                }
            }
        }
    }
}

@Composable
private fun RecordsScreen(viewModel: AIWorkCalendarViewModel) {
    LaunchedEffect(Unit) { viewModel.refreshRecords() }
    var query by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf("全部") }
    var selectedLog by remember { mutableStateOf<WorkLog?>(null) }
    val filtered = viewModel.logs.filter { log ->
        val matchesFilter = when (filter) {
            "草稿" -> log.status == WorkLogStatus.DRAFT
            "风险" -> log.hasRisk
            else -> true
        }
        val matchesQuery = query.isBlank()
            || log.title.contains(query, ignoreCase = true)
            || log.content.contains(query, ignoreCase = true)
            || log.project?.displayName?.contains(query, ignoreCase = true) == true
        matchesFilter && matchesQuery
    }

    ScreenColumn {
        item {
            PageHeader(
                title = "记录",
                subtitle = "查看日报草稿、已提交和风险记录",
                trailing = {
                    IconButton(onClick = { viewModel.refreshRecords() }) {
                        Icon(Icons.Rounded.Refresh, contentDescription = "刷新", tint = AIColor.Gray5)
                    }
                }
            )
        }
        item {
            SearchAndFilter(
                query = query,
                onQueryChange = { query = it },
                filters = listOf("全部", "草稿", "风险"),
                selected = filter,
                onSelected = { filter = it }
            )
        }
        if (filtered.isEmpty()) {
            item { EmptyLine(if (viewModel.logs.isEmpty()) "暂无填报记录" else "没有匹配记录") }
        } else {
            items(filtered, key = { it.id }) { log ->
                AIPanel {
                    RecordRow(log = log, dense = false, onClick = { selectedLog = log })
                }
            }
        }
    }
    selectedLog?.let { log ->
        WorkLogDetailDialog(
            log = log,
            onDismiss = { selectedLog = null },
            onSubmit = {
                selectedLog = null
                viewModel.submitExistingLog(log)
            },
            onDelete = {
                selectedLog = null
                viewModel.deleteExistingLog(log)
            }
        )
    }
}

@Composable
private fun WorkLogDetailDialog(log: WorkLog, onDismiss: () -> Unit, onSubmit: () -> Unit, onDelete: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(log.title.ifBlank { "日报详情" }) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(AISpacing.Sm)) {
                Text("${DateTools.displayDateKey(log.date)} · ${log.hoursText}h · ${log.status.title}", color = AIColor.Gray5)
                Text(log.content, color = AIColor.Gray6)
                val risks = log.aiAnalysis?.risks.orEmpty() + log.aiAnalysis?.blockers.orEmpty()
                if (risks.isNotEmpty()) {
                    StatusPill("风险：${risks.first()}", AIColor.Danger600, AIColor.Danger50)
                }
            }
        },
        confirmButton = {
            if (log.status == WorkLogStatus.DRAFT) {
                TextButton(onClick = onSubmit) { Text("提交", color = AIColor.Primary600) }
            } else {
                TextButton(onClick = onDismiss) { Text("完成") }
            }
        },
        dismissButton = {
            Row {
                TextButton(onClick = onDelete) { Text("删除", color = AIColor.Danger600) }
                TextButton(onClick = onDismiss) { Text("关闭") }
            }
        }
    )
}

@Composable
private fun SearchAndFilter(
    query: String,
    onQueryChange: (String) -> Unit,
    filters: List<String>,
    selected: String,
    onSelected: (String) -> Unit
) {
    AIPanel {
        TextField(
            value = query,
            onValueChange = onQueryChange,
            placeholder = { Text("搜索标题、内容或项目") },
            singleLine = true,
            trailingIcon = {
                if (query.isNotBlank()) {
                    IconButton(onClick = { onQueryChange("") }) {
                        Icon(Icons.Rounded.Close, contentDescription = "清空", tint = AIColor.Gray5)
                    }
                }
            },
            colors = TextFieldDefaults.colors(
                focusedContainerColor = AIColor.Gray1,
                unfocusedContainerColor = AIColor.Gray1,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent
            ),
            shape = RoundedCornerShape(AIRadius.Md),
            modifier = Modifier.fillMaxWidth()
        )
        Row(horizontalArrangement = Arrangement.spacedBy(AISpacing.Xs)) {
            filters.forEach { item ->
                val active = item == selected
                StatusPill(
                    text = item,
                    color = if (active) AIColor.Primary600 else AIColor.Gray5,
                    background = if (active) AIColor.Primary50 else AIColor.Gray1,
                    modifier = Modifier.clickable { onSelected(item) }
                )
            }
        }
    }
}

@Composable
private fun ProjectsScreen(viewModel: AIWorkCalendarViewModel) {
    LaunchedEffect(Unit) { viewModel.refreshProjects() }
    var query by remember { mutableStateOf("") }
    var riskOnly by remember { mutableStateOf(false) }
    val filtered = viewModel.projects.filter { project ->
        val matchesQuery = query.isBlank()
            || project.name.contains(query, ignoreCase = true)
            || project.code?.contains(query, ignoreCase = true) == true
        val matchesRisk = !riskOnly || project.hasProjectRisk
        matchesQuery && matchesRisk
    }
    ScreenColumn {
        item {
            PageHeader(
                title = "项目",
                subtitle = "项目状态、负责人和截止风险",
                trailing = {
                    IconButton(onClick = { viewModel.refreshProjects() }) {
                        Icon(Icons.Rounded.Refresh, contentDescription = "刷新", tint = AIColor.Gray5)
                    }
                }
            )
        }
        item {
            SearchAndFilter(
                query = query,
                onQueryChange = { query = it },
                filters = listOf("全部", "只看异常"),
                selected = if (riskOnly) "只看异常" else "全部",
                onSelected = { riskOnly = it == "只看异常" }
            )
        }
        item {
            ProjectRadar(projects = viewModel.projects)
        }
        if (filtered.isEmpty()) {
            item { EmptyLine(if (viewModel.projects.isEmpty()) "暂无项目" else "没有匹配项目") }
        } else {
            items(filtered, key = { it.id }) { project ->
                ProjectRow(project)
            }
        }
    }
}

@Composable
private fun ProjectRadar(projects: List<Project>) {
    val active = projects.count { it.status == ProjectStatus.ACTIVE }
    val risks = projects.count { it.hasProjectRisk }
    AIPanel(tonal = true) {
        SectionHeader(title = "项目雷达", subtitle = if (risks > 0) "$risks 个项目需要关注" else "暂无明显项目异常")
        Row(horizontalArrangement = Arrangement.spacedBy(AISpacing.Xs), modifier = Modifier.fillMaxWidth()) {
            MetricTile("$active", "进行中", AIColor.Primary600, AIColor.Primary50, Modifier.weight(1f))
            MetricTile("$risks", "异常", if (risks > 0) AIColor.Warning600 else AIColor.Gray5, if (risks > 0) AIColor.Warning50 else AIColor.Gray1, Modifier.weight(1f))
        }
    }
}

@Composable
private fun ProjectRow(project: Project) {
    AIPanel {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AISpacing.Sm)) {
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .clip(RoundedCornerShape(AIRadius.Md))
                    .background(if (project.hasProjectRisk) AIColor.Warning50 else AIColor.Primary50),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Rounded.Work, contentDescription = null, tint = if (project.hasProjectRisk) AIColor.Warning600 else AIColor.Primary600)
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(project.displayName, style = MaterialTheme.typography.titleMedium, color = AIColor.Black, maxLines = 2)
                Text(
                    "${project.owner?.name ?: "负责人未设置"} · ${project.endDate?.take(10) ?: "截止日期未设置"}",
                    style = MaterialTheme.typography.bodySmall,
                    color = AIColor.Gray5,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            StatusPill(project.status.title, if (project.status == ProjectStatus.ACTIVE) AIColor.Success600 else AIColor.Warning600, if (project.status == ProjectStatus.ACTIVE) AIColor.Success50 else AIColor.Warning50)
        }
        Text(
            if (project.hasProjectRisk) "需要补齐负责人、截止日期或确认暂停状态。" else "项目状态正常，后续填报会继续关联到项目节奏。",
            style = MaterialTheme.typography.bodySmall,
            color = if (project.hasProjectRisk) AIColor.Warning600 else AIColor.Gray5
        )
    }
}

@Composable
private fun ProfileScreen(viewModel: AIWorkCalendarViewModel) {
    val user = viewModel.user
    LaunchedEffect(Unit) {
        if (viewModel.logs.isEmpty()) viewModel.refreshRecords()
    }
    val submitted = viewModel.logs.count { it.status == WorkLogStatus.SUBMITTED }
    val risk = viewModel.logs.count { it.hasRisk }
    ScreenColumn {
        item {
            PageHeader(title = "我的", subtitle = "账号、企业和工作状态")
        }
        item {
            AIPanel {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AISpacing.Sm)) {
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(CircleShape)
                            .background(AIColor.Primary50),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(user?.name?.take(1).orEmpty().ifBlank { "我" }, color = AIColor.Primary600, fontWeight = FontWeight.Bold)
                    }
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(user?.name.orEmpty().ifBlank { "未命名用户" }, style = MaterialTheme.typography.titleLarge, color = AIColor.Black)
                        Text(user?.primaryRoleTitle ?: "员工", style = MaterialTheme.typography.bodySmall, color = AIColor.Gray5)
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(AISpacing.Xs), modifier = Modifier.fillMaxWidth()) {
                    MetricTile("$submitted", "已提交", AIColor.Success600, AIColor.Success50, Modifier.weight(1f))
                    MetricTile("$risk", "风险", if (risk > 0) AIColor.Danger600 else AIColor.Gray5, if (risk > 0) AIColor.Danger50 else AIColor.Gray1, Modifier.weight(1f))
                }
            }
        }
        item {
            AIPanel {
                SectionHeader("企业信息")
                InfoLine("企业", user?.tenantName.orEmpty())
                InfoLine("部门", user?.departmentName ?: "未分配")
                InfoLine("邮箱", user?.email ?: "未设置")
                InfoLine("手机号", user?.phone ?: "未设置")
            }
        }
        item {
            AIPanel(tonal = true) {
                SectionHeader("AI 工作画像", "AI 仅基于你的填报记录做辅助判断")
                Text(
                    if (risk > 0) "本周存在风险记录，建议在记录页补充处理动作。" else "近期记录平稳，暂无需要额外处理的问题。",
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (risk > 0) AIColor.Warning600 else AIColor.AI600
                )
            }
        }
        item {
            SecondaryActionButton(
                title = "退出登录",
                modifier = Modifier.fillMaxWidth(),
                onClick = { viewModel.logout() }
            )
        }
    }
}

@Composable
private fun InfoLine(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(AISpacing.Sm)) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = AIColor.Gray5, modifier = Modifier.width(64.dp))
        Text(value.ifBlank { "-" }, style = MaterialTheme.typography.bodyMedium, color = AIColor.Gray6, modifier = Modifier.weight(1f))
    }
}

private fun Double.toCleanHourText(): String {
    val rounded = kotlin.math.round(this * 10) / 10
    return if (rounded == kotlin.math.round(rounded)) rounded.toInt().toString() else "%.1f".format(rounded)
}
