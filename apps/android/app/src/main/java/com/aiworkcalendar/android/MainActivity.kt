package com.aiworkcalendar.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.Composable
import com.aiworkcalendar.android.ui.AIWorkCalendarRoot
import com.aiworkcalendar.android.ui.theme.AIWorkCalendarTheme

class MainActivity : ComponentActivity() {
    private val viewModel: AIWorkCalendarViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            AIWorkCalendarTheme {
                AIWorkCalendarRoot(viewModel = viewModel)
            }
        }
    }
}
