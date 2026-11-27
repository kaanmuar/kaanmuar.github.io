package com.carlosandmunoz.urlreview.ui.entry

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.urlreview.data.ReviewApi
import kotlinx.coroutines.launch

/** Soft-gate entry — parity with web spearhead / #4503 mocks (#4511). */
private val SoftBg = Color(0xFF050D11)
private val SoftSurface = Color(0xFF071116)
private val SoftCyan = Color(0xFF7EF6FB)
private val SoftMint = Color(0xFF5DFF9A)
private val SoftText = Color(0xFFE8F3F4)
private val SoftMuted = Color(0xFF8EA8AE)
private val SoftLine = Color(0x477ED6E0)
private val SoftOnMint = Color(0xFF041014)

private val FlawChips = listOf(
    "Speed Trap",
    "SEO Leaks",
    "Trust Gaps",
    "UX Friction",
)

@Composable
fun EntryScreen(onRun: (String) -> Unit) {
    var url by rememberSaveable { mutableStateOf("https://") }
    var selectedChip by rememberSaveable { mutableStateOf<String?>("Speed Trap") }
    var isRunning by rememberSaveable { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(SoftBg),
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                BrandRow()
                Text(
                    text = "Drop a URL on the specimen tray",
                    color = SoftMuted,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }

            Spacer(modifier = Modifier.weight(1f))

            Surface(
                color = SoftSurface.copy(alpha = 0.96f),
                tonalElevation = 0.dp,
                shadowElevation = 0.dp,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(width = 1.dp, color = SoftLine, shape = RoundedCornerShape(0.dp))
                        .padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(
                        text = "SPECIMEN URL",
                        color = SoftMuted,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.2.sp,
                    )
                    OutlinedTextField(
                        value = url,
                        onValueChange = { url = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("https://example.com", color = SoftMuted) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Uri,
                            imeAction = ImeAction.Go,
                        ),
                        shape = RoundedCornerShape(12.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = SoftText,
                            unfocusedTextColor = SoftText,
                            focusedBorderColor = SoftCyan,
                            unfocusedBorderColor = SoftLine,
                            cursorColor = SoftCyan,
                            focusedContainerColor = SoftBg,
                            unfocusedContainerColor = SoftBg,
                        ),
                    )
                    Text(
                        text = "Call the flaw before we run it",
                        color = SoftMuted,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        FlawChips.forEach { chip ->
                            val on = selectedChip == chip
                            TextButton(
                                onClick = {
                                    selectedChip = if (on) null else chip
                                },
                                colors = ButtonDefaults.textButtonColors(
                                    containerColor = if (on) SoftMint else SoftBg,
                                    contentColor = if (on) SoftOnMint else SoftText,
                                ),
                                shape = RoundedCornerShape(50),
                                modifier = Modifier
                                    .border(
                                        width = 1.dp,
                                        color = if (on) SoftMint else SoftLine,
                                        shape = RoundedCornerShape(50),
                                    ),
                            ) {
                                Text(
                                    text = chip,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 13.sp,
                                )
                            }
                        }
                    }
                    Button(
                        onClick = {
                            val trimmed = url.trim()
                            if (trimmed.isEmpty() || isRunning) return@Button
                            scope.launch {
                                isRunning = true
                                val proceed = try {
                                    ReviewApi.previewUrl(trimmed)
                                    true
                                } catch (_: Exception) {
                                    ReviewApi.USE_MOCK
                                }
                                isRunning = false
                                if (proceed) onRun(trimmed)
                            }
                        },
                        enabled = !isRunning && url.trim().isNotEmpty(),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp)
                            .background(
                                brush = Brush.horizontalGradient(listOf(SoftCyan, SoftMint)),
                                shape = RoundedCornerShape(14.dp),
                            ),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color.Transparent,
                            contentColor = SoftOnMint,
                            disabledContainerColor = Color.Transparent,
                            disabledContentColor = SoftOnMint.copy(alpha = 0.45f),
                        ),
                    ) {
                        Text(
                            text = if (isRunning) "Running…" else "Run diagnostics",
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp,
                        )
                    }
                    Text(
                        text = "Soft preview · 1 page · same gate as web spearhead",
                        color = SoftMuted,
                        fontSize = 12.sp,
                    )
                }
            }
        }
    }
}

@Composable
private fun BrandRow() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column {
            Text(
                text = "QA-lab",
                color = SoftText,
                fontSize = 22.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = FontFamily.Serif,
            )
            Text(
                text = "URL REVIEW",
                color = SoftCyan,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.6.sp,
            )
        }
        Text(
            text = "Bench ready",
            color = SoftMint,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier
                .background(SoftMint.copy(alpha = 0.16f), RoundedCornerShape(50))
                .border(1.dp, SoftMint.copy(alpha = 0.45f), RoundedCornerShape(50))
                .padding(horizontal = 10.dp, vertical = 6.dp),
        )
    }
}
