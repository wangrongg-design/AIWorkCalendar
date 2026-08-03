package com.aiworkcalendar.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

object AIColor {
    val Black = Color(0xFF1A1A1A)
    val Gray7 = Color(0xFF2E2E2E)
    val Gray6 = Color(0xFF424242)
    val Gray5 = Color(0xFF737373)
    val Gray4 = Color(0xFFA3A3A3)
    val Gray3 = Color(0xFFCCCCCC)
    val Gray2 = Color(0xFFE6E6E6)
    val Gray1 = Color(0xFFF6F6F6)
    val White = Color(0xFFFFFFFF)

    val Primary700 = Color(0xFF0847A6)
    val Primary600 = Color(0xFF0B57D0)
    val Primary500 = Color(0xFF1A73E8)
    val Primary100 = Color(0xFFD3E3FD)
    val Primary50 = Color(0xFFEEF5FF)

    val AI700 = Color(0xFF0B5F59)
    val AI600 = Color(0xFF0F766E)
    val AI500 = Color(0xFF14A39A)
    val AI100 = Color(0xFFCCFBF1)
    val AI50 = Color(0xFFECFDF9)

    val Success600 = Color(0xFF16A34A)
    val Success100 = Color(0xFFDCFCE7)
    val Success50 = Color(0xFFF0FDF4)

    val Warning600 = Color(0xFFD97706)
    val Warning100 = Color(0xFFFEF3C7)
    val Warning50 = Color(0xFFFFFBEB)

    val Danger700 = Color(0xFFC92A20)
    val Danger600 = Color(0xFFEE3B2B)
    val Danger100 = Color(0xFFFEE2E2)
    val Danger50 = Color(0xFFFEF2F2)

    val LoginBackground = Color(0xFF1A1A1A)
    val LoginField = Color(0xFF2E2E2E)
    val LoginBorder = Color(0xFF424242)
    val LoginMuted = Color(0xFFA3A3A3)
    val LoginSecondary = Color(0xFF737373)
}

object AISpacing {
    val Xxs = 4.dp
    val Xs = 8.dp
    val Sm = 12.dp
    val Md = 16.dp
    val Lg = 24.dp
    val Xl = 32.dp
    val Xxl = 44.dp
}

object AIRadius {
    val Sm = 8.dp
    val Md = 12.dp
    val Lg = 16.dp
    val Xl = 20.dp
}

val AITypography = Typography(
    displaySmall = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Bold,
        fontSize = 34.sp,
        lineHeight = 41.sp
    ),
    headlineLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Bold,
        fontSize = 28.sp,
        lineHeight = 34.sp
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.SemiBold,
        fontSize = 22.sp,
        lineHeight = 28.sp
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,
        lineHeight = 26.sp
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.SemiBold,
        fontSize = 17.sp,
        lineHeight = 22.sp
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 15.sp,
        lineHeight = 22.sp
    ),
    bodySmall = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 13.sp,
        lineHeight = 18.sp
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 16.sp
    )
)

private val LightScheme: ColorScheme = lightColorScheme(
    primary = AIColor.Primary600,
    onPrimary = AIColor.White,
    primaryContainer = AIColor.Primary50,
    onPrimaryContainer = AIColor.Primary600,
    secondary = AIColor.AI600,
    onSecondary = AIColor.White,
    secondaryContainer = AIColor.AI50,
    onSecondaryContainer = AIColor.AI600,
    error = AIColor.Danger600,
    errorContainer = AIColor.Danger50,
    background = AIColor.Gray1,
    onBackground = AIColor.Black,
    surface = AIColor.White,
    onSurface = AIColor.Black,
    surfaceVariant = AIColor.Gray1,
    onSurfaceVariant = AIColor.Gray5,
    outline = AIColor.Gray2
)

private val DarkScheme: ColorScheme = darkColorScheme(
    primary = AIColor.Primary500,
    onPrimary = AIColor.White,
    primaryContainer = Color(0xFF12315E),
    onPrimaryContainer = Color(0xFFD3E3FD),
    secondary = AIColor.AI500,
    onSecondary = AIColor.White,
    secondaryContainer = Color(0xFF123D39),
    onSecondaryContainer = AIColor.AI100,
    error = AIColor.Danger600,
    errorContainer = Color(0xFF4A1616),
    background = Color(0xFF121212),
    onBackground = Color(0xFFF7F7F7),
    surface = Color(0xFF1C1C1E),
    onSurface = Color(0xFFF7F7F7),
    surfaceVariant = Color(0xFF202124),
    onSurfaceVariant = Color(0xFFB8B8B8),
    outline = Color(0xFF3A3A3A)
)

@Composable
fun AIWorkCalendarTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkScheme else LightScheme,
        typography = AITypography,
        shapes = Shapes(),
        content = content
    )
}
