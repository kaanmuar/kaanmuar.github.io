package com.carlosandmunoz.urlreview.ui.report

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** StatusCard glass report + gold Unlock — web spearhead / #4503 parity (#4513). */
private val Bg = Color(0xFF0E151C)
private val Surface = Color(0xB80A161B)
private val Cyan = Color(0xFF7EF6FB)
private val Mint = Color(0xFF5DFF9A)
private val Gold = Color(0xFFF0C85A)
private val Coral = Color(0xFFFF5A4A)
private val Text = Color(0xFFE8F3F4)
private val Muted = Color(0xFF8EA8AE)
private val Line = Color(0x477ED6E0)
private val OnGold = Color(0xFF041014)

private data class StatusBar(
    val label: String,
    val value: String,
    val pct: Float,
    val color: Color,
)

private data class StatusCard(
    val id: String,
    val title: String,
    val lockCount: Int,
    val ringA: Triple<String, Float, Color>,
    val ringB: Triple<String, Float, Color>,
    val bars: List<StatusBar>,
    val footerLines: List<String>,
)

private val DefaultCards = listOf(
    StatusCard(
        id = "trust",
        title = "Trust & headers",
        lockCount = 5,
        ringA = Triple("42", 0.42f, Coral),
        ringB = Triple("70", 0.70f, Gold),
        bars = listOf(
            StatusBar("Fails", "5", 0.80f, Coral),
            StatusBar("Risks", "2", 0.40f, Gold),
            StatusBar("Pass", "6", 0.55f, Mint),
        ),
        footerLines = listOf(
            "HSTS missing on apex — browsers skip preload.",
            "CSP is report-only; XSS still lands.",
            "3 cookies lack Secure + SameSite=None.",
        ),
    ),
    StatusCard(
        id = "vitals",
        title = "Core vitals & bloat",
        lockCount = 4,
        ringA = Triple("58", 0.58f, Coral),
        ringB = Triple("45", 0.45f, Gold),
        bars = listOf(
            StatusBar("LCP", "4.8s", 0.25f, Coral),
            StatusBar("Weight", "2.1MB", 0.62f, Gold),
            StatusBar("CLS", "0.18", 0.40f, Gold),
        ),
        footerLines = listOf(
            "LCP 4.8s — unsized hero <img>.",
            "2 render-blocking CSS in <head>.",
            "CLS 0.18 on promo carousel.",
        ),
    ),
    StatusCard(
        id = "find",
        title = "Findability",
        lockCount = 3,
        ringA = Triple("61", 0.61f, Gold),
        ringB = Triple("80", 0.80f, Mint),
        bars = listOf(
            StatusBar("SEO", "61", 0.61f, Gold),
            StatusBar("Schema", "ok", 0.80f, Mint),
            StatusBar("Social", "gap", 0.35f, Coral),
        ),
        footerLines = listOf(
            "Canonical self-ref ok.",
            "Missing OG image on PDP.",
            "2 thin title tags under 20 chars.",
        ),
    ),
    StatusCard(
        id = "cases",
        title = "Cases to run",
        lockCount = 12,
        ringA = Triple("12", 1f, Mint),
        ringB = Triple("P0", 0.33f, Coral),
        bars = listOf(
            StatusBar("P0", "3", 0.90f, Coral),
            StatusBar("P1", "5", 0.60f, Gold),
            StatusBar("P2", "4", 0.40f, Cyan),
        ),
        footerLines = listOf(
            "P0: checkout · pay · confirm.",
            "P1: mobile nav + search.",
            "P2: a11y name missing on primary CTA.",
        ),
    ),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportScreen(
    targetUrl: String,
    onNewReview: () -> Unit,
) {
    val cards = DefaultCards
    val expanded = remember {
        mutableStateMapOf<String, Boolean>().apply {
            cards.forEach { put(it.id, false) }
        }
    }
    var showUnlockSheet by remember { mutableStateOf(false) }
    val scroll = rememberScrollState()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val host = hostFrom(targetUrl)

    Scaffold(
        containerColor = Bg,
        bottomBar = {
            StickyUnlockBar(
                onUnlock = { showUnlockSheet = true },
                onSecondary = { showUnlockSheet = true },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(scroll)
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            ReportHeader(
                host = host,
                allExpanded = expanded.values.all { it },
                onToggleAll = {
                    val open = !expanded.values.all { it }
                    cards.forEach { expanded[it.id] = open }
                },
                onDone = onNewReview,
            )
            PrimeSuspectCard()
            cards.forEach { card ->
                StatusCardRow(
                    card = card,
                    expanded = expanded[card.id] == true,
                    onToggle = { expanded[card.id] = !(expanded[card.id] ?: false) },
                )
            }
            Spacer(modifier = Modifier.height(24.dp))
        }
    }

    if (showUnlockSheet) {
        ModalBottomSheet(
            onDismissRequest = { showUnlockSheet = false },
            sheetState = sheetState,
            containerColor = Bg,
        ) {
            UnlockSheetBody(onDismiss = { showUnlockSheet = false })
        }
    }
}

private fun hostFrom(raw: String): String {
    val trimmed = raw.trim()
    val bare = trimmed.removePrefix("https://").removePrefix("http://")
    return bare.substringBefore('/').ifEmpty { "example.com" }
}

@Composable
private fun ReportHeader(
    host: String,
    allExpanded: Boolean,
    onToggleAll: () -> Unit,
    onDone: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = host,
                color = Text,
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = FontFamily.Serif,
            )
            Text(
                text = "Soft preview · StatusCard rows",
                color = Muted,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
        TextButton(onClick = onToggleAll) {
            Text(
                text = if (allExpanded) "Collapse all" else "Expand all",
                color = Text,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
        TextButton(onClick = onDone) {
            Text("Done", color = Cyan, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun PrimeSuspectCard() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Coral.copy(alpha = 0.08f), RoundedCornerShape(14.dp))
            .border(1.dp, Coral.copy(alpha = 0.35f), RoundedCornerShape(14.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            text = "PRIME SUSPECT · CLEAR",
            color = Coral,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.4.sp,
        )
        Text(
            text = "LCP waits 4.8s on the hero image",
            color = Text,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            text = "Same frosted-report rule: top finding stays readable so scores are not invented.",
            color = Muted,
            fontSize = 12.sp,
            maxLines = 2,
        )
    }
}

@Composable
private fun StatusCardRow(
    card: StatusCard,
    expanded: Boolean,
    onToggle: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Surface, RoundedCornerShape(14.dp))
            .border(1.dp, Line, RoundedCornerShape(14.dp))
            .clickable(onClick = onToggle)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = "${card.title} · 🔒 ${card.lockCount}",
            color = Text,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ScoreRing(card.ringA.first, card.ringA.second, card.ringA.third, if (expanded) 56.dp else 44.dp)
                ScoreRing(card.ringB.first, card.ringB.second, card.ringB.third, if (expanded) 56.dp else 44.dp)
            }
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                val shown = if (expanded) card.bars else card.bars.take(2)
                shown.forEach { MetricBar(it, if (expanded) 6.dp else 3.dp) }
            }
        }
        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically(),
            exit = shrinkVertically(),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                card.footerLines.forEach { line ->
                    Text(
                        text = "· $line",
                        color = Muted,
                        fontSize = 12.sp,
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Bg.copy(alpha = 0.2f)),
                    )
                }
            }
        }
    }
}

