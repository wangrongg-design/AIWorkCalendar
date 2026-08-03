package com.aiworkcalendar.android.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.aiworkcalendar.android.model.AIJson
import com.aiworkcalendar.android.model.AuthUser
import kotlinx.coroutines.flow.first
import kotlinx.serialization.decodeFromString

private val Context.aiwcSessionDataStore by preferencesDataStore(name = "aiwc_session")

data class SavedSession(
    val token: String?,
    val user: AuthUser?
)

class SessionStore(private val context: Context) {
    private val tokenKey = stringPreferencesKey("access_token")
    private val userKey = stringPreferencesKey("auth_user")

    suspend fun load(): SavedSession {
        val preferences = context.aiwcSessionDataStore.data.first()
        val token = preferences[tokenKey]
        val user = preferences[userKey]?.let { raw ->
            runCatching { AIJson.instance.decodeFromString<AuthUser>(raw) }.getOrNull()
        }
        return SavedSession(token = token, user = user)
    }

    suspend fun save(token: String, user: AuthUser) {
        context.aiwcSessionDataStore.edit { preferences ->
            preferences[tokenKey] = token
            preferences[userKey] = AIJson.instance.encodeToString(AuthUser.serializer(), user)
        }
    }

    suspend fun saveUser(user: AuthUser) {
        context.aiwcSessionDataStore.edit { preferences ->
            preferences[userKey] = AIJson.instance.encodeToString(AuthUser.serializer(), user)
        }
    }

    suspend fun clear() {
        context.aiwcSessionDataStore.edit { preferences ->
            preferences.clear()
        }
    }
}
