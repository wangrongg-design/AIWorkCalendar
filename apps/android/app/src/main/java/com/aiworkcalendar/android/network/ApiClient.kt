package com.aiworkcalendar.android.network

import com.aiworkcalendar.android.model.AIJson
import com.aiworkcalendar.android.model.AuthUser
import com.aiworkcalendar.android.model.CalendarDayDetail
import com.aiworkcalendar.android.model.CalendarResponse
import com.aiworkcalendar.android.model.CreateWorkLogRequest
import com.aiworkcalendar.android.model.LoginRequest
import com.aiworkcalendar.android.model.LoginResponse
import com.aiworkcalendar.android.model.Project
import com.aiworkcalendar.android.model.UpdateWorkLogRequest
import com.aiworkcalendar.android.model.WorkLog
import com.aiworkcalendar.android.model.WorkLogDraft
import com.aiworkcalendar.android.model.WorkLogDraftRequest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import java.util.concurrent.TimeUnit

interface AIWorkCalendarApi {
    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    @GET("auth/me")
    suspend fun me(): AuthUser

    @GET("analytics/calendar")
    suspend fun calendar(
        @Query("month") month: String,
        @Query("scope") scope: String
    ): CalendarResponse

    @GET("analytics/calendar/day")
    suspend fun calendarDay(
        @Query("date") date: String,
        @Query("scope") scope: String
    ): CalendarDayDetail

    @GET("work-logs")
    suspend fun workLogs(): List<WorkLog>

    @POST("work-logs")
    suspend fun createWorkLog(@Body request: CreateWorkLogRequest): WorkLog

    @PATCH("work-logs/{id}")
    suspend fun updateWorkLog(
        @Path("id") id: String,
        @Body request: UpdateWorkLogRequest
    ): WorkLog

    @POST("work-logs/{id}/submit")
    suspend fun submitWorkLog(@Path("id") id: String): WorkLog

    @DELETE("work-logs/{id}")
    suspend fun deleteWorkLog(@Path("id") id: String): Response<Unit>

    @GET("projects")
    suspend fun projects(): List<Project>

    @POST("ai/work-log-draft")
    suspend fun workLogDraft(@Body request: WorkLogDraftRequest): WorkLogDraft
}

object ApiClientFactory {
    fun create(baseUrl: String, tokenProvider: () -> String?): AIWorkCalendarApi {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }
        val client = OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(40, TimeUnit.SECONDS)
            .writeTimeout(40, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                val token = tokenProvider()
                val requestBuilder = chain.request().newBuilder()
                    .header("Accept", "application/json")
                if (!token.isNullOrBlank()) {
                    requestBuilder.header("Authorization", "Bearer $token")
                }
                chain.proceed(requestBuilder.build())
            }
            .addInterceptor(logging)
            .build()

        val normalizedBaseUrl = baseUrl.trim().trimEnd('/') + "/"
        return Retrofit.Builder()
            .baseUrl(normalizedBaseUrl)
            .client(client)
            .addConverterFactory(AIJson.instance.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(AIWorkCalendarApi::class.java)
    }
}