@Composable
private fun ScoreRing(label: String, pct: Float, color: Color, size: Dp) {
    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(size)) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val stroke = size.toPx() * 0.1f
            drawArc(
                color = Color.White.copy(alpha = 0.12f),
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                style = Stroke(width = stroke, cap = StrokeCap.Round),
                size = Size(this.size.minDimension, this.size.minDimension),
                topLeft = Offset.Zero,
            )
            drawArc(
                color = color,
                startAngle = -90f,
                sweepAngle = 360f * pct,
                useCenter = false,
                style = Stroke(width = stroke, cap = StrokeCap.Round),
                size = Size(this.size.minDimension, this.size.minDimension),
                topLeft = Offset.Zero,
            )
        }
        Text(
            text = label,
            color = Text,
            fontSize = if (size > 50.dp) 13.sp else 11.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun MetricBar(bar: StatusBar, thickness: Dp) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(modifier = Modifier.fillMaxWidth()) {
            Text(bar.label, color = Text, fontSize = 11.sp)
            Spacer(modifier = Modifier.weight(1f))
            Text(bar.value, color = Muted, fontSize = 11.sp)
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(thickness)
                .background(Color.White.copy(alpha = 0.08f), CircleShape),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(bar.pct.coerceIn(0.04f, 1f))
                    .height(thickness)
                    .background(bar.color, CircleShape),
            )
        }
    }
}

@Composable
private fun StickyUnlockBar(
    onUnlock: () -> Unit,
    onSecondary: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Bg.copy(alpha = 0.92f))
            .border(width = 1.dp, color = Line)
            .navigationBarsPadding()
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("Print", "Share", "Export").forEach { label ->
                OutlinedButton(
                    onClick = onSecondary,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(9.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Muted),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Line),
                ) {
                    Text(label, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        Button(
            onClick = onUnlock,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp)
                .background(
                    brush = Brush.linearGradient(listOf(Gold, Color(0xFFF2C94C))),
                    shape = RoundedCornerShape(12.dp),
                ),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = Color.Transparent,
                contentColor = OnGold,
            ),
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Unlock full lab report — $5", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Text(
                    "One-time · full findings, PDF, share, print",
                    fontSize = 10.sp,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
    }
}

@Composable
private fun UnlockSheetBody(onDismiss: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(20.dp)
            .padding(bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(
            text = "Unseal all lab notes",
            color = Text,
            fontSize = 24.sp,
            fontFamily = FontFamily.Serif,
        )
        Text(
            text = "Pay once for this report. Full findings, PDF, share, print — StoreKit / Play Billing lands with #40.",
            color = Muted,
            fontSize = 13.sp,
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Gold.copy(alpha = 0.08f), RoundedCornerShape(12.dp))
                .border(1.dp, Gold.copy(alpha = 0.35f), RoundedCornerShape(12.dp))
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("This report unlock", color = Muted)
            Text(
                text = "$5",
                color = Gold,
                fontSize = 32.sp,
                fontFamily = FontFamily.Serif,
            )
        }
        Text(
            text = "EMAIL THE UNLOCKED LINK",
            color = Muted,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.2.sp,
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Surface, RoundedCornerShape(10.dp))
                .border(1.dp, Line, RoundedCornerShape(10.dp))
                .padding(12.dp),
        ) {
            Text("you@company.com", color = Muted)
        }
        Button(
            onClick = onDismiss,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp)
                .background(
                    brush = Brush.horizontalGradient(listOf(Cyan, Mint)),
                    shape = RoundedCornerShape(12.dp),
                ),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = Color.Transparent,
                contentColor = OnGold,
            ),
        ) {
            Text("Pay $5 · Apple Pay", fontWeight = FontWeight.Bold, fontSize = 15.sp)
        }
        TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
            Text("Maybe later · keep soft preview", color = Muted, fontWeight = FontWeight.SemiBold)
        }
    }
}
