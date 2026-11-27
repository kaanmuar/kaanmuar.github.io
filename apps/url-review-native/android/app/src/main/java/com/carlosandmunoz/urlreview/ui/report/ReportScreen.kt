package com.carlosandmunoz.urlreview.ui.report

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.runtime.snapshots.SnapshotStateMap
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private data class ReportSection(
    val id: String,
    val title: String,
    val score: Int,
    val state: String,
    val teaser: String,
    val body: String,
)

private val DefaultReportSections = listOf(
    ReportSection(
        id = "seo",
        title = "SEO",
        score = 67,
        state = "At risk",
        teaser = "Titles and meta mostly in range; duplicate H1s on two routes.",
        body = "Canonical tags are present on the homepage but missing on /blog/archive. " +
            "Open Graph images resolve but lack explicit width and height. " +
            "Structured data validates with two non-critical warnings on product snippets.",
    ),
    ReportSection(
        id = "geo",
        title = "GEO",
        score = 61,
        state = "At risk",
        teaser = "AI-search snippets lack clear entity markup.",
        body = "FAQ and HowTo blocks are absent from key landing pages. " +
            "Author and organization entities are weakly linked. " +
            "Citation-ready summaries could be tightened for LLM crawlers.",
    ),
    ReportSection(
        id = "analytics",
        title = "Analytics",
        score = 72,
        state = "Passes",
        teaser = "Primary tag fires; consent mode needs a second look.",
        body = "GA4 loads after consent on EU traffic. " +
            "Event naming is consistent but purchase funnel has a duplicate page_view. " +
            "Server-side mirror is not configured.",
    ),
    ReportSection(
        id = "security",
        title = "Security",
        score = 47,
        state = "Fails now",
        teaser = "HSTS missing; DMARC policy could be stricter.",
        body = "Content-Security-Policy is report-only. " +
            "TLS 1.2 still advertised on a legacy subdomain. " +
            "DMARC is p=none with sparse aggregate reporting.",
    ),
    ReportSection(
        id = "a11y",
        title = "Accessibility",
        score = 58,
        state = "At risk",
        teaser = "Contrast and focus order issues on checkout.",
        body = "Three buttons fail 4.5:1 contrast on mobile. " +
            "Modal traps focus but returns focus inconsistently on close. " +
            "Landmarks omit a main region on the pricing page.",
    ),
    ReportSection(
        id = "perf",
        title = "Performance",
        score = 54,
        state = "At risk",
        teaser = "LCP borderline on mobile; images lack dimensions.",
        body = "Largest Contentful Paint sits at 2.6s on 4G throttling. " +
            "Hero WebP is oversized; lazy loading skips below-fold galleries. " +
            "Third-party chat widget blocks main thread during hydration.",
    ),
)

private val FrostOverlay = Color(0xCC0E151C)
private val SectionCardBg = Color(0xE60A161B)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportScreen(
    targetUrl: String,
    overallScore: Int = 58,
    grade: String = "D",
    onNewReview: () -> Unit,
) {
    val sections = DefaultReportSections
    val expanded = remember {
        mutableStateMapOf<String, Boolean>().apply {
            sections.forEach { put(it.id, false) }
        }
    }
    var showUnlockSheet by remember { mutableStateOf(false) }
    val scroll = rememberScrollState()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    fun openUnlock(reason: String) {
        showUnlockSheet = true
    }

    if (showUnlockSheet) {
        ModalBottomSheet(
            onDismissRequest = { showUnlockSheet = false },
            sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.surface,
        ) {
            UnlockSheetBody(
                onDismiss = { showUnlockSheet = false },
            )
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            StickyUnlockBar(
                onGatedAction = { openUnlock(it) },
                onUnlock = { openUnlock("sticky") },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(scroll)
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                text = "Report",
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onBackground,
            )
            if (targetUrl.isNotBlank()) {
                Text(
                    text = targetUrl,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            ReportScoreHero(overall = overallScore, grade = grade)

            FoldAllRow(
                onExpandAll = { setAllExpanded(expanded, sections, true) },
                onCollapseAll = { setAllExpanded(expanded, sections, false) },
            )

            sections.forEach { section ->
                CollapsibleSectionRow(
                    section = section,
                    expanded = expanded[section.id] == true,
                    onToggle = {
                        expanded[section.id] = !(expanded[section.id] == true)
                    },
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            OutlinedButton(
                onClick = onNewReview,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text("New review")
            }

            Spacer(modifier = Modifier.height(96.dp))
        }
    }
}

private fun setAllExpanded(
    map: SnapshotStateMap<String, Boolean>,
    sections: List<ReportSection>,
    value: Boolean,
) {
    sections.forEach { map[it.id] = value }
}

@Composable
private fun FoldAllRow(
    onExpandAll: () -> Unit,
    onCollapseAll: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.End,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TextButton(onClick = onExpandAll) {
            Text("Expand all")
        }
        TextButton(onClick = onCollapseAll) {
            Text("Collapse all")
        }
    }
}

@Composable
private fun ReportScoreHero(overall: Int, grade: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(88.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.background),
            ) {
                Text(
                    text = overall.toString(),
                    style = MaterialTheme.typography.headlineLarge,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold,
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Overall score",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = "Grade $grade",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = "Soft preview · scores and teasers only until unlock.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun CollapsibleSectionRow(
    section: ReportSection,
    expanded: Boolean,
    onToggle: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = SectionCardBg),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onToggle)
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    text = section.score.toString(),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .padding(horizontal = 4.dp)
                        .semantics { contentDescription = "${section.title} score ${section.score}" },
                )
                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(
                            text = section.title,
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Text(
                            text = section.state,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.secondary,
                        )
                    }
                    Text(
                        text = if (expanded) "Tap to collapse" else section.teaser,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = if (expanded) 1 else 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                androidx.compose.material3.Icon(
                    imageVector = if (expanded) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
                    contentDescription = if (expanded) "Collapse" else "Expand",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            AnimatedVisibility(
                visible = expanded,
                enter = expandVertically(),
                exit = shrinkVertically(),
            ) {
                Column {
                    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                    FrostedSectionBody(text = section.body)
                }
            }
        }
    }
}

@Composable
private fun FrostedSectionBody(text: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(14.dp),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium.copy(lineHeight = 22.sp),
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier
                .fillMaxWidth()
                .blur(6.dp),
        )
        Box(
            modifier = Modifier
                .matchParentSize()
                .background(FrostOverlay),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "Unlock $5 fix list to read findings",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

@Composable
private fun StickyUnlockBar(
    onGatedAction: (String) -> Unit,
    onUnlock: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .navigationBarsPadding(),
    ) {
        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            listOf("Print" to "print", "Share" to "share", "Export" to "json").forEach { (label, kind) ->
                TextButton(
                    onClick = { onGatedAction(kind) },
                    enabled = true,
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    ),
                ) {
                    Text(label, style = MaterialTheme.typography.labelLarge)
                }
            }
        }
        Button(
            onClick = onUnlock,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            shape = RoundedCornerShape(12.dp),
            contentPadding = PaddingValues(vertical = 14.dp),
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "Unlock fix list — \$5 USD",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = "One-time · full findings, PDF, share, print",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.85f),
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
            .padding(horizontal = 24.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = "Unlock fix list",
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = "\$5 USD once on this report. Every finding, top ten fixes, and a PDF. " +
                "Cases stay blurred until full report unlock.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Button(
            onClick = onDismiss,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
        ) {
            Text("Continue")
        }
        Spacer(modifier = Modifier.height(24.dp))
    }
}