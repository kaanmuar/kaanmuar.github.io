package com.carlosandmunoz.jarvis

import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.lifecycle.lifecycleScope
import com.carlosandmunoz.jarvis.home.Home
import com.carlosandmunoz.jarvis.home.PickWidget
import com.carlosandmunoz.jarvis.ui.GlassChip
import com.carlosandmunoz.jarvis.ui.J
import com.carlosandmunoz.jarvis.ui.JarvisTheme
import com.carlosandmunoz.jarvis.ui.Mono
import com.carlosandmunoz.jarvis.ui.glass
import com.carlosandmunoz.jarvis.ui.reveal
import kotlinx.coroutines.launch

/** Pick a number (#1666): chooses what one widget shows, when it is placed from the launcher, pinned from Settings or reconfigured. */
class PickConfigActivity : ComponentActivity() {
    @OptIn(ExperimentalLayoutApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) return finish()
        setResult(RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
        val vault = (application as JarvisApp).vault
        val current = vault.get("pick.$id") ?: "revenue"
        setContent {
            JarvisTheme {
                Box(Modifier.fillMaxSize().clickable(remember { MutableInteractionSource() }, null) { finish() }, contentAlignment = Alignment.BottomCenter) {
                    Column(
                        Modifier.fillMaxWidth().navigationBarsPadding().padding(12.dp).reveal()
                            .background(J.bg.copy(alpha = 0.94f), RoundedCornerShape(18.dp)).glass(radius = 18.dp).clickable(remember { MutableInteractionSource() }, null) { }.padding(18.dp)
                    ) {
                        Text("PICK A NUMBER", color = J.cyan, fontFamily = Mono, fontSize = 11.sp, letterSpacing = 2.sp)
                        Spacer(Modifier.height(10.dp))
                        Text("What should this widget show?", color = J.text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(12.dp))
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Home.PICKS.forEach { (key, label) -> GlassChip(label, key == current) { choose(id, key) } }
                        }
                        Spacer(Modifier.height(10.dp))
                        Text("Change it later by long-pressing the widget.", color = J.dim, fontSize = 12.sp)
                    }
                }
            }
        }
    }

    private fun choose(id: Int, key: String) {
        (application as JarvisApp).vault.put("pick.$id", key)
        lifecycleScope.launch {
            runCatching { PickWidget().update(this@PickConfigActivity, GlanceAppWidgetManager(this@PickConfigActivity).getGlanceIdBy(id)) }
            setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
            finish()
        }
    }
}
